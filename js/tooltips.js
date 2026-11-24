'use strict';

function bindPokerTooltips(tooltip) {
  const hasPopover = typeof tooltip.showPopover === 'function';
  const findTrigger = target => target instanceof Element ? target.closest('[data-tooltip]') : null;
  let active;
  let previousDescription;

  function hide() {
    if (!active) return;
    if (previousDescription === null) active.removeAttribute('aria-describedby');
    else active.setAttribute('aria-describedby', previousDescription);
    if (hasPopover) tooltip.hidePopover();
    tooltip.hidden = true;
    active = null;
  }

  function position() {
    if (!active) return;
    const { left, top, right, bottom, width } = active.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    if (right <= 0 || bottom <= 0 || left >= clientWidth || top >= clientHeight) {
      hide();
      return;
    }
    const { width: tipWidth, height: tipHeight } = tooltip.getBoundingClientRect();
    const margin = 8;
    const gap = 5;
    const x = left + (width - tipWidth) / 2;
    const below = bottom + gap;
    const y = below + tipHeight <= clientHeight - margin ? below : top - gap - tipHeight;
    tooltip.style.left = `${Math.max(margin, Math.min(x, clientWidth - tipWidth - margin))}px`;
    tooltip.style.top = `${Math.max(margin, Math.min(y, clientHeight - tipHeight - margin))}px`;
  }

  function show(trigger) {
    if (trigger === active) return;
    hide();
    if (!trigger?.dataset.tooltip) return;

    active = trigger;
    tooltip.textContent = trigger.dataset.tooltip;
    previousDescription = trigger.getAttribute('aria-describedby');
    (trigger.closest('dialog') ?? document.body).append(tooltip);
    tooltip.hidden = false;
    if (hasPopover) tooltip.showPopover();
    if (trigger.getAttribute('aria-label') !== tooltip.textContent) {
      const description = previousDescription ? `${previousDescription} ${tooltip.id}` : tooltip.id;
      trigger.setAttribute('aria-describedby', description);
    }
    position();
  }

  function leave(event) {
    if (active && active === findTrigger(event.target) && active !== findTrigger(event.relatedTarget)) hide();
  }

  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'touch') show(findTrigger(event.target));
  });
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusin', event => show(findTrigger(event.target)));
  document.addEventListener('focusout', leave);
  document.addEventListener('click', hide, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault();
    hide();
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', () => {
    if (active?.matches(':hover, :focus')) position();
    else hide();
  }, true);

  return container => { if (active && container.contains(active)) hide(); };
}
