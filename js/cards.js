'use strict';

const pokerCards = (() => {
  const suits = ['♠', '♥', '♦', '♣'];
  const handNames = ['Wysoka karta', 'Para', 'Dwie pary', 'Trójka', 'Strit', 'Kolor', 'Full', 'Kareta', 'Poker'];
  const combinations = [];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      for (let c = b + 1; c < 7; c++) {
        for (let d = c + 1; d < 7; d++) {
          for (let e = d + 1; e < 7; e++) {
            combinations.push([a, b, c, d, e]);
          }
        }
      }
    }
  }
  const sixCardCombinations = combinations.filter(indices => indices[4] < 6);

  const randomIndex = size => Math.floor(Math.random() * size);

  function fullDeck() {
    const cards = [];
    for (let r = 2; r <= 14; r++) {
      for (const s of suits) cards.push({ r, s });
    }
    return cards;
  }

  function shuffled(cards) {
    const result = cards.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function rank5(cards) {
    const values = cards.map(card => card.r).sort((a, b) => b - a);
    const unique = [...new Set(values)];
    const flush = cards.every(card => card.s === cards[0].s);
    let straight = 0;
    if (unique.length === 5) {
      if (unique[0] - unique[4] === 4) straight = unique[0];
      else if (unique.join(',') === '14,5,4,3,2') straight = 5;
    }

    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const [highest, count] = groups[0];

    if (flush && straight) return [8, straight];
    if (count === 4) return [7, highest, groups[1][0]];
    if (count === 3 && groups[1][1] === 2) return [6, highest, groups[1][0]];
    if (flush) return [5, ...values];
    if (straight) return [4, straight];
    if (count === 3) return [3, highest, ...groups.slice(1).map(([rank]) => rank)];
    if (count === 2 && groups[1][1] === 2) return [2, highest, groups[1][0], groups[2][0]];
    if (count === 2) return [1, highest, ...groups.slice(1).map(([rank]) => rank)];
    return [0, ...values];
  }

  function compareScore(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  function bestScore(cards, candidates) {
    let best = null;
    for (const combination of candidates) {
      const score = rank5(combination.map(i => cards[i]));
      if (!best || compareScore(score, best) > 0) best = score;
    }
    return best;
  }

  const score7 = cards => bestScore(cards, combinations);

  function currentHandScore(hand, board) {
    if (hand.length !== 2) return null;
    if (board.length === 0) return [hand[0].r === hand[1].r ? 1 : 0, Math.max(hand[0].r, hand[1].r)];
    const visibleCards = [...hand, ...board];
    if (board.length === 3) return rank5(visibleCards);
    if (board.length === 4) return bestScore(visibleCards, sixCardCombinations);
    if (board.length === 5) return score7(visibleCards);
    return null;
  }

  return { fullDeck, shuffled, randomIndex, rank5, compareScore, score7, currentHandScore, handNames };
})();
