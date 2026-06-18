/**
 * 麻将牌定义
 *
 * 牌型：
 * - 万子: 一万~九万 (1-9)
 * - 条子: 一条~九条 (1-9)
 * - 筒子: 一筒~九筒 (1-9)
 * - 风牌: 东南西北
 * - 箭牌: 中发白
 *
 * 每张牌 4 个，共 136 张
 */

// ========== 牌型常量 ==========

const SUIT_WAN = 'wan';   // 万
const SUIT_TIAO = 'tiao'; // 条
const SUIT_TONG = 'tong'; // 筒

const WIND_DONG = 'dong'; // 东
const WIND_NAN = 'nan';   // 南
const WIND_XI = 'xi';     // 西
const WIND_BEI = 'bei';   // 北

const DRAGON_ZHONG = 'zhong'; // 中
const DRAGON_FA = 'fa';       // 发
const DRAGON_BAI = 'bai';     // 白

const SUITS = [SUIT_WAN, SUIT_TIAO, SUIT_TONG];
const WINDS = [WIND_DONG, WIND_NAN, WIND_XI, WIND_BEI];
const DRAGONS = [DRAGON_ZHONG, DRAGON_FA, DRAGON_BAI];

// 中文显示映射
const SUIT_NAMES = { wan: '万', tiao: '条', tong: '筒' };
const WIND_NAMES = { dong: '东', nan: '南', xi: '西', bei: '北' };
const DRAGON_NAMES = { zhong: '中', fa: '发', bai: '白' };
const NUM_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// ========== 牌类定义 ==========

/**
 * 创建一张数牌（万/条/筒）
 */
function createNumberTile(suit, number, copyIndex) {
  return {
    id: `${suit}_${number}_${copyIndex}`,
    type: 'number',
    suit,
    number,
    copyIndex,
    display: `${NUM_NAMES[number]}${SUIT_NAMES[suit]}`,
    sortKey: SUITS.indexOf(suit) * 10 + number,
  };
}

/**
 * 创建一张风牌
 */
function createWindTile(wind, copyIndex) {
  return {
    id: `wind_${wind}_${copyIndex}`,
    type: 'wind',
    wind,
    copyIndex,
    display: WIND_NAMES[wind],
    sortKey: 100 + WINDS.indexOf(wind),
  };
}

/**
 * 创建一张箭牌（中发白）
 */
function createDragonTile(dragon, copyIndex) {
  return {
    id: `dragon_${dragon}_${copyIndex}`,
    type: 'dragon',
    dragon,
    copyIndex,
    display: DRAGON_NAMES[dragon],
    sortKey: 200 + DRAGONS.indexOf(dragon),
  };
}

// ========== 生成整副牌 ==========

/**
 * 生成 136 张麻将牌
 */
function createAllTiles() {
  const tiles = [];

  // 数牌: 万条筒 x 1-9 x 4
  for (const suit of SUITS) {
    for (let num = 1; num <= 9; num++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push(createNumberTile(suit, num, copy));
      }
    }
  }

  // 风牌: 东南西北 x 4
  for (const wind of WINDS) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(createWindTile(wind, copy));
    }
  }

  // 箭牌: 中发白 x 4
  for (const dragon of DRAGONS) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push(createDragonTile(dragon, copy));
    }
  }

  return tiles; // 136 张
}

/**
 * 洗牌（Fisher-Yates）
 */
function shuffleTiles(tiles) {
  const arr = [...tiles];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 排序手牌
 */
function sortHand(hand) {
  return [...hand].sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * 判断两张牌是否相同类型（不考虑 copyIndex）
 */
function isSameTileType(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'number') return a.suit === b.suit && a.number === b.number;
  if (a.type === 'wind') return a.wind === b.wind;
  if (a.type === 'dragon') return a.dragon === b.dragon;
  return false;
}

/**
 * 获取牌的类型标识（用于分组）
 */
function getTileTypeKey(tile) {
  if (tile.type === 'number') return `n_${tile.suit}_${tile.number}`;
  if (tile.type === 'wind') return `w_${tile.wind}`;
  if (tile.type === 'dragon') return `d_${tile.dragon}`;
  return `unknown_${tile.id}`;
}

module.exports = {
  SUIT_WAN, SUIT_TIAO, SUIT_TONG,
  WIND_DONG, WIND_NAN, WIND_XI, WIND_BEI,
  DRAGON_ZHONG, DRAGON_FA, DRAGON_BAI,
  SUITS, WINDS, DRAGONS,
  SUIT_NAMES, WIND_NAMES, DRAGON_NAMES, NUM_NAMES,
  createAllTiles, shuffleTiles, sortHand,
  isSameTileType, getTileTypeKey,
};
