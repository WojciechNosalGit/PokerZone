'use strict';

function createPokerSessions(dialog, game, confirmAction) {
  const prefix = 'poker-zone-session:';
  const legacyKey = 'poker-lab-saved-session';
  const timestamp = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'medium' });
  const title = dialog.querySelector('#session-title');
  const form = dialog.querySelector('#session-form');
  const nameField = dialog.querySelector('#session-name-field');
  const listField = dialog.querySelector('#session-list-field');
  const listLabel = dialog.querySelector('#session-list-label');
  const name = dialog.querySelector('#session-name');
  const list = dialog.querySelector('#session-list');
  const submit = dialog.querySelector('#submit-session');
  const status = dialog.querySelector('#session-status');
  let saving = false;
  let entries = [];
  let restoredCheckpoint;
  const nameKey = value => value.trim().normalize('NFC').toLocaleLowerCase('pl-PL');
  const entryLabel = entry => entry.savedAt === null ? entry.name : `${entry.name} · ${timestamp.format(entry.savedAt)}`;

  function readEntries() {
    const saved = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          const raw = localStorage.getItem(key);
          const value = JSON.parse(raw);
          if (typeof value?.name === 'string' && typeof value.session === 'string'
            && Number.isFinite(value.savedAt) && Math.abs(value.savedAt) <= 8.64e15) {
            saved.push({ key, name: value.name, savedAt: value.savedAt, session: value.session, raw });
          }
        } catch {
          // Uszkodzony wpis nie blokuje odczytania pozostałych zapisów.
        }
      }
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) saved.push({ key: legacyKey, name: 'Poprzedni zapis', savedAt: null, session: legacy, raw: legacy });
    } catch {
      return [];
    }
    return saved.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function renderList(selectedKey = '') {
    const options = entries.map(entry => new Option(entryLabel(entry), entry.key));
    if (saving) options.unshift(new Option('Nowy zapis', ''));
    list.replaceChildren(...options);
    if (options.some(option => option.value === selectedKey)) list.value = selectedKey;
    listField.hidden = list.disabled = entries.length === 0;
  }

  function hasCurrentSave() {
    if (!game.getState()) return false;
    const current = game.saveSession();
    const restoredSource = restoredCheckpoint?.current === current ? restoredCheckpoint.source : undefined;
    return readEntries().some(entry => entry.session === current || entry.session === restoredSource);
  }

  function open(mode) {
    if (dialog.open) return false;
    saving = mode === 'save';
    const state = game.getState();
    entries = readEntries();
    if (saving ? !state : !entries.length) return false;
    title.textContent = saving ? 'Zapisz sesję' : 'Wznów sesję';
    submit.textContent = title.textContent;
    listLabel.textContent = saving ? 'Zapisane sesje' : 'Zapisana sesja';
    nameField.hidden = name.disabled = !saving;
    if (saving) {
      name.value = name.defaultValue = `NL ${state.smallBlind}/${state.bigBlind} · rozdanie ${state.handNo}`;
    }
    renderList();
    showStatus('');
    dialog.returnValue = '';
    dialog.showModal();
    if (saving) {
      name.focus();
      name.select();
    } else list.focus();
    return true;
  }

  list.addEventListener('change', () => {
    if (!saving) return;
    name.value = entries.find(entry => entry.key === list.value)?.name ?? name.defaultValue;
    showStatus('');
  });

  name.addEventListener('input', () => {
    const selected = entries.find(entry => entry.key === list.value);
    if (selected && nameKey(selected.name) !== nameKey(name.value)) list.value = '';
    showStatus('');
  });

  async function saveCurrentSession() {
    const desiredName = name.value.trim() || name.defaultValue;
    const selectedKey = list.value;
    entries = readEntries();
    const selected = entries.find(entry => entry.key === selectedKey);
    if (selectedKey && !selected) {
      renderList();
      showStatus('Wybrany zapis już nie istnieje. Wybierz inny lub utwórz nowy zapis.');
      return;
    }

    const keyByName = nameKey(desiredName);
    const matches = entries.filter(entry => nameKey(entry.name) === keyByName);
    if (!selected && matches.length > 1) {
      renderList();
      showStatus('Kilka zapisów ma tę nazwę. Wybierz z listy ten, który chcesz nadpisać.');
      list.focus();
      return;
    }
    const existing = selected ?? matches[0];
    if (existing && !await confirmAction('Nadpisać zapis sesji?',
      `Zapis „${entryLabel(existing)}” już istnieje. Bieżąca sesja zastąpi ten zapis.`, 'Nadpisz zapis')) return;
    if (!dialog.open) return;

    try {
      if (existing && localStorage.getItem(existing.key) !== existing.raw) {
        entries = readEntries();
        renderList(existing.key);
        showStatus('Zapis zmienił się w innej karcie. Sprawdź listę i spróbuj ponownie.');
        return;
      }
      const storageKey = existing?.key ?? prefix + (crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-'));
      const session = game.saveSession();
      const value = storageKey === legacyKey ? session
        : JSON.stringify({ name: existing?.name ?? desiredName, savedAt: Date.now(), session });
      localStorage.setItem(storageKey, value);
      dialog.close('saved');
    } catch {
      showStatus('Nie udało się zapisać sesji w tej przeglądarce.');
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) {
      await saveCurrentSession();
      return;
    }

    const entry = entries.find(saved => saved.key === list.value);
    if (!entry) {
      showStatus('Wybierz zapisaną sesję.');
      return;
    }
    if (game.getState() && !await confirmAction('Wznowić zapisaną sesję?',
      'Bieżąca gra zostanie zastąpiona wybranym zapisem.', 'Wznów sesję')) return;
    try {
      game.restoreSession(entry.session);
      restoredCheckpoint = { source: entry.session, current: game.saveSession() };
      dialog.close('resumed');
    } catch {
      showStatus('Nie można odczytać tego zapisu sesji.');
    }
  });

  for (const button of dialog.querySelectorAll('#close-session-dialog, #cancel-session-dialog')) {
    button.addEventListener('click', () => dialog.close());
  }

  return { open, hasCurrentSave, hasSaves: () => readEntries().length > 0 };
}
