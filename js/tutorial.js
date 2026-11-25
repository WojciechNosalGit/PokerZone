'use strict';

function bindPokerTutorial(dialog, setup) {
  const ranks = { A: 14, K: 13, Q: 12, J: 11 };
  const street = { 0: 'Preflop', 3: 'Flop', 4: 'Turn', 5: 'River' };
  const cards = list => list.split(' ').map(code => {
    const rank = code.slice(0, -1);
    return { r: ranks[rank] ?? Number(rank), s: code.at(-1) };
  });
  const hands = [
    {
      title: 'Od blindów do showdownu',
      hero: cards('K♥ Q♥'), bot: cards('Q♦ J♠'), board: cards('Q♣ 7♦ 2♠ K♣ 5♦'),
      heroPosition: 'BTN / SB', botPosition: 'BB',
      steps: () => [
        { visible: 0, pot: 6, dealt: false, speech: 'Jestem na BB. Wpłacam 4 żetony do puli, zanim dostaniemy karty.', prompt: 'Gracie przy stawkach NL 2/4. Na small blindzie wpłacasz 2 obowiązkowe żetony. Przycisk dealera (BTN) będzie się przesuwał co rozdanie.', actions: ['Dalej'] },
        { visible: 0, pot: 6, prompt: 'Masz króla i damę. Dołóż 2 żetony przyciskiem Call, żeby wyrównać big blind.', actions: ['Call 2'] },
        { visible: 3, pot: 8, speech: 'Check. Możesz zaczekać na kolejną kartę tak jak ja.', prompt: 'Flop to pierwsze trzy wspólne karty. Dama ze stołu i Twoja dama tworzą parę.', actions: ['Check'] },
        { visible: 4, pot: 8, prompt: 'Na turnie doszedł król. Masz teraz dwie pary. Ada czeka, więc możesz kliknąć Check.', actions: ['Check'] },
        { visible: 5, pot: 8, speech: 'Check na riverze. Po Twoim ruchu porównamy karty.', prompt: 'River to ostatnia wspólna karta. Kliknij Check, żeby zobaczyć showdown.', actions: ['Check'] },
        { visible: 5, pot: 8, reveal: true, best: [0, 1, 3], speech: 'Mam parę dam. Twoje dwie pary wygrywają.', prompt: 'Wygrywasz 8 żetonów. Podświetlone pięć kart tworzy Twój najlepszy układ.', actions: ['Następne rozdanie', 'Powtórz rozdanie'] }
      ]
    },
    {
      title: 'Check, Bet i Raise',
      hero: cards('A♥ 9♥'), bot: cards('K♦ J♣'), board: cards('A♣ 9♠ 4♦ 3♠ 8♦'),
      heroPosition: 'BB', botPosition: 'BTN / SB',
      steps: ({ bet, raise }) => [
        { visible: 0, pot: 8, speech: 'Dołożyłam 2 żetony do Twojego big blinda.', prompt: 'Jesteś na BB i masz już wpłacone 4. Wybierz Check, żeby zobaczyć flop bez dokładania żetonów.', actions: ['Check'] },
        { visible: 3, pot: 8, prompt: 'Masz dwie pary i ruch jest Twój. Ustaw kwotę suwakiem. Pierwszy zakład na tej ulicy to Bet.', actions: ['Bet'], range: { min: 4, max: 12, value: bet } },
        { visible: 4, pot: 8 + 2 * bet, speech: `Sprawdziłam Twój zakład za ${bet} żetonów.`, prompt: 'Na turnie zaczyna się nowa runda zakładów. Kliknij Check i zobacz, co zrobi Ada.', actions: ['Check'] },
        { visible: 4, pot: 16 + 2 * bet, speech: 'Stawiam 8 żetonów. Możesz je sprawdzić, podbić albo spasować.', prompt: 'Ustaw łączną kwotę swojego podbicia suwakiem i kliknij Raise. Do podbicia zakładu 8 potrzeba co najmniej 16.', actions: ['Raise'], range: { min: 16, max: 32, value: raise } },
        { visible: 4, pot: 24 + 2 * bet, speech: 'Po Twoim podbiciu pasuję.', prompt: `Wygrywasz pulę, a ${raise - 8} żetonów z niesprawdzonej części podbicia wraca do Ciebie. Karty Ady zostają zakryte.`, actions: ['Następne rozdanie', 'Powtórz rozdanie'] }
      ]
    },
    {
      title: 'Kiedy spasować',
      hero: cards('7♣ 2♦'), bot: cards('A♥ J♣'), board: cards('A♠ K♦ 9♣ 3♠ 5♦'),
      heroPosition: 'BTN / SB', botPosition: 'BB',
      steps: ({ called }) => [
        { visible: 3, pot: 24, speech: 'Na flopie stawiam 16 żetonów.', prompt: 'Na stole leżą as, król i dziewiątka. Twoja ręka nie ma pary. Sprawdzenie kosztuje 16 żetonów. Wybierz ruch, żeby zobaczyć jego skutki.', actions: ['Fold', 'Call 16'] },
        called
          ? { visible: 5, pot: 40, reveal: true, speech: 'Mam parę asów i biorę pulę.', prompt: 'Po Call dołożyłeś 16 żetonów. Oboje przeczekaliście turn i river. Na showdownie Twoja wysoka karta przegrała z parą asów.' }
          : { visible: 3, pot: 24, speech: 'Po Twoim spasowaniu biorę pulę.', prompt: 'Kończysz rozdanie i zachowujesz 16 żetonów, które kosztowałoby sprawdzenie. Możesz powtórzyć rozdanie i wybrać Call.' }
      ]
    }
  ];

  const content = dialog.querySelector('#tutorial-step');
  const openButton = setup.querySelector('#setup-tutorial');
  const { cardHTML, escapeHTML } = pokerView;
  let handIndex = 0;
  let stepIndex = 0;
  let play;

  function bestCard(card) {
    return cardHTML(card).replace('class="card ', 'class="card tutorial-best-card ');
  }

  function render() {
    const hand = hands[handIndex];
    const step = hand.steps(play)[stepIndex];
    const actions = step.actions ?? ['Zagraj samodzielnie', 'Powtórz rozdanie'];
    const board = hand.board.map((card, index) => {
      if (index >= step.visible) return cardHTML(null);
      return step.best?.includes(index) ? bestCard(card) : cardHTML(card);
    }).join('');
    const botCards = hand.bot.map(card => cardHTML(step.reveal ? card : step.dealt === false ? null : 'back')).join('');
    const heroCards = hand.hero.map(card => step.best ? bestCard(card) : cardHTML(step.dealt === false ? null : card)).join('');
    const range = step.range;

    content.innerHTML = `<div class="tutorial-heading"><h3>${hand.title}</h3><span>Rozdanie ${handIndex + 1} z ${hands.length}</span></div>
    <div class="felt tutorial-felt">
      <div class="tutorial-seat">
        ${step.speech ? `<p class="seat-chat-bubble tutorial-speech" aria-live="polite">${escapeHTML(step.speech)}</p>` : ''}
        <span class="tutorial-seat-name">Ada · ${hand.botPosition}</span>
        <div class="cards tutorial-pocket" aria-label="Karty Ady">${botCards}</div>
      </div>
      <div class="tutorial-board">
        <div class="tutorial-pot">${step.reveal ? 'Showdown' : street[step.visible]} <strong>Pula ${step.pot}</strong></div>
        <div class="board" aria-label="Karty wspólne">${board}</div>
      </div>
      <div class="tutorial-seat">
        <div class="cards tutorial-pocket" aria-label="Twoje karty">${heroCards}</div>
        <span class="tutorial-seat-name">Ty · ${hand.heroPosition}</span>
      </div>
    </div>
    <p class="tutorial-prompt" aria-live="polite">${escapeHTML(step.prompt)}</p>
    ${range ? `<div class="tutorial-amount"><label for="tutorial-wager">Wysokość zakładu</label><input id="tutorial-wager" type="range" min="${range.min}" max="${range.max}" step="2" value="${range.value}"><output for="tutorial-wager">${range.value}</output></div>` : ''}
    <div class="setup-controls tutorial-actions">${actions.map(action => `<button class="zone-art-button${action === 'Fold' ? ' zone-cancel-button' : ''}" type="button" data-tutorial-action="${action}">${action}</button>`).join('')}</div>`;
    if (dialog.open) focusStep();
  }

  function focusStep() {
    content.querySelector('input, [data-tutorial-action]')?.focus({ preventScroll: true });
  }

  function startHand(index) {
    handIndex = index;
    stepIndex = 0;
    play = { bet: 8, raise: 24, called: false };
    render();
  }

  openButton.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.returnValue = '';
    startHand(0);
    dialog.showModal();
    focusStep();
  });
  dialog.querySelector('#close-tutorial').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'play') setup.querySelector('#start-game').focus();
  });
  content.addEventListener('input', event => {
    if (event.target.id === 'tutorial-wager') content.querySelector('output').value = event.target.value;
  });
  content.addEventListener('click', event => {
    const action = event.target.closest('[data-tutorial-action]')?.dataset.tutorialAction;
    if (!action) return;
    if (action === 'Zagraj samodzielnie') { dialog.close('play'); return; }
    if (action === 'Powtórz rozdanie') { startHand(handIndex); return; }
    if (action === 'Następne rozdanie') { startHand(handIndex + 1); return; }
    if (action === 'Bet' || action === 'Raise') play[action.toLowerCase()] = content.querySelector('input').valueAsNumber;
    if (action === 'Call 16') play.called = true;
    stepIndex++;
    render();
  });
}
