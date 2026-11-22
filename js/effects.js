'use strict';

function createPokerEffects(root) {
  const sounds = {
    cards: new Audio('assets/audio/cards.wav'),
    shuffle: new Audio('assets/audio/shuffle-cue.wav'),
    dealHit: new Audio('assets/audio/deal-hit.wav'),
    fold: new Audio('assets/audio/fold.wav'),
    check: new Audio('assets/audio/check.wav'),
    chips: new Audio('assets/audio/chips.wav'),
    payout: new Audio('assets/audio/payout.wav'),
    winGame: new Audio('assets/audio/game-win.wav'),
    loseGame: new Audio('assets/audio/game-loss.wav')
  };
  const deal = pokerGame.dealTiming;
  const runout = pokerGame.runoutTiming;
  const betDuration = 230;
  const payoutDuration = 490;
  const payoutStagger = 42;
  const resultSoundDelay = 600;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  for (const sound of Object.values(sounds)) {
    sound.preload = 'auto';
    sound.volume = 0.55;
  }
  let enabled = true;
  let previous = null;

  function play(name, retryStage) {
    if (!enabled) return;
    const sound = sounds[name];
    sound.currentTime = 0;
    void sound.play().catch(error => {
      if (retryStage && error.name === 'NotAllowedError') {
        document.addEventListener('click', () => {
          if (retryStage.isConnected) play(name);
        }, { once: true });
      }
    });
  }

  function playOnTable(name, stage, delay) {
    if (delay > 0) {
      setTimeout(() => { if (stage.isConnected) play(name); }, delay);
    } else {
      play(name);
    }
  }

  function toggleSound() {
    enabled = !enabled;
    if (enabled) play('dealHit');
    else for (const sound of Object.values(sounds)) sound.pause();
    return enabled;
  }

  function onAction(type) {
    if (type === 'fold' || type === 'check') play(type);
  }

  function animateDeal(items, {
    source = root.querySelector('.deal-deck'),
    delay = 0,
    duration = 190,
    stagger = Math.min(22, 130 / Math.max(1, items.length - 1))
  } = {}) {
    const origin = source.getBoundingClientRect();
    items.forEach((item, i) => {
      const target = item.getBoundingClientRect();
      const x = origin.x + origin.width / 2 - target.x - target.width / 2;
      const y = origin.y + origin.height / 2 - target.y - target.height / 2;
      item.animate([
        { opacity: 0, transform: `translate(${x}px, ${y}px) rotate(-14deg) scale(.68)` },
        { offset: 0.55, opacity: 1, transform: `translate(${x * 0.47}px, ${y * 0.47 - 10}px) rotate(6deg)` },
        { offset: 0.9, opacity: 1, transform: 'translateY(1px) scale(1.02)' },
        { opacity: 1, transform: 'none' }
      ], { duration, delay: delay + i * stagger, easing: 'ease-out', fill: 'backwards' });
    });
  }

  function animateFold(seat) {
    const cards = root.querySelectorAll(`[data-seat="${seat}"] .pocket-cards .card`);
    cards.forEach((card, index) => {
      const inward = index === 0 ? 1 : -1;
      card.animate([
        { visibility: 'visible', opacity: 1, transform: 'none' },
        { offset: 0.22, visibility: 'visible', opacity: 1, transform: `translate(${inward * 7}%, -5%)` },
        { offset: 0.72, visibility: 'visible', opacity: 1, transform: `translate(${inward * 24}%, 50%) rotate(${inward * 5}deg) scale(.9)` },
        { visibility: 'hidden', opacity: 0, transform: `translate(${inward * 32}%, 76%) rotate(${inward * 6}deg) scale(.82)` }
      ], { duration: 270, delay: index * 28, easing: 'ease-in-out', fill: 'backwards' });
    });
  }

  function animateAvatarAction(stage, seat) {
    const badge = stage.querySelector(`[data-seat="${seat}"] .avatar-action`);
    badge?.animate([
      { opacity: 0, transform: 'translateY(125%) scale(.88)' },
      { offset: 0.83, opacity: 1, transform: 'translateY(-2px) scale(1.03)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 280, easing: 'cubic-bezier(.22,.75,.25,1)' });
  }

  function animateHandCounter(stage, previousHandNo) {
    const counter = stage.querySelector('.table-hand-cards');
    const current = counter.querySelector('strong');
    const outgoing = current.cloneNode(false);
    outgoing.classList.add('table-hand-card-outgoing');
    outgoing.textContent = previousHandNo === undefined ? '' : pokerGame.formatAmount(previousHandNo);
    counter.prepend(outgoing);

    const timing = { duration: 360, easing: 'ease-in-out' };
    const swap = outgoing.animate([
      { opacity: 1, transform: 'none', zIndex: 1 },
      { offset: 0.38, opacity: 1, transform: 'translate(-7px, -2px) rotate(-9deg)', zIndex: 1 },
      { offset: 0.67, opacity: 0.58, transform: 'translate(1px, 1px) rotate(7deg)', zIndex: 0 },
      { opacity: 0, transform: 'translate(6px, -1px) rotate(18deg)', zIndex: 0 }
    ], timing);
    current.animate([
      { opacity: 0, transform: 'translate(6px, -2px) rotate(18deg)' },
      { offset: 0.28, opacity: 0, transform: 'translate(8px, -3px) rotate(20deg)' },
      { offset: 0.69, opacity: 1, transform: 'translate(3px, -1px) rotate(6deg)' },
      { opacity: 1, transform: 'none' }
    ], timing);

    const removeOutgoing = () => outgoing.remove();
    void swap.finished.then(removeOutgoing, removeOutgoing);
  }

  function animateShowdown(players, startDelay = 0) {
    const duration = 420;
    let end = 0;
    players.forEach((player, seatIndex) => {
      const cards = root.querySelectorAll(`[data-seat="${player.id}"] .showdown-card`);
      cards.forEach((card, index) => {
        const side = index === 0 ? -1 : 1;
        const delay = startDelay + seatIndex * 42 + index * 65;
        card.animate([
          { transform: `translateY(28%) rotateY(${side * 180}deg)` },
          { offset: 0.32, transform: `translateY(-18%) rotateY(${side * 180}deg)` },
          { offset: 0.78, transform: `translateY(-12%) rotateY(${side * 10}deg)` },
          { transform: 'translateY(0) rotateY(0deg)' }
        ], { duration, delay, easing: 'ease-in-out', fill: 'backwards' });
        end = Math.max(end, delay + duration);
      });
    });
    return end;
  }

  function animateShuffle(deck) {
    const packet = deck.cloneNode(false);
    packet.classList.add('shuffle-packet');
    deck.after(packet);
    const timing = { duration: deal.shuffle, easing: 'ease-in-out' };
    deck.animate([
      { transform: 'rotate(7deg)' },
      { offset: 0.3, transform: 'translate(-10px, 3px) rotate(-11deg)' },
      { offset: 0.58, transform: 'translate(-3px, 2px) rotate(1deg)' },
      { transform: 'rotate(7deg)' }
    ], timing);
    const motion = packet.animate([
      { opacity: 0, transform: 'rotate(7deg)' },
      { offset: 0.3, opacity: 1, transform: 'translate(11px, -5px) rotate(16deg)' },
      { offset: 0.67, opacity: 1, transform: 'translate(4px, -2px) rotate(-5deg)' },
      { opacity: 0, transform: 'rotate(7deg)' }
    ], timing);
    const removePacket = () => packet.remove();
    void motion.finished.then(removePacket, removePacket);
  }

  function playDeal(state, stage, firstDeal) {
    const seats = [];
    for (let offset = 1; offset <= state.players.length; offset++) {
      const seat = (state.dealer + offset) % state.players.length;
      if (state.players[seat].hand.length) {
        seats.push(root.querySelectorAll(`[data-seat="${seat}"] .pocket-cards .card`));
      }
    }
    const cards = [...seats.map(hand => hand[0]), ...seats.map(hand => hand[1])];
    play('shuffle', firstDeal ? stage : null);
    for (let i = 0; i < cards.length; i++) {
      setTimeout(() => {
        if (stage.isConnected) play('dealHit');
      }, deal.shuffle + deal.flight + i * deal.interval - 8);
    }
    if (reducedMotion.matches) return;
    animateDeal(cards, { delay: deal.shuffle, duration: deal.flight, stagger: deal.interval });
    animateShuffle(root.querySelector('.deal-deck'));
  }

  function flyOnTable(stage, source, destination, markup, duration, delay = 0) {
    if (!source || !destination) return;
    const origin = source.getBoundingClientRect();
    const target = destination.getBoundingClientRect();
    const table = stage.getBoundingClientRect();
    const dx = target.x + target.width / 2 - origin.x - origin.width / 2;
    const dy = target.y + target.height / 2 - origin.y - origin.height / 2;
    const lift = Math.min(65, 18 + Math.hypot(dx, dy) / 10);
    const flight = document.createElement('div');
    flight.className = 'table-flight';
    flight.setAttribute('aria-hidden', 'true');
    flight.style.left = `${origin.x + origin.width / 2 - table.x}px`;
    flight.style.top = `${origin.y + origin.height / 2 - table.y}px`;
    flight.innerHTML = markup;
    stage.append(flight);
    const motion = flight.animate([
      { opacity: 0, transform: 'scale(.8)' },
      { opacity: 1, transform: `translate(${dx * 0.52}px, ${dy * 0.52 - lift}px) rotate(-12deg) scale(1.13)`, offset: 0.52 },
      { opacity: 0.7, transform: `translate(${dx}px, ${dy}px) scale(.92)` }
    ], { duration, delay, fill: 'backwards', easing: 'ease-out' });
    const removeFlight = () => flight.remove();
    void motion.finished.then(removeFlight, removeFlight);
  }

  function onChange(state, { restored = false, skippedRunout = false, payouts = [] } = {}) {
    const firstDeal = previous === null;
    const previousHandNo = previous?.handNo;
    const newHand = state.phase !== 'gameover'
      && (!previous || previous.sessionId !== state.sessionId || previous.handNo !== state.handNo);
    const gameEnded = state.phase === 'gameover'
      && (previous?.sessionId !== state.sessionId || previous?.phase !== 'gameover');
    const boardStart = newHand ? 0 : previous?.boardLength ?? 0;
    const boardChanged = state.board.length > boardStart;
    const animateBoard = boardChanged && !skippedRunout;
    const bets = newHand || !previous ? [] : state.players
      .map(player => [player, player.contributed - previous.contributions[player.id]])
      .filter(([, amount]) => amount > 0);
    const folds = newHand || !previous ? [] : state.players.filter(player =>
      player.id !== 0 && player.hand.length === 2 && player.folded && !previous.folded[player.id]);
    const changedActions = newHand || !previous ? [] : state.players.filter(player =>
      player.lastAction && player.lastAction !== previous.actions[player.id]);
    const newAllIns = state.players.filter(player => player.allIn && (newHand || !previous?.allIn[player.id]));
    const startingRunout = state.runoutFrom && (newHand || !previous?.runoutFrom);
    const regularShowdown = !newHand && previous && !previous.runoutFrom
      && state.street === 'showdown' && previous.street !== 'showdown';
    const reveals = startingRunout || regularShowdown
      ? state.players.filter(player => player.id !== 0 && player.hand.length === 2 && !player.folded) : [];
    previous = {
      sessionId: state.sessionId,
      handNo: state.handNo,
      phase: state.phase,
      street: state.street,
      runoutFrom: state.runoutFrom,
      boardLength: state.board.length,
      contributions: state.players.map(player => player.contributed),
      folded: state.players.map(player => player.folded),
      allIn: state.players.map(player => player.allIn),
      actions: state.players.map(player => player.lastAction)
    };

    if (restored) return 0;
    const stage = root.querySelector('.felt');
    const motionEnabled = !reducedMotion.matches;
    if (newHand) playDeal(state, stage, firstDeal);
    else if (startingRunout && reveals.length && motionEnabled) {
      playOnTable('cards', stage, runout.revealDelay);
    } else if (boardChanged || reveals.length) play('cards');
    if (bets.length) play('chips');
    const revealDuration = motionEnabled ? animateShowdown(reveals, startingRunout ? runout.revealDelay : 0) : 0;
    const payoutDelay = Math.max(revealDuration, animateBoard ? 320 : bets.length ? betDuration : 0);
    const payoutEnd = motionEnabled && payouts.length
      ? payoutDelay + payoutDuration + (payouts.length - 1) * payoutStagger : 0;
    if (payouts.length) playOnTable('payout', stage, payoutDelay);
    if (gameEnded) {
      const cue = state.players[0].stack > 0 ? 'winGame' : 'loseGame';
      const delay = payouts.length ? Math.max(payoutEnd, payoutDelay + resultSoundDelay) : 0;
      playOnTable(cue, stage, delay);
    }
    if (!motionEnabled) return 0;
    if (newHand) animateHandCounter(stage, previousHandNo);
    for (const player of folds) animateFold(player.id);
    for (const player of changedActions) animateAvatarAction(stage, player.id);
    if (animateBoard) {
      const timing = state.runoutFrom ? { duration: runout.flight, stagger: runout.interval } : undefined;
      animateDeal([...root.querySelectorAll('.board .card:not(.blank)')].slice(boardStart), timing);
    }
    const potChips = stage.querySelector('.pot-chips');
    const seatInfo = id => stage.querySelector(`[data-seat="${id}"] .seat-info`);
    for (const [player, amount] of bets) {
      const wager = player.bet > 0 ? stage.querySelector(`[data-seat="${player.id}"] .spot-chips .chip-pile`) : null;
      flyOnTable(stage, seatInfo(player.id), wager || potChips, pokerView.chipPileHTML(pokerChips.forAmount(amount)), betDuration);
      if (!player.allIn) wager?.animate([{ opacity: 0 }, { opacity: 0 }], { duration: betDuration });
    }
    for (const player of newAllIns) {
      const marker = stage.querySelector(`[data-seat="${player.id}"] .all-in-badge`);
      const source = seatInfo(player.id);
      if (marker && source) animateDeal([marker], { source, duration: betDuration, delay: 70 });
    }
    if (payouts.length) {
      if (payoutDelay > 0) potChips.animate([{ opacity: 1 }, { opacity: 1 }], { duration: payoutDelay });
      pokerChips.forPayouts(state.potChips, payouts).forEach(([seat, chips], index) => {
        flyOnTable(stage, potChips, seatInfo(seat), pokerView.chipPileHTML(chips), payoutDuration, payoutDelay + index * payoutStagger);
      });
    }
    return payoutEnd;
  }

  return { onChange, onAction, toggleSound, soundEnabled: () => enabled };
}
