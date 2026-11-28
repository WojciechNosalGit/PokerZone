'use strict';

function createPokerOnline(dialog, { enter, preview, update, leave, onProfile, onChat, onHistory }) {
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
  const roomField = find('#online-room');
  const name = find('#online-name');
  const playersField = find('#online-players');
  const botsField = find('#online-bots');
  const timeField = find('#online-turn-time');
  const { stakes, minPlayers, maxPlayers, defaultPlayers, validPayouts } = pokerGame;
  const roomPattern = /^[A-F0-9]{10}$/;
  const version = 2;
  const chipValues = new Set([1, 5, 10, 25, 100, 500, 1000]);
  const configuredServer = document.querySelector('meta[name="pokerzone-online-url"]')?.content.trim() ?? '';
  const endpoint = normalizeServer(configuredServer === '/ws' ? location.origin + configuredServer : configuredServer);
  const unavailable = 'Gra online jest chwilowo niedostępna.';
  const connectionFailed = 'Nie udało się połączyć z PokerZone. Spróbuj ponownie za chwilę.';
  let selectedBlind;
  let mode;
  let keepInvitation = false;
  let avatar = '';

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
    { field: botsField, less: find('#online-bots-less'), more: find('#online-bots-more'), output: find('#online-bot-count') },
    { field: timeField, less: find('#online-time-less'), more: find('#online-time-more'), output: find('#online-turn-seconds'), unit: ' s' }
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
  let clock;
  let pendingProfile;
  let offer;
  let choosingSeat = false;
  let seatNotice = '';
  const hands = new Map();

  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const validChips = chips => Array.isArray(chips) && chips.every(chip => chipValues.has(chip));
  const validCard = card => card && Number.isInteger(card.r) && card.r >= 2 && card.r <= 14
    && ['♥', '♠', '♦', '♣'].includes(card.s);

  const validCount = count => Number.isInteger(count) && count >= minPlayers && count <= maxPlayers;
  const validSeat = (id, count) => whole(id) && id < count;
  const validTurnSeconds = seconds => Number.isInteger(seconds) && seconds >= 15 && seconds <= 90;
  const presetAvatar = value => pokerAvatars.isPreset(value) ? value : '';

  function validHistoryEntry(hand) {
    const cards = (list, lengths) => Array.isArray(list) && lengths.includes(list.length) && list.every(validCard);
    const { hero, opponents } = hand ?? {};
    return typeof hand?.id === 'string' && Number.isFinite(Date.parse(hand.finishedAt))
      && ['showdown', 'fold'].includes(hand.ending) && cards(hand.board, [0, 3, 4, 5])
      && cards(hero?.cards, [2]) && Array.isArray(hero.actions) && Array.isArray(opponents)
      && opponents.every(other => typeof other?.name === 'string' && validSeat(other.seat, maxPlayers)
        && (other.revealed ? hand.ending === 'showdown' && cards(other.cards, [2]) : other.cards === null));
  }

  function validSnapshot(snapshot, count, ownSeat = 0) {
    return typeof snapshot.sessionId === 'string' && ['betting', 'finished', 'gameover'].includes(snapshot.phase)
      && ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(snapshot.street)
      && typeof snapshot.dealing === 'boolean' && typeof snapshot.summary === 'string'
      && (snapshot.payouts === undefined || validPayouts(snapshot.payouts, count))
      && [snapshot.handNo, snapshot.currentBet, snapshot.lastRaise, snapshot.smallBlind, snapshot.bigBlind].every(whole)
      && snapshot.smallBlind > 0 && snapshot.bigBlind > 0
      && (snapshot.actor === -1 || validSeat(snapshot.actor, count)) && validSeat(snapshot.dealer, count)
      && Array.isArray(snapshot.board) && snapshot.board.length <= 5 && snapshot.board.every(validCard)
      && validChips(snapshot.potChips) && Array.isArray(snapshot.logs) && snapshot.logs.every(entry => entry && typeof entry === 'object')
      && Array.isArray(snapshot.players) && snapshot.players.length === count && snapshot.players.every((player, index) =>
        player?.id === index && typeof player.name === 'string' && [player.stack, player.contributed, player.bet].every(whole)
        && validChips(player.betChips) && Array.isArray(player.hand) && [0, 2].includes(player.hand.length)
        && player.hand.every(card => (index !== ownSeat && card === null) || validCard(card)));
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  function setConnecting(connecting) {
    submit.disabled = back.disabled = connecting;
  }

  function selectStakes(bigBlind) {
    selectedBlind = bigBlind;
    for (const [value, button] of stakeButtons) button.setAttribute('aria-pressed', String(bigBlind === value));
  }

  function updateCounts() {
    playersField.max = maxPlayers - botsField.valueAsNumber;
    botsField.max = maxPlayers - playersField.valueAsNumber;
    for (const { field, less, more, output, unit = '' } of counters) {
      const value = field.valueAsNumber;
      output.value = `${value}${unit}`;
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
    createFields.hidden = step !== 'create';
    joinFields.hidden = step !== 'join';
    submit.textContent = step === 'create' ? 'Utwórz stół' : 'Wybierz miejsce';
    showNotice(endpoint ? '' : unavailable);
  }

  function showSeats(message) {
    if (choosingSeat) return;
    clearTimeout(connectionTimeout);
    setConnecting(false);
    offer = message;
    if (dialog.open) dialog.close();
    const status = message.spots.includes('free') ? seatNotice || 'Wybierz wolne miejsce.' : 'Ten stół jest już pełny.';
    preview(offer, chooseSeat, false, status);
  }

  function chooseSeat(seat) {
    if (!offer || choosingSeat || offer.spots[seat] !== 'free' || socket?.readyState !== WebSocket.OPEN) return;
    choosingSeat = true;
    seatNotice = '';
    preview(offer, chooseSeat, true, 'Zajmujemy miejsce…');
    socket.send(JSON.stringify({ type: 'join', room: offer.room, seat, name: name.value.trim(), avatar, version }));
    connectionTimeout = setTimeout(() => failConnection(socket, connectionFailed), 10_000);
  }

  function failConnection(connection, message) {
    clearTimeout(connectionTimeout);
    socket = null;
    connection?.close();
    setConnecting(false);
    if (offer) {
      offer = undefined;
      choosingSeat = false;
      seatNotice = '';
      leave('');
      showStep('join');
      dialog.showModal();
      roomField.focus();
    }
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
    update(state, { ...options, online: { connected, host: membership?.seat === 0, clock: connected ? clock : null } }, message);
  }

  function stop(message = '', notify = true) {
    clearTimeout(retryTimer);
    clearTimeout(connectionTimeout);
    const oldSocket = socket;
    socket = null;
    const oldMembership = membership;
    const hadOffer = Boolean(offer);
    membership = null;
    offer = undefined;
    choosingSeat = false;
    seatNotice = '';
    state = null;
    clock = pendingProfile = undefined;
    hands.clear();
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
      onHistory([]);
    }
    if (oldMembership || hadOffer) leave(message);
  }

  function sendMemberMessage(type, fields) {
    if (!membership || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, ...fields }));
    return true;
  }

  function changeProfile(profile) {
    avatar = presetAvatar(profile.avatar);
    pendingProfile = { name: profile.name.trim().replace(/\s+/g, ' '), avatar };
    sendMemberMessage('profile', pendingProfile);
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
      const { spots, state: publicState, occupants } = message;
      if (!roomPattern.test(message.room) || !stakeButtons.has(message.bigBlind) || !Array.isArray(spots)
        || !validCount(spots.length) || !spots.every(spot => ['free', 'bot', 'taken'].includes(spot))
        || (publicState != null && !validSnapshot(publicState, spots.length, null))
        || (occupants != null && (!Array.isArray(occupants) || occupants.length !== spots.length
          || !occupants.every(player => player === null || typeof player?.name === 'string')))) {
        throw new Error('Invalid seat selection');
      }
    } else if (message?.type === 'state' && membership) {
      const { playerCount, present, humanCount = playerCount, botCount = 0, turnSeconds = 30, remainingMs = null } = message;
      if (!whole(message.revision) || !validCount(playerCount) || !whole(present) || present > humanCount
        || !whole(humanCount) || !whole(botCount) || humanCount + botCount !== playerCount
        || typeof message.connected !== 'boolean' || !validSeat(membership.seat, playerCount)
        || !validTurnSeconds(turnSeconds) || (remainingMs !== null && (!whole(remainingMs) || remainingMs > turnSeconds * 1000))
        || !validPayouts(message.payouts, playerCount)
        || (message.state !== null && (!message.state || !validSnapshot(message.state, playerCount)))) throw new Error('Invalid state');
    } else if (message?.type === 'history' && membership) {
      if (!Array.isArray(message.entries) || !message.entries.every(validHistoryEntry)) throw new Error('Invalid history');
    } else if (message?.type === 'profile' && membership) {
      if (!validSeat(message.seat, maxPlayers) || typeof message.name !== 'string' || !message.name || message.name.length > 10
        || typeof message.avatar !== 'string' || message.avatar !== presetAvatar(message.avatar)) throw new Error('Invalid profile');
    } else if (message?.type === 'chat' && membership) {
      if (!validSeat(message.seat, maxPlayers) || typeof message.text !== 'string' || !message.text || message.text.length > 72) {
        throw new Error('Invalid chat message');
      }
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
      offer = undefined;
      choosingSeat = false;
      seatNotice = '';
      if (firstSeat) keepInvitation = request.type === 'create' && request.botCount > 0;
      storedSeat(message.room, message.token);
      history.replaceState(null, '', makeLink(message.room));
      code.value = message.room;
      title.textContent = 'Zaproszenie do stołu';
      options.hidden = true;
      form.hidden = true;
      invite.hidden = false;
      setConnecting(false);
      showNotice('');
      if (firstSeat) {
        enter();
        if (dialog.open) code.focus({ preventScroll: true });
      }
      if (pendingProfile) sendMemberMessage('profile', pendingProfile);
      return;
    }
    if (message.type === 'seats') {
      showSeats(message);
      return;
    }
    if (message.type === 'closed') { stop(message.message, false); return; }
    if (message.type === 'history') {
      for (const entry of message.entries) hands.set(entry.id, entry);
      onHistory([...hands.values()].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)));
      return;
    }
    if (message.type === 'profile') {
      const player = state?.players[message.seat];
      if (message.seat === 0 && message.name === pendingProfile?.name && message.avatar === pendingProfile?.avatar) pendingProfile = undefined;
      if (player) {
        Object.assign(player, { name: message.name, avatar: message.avatar });
        onProfile(player);
      }
      return;
    }
    if (message.type === 'chat') {
      const player = state?.players[message.seat];
      if (player) onChat(player, message.text);
      return;
    }
    if (message.type === 'error') {
      awaiting = false;
      if (message.code === 'resume') {
        storedSeat(request.room, null);
        if (membership) { stop(message.message, false); return; }
      }
      if (membership) draw(message.message, { restored: true });
      else if (message.code === 'seat' && offer) {
        choosingSeat = false;
        seatNotice = message.message;
      }
      else failConnection(socket, message.message);
      return;
    }
    connected = message.connected;
    revision = message.revision;
    awaiting = false;
    state = message.state;
    clock = message.remainingMs == null ? null : { endsAt: performance.now() + message.remainingMs, seconds: message.turnSeconds };
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
      if (socket === connection) connection.send(JSON.stringify({ ...request, version }));
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

  function open(profile, fromInvite = false) {
    if (dialog.open || membership || offer) return;
    const parameters = new URLSearchParams(location.search);
    const invitedRoom = fromInvite ? parameters.get('table')?.toUpperCase() : '';
    if (fromInvite && !roomPattern.test(invitedRoom)) return;
    name.value = profile.name;
    avatar = presetAvatar(profile.avatar);
    roomField.value = invitedRoom || '';
    botsField.value = 0;
    timeField.value = 30;
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
      ? { type: 'create', name: nick, avatar, bigBlind: selectedBlind, playerCount, botCount, turnSeconds: timeField.valueAsNumber }
      : { type: 'inspect', room, live: true };
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
    if (!event.persisted || socket) return;
    if (offer) {
      choosingSeat = false;
      connect({ type: 'inspect', room: offer.room, live: true });
      return;
    }
    if (!membership) return;
    draw('Przywracamy połączenie ze stołem…', { restored: true });
    connect({ type: 'resume', room: membership.room, token: membership.token });
  });

  function backFromSeats() {
    if (offer) failConnection(socket, '');
  }

  return { game, open, openInvitation, backFromSeats, stop, changeProfile, sendChat: text => sendMemberMessage('chat', { text }) };
}
