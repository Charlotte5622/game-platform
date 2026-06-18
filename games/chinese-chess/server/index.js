const {
  createInitialPieces, isValidMove, isInCheck, isCheckmate, wouldBeInCheck,
  getPieceAt,
} = require('./pieces');

/**
 * 游戏服务器基类
 */
class BaseGameServer {
  constructor() {
    this.broadcast = null;
    this.sendToPlayer = null;
    this.onGameOver = null;
    this._getRoomData = null;
    this._setRoomData = null;
  }
  getState(roomId) { return this._getRoomData ? this._getRoomData(roomId) : null; }
  saveState(roomId, state) { if (this._setRoomData) this._setRoomData(roomId, state); }
  doBroadcast(roomId, msg) { if (this.broadcast) this.broadcast(roomId, msg); }
  doBroadcastTo(roomId, pid, msg) { if (this.sendToPlayer) this.sendToPlayer(roomId, pid, msg); }
  initGameState(players) { return { players }; }
  getVisibleState(gs, pid) { return gs; }
  onPlayerAction(roomId, pid, action) {}
  postInit(roomId) {}
}

/**
 * 猜拳选项
 */
const RPS_CHOICES = { rock: '石头', scissors: '剪刀', paper: '布' };

/**
 * 猜拳判定: 返回 'draw' | 'p1' | 'p2'
 */
function judgeRPS(c1, c2) {
  if (c1 === c2) return 'draw';
  if (
    (c1 === 'rock' && c2 === 'scissors') ||
    (c1 === 'scissors' && c2 === 'paper') ||
    (c1 === 'paper' && c2 === 'rock')
  ) return 'p1';
  return 'p2';
}

/**
 * 中国象棋游戏服务器
 *
 * 流程:
 * 1. 猜拳选色 (rps = rock-paper-scissors)
 * 2. 胜者选红/黑
 * 3. 红方先行，轮流走棋
 * 4. 将军/绝杀/困毙判定
 */
class ChineseChessServer extends BaseGameServer {
  constructor() { super(); }

  // ========== 初始化 ==========

  initGameState(players) {
    return {
      players: [...players],
      phase: 'rps',           // rps | choosing | playing | ended
      rpsChoices: {},         // pid -> { choice, timestamp }
      rpsRound: 1,            // 猜拳轮次
      winner: null,           // 猜拳胜者 pid
      colorMap: {},            // { pid: 'red'|'black' }
      pieces: createInitialPieces(),
      currentTurn: 0,         // 当前走棋方索引 (对应 players[colorMap 中 red 的 pid])
      turnColor: 'red',       // 当前走棋方颜色
      moveHistory: [],         // 走棋记录
      check: false,            // 当前是否将军
    };
  }

  getVisibleState(gs, pid) {
    // 象棋信息完全公开，无需隐藏
    return { ...gs };
  }

