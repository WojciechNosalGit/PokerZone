'use strict';

function createPokerOnline(dialog, { enter, update, leave }) {
  const find = selector => dialog.querySelector(selector);
  const form = find('#online-form');
  const notice = find('#online-dialog-status');
  const invite = find('#online-invitation');
  const link = find('#online-link');
  const serverField = find('#online-server');
  const roomField = find('#online-room');
  const name = find('#online-name');
  const stakesField = find('#online-stakes');
  const roomPattern = /^[A-F0-9]{10}$/;
  const chipValues = new Set([1, 5, 10, 25, 100, 500, 1000]);
  const meta = document.querySelector('meta[name="pokerzone-online-url"]');
  const ownServer = /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io')
    ? location.origin + '/ws' : '';
  const defaultServer = meta.content.trim() || ownServer;
  for (const { smallBlind, bigBlind } of pokerGame.stakes) {
    stakesField.add(new Option(`NL ${smallBlind}/${bigBlind}`, String(bigBlind)));
  }

  let socket;
  let connectionTimeout;
  let retryTimer;
  let endpoint;
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

  function validSnapshot(snapshot) {
    return typeof snapshot.sessionId === 'string' && ['betting', 'finished', 'gameover'].includes(snapshot.phase)
      && ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(snapshot.street)
      && typeof snapshot.dealing === 'boolean' && typeof snapshot.summary === 'string'
      && [snapshot.handNo, snapshot.currentBet, snapshot.lastRaise, snapshot.smallBlind, snapshot.bigBlind].every(whole)
      && snapshot.smallBlind > 0 && snapshot.bigBlind > 0
      && [-1, 0, 1].includes(snapshot.actor) && [0, 1].includes(snapshot.dealer)
      && Array.isArray(snapshot.board) && snapshot.board.length <= 5 && snapshot.board.every(validCard)
      && validChips(snapshot.potChips) && Array.isArray(snapshot.logs) && snapshot.logs.every(entry => entry && typeof entry === 'object')
      && Array.isArray(snapshot.players) && snapshot.players.length === 2 && snapshot.players.every((player, index) =>
        player?.id === index && typeof player.name === 'string' && [player.stack, player.contributed, player.bet].every(whole)
        && validChips(player.betChips) && Array.isArray(player.hand) && player.hand.length === 2
        && player.hand.every(card => (index === 1 && card === null) || validCard(card)));
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  function setConnecting(connecting) {
    for (const button of form.querySelectorAll('button[type="submit"]')) button.disabled = connecting;
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
    url.searchParams.set('server', endpoint);
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

  function receive(message, request) {
    if (!message || typeof message.type !== 'string') throw new Error('Invalid message');
    if (message.type === 'seat') {
      if (![0, 1].includes(message.seat) || typeof message.room !== 'string' || !roomPattern.test(message.room)
        || typeof message.token !== 'string') throw new Error('Invalid seat');
      clearTimeout(connectionTimeout);
      const firstSeat = !membership;
      membership = message;
      storedSeat(message.room, message.token);
      const url = makeLink(message.room);
      history.replaceState(null, '', url);
      link.value = url.href;
      form.hidden = true;
      invite.hidden = false;
      if (firstSeat) enter();
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
      else {
        clearTimeout(connectionTimeout);
        const failed = socket;
        socket = null;
        failed?.close();
        setConnecting(false);
        showNotice(message.message);
      }
      return;
    }
    if (message.type !== 'state' || !membership) return;
    if (!whole(message.revision) || typeof message.connected !== 'boolean'
      || !Array.isArray(message.payouts) || !message.payouts.every(payout => Array.isArray(payout)
        && [0, 1].includes(payout[0]) && whole(payout[1]))
      || (message.state !== null && (!message.state || !validSnapshot(message.state)))) throw new Error('Invalid state');

    connected = message.connected;
    revision = message.revision;
    awaiting = false;
    state = message.state;
    if (!state) {
      showNotice(message.opponent ? 'Czekamy na powrót drugiego gracza.' : 'Wyślij link drugiemu graczowi.');
      draw('Czekasz na drugiego gracza.');
      return;
    }
    if (dialog.open) dialog.close();
    if (queuedFold !== handKey(state) || state.phase !== 'betting') queuedFold = undefined;
    if (queuedFold && !state.dealing && state.actor === 0 && connected) move({ type: 'fold' });
    state.foldPending = Boolean(queuedFold);
    draw(connected ? `${message.opponent} jest przy stole.` : `Czekasz, aż ${message.opponent} wróci do stołu.`, {
      restored: message.restored, skippedRunout: message.skippedRunout, payouts: message.payouts, sound: message.sound
    });
  }

  function connect(request) {
    let connection;
    try { connection = new WebSocket(endpoint); } catch {
      const warning = 'Przeglądarka nie może otworzyć połączenia pod tym adresem.';
      if (membership) stop(warning, false);
      else {
        setConnecting(false);
        find('#online-server-details').open = true;
        showNotice(warning);
      }
      return;
    }
    socket = connection;
    connectionTimeout = setTimeout(() => connection.close(), 10_000);
    connection.addEventListener('open', () => {
      if (socket === connection) connection.send(JSON.stringify(request));
    });
    connection.addEventListener('message', event => {
      if (socket !== connection) return;
      try { receive(JSON.parse(event.data), request); } catch {
        const warning = 'Serwer przesłał nieprawidłowe dane stołu.';
        if (membership) stop(warning, false);
        else {
          socket = null;
          clearTimeout(connectionTimeout);
          connection.close();
          setConnecting(false);
          showNotice(warning);
        }
      }
    });
    connection.addEventListener('close', event => {
      if (socket !== connection) return;
      clearTimeout(connectionTimeout);
      socket = null;
      awaiting = connected = false;
      if (!membership) {
        setConnecting(false);
        find('#online-server-details').open = true;
        showNotice('Nie udało się połączyć z serwerem gry. Sprawdź jego adres.');
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
    const invitedServer = fromInvite ? parameters.get('server') : '';
    if (fromInvite && !roomPattern.test(invitedRoom)) return;
    form.hidden = false;
    invite.hidden = true;
    name.value = defaultName;
    roomField.value = invitedRoom || '';
    serverField.value = invitedServer || serverField.value || defaultServer;
    find('#online-server-details').open = !normalizeServer(serverField.value);
    showNotice('');
    dialog.showModal();
    endpoint = normalizeServer(serverField.value);
    const token = endpoint && invitedRoom && storedSeat(invitedRoom);
    if (token) {
      setConnecting(true);
      showNotice('Przywracamy Twoje miejsce przy stole…');
      connect({ type: 'resume', room: invitedRoom, token });
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (socket) return;
    endpoint = normalizeServer(serverField.value.trim());
    if (!endpoint) {
      find('#online-server-details').open = true;
      showNotice('Podaj adres serwera gry. Na stronie HTTPS użyj adresu wss://.');
      serverField.focus();
      return;
    }
    const type = event.submitter?.value ?? (roomField.value ? 'join' : 'create');
    const room = roomField.value.trim().toUpperCase();
    if (type === 'join' && !roomPattern.test(room)) { showNotice('Wpisz kod z zaproszenia.'); roomField.focus(); return; }
    setConnecting(true);
    showNotice('Łączymy się z serwerem…');
    connect({ type, name: name.value.trim(), room, bigBlind: Number(stakesField.value) });
  });
  find('#copy-online-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link.value);
      showNotice('Skopiowano zaproszenie.');
    } catch {
      link.focus();
      link.select();
      showNotice('Skopiuj zaznaczony link.');
    }
  });
  find('#close-online-dialog').addEventListener('click', () => stop());
  dialog.addEventListener('cancel', event => { event.preventDefault(); stop(); });
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

  return { game, open, stop };
}
