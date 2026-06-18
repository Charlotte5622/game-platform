/**
 * 中国象棋棋子定义与走法规则
 *
 * 棋盘: 9列 x 10行 (col 0-8, row 0-9)
 * 红方在下 (row 5-9), 黑方在上 (row 0-4)
 *
 * 棋子:
 *   帅/将(king)   仕/士(advisor)  相/象(elephant)
 *   馬(horse)     車(chariot)     炮(cannon)      兵/卒(pawn)
 */

// ========== 棋子类型 ==========

const PIECE_TYPES = {
  KING: 'king',       // 帅/将
  ADVISOR: 'advisor', // 仕/士
  ELEPHANT: 'elephant', // 相/象
  HORSE: 'horse',     // 馬
  CHARIOT: 'chariot', // 車
  CANNON: 'cannon',   // 炮
  PAWN: 'pawn',       // 兵/卒
};

// 红方棋子中文名
const RED_NAMES = {
  king: '帅', advisor: '仕', elephant: '相',
  horse: '馬', chariot: '車', cannon: '炮', pawn: '兵',
};

// 黑方棋子中文名
const BLACK_NAMES = {
  king: '将', advisor: '士', elephant: '象',
  horse: '馬', chariot: '車', cannon: '炮', pawn: '卒',
};

// ========== 初始布局 ==========

/**
 * 生成初始棋盘
 * 返回: { id, type, color, col, row, name }[]
 */
function createInitialPieces() {
  const pieces = [];
  let id = 0;

  const addPiece = (type, color, col, row) => {
    const names = color === 'red' ? RED_NAMES : BLACK_NAMES;
    pieces.push({
      id: id++,
      type,
      color,
      col,
      row,
      name: names[type],
    });
  };

  // 黑方 (row 0-4)
  addPiece('chariot', 'black', 0, 0);
  addPiece('horse', 'black', 1, 0);
  addPiece('elephant', 'black', 2, 0);
  addPiece('advisor', 'black', 3, 0);
  addPiece('king', 'black', 4, 0);
  addPiece('advisor', 'black', 5, 0);
  addPiece('elephant', 'black', 6, 0);
  addPiece('horse', 'black', 7, 0);
  addPiece('chariot', 'black', 8, 0);
  addPiece('cannon', 'black', 1, 2);
  addPiece('cannon', 'black', 7, 2);
  for (let c = 0; c <= 8; c += 2) addPiece('pawn', 'black', c, 3);

  // 红方 (row 5-9)
  addPiece('chariot', 'red', 0, 9);
  addPiece('horse', 'red', 1, 9);
  addPiece('elephant', 'red', 2, 9);
  addPiece('advisor', 'red', 3, 9);
  addPiece('king', 'red', 4, 9);
  addPiece('advisor', 'red', 5, 9);
  addPiece('elephant', 'red', 6, 9);
  addPiece('horse', 'red', 7, 9);
  addPiece('chariot', 'red', 8, 9);
  addPiece('cannon', 'red', 1, 7);
  addPiece('cannon', 'red', 7, 7);
  for (let c = 0; c <= 8; c += 2) addPiece('pawn', 'red', c, 6);

  return pieces;
}

// ========== 走法验证 ==========

/**
 * 判断目标位置是否在棋盘内
 */
function inBoard(col, row) {
  return col >= 0 && col <= 8 && row >= 0 && row <= 9;
}

/**
 * 判断是否在九宫格内
 */
function inPalace(col, row, color) {
  if (col < 3 || col > 5) return false;
  if (color === 'red') return row >= 7 && row <= 9;
  return row >= 0 && row <= 2;
}

/**
 * 判断是否在己方半场（未过河）
 */
function onOwnSide(row, color) {
  return color === 'red' ? row >= 5 : row <= 4;
}

/**
 * 获取指定位置的棋子
 */
function getPieceAt(pieces, col, row) {
  return pieces.find(p => p.col === col && p.row === row);
}

