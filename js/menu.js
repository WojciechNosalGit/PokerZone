'use strict';

function bindPokerMenu(menu, setup, game, effects, openProfile) {
  const cardBacks = new Map([
    ['four-color', 'Cztery kolory'],
    ['classic', 'Klasyczny'],
    ['noir-gold', 'Granat i złoto'],
    ['gothic', 'Gotycki'],
    ['woodcut', 'Drewniany'],
    ['cyberpunk', 'Cyberpunkowy']
  ]);
  const panels = [menu, setup];
  const soundButtons = document.querySelectorAll('[data-game-action="sound"]');
  const historyPanel = document.querySelector('#hand-history');
  const sessionDialog = document.querySelector('#session-dialog');
  const sessions = createPokerSessions(sessionDialog, game);
  let sessionSource;
  let sessionAction;
  const findAction = (panel, action) => panel.querySelector(`[data-game-action="${action}"]`);
  const form = setup.querySelector('#setup-form');
  const closeSetupButton = setup.querySelector('#close-setup');
  const stakesSelect = setup.querySelector('#setup-stakes');
  const playerCount = setup.querySelector('#setup-players');
  const { minPlayers, maxPlayers, defaultPlayers, stakes } = pokerGame;
  for (const { smallBlind, bigBlind } of stakes) {
    const option = document.createElement('option');
    option.value = String(bigBlind);
    option.textContent = `NL ${smallBlind}/${bigBlind}`;
    stakesSelect.append(option);
  }
  stakesSelect.value = String(stakes[0].bigBlind);
  for (let count = minPlayers; count <= maxPlayers; count++) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    playerCount.append(option);
  }
  playerCount.value = String(defaultPlayers);

  const cardBackKey = 'poker-lab-card-back';
  const backSelect = menu.querySelector('[data-card-back-select]');
  const backOptions = setup.querySelector('#setup-back-options');
  const backInputs = [];

  function applyCardBack(value) {
    const back = cardBacks.has(value) ? value : 'four-color';
    document.documentElement.dataset.cardBack = back;
    backSelect.value = back;
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
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    backSelect.append(option);

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
  backSelect.addEventListener('change', rememberCardBack);
  applyCardBack(savedBack);

  function showStatus(panel, message) {
    const status = panel.querySelector('[data-menu-status]');
    status.textContent = message;
    status.hidden = false;
  }

  function updateSound(enabled) {
    for (const sound of soundButtons) {
      sound.setAttribute('aria-pressed', String(enabled));
      sound.title = enabled ? 'Wycisz dźwięk' : 'Włącz dźwięk';
    }
  }

  function refreshSessionActions() {
    const hasSave = sessions.hasSaves();
    for (const panel of panels) {
      findAction(panel, 'resume').disabled = !hasSave;
    }
    findAction(menu, 'save').disabled = !game.getState();
  }

  function closePanels() {
    menu.open = false;
    if (setup.open) setup.close();
  }

  function openSetup() {
    if (setup.open) return;
    menu.open = false;
    const state = game.getState();
    closeSetupButton.hidden = !state;
    setup.setAttribute('closedby', state ? 'closerequest' : 'none');
    if (state) {
      stakesSelect.value = String(state.bigBlind);
      playerCount.value = String(state.players.length);
    } else {
      historyPanel.hidden = true;
    }
    setup.querySelector('[data-menu-status]').hidden = true;
    refreshSessionActions();
    game.pause();
    setup.showModal();
  }

  function openSessionDialog(panel, action) {
    if (!sessions.open(action)) {
      showStatus(panel, action === 'resume' ? 'Brak zapisanych sesji.' : 'Rozpocznij grę, aby zapisać sesję.');
      refreshSessionActions();
      return;
    }
    sessionSource = panel;
    sessionAction = action;
    menu.open = false;
    game.pause();
  }

  sessionDialog.addEventListener('close', () => {
    if (sessionDialog.open) return;
    const result = sessionDialog.returnValue;
    if (!setup.open) game.resume();
    if (result === 'resumed') {
      closePanels();
      menu.querySelector('summary').focus({ preventScroll: true });
    } else {
      if (sessionSource === menu) menu.open = true;
      if (result === 'saved') showStatus(sessionSource, 'Zapisano sesję w tej przeglądarce.');
      findAction(sessionSource, sessionAction).focus({ preventScroll: true });
    }
    refreshSessionActions();
  });

  setup.addEventListener('close', () => {
    if (!setup.open && !sessionDialog.open) game.resume();
  });
  setup.addEventListener('cancel', event => {
    if (!game.getState()) event.preventDefault();
  });
  closeSetupButton.addEventListener('click', closePanels);
  setup.querySelector('#setup-profile').addEventListener('click', () => openProfile('setup'));
  menu.querySelector('#reset').addEventListener('click', openSetup);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const state = game.getState();
    if (state && state.phase !== 'gameover' && !confirm('Rozpocząć nową grę? Bieżące żetony i statystyki zostaną wyzerowane.')) return;
    game.newGame({ bigBlind: Number(stakesSelect.value), playerCount: Number(playerCount.value) });
    closePanels();
    refreshSessionActions();
  });

  menu.addEventListener('toggle', () => {
    if (menu.open) refreshSessionActions();
  });
  window.addEventListener('storage', refreshSessionActions);
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open || event.defaultPrevented) return;
    const select = event.target.closest('select');
    if (select && globalThis.CSS?.supports('selector(select:open)') && select.matches(':open')) return;
    menu.open = false;
    menu.querySelector('summary').focus();
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  findAction(menu, 'save').addEventListener('click', () => openSessionDialog(menu, 'save'));
  for (const panel of panels) {
    findAction(panel, 'resume').addEventListener('click', () => openSessionDialog(panel, 'resume'));
    findAction(panel, 'history').addEventListener('click', () => {
      historyPanel.hidden = false;
      closePanels();
    });
  }
  for (const sound of soundButtons) sound.addEventListener('click', () => updateSound(effects.toggleSound()));
  updateSound(effects.soundEnabled());
  return openSetup;
}
