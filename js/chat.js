'use strict';

function createPokerChat(root, dialog, game) {
  const botLines = {
    win: ['Uff, udało się!', 'Tym razem pula dla mnie.', 'Dobre rozdanie!'],
    loss: ['O, blisko było!', 'Ładnie rozegrane.', 'Tym razem się nie udało.'],
    even: ['Wychodzę na zero.', 'Po tym rozdaniu jestem na równo.'],
    fold: ['Tym razem odpuszczam.', 'Spróbuję w następnym.', 'Zobaczymy, co przyniesie następne.']
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
    const lines = botLines[outcome];
    clearMessage(lastSpeaker);
    lastSpeaker = speaker.id;
    publish(speaker, lines[pokerCards.randomIndex(lines.length)]);
  }

  function onChange(state, { restored = false, payouts = [] } = {}) {
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
    if (!restored && payouts.length && state.handNo !== commentedHand) {
      commentedHand = state.handNo;
      commentOnResult(state, payouts);
    }
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