/**
 * 获取两个位置之间的棋子数（不含起点终点，用于車/炮判断）
 */
function piecesBetween(pieces, c1, r1, c2, r2) {
  let count = 0;
  if (c1 === c2) {
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    for (let r = minR + 1; r < maxR; r++) {
      if (getPieceAt(pieces, c1, r)) count++;
    }
  } else if (r1 === r2) {
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    for (let c = minC + 1; c < maxC; c++) {
      if (getPieceAt(pieces, c, r1)) count++;
    }
  }
  return count;
}

/**
 * 验证走法是否合法
 * @returns {boolean}
 */
function isValidMove(pieces, piece, toCol, toRow) {
  const { type, color, col: fromCol, row: fromRow } = piece;

  // 不能原地不动
  if (fromCol === toCol && fromRow === toRow) return false;

  // 目标位置不能有己方棋子
  const target = getPieceAt(pieces, toCol, toRow);
  if (target && target.color === color) return false;

  const dc = toCol - fromCol;
  const dr = toRow - fromRow;

  switch (type) {
    case 'king':
      return isValidKingMove(pieces, piece, toCol, toRow);
    case 'advisor':
      return isValidAdvisorMove(piece, toCol, toRow);
    case 'elephant':
      return isValidElephantMove(pieces, piece, toCol, toRow);
    case 'horse':
      return isValidHorseMove(pieces, piece, toCol, toRow);
    case 'chariot':
      return isValidChariotMove(pieces, piece, toCol, toRow);
    case 'cannon':
      return isValidCannonMove(pieces, piece, toCol, toRow);
    case 'pawn':
      return isValidPawnMove(piece, toCol, toRow);
    default:
      return false;
  }
}

// --- 帅/将 ---
function isValidKingMove(pieces, piece, toCol, toRow) {
  const { color, col: fromCol, row: fromRow } = piece;
  const dc = Math.abs(toCol - fromCol);
  const dr = Math.abs(toRow - fromRow);

  // 只能走一步，且在九宫格内
  if (!((dc === 1 && dr === 0) || (dc === 0 && dr === 1))) return false;
  if (!inPalace(toCol, toRow, color)) return false;

  // 将帅不能面对面（飞将）
  const opponentKing = pieces.find(p => p.type === 'king' && p.color !== color);
  if (opponentKing && opponentKing.col === toCol) {
    const between = piecesBetween(pieces, toCol, toRow, opponentKing.col, opponentKing.row);
    if (between === 0) return false;
  }

  return true;
}

// --- 仕/士 ---
function isValidAdvisorMove(piece, toCol, toRow) {
  const { color, col: fromCol, row: fromRow } = piece;
  const dc = Math.abs(toCol - fromCol);
  const dr = Math.abs(toRow - fromRow);
  return dc === 1 && dr === 1 && inPalace(toCol, toRow, color);
}

// --- 相/象 ---
function isValidElephantMove(pieces, piece, toCol, toRow) {
  const { color, col: fromCol, row: fromRow } = piece;
  const dc = Math.abs(toCol - fromCol);
  const dr = Math.abs(toRow - fromRow);

  // 走田字
  if (dc !== 2 || dr !== 2) return false;

  // 不能过河
  if (!onOwnSide(toRow, color)) return false;

  // 检查象眼是否被堵
  const eyeCol = (fromCol + toCol) / 2;
  const eyeRow = (fromRow + toRow) / 2;
  if (getPieceAt(pieces, eyeCol, eyeRow)) return false;

  return true;
}

// --- 馬 ---
function isValidHorseMove(pieces, piece, toCol, toRow) {
  const { col: fromCol, row: fromRow } = piece;
  const dc = Math.abs(toCol - fromCol);
  const dr = Math.abs(toRow - fromRow);

  // 走日字
  if (!((dc === 1 && dr === 2) || (dc === 2 && dr === 1))) return false;

  // 检查马腿
  let legCol, legRow;
  if (dc === 2) {
    legCol = fromCol + (toCol > fromCol ? 1 : -1);
    legRow = fromRow;
  } else {
    legCol = fromCol;
    legRow = fromRow + (toRow > fromRow ? 1 : -1);
  }
  if (getPieceAt(pieces, legCol, legRow)) return false;

  return true;
}

