'use strict';

(() => {
  const historyPanel = document.querySelector('#hand-history');
  const history = createPokerHistory(state => renderHistory(state));
  const renderHistory = createPokerHistoryView(historyPanel, history);
  const root = document.querySelector('#app');
  const headerProfile = document.querySelector('#open-profile');
  const headerAvatar = headerProfile.querySelector('#header-avatar');
  const headerName = headerProfile.querySelector('#header-player-name');
  const effects = createPokerEffects(root);
  const game = pokerGame.createGame((state, options) => {
    render(state, options);
    updateHeaderProfile(state.players[0]);
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
  function updateHeaderProfile({ name, avatar }) {
    headerName.textContent = name;
    headerProfile.setAttribute('aria-label', `Wyświetl profil gracza ${name}`);
    pokerAvatars.setAvatar(headerAvatar, avatar);
  }

  function applyProfile(value) {
    game.setHeroProfile(value);
    const state = game.getState();
    pokerView.applyProfile(root, state);
    updateHeaderProfile(state?.players[0] ?? value);
  }
  const profile = createPokerProfile(profileDialog, applyProfile);
  applyProfile(profile.current());
  let profileSource;
  function openProfile(source) {
    profileSource = source;
    game.pause();
    profile.open(game.getState()?.players[0]);
  }
  const openSetup = bindPokerMenu(menu, setup, game, effects, openProfile);
  headerProfile.addEventListener('click', () => openProfile('header'));
  profileDialog.addEventListener('close', () => {
    if (profileDialog.open) return;
    if (!setup.open) game.resume();
    const trigger = profileSource === 'setup' ? setup.querySelector('#setup-profile')
      : profileSource === 'table' ? root.querySelector('#table-profile') : null;
    (trigger || headerProfile).focus({ preventScroll: true });
  });
  openSetup();

  const { rank5, score7, compareScore } = pokerCards;
  const { getState, act, newGame, startHand, estimateEquity } = game;
  window.PokerLabTest = { rank5, score7, compareScore, getState, act, newGame, startHand, estimateEquity };
})();
