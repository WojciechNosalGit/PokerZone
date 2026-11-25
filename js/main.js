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
  const lossDialog = document.querySelector('#lossDialog');
  const acknowledgeLoss = lossDialog.querySelector('#acknowledgeLoss');
  const { formatAmount } = pokerGame;
  const effects = createPokerEffects(root);
  const game = pokerGame.createGame((state, options) => {
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
  }, history.add, effects.onAction);
  lossDialog.addEventListener('cancel', event => event.preventDefault());
  acknowledgeLoss.addEventListener('click', game.resetGame);
  const render = pokerView.createView(root, game, () => openProfile('table'));
  const menuButton = document.querySelector('#game-menu');
  const setup = document.querySelector('#game-setup');
  const profileDialog = document.querySelector('#player-profile');
  const chat = createPokerChat(root, document.querySelector('#table-chat-dialog'), game);

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
  bindPokerTutorial(document.querySelector('#poker-tutorial'), setup);
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
