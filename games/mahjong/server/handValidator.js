/**
 * 麻将和牌判断
 *
 * 标准和牌: 4 组面子(顺子/刻子) + 1 对将
 * 七对子: 7 对
 * 十三幺: 特殊牌型
 */

const { getTileTypeKey, SUITS, WINDS, DRAGONS } = require('./tiles');

/**
 * 判断手牌是否和牌
 * @param {Array} hand - 手牌（14张）
 * @returns {{ isWin: boolean, pattern: string|null }}
 */
function checkWin(hand) {
  if (hand.length !== 14) return { isWin: false, pattern: null };

  // 七对子
  if (checkSevenPairs(hand)) {
    return { isWin: true, pattern: '七对子' };
  }

  // 十三幺
  if (checkThirteenOrphans(hand)) {
    return { isWin: true, pattern: '十三幺' };
  }

  // 标准和牌: 4面子 + 1将
  if (checkStandardWin(hand)) {
    return { isWin: true, pattern: '标准和牌' };
  }

  return { isWin: false, pattern: null };
}

/**
 * 标准和牌判断
 * 思路：遍历每张牌作为将，剩余12张判断能否组成4个面子
 */
function checkStandardWin(hand) {
  const counts = tileCounts(hand);

  // 尝试每种牌型作为将
  for (const [key, count] of Object.entries(counts)) {
    if (count >= 2) {
      const remaining = { ...counts };
      remaining[key] -= 2;
      if (remaining[key] === 0) delete remaining[key];

      // 判断剩余能否组成4个面子
      if (canFormMelds(remaining, 4)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 判断剩余牌能否组成指定数量的面子
 */
function canFormMelds(counts, needed) {
  if (needed === 0) {
    // 所有牌都用完了
    return Object.values(counts).every(v => v === 0);
  }

  // 找到第一张有牌的
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return needed === 0;

  const [firstKey] = entries[0];
  const tile = keyToTile(firstKey);

  // 尝试刻子（3张相同）
  if (counts[firstKey] >= 3) {
    const next = { ...counts };
    next[firstKey] -= 3;
    if (next[firstKey] === 0) delete next[firstKey];
    if (canFormMelds(next, needed - 1)) return true;
  }

  // 尝试顺子（3张连续数牌）
  if (tile.type === 'number') {
    const next = { ...counts };
    const key2 = `n_${tile.suit}_${tile.number + 1}`;
    const key3 = `n_${tile.suit}_${tile.number + 2}`;

    if (tile.number <= 7 && (next[key2] || 0) > 0 && (next[key3] || 0) > 0) {
      next[firstKey]--;
      if (next[firstKey] === 0) delete next[firstKey];
      next[key2]--;
      if (next[key2] === 0) delete next[key2];
      next[key3]--;
      if (next[key3] === 0) delete next[key3];

      if (canFormMelds(next, needed - 1)) return true;
    }
  }

  return false;
}

/**
 * 七对子判断
 */
function checkSevenPairs(hand) {
  if (hand.length !== 14) return false;
  const counts = tileCounts(hand);
  return Object.values(counts).every(v => v === 2);
}

/**
 * 十三幺判断
 * 必须包含: 一万、九万、一条、九条、一筒、九筒、东南西北中发白 各一张 + 其中任意一张重复
 */
function checkThirteenOrphans(hand) {
  if (hand.length !== 14) return false;

  const required = [
    'n_wan_1', 'n_wan_9',
    'n_tiao_1', 'n_tiao_9',
    'n_tong_1', 'n_tong_9',
    'w_dong', 'w_nan', 'w_xi', 'w_bei',
    'd_zhong', 'd_fa', 'd_bai',
  ];

  const counts = tileCounts(hand);
  const keys = Object.keys(counts);

  // 必须恰好包含这13种牌
  for (const k of required) {
    if (!counts[k]) return false;
  }

  // 只能多一种牌（重复的那张）
  if (keys.length !== 14) return false;

  // 检查多出的那张是否在 required 中
  const extra = keys.find(k => !required.includes(k));
  if (extra) return false;

  // 检查是否有且仅有一张牌数量为2
  const values = Object.values(counts);
  return values.filter(v => v === 2).length === 1;
}

// ========== 工具函数 ==========

/**
 * 统计手牌中每种牌的数量
 * @returns {Object} { typeKey: count }
 */
function tileCounts(hand) {
  const counts = {};
  for (const tile of hand) {
    const key = getTileTypeKey(tile);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * 将 typeKey 还原为简单描述对象
 */
function keyToTile(key) {
  if (key.startsWith('n_')) {
    const [, suit, num] = key.split('_');
    return { type: 'number', suit, number: parseInt(num) };
  }
  if (key.startsWith('w_')) {
    return { type: 'wind', wind: key.split('_')[1] };
  }
  if (key.startsWith('d_')) {
    return { type: 'dragon', dragon: key.split('_')[1] };
  }
  return { type: 'unknown' };
}

/**
 * 判断打出一张牌后，其他人能否碰/杠
 */
function canPung(hand, discardedTile) {
  const key = getTileTypeKey(discardedTile);
  const count = hand.filter(t => getTileTypeKey(t) === key).length;
  return count >= 2;
}

/**
 * 判断能否明杠
 */
function canKong(hand, discardedTile) {
  const key = getTileTypeKey(discardedTile);
  const count = hand.filter(t => getTileTypeKey(t) === key).length;
  return count >= 3;
}

/**
 * 判断能否暗杠（手牌中有4张相同）
 */
function canConcealedKong(hand) {
  const counts = tileCounts(hand);
  return Object.entries(counts)
    .filter(([, v]) => v === 4)
    .map(([k]) => k);
}

/**
 * 判断能否吃（只能吃上家的牌）
 * @param {Array} hand - 手牌
 * @param {Object} discardedTile - 被打出的牌
 * @returns {Array} 可能的吃法 [{tile1, tile2}]
 */
function canChow(hand, discardedTile) {
  if (discardedTile.type !== 'number') return [];

  const results = [];
  const suit = discardedTile.suit;
  const num = discardedTile.number;

  // 检查手牌中的数牌
  const hasTile = (s, n) => hand.some(t =>
    t.type === 'number' && t.suit === s && t.number === n
  );

  // 吃法: [num-2, num-1, num]
  if (num >= 3 && hasTile(suit, num - 2) && hasTile(suit, num - 1)) {
    results.push([
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num - 2),
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num - 1),
    ]);
  }

  // 吃法: [num-1, num, num+1]
  if (num >= 2 && num <= 8 && hasTile(suit, num - 1) && hasTile(suit, num + 1)) {
    results.push([
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num - 1),
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num + 1),
    ]);
  }

  // 吃法: [num, num+1, num+2]
  if (num <= 7 && hasTile(suit, num + 1) && hasTile(suit, num + 2)) {
    results.push([
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num + 1),
      hand.find(t => t.type === 'number' && t.suit === suit && t.number === num + 2),
    ]);
  }

  return results;
}

/**
 * 判断摸牌后能否自摸和牌
 */
function canSelfWin(hand) {
  return checkWin(hand).isWin;
}

module.exports = {
  checkWin,
  canPung,
  canKong,
  canConcealedKong,
  canChow,
  canSelfWin,
  tileCounts,
};
