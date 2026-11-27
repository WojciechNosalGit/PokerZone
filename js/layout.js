'use strict';

const pokerLayout = (() => {
  const sideways = matchMedia('(pointer: coarse) and (max-width: 560px) and (orientation: portrait)');

  function viewport() {
    const { clientWidth, clientHeight } = document.documentElement;
    return sideways.matches ? { width: clientHeight, height: clientWidth } : { width: clientWidth, height: clientHeight };
  }

  function bounds(element) {
    const rect = element.getBoundingClientRect();
    if (!sideways.matches) return rect;
    const width = document.documentElement.clientWidth;
    return { left: rect.top, top: width - rect.right, right: rect.bottom, bottom: width - rect.left,
      width: rect.height, height: rect.width };
  }

  function screenPoint(x, y) {
    return sideways.matches ? { x: document.documentElement.clientWidth - y, y: x } : { x, y };
  }

  return { viewport, bounds, screenPoint };
})();
