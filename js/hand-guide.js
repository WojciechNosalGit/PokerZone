'use strict';

function bindPokerHandGuide(dialog, trigger) {
  const { handNames } = pokerCards;
  const { cardHTML } = pokerView;
  const examples = [
    {
      name: 'Poker królewski',
      rule: 'As, król, dama, walet i dziesiątka w tym samym kolorze.',
      cards: [[14, '♠'], [13, '♠'], [12, '♠'], [11, '♠'], [10, '♠']]
    }, {
      name: handNames[8],
      rule: 'Pięć kolejnych kart w tym samym kolorze.',
      cards: [[9, '♥'], [8, '♥'], [7, '♥'], [6, '♥'], [5, '♥']]
    }, {
      name: handNames[7],
      rule: 'Cztery karty o tej samej wartości.',
      cards: [[12, '♠'], [12, '♥'], [12, '♦'], [12, '♣'], [5, '♠']]
    }, {
      name: handNames[6],
      rule: 'Trójka i para w jednym układzie.',
      cards: [[10, '♠'], [10, '♦'], [10, '♣'], [7, '♥'], [7, '♣']]
    }, {
      name: handNames[5],
      rule: 'Pięć kart o tym samym symbolu (♠, ♥, ♦ lub ♣), które nie tworzą strita.',
      cards: [[14, '♦'], [11, '♦'], [8, '♦'], [5, '♦'], [2, '♦']]
    }, {
      name: handNames[4],
      rule: 'Pięć kolejnych kart, które nie są wszystkie w tym samym kolorze. As może być przed dwójką lub po królu.',
      cards: [[8, '♣'], [7, '♠'], [6, '♥'], [5, '♦'], [4, '♠']]
    }, {
      name: handNames[3],
      rule: 'Trzy karty o tej samej wartości.',
      cards: [[9, '♠'], [9, '♥'], [9, '♣'], [13, '♦'], [4, '♣']]
    }, {
      name: handNames[2],
      rule: 'Dwie pary o różnych wartościach.',
      cards: [[11, '♠'], [11, '♦'], [6, '♥'], [6, '♣'], [3, '♠']]
    }, {
      name: handNames[1],
      rule: 'Dwie karty o tej samej wartości.',
      cards: [[13, '♥'], [13, '♣'], [9, '♠'], [6, '♦'], [2, '♣']]
    }, {
      name: handNames[0],
      rule: 'Gdy nie masz żadnego z powyższych układów, liczy się najwyższa karta. Przy remisie porównujesz kolejne.',
      cards: [[14, '♣'], [11, '♦'], [8, '♠'], [5, '♥'], [2, '♣']]
    }
  ];
  const body = dialog.querySelector('.hand-guide-body');
  const list = body.querySelector('.hand-guide-list');
  list.innerHTML = examples.map(({ name, rule, cards }) => `
    <li>
      <div class="hand-guide-entry">
        <div><h3>${name}</h3><p>${rule}</p></div>
        <div class="hand-guide-cards" role="group" aria-label="Przykładowe karty">
          ${cards.map(([r, s]) => cardHTML({ r, s })).join('')}
        </div>
      </div>
    </li>`).join('');

  trigger.addEventListener('click', () => {
    dialog.showModal();
    body.scrollTop = 0;
  });
  dialog.querySelector('#close-hand-guide').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
}
