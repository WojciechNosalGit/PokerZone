import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createGame, stakes, buyInFor, minPlayers, maxPlayers, shuffleForOnline, isAvatarPreset } from './engine.mjs';

const tableExpiry = 30 * 60 * 1000;
const roomPattern = /^[A-F0-9]{10}$/;
const supportedBlinds = new Set(stakes.map(stake => stake.bigBlind));
const historyLimit = 50;

const relativeSeat = (id, viewer, count) => id < 0 ? id : (id - viewer + count) % count;
const normalizeName = name => typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
const normalizeAvatar = avatar => isAvatarPreset(avatar) ? avatar : '';

function historyForSeat(state, record, winnings, seat, actions) {
  const player = state.players[seat];
  const seatId = id => relativeSeat(id, seat, state.players.length);
  const payout = winnings.get(seat) ?? 0;
  return {
    id: record.id, sessionId: record.sessionId, handNumber: record.handNumber, finishedAt: record.finishedAt,
    ending: record.ending, board: record.board, smallBlind: record.smallBlind, bigBlind: record.bigBlind,
    dealerSeat: seatId(record.dealerSeat), smallBlindSeat: seatId(record.smallBlindSeat), bigBlindSeat: seatId(record.bigBlindSeat),
    pot: record.pot,
    hero: {
      cards: player.hand, startingStack: player.stack + player.contributed - payout, endingStack: player.stack,
      contributed: player.contributed, payout, folded: player.folded, actions: actions.get(seat) ?? []
    },
    opponents: state.players.filter(other => other.id !== seat && other.hand.length === 2).map(other => {
      const revealed = record.ending === 'showdown' && !other.folded;
      return { seat: seatId(other.id), name: other.name, revealed, cards: revealed ? other.hand : null };
    })
  };
}

function viewForSeat(state, seat, room) {
  if (!state) return null;
  const { sessionId, handNo, phase, street, dealing, runoutFrom, currentBet, lastRaise, smallBlind, bigBlind,
    board, potChips, summary, payouts } = state;
  const seatId = id => seat === null ? id : relativeSeat(id, seat, state.players.length);
  const ordered = seat === null ? state.players : [...state.players.slice(seat), ...state.players.slice(0, seat)];
  const players = ordered.map(player => {
    const { stack, bet, betChips, contributed, folded, allIn, canRaise, position, lastAction } = player;
    const waiting = Boolean(room.seats[player.id]?.waiting);
    const canSee = player.id === seat || (!folded && (runoutFrom || street === 'showdown'));
    return {
      id: seatId(player.id), kind: player.kind, name: waiting ? room.seats[player.id].name : player.name,
      avatar: waiting ? room.seats[player.id].avatar : player.avatar,
      stack, bet, betChips, contributed, folded, allIn, canRaise, position, lastAction, waiting,
      hand: canSee ? player.hand : player.hand.map(() => null)
    };
  });
  const logs = seat === null ? [] : state.logs.map(({ kind, text, action, playerId, playerName }) => ({
    kind, text, action, playerName, playerId: playerId === undefined ? undefined : seatId(playerId)
  }));
  return { sessionId, handNo, phase, street, dealing, runoutFrom, currentBet, lastRaise, smallBlind, bigBlind,
    board, potChips, summary, payouts: payouts.map(([id, amount]) => [seatId(id), amount]),
    players, logs, actor: seatId(state.actor), dealer: seatId(state.dealer), foldPending: false };
}

