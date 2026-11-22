'use strict';

(() => {
  const historyPanel = document.querySelector('#hand-history');
  const history = createPokerHistory(state => renderHistory(state));
  const renderHistory = createPokerHistoryView(historyPanel, history);
  const root = document.querySelector('#app');
  const effects = createPokerEffects(root);
  const game = pokerGame.createGame((state, options) => {
    render(state, options);
    historyPanel.hidden = false;
    const delay = effects.onChange(state, options);
    const loss = root.querySelector('#lossDialog');
    if (loss) {
      if (delay) setTimeout(() => { if (loss.isConnected) loss.showModal(); }, delay);
      else loss.showModal();
    }
  }, history.add, effects.onAction);
  const render = pokerView.createView(root, game, () => openSetup(), () => openProfile('table'));
  const menu = document.querySelector('#game-menu');
  const setup = document.querySelector('#game-setup');
  const profileDialog = document.querySelector('#player-profile');
  function applyProfile(value) {
    game.setHeroProfile(value);
    pokerView.applyProfile(root, game.getState(), value.avatar);
  }
  const profile = createPokerProfile(profileDialog, applyProfile, () => game.getState()?.players[0].avatar);
  applyProfile(profile.current());
  let profileSource;
  function openProfile(source) {
    profileSource = source;
    game.pause();
    profile.open();
  }
  const openSetup = bindPokerMenu(menu, setup, game, effects, history, openProfile);
  profileDialog.addEventListener('close', () => {
    if (profileDialog.open) return;
    if (!setup.open) game.resume();
    const trigger = profileSource === 'setup' ? setup.querySelector('#setup-profile')
      : profileSource === 'table' ? root.querySelector('#table-profile') : null;
    (trigger || menu.querySelector('summary')).focus({ preventScroll: true });
  });
  openSetup();

  const { rank5, score7, compareScore } = pokerCards;
  const { getState, act, newGame, startHand, estimateEquity } = game;
  window.PokerLabTest = { rank5, score7, compareScore, getState, act, newGame, startHand, estimateEquity };
})();
