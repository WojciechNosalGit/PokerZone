import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createGame, stakes, buyInFor, minPlayers, maxPlayers, shuffleForOnline } from './engine.mjs';

const tableExpiry = 30 * 60 * 1000;
const roomPattern = /^[A-F0-9]{10}$/;
const supportedBlinds = new Set(stakes.map(stake => stake.bigBlind));

const relativeSeat = (id, viewer, count) => id < 0 ? id : (id - viewer + count) % count;

function viewForSeat(state, seat) {
  if (!state) return null;
  const { sessionId, handNo, phase, street, dealing, runoutFrom, currentBet, lastRaise, smallBlind, bigBlind,
    board, potChips, summary } = state;
  const seatId = id => relativeSeat(id, seat, state.players.length);
  const players = [...state.players.slice(seat), ...state.players.slice(0, seat)].map(player => {
    const { name, avatar, stack, bet, betChips, contributed, folded, allIn, canRaise, position, lastAction } = player;
    const canSee = player.id === seat || (!folded && (runoutFrom || street === 'showdown'));
    return {
      id: seatId(player.id), kind: 'human', name, avatar, stack, bet, betChips, contributed, folded, allIn,
      canRaise, position, lastAction, hand: canSee ? player.hand : player.hand.map(() => null)
    };
  });
  const logs = state.logs.map(({ kind, text, action, playerId, playerName }) => ({
    kind, text, action, playerName, playerId: playerId === undefined ? undefined : seatId(playerId)
  }));
  return { sessionId, handNo, phase, street, dealing, runoutFrom, currentBet, lastRaise, smallBlind, bigBlind,
    board, potChips, summary, players, logs, actor: seatId(state.actor), dealer: seatId(state.dealer), foldPending: false };
}

