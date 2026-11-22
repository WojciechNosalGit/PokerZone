'use strict';

const pokerHandReview = (() => {
  const boardSizes = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const percent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 0 }).format;
  const amount = chips => pokerGame.formatAmount(chips) + ' ż.';

  function seededDraw(cards, opponents) {
    let seed = opponents;
    for (const card of cards) seed = (Math.imul(seed, 31) + card.r + card.s.codePointAt(0)) >>> 0;
    return size => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(seed / 4294967296 * size);
    };
  }

  function hasContext(action) {
    const context = action.context;
    const valid = value => Number.isSafeInteger(value) && value >= 0;
    return context && [context.potBefore, context.contestablePot, context.callCost, context.opponents].every(valid)
      && context.contestablePot <= context.potBefore && context.callCost <= action.toCall
      && (action.type === 'check' ? context.callCost === 0 : action.type === 'raise' || context.callCost > 0)
      && context.opponents >= 1 && context.opponents <= 7;
  }

  function reviewLegacy(hand, action) {
    const [first, second] = hand.hero.cards;
    const weakPreflop = action.street === 'preflop' && Math.max(first.r, second.r) <= 10
      && first.r !== second.r && first.s !== second.s;
    const missingPot = 'Zapis z tej chwili nie zawierał wielkości puli.';
    if (action.type === 'fold') {
      const reason = weakPreflop
        ? `Pas z dwiema różnymi niskimi kartami w różnych kolorach jest zrozumiały. Stawka do wyrównania wynosiła ${amount(action.toCall)}.`
        : `Pas zamknął decyzję przy stawce do wyrównania ${amount(action.toCall)}.`;
      return { tone: 'limited', text: `${reason} ${missingPot}` };
    }
    if (action.type === 'call') {
      const costly = weakPreflop && hand.bigBlind > 0 && action.chips >= 4 * hand.bigBlind;
      return costly
        ? { tone: 'caution', text: `Sprawdzenie za ${amount(action.chips)} z niskimi kartami w różnych kolorach warto przejrzeć. ${missingPot}` }
        : { tone: 'limited', text: `Dołożyłeś ${amount(action.chips)}. Do oceny ceny sprawdzenia potrzebna jest wielkość puli sprzed ruchu.` };
    }
    return { tone: 'limited', text: `Podbiłeś do ${amount(action.betTo)}. Ocena wielkości podbicia wymaga puli i liczby rywali w momencie decyzji.` };
  }

  function reviewPricedAction(action, equity) {
    const { callCost, contestablePot } = action.context;
    const odds = callCost / (contestablePot + callCost);
    const edge = equity - odds;
    const figures = `Sprawdzenie za ${amount(callCost)} wymagało około ${percent(odds)} udziału w puli. Szacunek equity wyniósł ${percent(equity)}.`;
    if (action.type === 'call') {
      if (edge >= 0.08) return { tone: 'good', text: `Sprawdzenie wyglądało korzystnie przy tej cenie. ${figures}` };
      if (edge <= -0.08) return { tone: 'caution', text: `Sprawdzenie wyglądało drogo. Pas ograniczyłby koszt. ${figures}` };
      return { tone: 'close', text: `Sprawdzenie było graniczne. Siła zakresu rywali mogła rozstrzygnąć decyzję. ${figures}` };
    }
    if (edge <= -0.08) return { tone: 'good', text: `Pas był rozsądny przy tej cenie. ${figures}` };
    if (edge >= 0.12) return { tone: 'caution', text: `Pas był zachowawczy. Sprawdzenie warto rozważyć przeciwko szerokim zakresom. ${figures}` };
    return { tone: 'close', text: `Pas był decyzją graniczną. ${figures}` };
  }

  function reviewRaise(action, equity) {
    const { potBefore, opponents } = action.context;
    const evenShare = 1 / (opponents + 1);
    const figures = `Dołożyłeś ${amount(action.chips)} do puli ${amount(potBefore)}. Szacunek equity wyniósł ${percent(equity)}.`;
    if (equity >= evenShare + 0.14) {
      return { tone: 'good', text: `Podbicie miało podstawy jako zagranie dla wartości. ${figures}` };
    }
    if (equity <= evenShare - 0.08 && action.chips >= potBefore / 2) {
      return { tone: 'caution', text: `Podbicie mocno polegało na tym, że rywale spasują. Warto ocenić, jak często rzeczywiście by to zrobili. ${figures}` };
    }
    return { tone: 'close', text: `Ocena podbicia zależy od tego, z jakimi rękami rywale sprawdziliby tę stawkę. ${figures}` };
  }

  function assess(hand) {
    if (!hand.hero.actions.length) return { verdict: 'Bez dobrowolnych decyzji', notes: [], simulated: false };

    const estimates = new Map();
    const notes = hand.hero.actions.map(action => {
      let review;
      if (action.type === 'check' && (action.street !== 'river' || !hasContext(action) || hand.board.length < 5)) {
        review = { tone: 'good', text: 'Check pozwolił pozostać w rozdaniu bez dopłaty.' };
      } else if (action.type === 'fold' && action.toCall === 0) {
        review = { tone: 'caution', text: 'Można było zaczekać za darmo. Check zachowałby szansę na pulę.' };
      } else if (!hasContext(action) || hand.board.length < boardSizes[action.street]) {
        review = reviewLegacy(hand, action);
      } else {
        const board = hand.board.slice(0, boardSizes[action.street]);
        const { opponents } = action.context;
        const key = `${action.street}:${opponents}`;
        if (!estimates.has(key)) {
          const draw = seededDraw([...hand.hero.cards, ...board], opponents);
          estimates.set(key, pokerBots.estimateEquity({ hand: hand.hero.cards }, board, opponents, 320, draw));
        }
        const equity = estimates.get(key);
        if (action.type === 'check') {
          review = equity >= 0.82
            ? { tone: 'close', text: `Check był bezpłatny. Przy szacowanym equity ${percent(equity)} warto też rozważyć zakład dla wartości, jeśli słabsze ręce mogłyby sprawdzić.` }
            : { tone: 'good', text: 'Check zachował szansę na showdown bez dokładania żetonów w tym ruchu.' };
        } else {
          review = action.type === 'raise' ? reviewRaise(action, equity) : reviewPricedAction(action, equity);
        }
      }
      return { ...review, street: action.street, type: action.type };
    });

    const tones = new Set(notes.map(note => note.tone));
    let verdict = 'Rozsądnie rozegrane';
    if (tones.has('caution')) verdict = 'Są decyzje do przejrzenia';
    else if (tones.has('limited')) verdict = 'Ocena częściowa';
    else if (tones.has('close')) verdict = 'Decyzje zależały od rywali';
    return { verdict, notes, simulated: estimates.size > 0 };
  }

  return { assess };
})();