  postInit(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'game_start',
        state: this.getVisibleState(state, pid),
      });
    }

    // 提示开始猜拳
    this.doBroadcast(roomId, {
      type: 'rps_start',
      message: '请出拳决定谁先选色',
    });
  }

  // ========== 玩家操作 ==========

  onPlayerAction(roomId, pid, action) {
    const state = this.getState(roomId);
    if (!state) return;

    switch (action.type) {
      case 'rps':
        this.handleRPS(roomId, pid, action.choice);
        break;
      case 'choose_color':
        this.handleChooseColor(roomId, pid, action.color);
        break;
      case 'move':
        this.handleMove(roomId, pid, action.from, action.to);
        break;
    }
  }

  // ========== 猜拳 ==========

  handleRPS(roomId, pid, choice) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'rps') return;
    if (!RPS_CHOICES[choice]) return;
    if (state.rpsChoices[pid]) return; // 已出拳

    state.rpsChoices[pid] = { choice, time: Date.now() };
    this.saveState(roomId, state);

    // 通知该玩家已记录
    this.doBroadcastTo(roomId, pid, {
      type: 'rps_recorded',
      choice,
    });

    // 通知对方该玩家已出拳（不暴露选择）
    const other = state.players.find(p => p !== pid);
    this.doBroadcastTo(roomId, other, {
      type: 'rps_opponent_ready',
    });

    // 同步状态（rpsChoices 更新）
    this.broadcastState(roomId, state);

    // 两人都出拳了
    const keys = Object.keys(state.rpsChoices);
    if (keys.length === 2) {
      this.resolveRPS(roomId, state);
    }
  }

  resolveRPS(roomId, state) {
    const [p1, p2] = state.players;
    const c1 = state.rpsChoices[p1].choice;
    const c2 = state.rpsChoices[p2].choice;
    const result = judgeRPS(c1, c2);

    if (result === 'draw') {
      // 平局，重新出拳
      state.rpsChoices = {};
      state.rpsRound++;
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'rps_draw',
        round: state.rpsRound,
        choices: { [p1]: c1, [p2]: c2 },
        message: `平局！双方都是${RPS_CHOICES[c1]}，请重新出拳`,
      });
      // 同步状态（phase 仍为 rps，但 rpsRound 变了）
      this.broadcastState(roomId, state);
    } else {
      // 有胜者
      const winner = result === 'p1' ? p1 : p2;
      const loser = result === 'p1' ? p2 : p1;
      state.winner = winner;
      state.phase = 'choosing';
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'rps_result',
        winner,
        loser,
        choices: { [p1]: c1, [p2]: c2 },
        message: `${RPS_CHOICES[c1]} vs ${RPS_CHOICES[c2]}`,
      });

      // 同步状态（phase 从 rps 变为 choosing）
      this.broadcastState(roomId, state);

      // 提示胜者选色
      this.doBroadcastTo(roomId, winner, {
        type: 'choose_color',
        message: '你赢了！请选择红方或黑方',
      });
    }
  }

  // ========== 选色 ==========

  handleChooseColor(roomId, pid, color) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'choosing') return;
    if (pid !== state.winner) return;
    if (color !== 'red' && color !== 'black') return;

    const other = state.players.find(p => p !== pid);
    state.colorMap[pid] = color;
    state.colorMap[other] = color === 'red' ? 'black' : 'red';

    // 红方先走
    const redPlayer = Object.entries(state.colorMap).find(([, c]) => c === 'red')[0];
    state.currentTurn = state.players.indexOf(redPlayer);
    state.turnColor = 'red';
    state.phase = 'playing';
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'color_chosen',
      colorMap: state.colorMap,
      redPlayer,
      message: `${pid === state.winner ? '你' : '对方'}选择了${color === 'red' ? '红方' : '黑方'}，红方先行`,
    });

    // 发送当前棋盘状态
    this.broadcastState(roomId, state);
  }

  // ========== 走棋 ==========

  handleMove(roomId, pid, from, to) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    // 验证是否轮到该玩家
    if (state.players[state.currentTurn] !== pid) return;

    const { col: fromCol, row: fromRow } = from;
    const { col: toCol, row: toRow } = to;

    // 找到要走的棋子
    const piece = getPieceAt(state.pieces, fromCol, fromRow);
    if (!piece || piece.color !== state.turnColor) return;

    // 验证走法
    if (!isValidMove(state.pieces, piece, toCol, toRow)) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不合法的走法' });
      return;
    }

    // 验证走完不会被将军（不能送将）
    if (wouldBeInCheck(state.pieces, piece, toCol, toRow)) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不能送将' });
      return;
    }

    // 执行走法
    const captured = getPieceAt(state.pieces, toCol, toRow);
    if (captured) {
      state.pieces = state.pieces.filter(p => p.id !== captured.id);
    }

    // 更新棋子位置
    const moved = state.pieces.find(p => p.id === piece.id);
    if (moved) {
      moved.col = toCol;
      moved.row = toRow;
    }

    // 记录走法
    state.moveHistory.push({
      pid,
      color: piece.color,
      piece: piece.name,
      from: { col: fromCol, row: fromRow },
      to: { col: toCol, row: toRow },
      captured: captured ? captured.name : null,
    });

    // 广播出棋
    this.doBroadcast(roomId, {
      type: 'move_made',
      pid,
      piece: piece.name,
      from: { col: fromCol, row: fromRow },
      to: { col: toCol, row: toRow },
      captured: captured ? { id: captured.id, name: captured.name } : null,
    });

    // 切换走棋方
    const nextColor = state.turnColor === 'red' ? 'black' : 'red';
    state.turnColor = nextColor;
    state.currentTurn = state.players.findIndex(p => state.colorMap[p] === nextColor);

    // 检查将军/绝杀
    const opponentColor = nextColor;
    state.check = isInCheck(state.pieces, opponentColor);

    if (state.check) {
      if (isCheckmate(state.pieces, opponentColor)) {
        // 绝杀，游戏结束
        state.phase = 'ended';
        const winnerColor = state.turnColor === 'red' ? 'black' : 'red';
        const winnerPid = Object.entries(state.colorMap).find(([, c]) => c === winnerColor)[0];

        this.doBroadcast(roomId, {
          type: 'checkmate',
          winner: winnerPid,
          loser: state.players.find(p => p !== winnerPid),
          winnerColor,
          message: '绝杀！',
        });

        if (this.onGameOver) {
          this.onGameOver(roomId, {
            winners: [winnerPid],
            scores: { [winnerPid]: 10, [state.players.find(p => p !== winnerPid)]: -10 },
          });
        }
        this.saveState(roomId, state);
        return;
      }

      // 将军
      this.doBroadcast(roomId, {
        type: 'check',
        message: '将军！',
      });
    }

    this.saveState(roomId, state);
    this.broadcastState(roomId, state);
  }

  // ========== 辅助 ==========

  broadcastState(roomId, state) {
    // 用 doBroadcast 发给整个 Socket.IO 房间（包括新 tab 的 socket）
    // 象棋信息完全公开，所有人看到相同状态
    this.doBroadcast(roomId, {
      type: 'state_update',
      state: this.getVisibleState(state, state.players[0]),
    });
  }
}

module.exports = ChineseChessServer;
