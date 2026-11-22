'use strict';

const createPokerHistory = (() => {
  const filename = 'poker-lab-historia.json';
  const schemaVersion = 1;
  const directoryKey = 'history-directory';
  const writeAccess = { mode: 'readwrite' };
  const compareHands = (a, b) => a.finishedAt.localeCompare(b.finishedAt) || a.id.localeCompare(b.id);

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('poker-lab-history', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('hands', { keyPath: 'id' });
        request.result.createObjectStore('settings');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function useStore(database, name, mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(name, mode);
      transaction.onabort = () => reject(transaction.error);
      const request = operation(transaction.objectStore(name));
      transaction.oncomplete = () => resolve(request?.result);
    });
  }

  function decode(text) {
    if (!text.trim()) return [];
    const document = JSON.parse(text.trim());
    const isAmount = amount => Number.isSafeInteger(amount) && amount >= 0;
    const isCard = card => Number.isInteger(card?.r) && card.r >= 2 && card.r <= 14
      && ['♠', '♥', '♦', '♣'].includes(card.s);
    const isCards = (cards, lengths) => Array.isArray(cards) && lengths.includes(cards.length) && cards.every(isCard);
    const isAction = action => ['preflop', 'flop', 'turn', 'river'].includes(action?.street)
      && ['fold', 'check', 'call', 'raise'].includes(action.type)
      && [action.chips, action.betTo, action.toCall].every(isAmount);
    const isOpponent = opponent => typeof opponent?.name === 'string' && isAmount(opponent.seat)
      && typeof opponent.revealed === 'boolean'
      && (opponent.cards === null && !opponent.revealed || isCards(opponent.cards, [2]));
    const isHand = hand => typeof hand?.id === 'string' && typeof hand.sessionId === 'string'
      && typeof hand.finishedAt === 'string' && Number.isFinite(Date.parse(hand.finishedAt))
      && ['showdown', 'fold'].includes(hand.ending)
      && [hand.handNumber, hand.pot, hand.dealerSeat, hand.smallBlindSeat, hand.bigBlindSeat,
        hand.smallBlind, hand.bigBlind].every(isAmount)
      && isCards(hand.board, [0, 3, 4, 5])
      && isCards(hand.hero?.cards, [2])
      && [hand.hero.startingStack, hand.hero.endingStack, hand.hero.contributed, hand.hero.payout].every(isAmount)
      && typeof hand.hero.folded === 'boolean'
      && Array.isArray(hand.hero.actions) && hand.hero.actions.every(isAction)
      && Array.isArray(hand.opponents) && hand.opponents.every(isOpponent);

    if (document?.schemaVersion !== schemaVersion || !Array.isArray(document.hands)
      || !document.hands.every(isHand)) {
      throw new SyntaxError('Nieobsługiwany format historii.');
    }
    return document.hands;
  }

  function encode(hands) {
    return JSON.stringify({ schemaVersion, hands: [...hands].sort(compareHands) }, null, 2) + '\n';
  }

  return function createHistory(onChange) {
    const database = openDatabase().catch(() => null);
    const hands = new Map();
    const canChooseFolder = typeof window.showDirectoryPicker === 'function';
    let entries = [];
    let queue = Promise.resolve();
    let directory = null;
    let fileState = 'off';
    let storageWarning = false;
    let choosing = false;

    function publish() {
      onChange({ entries, filename, fileState, directoryName: directory?.name, canChooseFolder, storageWarning, choosing });
    }

    function merge(records) {
      const added = [];
      for (const record of records) {
        if (!hands.has(record.id)) {
          hands.set(record.id, record);
          added.push(record);
        }
      }
      if (added.length) entries = [...hands.values()].sort((a, b) => compareHands(b, a));
      return added;
    }

    function enqueue(operation) {
      const task = queue.then(operation);
      queue = task.catch(() => {});
      return task;
    }

    async function persist(storeName, operation) {
      try {
        const db = await database;
        if (!db) throw new Error('IndexedDB is unavailable');
        return await useStore(db, storeName, 'readwrite', operation);
      } catch {
        storageWarning = true;
      }
    }

    const saveRecords = records => persist('hands', store => {
      for (const record of records) store.put(record);
    });

    async function syncFile() {
      const sync = async () => {
        const handle = await directory.getFileHandle(filename, { create: true });
        const saved = await handle.getFile();
        const original = await saved.text();
        const imported = merge(decode(original));
        if (imported.length) await saveRecords(imported);
        const updated = encode(hands.values());
        if (original === updated) return;

        const writer = await handle.createWritable({ mode: 'exclusive' });
        try {
          await writer.write(updated);
          await writer.close();
        } catch (error) {
          await writer.abort().catch(() => {});
          throw error;
        }
      };
      try {
        if (navigator.locks) await navigator.locks.request(filename, sync);
        else await sync();
        fileState = 'active';
      } catch (error) {
        fileState = error instanceof SyntaxError ? 'invalid' : 'error';
      }
    }

    void enqueue(async () => {
      const db = await database;
      try {
        if (!db) throw new Error('IndexedDB is unavailable');
        const [saved, previousDirectory] = await Promise.all([
          useStore(db, 'hands', 'readonly', store => store.getAll()),
          useStore(db, 'settings', 'readonly', store => store.get(directoryKey))
        ]);
        merge(saved);
        directory = previousDirectory || null;
      } catch {
        storageWarning = true;
      }
      if (directory) {
        try {
          fileState = 'permission';
          if (await directory.queryPermission(writeAccess) === 'granted') await syncFile();
        } catch {
          fileState = 'error';
        }
      }
      publish();
    });

    function add(record) {
      if (!merge([record]).length) return;
      publish();
      return enqueue(async () => {
        await saveRecords([record]);
        if (directory && fileState === 'active') await syncFile();
        publish();
      });
    }

    async function connect(pick) {
      if (choosing) return;
      choosing = true;
      publish();
      try {
        // Wywołanie pickera lub prośby o dostęp musi nastąpić podczas kliknięcia.
        const selected = pick
          ? await window.showDirectoryPicker({ ...writeAccess, id: 'poker-lab-history' })
          : directory;
        if (!selected) return;
        const permission = pick ? 'granted' : await selected.requestPermission(writeAccess);
        await enqueue(async () => {
          directory = selected;
          if (permission === 'granted') {
            await syncFile();
            if (fileState === 'active') await persist('settings', store => store.put(selected, directoryKey));
          } else {
            fileState = 'permission';
          }
        });
      } catch (error) {
        if (error.name !== 'AbortError' && fileState !== 'active') fileState = 'error';
      } finally {
        choosing = false;
        publish();
      }
    }

    function download() {
      const url = URL.createObjectURL(new Blob([encode(hands.values())], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importFile(file) {
      const records = decode(await file.text());
      return enqueue(async () => {
        const imported = merge(records);
        if (imported.length) await saveRecords(imported);
        if (directory && fileState === 'active') await syncFile();
        publish();
        return imported.length;
      });
    }

    return { add, chooseFolder: () => connect(true), resume: () => connect(false), download, importFile };
  };
})();
