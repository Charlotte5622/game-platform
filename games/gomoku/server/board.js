/**
 * 五子棋棋盘逻辑
 *
 * 棋盘 15×15，二维数组
 * null = 空，'black' / 'white' = 棋子
 */

const SIZE = 15;

/**
 * 创建空棋盘
 */
function createBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

/**
 * 检查坐标是否在棋盘内
 */
function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * 检查落子是否合法
 */
function isValidMove(board, row, col) {
  return inBounds(row, col) && board[row][col] === null;
}

/**
 * 检查棋盘是否已满
 */
function isBoardFull(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}

/**
 * 检查 (row, col) 落子后是否形成五连珠
 *
 * 四个方向：水平、垂直、左上-右下对角线、右上-左下对角线
 * 返回获胜棋子坐标数组 [{row, col}, ...] 或 null
 */
function checkWin(board, row, col) {
  const color = board[row][col];
  if (!color) return null;

  // 四个方向的增量：[dr, dc]
  const directions = [
    [0, 1],   // 水平
    [1, 0],   // 垂直
    [1, 1],   // 左上→右下对角
    [1, -1],  // 右上→左下对角
  ];

  for (const [dr, dc] of directions) {
    const line = [{ row, col }];

    // 正方向延伸
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (inBounds(r, c) && board[r][c] === color) {
        line.push({ row: r, col: c });
      } else {
        break;
      }
    }

    // 反方向延伸
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (inBounds(r, c) && board[r][c] === color) {
        line.push({ row: r, col: c });
      } else {
        break;
      }
    }

    if (line.length >= 5) {
      return line;
    }
  }

  return null;
}

module.exports = { createBoard, checkWin, isValidMove, isBoardFull, SIZE };
