/**
 * 斗地主牌型定义和工具函数
 */

// 牌面值定义（用于比较大小）
const CARD_RANK = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  'JOKER_S': 16, 'JOKER_B': 17,
};

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

/**
 * 生成一副完整的 54 张牌
 */
function createDeck() {
  const deck = [];
  let id = 0;

  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({
        id: id++,
        rank,
        suit,
        value: CARD_RANK[rank],
        display: `${suit}${rank}`,
      });
    }
  }

  // 小王
  deck.push({ id: id++, rank: 'JOKER_S', suit: '', value: CARD_RANK.JOKER_S, display: '🃏小' });
  // 大王
  deck.push({ id: id++, rank: 'JOKER_B', suit: '', value: CARD_RANK.JOKER_B, display: '🃏大' });

  return deck;
}

/**
 * 洗牌（Fisher-Yates）
 */
function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 发牌：每人 17 张，3 张底牌
 */
function dealCards(deck) {
  const hands = [[], [], []];
  for (let i = 0; i < 51; i++) {
    hands[i % 3].push(deck[i]);
  }
  const kitty = [deck[51], deck[52], deck[53]];

  // 按牌值排序
  hands.forEach(hand => hand.sort((a, b) => a.value - b.value));

  return { hands, kitty };
}

/**
 * 判断牌型
 * 返回: { type: string, mainValue: number, length?: number } | null
 */
function getCardType(cards) {
  if (!cards || cards.length === 0) return null;

  const n = cards.length;
  const values = cards.map(c => c.value).sort((a, b) => a - b);
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  const groups = Object.entries(counts).map(([v, c]) => ({ value: parseInt(v), count: c }));
  groups.sort((a, b) => a.value - b.value);

  // 火箭：大小王
  if (n === 2 && values[0] === 16 && values[1] === 17) {
    return { type: 'rocket', mainValue: 17 };
  }

  // 炸弹：4 张相同
  if (n === 4 && groups.length === 1 && groups[0].count === 4) {
    return { type: 'bomb', mainValue: groups[0].value };
  }

  // 单张
  if (n === 1) {
    return { type: 'single', mainValue: values[0] };
  }

  // 对子
  if (n === 2 && groups.length === 1 && groups[0].count === 2) {
    return { type: 'pair', mainValue: groups[0].value };
  }

  // 三条
  if (n === 3 && groups.length === 1 && groups[0].count === 3) {
    return { type: 'trio', mainValue: groups[0].value };
  }

  // 三带一
  if (n === 4 && groups.length === 2) {
    const trio = groups.find(g => g.count === 3);
    const single = groups.find(g => g.count === 1);
    if (trio && single) {
      return { type: 'trio_single', mainValue: trio.value };
    }
  }

  // 三带二
  if (n === 5 && groups.length === 2) {
    const trio = groups.find(g => g.count === 3);
    const pair = groups.find(g => g.count === 2);
    if (trio && pair) {
      return { type: 'trio_pair', mainValue: trio.value };
    }
  }

  // 顺子：5+ 张连续单牌（不含 2 和王）
  if (n >= 5 && groups.length === n) {
    const allSingle = groups.every(g => g.count === 1);
    const noSpecial = values.every(v => v >= 3 && v <= 14);
    const consecutive = values[n - 1] - values[0] === n - 1;
    if (allSingle && noSpecial && consecutive) {
      return { type: 'straight', mainValue: values[0], length: n };
    }
  }

  // 连对：3+ 对连续对子
  if (n >= 6 && n % 2 === 0) {
    const allPairs = groups.every(g => g.count === 2);
    const noSpecial = groups.every(g => g.value >= 3 && g.value <= 14);
    const pairCount = n / 2;
    const consecutive = groups.length === pairCount &&
      groups[pairCount - 1].value - groups[0].value === pairCount - 1;
    if (allPairs && noSpecial && consecutive) {
      return { type: 'pair_straight', mainValue: groups[0].value, length: pairCount };
    }
  }

  // 飞机（连续三条）
  if (n >= 6 && n % 3 === 0) {
    const allTrios = groups.every(g => g.count === 3);
    const noSpecial = groups.every(g => g.value >= 3 && g.value <= 14);
    const trioCount = n / 3;
    const consecutive = groups.length === trioCount &&
      groups[trioCount - 1].value - groups[0].value === trioCount - 1;
    if (allTrios && noSpecial && consecutive) {
      return { type: 'plane', mainValue: groups[0].value, length: trioCount };
    }
  }

  // 飞机带单翼
  if (n >= 8 && n % 4 === 0) {
    const trios = groups.filter(g => g.count === 3);
    const singles = groups.filter(g => g.count === 1);
    if (trios.length >= 2 && trios.length === singles.length) {
      const noSpecial = trios.every(g => g.value >= 3 && g.value <= 14);
      trios.sort((a, b) => a.value - b.value);
      const consecutive = trios[trios.length - 1].value - trios[0].value === trios.length - 1;
      if (noSpecial && consecutive) {
        return { type: 'plane_single', mainValue: trios[0].value, length: trios.length };
      }
    }
  }

  // 飞机带双翼
  if (n >= 10 && n % 5 === 0) {
    const trios = groups.filter(g => g.count === 3);
    const pairs = groups.filter(g => g.count === 2);
    if (trios.length >= 2 && trios.length === pairs.length) {
      const noSpecial = trios.every(g => g.value >= 3 && g.value <= 14);
      trios.sort((a, b) => a.value - b.value);
      const consecutive = trios[trios.length - 1].value - trios[0].value === trios.length - 1;
      if (noSpecial && consecutive) {
        return { type: 'plane_pair', mainValue: trios[0].value, length: trios.length };
      }
    }
  }

  // 四带二（单）：四张相同 + 两张不同的单牌
  // 注意：四带二单和四带二对是不同牌型，只能同类型互压，不能跨类型
  if (n === 6) {
    const four = groups.find(g => g.count === 4);
    const singles = groups.filter(g => g.count === 1);
    if (four && singles.length === 2) {
      return { type: 'four_two_single', mainValue: four.value };
    }
  }

  // 四带二（对）：四张相同 + 两对
  if (n === 8) {
    const four = groups.find(g => g.count === 4);
    const pairs = groups.filter(g => g.count === 2);
    if (four && pairs.length === 2) {
      return { type: 'four_two_pair', mainValue: four.value };
    }
  }

  return null; // 无效牌型
}

/**
 * 判断 cards2 是否能压过 cards1
 */
function canBeat(cards1Type, cards2Type) {
  if (!cards1Type || !cards2Type) return false;

  // 火箭最大
  if (cards2Type.type === 'rocket') return true;
  if (cards1Type.type === 'rocket') return false;

  // 炸弹能压非炸弹
  if (cards2Type.type === 'bomb' && cards1Type.type !== 'bomb') return true;
  if (cards1Type.type === 'bomb' && cards2Type.type !== 'bomb') return false;

  // 同类型比较
  if (cards1Type.type === cards2Type.type) {
    // 顺子、连对、飞机需要长度相同
    if (cards1Type.length && cards2Type.length && cards1Type.length !== cards2Type.length) {
      return false;
    }
    return cards2Type.mainValue > cards1Type.mainValue;
  }

  return false;
}

module.exports = {
  CARD_RANK, SUITS, RANKS,
  createDeck, shuffleDeck, dealCards,
  getCardType, canBeat,
};
