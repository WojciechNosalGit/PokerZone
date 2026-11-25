'use strict';

function createPokerTutorial(onChange, onAction) {
  const ranks = { A: 14, K: 13, Q: 12, J: 11 };
  const cards = list => list.split(' ').map(code => {
    const rank = code.slice(0, -1);
    return { r: ranks[rank] ?? Number(rank), s: code.at(-1) };
  });
  const overviewSteps = [
    {
      target: 'table-status',
      title: 'Twoja kolej',
      prompt: 'Gdy zobaczysz „Twoja kolej”, wybierz zagranie. „Do sprawdzenia” pokazuje, ile żetonów trzeba dołożyć, żeby wyrównać zakład.'
    }, {
      target: 'table-round',
      title: 'Rozdanie i stawka',
      prompt: 'Liczba na kartach to numer rozdania. NL 2/4 oznacza grę No Limit z blindami 2 i 4. Blindy to obowiązkowe wpłaty przed rozdaniem kart.'
    }, {
      target: 'table-players',
      title: 'Gracze przy stole',
      prompt: 'Liczba obok ikonki pokazuje, ilu graczy jest przy stole, razem z Tobą. W samouczku gracie we dwoje.'
    }, {
      target: 'hand-status',
      title: 'Twój układ',
      prompt: 'Tu zobaczysz swój najlepszy układ z dostępnych kart. Na razie masz króla i damę, więc Twój układ to wysoka karta, król.'
    }
  ];
  const lessons = [
    {
      title: 'Od blindów do showdownu',
      dealer: 0,
      hero: cards('K♥ Q♥'), bot: cards('Q♦ J♠'), board: cards('Q♣ 7♦ 2♠ K♣ 5♦'),
      action: () => ({ type: 'call' }),
      guide(state) {
        if (state.dealing) return {
          speech: 'Jestem na big blindzie. Wpłacam 4 żetony, zanim dostaniemy karty.',
          prompt: 'Gracie na NL 2/4. Na small blindzie wpłacasz 2 żetony. W grze jeden na jednego small blind i przycisk dealera (D) są u tego samego gracza.'
        };
        if (state.phase === 'finished') return {
          speech: 'Mam parę dam. Twoje dwie pary wygrywają.',
          prompt: 'Wygrywasz 8 żetonów. Podświetlone pięć kart tworzy Twój najlepszy układ.',
          best: [0, 1, 3]
        };
        if (state.street === 'preflop') return {
          actions: ['call'],
          prompt: 'Masz króla i damę. Kliknij Call, żeby dołożyć 2 żetony i wyrównać big blind.'
        };
        const prompts = {
          flop: 'Flop to pierwsze trzy wspólne karty. Dama ze stołu i Twoja dama tworzą parę. Kliknij Check, żeby zobaczyć następną kartę.',
          turn: 'Na turnie doszedł król. Masz dwie pary. Kliknij Check.',
          river: 'River to ostatnia wspólna karta. Kliknij Check, żeby przejść do showdownu, czyli porównania układów.'
        };
        const speech = state.players[1].lastAction?.kind === 'check' ? 'Check. Czekam na Twój ruch.' : undefined;
        return { actions: ['call'], speech, prompt: prompts[state.street] };
      }
    },
    {
      title: 'Check, Bet i Raise',
      dealer: 1,
      hero: cards('A♥ 9♥'), bot: cards('K♦ J♣'), board: cards('A♣ 9♠ 4♦ 3♠ 8♦'),
      action(state) {
        if (state.street !== 'turn') return { type: 'call' };
        return state.currentBet === 0 ? { type: 'raise', target: 8 } : { type: 'fold' };
      },
      guide(state) {
        if (state.phase === 'finished') {
          const [hero, bot] = state.players;
          return {
            speech: 'Po Twoim podbiciu pasuję.',
            prompt: `Wygrywasz pulę. Niesprawdzona część podbicia, ${hero.contributed - bot.contributed} żetonów, wraca do Ciebie. Karty Ady zostają zakryte.`
          };
        }
        if (state.street === 'preflop') return {
          actions: ['call'], speech: state.actor === 0
            ? 'Dołożyłam 2 żetony do Twojego big blinda.' : 'Mam small blind. Dołożę 2 żetony do Twojego big blinda.',
          prompt: 'Jesteś na BB i masz już wpłacone 4. Gdy Ada wyrówna blind, kliknij Check, żeby zobaczyć flop.'
        };
        if (state.street === 'flop') return {
          actions: ['raise'], raiseMax: 12,
          prompt: 'Masz dwie pary. Ustaw kwotę suwakiem i kliknij Bet. Tak nazywa się pierwszy zakład na tej ulicy.'
        };
        if (state.currentBet === 0) return {
          actions: ['call'], speech: 'Sprawdziłam Twój zakład na flopie.',
          prompt: 'Na turnie zaczyna się nowa runda zakładów. Kliknij Check i zobacz, co zrobi Ada.'
        };
        return {
          actions: ['raise'], raiseMax: 32, speech: 'Stawiam 8 żetonów.',
          prompt: 'Wybierz łączną kwotę i kliknij Raise. Żeby podbić zakład za 8, musisz postawić co najmniej 16 żetonów.'
        };
      }
    },
    {
      title: 'Kiedy spasować',
      dealer: 0,
      hero: cards('7♣ 2♦'), bot: cards('A♥ J♣'), board: cards('A♠ K♦ 9♣ 3♠ 5♦'),
      action: state => state.street === 'flop' && state.currentBet === 0
        ? { type: 'raise', target: 16 } : { type: 'call' },
      guide(state) {
        if (state.phase === 'finished') return state.players[0].folded
          ? { speech: 'Po Twoim spasowaniu biorę pulę.', prompt: 'Zachowujesz 16 żetonów, które kosztowałoby sprawdzenie. Możesz powtórzyć rozdanie i wybrać Call.' }
          : { speech: 'Mam parę asów i biorę pulę.', prompt: 'Dołożyłeś 16 żetonów na flopie. Na showdownie Twoja wysoka karta przegrywa z parą asów. Możesz powtórzyć rozdanie i wybrać Fold.' };
        if (state.street === 'preflop') return {
          actions: ['call'], prompt: 'Dołóż 2 żetony przyciskiem Call, żeby zobaczyć, jak rozwinie się rozdanie z siódemką i dwójką.'
        };
        if (state.street === 'flop' && state.currentBet > 0) return {
          actions: ['fold', 'call'], speech: 'Na flopie stawiam 16 żetonów.',
          prompt: 'Nie masz pary. Call kosztuje 16 żetonów. Wybierz Call albo Fold, żeby zobaczyć skutek swojej decyzji.'
        };
        if (state.street === 'flop') return { prompt: 'Na flopie pierwsza zagrywa Ada. Zobacz, ile postawi.' };
        return { actions: ['call'], prompt: 'Kliknij Check, żeby zobaczyć, jak zakończy się rozdanie.' };
      }
    }
  ];

  let overviewIndex = null;
  let index = 0;
  let practiceOffset = null;
  const current = () => lessons[index];
  const inPractice = () => practiceOffset !== null;

  function dealLesson() {
    const { dealer, hero, bot, board } = current();
    const reserved = [...hero, ...bot, ...board];
    const remaining = pokerCards.fullDeck().filter(card =>
      !reserved.some(other => other.r === card.r && other.s === card.s));
    const [burnFlop, burnTurn, burnRiver] = remaining.splice(0, 3);
    const [first, second] = dealer === 0 ? [bot, hero] : [hero, bot];
    const draw = [first[0], second[0], first[1], second[1],
      burnFlop, ...board.slice(0, 3), burnTurn, board[3], burnRiver, board[4]];
    return [...remaining, ...draw.reverse()];
  }

  function publish(state, options) {
    if (!state) return;
    if (inPractice()) {
      const outOfChips = state.phase === 'gameover';
      onChange(state, {
        ...options,
        tutorial: {
          practice: true,
          number: practiceOffset + state.handNo,
          title: 'Gra samodzielna',
          prompt: outOfChips
            ? 'Skończyły się żetony treningowe. Możesz je odnowić i grać dalej.'
            : 'Rozgrywasz losowe rozdania za żetony treningowe.',
          nextLabel: 'Odnów żetony'
        }
      });
      return;
    }
    const lesson = current();
    const overview = overviewIndex === null || state.dealing ? null : overviewSteps[overviewIndex];
    const guidance = overview
      ? { overview: { ...overview, step: overviewIndex + 1, total: overviewSteps.length } }
      : lesson.guide(state);
    const last = index === lessons.length - 1;
    onChange(state, {
      ...options,
      tutorial: {
        ...guidance,
        number: index + 1,
        total: lessons.length,
        title: lesson.title,
        nextLabel: last ? 'Zagraj samodzielnie' : 'Następne rozdanie'
      }
    });
  }

  const game = pokerGame.createGame(publish, undefined, onAction, {
    dealer: () => inPractice() ? undefined : current().dealer,
    deck: () => inPractice() ? undefined : dealLesson(),
    botAction: state => inPractice() ? undefined : current().action(state),
    manualNextHand: () => !inPractice()
  });

  const replay = () => game.newGame({ playerCount: 2 });

  function start(profile) {
    overviewIndex = 0;
    index = 0;
    practiceOffset = null;
    game.setHeroProfile(profile);
    replay();
  }

  function advanceOverview() {
    if (overviewIndex === null) return;
    overviewIndex++;
    if (overviewIndex === overviewSteps.length) overviewIndex = null;
    publish(game.getState(), { restored: true });
  }

  function next() {
    const state = game.getState();
    if (inPractice() && state.phase === 'gameover') {
      practiceOffset += state.handNo;
      replay();
    } else if (!inPractice() && index < lessons.length - 1) {
      index++;
      replay();
    } else {
      if (!inPractice()) practiceOffset = lessons.length - state.handNo;
      game.startHand();
    }
  }

  return { game, start, replay, next, advanceOverview };
}
