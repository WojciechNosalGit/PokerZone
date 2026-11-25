'use strict';

function createPokerChat(root, dialog, game) {
  const botLines = {
    check: ['Zobaczmy, co dalej.', 'Check ode mnie.'],
    call: ['Dobra, sprawdzam.', 'Jeszcze jestem w grze.'],
    bet: ['Sprawdźmy, kto zostaje.', 'Co powiecie na tyle?'],
    raise: ['Podkręćmy stawkę.', 'Trochę więcej.'],
    fold: ['To rozdanie odpuszczam.', 'Poczekam na następne.'],
    'all-in': ['Wszystko na środek.', 'Gram o cały stack.']
  };
  const form = dialog.querySelector('form');
  const input = dialog.querySelector('textarea');
  const count = dialog.querySelector('#table-chat-count');
  const send = dialog.querySelector('#send-table-chat');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const messages = new Map();
  let sessionId;
  let latestLog;
  let lastBotLine = -Infinity;

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
    const table = stage.getBoundingClientRect();
    const anchor = avatar.getBoundingClientRect();
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

  function publish(player, text) {
    clearMessage(player.id);
    const bubble = document.createElement('div');
    bubble.className = 'seat-chat-bubble';
    bubble.dataset.speaker = String(player.id);
    bubble.textContent = text;
    const message = { bubble, name: player.name, timer: setTimeout(() => clearMessage(player.id), 4700) };
    messages.set(player.id, message);
    positionMessage(player.id, message);
    if (!reducedMotion.matches) bubble.animate([
      { opacity: 0, transform: 'translateY(4px) scale(.96)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 160, easing: 'ease-out' });
  }

  function onChange(state, { restored = false } = {}) {
    if (sessionId !== state?.sessionId || state?.phase === 'left') {
      for (const seat of messages.keys()) clearMessage(seat);
      sessionId = state?.sessionId;
      latestLog = undefined;
      lastBotLine = -Infinity;
    }
    if (!state || state.phase === 'left') return;
    for (const [seat, message] of messages) {
      if (state.players[seat]?.name === message.name) positionMessage(seat, message);
      else clearMessage(seat);
    }
    const entry = state.logs[0];
    if (entry === latestLog) return;
    latestLog = entry;
    const kind = entry?.action?.kind;
    const lines = botLines[kind];
    const speaker = state.players[entry?.playerId];
    if (restored || !speaker || speaker.id === 0 || !lines || Date.now() - lastBotLine < 4300) return;
    if (kind !== 'all-in' && Math.random() >= 0.25) return;
    lastBotLine = Date.now();
    publish(speaker, lines[pokerCards.randomIndex(lines.length)]);
  }

  function updateDraft() {
    count.value = `${input.value.length}/${input.maxLength}`;
    send.disabled = !input.value.trim() || input.value.length > input.maxLength;
  }

  root.addEventListener('click', event => {
    if (!event.target.closest('#write-chat') || dialog.open || game.getState()?.phase === 'gameover') return;
    game.pause();
    form.reset();
    updateDraft();
    dialog.showModal();
  });
  input.addEventListener('input', updateDraft);
  form.addEventListener('submit', event => {
    event.preventDefault();
    updateDraft();
    const player = game.getState()?.players[0];
    if (send.disabled || !player) return;
    publish(player, input.value.trim());
    dialog.close();
  });
  dialog.querySelector('#cancel-table-chat').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    game.resume();
    root.querySelector('#write-chat')?.focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => {
    for (const [seat, message] of messages) positionMessage(seat, message);
  });

  return { onChange };
}
