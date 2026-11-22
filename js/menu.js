'use strict';

function bindPokerMenu(menu, setup, game, effects, history, openProfile) {
  const sessionKey = 'poker-lab-saved-session';
  const cardBacks = new Map([
    ['four-color', 'Cztery kolory'],
    ['classic', 'Klasyczny'],
    ['noir-gold', 'Granat i złoto'],
    ['gothic', 'Gotycki'],
    ['woodcut', 'Drewniany'],
    ['cyberpunk', 'Cyberpunkowy']
  ]);
  const panels = [menu, setup];
  const historyPanel = document.querySelector('#hand-history');
  const findAction = (panel, action) => panel.querySelector(`[data-game-action="${action}"]`);
  const form = setup.querySelector('#setup-form');
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
  const backSelects = panels.map(panel => panel.querySelector('[data-card-back-select]'));

  function applyCardBack(value) {
    const back = cardBacks.has(value) ? value : 'four-color';
    document.documentElement.dataset.cardBack = back;
    for (const select of backSelects) select.value = back;
    return back;
  }

  let savedBack;
  try {
    savedBack = localStorage.getItem(cardBackKey) ?? localStorage.getItem('poker-lab-deck-theme');
  } catch {
    // Rewers można nadal przełączyć w otwartej grze.
  }
  for (const select of backSelects) {
    for (const [value, label] of cardBacks) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const back = applyCardBack(select.value);
      try {
        localStorage.setItem(cardBackKey, back);
      } catch {
        // Wybór działa także bez zapisu preferencji.
      }
    });
  }
  applyCardBack(savedBack);

  function readSavedSession() {
    try {
      return localStorage.getItem(sessionKey);
    } catch {
      return null;
    }
  }

  function showStatus(panel, message) {
    const status = panel.querySelector('[data-menu-status]');
    status.textContent = message;
    status.hidden = false;
  }

  function updateSound(enabled) {
    for (const panel of panels) {
      const sound = findAction(panel, 'sound');
      sound.setAttribute('aria-pressed', String(enabled));
      sound.title = enabled ? 'Wycisz dźwięk' : 'Włącz dźwięk';
    }
  }

  function refreshSessionActions() {
    const hasSave = Boolean(readSavedSession());
    for (const panel of panels) {
      findAction(panel, 'resume').disabled = !hasSave;
      findAction(panel, 'save').disabled = !game.getState();
    }
  }

  function closePanels() {
    menu.open = false;
    if (setup.open) setup.close();
  }

  function openSetup() {
    if (setup.open) return;
    menu.open = false;
    const state = game.getState();
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

  setup.addEventListener('close', () => {
    if (!setup.open) game.resume();
  });
  setup.querySelector('#close-setup').addEventListener('click', closePanels);
  setup.querySelector('#setup-profile').addEventListener('click', () => openProfile('setup'));
  menu.querySelector('#reset').addEventListener('click', openSetup);
  menu.querySelector('#open-profile').addEventListener('click', () => {
    menu.open = false;
    openProfile();
  });
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
  for (const panel of panels) {
    findAction(panel, 'save').addEventListener('click', () => {
      try {
        localStorage.setItem(sessionKey, game.saveSession());
        refreshSessionActions();
        showStatus(panel, 'Zapisano sesję w tej przeglądarce.');
      } catch {
        showStatus(panel, 'Zapis sesji jest niedostępny w tej przeglądarce.');
      }
    });
    findAction(panel, 'resume').addEventListener('click', () => {
      const saved = readSavedSession();
      if (!saved) {
        refreshSessionActions();
        showStatus(panel, 'Brak zapisanej sesji.');
        return;
      }
      if (game.getState() && !confirm('Wznowić zapisaną sesję i zastąpić bieżący stan gry?')) return;
      try {
        game.restoreSession(saved);
        closePanels();
        panel.querySelector('[data-menu-status]').hidden = true;
        refreshSessionActions();
      } catch {
        showStatus(panel, 'Nie można odczytać zapisanej sesji.');
      }
    });
    findAction(panel, 'history').addEventListener('click', () => {
      historyPanel.hidden = false;
      closePanels();
    });
    findAction(panel, 'export').addEventListener('click', history.download);
    findAction(panel, 'sound').addEventListener('click', () => updateSound(effects.toggleSound()));
  }
  updateSound(effects.soundEnabled());
  return openSetup;
}
