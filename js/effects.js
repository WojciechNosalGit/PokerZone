'use strict';

function createPokerEffects(root) {
  const sounds = {
    uiClick: new Audio('assets/audio/ui-click.wav'),
    cards: new Audio('assets/audio/cards.wav'),
    shuffle: new Audio('assets/audio/shuffle-cue.wav'),
    dealHit: new Audio('assets/audio/deal-hit.wav'),
    fold: new Audio('assets/audio/fold.wav'),
    check: new Audio('assets/audio/check.wav'),
    chips: new Audio('assets/audio/chips.wav'),
    payout: new Audio('assets/audio/payout.wav'),
    loseGame: new Audio('assets/audio/game-loss.wav')
  };
  const deal = pokerGame.dealTiming;
  const runout = pokerGame.runoutTiming;
  const betDuration = 315;
  const payoutDuration = 490;
  const payoutStagger = 42;
  const potFadeDuration = 150;
  const resultSoundDelay = 600;
  const entryEasing = 'cubic-bezier(.22,.75,.25,1)';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  for (const sound of Object.values(sounds)) {
    sound.preload = 'auto';
    sound.volume = 0.55;
  }
  sounds.uiClick.volume = 0.24;
  sounds.dealHit.volume = 0.38;
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

  // Przechwycenie kliknięcia działa także podczas wymiany kontrolek przy każdym ruchu.
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const control = event.target.closest('button, a[href], summary, select, input:not([type="hidden"]), .felt[data-runout]');
    if (control && !control.matches(':disabled, [aria-disabled="true"]')) play('uiClick');
  }, true);

  function playOnTable(name, stage, delay) {
    if (delay > 0) {
      setTimeout(() => { if (stage.isConnected) play(name); }, delay);
    } else {
      play(name);
    }
  }

  function toggleSound() {
    enabled = !enabled;
    if (enabled) play('uiClick');
    else for (const sound of Object.values(sounds)) sound.pause();
    return enabled;
  }

  function onAction(type) {
    if (type === 'fold' || type === 'check') play(type);
  }

  function animateEntry(element, { from = 'translateY(5px)', duration = 145, delay = 0 } = {}) {
    element?.animate([
      { opacity: 0, transform: from },
      { opacity: 1, transform: 'none' }
    ], { duration, delay, easing: entryEasing, fill: 'backwards' });
  }

  function animateTableChanges(stage, before, current, { newHand, newLogs }) {
    const sameSession = before?.sessionId === current.sessionId;
    if (!sameSession) {
      animateEntry(stage, { from: 'none', duration: 185 });
      animateEntry(root.querySelector('.table-footer'));
      animateEntry(root.querySelector('.session-panels'));
    }

    let delay = 0;
    for (const [seat, name] of current.occupiedSeats) {
      if (sameSession && before.occupiedSeats.get(seat) === name) continue;
      const place = stage.querySelector(`[data-seat="${seat}"]`);
      const offset = place.matches('.top-seat, .upper-seat') ? -9 : 9;
      animateEntry(place.querySelector('.seat-info'), { from: `translateY(${offset}px) scale(.96)`, duration: 190, delay });
      delay += 16;
    }

    if (newHand || !sameSession) {
      for (const marker of stage.querySelectorAll('.seat-role-markers, .seat-wager')) {
        animateEntry(marker, { from: 'translateY(4px) scale(.94)', delay: 60 });
      }
    }
    if (current.status !== before?.status) animateEntry(stage.querySelector('.table-status'));
    if (current.handStatus !== before?.handStatus) animateEntry(stage.querySelector('.hand-status'));
    if (newLogs > 0) {
      const rows = root.querySelector('.log').children;
      for (let index = 0; index < newLogs; index++) animateEntry(rows[index]);
    }
  }

  function centerOf(element) {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  }

  function animateDeal(items, {
    source = root.querySelector('.deal-deck'),
    delay = 0,
    duration = 190,
    stagger = Math.min(22, 130 / Math.max(1, items.length - 1))
  } = {}) {
    const origin = centerOf(source);
    items.forEach((item, i) => {
      const target = centerOf(item);
      const x = origin.x - target.x;
      const y = origin.y - target.y;
      item.animate([
        { opacity: 0, transform: `translate(${x}px, ${y}px) rotate(-14deg) scale(.68)` },
        { offset: 0.55, opacity: 1, transform: `translate(${x * 0.47}px, ${y * 0.47 - 10}px) rotate(6deg)` },
        { offset: 0.9, opacity: 1, transform: 'translateY(1px) scale(1.02)' },
        { opacity: 1, transform: 'none' }
      ], { duration, delay: delay + i * stagger, easing: 'ease-out', fill: 'backwards' });
    });
  }

  function animateWagerChips(chips, source) {
    if (!source) return;
    const origin = centerOf(source);
    chips.forEach((chip, index) => {
      const target = centerOf(chip);
      const x = origin.x - target.x;
      const y = origin.y - target.y;
      chip.animate([
        { opacity: 0, transform: `translate(${x}px, ${y}px)` },
        { offset: 0.14, opacity: 1 },
        { opacity: 1, transform: 'none' }
      ], { duration: 245, delay: index * 9, easing: 'ease-out', fill: 'backwards' });
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
    ], { duration: 280, easing: entryEasing });
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
    const sweepRates = [0.96, 1.03, 0.94, 1];
    for (let i = 0; i < cards.length; i += 2) {
      setTimeout(() => {
        if (!stage.isConnected) return;
        sounds.dealHit.playbackRate = sweepRates[(i / 2) % sweepRates.length];
        play('dealHit');
      }, deal.shuffle + deal.flight + i * deal.interval - 8);
    }
    if (reducedMotion.matches) return;
    animateDeal(cards, { delay: deal.shuffle, duration: deal.flight, stagger: deal.interval });
    animateShuffle(root.querySelector('.deal-deck'));
  }

  function flyOnTable(stage, source, destination, markup, duration, delay = 0) {
    if (!source || !destination) return;
    const origin = centerOf(source);
    const target = centerOf(destination);
    const table = stage.getBoundingClientRect();
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const lift = Math.min(65, 18 + Math.hypot(dx, dy) / 10);
    const flight = document.createElement('div');
    flight.className = 'table-flight';
    flight.setAttribute('aria-hidden', 'true');
    flight.style.left = `${origin.x - table.x}px`;
    flight.style.top = `${origin.y - table.y}px`;
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
    if (!state || state.phase === 'left') {
      previous = null;
      return 0;
    }
    const stage = root.querySelector('.felt');
    const motionEnabled = !reducedMotion.matches;
    const firstDeal = previous === null;
    const sameSession = previous?.sessionId === state.sessionId;
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
    const current = {
      sessionId: state.sessionId,
      handNo: state.handNo,
      phase: state.phase,
      street: state.street,
      runoutFrom: state.runoutFrom,
      boardLength: state.board.length,
      contributions: state.players.map(player => player.contributed),
      folded: state.players.map(player => player.folded),
      allIn: state.players.map(player => player.allIn),
      actions: state.players.map(player => player.lastAction),
      occupiedSeats: new Map(state.players.filter(player => player.id === 0 || player.hand.length === 2)
        .map(player => [player.id, player.id === 0 ? '' : player.name])),
      status: stage.querySelector('.table-status').textContent,
      handStatus: stage.querySelector('.hand-status')?.textContent,
      latestLog: state.logs[0]
    };
    if (motionEnabled) {
      const newLogs = sameSession && !restored ? state.logs.indexOf(previous.latestLog) : 0;
      animateTableChanges(stage, previous, current, { newHand, newLogs });
    }
    previous = current;

    if (restored) return 0;
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
      const delay = payouts.length ? Math.max(payoutEnd, payoutDelay + resultSoundDelay) : 0;
      playOnTable('loseGame', stage, delay);
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
      const addedChips = pokerChips.forAmount(amount);
      const wager = stage.querySelector(`[data-seat="${player.id}"] .chip-scatter`);
      if (wager) {
        const firstAdded = player.betChips.length - addedChips.length;
        const thrown = Array.from(wager.children).filter(chip => Number(chip.dataset.chipIndex) >= firstAdded);
        animateWagerChips(thrown, seatInfo(player.id));
      } else {
        flyOnTable(stage, seatInfo(player.id), potChips, pokerView.chipPileHTML(addedChips), betDuration);
      }
    }
    for (const player of newAllIns) {
      const marker = stage.querySelector(`[data-seat="${player.id}"] .all-in-badge`);
      const source = seatInfo(player.id);
      if (marker && source) animateDeal([marker], { source, duration: betDuration - 70, delay: 70 });
    }
    if (payouts.length) {
      if (payoutDelay > 0) potChips.animate([{ opacity: 1 }, { opacity: 1 }], { duration: payoutDelay });
      stage.querySelector('.pot-display').animate([
        { visibility: 'visible', opacity: 1 },
        { visibility: 'visible', opacity: 1, offset: 1 - potFadeDuration / payoutEnd },
        { visibility: 'visible', opacity: 0 }
      ], { duration: payoutEnd });
      pokerChips.forPayouts(state.potChips, payouts).forEach(([seat, chips], index) => {
        flyOnTable(stage, potChips, seatInfo(seat), pokerView.chipPileHTML(chips), payoutDuration, payoutDelay + index * payoutStagger);
      });
    }
    return payoutEnd;
  }

  return { onChange, onAction, toggleSound, soundEnabled: () => enabled };
}
