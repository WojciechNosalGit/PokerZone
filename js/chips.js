'use strict';

const pokerChips = (() => {
  const denominations = Object.freeze([1000, 500, 100, 25, 10, 5, 1]);

  function forAmount(amount) {
    const chips = [];
    for (const value of denominations) {
      const count = Math.floor(amount / value);
      for (let i = 0; i < count; i++) chips.push(value);
      amount %= value;
    }
    return chips;
  }

  function forPayouts(chips, payouts) {
    let available = [...chips];
    return payouts.map(([seat, amount]) => {
      const award = [];
      let unpaid = amount;
      available.sort((a, b) => b - a);
      available = available.filter(value => {
        if (value > unpaid) return true;
        award.push(value);
        unpaid -= value;
        return false;
      });
      // Rozmień najmniejszy pozostały żeton, by dokończyć wypłatę przy podziale puli.
      if (unpaid > 0) {
        const value = available.pop();
        award.push(...forAmount(unpaid));
        available.push(...forAmount(value - unpaid));
      }
      return [seat, award];
    });
  }

  const total = chips => chips.reduce((sum, value) => sum + value, 0);
  const matchesAmount = (chips, amount) => Array.isArray(chips)
    && chips.every(value => denominations.includes(value)) && total(chips) === amount;

  return { forAmount, forPayouts, matchesAmount };
})();
