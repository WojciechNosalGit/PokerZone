'use strict';

const pokerBots = (() => {
  const { fullDeck, randomIndex, rank5, score7, currentHandScore, compareScore } = pokerCards;
  const cardId = card => card.r + ':' + card.s;

  function estimateEquity(player, board, opponentCount, simulations, drawIndex = randomIndex, opponentWeight) {
    if (opponentCount <= 0) return 1;

    // Symulacja losuje przyszłe karty wspólne i karty przeciwników z nieznanej części talii.
    const knownIds = new Set([...player.hand, ...board].map(cardId));
    const unseen = fullDeck().filter(card => !knownIds.has(cardId(card)));
    const missing = 5 - board.length;
    const drawCount = missing + opponentCount * 2;
    let total = 0;
    let totalWeight = 0;

    for (let trial = 0; trial < simulations; trial++) {
      const bag = unseen.slice();
      for (let i = 0; i < drawCount; i++) {
        const j = i + drawIndex(bag.length - i);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const simulatedBoard = board.concat(bag.slice(0, missing));
      const ownScore = score7([...player.hand, ...simulatedBoard]);
      const weight = opponentWeight?.(bag.slice(missing, missing + 2)) ?? 1;
      totalWeight += weight;
      let tied = 1;
      let lost = false;

      for (let opponent = 0; opponent < opponentCount; opponent++) {
        const offset = missing + opponent * 2;
        const opponentScore = score7([...bag.slice(offset, offset + 2), ...simulatedBoard]);
        const comparison = compareScore(ownScore, opponentScore);
        if (comparison < 0) {
          lost = true;
          break;
        }
        if (comparison === 0) tied++;
      }
      if (!lost) total += weight / tied;
    }
    return total / totalWeight;
  }

  function heroStyleAdjustment(stats, heroInHand, lastAggressor) {
    if (stats.hands < 4 || !heroInHand) return 0;
    const vpip = stats.vpip / stats.hands;
    const pfr = stats.pfr / stats.hands;
    let adjustment = vpip >= 0.58 ? -0.035 : vpip <= 0.25 ? 0.035 : 0;
    if (lastAggressor === 0 && pfr < 0.16) adjustment += 0.025;
    if (lastAggressor === 0 && pfr > 0.34) adjustment -= 0.02;
    return adjustment;
  }

  function preflopTier([a, b], widerRange = false) {
    const high = Math.max(a.r, b.r);
    const low = Math.min(a.r, b.r);
    const paired = high === low;
    const suited = a.s === b.s;
    const broadway = high > low && low >= 10;
    if ((paired && high >= 10) || (high === 14 && low >= 12) || (suited && high === 13 && low === 12)) return 3;
    if ((paired && high >= 6) || (broadway && (suited || high >= 13)) || (high === 14 && low >= 9)) return 2;
    if (paired || broadway || (suited && (high === 14 || (high >= 8 && high - low <= 2)))) return 1;
    if (widerRange && suited && ((high >= 5 && high - low === 1) || (high >= 11 && low >= 8))) return 1;
    return 0;
  }

  function preflopAction(player, { currentBet, bigBlind, lastAggressor, potSize }, { price, odds, equity, mayRaise }) {
    const lowStakes = bigBlind === 10;
    const raised = lastAggressor != null || currentBet > bigBlind;
    const latePosition = ['HJ', 'CO', 'BTN', 'BTN / SB'].includes(player.position);
    const favourableSeat = latePosition || player.position === 'BB';
    const widerRange = lowStakes && favourableSeat;
    const tier = preflopTier(player.hand, widerRange);

    if (mayRaise && tier === 3 && (!raised || (currentBet <= 6 * bigBlind && equity >= odds + 0.13))) return 'raise';
    if (mayRaise && tier === 2 && !raised && (favourableSeat || Math.random() < 0.55)) return 'raise';

    if (lowStakes && latePosition && tier === 1 && !raised && mayRaise && price > 0 && potSize <= 3 * bigBlind) {
      const openingChance = player.kind === 'tight' ? 0.40 : player.kind === 'loose' ? 0.68 : 0.54;
      if (Math.random() < openingChance) return 'raise';
    }

    if (!price) return 'check';
    if (!tier) return 'fold';
    if (tier === 3) return equity >= odds + 0.02 ? 'call' : 'fold';
    if (tier === 2) return price <= 5 * bigBlind && equity >= odds + 0.075 ? 'call' : 'fold';

    const maxPrice = (favourableSeat ? 2 : 1) * bigBlind;
    const maxOdds = widerRange ? 0.30 : favourableSeat ? 0.25 : 0.19;
    const equityMargin = widerRange ? 0.06 : 0.085;
    return price <= maxPrice && odds <= maxOdds && equity >= odds + equityMargin ? 'call' : 'fold';
  }

  function madeStrength(hand, board, boardScore) {
    const score = currentHandScore(hand, board);
    if (boardScore && compareScore(score, boardScore) === 0) return 0;

    const paired = hand[0].r === hand[1].r;
    const matched = hand.filter(card => board.some(community => community.r === card.r));
    const privatePair = paired ? hand[0].r : Math.max(0, ...matched.map(card => card.r));
    if (score[0] >= 4 || (score[0] === 3 && privatePair) || (score[0] === 2 && !paired && matched.length === 2)) return 3;
    if (privatePair === 0) return 0;
    return privatePair >= Math.max(...board.map(card => card.r)) ? 2 : 1;
  }

  function drawOuts(hand, board, strength) {
    if (board.length === 5 || strength === 3) return 0;
    const cards = [...hand, ...board];
    const flushDraw = hand.some(card => cards.filter(other => other.s === card.s).length === 4);
    const boardRanks = new Set(board.map(card => card.r));
    const privateRanks = new Set(hand.map(card => card.r).filter(rank => !boardRanks.has(rank)));
    const ranks = new Set([...boardRanks, ...privateRanks]);
    if (ranks.has(14)) ranks.add(1);
    if (privateRanks.has(14)) privateRanks.add(1);

    const outs = new Set();
    for (let high = 5; high <= 14; high++) {
      let missing = 0;
      let count = 0;
      let usesPrivateRank = false;
      for (let rank = high - 4; rank <= high; rank++) {
        if (privateRanks.has(rank)) usesPrivateRank = true;
        if (!ranks.has(rank)) {
          missing = rank;
          count++;
        }
      }
      if (usesPrivateRank && count === 1) outs.add(missing);
    }
    return (flushDraw ? 9 : 0) + outs.size * (flushDraw ? 3 : 4);
  }

  function bettingRangeWeight(hand, board, boardScore, odds, widerPreflop) {
    if (!board.length) return [0.10, 0.30, 0.72, 1][preflopTier(hand, widerPreflop)];
    const strength = madeStrength(hand, board, boardScore);
    if (strength === 3) return 1;
    const largeBet = odds >= 0.28;
    if (strength === 2) return largeBet ? 0.75 : 0.95;
    if (strength === 1) return largeBet ? 0.24 : 0.55;
    if (drawOuts(hand, board, strength) >= 8) return largeBet ? 0.36 : 0.60;
    return largeBet ? 0.07 : 0.16;
  }

  function postflopAction(player, table, { price, odds, equity, mayRaise, boardScore }) {
    const { board, opponentCount, stats, heroInHand, lastAggressor } = table;
    if (boardScore?.[0] === 8 && boardScore[1] === 14) return price ? 'call' : 'check';
    const strength = madeStrength(player.hand, board, boardScore);
    const outs = drawOuts(player.hand, board, strength);
    const tight = player.kind === 'tight';
    const personality = tight ? 0.025 : player.kind === 'loose' ? -0.018 : 0;
    const memory = heroStyleAdjustment(stats, heroInHand, lastAggressor) * 0.6;
    const value = strength >= 2 && equity >= Math.max(0.62 + personality + memory, odds + 0.14);

    if (price > 0) {
      if (!strength) {
        if (!outs) return 'fold';
        const unknown = 50 - board.length;
        const miss = (unknown - outs) / unknown;
        const drawChance = 1 - miss * (board.length === 3 ? (unknown - outs - 1) / (unknown - 1) : 1);
        if (drawChance * 0.92 < odds + 0.035 + 0.012 * (opponentCount - 1)) return 'fold';
      }
      const margin = 0.048 + 0.012 * (opponentCount - 1) + personality + memory;
      if (equity < odds + margin) return 'fold';
      return mayRaise && value && Math.random() < (tight ? 0.34 : 0.48) ? 'raise' : 'call';
    }

    const semiBluff = !strength && outs >= 8 && opponentCount === 1 && Math.random() < (tight ? 0.03 : 0.09);
    return mayRaise && ((value && Math.random() < (tight ? 0.60 : 0.76)) || semiBluff) ? 'raise' : 'check';
  }

  function chooseAction(player, table) {
    const { board, opponentCount, potSize, contestablePot, currentBet, lastRaise, minRaiseTo, smallBlind, bigBlind } = table;
    const price = Math.min(Math.max(0, currentBet - player.bet), player.stack);
    const odds = price / ((contestablePot ?? potSize) + price || 1);
    const preflop = board.length === 0;
    const boardScore = board.length === 5 ? rank5(board) : null;
    const maxRaiseTo = player.bet + player.stack;
    const mayRaise = player.canRaise && maxRaiseTo > currentBet && maxRaiseTo >= minRaiseTo;
    // Jedna losowana ręka reprezentuje gracza, który postawił obserwowany zakład.
    const opponentWeight = price && table.lastAggressor != null && table.lastAggressor !== player.id
      ? hand => bettingRangeWeight(hand, board, boardScore, odds, bigBlind === 10) : undefined;
    const equity = estimateEquity(player, board, opponentCount, preflop ? 160 : 210, randomIndex, opponentWeight);
    const analysis = { equity, potOdds: odds };
    const decision = { price, odds, equity, mayRaise, boardScore };
    const type = preflop ? preflopAction(player, table, decision) : postflopAction(player, table, decision);
    if (type !== 'raise') return { type, analysis };

    const limpers = Math.max(0, Math.floor((potSize - smallBlind - bigBlind) / bigBlind));
    const openingTarget = bigBlind * (3 + Math.min(3, limpers));
    const preflopTarget = table.lastAggressor == null ? openingTarget : currentBet * 3;
    const potFraction = player.kind === 'loose' ? 0.7 : 0.5;
    const postflopSize = Math.max(lastRaise, Math.round(potSize * potFraction / smallBlind) * smallBlind, bigBlind);
    const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, preflop ? preflopTarget : currentBet + postflopSize));
    return { type, target, analysis };
  }

  return { chooseAction, estimateEquity };
})();
