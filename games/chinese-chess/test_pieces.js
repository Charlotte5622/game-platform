/**
 * 象棋走法规则测试
 * 运行: node test_pieces.js
 */

const { createInitialPieces, isValidMove, getPieceAt, isInCheck, wouldBeInCheck } = require('./server/pieces');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

// 辅助: 创建简化棋盘
function board(defs) {
  return defs.map((d, i) => ({
    id: i, type: d[0], color: d[1], col: d[2], row: d[3],
    name: d[0],
  }));
}

console.log('\n♟ 象棋走法测试\n');

// ========== 車 ==========
console.log('【車】');
test('車直线走', () => {
  const pieces = board([['chariot', 'red', 0, 9], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  const car = pieces[0];
  assert(isValidMove(pieces, car, 0, 5) === true);
});
test('車不能斜走', () => {
  const pieces = board([['chariot', 'red', 0, 9], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 1, 8) === false);
});
test('車不能跳过棋子', () => {
  const pieces = board([['chariot', 'red', 0, 9], ['pawn', 'red', 0, 8], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 0, 7) === false);
});

// ========== 馬 ==========
console.log('\n【馬】');
test('馬走日字', () => {
  const pieces = board([['horse', 'red', 1, 9], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 2, 7) === true);
});
test('馬被蹩腿', () => {
  const pieces = board([['horse', 'red', 1, 9], ['pawn', 'red', 1, 8], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 2, 7) === false);
});

// ========== 炮 ==========
console.log('\n【炮】');
test('炮直线走(不吃)', () => {
  const pieces = board([['cannon', 'red', 1, 7], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 1, 4) === true);
});
test('炮隔一子吃', () => {
  const pieces = board([['cannon', 'red', 0, 7], ['pawn', 'red', 0, 6], ['chariot', 'black', 0, 3], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 0, 3) === true);
});
test('炮不能直接吃(无炮架)', () => {
  const pieces = board([['cannon', 'red', 0, 7], ['chariot', 'black', 0, 5], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 0, 5) === false);
});

// ========== 兵 ==========
console.log('\n【兵】');
test('兵未过河只能前进', () => {
  const pieces = board([['pawn', 'red', 0, 6], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 0, 5) === true);
  assert(isValidMove(pieces, pieces[0], 1, 6) === false); // 未过河不能横走
});
test('兵过河可横走', () => {
  const pieces = board([['pawn', 'red', 0, 4], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 1, 4) === true);
});
test('兵不能后退', () => {
  const pieces = board([['pawn', 'red', 0, 4], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 0, 5) === false);
});

// ========== 帅/将 ==========
console.log('\n【帅/将】');
test('帅走一步', () => {
  const pieces = board([['king', 'red', 4, 9]]);
  assert(isValidMove(pieces, pieces[0], 4, 8) === true);
});
test('帅不能出九宫', () => {
  const pieces = board([['king', 'red', 4, 9]]);
  assert(isValidMove(pieces, pieces[0], 4, 6) === false);
});
test('将帅不能面对面', () => {
  const pieces = board([['king', 'red', 4, 7], ['king', 'black', 4, 0]]);
  // 红帅移到4,6会和黑将面对面
  assert(isValidMove(pieces, pieces[0], 4, 6) === false);
});

// ========== 相/象 ==========
console.log('\n【相/象】');
test('相走田字', () => {
  const pieces = board([['elephant', 'red', 2, 9], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 4, 7) === true);
});
test('相被堵象眼', () => {
  const pieces = board([['elephant', 'red', 2, 9], ['pawn', 'red', 3, 8], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 4, 7) === false);
});
test('相不能过河', () => {
  const pieces = board([['elephant', 'red', 2, 5], ['king', 'red', 4, 9], ['king', 'black', 4, 0]]);
  assert(isValidMove(pieces, pieces[0], 4, 3) === false);
});

// ========== 将军判断 ==========
console.log('\n【将军】');
test('車将军', () => {
  const pieces = board([['king', 'red', 4, 9], ['chariot', 'black', 4, 5]]);
  assert(isInCheck(pieces, 'red') === true);
});
test('未被将军', () => {
  const pieces = board([['king', 'red', 4, 9], ['chariot', 'black', 3, 5]]);
  assert(isInCheck(pieces, 'red') === false);
});

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
console.log(`${'='.repeat(40)}\n`);
process.exit(failed > 0 ? 1 : 0);
