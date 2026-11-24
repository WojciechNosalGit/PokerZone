'use strict';

function bindPokerMenu(menuButton, setup, game, effects, openProfile) {
  const cardBacks = new Map([
    ['four-color', 'Cztery kolory'],
    ['classic', 'Klasyczny'],
    ['noir-gold', 'Granat i złoto'],
    ['gothic', 'Gotycki'],
    ['woodcut', 'Drewniany'],
    ['cyberpunk', 'Cyberpunkowy']
  ]);
  const soundButton = setup.querySelector('#setup-sound');
  const historyPanel = document.querySelector('#hand-history');
  const sessionDialog = document.querySelector('#session-dialog');
  const confirmation = document.querySelector('#confirm-dialog');
  const confirmProceed = confirmation.querySelector('#confirm-action');
  const sessions = createPokerSessions(sessionDialog, game, confirmAction);
  let pendingConfirmation;
  let sessionTrigger;
  let changingTable = false;
  const form = setup.querySelector('#setup-form');
  const setupTitle = setup.querySelector('#setup-title');
  const setupStatus = setup.querySelector('[data-menu-status]');
  const closeSetupButton = setup.querySelector('#close-setup');
  const saveButton = setup.querySelector('#save-session');
  const resumeButton = setup.querySelector('#setup-resume');
  const changeTableButton = setup.querySelector('#change-table');
  const selectedStake = setup.querySelector('#setup-stakes');
  const stakeList = setup.querySelector('#setup-stake-options');
  const balanceDisplay = setup.querySelector('#setup-bankroll [data-bankroll-amount]');
  const startButton = setup.querySelector('#start-game');
  const startLabel = startButton.querySelector('#setup-start-label');
  const playerCount = setup.querySelector('#setup-players');
  const playerCountDisplay = setup.querySelector('#setup-player-count');
  const playerIconRow = setup.querySelector('#setup-player-icons');
  const fewerPlayers = setup.querySelector('#setup-players-less');
  const morePlayers = setup.querySelector('#setup-players-more');
  const { minPlayers, maxPlayers, defaultPlayers, stakes, buyInFor, buyInWithFunds, formatAmount, startingBankroll } = pokerGame;
  const playerIcons = Array.from({ length: maxPlayers }, () => {
    const icon = document.createElement('span');
    icon.className = 'table-player-icon';
    icon.hidden = true;
    return icon;
  });
  playerIconRow.append(...playerIcons);
  const setupFunds = () => changingTable ? game.availableBankroll() : startingBankroll;
  const stakeOptions = stakes.map(({ smallBlind, bigBlind }) => {
    const buyIn = buyInFor(bigBlind);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stake-choice';
    button.textContent = `NL ${smallBlind}/${bigBlind}`;
    button.dataset.bigBlind = String(bigBlind);
    button.addEventListener('click', () => {
      if (buyInWithFunds(bigBlind, setupFunds())) selectedStake.value = String(bigBlind);
      refreshStakes();
    });
    stakeList.append(button);
    return { button, bigBlind, buyIn };
  });
  playerCount.min = String(minPlayers);
  playerCount.max = String(maxPlayers);
  playerCount.value = String(defaultPlayers);
  playerCount.addEventListener('input', updatePlayerCount);
  fewerPlayers.addEventListener('click', () => {
    playerCount.stepDown();
    updatePlayerCount();
  });
  morePlayers.addEventListener('click', () => {
    playerCount.stepUp();
    updatePlayerCount();
  });

  function updatePlayerCount() {
    const count = playerCount.valueAsNumber;
    playerCountDisplay.textContent = String(count);
    playerIcons.forEach((icon, index) => { icon.hidden = index >= count; });
    fewerPlayers.disabled = count <= minPlayers;
    morePlayers.disabled = count >= maxPlayers;
  }

  const cardBackKey = 'poker-lab-card-back';
  const backOptions = setup.querySelector('#setup-back-options');
  const backInputs = [];

  function applyCardBack(value) {
    const back = cardBacks.has(value) ? value : 'four-color';
    document.documentElement.dataset.cardBack = back;
    for (const input of backInputs) input.checked = input.value === back;
    return back;
  }

  let savedBack;
  try {
    savedBack = localStorage.getItem(cardBackKey) ?? localStorage.getItem('poker-lab-deck-theme');
  } catch {
    // Rewers można nadal przełączyć w otwartej grze.
  }
  function rememberCardBack(event) {
    const back = applyCardBack(event.currentTarget.value);
    try {
      localStorage.setItem(cardBackKey, back);
    } catch {
      // Wybór działa także bez zapisu preferencji.
    }
  }
  for (const [value, label] of cardBacks) {
    const tile = document.createElement('label');
    tile.className = 'setup-back-option';
    const input = document.createElement('input');
    input.className = 'zone-visually-hidden';
    input.type = 'radio';
    input.name = 'cardBack';
    input.value = value;
    input.addEventListener('change', rememberCardBack);
    backInputs.push(input);

    const preview = document.createElement('span');
    preview.className = 'card back setup-back-preview';
    preview.dataset.backPreview = value;
    preview.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.textContent = label;
    tile.append(input, preview, caption);
    backOptions.append(tile);
  }
  applyCardBack(savedBack);

  async function confirmAction(title, message, action) {
    if (pendingConfirmation && (confirmation.open || await pendingConfirmation)) return false;
    if (confirmation.open) return false;
    confirmation.querySelector('#confirm-title').textContent = title;
    confirmation.querySelector('#confirm-message').textContent = message;
    confirmProceed.textContent = action;
    confirmation.returnValue = '';
    pendingConfirmation = new Promise(resolve => {
      confirmation.addEventListener('close', () => {
        pendingConfirmation = null;
        resolve(confirmation.returnValue === 'confirm');
      }, { once: true });
    });
    confirmation.showModal();
    return pendingConfirmation;
  }

  function showStatus(message) {
    setupStatus.textContent = message;
    setupStatus.hidden = false;
  }

  function updateSound(enabled) {
    soundButton.setAttribute('aria-pressed', String(enabled));
    soundButton.dataset.tooltip = enabled ? 'Wycisz dźwięk' : 'Włącz dźwięk';
  }

  function refreshSessionActions() {
    const inGame = Boolean(game.getState());
    resumeButton.disabled = !sessions.hasSaves();
    saveButton.hidden = saveButton.disabled = !inGame;
    changeTableButton.hidden = changeTableButton.disabled = !inGame;
  }

  function refreshStakes() {
    const available = setupFunds();
    const canAfford = option => buyInWithFunds(option.bigBlind, available) > 0;
    const selection = stakeOptions.find(option => option.bigBlind === Number(selectedStake.value) && canAfford(option))
      ?? stakeOptions.find(canAfford);
    selectedStake.value = selection ? String(selection.bigBlind) : '';
    startButton.disabled = !selection;
    balanceDisplay.textContent = formatAmount(available);
    for (const option of stakeOptions) {
      const locked = !canAfford(option);
      option.button.setAttribute('aria-disabled', String(locked));
      option.button.setAttribute('aria-pressed', String(option === selection));
      if (locked) option.button.dataset.tooltip = `Musisz uzbierać ${formatAmount(option.buyIn)}.`;
      else delete option.button.dataset.tooltip;
    }
  }

  function openSetup(mode = 'new') {
    const state = game.getState();
    const change = mode === 'change' && Boolean(state);
    changingTable = change;
    setupTitle.textContent = change ? 'Zmień stół' : 'Nowa gra';
    startLabel.textContent = change ? 'Zagraj przy tym stole' : 'Rozpocznij grę';
    changeTableButton.textContent = change ? 'Nowa gra' : 'Zmień stół';
    const canReturn = state && state.phase !== 'left';
    closeSetupButton.hidden = !canReturn;
    setup.setAttribute('closedby', canReturn ? 'closerequest' : 'none');
    selectedStake.value = String(change && state.phase === 'left' ? state.bigBlind : stakes[0].bigBlind);
    playerCount.value = String(change ? state.players.length : defaultPlayers);
    if (!state) historyPanel.hidden = true;
    setupStatus.hidden = true;
    updatePlayerCount();
    refreshStakes();
    refreshSessionActions();
    game.pause();
    if (!setup.open) setup.showModal();
  }

  function openSessionDialog(action, trigger) {
    if (!sessions.open(action)) {
      showStatus(action === 'resume' ? 'Brak zapisanych sesji.' : 'Rozpocznij grę, aby zapisać sesję.');
      refreshSessionActions();
      return;
    }
    sessionTrigger = trigger;
    game.pause();
  }

  sessionDialog.addEventListener('close', () => {
    if (sessionDialog.open) return;
    const result = sessionDialog.returnValue;
    if (!setup.open) game.resume();
    if (result === 'resumed') {
      if (game.getState()?.phase === 'left') {
        openSetup('change');
        startButton.focus({ preventScroll: true });
      } else {
        setup.close();
        menuButton.focus({ preventScroll: true });
      }
    } else {
      if (result === 'saved') showStatus('Zapisano sesję w tej przeglądarce.');
      sessionTrigger.focus({ preventScroll: true });
    }
    refreshSessionActions();
  });

  setup.addEventListener('close', () => {
    if (!setup.open && !sessionDialog.open) game.resume();
  });
  setup.addEventListener('cancel', event => {
    const state = game.getState();
    if (!state || state.phase === 'left') event.preventDefault();
  });
  closeSetupButton.addEventListener('click', () => setup.close());
  setup.querySelector('#setup-profile').addEventListener('click', () => openProfile('setup'));
  menuButton.addEventListener('click', () => openSetup(game.getState()?.phase === 'left' ? 'change' : 'new'));
  changeTableButton.addEventListener('click', () => openSetup(changingTable ? 'new' : 'change'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const stake = stakeOptions.find(option => option.bigBlind === Number(selectedStake.value));
    if (!stake || !buyInWithFunds(stake.bigBlind, setupFunds())) {
      refreshStakes();
      return;
    }
    const state = game.getState();
    const change = changingTable;
    const players = playerCount.valueAsNumber;

    if (change && (state.phase === 'betting' || state.phase === 'finished')) {
      const accepted = await confirmAction('Zmienić stół?', 'Żetony poza pulą wrócą na saldo, z którego zostanie pobrane nowe wpisowe.', 'Zmień stół');
      if (!accepted) return;
    } else if (!change && state && !sessions.hasCurrentSave()) {
      const accepted = await confirmAction('Niezapisany postęp', 'Twój aktualny postęp zostanie utracony.', 'Rozpocznij bez zapisu');
      if (!accepted) return;
    }

    if (!setup.open || changingTable !== change || game.getState() !== state || !buyInWithFunds(stake.bigBlind, setupFunds())) {
      refreshStakes();
      return;
    }
    const start = change ? game.changeTable : game.newGame;
    start({ bigBlind: stake.bigBlind, playerCount: players });
    setup.close();
    refreshSessionActions();
  });

  window.addEventListener('storage', refreshSessionActions);
  saveButton.addEventListener('click', () => openSessionDialog('save', saveButton));
  resumeButton.addEventListener('click', () => openSessionDialog('resume', resumeButton));
  setup.querySelector('#open-history').addEventListener('click', () => {
    historyPanel.hidden = false;
    setup.close();
  });
  soundButton.addEventListener('click', () => updateSound(effects.toggleSound()));
  updateSound(effects.soundEnabled());
  return openSetup;
}
