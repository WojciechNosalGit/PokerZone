'use strict';

const pokerView = (() => {
  const { formatAmount: money, displayName, wagerKind, nextHandDelay } = pokerGame;
  const { currentHandScore, handNames } = pokerCards;
  const streetNames = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
  const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => htmlEntities[char]);
  const formatPercent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 0 }).format;
  const formatWinRate = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format;
  const formatBigBlinds = value => `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} BB`;
  const defaultRaiseBigBlinds = 3;
  const suitNames = { '♥': 'hearts', '♠': 'spades', '♦': 'diamonds', '♣': 'clubs' };
  const rankLabel = rank => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' })[rank] ?? String(rank);
  const analysisPreference = 'poker-lab-show-analysis';
  const avatarActionNames = new Map([['check', 'Check'], ['call', 'Call'], ['bet', 'Bet'], ['raise', 'Raise']]);
  const positionNames = {
    BTN: 'Dealer / Button', SB: 'Small Blind', BB: 'Big Blind', 'BTN / SB': 'Dealer / Small Blind',
    UTG: 'Under the Gun', 'UTG+1': 'Under the Gun +1', 'UTG+2': 'Under the Gun +2', HJ: 'Hijack', CO: 'Cutoff'
  };
  // Każdy stołek ma stałe miejsce, licząc od gracza przez lewy i górny brzeg.
  const seatClasses = [
    'hero-seat', 'lower-seat', 'side-seat', 'upper-seat', 'top-seat',
    'upper-seat right-seat', 'side-seat right-seat', 'lower-seat right-seat'
  ];
  const seatPositions = {
    2: [0, 4],
    3: [0, 3, 5],
    4: [0, 2, 4, 6],
    5: [0, 1, 3, 5, 7],
    6: [0, 1, 3, 4, 5, 7],
    7: [0, 1, 2, 3, 5, 6, 7],
    8: [0, 1, 2, 3, 4, 5, 6, 7]
  };

  function applyProfile(root, state) {
    const seat = root.querySelector('.hero-seat');
    if (!seat || !state) return;
    const [player] = state.players;
    pokerAvatars.setAvatar(seat.querySelector('.seat-avatar'), player.avatar);
    const label = player.name;
    const plate = seat.querySelector('.seat-name');
    plate.textContent = label;
    plate.dataset.tooltip = label;
    seat.setAttribute('aria-label', `Miejsce gracza ${label}`);
    seat.querySelector('.pocket-cards')?.setAttribute('aria-label', `Karty gracza ${label}`);
  }

  function cardHTML(card) {
    if (card === null) return '<div class="card blank" aria-label="Karta jeszcze nieodkryta"></div>';
    if (card === 'back') return '<div class="card back" aria-label="Karta zakryta"></div>';
    const rank = rankLabel(card.r);
    const red = card.s === '♥' || card.s === '♦';
    const safeRank = escapeHTML(rank);
    const safeSuit = escapeHTML(card.s);
    return `<div class="card face${red ? ' red' : ''}" data-suit="${suitNames[card.s] || ''}" aria-label="${safeRank} ${safeSuit}">
      <span class="rank">${safeRank}</span><span class="suit">${safeSuit}</span>
    </div>`;
  }

  function pocketCardsHTML(player, state) {
    if (!player.hand.length) return '<div class="pocket-space" aria-hidden="true"></div>';
    const showdown = player.id !== 0 && (state.runoutFrom || state.street === 'showdown') && !player.folded;
    const reveal = player.id === 0 || showdown;
    const cards = player.hand.map(card => showdown
      ? `<div class="showdown-card">${cardHTML(card)}<div class="showdown-back" aria-hidden="true">${cardHTML('back')}</div></div>`
      : cardHTML(reveal ? card : 'back')).join('');
    const appearance = showdown ? ' pocket-showdown' : reveal ? '' : ' pocket-covered';
    const hidden = player.id !== 0 && player.folded ? ' aria-hidden="true"' : '';
    return `<div class="cards pocket-cards${appearance}" role="group" aria-label="Karty gracza ${escapeHTML(player.name)}"${hidden}>${cards}</div>`;
  }

  function chipPileHTML(chips, maxStacks = 3) {
    const chipsPerStack = 5;
    const visible = [...chips].sort((a, b) => b - a).slice(0, maxStacks * chipsPerStack);
    const stacks = [];
    for (let offset = 0; offset < visible.length; offset += chipsPerStack) {
      const stack = visible.slice(offset, offset + chipsPerStack);
      const discs = stack.map((value, level) =>
        `<span class="chip-disc" data-denomination="${value}" style="--chip-level:${level}"></span>`).join('');
      stacks.push(`<span class="chip-stack" style="--stack-levels:${stack.length - 1}">${discs}</span>`);
    }
    return `<span class="chip-pile" aria-hidden="true">${stacks.join('')}</span>`;
  }

  const wagerChipPositions = [
    [-0.47, -0.35], [0.45, 0.29], [-1.41, 0.34], [1.43, -0.32],
    [0.49, -0.38], [-0.49, 0.39], [-1.43, -0.32], [1.42, 0.36]
  ];

  function chipScatterHTML(chips) {
    const capacity = wagerChipPositions.length;
    const overflow = Math.max(0, chips.length - capacity);
    const discs = wagerChipPositions.slice(0, chips.length).map(([x, y], slot) => {
      // Przy większej stawce zostaw na filcu pierwsze żetony i te dorzucone ostatnio.
      const index = slot < capacity / 2 ? slot : slot + overflow;
      return `<span class="wager-chip" data-chip-index="${index}" style="--chip-x:${x};--chip-y:${y}"><span class="chip-disc" data-denomination="${chips[index]}"></span></span>`;
    });
    return `<span class="chip-scatter" aria-hidden="true">${discs.join('')}</span>`;
  }

  function actionLabelHTML(action, className = 'action-label') {
    return action ? `<span class="${className}" data-action="${escapeHTML(action.kind)}">${escapeHTML(action.text)}</span>` : '';
  }

  function logEntryHTML(entry) {
    if (!entry.action) {
      return `<li class="log-entry log-event log-${escapeHTML(entry.kind)}">${escapeHTML(entry.text)}</li>`;
    }
    const details = entry.analysis ? `<div class="log-analysis"><span>Equity <strong>${formatPercent(entry.analysis.equity)}</strong></span><span>Pot odds <strong>${formatPercent(entry.analysis.potOdds)}</strong></span></div>` : '';
    return `<li class="log-entry">
     <div class="log-action"><strong>${escapeHTML(entry.playerName)}</strong>${actionLabelHTML(entry.action)}</div>
     ${details}
    </li>`;
  }

  function tableSeatHTML(player, state) {
    const hero = player.id === 0;
    const participating = player.hand.length === 2;
    if (!hero && !participating) return '';

    const amount = player.bet;
    const allIn = participating && !player.folded && player.allIn;
    const turn = state.phase === 'betting' && !state.dealing && state.actor === player.id;
    const preset = pokerAvatars.isPreset(player.avatar) ? ` data-avatar-preset="${player.avatar}"` : '';
    const portrait = `<span class="seat-avatar"${preset} aria-hidden="true"></span>`;
    const avatarControl = hero
      ? `<div class="hero-tools">
         <button type="button" id="table-profile" class="hero-profile" aria-label="Twój profil" aria-haspopup="dialog" aria-controls="player-profile" data-tooltip="Profil">
           ${portrait}<span class="zone-tooltip hero-profile-label" aria-hidden="true">Profil</span>
         </button>
         <button type="button" id="write-chat" class="zone-tooltip hero-chat-button" aria-haspopup="dialog" aria-controls="table-chat-dialog">Napisz</button>
       </div>`
      : portrait;
    const seatStatus = player.folded ? 'spot-folded' : 'spot-active';
    const position = seatPositions[state.players.length][player.id];
    const label = escapeHTML(player.name);
    const positionLabel = player.position
      ? `<abbr tabindex="0" data-tooltip="${escapeHTML(positionNames[player.position] ?? player.position)}">${escapeHTML(player.position)}</abbr>`
      : '';
    const action = player.folded || player.lastAction?.kind === 'blind' ? null : player.lastAction;
    const avatarAction = !allIn && avatarActionNames.get(action?.kind);
    const allInMarker = allIn ? '<span class="all-in-badge"><span class="all-in-suit" aria-hidden="true">♠</span>All-in</span>' : '';
    const wager = amount > 0
      ? `<div class="spot-chips${allIn ? ' all-in-wager' : ''}" role="group" aria-label="Stawka w obecnej rundzie: ${money(amount)} żetonów">${chipScatterHTML(player.betChips)}<strong>${money(amount)}</strong>${allInMarker}</div>`
      : allInMarker;
    const dealer = player.id === state.dealer;
    return `<section class="table-seat ${seatClasses[position]}" data-seat="${player.id}" aria-label="Miejsce gracza ${label}">
   <div class="bet-spot ${seatStatus} ${amount > 0 ? 'has-bet' : ''} ${turn ? 'turn' : ''}">
     ${pocketCardsHTML(player, state)}
     <div class="seat-info">
       <div class="seat-details">
         <div class="seat-name" data-tooltip="${label}">${label}</div>
         <div class="money">${money(player.stack)}</div>
       </div>
       ${avatarAction ? actionLabelHTML({ kind: action.kind, text: avatarAction }, 'action-label avatar-action') : ''}
       ${avatarControl}
     </div>
     <div class="seat-position">${positionLabel}</div>
     <div class="seat-action">${allIn || avatarAction ? '' : actionLabelHTML(action)}</div>
   </div>
   ${wager ? `<div class="seat-wager">${wager}</div>` : ''}
   ${dealer ? '<div class="seat-role-markers"><span class="position-badge pos-d" tabindex="0" data-tooltip="Dealer / button">D</span></div>' : ''}
  </section>`;
  }

  function centerPotHTML(amount, chips, phase) {
    const settled = phase !== 'betting';
    return `<div class="pot-display${settled ? ' pot-display-settled' : ''}" role="group" aria-label="Pula ${money(amount)} żetonów">
   <div class="pot-chips${settled ? ' pot-chips-settled' : ''}" aria-hidden="true">${chipPileHTML(chips, 4)}</div>
   <span class="pot-label" aria-hidden="true">Pula</span>
   <strong class="pot-value">${money(amount)}</strong>
  </div>`;
  }

  const nextHandButton = `<button class="next-hand action-replacement" id="nextHand" type="button" style="--next-hand-delay:${nextHandDelay}ms">
   Następne rozdanie <span aria-hidden="true">→</span>
   <svg class="next-hand-outline" aria-hidden="true">
     <path class="next-hand-track"/>
     <path class="next-hand-progress" pathLength="100"/>
   </svg>
  </button>`;

  function layoutNextHandOutline(button) {
    const { clientWidth: width, clientHeight: height } = button;
    if (width <= 2 || height <= 2) return;
    const right = width - 1;
    const bottom = height - 1;
    const radius = Math.min(8, (width - 2) / 2, (height - 2) / 2);
    const corner = `A ${radius} ${radius} 0 0 1`;
    const path = [
      `M ${width / 2} 1 H ${right - radius} ${corner} ${right} ${1 + radius}`,
      `V ${bottom - radius} ${corner} ${right - radius} ${bottom}`,
      `H ${1 + radius} ${corner} 1 ${bottom - radius}`,
      `V ${1 + radius} ${corner} ${1 + radius} 1 Z`
    ].join(' ');
    for (const outline of button.querySelectorAll('.next-hand-outline path')) outline.setAttribute('d', path);
  }

  function controlsHTML(state, pot, min, outgoing, returning) {
    const { smallBlind, bigBlind } = state;
    const player = state.players[0];
    const active = state.phase === 'betting' && player.hand.length === 2 && !player.folded && !player.allIn;
    const canAct = active && !state.dealing && state.actor === 0;
    const toCall = active ? Math.max(0, state.currentBet - player.bet) : 0;
    const max = player.bet + player.stack;
    const canRaise = canAct && player.canRaise && max > state.currentBet;
    const lowerLimit = Math.min(min, max);
    const target = Math.min(max, Math.max(lowerLimit, defaultRaiseBigBlinds * bigBlind));
    const alignedLimits = lowerLimit % smallBlind === 0 && max % smallBlind === 0;
    const chipRange = outgoing?.slider ?? { min: lowerLimit, max, step: alignedLimits ? smallBlind : 'any', value: target };
    const blindRange = outgoing?.blindSlider ?? {
      min: lowerLimit / bigBlind,
      max: max / bigBlind,
      step: alignedLimits ? smallBlind / bigBlind : 'any',
      value: target / bigBlind
    };
    const customBlinds = Number(blindRange.value);
    const raiseByPot = fraction => Math.round((state.currentBet + pot * fraction) / smallBlind) * smallBlind;
    const preflop = state.street === 'preflop';
    const preflopTarget = Math.round(2.5 * bigBlind);
    const presets = preflop
      ? [['2 BB', 2 * bigBlind], ['2,5 BB', preflopTarget], [formatBigBlinds(customBlinds), Math.round(customBlinds * bigBlind)]]
      : [['30% puli', raiseByPot(0.3)], ['50% puli', raiseByPot(0.5)], ['70% puli', raiseByPot(0.7)]];
    presets.push(['All-in', max]);
    const complete = state.phase === 'finished' || state.phase === 'gameover';
    const concealed = complete ? 'aria-hidden="true"' : '';
    const amount = canRaise ? money(target) : outgoing?.amount ?? '';
    const callLabel = outgoing?.call ?? (active ? toCall === 0 ? 'Check' : 'Call ' + money(Math.min(toCall, player.stack)) : 'Check / Call');
    const wagerName = avatarActionNames.get(wagerKind(state));
    const raiseLabel = outgoing?.raise ?? (canRaise ? wagerName + ' ' + money(target) : wagerName);
    const replacement = state.phase === 'finished' ? nextHandButton : '';

    function stepperHTML(suffix, label, stepLabel, range) {
      const showBlinds = suffix && !preflop;
      return `<div class="raise-stepper${suffix ? ' raise-stepper-secondary' : ''}">
        <button class="raise-step" type="button" id="raiseLess${suffix}" aria-label="Zmniejsz stawkę ${stepLabel}" disabled><span aria-hidden="true">−</span></button>
        <input id="raiseSlider${suffix}" type="range" aria-label="${label}" ${suffix ? `aria-valuetext="${formatBigBlinds(customBlinds)}"` : ''} min="${range.min}" max="${range.max}" step="${range.step}" value="${range.value}" ${canRaise && Number(range.min) < Number(range.max) ? '' : 'disabled'}>
        <button class="raise-step" type="button" id="raiseMore${suffix}" aria-label="Zwiększ stawkę ${stepLabel}" disabled><span aria-hidden="true">+</span></button>
        ${showBlinds ? `<output id="raiseBlindValue" for="raiseSliderSecondary">${formatBigBlinds(customBlinds)}</output>` : ''}
      </div>`;
    }

    return `<div class="raise-controls" role="group" aria-label="Wysokość stawki">
   ${stepperHTML('', 'Stawka w żetonach', 'o jeden small blind', chipRange)}
   <output id="raiseTo" for="raiseSlider raiseSliderSecondary raiseLess raiseMore raiseLessSecondary raiseMoreSecondary" aria-label="Stawka w żetonach">${escapeHTML(amount)}</output>
   ${stepperHTML('Secondary', 'Stawka w big blindach', 'w big blindach', blindRange)}
   <div class="raise-presets">
    ${presets.map(([label, amount], index) => `<button type="button" ${preflop && index === 2 ? 'id="raiseBlindPreset"' : ''} data-raise-to="${amount}" aria-pressed="false" ${canRaise && amount >= lowerLimit && amount <= max ? '' : 'disabled'}>${label}</button>`).join('')}
   </div>
  </div><div class="action-grid${complete ? ' round-complete' : ''}${outgoing ? ' round-transition' : ''}${returning ? ' round-start' : ''}">
   <button class="fold" id="fold" aria-pressed="${state.foldPending}" data-tooltip="Spasuj, gdy nadejdzie Twoja kolej." ${active ? '' : 'disabled'} ${concealed}>Fold<span class="fold-pending-indicator" aria-hidden="true">✓</span></button>
   <button class="call" id="call" ${canAct ? '' : 'disabled'} ${concealed}>${escapeHTML(callLabel)}</button>
   <button class="raise" id="raise" ${canRaise ? '' : 'disabled'} ${concealed}>${escapeHTML(raiseLabel)}</button>
   ${replacement}
  </div>`;
  }

  function statusHTML(state, player) {
    if (state.phase === 'finished' || state.phase === 'gameover') {
      return `<span class="result-title">${escapeHTML(state.summary)}</span>`;
    }
    if (state.dealing) return 'Tasowanie i rozdawanie kart…';
    if (state.phase !== 'betting') return 'Przygotowanie rozdania';
    if (state.runoutFrom) return '<button class="skip-runout" id="skip-runout" type="button">Pomiń animację</button>';
    if (state.actor === -1) return state.street === 'river' ? 'Showdown…' : 'Odkrywanie kart wspólnych…';
    if (state.actor !== 0) return `Ruch: <strong>${escapeHTML(displayName(state.players[state.actor]))}</strong> analizuje rozdanie…`;
    const toCall = Math.min(Math.max(0, state.currentBet - player.bet), player.stack);
    return `<strong>Twoja kolej.</strong> Wybierz ruch. Do sprawdzenia: <strong>${money(toCall)}</strong>`;
  }

  function handStatusHTML(hand, board) {
    const score = currentHandScore(hand, board);
    if (!score) return '';
    const [kind, high, second] = score;
    const ranks = kind === 2 || kind === 6 ? `${rankLabel(high)} i ${rankLabel(second)}` : rankLabel(high);
    const name = kind === 8 && high === 14 ? 'Poker królewski' : `${handNames[kind]} (${ranks})`;
    return `<span class="table-corner hand-status">Układ <strong>${name}</strong></span>`;
  }

  function createView(root, game, openProfile) {
    const find = selector => root.querySelector(selector);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const outlineResize = typeof ResizeObserver === 'function'
      ? new ResizeObserver(entries => entries.forEach(({ target }) => layoutNextHandOutline(target))) : null;
    let showAnalysis = false;
    let previousSessionId;
    let previousPhase;
    try {
      showAnalysis = localStorage.getItem(analysisPreference) === 'true';
    } catch {
      // Widoczność można zmienić także wtedy, gdy przeglądarka blokuje zapis preferencji.
    }

    function bindControls(turn, runningOut) {
      find('#table-profile').addEventListener('click', openProfile);
      if (runningOut) {
        find('.felt').addEventListener('click', event => {
          const button = event.target.closest('button');
          if (!button || button.id === 'skip-runout') game.skipRunout();
        });
      }
      const analysis = find('#showAnalysis');
      analysis.addEventListener('change', () => {
        showAnalysis = analysis.checked;
        find('.log-panel').dataset.showAnalysis = String(showAnalysis);
        try {
          localStorage.setItem(analysisPreference, String(showAnalysis));
        } catch {
          // Ustawienie nadal działa dla otwartej gry.
        }
      });
      const nextHand = find('#nextHand');
      if (nextHand) {
        layoutNextHandOutline(nextHand);
        outlineResize?.observe(nextHand);
        nextHand.addEventListener('click', () => {
          if (game.getState().phase === 'finished') game.startHand();
        });
      }
      if (turn) find('#call').addEventListener('click', () => game.act(0, { type: 'call' }));
      const fold = find('#fold');
      fold.addEventListener('click', () => fold.setAttribute('aria-pressed', String(game.requestFold())));

      const raise = find('#raise');
      if (raise.disabled) return;
      const state = game.getState();
      const { smallBlind: step, bigBlind } = state;
      const wagerName = avatarActionNames.get(wagerKind(state));
      const slider = find('#raiseSlider');
      const blindSlider = find('#raiseSliderSecondary');
      const output = find('#raiseTo');
      const blindPreset = find('#raiseBlindPreset');
      const blindValue = find('#raiseBlindValue');
      const decrease = find('#raiseLess');
      const increase = find('#raiseMore');
      const blindDecrease = find('#raiseLessSecondary');
      const blindIncrease = find('#raiseMoreSecondary');
      const presets = [...root.querySelectorAll('.raise-presets button')];
      const min = Number(slider.min);
      const max = Number(slider.max);
      let target = slider.valueAsNumber;

      function selectRaise(amount) {
        target = Math.min(max, Math.max(min, amount));
        const formatted = money(target);
        const blinds = target / bigBlind;
        const blindLabel = formatBigBlinds(blinds);
        slider.value = String(target);
        blindSlider.value = String(blinds);
        blindSlider.setAttribute('aria-valuetext', blindLabel);
        output.value = formatted;
        raise.textContent = wagerName + ' ' + formatted;
        decrease.disabled = blindDecrease.disabled = target <= min;
        increase.disabled = blindIncrease.disabled = target >= max;
        if (blindPreset) {
          blindPreset.textContent = blindLabel;
          blindPreset.dataset.raiseTo = String(target);
        } else {
          blindValue.value = blindLabel;
        }
        const selected = presets.findLast(button => button !== blindPreset && !button.disabled && Number(button.dataset.raiseTo) === target) ?? blindPreset;
        for (const button of presets) button.setAttribute('aria-pressed', String(button === selected));
      }

      function snapRaise(amount) {
        const lower = Math.max(min, Math.floor(amount / step) * step);
        const upper = Math.min(max, Math.ceil(amount / step) * step);
        selectRaise(amount - lower < upper - amount ? lower : upper);
      }

      function stepRaise(direction) {
        const currentStep = direction > 0 ? Math.floor(target / step) : Math.ceil(target / step);
        selectRaise((currentStep + direction) * step);
      }

      for (const button of [decrease, blindDecrease]) button.addEventListener('click', () => stepRaise(-1));
      for (const button of [increase, blindIncrease]) button.addEventListener('click', () => stepRaise(1));
      slider.addEventListener('input', () => snapRaise(slider.valueAsNumber));
      blindSlider.addEventListener('input', () => snapRaise(blindSlider.valueAsNumber * bigBlind));
      if (slider.step === 'any') {
        // Nieregularne minimum lub all-in nadal pozwala używać strzałek co small blind.
        const directions = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
        for (const range of [slider, blindSlider]) range.addEventListener('keydown', event => {
          const direction = directions[event.key];
          if (!direction) return;
          event.preventDefault();
          stepRaise(direction);
        });
      }
      for (const button of presets) {
        button.addEventListener('click', () => selectRaise(Number(button.dataset.raiseTo)));
      }
      raise.addEventListener('click', () => game.act(0, { type: 'raise', target }));
      selectRaise(target);
    }

    return function render(state, { restored = false } = {}) {
      if (!state || state.phase === 'left') {
        outlineResize?.disconnect();
        previousSessionId = undefined;
        previousPhase = undefined;
        root.replaceChildren();
        return;
      }
      const sameSession = previousSessionId === state.sessionId;
      const logScroll = sameSession ? find('.log')?.scrollTop ?? 0 : 0;
      const focusedControl = ['#showAnalysis', '#table-profile', '#write-chat', '#skip-runout', '#fold'].find(selector => {
        const control = find(selector);
        return control && control === document.activeElement;
      });
      const player = state.players[0];
      const turn = state.phase === 'betting' && !state.dealing && state.actor === 0;
      const runningOut = Boolean(state.runoutFrom);
      const finished = state.phase === 'finished';
      const showHand = turn || finished || state.phase === 'gameover';
      const playersInGame = state.players.filter(seat => seat.stack > 0
        || (state.phase === 'betting' && seat.hand.length === 2 && seat.allIn)).length;
      const outgoing = !restored && sameSession && previousPhase === 'betting' && (finished || state.phase === 'gameover')
        ? {
          amount: find('#raiseTo')?.value, call: find('#call')?.textContent, raise: find('#raise')?.textContent,
          slider: find('#raiseSlider'), blindSlider: find('#raiseSliderSecondary')
        } : null;
      const previousNextHand = !restored && sameSession && previousPhase === 'finished'
        && state.phase === 'betting' && !reducedMotion.matches ? find('#nextHand') : null;
      const departingNextHand = previousNextHand?.cloneNode(true);
      if (departingNextHand) {
        const progress = getComputedStyle(previousNextHand.querySelector('.next-hand-progress')).strokeDashoffset;
        departingNextHand.querySelector('.next-hand-progress').style.strokeDashoffset = progress;
        departingNextHand.removeAttribute('id');
        departingNextHand.setAttribute('aria-hidden', 'true');
        departingNextHand.disabled = true;
        departingNextHand.classList.add('next-hand-outgoing');
      }
      previousSessionId = state.sessionId;
      previousPhase = state.phase;
      const pot = game.pot();
      const stats = state.stats;
      const winRate = game.bigBlindsPer100();
      const percent = count => stats.hands ? Math.round(count / stats.hands * 100) + '%' : '—';
      outlineResize?.disconnect();
      root.innerHTML = `<div class="layout"><div class="table-panel">
 <div class="felt" data-seats="${state.players.length}"${runningOut ? ' data-runout' : ''} role="group" aria-label="Stół pokerowy">
   <div class="table-corner table-round">
     <span class="table-hand-cards" role="img" aria-label="Rozdanie ${state.handNo}"><strong aria-hidden="true">${money(state.handNo)}</strong></span>
     <span class="table-stakes">NL ${state.smallBlind}/${state.bigBlind}</span>
   </div>
   <div class="table-corner table-players" role="img" aria-label="Gracze w grze: ${playersInGame}">
     <span class="table-player-icon" aria-hidden="true"></span><strong aria-hidden="true">${playersInGame}</strong>
   </div>
   <div class="felt-center">
     <div class="board-meta">
       ${centerPotHTML(pot, state.potChips, state.phase)}
       <div class="street">${streetNames[state.street] || ''}</div>
     </div>
     <div class="board-row"><div class="board">${Array.from({ length: 5 }, (_, i) => cardHTML(state.board[i] || null)).join('')}</div><div class="deal-deck card back" aria-hidden="true"></div></div>
   </div>
   ${state.players.map(seat => tableSeatHTML(seat, state)).join('')}
   <div class="table-corner table-status" role="status">${statusHTML(state, player)}</div>
   ${showHand ? handStatusHTML(player.hand, state.board) : ''}
 </div>
 <div class="table-footer">
   <div class="controls zone-surface">${controlsHTML(state, pot, game.minRaiseTo(), outgoing, Boolean(departingNextHand))}</div>
 </div>
 </div><aside class="session-panels"><section class="panel"><h2>Twój styl gry (ta sesja)</h2>
 <div class="statline"><span>Rozdania</span><strong>${stats.hands}</strong></div>
 <div class="statline"><span tabindex="0" data-tooltip="Wynik netto w big blindach na 100 zakończonych rozdań">Wynik sesji</span><strong>${winRate === null ? '—' : formatWinRate(winRate)} BB/100</strong></div>
 <div class="statline"><span>VPIP</span><strong>${percent(stats.vpip)}</strong></div>
 <div class="statline"><span>PFR</span><strong>${percent(stats.pfr)}</strong></div>
 <div class="statline"><span>Raise / Call</span><strong>${stats.raises} / ${stats.calls}</strong></div>
 <p class="hint">VPIP: jak często dobrowolnie wchodzisz do puli przed flopem. PFR: jak często podbijasz przed flopem. Boty zaczną lekko dostosowywać decyzje po 4 rozdaniach. Pamięć działa do końca tej sesji.</p>
 </section><section class="panel log-panel" data-show-analysis="${showAnalysis}">
 <h2 id="table-actions-title">Akcje przy stole</h2>
 <label class="log-options"><input type="checkbox" id="showAnalysis" ${showAnalysis ? 'checked' : ''}> Pokaż equity i pot odds</label>
 <ol class="log" aria-labelledby="table-actions-title">${state.logs.map(logEntryHTML).join('')}</ol>
 <p class="hint log-analysis">Equity to szacowany udział w puli. Pot odds to koszt sprawdzenia w stosunku do puli po sprawdzeniu.</p>
 </section></aside></div>`;
      pokerAvatars.setAvatar(find('.hero-seat .seat-avatar'), player.avatar);
      if (departingNextHand) {
        departingNextHand.addEventListener('animationend', () => departingNextHand.remove(), { once: true });
        departingNextHand.addEventListener('animationcancel', () => departingNextHand.remove(), { once: true });
        find('.action-grid').append(departingNextHand);
      }
      bindControls(turn, runningOut);
      find('.log').scrollTop = logScroll;
      if (focusedControl) find(focusedControl)?.focus({ preventScroll: true });
    };
  }

  return { createView, applyProfile, cardHTML, chipPileHTML, escapeHTML, streetNames };
})();
