'use strict';

const pokerGame = (() => {
  const STARTING_BIG_BLINDS = 100;
  const MINIMUM_BUY_IN_BIG_BLINDS = 50;
  const startingBankroll = 800;
  const LEGACY_STARTING_STACK = 1000;
  const stakes = [
    { smallBlind: 2, bigBlind: 4 },
    { smallBlind: 5, bigBlind: 10 },
    { smallBlind: 10, bigBlind: 20 }
  ];
  const streetDelay = 450;
  const nextHandDelay = 3000;
  const dealTiming = Object.freeze({ shuffle: 520, flight: 195, interval: 60, settle: 65 });
  const runoutTiming = Object.freeze({ revealDelay: 220, firstStreet: 1300, nextStreet: 950, flight: 440, interval: 100 });
  const bettingStreets = ['preflop', 'flop', 'turn', 'river'];
  const minPlayers = 2;
  const defaultPlayers = 4;
  const profiles = [
    { name: 'Ty', kind: 'human' },
    { name: 'Ada', kind: 'tight', avatarGender: 'female' },
    { name: 'Bartek', kind: 'loose', avatarGender: 'male' },
    { name: 'Chris', kind: 'balanced', avatarGender: 'male' },
    { name: 'Daria', kind: 'balanced', avatarGender: 'female' },
    { name: 'Emil', kind: 'tight', avatarGender: 'male' },
    { name: 'Franek', kind: 'loose', avatarGender: 'male' },
    { name: 'Gosia', kind: 'balanced', avatarGender: 'female' }
  ];
  const botProfiles = [...profiles.slice(1),
    { name: 'Iga', kind: 'tight', avatarGender: 'female' },
    { name: 'Leon', kind: 'loose', avatarGender: 'male' },
    { name: 'Klara', kind: 'balanced', avatarGender: 'female' },
    { name: 'Maks', kind: 'balanced', avatarGender: 'male' },
    { name: 'Olaf', kind: 'tight', avatarGender: 'male' },
    { name: 'Lena', kind: 'loose', avatarGender: 'female' },
    { name: 'Nina', kind: 'balanced', avatarGender: 'female' }
  ];
  const maxPlayers = profiles.length;
  const positionsFromButton = {
    2: ['BTN / SB', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['BTN', 'SB', 'BB', 'UTG'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
    7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO']
  };
  const { fullDeck, shuffled, randomIndex, score7, compareScore, handNames } = pokerCards;
  const formatAmount = amount => Number(amount).toLocaleString('pl-PL');
  const buyInFor = bigBlind => STARTING_BIG_BLINDS * bigBlind;
  const minBuyInFor = bigBlind => MINIMUM_BUY_IN_BIG_BLINDS * bigBlind;

  function affordableBuyIn(bigBlind, funds, desired) {
    if (funds < minBuyInFor(bigBlind)) return bigBlind === stakes[0].bigBlind ? funds : 0;
    return Math.min(desired, Math.floor(funds / bigBlind) * bigBlind);
  }

  function buyInRange(bigBlind, funds) {
    if (funds <= 0 || (bigBlind !== stakes[0].bigBlind && funds < buyInFor(bigBlind))) return null;
    return { min: Math.min(minBuyInFor(bigBlind), funds), max: affordableBuyIn(bigBlind, funds, buyInFor(bigBlind)) };
  }
  const isBankroll = amount => Number.isSafeInteger(amount) && amount >= 0;
  const isTableClosed = phase => phase === 'gameover' || phase === 'left';
  const createId = () => crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-');

  function positionsForHand(dealer, seats) {
    const ordered = [...seats].sort((a, b) => a - b);
    const names = positionsFromButton[ordered.length];
    const start = ordered.indexOf(dealer);
    if (!names || start === -1) return new Map();
    return new Map(names.map((name, offset) => [ordered[(start + offset) % ordered.length], name]));
  }

  function assignPositions(state) {
    const seats = state.players.filter(player => player.hand.length === 2).map(player => player.id);
    const positions = positionsForHand(state.dealer, seats);
    for (const player of state.players) player.position = positions.get(player.id) ?? null;
  }

  const displayName = player => player.id === 0 ? player.name : (player.position ?? '—');
  const wagerKind = state => state.street !== 'preflop' && state.currentBet === 0 ? 'bet' : 'raise';

  function availableBotProfiles(players) {
    const names = new Set(players.slice(1).map(player => player.name));
    return shuffled(botProfiles.filter(profile => !names.has(profile.name)));
  }

  function takeBotProfile(available, kind) {
    const matching = available.findIndex(profile => profile.kind === kind);
    return available.splice(Math.max(0, matching), 1)[0];
  }

  function createPlayer(profile, id, stack) {
    return {
      ...profile,
      id,
      avatar: null,
      stack,
      hand: [],
      bet: 0,
      betChips: [],
      contributed: 0,
      folded: false,
      allIn: false,
      acted: false,
      canRaise: true,
      lastAction: null
    };
  }

  function createState(playerCount, blinds, heroBuyIn, previousPlayers) {
    const startingStack = buyInFor(blinds.bigBlind);
    const tableProfiles = profiles.slice(0, playerCount);
    if (previousPlayers) {
      const available = availableBotProfiles(previousPlayers);
      for (let seat = 1; seat < playerCount; seat++) {
        tableProfiles[seat] = takeBotProfile(available, tableProfiles[seat].kind);
      }
    }
    const players = tableProfiles.map((profile, id) => createPlayer(profile, id, id === 0 ? heroBuyIn : startingStack));
    if (blinds.bigBlind === 4) {
      const [first, second] = shuffled(players.slice(1));
      first.preflopStyle = randomIndex(2) ? 'loose' : 'loose-aggressive';
      if (playerCount >= 6) second.preflopStyle = first.preflopStyle === 'loose' ? 'loose-aggressive' : 'loose';
    }
    return {
      sessionId: createId(),
      ...blinds,
      startingStack,
      rebuyTarget: Math.max(minBuyInFor(blinds.bigBlind), heroBuyIn),
      heroBuyIns: heroBuyIn,
      tableBuyIns: heroBuyIn + (playerCount - 1) * startingStack,
      handId: null,
      players,
      dealer: -1,
      sbSeat: -1,
      bbSeat: -1,
      handNo: 0,
      deck: [],
      board: [],
      potChips: [],
      street: '',
      phase: 'idle',
      actor: -1,
      currentBet: 0,
      lastRaise: blinds.bigBlind,
      lastAggressor: null,
      logs: [],
      summary: '',
      stats: { hands: 0, vpip: 0, pfr: 0, checks: 0, calls: 0, raises: 0, folds: 0 },
      heroHand: null,
      handVpip: false,
      handPfr: false,
      autoFold: false,
      dealing: false,
      runoutFrom: null,
      timer: null,
      epoch: 0
    };
  }

  function createGame(onChange, onHandFinished = () => {}, onAction = () => {}) {
    let state = null;
    let bankroll = startingBankroll;
    let paused = false;
    let dealTimer = null;
    let heroProfile;
    const human = () => state.players[0];
    const pot = () => state.players.reduce((total, player) => total + player.contributed, 0);
    const contestablePot = (player, price) => state.players.reduce(
      (total, seat) => total + Math.min(seat.contributed, player.contributed + price), 0);
    const contenders = () => state.players.filter(player => player.hand.length === 2 && !player.folded);
    const eligible = () => contenders().filter(player => !player.allIn);
    const minRaiseTo = () => state.currentBet === 0 ? state.bigBlind : state.currentBet + state.lastRaise;
    const availableBankroll = () => bankroll + (state && !isTableClosed(state.phase) ? human().stack : 0);

    function finishTable(phase = 'gameover') {
      bankroll = availableBankroll();
      state.phase = phase;
    }

    function clearTableTimers() {
      if (state?.timer != null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (dealTimer !== null) {
        clearTimeout(dealTimer);
        dealTimer = null;
      }
    }

    function leaveTable() {
      if (!state || isTableClosed(state.phase)) return;
      clearTableTimers();
      finishTable(availableBankroll() === 0 ? 'gameover' : 'left');
      state.actor = -1;
      state.autoFold = false;
      state.dealing = false;
      state.runoutFrom = null;
      onChange(state);
    }

    function prepareRunout() {
      if (state.runoutFrom || contenders().length < 2) return;
      const actors = eligible();
      if (actors.length > 1 || actors.some(player => player.bet < state.currentBet)) return;
      state.actor = -1;
      state.runoutFrom = state.street;
    }

    function setHeroProfile({ name, avatar }) {
      heroProfile = { name, avatar: pokerAvatars.isPreset(avatar) || pokerAvatars.isUpload(avatar) ? avatar : '' };
      if (state) applyHeroProfile();
    }

    function applyHeroProfile() {
      if (!heroProfile) return;
      const player = human();
      player.name = heroProfile.name;
      player.avatar = heroProfile.avatar || null;
      player.avatarSelected = Boolean(heroProfile.avatar);
    }

    function chipIn(player, amount) {
      const paid = Math.max(0, Math.min(Math.floor(amount), player.stack));
      const chips = pokerChips.forAmount(paid);
      player.stack -= paid;
      player.bet += paid;
      player.betChips.push(...chips);
      player.contributed += paid;
      state.potChips.push(...chips);
      if (player.stack === 0) player.allIn = true;
      return paid;
    }

    function bigBlindsPer100() {
      const openHand = state.phase === 'betting' ? state.heroHand : null;
      const completed = state.stats.hands - (openHand ? 1 : 0);
      if (completed <= 0) return null;
      const settledStack = openHand ? openHand.startingStack : human().stack;
      return (settledStack - state.heroBuyIns) * 100 / (state.bigBlind * completed);
    }

    function nextSeat(after, predicate) {
      const { players } = state;
      for (let offset = 1; offset <= players.length; offset++) {
        const index = (after + offset + players.length) % players.length;
        if (predicate(players[index])) return index;
      }
      return -1;
    }

    function addLog(entry) {
      state.logs.unshift(entry);
      if (state.logs.length > 70) state.logs.length = 70;
    }

    function newGame({ playerCount = defaultPlayers, bigBlind = stakes[0].bigBlind, buyIn } = {}) {
      startTable(playerCount, bigBlind, startingBankroll, buyIn);
    }

    function resetGame() {
      clearTableTimers();
      state = null;
      bankroll = startingBankroll;
      onChange(state);
    }

    function changeTable({ playerCount = state?.players.length ?? defaultPlayers, bigBlind = state?.bigBlind ?? stakes[0].bigBlind, buyIn } = {}) {
      if (!state) throw new Error('Najpierw rozpocznij lub wznów grę.');
      startTable(playerCount, bigBlind, availableBankroll(), buyIn, state.players);
    }

    function startTable(playerCount, bigBlind, availableFunds, selectedBuyIn, previousPlayers) {
      const blinds = stakes.find(stake => stake.bigBlind === bigBlind);
      if (!Number.isInteger(playerCount) || playerCount < minPlayers || playerCount > maxPlayers
        || !blinds) throw new RangeError('Nieprawidłowe ustawienia stołu.');
      const range = buyInRange(bigBlind, availableFunds);
      if (!range) throw new RangeError(`Musisz uzbierać ${formatAmount(buyInFor(bigBlind))} na to wpisowe.`);
      const buyIn = selectedBuyIn ?? range.max;
      if (!Number.isSafeInteger(buyIn) || buyIn < range.min || buyIn > range.max || (buyIn - range.min) % bigBlind) {
        throw new RangeError('Nieprawidłowa kwota wpisowego.');
      }
      const nextTable = createState(playerCount, blinds, buyIn, previousPlayers);
      clearTableTimers();
      bankroll = availableFunds - buyIn;
      state = nextTable;
      applyHeroProfile();
      pokerAvatars.fillBotAvatars(state.players);
      addLog({ kind: 'notice', text: `Nowa sesja · ${playerCount} graczy · NL ${blinds.smallBlind}/${blinds.bigBlind} · Wpisowe: ${formatAmount(buyIn)}` });
      startHand();
    }

    function pause() {
      paused = true;
      if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = null;
        state.epoch++;
      }
    }

    function resume() {
      paused = false;
      if (state?.phase === 'finished') onChange(state, { restored: true });
      continueTurn();
    }

    function saveSession() {
      const { timer, epoch, dealing, runoutFrom, autoFold, ...snapshot } = state;
      return JSON.stringify({ version: 3, bankroll, snapshot });
    }

    function restoreSession(serialized) {
      const { version, snapshot, bankroll: savedBankroll } = JSON.parse(serialized);
      // Zapisy sprzed wyboru stawek pochodziły ze stołu NL 5/10.
      const blinds = stakes.find(stake => stake.bigBlind === (snapshot?.bigBlind ?? 10));
      if (![1, 2, 3].includes(version) || typeof snapshot?.sessionId !== 'string'
        || !['betting', 'finished', 'gameover', 'left'].includes(snapshot.phase)
        || !Array.isArray(snapshot.players) || snapshot.players.length < minPlayers || snapshot.players.length > maxPlayers
        || !blinds || (snapshot.smallBlind != null && snapshot.smallBlind !== blinds.smallBlind)
        || !snapshot.players.every((player, id) => player?.id === id && typeof player.name === 'string'
          && [player.stack, player.bet, player.contributed].every(value => Number.isSafeInteger(value) && value >= 0)
          && player.bet <= player.contributed && Array.isArray(player.hand))
        || !Array.isArray(snapshot.deck) || !Array.isArray(snapshot.board)
        || !Array.isArray(snapshot.logs) || !snapshot.stats
        || (snapshot.phase === 'betting' && (!bettingStreets.includes(snapshot.street)
          || (snapshot.actor !== -1 && !snapshot.players[snapshot.actor])))) {
        throw new Error('Nieobsługiwany zapis sesji.');
      }
      const startingStack = snapshot.startingStack ?? LEGACY_STARTING_STACK;
      const heroBuyIns = snapshot.heroBuyIns ?? startingStack;
      const rebuyTarget = snapshot.rebuyTarget ?? buyInFor(blinds.bigBlind);
      const tableBuyIns = snapshot.tableBuyIns ?? snapshot.players.length * startingStack;
      const totalPot = snapshot.players.reduce((sum, player) => sum + player.contributed, 0);
      if ((startingStack !== LEGACY_STARTING_STACK && startingStack !== buyInFor(blinds.bigBlind))
        || !Number.isInteger(rebuyTarget) || rebuyTarget < minBuyInFor(blinds.bigBlind) || rebuyTarget > buyInFor(blinds.bigBlind)
        || rebuyTarget % blinds.bigBlind
        || !isBankroll(heroBuyIns) || !isBankroll(tableBuyIns) || heroBuyIns > tableBuyIns || totalPot > tableBuyIns) {
        throw new Error('Nieobsługiwany zapis sesji.');
      }
      const heroStack = snapshot.players[0].stack;
      const savedAsClosed = isTableClosed(snapshot.phase);
      let restoredBankroll = version === 3 ? savedBankroll
        : Math.max(0, startingBankroll - buyInFor(blinds.bigBlind)) + (savedAsClosed ? heroStack : 0);
      if (!isBankroll(restoredBankroll)) throw new Error('Nieobsługiwany zapis sesji.');
      let phase = snapshot.phase;
      // Starsze zwycięstwa dopisywały stack do bankrolla, choć zostawał widoczny przy stole.
      if (phase === 'gameover' && heroStack > 0) restoredBankroll -= heroStack;
      if (phase === 'gameover' && (heroStack > 0 || restoredBankroll > 0)) phase = 'finished';
      if (phase === 'left' && heroStack === 0 && restoredBankroll === 0) phase = 'gameover';
      if (!isBankroll(restoredBankroll) || !isBankroll(restoredBankroll + (isTableClosed(phase) ? 0 : heroStack))) {
        throw new Error('Nieobsługiwany zapis sesji.');
      }
      for (const player of snapshot.players) {
        if (!pokerChips.matchesAmount(player.betChips, player.bet)) player.betChips = pokerChips.forAmount(player.bet);
      }
      if (!pokerChips.matchesAmount(snapshot.potChips, totalPot)) {
        snapshot.potChips = snapshot.players.flatMap(player => [
          ...pokerChips.forAmount(player.contributed - player.bet), ...player.betChips
        ]);
      }
      if (snapshot.street !== 'preflop') {
        const roundActions = new Map();
        if (snapshot.street !== 'showdown') {
          for (const entry of snapshot.logs) {
            if (entry.kind === 'round') break;
            const actor = entry.playerId ?? entry.playerName;
            if (entry.action && !roundActions.has(actor)) roundActions.set(actor, entry.action);
          }
        }
        for (const player of snapshot.players) {
          player.lastAction = roundActions.get(player.id) ?? roundActions.get(player.name)
            ?? roundActions.get(profiles[player.id].name) ?? null;
        }
      }
      clearTableTimers();
      const { level, ...saved } = snapshot;
      bankroll = restoredBankroll;
      state = { ...saved, ...blinds, startingStack, heroBuyIns, rebuyTarget, tableBuyIns, phase, autoFold: false,
        dealing: false, runoutFrom: null, timer: null, epoch: (state?.epoch ?? 0) + 1 };
      const hero = human();
      // Starszy zapis trzymał wybrany awatar gracza osobno, w ustawieniach profilu.
      if (version === 1 && heroProfile?.avatar) {
        hero.avatar = heroProfile.avatar;
        hero.avatarSelected = true;
      } else {
        hero.avatarSelected = hero.avatarSelected === true && (pokerAvatars.isPreset(hero.avatar) || pokerAvatars.isUpload(hero.avatar));
        if (!hero.avatarSelected) hero.avatar = null;
      }
      for (const bot of state.players.slice(1)) bot.avatarGender ??= profiles[bot.id].avatarGender;
      pokerAvatars.fillBotAvatars(state.players);
      assignPositions(state);
      if (state.phase === 'betting') {
        state.handId = createId();
        prepareRunout();
      }
      onChange(state, { restored: true });
      continueTurn();
    }

    function replaceBustedBots() {
      const busted = state.players.slice(1).filter(player => player.stack === 0);
      if (!busted.length) return [];
      const available = availableBotProfiles(state.players);
      const replacements = busted.map(({ id, kind, preflopStyle }) => {
        const bot = createPlayer(takeBotProfile(available, kind), id, state.startingStack);
        if (preflopStyle) bot.preflopStyle = preflopStyle;
        state.players[id] = bot;
        return bot;
      });
      state.tableBuyIns += replacements.length * state.startingStack;
      pokerAvatars.fillBotAvatars(state.players, busted.map(player => player.avatar));
      return replacements;
    }

    function startHand() {
      if (!state || isTableClosed(state.phase)) return;
      clearTableTimers();
      state.epoch++;
      const hero = human();
      const rebuy = hero.stack === 0 ? affordableBuyIn(state.bigBlind, bankroll, state.rebuyTarget) : 0;
      if (hero.stack === 0) {
        if (!rebuy) {
          leaveTable();
          return;
        }
        bankroll -= rebuy;
        hero.stack = rebuy;
        state.heroBuyIns += rebuy;
        state.tableBuyIns += rebuy;
      }
      const newBots = replaceBustedBots();
      const live = state.players.filter(player => player.stack > 0);
      state.dealer = nextSeat(state.dealer, player => player.stack > 0);
      state.handId = createId();
      state.handNo++;
      state.phase = 'betting';
      state.runoutFrom = null;
      state.board = [];
      state.potChips = [];
      state.deck = shuffled(fullDeck());
      state.street = 'preflop';
      state.currentBet = 0;
      state.lastRaise = state.bigBlind;
      state.lastAggressor = null;
      state.summary = '';
      state.handVpip = false;
      state.handPfr = false;
      state.autoFold = false;

      for (const player of state.players) {
        player.hand = [];
        player.bet = 0;
        player.betChips = [];
        player.contributed = 0;
        player.folded = player.stack === 0;
        player.allIn = false;
        player.acted = false;
        player.canRaise = true;
        player.lastAction = null;
      }

      state.heroHand = { startingStack: hero.stack, actions: [] };
      state.stats.hands++;

      const inHand = player => !player.folded;
      state.sbSeat = live.length === 2 ? state.dealer : nextSeat(state.dealer, inHand);
      state.bbSeat = nextSeat(state.sbSeat, inHand);
      const smallBlind = state.players[state.sbSeat];
      const bigBlind = state.players[state.bbSeat];
      const smallBlindPaid = chipIn(smallBlind, state.smallBlind);
      const bigBlindPaid = chipIn(bigBlind, state.bigBlind);
      smallBlind.lastAction = { kind: 'blind', text: 'SB ' + formatAmount(smallBlindPaid) };
      bigBlind.lastAction = { kind: 'blind', text: 'BB ' + formatAmount(bigBlindPaid) };
      addLog({
        kind: 'round',
        text: `Rozdanie #${state.handNo} · SB ${formatAmount(smallBlindPaid)} · BB ${formatAmount(bigBlindPaid)}`
      });
      if (rebuy) addLog({ kind: 'notice', text: `Wpisowe z bankrolla: ${formatAmount(rebuy)}` });
      for (const bot of newBots) {
        const posted = chipIn(bot, state.bigBlind - bot.bet);
        bot.lastAction = { kind: 'blind', text: `BB ${formatAmount(bot.bet)}` };
        const verb = posted === state.bigBlind ? 'wpłaca' : 'dopłaca';
        const entry = posted ? ` i ${verb} ${formatAmount(posted)} do wejściowego BB` : ' na pozycji BB';
        addLog({ kind: 'notice', text: `${bot.name} dołącza do stołu${entry}.` });
      }

      let dealIndex = state.dealer;
      for (let round = 0; round < 2; round++) {
        for (let seat = 0; seat < live.length; seat++) {
          dealIndex = nextSeat(dealIndex, inHand);
          state.players[dealIndex].hand.push(state.deck.pop());
        }
      }
      assignPositions(state);
      state.currentBet = eligible().length > 1 ? state.bigBlind : Math.max(...live.map(player => player.bet));
      state.actor = nextSeat(state.bbSeat, player => player.hand.length === 2 && !player.allIn);

      state.dealing = true;
      const handId = state.handId;
      const { shuffle, flight, interval, settle } = dealTiming;
      const dealDuration = shuffle + flight + (live.length * 2 - 1) * interval + settle;
      onChange(state);
      dealTimer = setTimeout(() => {
        if (state.phase !== 'betting' || state.handId !== handId) return;
        dealTimer = null;
        state.dealing = false;
        prepareRunout();
        onChange(state);
        continueTurn();
      }, dealDuration);
    }

    function markHumanAction(type, need, chips, context) {
      state.heroHand.actions.push({ street: state.street, type, chips, betTo: human().bet, toCall: need, context });
      if (state.street === 'preflop' && (type === 'raise' || (type === 'call' && need > 0)) && !state.handVpip) {
        state.stats.vpip++;
        state.handVpip = true;
      }
      if (state.street === 'preflop' && type === 'raise' && !state.handPfr) {
        state.stats.pfr++;
        state.handPfr = true;
      }
      const field = { fold: 'folds', call: 'calls', check: 'checks', raise: 'raises' }[type];
      if (field) state.stats[field]++;
    }

    function toggleAutoFold() {
      if (paused || state?.phase !== 'betting' || human().hand.length !== 2 || human().folded || human().allIn) return false;
      state.autoFold = !state.autoFold;
      if (state.autoFold) continueTurn();
      return state.autoFold;
    }

    function act(actorIndex, choice) {
      if (paused || state?.phase !== 'betting' || state.dealing || actorIndex < 0 || state.actor !== actorIndex) return;
      const player = state.players[actorIndex];
      if (player.folded || player.allIn) return;

      const need = Math.max(0, state.currentBet - player.bet);
      const contributedBefore = player.contributed;
      let context;
      if (actorIndex === 0) {
        const callCost = Math.min(need, player.stack);
        context = {
          potBefore: pot(),
          contestablePot: contestablePot(player, callCost),
          callCost,
          opponents: contenders().length - 1
        };
      }
      let type = choice.type;
      let caption;
      let wager;
      if (type === 'fold') {
        player.folded = true;
        caption = 'Fold';
      } else if (type === 'call' && need > 0) {
        const chips = chipIn(player, need);
        caption = (player.allIn ? 'Call all-in ' : 'Call ') + formatAmount(chips);
      } else if (type === 'call' || type === 'check') {
        if (need !== 0) return;
        type = 'check';
        caption = 'Check';
      } else if (type === 'raise') {
        if (!player.canRaise) return;
        const max = player.bet + player.stack;
        const target = Math.floor(Number(choice.target));
        if (!Number.isFinite(target) || target <= state.currentBet || target > max) return;
        // Podbicie poniżej minimum jest możliwe przy postawieniu wszystkich żetonów.
        if (target < minRaiseTo() && target !== max) return;

        wager = wagerKind(state);
        const oldBet = state.currentBet;
        chipIn(player, target - player.bet);
        state.currentBet = player.bet;
        state.lastAggressor = actorIndex;
        const increase = state.currentBet - oldBet;
        const fullRaise = increase >= state.lastRaise;
        if (fullRaise) state.lastRaise = increase;

        // Krótki all-in daje graczom, którzy już zagrali, możliwość sprawdzenia lub spasowania.
        for (const other of eligible()) {
          if (other.id !== actorIndex && (fullRaise || other.acted)) {
            other.acted = false;
            other.canRaise = fullRaise;
          }
        }
        caption = (player.allIn ? 'All-in ' : wager === 'bet' ? 'Bet ' : 'Raise to ') + formatAmount(state.currentBet);
      } else {
        return;
      }

      if (state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (actorIndex === 0) {
        state.autoFold = false;
        markHumanAction(type, need, player.contributed - contributedBefore, context);
      }
      player.acted = true;
      player.lastAction = { kind: player.allIn ? 'all-in' : wager ?? type, text: caption };
      addLog({ playerId: player.id, playerName: displayName(player), action: player.lastAction, analysis: actorIndex !== 0 ? choice.analysis : null });
      onAction(type);

      if (contenders().length === 1) {
        awardWithoutShowdown();
        return;
      }
      const roundComplete = eligible().every(other => other.acted && other.bet === state.currentBet);
      state.actor = roundComplete ? -1 : nextSeat(actorIndex, other => other.hand.length === 2 && !other.folded && !other.allIn);
      prepareRunout();
      onChange(state);
      continueTurn();
    }

    function dealNextStreet() {
      state.deck.pop(); // Spal kartę przed odkryciem kart wspólnych.
      if (state.street === 'preflop') {
        state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
        state.street = 'flop';
      } else if (state.street === 'flop') {
        state.board.push(state.deck.pop());
        state.street = 'turn';
      } else if (state.street === 'turn') {
        state.board.push(state.deck.pop());
        state.street = 'river';
      }

      for (const player of state.players) {
        player.bet = 0;
        player.betChips = [];
        player.acted = false;
        player.canRaise = true;
        player.lastAction = null;
      }
      state.currentBet = 0;
      state.lastRaise = state.bigBlind;
      state.lastAggressor = null;
      addLog({ kind: 'round', text: state.street.toUpperCase() });

      state.actor = eligible().length < 2 ? -1 : nextSeat(state.dealer, player => player.hand.length === 2 && !player.folded && !player.allIn);
    }

    function advanceStreet() {
      if (state.street === 'river') {
        showdown();
        return;
      }
      dealNextStreet();
      onChange(state);
      continueTurn();
    }

    function skipRunout() {
      if (paused || state?.phase !== 'betting' || !state.runoutFrom) return;
      clearTimeout(state.timer);
      state.timer = null;
      state.epoch++;
      while (state.street !== 'river') dealNextStreet();
      showdown({ skippedRunout: true });
    }

    function awardWithoutShowdown() {
      const winner = contenders()[0];
      const amount = pot();
      winner.stack += amount;
      state.phase = 'finished';
      state.actor = -1;
      for (const player of state.players) {
        player.bet = 0;
        player.betChips = [];
      }
      state.summary = `${displayName(winner)} wygrywa ${formatAmount(amount)} żetonów (pozostali spasowali).`;
      addLog({ kind: 'result', text: state.summary });
      finishHand('fold', new Map([[winner.id, amount]]));
    }

    function showdown(options) {
      state.phase = 'finished';
      state.street = 'showdown';
      state.actor = -1;
      for (const player of state.players) {
        player.bet = 0;
        player.betChips = [];
        player.lastAction = null;
      }

      const scores = new Map(contenders().map(player => [player.id, score7([...player.hand, ...state.board])]));
      const contributions = state.players.map(player => player.contributed).filter(amount => amount > 0);
      const levels = [...new Set(contributions)].sort((a, b) => a - b);
      const winnings = new Map();
      let previous = 0;

      for (const level of levels) {
        const potPlayers = state.players.filter(player => player.contributed >= level);
        const amount = (level - previous) * potPlayers.length;
        previous = level;
        const able = potPlayers.filter(player => scores.has(player.id));
        if (able.length === 0) continue;

        let best = scores.get(able[0].id);
        for (const player of able.slice(1)) {
          const score = scores.get(player.id);
          if (compareScore(score, best) > 0) best = score;
        }
        const winners = able.filter(player => compareScore(scores.get(player.id), best) === 0);
        const share = Math.floor(amount / winners.length);
        let remainder = amount % winners.length;
        const seatCount = state.players.length;
        const distance = player => (player.id - state.dealer + seatCount) % seatCount;
        winners.sort((a, b) => distance(a) - distance(b));

        for (const winner of winners) {
          const award = share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder--;
          winner.stack += award;
          winnings.set(winner.id, (winnings.get(winner.id) || 0) + award);
        }
      }

      const items = [...winnings.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
      state.summary = items.map(([id, amount]) =>
        `${displayName(state.players[id])}: +${formatAmount(amount)} (${handNames[scores.get(id)[0]]})`
      ).join(' · ') || 'Remis';
      addLog({ kind: 'result', text: 'Showdown · ' + state.summary });
      finishHand('showdown', winnings, options);
    }

    function finishHand(ending, winnings, options) {
      if (state.timer !== null) clearTimeout(state.timer);
      state.timer = null;
      state.runoutFrom = null;
      const hero = human();
      state.autoFold = false;
      if (hero.stack === 0 && bankroll === 0) {
        finishTable();
      }
      if (state.heroHand) {
        const { sessionId, handNo, dealer, sbSeat, bbSeat, board, heroHand } = state;
        onHandFinished({
          id: state.handId,
          sessionId,
          handNumber: handNo,
          finishedAt: new Date().toISOString(),
          ending,
          dealerSeat: dealer,
          smallBlindSeat: sbSeat,
          bigBlindSeat: bbSeat,
          smallBlind: state.smallBlind,
          bigBlind: state.bigBlind,
          board: board.slice(),
          pot: pot(),
          hero: {
            ...heroHand,
            cards: hero.hand.slice(),
            endingStack: hero.stack,
            contributed: hero.contributed,
            payout: winnings.get(0) || 0,
            folded: hero.folded
          },
          opponents: state.players.slice(1).filter(player => player.hand.length === 2).map(player => {
            const revealed = ending === 'showdown' && !player.folded;
            return {
              seat: player.id,
              name: displayName(player),
              cards: revealed || ending === 'fold' ? player.hand.slice() : null,
              revealed
            };
          })
        });
      }
      onChange(state, { ...options, payouts: [...winnings].filter(([, amount]) => amount > 0) });
      continueTurn();
    }

    function continueTurn() {
      if (paused || !state || state.dealing) return;
      if (state.phase === 'finished' && state.timer === null) {
        const finishedState = state;
        const token = state.epoch;
        state.timer = setTimeout(() => {
          if (state === finishedState && state.epoch === token && state.phase === 'finished') startHand();
        }, nextHandDelay);
        return;
      }
      if (state.phase !== 'betting' || state.timer !== null) return;
      if (state.actor === 0) {
        if (state.autoFold) act(0, { type: 'fold' });
        return;
      }
      const actor = state.actor;
      const hand = state;
      const token = state.epoch;
      const streetWait = !state.runoutFrom ? streetDelay
        : state.street === state.runoutFrom ? runoutTiming.firstStreet : runoutTiming.nextStreet;
      state.timer = setTimeout(() => {
        if (state !== hand || state.epoch !== token || state.phase !== 'betting' || state.actor !== actor) return;
        state.timer = null;
        if (actor === -1) {
          advanceStreet();
          return;
        }
        const player = state.players[actor];
        const opponents = contenders().filter(other => other.id !== actor);
        const opponent = opponents.length === 1 ? opponents[0] : null;
        const price = Math.min(Math.max(0, state.currentBet - player.bet), player.stack);
        const choice = pokerBots.chooseAction(player, {
          board: state.board,
          opponentCount: opponents.length,
          opponentStack: opponent?.stack ?? 0,
          opponentChecked: opponent?.lastAction?.kind === 'check',
          street: state.street,
          stats: state.stats,
          heroInHand: !human().folded && human().hand.length > 0,
          lastAggressor: state.lastAggressor,
          potSize: pot(),
          contestablePot: contestablePot(player, price),
          currentBet: state.currentBet,
          lastRaise: state.lastRaise,
          minRaiseTo: minRaiseTo(),
          smallBlind: state.smallBlind,
          bigBlind: state.bigBlind
        });
        act(actor, choice);
      }, actor === -1 ? streetWait : 350 + randomIndex(320));
    }

    function estimateEquity(player, simulations) {
      return pokerBots.estimateEquity(player, state.board, contenders().length - 1, simulations);
    }

    return { newGame, resetGame, changeTable, leaveTable, startHand, act, toggleAutoFold, pause, resume, skipRunout, setHeroProfile, pot, minRaiseTo,
      bigBlindsPer100, getState: () => state, estimateEquity, saveSession, restoreSession,
      getBankroll: () => bankroll, availableBankroll };
  }

  return { createGame, formatAmount, displayName, positionsForHand, wagerKind, stakes, minPlayers, maxPlayers, defaultPlayers,
    nextHandDelay, dealTiming, runoutTiming, buyInFor, buyInRange, startingBankroll };
})();
