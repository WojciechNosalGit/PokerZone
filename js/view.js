'use strict';

const pokerView = (() => {
  const { formatAmount: money, displayName, wagerKind, nextHandDelay } = pokerGame;
  const { currentHandScore, handNames } = pokerCards;
  const streetNames = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
  const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => htmlEntities[char]);
  const formatPercent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 0 }).format;
  const formatWinRate = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format;
  const suitNames = { '♥': 'hearts', '♠': 'spades', '♦': 'diamonds', '♣': 'clubs' };
  const rankLabel = rank => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' })[rank] ?? String(rank);
  const analysisPreference = 'poker-lab-show-analysis';
  const avatarHues = [38, 164, 208, 265, 321, 145, 191, 25];
  const avatarActionNames = new Map([['check', 'Check'], ['call', 'Call'], ['bet', 'Bet'], ['raise', 'Raise']]);
  const positionNames = {
    BTN: 'Dealer / Button', SB: 'Small Blind', BB: 'Big Blind', 'BTN / SB': 'Dealer / Small Blind',
    UTG: 'Under the Gun', 'UTG+1': 'Under the Gun +1', 'UTG+2': 'Under the Gun +2', HJ: 'Hijack', CO: 'Cutoff'
  };
  // Miejsca biegną od dołu wzdłuż lewego brzegu, przez górę i prawy brzeg.
  const seatOffsets = [
    [0, 1], [-0.61, 0.77], [-1, 0], [-0.64, -0.64],
    [0, -1], [0.64, -0.64], [1, 0], [0.61, 0.77]
  ];
  const fiveSeatOffsets = [
    [0, 1], [-0.91, 0.84], [-1, 0], [-0.91, -0.84],
    [0, -1], [0.91, -0.84], [1, 0], [0.91, 0.84]
  ];
  const sixSeatOffsets = [
    [0, 1], [-0.86, 0.82], [-1, 0], [-0.86, -0.82],
    [0, -1], [0.86, -0.82], [1, 0], [0.86, 0.82]
  ];
  const sevenSeatOffsets = [
    [0, 1], [-0.88, 0.89], [-1, 0], [-0.88, -0.89],
    [0, -1], [0.88, -0.89], [1, 0], [0.88, 0.89]
  ];
  const eightSeatOffsets = [
    [0, 1], [-0.88, 0.82], [-1, 0], [-0.88, -0.82],
    [0, -1], [0.88, -0.82], [1, 0], [0.88, 0.82]
  ];
  const seatOffsetsByCount = {
    5: fiveSeatOffsets,
    6: sixSeatOffsets,
    7: sevenSeatOffsets,
    8: eightSeatOffsets
  };
  const seatPositions = {
    2: [0, 4],
    3: [0, 3, 5],
    4: [0, 2, 4, 6],
    5: [0, 1, 3, 5, 7],
    6: [0, 1, 3, 4, 5, 7],
    7: [0, 1, 2, 3, 5, 6, 7],
    8: [0, 1, 2, 3, 4, 5, 6, 7]
  };

  function applyProfile(root, state, avatar) {
    const preset = pokerAvatars.isPreset(avatar) ? avatar : '';
    const uploaded = pokerAvatars.isUpload(avatar);
    root.dataset.heroAvatar = preset;
    root.classList.toggle('custom-hero-avatar', uploaded);
    root.style.setProperty('--profile-avatar', uploaded ? `url("${avatar}")` : 'none');

    const seat = root.querySelector('.hero-seat');
    if (!seat || !state) return;
    const [player] = state.players;
    pokerAvatars.setPreset(seat.querySelector('.seat-avatar'), preset || player.avatar);
    const label = player.name;
    const plate = seat.querySelector('.seat-name');
    plate.textContent = label;
    plate.title = label;
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

  function positionHTML(player, state) {
    const badges = [];
    if (player.id === state.dealer) badges.push('<span class="position-badge pos-d" title="Dealer / button">D</span>');
    if (player.id === state.sbSeat) badges.push(`<span class="position-badge pos-sb" title="Small blind ${state.smallBlind}">SB</span>`);
    if (player.id === state.bbSeat) badges.push(`<span class="position-badge pos-bb" title="Big blind ${state.bigBlind}">BB</span>`);
    return badges.join('');
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

  function tableSeatHTML(player, state, heroAvatar) {
    const amount = player.bet;
    const participating = player.hand.length === 2;
    const allIn = participating && !player.folded && player.allIn;
    const turn = state.phase === 'betting' && !state.dealing && state.actor === player.id;
    const hero = player.id === 0;
    const avatar = (hero && heroAvatar) || player.avatar;
    const preset = pokerAvatars.isPreset(avatar) ? ` data-avatar-preset="${avatar}"` : '';
    const portrait = `<span class="seat-avatar"${preset} style="--avatar-hue:${avatarHues[player.id]}" aria-hidden="true"></span>`;
    const avatarControl = hero
      ? `<button type="button" id="table-profile" class="hero-profile" aria-label="Twój profil" aria-haspopup="dialog" aria-controls="player-profile">
         ${portrait}<span class="hero-profile-label" aria-hidden="true">Profil</span>
       </button>`
      : portrait;
    const seatStatus = !participating ? 'seat-out' : player.folded ? 'spot-folded' : 'spot-active';
    const count = state.players.length;
    const position = seatPositions[count][player.id];
    const [x, y] = (seatOffsetsByCount[count] ?? seatOffsets)[position];
    const side = position === 2 || position === 6 ? 1 : 0;
    const lower = position === 1 || position === 7;
    const upper = position === 3 || position === 5;
    const top = position === 4;
    const label = escapeHTML(player.name);
    const positionLabel = player.position
      ? `<abbr title="${escapeHTML(positionNames[player.position] ?? player.position)}">${escapeHTML(player.position)}</abbr>`
      : '';
    let action = player.folded || player.lastAction?.kind === 'blind' ? null : player.lastAction;
    if (!participating) action = { kind: 'out', text: 'Poza grą' };
    const avatarAction = !allIn && avatarActionNames.get(action?.kind);
    const allInMarker = allIn ? '<span class="all-in-badge"><span class="all-in-suit" aria-hidden="true">♠</span>All-in</span>' : '';
    const wager = amount > 0
      ? `<div class="spot-chips${allIn ? ' all-in-wager' : ''}" role="group" aria-label="Stawka w obecnej rundzie: ${money(amount)} żetonów">${chipPileHTML(player.betChips)}<strong>${money(amount)}</strong>${allInMarker}</div>`
      : allInMarker;
    const roles = positionHTML(player, state);
    return `<section class="table-seat${hero ? ' hero-seat' : ''}${side ? ' side-seat' : ''}${lower ? ' lower-seat' : ''}${upper ? ' upper-seat' : ''}${top ? ' top-seat' : ''}${x > 0 ? ' avatar-left' : ''}" data-seat="${player.id}" style="--seat-x:${x}; --seat-y:${y}" aria-label="Miejsce gracza ${label}">
   <div class="bet-spot ${seatStatus} ${amount > 0 ? 'has-bet' : ''} ${turn ? 'turn' : ''}">
     ${pocketCardsHTML(player, state)}
     <div class="seat-info">
       <div class="seat-details">
         <div class="seat-name" title="${label}">${label}</div>
         <div class="money">${money(player.stack)}</div>
       </div>
       ${avatarAction ? actionLabelHTML({ kind: action.kind, text: avatarAction }, 'action-label avatar-action') : ''}
       ${avatarControl}
     </div>
     <div class="seat-position">${positionLabel}</div>
     <div class="seat-action">${allIn || avatarAction ? '' : actionLabelHTML(action)}</div>
   </div>
   ${wager ? `<div class="seat-wager">${wager}</div>` : ''}
   ${roles ? `<div class="seat-role-markers">${roles}</div>` : ''}
  </section>`;
  }

  function centerPotHTML(amount, chips, phase) {
    return `<div class="pot-display" role="group" aria-label="Pula ${money(amount)} żetonów">
   <div class="pot-chips${phase === 'betting' ? '' : ' pot-chips-settled'}" aria-hidden="true">${chipPileHTML(chips, 4)}</div>
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

  function controlsHTML(state, pot, min, outgoing) {
    const { smallBlind, bigBlind } = state;
    const player = state.players[0];
    const active = state.phase === 'betting' && player.hand.length === 2 && !player.folded && !player.allIn;
    const canAct = active && !state.dealing && state.actor === 0;
    const toCall = active ? Math.max(0, state.currentBet - player.bet) : 0;
    const max = player.bet + player.stack;
    const canRaise = canAct && player.canRaise && max > state.currentBet;
    const lowerLimit = Math.min(min, max);
    const sliderMax = max - (max - lowerLimit) % smallBlind;
    const raiseByPot = fraction => state.currentBet + Math.round(pot * fraction / smallBlind) * smallBlind;
    const preflop = state.street === 'preflop';
    const preflopTarget = Math.round(2.5 * bigBlind);
    const suggested = preflop ? preflopTarget : raiseByPot(0.5);
    const target = canRaise ? Math.min(max, Math.max(lowerLimit, suggested)) : lowerLimit;
    const presets = preflop
      ? [['2 BB', 2 * bigBlind], ['2,5 BB', preflopTarget], ['10 BB', 10 * bigBlind]]
      : [['30% puli', raiseByPot(0.3)], ['50% puli', raiseByPot(0.5)], ['70% puli', raiseByPot(0.7)]];
    presets.push(['All-in', max]);
    const complete = state.phase === 'finished' || state.phase === 'gameover';
    const concealed = complete ? 'aria-hidden="true"' : '';
    const amount = canRaise ? money(target) : outgoing?.amount ?? '';
    const callLabel = outgoing?.call ?? (active ? toCall === 0 ? 'Check' : 'Call ' + money(Math.min(toCall, player.stack)) : 'Check / Call');
    const wagerName = avatarActionNames.get(wagerKind(state));
    const raiseLabel = outgoing?.raise ?? (canRaise ? wagerName + ' ' + money(target) : wagerName);
    const slider = outgoing?.slider;
    const restart = '<button class="zone-art-button zone-new-game action-replacement" id="newSession" type="button"><img src="assets/images/zone-new-game.png" width="198" height="55" alt="Nowa gra"></button>';
    const replacement = state.phase === 'finished' ? nextHandButton : state.phase === 'gameover' && player.stack > 0 ? restart : '';
    return `<div class="raise-controls" role="group" aria-label="Wysokość stawki">
   <div class="raise-stepper">
    <button class="raise-step" type="button" id="raiseLess" aria-label="Zmniejsz stawkę o jeden small blind" disabled><span aria-hidden="true">−</span></button>
    <input id="raiseSlider" type="range" aria-label="Ustaw stawkę suwakiem" min="${slider?.min ?? lowerLimit}" max="${slider?.max ?? sliderMax}" step="${smallBlind}" value="${slider?.value ?? target}" ${canRaise && lowerLimit < sliderMax ? '' : 'disabled'}>
    <button class="raise-step" type="button" id="raiseMore" aria-label="Zwiększ stawkę o jeden small blind" disabled><span aria-hidden="true">+</span></button>
   </div>
   <output id="raiseTo" for="raiseSlider raiseLess raiseMore" aria-label="Stawka w żetonach" data-target="${target}" data-max="${max}">${escapeHTML(amount)}</output>
   <div class="raise-presets">
    ${presets.map(([label, amount]) => `<button type="button" data-raise-to="${amount}" aria-pressed="false" ${canRaise && amount >= lowerLimit && amount <= max ? '' : 'disabled'}>${label}</button>`).join('')}
   </div>
  </div><div class="action-grid${complete ? ' round-complete' : ''}${outgoing ? ' round-transition' : ''}">
   <button class="fold" id="fold" ${canAct ? '' : 'disabled'} ${concealed}>Fold</button>
   <button class="call" id="call" ${canAct ? '' : 'disabled'} ${concealed}>${escapeHTML(callLabel)}</button>
   <button class="raise" id="raise" ${canRaise ? '' : 'disabled'} ${concealed}>${escapeHTML(raiseLabel)}</button>
   ${replacement}
  </div>`;
  }

  function statusHTML(state, player) {
    if (state.phase === 'finished' || (state.phase === 'gameover' && player.stack === 0)) {
      return `<span class="result-title">${escapeHTML(state.summary)}</span>`;
    }
    if (state.phase === 'gameover') return '<span class="result-title">Zwycięstwo! Wszyscy przeciwnicy odpadli.</span>';
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

  const lossDialog = `<dialog class="loss-dialog" id="lossDialog" role="alertdialog" aria-labelledby="loss-title" aria-describedby="loss-message">
   <h2 id="loss-title">Przegrałeś</h2>
   <p id="loss-message">Skończyły Ci się żetony.</p>
   <button class="next" type="button" id="acknowledgeLoss" autofocus>OK</button>
 </dialog>`;

  function createView(root, game, openSetup, openProfile) {
    const find = selector => root.querySelector(selector);
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
      find('#newSession')?.addEventListener('click', openSetup);
      const dialog = find('#lossDialog');
      if (dialog) {
        dialog.addEventListener('cancel', event => event.preventDefault());
        find('#acknowledgeLoss').addEventListener('click', () => {
          dialog.close();
          game.newGame();
        });
      }
      if (turn) {
        find('#fold').addEventListener('click', () => game.act(0, { type: 'fold' }));
        find('#call').addEventListener('click', () => game.act(0, { type: 'call' }));
      }

      const raise = find('#raise');
      if (raise.disabled) return;
      const wagerName = avatarActionNames.get(wagerKind(game.getState()));
      const slider = find('#raiseSlider');
      const output = find('#raiseTo');
      const decrease = find('#raiseLess');
      const increase = find('#raiseMore');
      const presets = [...root.querySelectorAll('.raise-presets button')];
      const min = Number(slider.min);
      const step = Number(slider.step);
      const max = Number(output.dataset.max);
      let target = Number(output.dataset.target);

      function selectRaise(amount) {
        target = amount;
        const formatted = money(amount);
        slider.value = String(amount);
        output.value = formatted;
        raise.textContent = wagerName + ' ' + formatted;
        decrease.disabled = amount <= min;
        increase.disabled = amount >= max;
        const selected = presets.findLast(button => !button.disabled && Number(button.dataset.raiseTo) === amount);
        for (const button of presets) button.setAttribute('aria-pressed', String(button === selected));
      }

      slider.addEventListener('input', () => selectRaise(slider.valueAsNumber));
      decrease.addEventListener('click', () => selectRaise(Math.max(min, target - step)));
      increase.addEventListener('click', () => selectRaise(Math.min(max, target + step)));
      for (const button of presets) {
        button.addEventListener('click', () => selectRaise(Number(button.dataset.raiseTo)));
      }
      raise.addEventListener('click', () => game.act(0, { type: 'raise', target }));
      selectRaise(target);
    }

    return function render(state, { restored = false } = {}) {
      const sameSession = previousSessionId === state.sessionId;
      const logScroll = sameSession ? find('.log')?.scrollTop ?? 0 : 0;
      const focusedControl = ['#showAnalysis', '#table-profile', '#skip-runout'].find(selector => {
        const control = find(selector);
        return control && control === document.activeElement;
      });
      const player = state.players[0];
      const turn = state.phase === 'betting' && !state.dealing && state.actor === 0;
      const runningOut = Boolean(state.runoutFrom);
      const finished = state.phase === 'finished';
      const showHand = turn || finished || state.phase === 'gameover';
      const lost = state.phase === 'gameover' && player.stack === 0;
      const playersInGame = state.players.filter(seat => seat.stack > 0
        || (state.phase === 'betting' && seat.hand.length === 2 && seat.allIn)).length;
      const outgoing = !restored && sameSession && previousPhase === 'betting' && (finished || state.phase === 'gameover')
        ? { amount: find('#raiseTo')?.value, call: find('#call')?.textContent, raise: find('#raise')?.textContent, slider: find('#raiseSlider') } : null;
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
   ${state.players.map(seat => tableSeatHTML(seat, state, root.dataset.heroAvatar)).join('')}
   <div class="table-corner table-status" role="status">${statusHTML(state, player)}</div>
   ${showHand ? handStatusHTML(player.hand, state.board) : ''}
 </div>
 <div class="table-footer">
   <div class="controls">${controlsHTML(state, pot, game.minRaiseTo(), outgoing)}</div>
 </div>
 ${lost ? lossDialog : ''}
 </div><aside class="session-panels"><section class="panel"><h2>Twój styl gry (ta sesja)</h2>
 <div class="statline"><span>Rozdania</span><strong>${stats.hands}</strong></div>
 <div class="statline"><span title="Wynik netto w big blindach na 100 zakończonych rozdań">Wynik sesji</span><strong>${winRate === null ? '—' : formatWinRate(winRate)} BB/100</strong></div>
 <div class="statline"><span>VPIP</span><strong>${percent(stats.vpip)}</strong></div>
 <div class="statline"><span>PFR</span><strong>${percent(stats.pfr)}</strong></div>
 <div class="statline"><span>Raise / Call</span><strong>${stats.raises} / ${stats.calls}</strong></div>
 <p class="hint">VPIP: jak często dobrowolnie wchodzisz do puli przed flopem. PFR: jak często podbijasz przed flopem. Boty zaczną lekko dostosowywać decyzje po 4 rozdaniach. Pamięć działa do końca tej sesji.</p>
 </section><section class="panel log-panel" data-show-analysis="${showAnalysis}">
 <h2 id="table-actions-title">Akcje przy stole</h2>
 <label class="log-options"><input type="checkbox" id="showAnalysis" ${showAnalysis ? 'checked' : ''}> Pokaż equity i pot odds</label>
 <ol class="log" aria-labelledby="table-actions-title">${state.logs.map(logEntryHTML).join('')}</ol>
 <p class="hint log-analysis">Equity to szacowany udział w puli. Pot odds to koszt sprawdzenia w stosunku do puli po sprawdzeniu.</p>
 </section></aside></div>
 <div class="footer">D — dealer · SB — small blind · BB — big blind. Żetony przy graczach pokazują stawki bieżącej rundy i wchodzą w skład łącznej puli. Prototyp bez stawek pieniężnych. Boty stosują podstawową strategię, szacują equity i pot odds oraz dostosowują decyzje do VPIP/PFR.</div>`;
      bindControls(turn, runningOut);
      find('.log').scrollTop = logScroll;
      if (focusedControl) find(focusedControl)?.focus({ preventScroll: true });
    };
  }

  return { createView, applyProfile, cardHTML, chipPileHTML, escapeHTML, streetNames };
})();
