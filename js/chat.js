'use strict';

function createPokerChat(root, dialog, game, onlineTable = () => null) {
  const botReactions = {
    win: { icons: ['😄', '🥳', '😎', '🃏✨'], label: 'radość po wygranej' },
    loss: { icons: ['😡', '😤', '😩', '😓'], label: 'frustracja po przegranej' },
    even: { icons: ['🤝', '😅', '😐'], label: 'wynik na zero' },
    fold: { icons: ['🤷', '👀', '🙈'], label: 'reakcja po spasowaniu' }
  };
  const form = dialog.querySelector('form');
  const input = dialog.querySelector('textarea');
  const count = dialog.querySelector('#table-chat-count');
  const send = dialog.querySelector('#send-table-chat');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const messages = new Map();
  let sessionId;
  let commentedHand;
  let lastSpeaker;
  let pausedGame = false;

  function clearMessage(seat) {
    const message = messages.get(seat);
    if (!message) return;
    clearTimeout(message.timer);
    message.bubble.remove();
    messages.delete(seat);
  }

  function positionMessage(seat, message) {
    const stage = root.querySelector('.felt');
    const avatar = stage?.querySelector(`[data-seat="${seat}"] .seat-avatar`);
    if (!avatar) return;
    const { bubble } = message;
    if (bubble.parentElement !== stage) stage.append(bubble);
    const table = pokerLayout.bounds(stage);
    const anchor = pokerLayout.bounds(avatar);
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const margin = 7;
    const center = anchor.left + anchor.width / 2 - table.left;
    const left = Math.max(margin, Math.min(center - width / 2, table.width - width - margin));
    const above = anchor.top - table.top - height - 23;
    const below = above < margin;
    const top = below ? anchor.bottom - table.top + 8 : above;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(margin, Math.min(top, table.height - height - margin))}px`;
    bubble.style.setProperty('--chat-tail', `${Math.max(12, Math.min(center - left, width - 12))}px`);
    bubble.classList.toggle('seat-chat-below', below);
  }

  function publish(player, text, { reactionLabel, duration = 4700 } = {}) {
    clearMessage(player.id);
    const bubble = document.createElement('div');
    bubble.className = 'seat-chat-bubble';
    bubble.dataset.speaker = String(player.id);
    bubble.textContent = text;
    if (reactionLabel) {
      bubble.classList.add('seat-chat-reaction');
      bubble.setAttribute('role', 'img');
      bubble.setAttribute('aria-label', `${player.name} — ${reactionLabel}`);
    }
    const timer = duration > 0 ? setTimeout(() => clearMessage(player.id), duration) : null;
    const message = { bubble, name: player.name, timer };
    messages.set(player.id, message);
    positionMessage(player.id, message);
    if (!reducedMotion.matches) bubble.animate([
      { opacity: 0, transform: 'translateY(4px) scale(.96)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 160, easing: 'ease-out' });
  }

  function commentOnResult(state, payouts) {
    const bots = state.players.slice(1).filter(player => player.hand.length === 2);
    const contenders = bots.filter(player => !player.folded);
    const candidates = contenders.length ? contenders : bots;
    if (!candidates.length) return;
    const alternatives = candidates.filter(player => player.id !== lastSpeaker);
    const speakers = alternatives.length ? alternatives : candidates;
    const speaker = speakers[pokerCards.randomIndex(speakers.length)];
    const payout = payouts.find(([seat]) => seat === speaker.id)?.[1] ?? 0;
    const net = payout - speaker.contributed;
    const outcome = speaker.folded ? 'fold' : net > 0 ? 'win' : net < 0 ? 'loss' : 'even';
    const { icons, label } = botReactions[outcome];
    clearMessage(lastSpeaker);
    lastSpeaker = speaker.id;
    publish(speaker, icons[pokerCards.randomIndex(icons.length)], { reactionLabel: label });
  }

  function onChange(state, { restored = false, payouts = [], online = false } = {}) {
    if (sessionId !== state?.sessionId || state?.phase === 'left') {
      for (const seat of messages.keys()) clearMessage(seat);
      sessionId = state?.sessionId;
      commentedHand = undefined;
      lastSpeaker = undefined;
    }
    if (!state || state.phase === 'left') return;
    for (const [seat, message] of messages) {
      if (state.players[seat]?.name === message.name) positionMessage(seat, message);
      else clearMessage(seat);
    }
    if (!online && !restored && payouts.length && state.handNo !== commentedHand) {
      commentedHand = state.handNo;
      commentOnResult(state, payouts);
    }
  }

  function updateDraft() {
    count.value = `${input.value.length}/${input.maxLength}`;
    send.disabled = !input.value.trim() || input.value.length > input.maxLength;
  }

  root.addEventListener('click', event => {
    const online = onlineTable();
    const state = (online?.game ?? game).getState();
    if (!event.target.closest('#write-chat') || dialog.open || !state || state.phase === 'gameover') return;
    pausedGame = !online;
    if (pausedGame) game.pause();
    form.reset();
    updateDraft();
    dialog.showModal();
  });
  input.addEventListener('input', updateDraft);
  form.addEventListener('submit', event => {
    event.preventDefault();
    updateDraft();
    const online = onlineTable();
    const player = (online?.game ?? game).getState()?.players[0];
    if (send.disabled || !player) return;
    const text = input.value.trim();
    if (online) {
      if (!online.sendChat(text)) { count.value = 'Brak połączenia ze stołem'; return; }
    } else publish(player, text);
    dialog.close();
  });
  dialog.querySelector('#cancel-table-chat').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    const resumeGame = pausedGame;
    pausedGame = false;
    if (document.querySelector('dialog[open]')) return;
    if (resumeGame) game.resume();
    root.querySelector('#write-chat')?.focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => {
    for (const [seat, message] of messages) positionMessage(seat, message);
  });

  function speak(player, text) {
    if (text) publish(player, text, { duration: 0 });
    else clearMessage(player.id);
  }

  return { onChange, speak, showMessage: publish };
}