export function attachRooms(server, { origins = [] } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const rooms = new Map();
  const bindings = new WeakMap();
  const connected = player => player?.socket?.readyState === WebSocket.OPEN;
  const allPresent = room => room.seats.every(connected);
  const findRoom = code => typeof code === 'string' && roomPattern.test(code) ? rooms.get(code) : undefined;

  function send(socket, message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) { socket.terminate(); return; }
    socket.send(JSON.stringify(message));
  }

  function error(socket, message, code) {
    send(socket, { type: 'error', message, code });
  }

  function broadcast(room, { restored = false, payouts = [], skippedRunout = false, sound } = {}) {
    room.revision++;
    const state = room.game?.getState();
    const playerCount = room.seats.length;
    const present = room.seats.filter(connected).length;
    room.seats.forEach((player, seat) => {
      send(player?.socket, {
        type: 'state', revision: room.revision,
        playerCount, present, connected: present === playerCount,
        state: viewForSeat(state, seat), restored, skippedRunout, sound,
        payouts: payouts.map(([id, amount]) => [relativeSeat(id, seat, playerCount), amount])
      });
    });
  }

  function startMatch(room) {
    room.game?.resetGame();
    let sound;
    room.game = createGame((state, options) => {
      if (state) broadcast(room, { ...options, sound });
      sound = undefined;
    }, undefined, action => { sound = action; }, {
      startingBankroll: buyInFor(room.bigBlind),
      humanOnly: true,
      deck: shuffleForOnline,
      preparePlayers(players) {
        for (const player of players) {
          player.kind = 'human';
          player.name = room.seats[player.id].name;
          player.avatar = player.id === 0 ? 'neon-5' : 'rick-8';
        }
      }
    });
    room.game.newGame({ playerCount: room.seats.length, bigBlind: room.bigBlind });
  }

  function attachSeat(room, seat, socket) {
    const player = room.seats[seat];
    const previous = player.socket;
    player.socket = socket;
    bindings.set(socket, { room, seat });
    previous?.close(4001, 'Seat moved');
    send(socket, { type: 'seat', room: room.code, seat, token: player.token });
    if (!allPresent(room)) {
      broadcast(room, { restored: true });
      return;
    }
    room.incompleteSince = 0;
    if (!room.game) { startMatch(room); return; }
    const revision = room.revision;
    room.game.resume();
    if (room.revision === revision) broadcast(room, { restored: true });
  }

  function closeRoom(room, reason) {
    rooms.delete(room.code);
    room.game?.resetGame();
    for (const player of room.seats) {
      if (!player?.socket) continue;
      bindings.delete(player.socket);
      send(player.socket, { type: 'closed', message: reason });
      player.socket.close(1000, 'Room closed');
    }
  }

  function newPlayer(name) {
    return { name, token: randomBytes(24).toString('base64url'), socket: null };
  }

  function seatRequest(socket, message) {
    if (message.type === 'create' || message.type === 'join') {
      const name = typeof message.name === 'string' ? message.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > 24) { error(socket, 'Podaj nick od 1 do 24 znaków.'); return; }
      if (message.type === 'create') {
        if (!supportedBlinds.has(message.bigBlind)) { error(socket, 'Wybierz dostępną stawkę.'); return; }
        const playerCount = message.playerCount === undefined ? minPlayers : message.playerCount;
        if (!Number.isInteger(playerCount) || playerCount < minPlayers || playerCount > maxPlayers) {
          error(socket, 'Wybierz od 2 do 8 graczy.');
          return;
        }
        if (rooms.size >= 500) { error(socket, 'Wszystkie stoły są zajęte. Spróbuj ponownie za chwilę.'); return; }
        let code;
        do code = randomBytes(5).toString('hex').toUpperCase(); while (rooms.has(code));
        const seats = Array(playerCount).fill(null);
        seats[0] = newPlayer(name);
        const room = { code, bigBlind: message.bigBlind, seats, revision: 0, game: null,
          incompleteSince: Date.now() };
        rooms.set(code, room);
        attachSeat(room, 0, socket);
      } else {
        const room = findRoom(message.room);
        const seat = room?.seats.indexOf(null) ?? -1;
        if (seat < 0) {
          error(socket, room ? 'Ten stół jest już pełny.' : 'Nie ma takiego stołu. Sprawdź kod zaproszenia.');
          return;
        }
        room.seats[seat] = newPlayer(name);
        attachSeat(room, seat, socket);
      }
      return;
    }
    if (message.type === 'resume') {
      const room = findRoom(message.room);
      const seat = room && typeof message.token === 'string' && room.seats.findIndex(player => player?.token === message.token);
      if (typeof seat !== 'number' || seat < 0) { error(socket, 'To miejsce przy stole nie jest już dostępne.', 'resume'); return; }
      attachSeat(room, seat, socket);
      return;
    }
    error(socket, 'Najpierw utwórz stół lub dołącz do gry.');
  }

  function handle(socket, message) {
    const binding = bindings.get(socket);
    if (!binding) { seatRequest(socket, message); return; }
    const { room, seat } = binding;
    if (room.seats[seat].socket !== socket) return;
    if (message.type === 'leave') { closeRoom(room, 'Gracz opuścił stół online.'); return; }

    const game = room.game;
    const state = game?.getState();
    if (!state || !allPresent(room)) { error(socket, 'Stół czeka na połączenie wszystkich graczy.'); return; }
    if (message.revision !== room.revision) { error(socket, 'Sytuacja przy stole już się zmieniła.'); return; }
    if (message.type === 'next' && state.phase === 'finished') { game.startHand(); return; }
    if (message.type === 'next' && state.phase === 'gameover' && seat === 0) { startMatch(room); return; }
    if (message.type === 'skip' && state.runoutFrom) { game.skipRunout(); return; }
    if (message.type === 'action') {
      const action = message.action;
      if (action === 'fold' || action === 'call' || (action === 'raise' && Number.isSafeInteger(message.target))) {
        if (game.act(seat, { type: action, target: message.target })) return;
      }
    }
    error(socket, 'Ten ruch jest teraz niedostępny.');
  }

  function upgrade(request, socket, head) {
    if (request.url !== '/ws' || (origins.length && !origins.includes(request.headers.origin))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client));
  }

  server.on('upgrade', upgrade);
  wss.on('connection', socket => {
    let windowStarted = Date.now();
    let messages = 0;
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      const binding = bindings.get(socket);
      if (!binding || !rooms.has(binding.room.code)) return;
      const { room, seat } = binding;
      if (room.seats[seat].socket !== socket) return;
      room.seats[seat].socket = null;
      room.incompleteSince = Date.now();
      room.game?.pause();
      broadcast(room, { restored: true });
    });
    socket.on('message', (raw, binary) => {
      if (Date.now() - windowStarted >= 1000) { windowStarted = Date.now(); messages = 0; }
      if (++messages > 20 || binary) { socket.close(1008, 'Invalid traffic'); return; }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { error(socket, 'Nieprawidłowa wiadomość.'); return; }
      if (!message || typeof message.type !== 'string') { error(socket, 'Nieprawidłowa wiadomość.'); return; }
      handle(socket, message);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) { socket.alive = false; socket.ping(); }
    }
    for (const room of rooms.values()) {
      if (room.incompleteSince && Date.now() - room.incompleteSince > tableExpiry) {
        closeRoom(room, 'Wygasło zaproszenie do stołu.');
      }
    }
  }, 15_000);
  heartbeat.unref();

  return function close() {
    clearInterval(heartbeat);
    server.off('upgrade', upgrade);
    for (const room of rooms.values()) closeRoom(room, 'Serwer został zatrzymany.');
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  };
}