export function attachRooms(server, { origins = [] } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const rooms = new Map();
  const bindings = new WeakMap();
  const previews = new WeakMap();
  const connected = player => player?.socket?.readyState === WebSocket.OPEN;
  const allPresent = room => room.seats.every(player => !player || player.waiting || connected(player));
  const findRoom = code => typeof code === 'string' && roomPattern.test(code) ? rooms.get(code) : undefined;

  function send(socket, message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) { socket.terminate(); return; }
    socket.send(JSON.stringify(message));
  }

  function error(socket, message, code) {
    send(socket, { type: 'error', message, code });
  }

  function seatOffer(room) {
    const state = viewForSeat(room.game?.getState(), null, room);
    return { type: 'seats', room: room.code, bigBlind: room.bigBlind, state,
      spots: room.seats.map((player, id) => room.botSeats.has(id) ? 'bot' : player ? 'taken' : 'free'),
      occupants: state ? null : room.seats.map(player => player && { name: player.name, avatar: player.avatar }) };
  }

  function stopPreview(socket) {
    previews.get(socket)?.viewers.delete(socket);
    previews.delete(socket);
  }

  function broadcastPreview(room) {
    if (!room.viewers.size) return;
    const offer = seatOffer(room);
    for (const socket of room.viewers) send(socket, offer);
  }

  function clearClock(room) {
    clearTimeout(room.clock?.timer);
    room.clock = null;
  }

  function expireTurn(room, clock) {
    const state = room.game?.getState();
    if (room.clock !== clock || clock.deadline === null || !state || !allPresent(room)) return;
    const player = state.players[state.actor];
    if (player?.id !== clock.actor || state.handId !== clock.handId || state.street !== clock.street) return;
    clearTimeout(clock.timer);
    room.game.act(clock.actor, { type: player.bet >= state.currentBet ? 'check' : 'fold' });
  }

  function updateClock(room, state, tableConnected) {
    const actor = state?.players[state.actor];
    if (state?.phase !== 'betting' || state.dealing || actor?.kind !== 'human') {
      clearClock(room);
      return null;
    }
    let clock = room.clock;
    if (clock?.handId !== state.handId || clock.street !== state.street || clock.actor !== actor.id) {
      clearClock(room);
      clock = room.clock = { handId: state.handId, street: state.street, actor: actor.id,
        remaining: room.turnSeconds * 1000, deadline: null, timer: null };
    }
    const now = Date.now();
    if (!tableConnected && clock.deadline !== null) {
      clock.remaining = Math.max(0, clock.deadline - now);
      clearTimeout(clock.timer);
      clock.deadline = null;
    }
    if (tableConnected && clock.deadline === null) {
      clock.deadline = now + clock.remaining;
      clock.timer = setTimeout(() => expireTurn(room, clock), clock.remaining);
    }
    return clock.deadline === null ? null : Math.max(0, clock.deadline - now);
  }

  function sendSeatEvent(room, seat, payload) {
    const count = room.seats.length;
    room.seats.forEach((player, viewer) => {
      if (player?.socket?.supportsTableEvents) send(player.socket, { ...payload, seat: relativeSeat(seat, viewer, count) });
    });
  }

  function broadcast(room, { restored = false, payouts = [], skippedRunout = false, sound } = {}) {
    room.revision++;
    const state = room.game?.getState();
    const playerCount = room.seats.length;
    const present = room.seats.filter(connected).length;
    const tableConnected = Boolean(state) && allPresent(room);
    const remainingMs = updateClock(room, state, tableConnected);
    room.seats.forEach((player, seat) => {
      send(player?.socket, {
        type: 'state', revision: room.revision,
        playerCount, humanCount: room.humanCount, botCount: room.botSeats.size, present, connected: tableConnected,
        turnSeconds: room.turnSeconds, remainingMs,
        state: viewForSeat(state, seat, room), restored, skippedRunout, sound,
        payouts: payouts.map(([id, amount]) => [relativeSeat(id, seat, playerCount), amount])
      });
    });
    broadcastPreview(room);
  }

  function startMatch(room) {
    clearClock(room);
    room.game?.resetGame();
    let sound;
    let handId;
    const actions = new Map();
    const prepareHuman = (player, member) => {
      player.kind = 'human';
      player.name = member?.name ?? '';
      player.avatar = member?.avatar ?? null;
      player.stack = member ? buyInFor(room.bigBlind) : 0;
      if (member) member.waiting = false;
    };
    room.game = createGame((state, options) => {
      if (state) {
        if (handId !== state.handId) {
          actions.clear();
          handId = state.handId;
        }
        broadcast(room, { ...options, sound });
      }
      sound = undefined;
    }, (record, winnings) => {
      const state = room.game.getState();
      room.seats.forEach((member, seat) => {
        if (!member || state.players[seat].hand.length !== 2) return;
        const entry = historyForSeat(state, record, winnings, seat, actions);
        member.history.unshift(entry);
        if (member.history.length > historyLimit) member.history.pop();
        if (member.socket?.supportsTableEvents) send(member.socket, { type: 'history', entries: [entry] });
      });
    }, (action, { playerId, ...detail }) => {
      sound = action;
      if (!room.seats[playerId]) return;
      if (!actions.has(playerId)) actions.set(playerId, []);
      actions.get(playerId).push(detail);
    }, {
      startingBankroll: buyInFor(room.bigBlind),
      onlineTable: true,
      deck: shuffleForOnline,
      canStartHand(players) {
        const humans = players.filter(({ id, stack }) => connected(room.seats[id])
          && (stack > 0 || room.seats[id].waiting)).length;
        return humans > 0 && humans + room.botSeats.size >= minPlayers;
      },
      preparePlayers(players) {
        for (const player of players) {
          if (room.botSeats.has(player.id)) continue;
          const member = room.seats[player.id];
          prepareHuman(player, connected(member) ? member : null);
        }
      },
      prepareHand(players) {
        const newcomers = players.filter(({ id }) => room.seats[id]?.waiting && connected(room.seats[id]));
        for (const player of newcomers) prepareHuman(player, room.seats[player.id]);
        return newcomers;
      }
    });
    room.game.newGame({ playerCount: room.seats.length, bigBlind: room.bigBlind });
  }

  function attachSeat(room, seat, socket, version) {
    stopPreview(socket);
    const player = room.seats[seat];
    const previous = player.socket;
    player.socket = socket;
    socket.supportsTableEvents = version === 2;
    bindings.set(socket, { room, seat });
    previous?.close(4001, 'Seat moved');
    send(socket, { type: 'seat', room: room.code, seat, token: player.token });
    if (socket.supportsTableEvents && player.history.length) send(socket, { type: 'history', entries: player.history });
    if (!allPresent(room)) {
      broadcast(room, { restored: true });
      return;
    }
    if (!room.game) {
      if (room.seats.filter(connected).length + room.botSeats.size >= room.minimumToStart) {
        room.incompleteSince = 0;
        startMatch(room);
      } else broadcast(room, { restored: true });
      return;
    }
    room.incompleteSince = 0;
    const revision = room.revision;
    if (room.game.getState().phase === 'gameover') room.game.startHand();
    else room.game.resume();
    if (room.revision === revision) broadcast(room, { restored: true });
  }

  function closeRoom(room, reason) {
    rooms.delete(room.code);
    clearClock(room);
    room.game?.resetGame();
    for (const socket of room.viewers) {
      error(socket, reason);
      stopPreview(socket);
    }
    for (const player of room.seats) {
      if (!player?.socket) continue;
      bindings.delete(player.socket);
      send(player.socket, { type: 'closed', message: reason });
      player.socket.close(1000, 'Room closed');
    }
  }

  function newPlayer(name, avatar, waiting = false) {
    return { name, avatar, waiting, history: [], token: randomBytes(24).toString('base64url'), socket: null };
  }

  function seatRequest(socket, message) {
    if (message.type === 'inspect') {
      stopPreview(socket);
      const room = findRoom(message.room);
      if (!room) { error(socket, 'Nie ma takiego stołu. Sprawdź kod zaproszenia.'); return; }
      if (message.live === true) {
        previews.set(socket, room);
        room.viewers.add(socket);
      }
      send(socket, seatOffer(room));
      return;
    }
    if (message.type === 'create' || message.type === 'join') {
      const name = normalizeName(message.name);
      if (!name || name.length > 10) { error(socket, 'Podaj nick od 1 do 10 znaków.'); return; }
      const avatar = normalizeAvatar(message.avatar);
      if (message.type === 'create') {
        if (!supportedBlinds.has(message.bigBlind)) { error(socket, 'Wybierz dostępną stawkę.'); return; }
        const humanCount = message.playerCount === undefined ? minPlayers : message.playerCount;
        const botCount = message.botCount === undefined ? 0 : message.botCount;
        const turnSeconds = message.turnSeconds === undefined ? 30 : message.turnSeconds;
        if (!Number.isInteger(turnSeconds) || turnSeconds < 15 || turnSeconds > 90) {
          error(socket, 'Wybierz od 15 do 90 sekund na ruch.');
          return;
        }
        const total = humanCount + botCount;
        if (!Number.isInteger(humanCount) || humanCount < 1 || !Number.isInteger(botCount) || botCount < 0
          || total < minPlayers || total > maxPlayers) {
          error(socket, 'Wybierz co najmniej jednego gracza i od 2 do 8 miejsc łącznie.');
          return;
        }
        if (rooms.size >= 500) { error(socket, 'Wszystkie stoły są zajęte. Spróbuj ponownie za chwilę.'); return; }
        let code;
        do code = randomBytes(5).toString('hex').toUpperCase(); while (rooms.has(code));
        const seats = Array(total).fill(null);
        const botSeats = new Set(Array.from({ length: botCount }, (_, index) =>
          1 + Math.floor((index + 0.5) * (total - 1) / botCount)));
        seats[0] = newPlayer(name, avatar);
        const minimumToStart = message.botCount === undefined ? total : minPlayers;
        const room = { code, bigBlind: message.bigBlind, seats, botSeats, humanCount, minimumToStart, turnSeconds,
          viewers: new Set(), revision: 0, game: null, clock: null, incompleteSince: Date.now() };
        rooms.set(code, room);
        attachSeat(room, 0, socket, message.version);
      } else {
        const room = findRoom(message.room);
        if (!room) { error(socket, 'Nie ma takiego stołu. Sprawdź kod zaproszenia.'); return; }
        const free = seat => room.seats[seat] === null && !room.botSeats.has(seat);
        const seat = message.seat === undefined ? room.seats.findIndex((_, id) => free(id)) : message.seat;
        if (!Number.isInteger(seat) || !free(seat)) {
          const open = room.seats.some((_, id) => free(id));
          error(socket, open ? 'To miejsce jest już zajęte. Wybierz inne.' : 'Ten stół jest już pełny.', 'seat');
          send(socket, seatOffer(room));
          return;
        }
        room.seats[seat] = newPlayer(name, avatar, Boolean(room.game));
        attachSeat(room, seat, socket, message.version);
      }
      return;
    }
    if (message.type === 'resume') {
      const room = findRoom(message.room);
      const seat = room && typeof message.token === 'string' && room.seats.findIndex(player => player?.token === message.token);
      if (typeof seat !== 'number' || seat < 0) { error(socket, 'To miejsce przy stole nie jest już dostępne.', 'resume'); return; }
      attachSeat(room, seat, socket, message.version);
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
    if (message.type === 'profile') {
      const member = room.seats[seat];
      const name = normalizeName(message.name);
      if (!name || name.length > 10) { error(socket, 'Podaj nick od 1 do 10 znaków.'); return; }
      const avatar = normalizeAvatar(message.avatar);
      if (member.name === name && member.avatar === avatar) {
        if (socket.supportsTableEvents) send(socket, { type: 'profile', seat: 0, name, avatar });
        return;
      }
      Object.assign(member, { name, avatar });
      if (state && !member.waiting) Object.assign(state.players[seat], { name, avatar });
      sendSeatEvent(room, seat, { type: 'profile', name, avatar });
      broadcastPreview(room);
      return;
    }
    if (message.type === 'chat') {
      const member = room.seats[seat];
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (!state || !text || text.length > 72 || Date.now() - (member.lastChatAt ?? 0) < 1000) return;
      member.lastChatAt = Date.now();
      sendSeatEvent(room, seat, { type: 'chat', text });
      return;
    }
    if (!state || !allPresent(room)) { error(socket, 'Stół czeka na połączenie graczy.'); return; }
    const clock = room.clock;
    if (clock?.deadline != null && clock.deadline <= Date.now()) expireTurn(room, clock);
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
      stopPreview(socket);
      const binding = bindings.get(socket);
      if (!binding || !rooms.has(binding.room.code)) return;
      const { room, seat } = binding;
      if (room.seats[seat].socket !== socket) return;
      room.seats[seat].socket = null;
      if (!room.game || !allPresent(room)) {
        room.incompleteSince = Date.now();
        room.game?.pause();
      }
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
