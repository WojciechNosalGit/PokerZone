'use strict';

function createPokerHistoryView(root, history, { online = false } = {}) {
  const { cardHTML, escapeHTML, streetNames } = pokerView;
  const money = pokerGame.formatAmount;
  const actionLabels = { check: 'Check', call: 'Call', raise: 'Podbicie do', fold: 'Pas' };
  const pageSize = 15;
  let limit = pageSize;
  let entries = [];
  const rendered = new Map();
  const find = selector => root.querySelector(selector);
  const prefix = online ? 'online-history' : 'history';

  root.innerHTML = `
    <div class="history-header">
      <h2 id="${root.getAttribute('aria-labelledby')}">${online ? 'Historia rozdań online' : 'Historia'}</h2>
      ${online ? '' : `<div class="history-buttons">
        <button class="reset" type="button" id="history-folder" hidden>Wybierz folder zapisu</button>
        <button class="reset" type="button" id="history-resume" hidden>Wznów zapis</button>
        <button class="reset" type="button" id="history-import">Importuj JSON</button>
        <input id="history-import-file" type="file" accept=".json,application/json" hidden>
        <button class="reset" type="button" id="history-download" disabled>Pobierz JSON</button>
      </div>`}
    </div>
    ${online ? '' : '<p class="hint" id="history-status" role="status">Wczytywanie historii…</p><p class="hint" id="history-import-status" role="status" hidden></p>'}
    <div id="${prefix}-entries" class="history-entries"></div>
    <button class="reset history-more" type="button" id="${prefix}-more" hidden>Pokaż starsze rozdania</button>`;

  const list = find(`#${prefix}-entries`);
  const more = find(`#${prefix}-more`);
  const folder = find('#history-folder');
  const resume = find('#history-resume');
  const download = find('#history-download');
  const importButton = find('#history-import');
  const importInput = find('#history-import-file');
  const importStatus = find('#history-import-status');
  folder?.addEventListener('click', history.chooseFolder);
  resume?.addEventListener('click', history.resume);
  download?.addEventListener('click', history.download);
  importButton?.addEventListener('click', () => importInput.click());
  importInput?.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    importButton.disabled = true;
    try {
      const count = await history.importFile(file);
      importStatus.textContent = count ? `Zaimportowano ${money(count)} rozdań.` : 'Plik nie zawiera nowych rozdań.';
    } catch {
      importStatus.textContent = 'Nie udało się odczytać historii z wybranego pliku.';
    } finally {
      importStatus.hidden = false;
      importButton.disabled = false;
      importInput.value = '';
    }
  });
  more.addEventListener('click', () => {
    limit += pageSize;
    renderEntries();
  });

  function showCards(cards) {
    return `<div class="cards mini-cards">${cards.map(cardHTML).join('')}</div>`;
  }

  function showOpponents(opponents, positions, reveal) {
    return opponents.map(opponent => {
      const visible = opponent.cards && (opponent.revealed || reveal);
      return `<div><strong>${escapeHTML(positions.get(opponent.seat) ?? opponent.name)}</strong>${showCards(visible ? opponent.cards : ['back', 'back'])}</div>`;
    }).join('');
  }

  function reviewHTML(hand) {
    const { verdict, notes, simulated } = pokerHandReview.assess(hand);
    const breakdown = notes.length
      ? `<ul>${notes.map(note => `<li><strong>${streetNames[note.street]} · ${actionLabels[note.type]}</strong><div>${escapeHTML(note.text)}</div></li>`).join('')}</ul>`
      : '<p>Rozdanie skończyło się przed Twoim pierwszym ruchem.</p>';
    const method = simulated ? '<p class="hint">Szacunki zakładają losowe karty rywali. Ich rzeczywiste zakresy i dalsze zakłady mogą zmienić ocenę.</p>' : '';
    return `<strong class="review-verdict">${escapeHTML(verdict)}</strong>${breakdown}${method}`;
  }

  function renderEntry(hand) {
    const item = document.createElement('details');
    item.className = 'history-hand';
    const { hero, board, opponents, ending } = hand;
    const positions = pokerGame.positionsForHand(hand.dealerSeat, [0, ...opponents.map(opponent => opponent.seat)]);
    const net = hero.endingStack - hero.startingStack;
    const delta = (net > 0 ? '+' : net < 0 ? '−' : '') + money(Math.abs(net)) + ' ż.';
    const date = new Date(hand.finishedAt);
    const actionList = hero.actions.map(action => {
      const amount = action.type === 'raise' ? action.betTo : action.chips;
      const chips = amount > 0 ? ' ' + money(amount) + ' ż.' : '';
      return `<li>${streetNames[action.street]} · ${actionLabels[action.type]}${chips}</li>`;
    }).join('');
    item.innerHTML = `
      <summary>
        <strong>Rozdanie #${hand.handNumber}</strong>
        <time datetime="${escapeHTML(date.toISOString())}">${date.toLocaleString('pl-PL')}</time>
        <span class="${net > 0 ? 'history-won' : net < 0 ? 'warn' : ''}">${delta}</span>
      </summary>
      <div class="history-hand-body">
        <div class="history-cards">
          <div><strong>Twoje karty</strong>${showCards(hero.cards)}</div>
          <div><strong>Karty wspólne</strong>${board.length ? showCards(board) : '<div class="hint">Brak odkrytych kart</div>'}</div>
        </div>
        <p>${ending === 'showdown' ? 'Showdown' : 'Rozdanie zakończone pasem'} · Pula ${money(hand.pot)} ż. · Twoja wypłata ${money(hero.payout)} ż.</p>
        <strong>Twoje akcje</strong>
        ${actionList ? `<ol class="history-action-list">${actionList}</ol>` : '<p class="hint">Brak decyzji w tym rozdaniu.</p>'}
        <section class="hand-review" aria-label="Ocena rozegrania">
          <h3>Ocena rozegrania</h3>
          <div class="hand-review-content"></div>
        </section>
        ${ending === 'fold' && !online ? '<label class="history-reveal"><input type="checkbox"> Pokaż karty przeciwników</label>' : ''}
        <div class="history-cards history-opponents" aria-label="Karty przeciwników">${showOpponents(opponents, positions, false)}</div>
      </div>`;
    const reveal = item.querySelector('input');
    const cards = item.querySelector('.history-opponents');
    reveal?.addEventListener('change', () => { cards.innerHTML = showOpponents(opponents, positions, reveal.checked); });
    let reviewed = false;
    item.addEventListener('toggle', () => {
      if (!item.open || reviewed) return;
      item.querySelector('.hand-review-content').innerHTML = reviewHTML(hand);
      reviewed = true;
    });
    return item;
  }

  function renderEntries() {
    const visible = entries.slice(0, limit);
    const ids = new Set(visible.map(hand => hand.id));
    for (const id of rendered.keys()) {
      if (!ids.has(id)) rendered.delete(id);
    }
    for (const hand of visible) {
      if (!rendered.has(hand.id)) rendered.set(hand.id, renderEntry(hand));
    }
    list.replaceChildren(...visible.map(hand => rendered.get(hand.id)));
    if (!visible.length) list.textContent = 'Zakończone rozdania pojawią się tutaj.';
    more.hidden = visible.length >= entries.length;
  }

  return function render(state) {
    const { entries: nextEntries, filename, directoryName, fileState, choosing, storageWarning, canChooseFolder } = state;
    if (nextEntries !== entries || !list.hasChildNodes()) {
      entries = nextEntries;
      renderEntries();
    }
    if (online) return;
    folder.hidden = !canChooseFolder;
    resume.hidden = !directoryName || fileState === 'active' || fileState === 'off';
    folder.disabled = choosing;
    resume.disabled = choosing;
    download.disabled = entries.length === 0;

    const messages = {
      off: storageWarning ? 'Magazyn historii w przeglądarce jest niedostępny. Możesz pobrać JSON.'
        : 'Historia zapisuje się automatycznie w tej przeglądarce.',
      active: `Automatyczny zapis do ${directoryName}/${filename}.`,
      permission: 'Przeglądarka prosi o ponowny dostęp do folderu zapisu.',
      invalid: `Plik ${filename} ma inny format. Wybierz inny folder.`,
      error: directoryName ? 'Zapis do pliku się nie powiódł. Wznów zapis lub pobierz JSON.'
        : 'Nie udało się otworzyć folderu. Historię możesz pobrać jako plik JSON.'
    };
    const status = storageWarning && fileState !== 'off'
      ? ' Magazyn historii w przeglądarce jest niedostępny.' : '';
    find('#history-status').textContent = `${messages[fileState]}${status}`;
  };
}
