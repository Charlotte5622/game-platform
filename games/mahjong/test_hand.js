/**
 * 麻将和牌判断测试
 * 运行: node test_hand.js
 */

const { createAllTiles, getTileTypeKey, sortHand } = require('./server/tiles');
const { checkWin, canPung, canKong, canChow } = require('./server/handValidator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// 辅助: 从牌堆中找牌
function findTile(suit, number) {
  const all = createAllTiles();
  return all.find(t => t.type === 'number' && t.suit === suit && t.number === number);
}

function findWind(wind) {
  const all = createAllTiles();
  return all.find(t => t.type === 'wind' && t.wind === wind);
}

function findDragon(dragon) {
  const all = createAllTiles();
  return all.find(t => t.type === 'dragon' && t.dragon === dragon);
}

console.log('\n🀄 麻将和牌测试\n');

// ========== 标准和牌: 4面子 + 1将 ==========
console.log('【标准和牌】');

test('4个顺子 + 1对将', () => {
  // 一二三万 x4 + 一对五万
  const hand = [
    findTile('wan', 1), findTile('wan', 2), findTile('wan', 3),
    findTile('wan', 1), findTile('wan', 2), findTile('wan', 3),
    findTile('wan', 1), findTile('wan', 2), findTile('wan', 3),
    findTile('tiao', 5), findTile('tiao', 6), findTile('tiao', 7),
    findTile('tong', 5), findTile('tong', 5),
  ];
  assert(checkWin(hand).isWin === true);
});

test('4个刻子 + 1对将', () => {
  // 3张一万x4 + 一对东
  const hand = [
    findTile('wan', 1), findTile('wan', 1), findTile('wan', 1),
    findTile('wan', 2), findTile('wan', 2), findTile('wan', 2),
    findTile('tiao', 3), findTile('tiao', 3), findTile('tiao', 3),
    findTile('tong', 4), findTile('tong', 4), findTile('tong', 4),
    findWind('dong'), findWind('dong'),
  ];
  assert(checkWin(hand).isWin === true);
});

test('混合面子 + 将', () => {
  const hand = [
    findTile('wan', 1), findTile('wan', 2), findTile('wan', 3), // 顺子
    findTile('wan', 5), findTile('wan', 5), findTile('wan', 5), // 刻子
    findTile('tiao', 7), findTile('tiao', 8), findTile('tiao', 9), // 顺子
    findTile('tong', 2), findTile('tong', 3), findTile('tong', 4), // 顺子
    findDragon('zhong'), findDragon('zhong'), // 将
  ];
  assert(checkWin(hand).isWin === true);
});

// ========== 七对子 ==========
console.log('\n【七对子】');

test('七对子', () => {
  const hand = [
    findTile('wan', 1), findTile('wan', 1),
    findTile('wan', 3), findTile('wan', 3),
    findTile('tiao', 5), findTile('tiao', 5),
    findTile('tong', 7), findTile('tong', 7),
    findWind('dong'), findWind('dong'),
    findWind('nan'), findWind('nan'),
    findDragon('fa'), findDragon('fa'),
  ];
  assert(checkWin(hand).isWin === true);
  assert(checkWin(hand).pattern === '七对子');
});

// ========== 非和牌 ==========
console.log('\n【非和牌】');

test('只有13张', () => {
  const hand = [
    findTile('wan', 1), findTile('wan', 2), findTile('wan', 3),
    findTile('wan', 4), findTile('wan', 5), findTile('wan', 6),
    findTile('wan', 7), findTile('wan', 8), findTile('wan', 9),
    findTile('tiao', 1), findTile('tiao', 2), findTile('tiao', 3),
    findTile('tong', 1),
  ];
  assert(checkWin(hand).isWin === false);
});

test('无法组成面子', () => {
  const hand = [
    findTile('wan', 1), findTile('wan', 1), findTile('wan', 1),
    findTile('wan', 2), findTile('wan', 2), findTile('wan', 2),
    findTile('wan', 3), findTile('wan', 3), findTile('wan', 3),
    findTile('tiao', 1), findTile('tiao', 2), findTile('tiao', 4), // 缺3
    findTile('tong', 5), findTile('tong', 5),
  ];
  assert(checkWin(hand).isWin === false);
});

// ========== 碰/杠/吃判断 ==========
console.log('\n【碰/杠/吃】');

test('能碰', () => {
  const hand = [findTile('wan', 5), findTile('wan', 5)];
  const discarded = findTile('wan', 5);
  assert(canPung(hand, discarded) === true);
});

test('不能碰（只有1张）', () => {
  const hand = [findTile('wan', 5)];
  const discarded = findTile('wan', 5);
  assert(canPung(hand, discarded) === false);
});

test('能杠', () => {
  const hand = [findTile('wan', 5), findTile('wan', 5), findTile('wan', 5)];
  const discarded = findTile('wan', 5);
  assert(canKong(hand, discarded) === true);
});

test('能吃（连续）', () => {
  const hand = [findTile('wan', 3), findTile('wan', 4)];
  const discarded = findTile('wan', 5);
  const result = canChow(hand, discarded);
  assert(result.length === 1); // 只有一种吃法: 3-4-5
});

test('能吃（多种吃法）', () => {
  const hand = [findTile('wan', 3), findTile('wan', 4), findTile('wan', 6)];
  const discarded = findTile('wan', 5);
  const result = canChow(hand, discarded);
  assert(result.length === 2); // 3-4-5 和 4-5-6
});

test('不能吃风牌', () => {
  const hand = [findWind('dong')];
  const discarded = findWind('nan');
  const result = canChow(hand, discarded);
  assert(result.length === 0);
});

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
