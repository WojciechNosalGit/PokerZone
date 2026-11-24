'use strict';

const pokerGame = (() => {
  const START_STACK = 1000;
  const stakes = [
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
    { name: 'Ada', kind: 'tight' },
    { name: 'Bartek', kind: 'loose' },
    { name: 'Chris', kind: 'balanced' },
    { name: 'Daria', kind: 'balanced' },
    { name: 'Emil', kind: 'tight' },
    { name: 'Franek', kind: 'loose' },
    { name: 'Gosia', kind: 'balanced' }
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

  function createState(playerCount, blinds) {
    return {
      sessionId: createId(),
      ...blinds,
      handId: null,
      players: profiles.slice(0, playerCount).map((profile, id) => ({
        ...profile,
        id,
        stack: START_STACK,
        hand: [],
        bet: 0,
        betChips: [],
        contributed: 0,
        folded: false,
        allIn: false,
        acted: false,
        canRaise: true,
        lastAction: null
      })),
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
      dealing: false,
      runoutFrom: null,
      timer: null,
      epoch: 0
    };
  }

  function createGame(onChange, onHandFinished = () => {}, onAction = () => {}) {
    let state = null;
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

    function prepareRunout() {
      if (state.runoutFrom || contenders().length < 2) return;
      const actors = eligible();
      if (actors.length > 1 || actors.some(player => player.bet < state.currentBet)) return;
      state.actor = -1;
      state.runoutFrom = state.street;
    }

    function setHeroProfile({ name, avatar }) {
      heroProfile = { name, avatar: pokerAvatars.isPreset(avatar) || pokerAvatars.isUpload(avatar) ? avatar : '' };
      if (state) {
        applyHeroProfile();
        pokerAvatars.fillSeatAvatars(state.players);
      }
    }

    function applyHeroProfile() {
      if (!heroProfile) return;
      const player = human();
      player.name = heroProfile.name;
      if (heroProfile.avatar || player.avatarSelected) player.avatar = heroProfile.avatar || null;
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
      return (settledStack - START_STACK) * 100 / (state.bigBlind * completed);
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

    function newGame({ playerCount = state?.players.length ?? defaultPlayers, bigBlind = state?.bigBlind ?? stakes[0].bigBlind } = {}) {
      const blinds = stakes.find(stake => stake.bigBlind === bigBlind);
      if (!Number.isInteger(playerCount) || playerCount < minPlayers || playerCount > maxPlayers
        || !blinds) throw new RangeError('Nieprawidłowe ustawienia stołu.');
      if (state?.timer) clearTimeout(state.timer);
      state = createState(playerCount, blinds);
      applyHeroProfile();
      pokerAvatars.fillSeatAvatars(state.players);
      addLog({ kind: 'notice', text: `Nowa sesja · ${playerCount} graczy · NL ${blinds.smallBlind}/${blinds.bigBlind} · ${START_STACK} żetonów na gracza` });
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
      const { timer, epoch, dealing, runoutFrom, ...snapshot } = state;
      return JSON.stringify({ version: 2, snapshot });
    }

    function restoreSession(serialized) {
      const { version, snapshot } = JSON.parse(serialized);
      const blinds = stakes.find(stake => stake.bigBlind === (snapshot?.bigBlind ?? stakes[0].bigBlind));
      if ((version !== 1 && version !== 2) || typeof snapshot?.sessionId !== 'string'
        || !['betting', 'finished', 'gameover'].includes(snapshot.phase)
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
      const totalPot = snapshot.players.reduce((sum, player) => sum + player.contributed, 0);
      if (totalPot > snapshot.players.length * START_STACK) throw new Error('Nieobsługiwany zapis sesji.');
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
      if (state?.timer) clearTimeout(state.timer);
      if (dealTimer !== null) clearTimeout(dealTimer);
      dealTimer = null;
      const { level, ...saved } = snapshot;
      state = { ...saved, ...blinds, dealing: false, runoutFrom: null, timer: null, epoch: (state?.epoch ?? 0) + 1 };
      const hero = human();
      // Starszy zapis trzymał wybrany awatar gracza osobno, w ustawieniach profilu.
      if (version === 1 && heroProfile?.avatar) {
        hero.avatar = heroProfile.avatar;
        hero.avatarSelected = true;
      } else {
        hero.avatarSelected = hero.avatarSelected === true && (pokerAvatars.isPreset(hero.avatar) || pokerAvatars.isUpload(hero.avatar));
      }
      pokerAvatars.fillSeatAvatars(state.players);
      assignPositions(state);
      if (state.phase === 'betting') {
        state.handId = createId();
        prepareRunout();
      }
      onChange(state, { restored: true });
      continueTurn();
    }

    function startHand() {
      if (!state || state.phase === 'gameover') return;
      if (state.timer) clearTimeout(state.timer);
      if (dealTimer !== null) clearTimeout(dealTimer);
      dealTimer = null;
      state.timer = null;
      state.epoch++;
      const live = state.players.filter(player => player.stack > 0);
      if (human().stack === 0 || live.length < 2) {
        state.phase = 'gameover';
        state.dealing = false;
        onChange(state);
        return;
      }

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

      let dealIndex = state.dealer;
      for (let round = 0; round < 2; round++) {
        for (let seat = 0; seat < live.length; seat++) {
          dealIndex = nextSeat(dealIndex, player => player.stack > 0);
          state.players[dealIndex].hand.push(state.deck.pop());
        }
      }
      const hero = human();
      state.heroHand = hero.hand.length === 2 ? { startingStack: hero.stack, actions: [] } : null;
      if (state.heroHand) state.stats.hands++;

      state.sbSeat = live.length === 2 ? state.dealer : nextSeat(state.dealer, player => player.hand.length === 2);
      state.bbSeat = nextSeat(state.sbSeat, player => player.hand.length === 2);
      assignPositions(state);
      const smallBlind = state.players[state.sbSeat];
      const bigBlind = state.players[state.bbSeat];
      chipIn(smallBlind, state.smallBlind);
      chipIn(bigBlind, state.bigBlind);
      smallBlind.lastAction = { kind: 'blind', text: 'SB ' + formatAmount(smallBlind.bet) };
      bigBlind.lastAction = { kind: 'blind', text: 'BB ' + formatAmount(bigBlind.bet) };
      state.currentBet = Math.max(smallBlind.bet, bigBlind.bet);
      state.actor = nextSeat(state.bbSeat, player => player.hand.length === 2 && !player.allIn);
      addLog({
        kind: 'round',
        text: `Rozdanie #${state.handNo} · SB ${formatAmount(smallBlind.bet)} · BB ${formatAmount(bigBlind.bet)}`
      });

      state.dealing = true;
      const handId = state.handId;
      const { shuffle, flight, interval, settle } = dealTiming;
      const dealDuration = shuffle + flight + (live.length * 2 - 1) * interval + settle;
      onChange(state);
      dealTimer = setTimeout(() => {
        if (state.handId !== handId) return;
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
      if (hero.stack === 0 || state.players.slice(1).every(player => player.stack === 0)) {
        state.phase = 'gameover';
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
      if (state.phase !== 'betting' || state.actor === 0 || state.timer !== null) return;
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
        const price = Math.min(Math.max(0, state.currentBet - player.bet), player.stack);
        const choice = pokerBots.chooseAction(player, {
          board: state.board,
          opponentCount: contenders().length - 1,
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

    return { newGame, startHand, act, pause, resume, skipRunout, setHeroProfile, pot, minRaiseTo,
      bigBlindsPer100, getState: () => state, estimateEquity, saveSession, restoreSession };
  }

  return { createGame, formatAmount, displayName, positionsForHand, wagerKind, stakes, minPlayers, maxPlayers, defaultPlayers, nextHandDelay, dealTiming, runoutTiming };
})();
