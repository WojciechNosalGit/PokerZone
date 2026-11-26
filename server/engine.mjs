import { randomInt, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const context = createContext({ crypto: webcrypto, setTimeout, clearTimeout });
for (const name of ['cards', 'avatars', 'chips', 'bots', 'game']) {
  const script = new URL(`../js/${name}.js`, import.meta.url);
  runInContext(readFileSync(script, 'utf8'), context, { filename: script.pathname });
}

export const { createGame, stakes, buyInFor, minPlayers, maxPlayers } = runInContext('pokerGame', context);
export const { isPreset: isAvatarPreset } = runInContext('pokerAvatars', context);
const { fullDeck } = runInContext('pokerCards', context);

export function shuffleForOnline() {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const other = randomInt(i + 1);
    [deck[i], deck[other]] = [deck[other], deck[i]];
  }
  return deck;
}
