'use strict';

function createPokerOnline(dialog, { enter, update, leave }) {
  const find = selector => dialog.querySelector(selector);
  const options = find('#online-options');
  const title = find('#online-title');
  const createFields = find('#online-create-fields');
  const joinFields = find('#online-join-fields');
  const form = find('#online-form');
  const submit = find('#online-submit');
  const back = find('#online-back');
  const notice = find('#online-dialog-status');
  const invite = find('#online-invitation');
  const enterTable = find('#enter-online-table');
  const code = find('#online-code');
  const waiting = find('#online-waiting');
  const seatPicker = find('#online-seat-picker');
  const seatMap = find('#online-seat-map');
  const seatsBack = find('#online-seats-back');
  const roomField = find('#online-room');
  const name = find('#online-name');
  const playersField = find('#online-players');
  const botsField = find('#online-bots');
  const { stakes, minPlayers, maxPlayers, defaultPlayers } = pokerGame;
  const roomPattern = /^[A-F0-9]{10}$/;
  const chipValues = new Set([1, 5, 10, 25, 100, 500, 1000]);
  const configuredServer = document.querySelector('meta[name="pokerzone-online-url"]')?.content.trim() ?? '';
  const endpoint = normalizeServer(configuredServer === '/ws' ? location.origin + configuredServer : configuredServer);
  const unavailable = 'Gra online jest chwilowo niedostępna.';
  const connectionFailed = 'Nie udało się połączyć z PokerZone. Spróbuj ponownie za chwilę.';
  let selectedBlind;
  let mode;
  let keepInvitation = false;

  const stakeButtons = new Map(stakes.map(({ smallBlind, bigBlind }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stake-choice';
    button.textContent = `NL ${smallBlind}/${bigBlind}`;
    button.addEventListener('click', () => selectStakes(bigBlind));
    find('#online-stakes').append(button);
    return [bigBlind, button];
  }));
  const counters = [
    { field: playersField, less: find('#online-players-less'), more: find('#online-players-more'), output: find('#online-player-count') },
    { field: botsField, less: find('#online-bots-less'), more: find('#online-bots-more'), output: find('#online-bot-count') }
  ];

  let socket;
  let connectionTimeout;
  let retryTimer;
  let membership;
  let state;
  let revision;
  let connected = false;
  let awaiting = false;
  let queuedFold;

  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const validChips = chips => Array.isArray(chips) && chips.every(chip => chipValues.has(chip));
  const validCard = card => card && Number.isInteger(card.r) && card.r >= 2 && card.r <= 14
    && ['♥', '♠', '♦', '♣'].includes(card.s);

  const validCount = count => Number.isInteger(count) && count >= minPlayers && count <= maxPlayers;
  const validSeat = (id, count) => whole(id) && id < count;

  function validSnapshot(snapshot, count) {
    return typeof snapshot.sessionId === 'string' && ['betting', 'finished', 'gameover'].includes(snapshot.phase)
      && ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(snapshot.street)
      && typeof snapshot.dealing === 'boolean' && typeof snapshot.summary === 'string'
      && [snapshot.handNo, snapshot.currentBet, snapshot.lastRaise, snapshot.smallBlind, snapshot.bigBlind].every(whole)
      && snapshot.smallBlind > 0 && snapshot.bigBlind > 0
      && (snapshot.actor === -1 || validSeat(snapshot.actor, count)) && validSeat(snapshot.dealer, count)
      && Array.isArray(snapshot.board) && snapshot.board.length <= 5 && snapshot.board.every(validCard)
      && validChips(snapshot.potChips) && Array.isArray(snapshot.logs) && snapshot.logs.every(entry => entry && typeof entry === 'object')
      && Array.isArray(snapshot.players) && snapshot.players.length === count && snapshot.players.every((player, index) =>
        player?.id === index && typeof player.name === 'string' && [player.stack, player.contributed, player.bet].every(whole)
        && validChips(player.betChips) && Array.isArray(player.hand) && [0, 2].includes(player.hand.length)
        && player.hand.every(card => (index !== 0 && card === null) || validCard(card)));
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  function setConnecting(connecting) {
    submit.disabled = back.disabled = seatsBack.disabled = seatMap.inert = connecting;
  }

  function selectStakes(bigBlind) {
    selectedBlind = bigBlind;
    for (const [value, button] of stakeButtons) button.setAttribute('aria-pressed', String(bigBlind === value));
  }

  function updateCounts() {
    playersField.max = maxPlayers - botsField.valueAsNumber;
    botsField.max = maxPlayers - playersField.valueAsNumber;
    for (const { field, less, more, output } of counters) {
      const value = field.valueAsNumber;
      output.value = value;
      less.disabled = value === Number(field.min);
      more.disabled = value === Number(field.max);
    }
  }

  function showStep(step) {
    mode = step;
    title.textContent = step === 'create' ? 'Utwórz stół' : step === 'join' ? 'Dołącz do stołu' : 'Graj online';
    options.hidden = Boolean(step);
    form.hidden = !step;
    invite.hidden = true;
    seatPicker.hidden = true;
    createFields.hidden = step !== 'create';
    joinFields.hidden = step !== 'join';
    submit.textContent = step === 'create' ? 'Utwórz stół' : 'Wybierz miejsce';
    showNotice(endpoint ? '' : unavailable);
  }

  function showSeats({ room, bigBlind, spots }) {
    clearTimeout(connectionTimeout);
    setConnecting(false);
    form.hidden = true;
    seatPicker.hidden = false;
    title.textContent = 'Wybierz miejsce';
    const tableStakes = document.createElement('span');
    tableStakes.className = 'table-stakes';
    tableStakes.textContent = `NL ${bigBlind / 2}/${bigBlind}`;
    const positions = pokerView.seatPositions[spots.length];
    const seats = spots.map((spot, id) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `zone-art-button${spot === 'free' ? ' zone-gold-button' : ''}`;
      button.dataset.position = positions[id];
      button.dataset.onlineSeat = id;
      button.disabled = spot !== 'free';
      button.textContent = { free: 'Usiądź', taken: 'Zajęte', bot: 'Bot' }[spot];
      button.setAttribute('aria-label', `Miejsce ${id + 1}. ${button.textContent}`);
      button.addEventListener('click', () => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        setConnecting(true);
        showNotice('Zajmujemy miejsce…');
        socket.send(JSON.stringify({ type: 'join', room, seat: id, name: name.value.trim() }));
        connectionTimeout = setTimeout(() => failConnection(socket, connectionFailed), 10_000);
      });
      return button;
    });
    seatMap.replaceChildren(tableStakes, ...seats);
    seatMap.querySelector('button:enabled')?.focus();
  }

  function failConnection(connection, message) {
    clearTimeout(connectionTimeout);
    socket = null;
    connection?.close();
    setConnecting(false);
    showNotice(message);
  }

  function normalizeServer(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') url.protocol = 'wss:';
      if (url.protocol === 'http:') url.protocol = 'ws:';
      if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && location.protocol !== 'https:')) return '';
      if (url.username || url.password || url.search || url.hash) return '';
      if (url.pathname === '/') url.pathname = '/ws';
      return url.href;
    } catch { return ''; }
  }

  function storedSeat(room, value) {
    const key = `pokerzone-seat:${endpoint}:${room}`;
    try {
      if (value === null) sessionStorage.removeItem(key);
      else if (value !== undefined) sessionStorage.setItem(key, value);
      else return sessionStorage.getItem(key);
    } catch {
      // Brak zapisu w przeglądarce ogranicza powrót po odświeżeniu karty.
    }
    return null;
  }

  function makeLink(room) {
    const url = new URL(location.href);
    url.searchParams.set('table', room);
    url.searchParams.delete('server');
    return url;
  }

  function draw(message, options = {}) {
    update(state, { ...options, online: { connected, host: membership?.seat === 0 } }, message);
  }

  function stop(message = '', notify = true) {
    clearTimeout(retryTimer);
    clearTimeout(connectionTimeout);
    const oldSocket = socket;
    socket = null;
    const oldMembership = membership;
    membership = null;
    state = null;
    keepInvitation = false;
    queuedFold = undefined;
    connected = awaiting = false;
    if (oldSocket) {
      if (notify && oldMembership && oldSocket.readyState === WebSocket.OPEN) oldSocket.send('{"type":"leave"}');
      oldSocket.close();
    }
    if (dialog.open) dialog.close();
    setConnecting(false);
    if (oldMembership) {
      storedSeat(oldMembership.room, null);
      const url = new URL(location.href);
      url.searchParams.delete('table');
      url.searchParams.delete('server');
      history.replaceState(null, '', url);
      leave(message);
    }
  }

  function sendCommand(type, fields) {
    if (!state || !connected || awaiting || socket?.readyState !== WebSocket.OPEN) return false;
    awaiting = true;
    socket.send(JSON.stringify({ type, revision, ...fields }));
    return true;
  }

  function move(choice) {
    if (sendCommand('action', { action: choice.type, target: choice.target })) queuedFold = undefined;
  }

  const handKey = snapshot => `${snapshot.sessionId}:${snapshot.handNo}`;
  const game = {
    getState: () => state,
    pot: () => state.players.reduce((total, player) => total + player.contributed, 0),
    minRaiseTo: () => state.currentBet === 0 ? state.bigBlind : state.currentBet + state.lastRaise,
    bigBlindsPer100: () => null,
    startHand: () => sendCommand('next'),
    skipRunout: () => sendCommand('skip'),
    act: (_, choice) => move(choice),
    requestFold() {
      if (!state || !connected || state.phase !== 'betting' || state.players[0].folded || state.players[0].allIn) return false;
      if (queuedFold) queuedFold = undefined;
      else if (state.actor === 0 && !state.dealing) move({ type: 'fold' });
      else queuedFold = handKey(state);
      state.foldPending = Boolean(queuedFold);
      return state.foldPending;
    }
  };

  function readMessage(data) {
    const message = JSON.parse(data);
    if (message?.type === 'seat') {
      if (!validSeat(message.seat, maxPlayers) || typeof message.room !== 'string' || !roomPattern.test(message.room)
        || typeof message.token !== 'string') throw new Error('Invalid seat');
    } else if (message?.type === 'seats' && !membership) {
      if (!roomPattern.test(message.room) || !stakeButtons.has(message.bigBlind) || !Array.isArray(message.spots)
        || !validCount(message.spots.length) || !message.spots.every(spot => ['free', 'bot', 'taken'].includes(spot))) {
        throw new Error('Invalid seat selection');
      }
    } else if (message?.type === 'state' && membership) {
      const { playerCount, present, humanCount = playerCount, botCount = 0 } = message;
      if (!whole(message.revision) || !validCount(playerCount) || !whole(present) || present > humanCount
        || !whole(humanCount) || !whole(botCount) || humanCount + botCount !== playerCount
        || typeof message.connected !== 'boolean' || !validSeat(membership.seat, playerCount)
        || !Array.isArray(message.payouts) || !message.payouts.every(payout => Array.isArray(payout)
          && validSeat(payout[0], playerCount) && whole(payout[1]))
        || (message.state !== null && (!message.state || !validSnapshot(message.state, playerCount)))) throw new Error('Invalid state');
    } else if (!(message?.type === 'error' || (message?.type === 'closed' && membership))
      || typeof message.message !== 'string') {
      throw new Error('Unrecognized PokerZone message');
    }
    return message;
  }

  function receive(message, request) {
    if (message.type === 'seat') {
      clearTimeout(connectionTimeout);
      const firstSeat = !membership;
      membership = message;
      if (firstSeat) keepInvitation = request.type === 'create' && request.botCount > 0;
      storedSeat(message.room, message.token);
      history.replaceState(null, '', makeLink(message.room));
      code.value = message.room;
      title.textContent = 'Zaproszenie do stołu';
      options.hidden = true;
      form.hidden = true;
      seatPicker.hidden = true;
      invite.hidden = false;
      setConnecting(false);
      showNotice('');
      if (firstSeat) {
        enter();
        if (dialog.open) code.focus({ preventScroll: true });
      }
      return;
    }
    if (message.type === 'seats') {
      if (seatPicker.hidden) showNotice('');
      showSeats(message);
      if (!message.spots.includes('free')) showNotice('Ten stół jest już pełny.');
      return;
    }
    if (message.type === 'closed') { stop(message.message, false); return; }
    if (message.type === 'error') {
      awaiting = false;
      if (message.code === 'resume') {
        storedSeat(request.room, null);
        if (membership) { stop(message.message, false); return; }
      }
      if (membership) draw(message.message, { restored: true });
      else if (message.code === 'seat') showNotice(message.message);
      else failConnection(socket, message.message);
      return;
    }
    connected = message.connected;
    revision = message.revision;
    awaiting = false;
    state = message.state;
    const occupancy = `Gracze ${message.present}/${message.humanCount ?? message.playerCount} · Boty ${message.botCount ?? 0}`;
    enterTable.hidden = !state;
    waiting.textContent = state ? occupancy : `${occupancy}. Czekamy na drugiego uczestnika.`;
    if (!state) {
      draw(occupancy);
      return;
    }
    if (dialog.open && !keepInvitation) dialog.close();
    if (queuedFold !== handKey(state) || state.phase !== 'betting') queuedFold = undefined;
    if (queuedFold && !state.dealing && state.actor === 0 && connected) move({ type: 'fold' });
    state.foldPending = Boolean(queuedFold);
    draw(connected ? occupancy : `${occupancy}. Czekamy na powrót pozostałych graczy.`, {
      restored: message.restored, skippedRunout: message.skippedRunout, payouts: message.payouts, sound: message.sound
    });
  }

  function connect(request) {
    let connection;
    try { connection = new WebSocket(endpoint); } catch {
      if (membership) stop(connectionFailed, false);
      else failConnection(null, connectionFailed);
      return;
    }
    socket = connection;
    connectionTimeout = setTimeout(() => connection.close(), 10_000);
    connection.addEventListener('open', () => {
      if (socket === connection) connection.send(JSON.stringify(request));
    });
    connection.addEventListener('message', event => {
      if (socket !== connection) return;
      let message;
      try { message = readMessage(event.data); } catch {
        if (membership) stop('Serwer przesłał nieprawidłowe dane stołu.', false);
        else failConnection(connection, connectionFailed);
        return;
      }
      try { receive(message, request); } catch (error) {
        console.error('PokerZone online failed to update the game view:', error);
        if (membership) stop('Nie udało się wyświetlić stołu w przeglądarce.', false);
        else failConnection(connection, 'Nie udało się otworzyć stołu w przeglądarce.');
      }
    });
    connection.addEventListener('close', event => {
      if (socket !== connection) return;
      clearTimeout(connectionTimeout);
      socket = null;
      awaiting = connected = false;
      if (!membership) {
        failConnection(null, connectionFailed);
        return;
      }
      if (event.code === 4001) { stop('Grasz z innej karty przeglądarki.', false); return; }
      const status = 'Utracono połączenie. Trwa ponowne łączenie…';
      draw(status, { restored: true });
      if (dialog.open) showNotice(status);
      retryTimer = setTimeout(() => connect({ type: 'resume', room: membership.room, token: membership.token }), 1500);
    });
  }

  function open(defaultName, fromInvite = false) {
    if (dialog.open || membership) return;
    const parameters = new URLSearchParams(location.search);
    const invitedRoom = fromInvite ? parameters.get('table')?.toUpperCase() : '';
    if (fromInvite && !roomPattern.test(invitedRoom)) return;
    name.value = defaultName;
    roomField.value = invitedRoom || '';
    botsField.value = 0;
    playersField.max = maxPlayers;
    playersField.value = defaultPlayers;
    updateCounts();
    selectStakes(stakes[0].bigBlind);
    showStep(invitedRoom ? 'join' : null);
    dialog.showModal();
    const token = endpoint && invitedRoom && storedSeat(invitedRoom);
    if (token) {
      setConnecting(true);
      showNotice('Przywracamy Twoje miejsce przy stole…');
      connect({ type: 'resume', room: invitedRoom, token });
    }
  }

  find('#online-create').addEventListener('click', () => { showStep('create'); name.focus(); });
  find('#online-join').addEventListener('click', () => { showStep('join'); roomField.focus(); });
  back.addEventListener('click', () => {
    const previous = mode;
    showStep(null);
    find(previous === 'create' ? '#online-create' : '#online-join').focus();
  });
  for (const { field, less, more } of counters) {
    field.addEventListener('input', updateCounts);
    less.addEventListener('click', () => { field.stepDown(); updateCounts(); });
    more.addEventListener('click', () => { field.stepUp(); updateCounts(); });
  }
  seatsBack.addEventListener('click', () => {
    failConnection(socket, '');
    showStep('join');
    roomField.focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (socket || !mode) return;
    if (!endpoint) { showNotice(unavailable); return; }
    const room = roomField.value.trim().toUpperCase();
    const nick = name.value.trim();
    const playerCount = playersField.valueAsNumber;
    const botCount = botsField.valueAsNumber;
    if (!nick) { showNotice('Podaj nick.'); name.focus(); return; }
    if (mode === 'create' && !validCount(playerCount + botCount)) {
      showNotice('Wybierz od 2 do 8 miejsc łącznie.');
      return;
    }
    if (mode === 'join' && !roomPattern.test(room)) { showNotice('Wpisz 10-znakowy kod z zaproszenia albo otwórz link zaproszenia.'); roomField.focus(); return; }
    setConnecting(true);
    showNotice('Łączymy się z PokerZone…');
    const request = mode === 'create'
      ? { type: 'create', name: nick, bigBlind: selectedBlind, playerCount, botCount }
      : { type: 'inspect', room };
    connect(request);
  });

  async function copyInvite(value, success) {
    try {
      await navigator.clipboard.writeText(value);
      showNotice(success);
    } catch {
      code.focus();
      code.select();
      showNotice('Skopiuj zaznaczony kod zaproszenia.');
    }
  }
  find('#copy-online-code').addEventListener('click', () => copyInvite(code.value, 'Skopiowano kod zaproszenia.'));
  find('#copy-online-link').addEventListener('click', () => {
    if (membership) copyInvite(makeLink(membership.room).href, 'Skopiowano link zaproszenia.');
  });
  function closeDialog() {
    if (membership && state) {
      keepInvitation = false;
      dialog.close();
    } else stop();
  }
  function openInvitation() {
    if (!membership || dialog.open) return;
    keepInvitation = true;
    showNotice('');
    dialog.showModal();
  }
  enterTable.addEventListener('click', closeDialog);
  find('#close-online-dialog').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  window.addEventListener('pagehide', () => {
    clearTimeout(retryTimer);
    clearTimeout(connectionTimeout);
    const oldSocket = socket;
    socket = null;
    connected = awaiting = false;
    oldSocket?.close();
    setConnecting(false);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !membership || socket) return;
    draw('Przywracamy połączenie ze stołem…', { restored: true });
    connect({ type: 'resume', room: membership.room, token: membership.token });
  });

  return { game, open, openInvitation, stop };
}
