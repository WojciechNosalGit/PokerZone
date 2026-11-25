'use strict';

(() => {
  const historyPanel = document.querySelector('#hand-history');
  const history = createPokerHistory(state => renderHistory(state));
  const renderHistory = createPokerHistoryView(historyPanel, history);
  const root = document.querySelector('#app');
  const dismissTableTooltip = bindPokerTooltips(document.querySelector('#poker-tooltip'));
  const setupProfile = document.querySelector('#setup-profile');
  const profileAvatar = setupProfile.querySelector('.seat-avatar');
  const profileName = setupProfile.querySelector('.header-profile-name');
  const headerBalance = document.querySelector('#header-bankroll [data-bankroll-amount]');
  const leaveTableAction = document.querySelector('#leave-table-action');
  const endTutorialButton = document.querySelector('#end-tutorial');
  const lossDialog = document.querySelector('#lossDialog');
  const acknowledgeLoss = lossDialog.querySelector('#acknowledgeLoss');
  const { formatAmount } = pokerGame;
  const effects = createPokerEffects(root);
  let training = false;
  const game = pokerGame.createGame((state, options) => {
    if (!training) displayGame(state, options);
  }, history.add, effects.onAction);

  function displayGame(state, options) {
    dismissTableTooltip(root);
    render(state, options);
    updateSetupProfile(state?.players[0] ?? profile.current());
    updateBankroll();
    leaveTableAction.hidden = !state || state.phase === 'left' || state.phase === 'gameover';
    historyPanel.hidden = !state;
    const delay = effects.onChange(state, options);
    chat.onChange(state, options);
    if (!state || state.phase === 'left') {
      if (lossDialog.open) lossDialog.close();
      openSetup(state ? 'change' : 'new');
      return;
    }
    if (state.phase === 'gameover') {
      const showLoss = () => {
        if (game.getState() === state && state.phase === 'gameover' && !lossDialog.open) lossDialog.showModal();
      };
      if (delay) setTimeout(showLoss, delay);
      else showLoss();
    } else if (lossDialog.open) {
      lossDialog.close();
    }
  }
  lossDialog.addEventListener('cancel', event => event.preventDefault());
  acknowledgeLoss.addEventListener('click', game.resetGame);
  const render = pokerView.createView(root, game, () => openProfile('table'));
  const menuButton = document.querySelector('#game-menu');
  const setup = document.querySelector('#game-setup');
  const profileDialog = document.querySelector('#player-profile');
  const chat = createPokerChat(root, document.querySelector('#table-chat-dialog'), game);
  let tutorialSpeech;
  let tutorialSession;
  const tutorial = createPokerTutorial((state, options) => {
    if (!training) return;
    dismissTableTooltip(root);
    renderTutorial(state, options);
    effects.onChange(state, options);
    chat.onChange(state, { restored: true });
    const speech = options.tutorial.speech;
    if (tutorialSession !== state.sessionId || speech !== tutorialSpeech) {
      tutorialSession = state.sessionId;
      tutorialSpeech = speech;
      chat.speak(state.players[1], speech);
    }
  }, effects.onAction, () => finishTutorial(true));
  const renderTutorial = pokerView.createView(root, tutorial.game, undefined, { nextHand: tutorial.next, replay: tutorial.replay });

  function updateBankroll() {
    const amount = formatAmount(game.getBankroll());
    if (headerBalance.textContent !== amount) headerBalance.textContent = amount;
  }

  function updateSetupProfile({ name, avatar }) {
    profileName.textContent = name;
    setupProfile.setAttribute('aria-label', `Wyświetl profil gracza ${name}`);
    pokerAvatars.setAvatar(profileAvatar, avatar);
  }

  function applyProfile(value) {
    game.setHeroProfile(value);
    const state = game.getState();
    pokerView.applyProfile(root, state);
    updateSetupProfile(state?.players[0] ?? value);
  }
  const profile = createPokerProfile(profileDialog, applyProfile);
  applyProfile(profile.current());
  let profileSource;
  function openProfile(source) {
    profileSource = source;
    game.pause();
    profile.open(game.getState()?.players[0]);
  }
  const openSetup = bindPokerMenu(menuButton, setup, game, effects, openProfile);
  const tutorialButton = setup.querySelector('#setup-tutorial');
  tutorialButton.addEventListener('click', () => {
    if (!setup.open || training) return;
    training = true;
    game.pause();
    setup.close('tutorial');
    document.body.classList.add('tutorial-active');
    leaveTableAction.hidden = true;
    endTutorialButton.hidden = false;
    menuButton.hidden = true;
    historyPanel.hidden = true;
    tutorial.start(profile.current());
    endTutorialButton.focus({ preventScroll: true });
  });

  function finishTutorial(readyToPlay = false) {
    if (!training) return;
    training = false;
    tutorial.game.resetGame();
    document.body.classList.remove('tutorial-active');
    endTutorialButton.hidden = true;
    menuButton.hidden = false;
    const state = game.getState();
    displayGame(state, { restored: true });
    if (state && state.phase !== 'left') openSetup();
    (readyToPlay ? setup.querySelector('#start-game') : tutorialButton).focus({ preventScroll: true });
  }

  endTutorialButton.addEventListener('click', () => finishTutorial());
  leaveTableAction.querySelector('#leaveTable').addEventListener('click', game.leaveTable);
  profileDialog.addEventListener('close', () => {
    if (profileDialog.open) return;
    if (!setup.open) game.resume();
    const trigger = profileSource === 'setup' ? setupProfile : root.querySelector('#table-profile');
    (trigger ?? menuButton).focus({ preventScroll: true });
  });
  updateBankroll();
  openSetup();

  const { rank5, score7, compareScore } = pokerCards;
  const { getState, act, newGame, startHand, estimateEquity } = game;
  window.PokerLabTest = { rank5, score7, compareScore, getState, act, newGame, startHand, estimateEquity };
})();