// --- 車 ---
function isValidChariotMove(pieces, piece, toCol, toRow) {
  const { col: fromCol, row: fromRow } = piece;

  // 直线走
  if (fromCol !== toCol && fromRow !== toRow) return false;

  // 路上不能有棋子
  return piecesBetween(pieces, fromCol, fromRow, toCol, toRow) === 0;
}

// --- 炮 ---
function isValidCannonMove(pieces, piece, toCol, toRow) {
  const { col: fromCol, row: fromRow } = piece;

  // 直线走
  if (fromCol !== toCol && fromRow !== toRow) return false;

  const between = piecesBetween(pieces, fromCol, fromRow, toCol, toRow);
  const target = getPieceAt(pieces, toCol, toRow);

  // 不吃子: 路上无棋子
  if (!target) return between === 0;
  // 吃子: 必须隔一个棋子（炮架）
  return between === 1;
}

// --- 兵/卒 ---
function isValidPawnMove(piece, toCol, toRow) {
  const { color, col: fromCol, row: fromRow } = piece;
  const dc = Math.abs(toCol - fromCol);
  const dr = toRow - fromRow;

  // 只能走一步
  if (dc + Math.abs(dr) !== 1) return false;

  // 不能后退
  if (color === 'red' && dr > 0) return false;
  if (color === 'black' && dr < 0) return false;

  // 未过河不能横走
  if (dc === 1 && onOwnSide(fromRow, color)) return false;

  return true;
}

// ========== 将军/绝杀判断 ==========

/**
 * 判断某方是否被将军
 */
function isInCheck(pieces, color) {
  const king = pieces.find(p => p.type === 'king' && p.color === color);
  if (!king) return true; // 将被吃了

  const opponent = pieces.filter(p => p.color !== color);
  return opponent.some(p => isValidMove(pieces, p, king.col, king.row));
}

/**
 * 深拷贝棋子数组（避免修改原始棋盘状态）
 */
function clonePieces(pieces) {
  return pieces.map(p => ({ ...p }));
}

/**
 * 判断某方是否被绝杀（无合法走法且被将军）
 */
function isCheckmate(pieces, color) {
  const myPieces = pieces.filter(p => p.color === color);

  for (const piece of myPieces) {
    for (let c = 0; c <= 8; c++) {
      for (let r = 0; r <= 9; r++) {
        if (isValidMove(pieces, piece, c, r)) {
          // 模拟走法（深拷贝，不污染原始状态）
          const captured = getPieceAt(pieces, c, r);
          const simPieces = clonePieces(pieces).filter(p => p.id !== captured?.id);
          const moved = simPieces.find(p => p.id === piece.id);
          if (moved) {
            moved.col = c;
            moved.row = r;
          }
          if (!isInCheck(simPieces, color)) return false;
        }
      }
    }
  }

  return true;
}

/**
 * 走棋后是否送将（自己走完被将军）
 */
function wouldBeInCheck(pieces, piece, toCol, toRow) {
  const captured = getPieceAt(pieces, toCol, toRow);
  const simPieces = clonePieces(pieces).filter(p => p.id !== captured?.id);
  const moved = simPieces.find(p => p.id === piece.id);
  if (moved) {
    moved.col = toCol;
    moved.row = toRow;
  }
  return isInCheck(simPieces, piece.color);
}

module.exports = {
  PIECE_TYPES, RED_NAMES, BLACK_NAMES,
  createInitialPieces,
  isValidMove, isInCheck, isCheckmate, wouldBeInCheck,
  getPieceAt, inBoard,
};
