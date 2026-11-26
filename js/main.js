'use strict';

(() => {
  const historyPanel = document.querySelector('#hand-history');
  const history = createPokerHistory(state => renderHistory(state));
  const renderHistory = createPokerHistoryView(historyPanel, history);
  const root = document.querySelector('#app');
  const dismissTableTooltip = bindPokerTooltips(document.querySelector('#poker-tooltip'));
  const setupProfile = document.querySelector('#setup-profile');
  const setupPortrait = document.querySelector('#setup-portrait');
  const headerBalance = document.querySelector('#header-bankroll [data-bankroll-amount]');
  const leaveTableAction = document.querySelector('#leave-table-action');
  const endTutorialButton = document.querySelector('#end-tutorial');
  const endOnlineButton = document.querySelector('#end-online');
  const inviteOnlineButton = document.querySelector('#show-online-invite');
  const onlineStatus = document.querySelector('#online-table-status');
  const lossDialog = document.querySelector('#lossDialog');
  const acknowledgeLoss = lossDialog.querySelector('#acknowledgeLoss');
  const { formatAmount } = pokerGame;
  const effects = createPokerEffects(root);
  let training = false;
  let onlineActive = false;
  const game = pokerGame.createGame((state, options) => {
    if (!training && !onlineActive) displayGame(state, options);
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
        if (!training && !onlineActive && game.getState() === state && state.phase === 'gameover' && !lossDialog.open) lossDialog.showModal();
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
    chat.onChange(state, options.tutorial.practice ? options : { restored: true });
    const speech = options.tutorial.speech;
    if (tutorialSession !== state.sessionId || speech !== tutorialSpeech) {
      tutorialSession = state.sessionId;
      tutorialSpeech = speech;
      chat.speak(state.players[1], speech);
    }
  }, effects.onAction);
  const renderTutorial = pokerView.createView(root, tutorial.game, undefined, {
    nextHand: tutorial.next, replay: tutorial.replay, advanceOverview: tutorial.advanceOverview
  });

  const online = createPokerOnline(document.querySelector('#online-dialog'), {
    enter() {
      onlineActive = true;
      game.pause();
      if (setup.open) setup.close('online');
      document.body.classList.add('online-active');
      leaveTableAction.hidden = true;
      historyPanel.hidden = true;
      menuButton.hidden = true;
      endOnlineButton.hidden = false;
      inviteOnlineButton.hidden = false;
      chat.onChange(null);
    },
    update(state, options, message) {
      dismissTableTooltip(root);
      renderOnline(state, options);
      if (!options.restored && options.sound) effects.onAction(options.sound);
      effects.onChange(state, options);
      if (onlineStatus.textContent !== message) onlineStatus.textContent = message;
      onlineStatus.hidden = false;
    },
    leave(message) {
      onlineActive = false;
      document.body.classList.remove('online-active');
      endOnlineButton.hidden = true;
      inviteOnlineButton.hidden = true;
      onlineStatus.hidden = true;
      menuButton.hidden = false;
      restoreSetup();
      const status = setup.querySelector('[data-menu-status]');
      status.textContent = message;
      status.hidden = !message;
      setup.querySelector('#open-online').focus({ preventScroll: true });
    }
  });
  const renderOnline = pokerView.createView(root, online.game);

  function updateBankroll() {
    const amount = formatAmount(game.getBankroll());
    if (headerBalance.textContent !== amount) headerBalance.textContent = amount;
  }

  function updateSetupProfile(player) {
    const nickname = pokerProfileNickname(player);
    setupProfile.textContent = nickname || 'Podaj nick';
    setupProfile.setAttribute('aria-label', nickname ? `Wyświetl profil gracza ${nickname}` : setupProfile.textContent);
    pokerAvatars.setAvatar(setupPortrait, player.avatar);
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

  function restoreSetup() {
    const state = game.getState();
    displayGame(state, { restored: true });
    if (state && state.phase !== 'left') openSetup();
  }

  setup.querySelector('#open-online').addEventListener('click', () => online.open(profile.current().name));
  endOnlineButton.addEventListener('click', () => online.stop());
  inviteOnlineButton.addEventListener('click', () => online.openInvitation());
  const tutorialButton = setup.querySelector('#setup-tutorial');
  tutorialButton.addEventListener('click', () => {
    if (!setup.open || training || onlineActive) return;
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

  function finishTutorial() {
    if (!training) return;
    training = false;
    tutorial.game.resetGame();
    renderTutorial(null);
    document.body.classList.remove('tutorial-active');
    endTutorialButton.hidden = true;
    menuButton.hidden = false;
    restoreSetup();
    tutorialButton.focus({ preventScroll: true });
  }

  endTutorialButton.addEventListener('click', finishTutorial);
  leaveTableAction.querySelector('#leaveTable').addEventListener('click', game.leaveTable);
  profileDialog.addEventListener('close', () => {
    if (profileDialog.open) return;
    if (!setup.open) game.resume();
    const trigger = profileSource === 'setup' ? setupProfile : root.querySelector('#table-profile');
    (trigger ?? menuButton).focus({ preventScroll: true });
  });
  updateBankroll();
  openSetup();
  online.open(profile.current().name, true);

  const { rank5, score7, compareScore } = pokerCards;
  const { getState, act, newGame, startHand, estimateEquity } = game;
  window.PokerLabTest = { rank5, score7, compareScore, getState, act, newGame, startHand, estimateEquity };
})();
