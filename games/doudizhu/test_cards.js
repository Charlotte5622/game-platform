/**
 * 斗地主牌型判断测试
 * 运行: node test_cards.js
 */

const { getCardType, canBeat, createDeck, shuffleDeck, dealCards } = require('./server/cards');

// 辅助函数：快速创建卡牌
function card(rank, suit = '♠') {
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const idx = RANKS.indexOf(rank);
  const values = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15 };
  if (rank === 'JOKER_S') return { id: 100, rank: 'JOKER_S', suit: '', value: 16, display: '🃏小' };
  if (rank === 'JOKER_B') return { id: 101, rank: 'JOKER_B', suit: '', value: 17, display: '🃏大' };
  return { id: idx * 4 + '♠♥♣♦'.indexOf(suit), rank, suit, value: values[rank], display: `${suit}${rank}` };
}

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

console.log('\n🃏 牌型判断测试\n');

// ========== 单张 ==========
console.log('【单张】');
test('3', () => assert(getCardType([card('3')]).type === 'single'));
test('A', () => assert(getCardType([card('A')]).type === 'single'));
test('小王', () => assert(getCardType([card('JOKER_S')]).type === 'single'));

// ========== 对子 ==========
console.log('\n【对子】');
test('3-3', () => assert(getCardType([card('3', '♠'), card('3', '♥')]).type === 'pair'));
test('A-A', () => assert(getCardType([card('A', '♠'), card('A', '♥')]).type === 'pair'));

// ========== 三条 ==========
console.log('\n【三条】');
test('3-3-3', () => assert(getCardType([card('3', '♠'), card('3', '♥'), card('3', '♣')]).type === 'trio'));

// ========== 三带一 ==========
console.log('\n【三带一】');
test('3-3-3-4', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('3', '♣'), card('4')];
  assert(getCardType(cards).type === 'trio_single');
});

// ========== 三带二 ==========
console.log('\n【三带二】');
test('3-3-3-4-4', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('3', '♣'), card('4', '♠'), card('4', '♥')];
  assert(getCardType(cards).type === 'trio_pair');
});

// ========== 顺子 ==========
console.log('\n【顺子】');
test('3-4-5-6-7', () => {
  const cards = [card('3'), card('4'), card('5'), card('6'), card('7')];
  assert(getCardType(cards).type === 'straight');
  assert(getCardType(cards).length === 5);
});
test('10-J-Q-K-A', () => {
  const cards = [card('10'), card('J'), card('Q'), card('K'), card('A')];
  assert(getCardType(cards).type === 'straight');
});
test('含2不算顺子', () => {
  const cards = [card('J'), card('Q'), card('K'), card('A'), card('2')];
  assert(getCardType(cards) === null);
});

// ========== 连对 ==========
console.log('\n【连对】');
test('3-3-4-4-5-5', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('4', '♠'), card('4', '♥'), card('5', '♠'), card('5', '♥')];
  assert(getCardType(cards).type === 'pair_straight');
  assert(getCardType(cards).length === 3);
});

// ========== 炸弹 ==========
console.log('\n【炸弹】');
test('3-3-3-3', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('3', '♣'), card('3', '♦')];
  assert(getCardType(cards).type === 'bomb');
});

// ========== 火箭 ==========
console.log('\n【火箭】');
test('大小王', () => {
  const cards = [card('JOKER_S'), card('JOKER_B')];
  assert(getCardType(cards).type === 'rocket');
});

// ========== 飞机 ==========
console.log('\n【飞机】');
test('3-3-3-4-4-4', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('3', '♣'), card('4', '♠'), card('4', '♥'), card('4', '♣')];
  assert(getCardType(cards).type === 'plane');
});
test('3-3-3-4-4-4-5-6 (飞机带单翼)', () => {
  const cards = [
    card('3', '♠'), card('3', '♥'), card('3', '♣'),
    card('4', '♠'), card('4', '♥'), card('4', '♣'),
    card('5'), card('6'),
  ];
  assert(getCardType(cards).type === 'plane_single');
});

// ========== 四带二 ==========
console.log('\n【四带二】');
test('3-3-3-3-4-5 (四带二单)', () => {
  const cards = [card('3', '♠'), card('3', '♥'), card('3', '♣'), card('3', '♦'), card('4'), card('5')];
  assert(getCardType(cards).type === 'four_two_single');
});

// ========== canBeat 测试 ==========
console.log('\n\n🃏 大小比较测试\n');

test('单张: A > K', () => {
  const a = getCardType([card('A')]);
  const k = getCardType([card('K')]);
  assert(canBeat(k, a) === true);
  assert(canBeat(a, k) === false);
});

test('对子: AA > KK', () => {
  const aa = getCardType([card('A', '♠'), card('A', '♥')]);
  const kk = getCardType([card('K', '♠'), card('K', '♥')]);
  assert(canBeat(kk, aa) === true);
});

test('炸弹 > 单张', () => {
  const bomb = getCardType([card('3', '♠'), card('3', '♥'), card('3', '♣'), card('3', '♦')]);
  const single = getCardType([card('A')]);
  assert(canBeat(single, bomb) === true);
});

test('火箭 > 炸弹', () => {
  const rocket = getCardType([card('JOKER_S'), card('JOKER_B')]);
  const bomb = getCardType([card('2', '♠'), card('2', '♥'), card('2', '♣'), card('2', '♦')]);
  assert(canBeat(bomb, rocket) === true);
});

test('顺子需要长度相同', () => {
  const s5 = getCardType([card('3'), card('4'), card('5'), card('6'), card('7')]);
  const s6 = getCardType([card('3'), card('4'), card('5'), card('6'), card('7'), card('8')]);
  assert(canBeat(s5, s6) === false);
});

// ========== 发牌测试 ==========
console.log('\n\n🃏 发牌测试\n');

test('54张牌', () => {
  const deck = createDeck();
  assert(deck.length === 54, `期望54张，实际${deck.length}张`);
});

test('发牌每人17张 + 3张底牌', () => {
  const deck = shuffleDeck(createDeck());
  const { hands, kitty } = dealCards(deck);
  assert(hands[0].length === 17);
  assert(hands[1].length === 17);
  assert(hands[2].length === 17);
  assert(kitty.length === 3);
});

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
