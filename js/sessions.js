'use strict';

function createPokerSessions(dialog, game) {
  const prefix = 'poker-zone-session:';
  const legacyKey = 'poker-lab-saved-session';
  const timestamp = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'medium' });
  const title = dialog.querySelector('#session-title');
  const label = dialog.querySelector('#session-field-label');
  const form = dialog.querySelector('#session-form');
  const name = dialog.querySelector('#session-name');
  const list = dialog.querySelector('#session-list');
  const submit = dialog.querySelector('#submit-session');
  const status = dialog.querySelector('#session-status');
  let saving = false;
  let entries = [];

  function readEntries() {
    const saved = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          const value = JSON.parse(localStorage.getItem(key));
          if (typeof value?.name === 'string' && typeof value.session === 'string'
            && Number.isFinite(value.savedAt) && Math.abs(value.savedAt) <= 8.64e15) {
            saved.push({ key, name: value.name, savedAt: value.savedAt, session: value.session });
          }
        } catch {
          // Uszkodzony wpis nie blokuje odczytania pozostałych zapisów.
        }
      }
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) saved.push({ key: legacyKey, name: 'Poprzedni zapis', savedAt: null, session: legacy });
    } catch {
      return [];
    }
    return saved.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function open(mode) {
    if (dialog.open) return false;
    saving = mode === 'save';
    const state = game.getState();
    entries = saving ? [] : readEntries();
    if (saving ? !state : !entries.length) return false;
    title.textContent = submit.textContent = saving ? 'Zapisz sesję' : 'Wznów sesję';
    label.textContent = saving ? 'Nazwa sesji' : 'Zapisana sesja';
    label.htmlFor = saving ? name.id : list.id;
    name.hidden = name.disabled = !saving;
    list.hidden = list.disabled = saving;
    if (saving) {
      name.value = name.defaultValue = `NL ${state.smallBlind}/${state.bigBlind} · rozdanie ${state.handNo}`;
    } else {
      list.replaceChildren(...entries.map(entry => {
        const option = document.createElement('option');
        option.value = entry.key;
        option.textContent = entry.savedAt === null ? entry.name : `${entry.name} · ${timestamp.format(entry.savedAt)}`;
        return option;
      }));
    }
    showStatus('');
    dialog.returnValue = '';
    dialog.showModal();
    if (saving) {
      name.focus();
      name.select();
    } else list.focus();
    return true;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving) {
      try {
        const id = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-');
        const value = {
          name: name.value.trim() || name.defaultValue,
          savedAt: Date.now(),
          session: game.saveSession()
        };
        localStorage.setItem(prefix + id, JSON.stringify(value));
        dialog.close('saved');
      } catch {
        showStatus('Nie udało się zapisać sesji w tej przeglądarce.');
      }
      return;
    }

    const entry = entries.find(saved => saved.key === list.value);
    if (!entry) {
      showStatus('Wybierz zapisaną sesję.');
      return;
    }
    if (game.getState() && !confirm('Wznowić zapisaną sesję i zastąpić bieżący stan gry?')) return;
    try {
      game.restoreSession(entry.session);
      dialog.close('resumed');
    } catch {
      showStatus('Nie można odczytać tego zapisu sesji.');
    }
  });

  for (const button of dialog.querySelectorAll('#close-session-dialog, #cancel-session-dialog')) {
    button.addEventListener('click', () => dialog.close());
  }

  return { open, hasSaves: () => readEntries().length > 0 };
}
