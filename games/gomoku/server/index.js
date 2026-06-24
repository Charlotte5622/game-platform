const { createBoard, checkWin, isValidMove, isBoardFull } = require('./board');
const { decideGomoku } = require('../../../server/src/services/botService');

/**
 * 游戏服务器基类（与 chinese-chess 保持一致）
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
 * 五子棋游戏服务器
 *
 * 流程:
 * 1. 随机分配黑白（黑棋先手）
 * 2. 轮流落子
 * 3. 五连珠获胜，棋盘满平局
 * 4. 支持投降 / 求和
 */
class GomokuServer extends BaseGameServer {
  constructor() { super(); }

  // ========== 初始化 ==========

  initGameState(players) {
    // 随机分配黑白
    const ordered = Math.random() > 0.5 ? players : [...players].reverse();
    const blackId = ordered[0];
    const whiteId = ordered[1];

    return {
      players: [blackId, whiteId],
      blackId,
      whiteId,
      board: createBoard(),
      currentTurn: 0,       // 索引，0=黑棋
      moves: [],             // 落子记录
      phase: 'playing',      // playing | ended
      winner: null,
      winLine: null,         // 获胜连线坐标
    };
  }

  getVisibleState(gs, pid) {
    // 五子棋信息完全公开
    const { _turnTimer, ...visible } = gs;
    return visible;
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
  }

  // ========== 玩家操作 ==========

  onPlayerAction(roomId, pid, action) {
    const state = this.getState(roomId);
    if (!state) {
      console.warn(`[Gomoku] 状态为空: room=${roomId}`);
      return;
    }

    console.log(`[Gomoku] 收到动作: ${action.type} from ${pid} phase=${state.phase}`);

    switch (action.type) {
      case 'place':
        this.handlePlace(roomId, pid, action.row, action.col);
        break;
      case 'resign':
        this.handleResign(roomId, pid);
        break;
      case 'draw_request':
        this.handleDrawRequest(roomId, pid);
        break;
      case 'draw_response':
        this.handleDrawResponse(roomId, pid, action.accept);
        break;
    }
  }

  // ========== 落子 ==========

  handlePlace(roomId, pid, row, col) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    // 验证轮到该玩家
    const currentPlayerId = state.players[state.currentTurn];
    if (String(pid) !== String(currentPlayerId)) {
      this.doBroadcastTo(roomId, pid, {
        type: 'error',
        message: '还没轮到你',
      });
      return;
    }

    // 验证落子合法
    if (!isValidMove(state.board, row, col)) {
      this.doBroadcastTo(roomId, pid, {
        type: 'error',
        message: '无效落子',
      });
      return;
    }

    // 落子
    const color = state.currentTurn === 0 ? 'black' : 'white';
    state.board[row][col] = color;

    // 记录
    state.moves.push({ row, col, color, pid, index: state.moves.length });

    // 检查胜负
    const winLine = checkWin(state.board, row, col);
    if (winLine) {
      state.phase = 'ended';
      state.winner = pid;
      state.winLine = winLine;
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });

      this.doBroadcast(roomId, {
        type: 'game_over',
        reason: 'win',
        winner: pid,
        loser: state.players.find(p => String(p) !== String(pid)),
        message: `${color === 'black' ? '黑棋' : '白棋'}五连珠获胜！`,
        winLine,
      });

      if (this.onGameOver) {
        this.onGameOver(roomId, {
          winners: [pid],
          scores: { [pid]: 10, [state.players.find(p => String(p) !== String(pid))]: -10 },
        });
      }
      return;
    }

    // 检查平局
    if (isBoardFull(state.board)) {
      state.phase = 'ended';
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });

      this.doBroadcast(roomId, {
        type: 'game_over',
        reason: 'draw_full',
        message: '棋盘已满，平局！',
      });

      if (this.onGameOver) {
        this.onGameOver(roomId, {
          winners: [],
          scores: {},
        });
      }
      return;
    }

    // 切换回合
    state.currentTurn = state.currentTurn === 0 ? 1 : 0;
    this.saveState(roomId, state);

    // 广播状态
    this.doBroadcast(roomId, {
      type: 'state_update',
      state: this.getVisibleState(state, pid),
    });
  }

  // ========== 投降 ==========

  handleResign(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    const opponentId = state.players.find(p => String(p) !== String(pid));
    state.phase = 'ended';
    state.winner = opponentId;
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'state_update',
      state: this.getVisibleState(state, pid),
    });

    // 发送不同的消息给胜负双方
    this.doBroadcastTo(roomId, opponentId, {
      type: 'game_over',
      reason: 'resign',
      winner: opponentId,
      loser: pid,
      message: '对手投降认负',
    });
    this.doBroadcastTo(roomId, pid, {
      type: 'game_over',
      reason: 'resign',
      winner: opponentId,
      loser: pid,
      message: '你已投降',
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, {
        winners: [opponentId],
        scores: { [opponentId]: 10, [pid]: -10 },
      });
    }
  }

  // ========== 求和 ==========

  handleDrawRequest(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    const opponentId = state.players.find(p => String(p) !== String(pid));
    this.doBroadcastTo(roomId, opponentId, {
      type: 'draw_request',
      from: pid,
    });
    this.doBroadcastTo(roomId, pid, {
      type: 'draw_request_sent',
    });
  }

  handleDrawResponse(roomId, pid, accept) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    if (accept) {
      state.phase = 'ended';
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });

      this.doBroadcast(roomId, {
        type: 'game_over',
        reason: 'draw_agreed',
        message: '双方同意和棋',
      });

      if (this.onGameOver) {
        this.onGameOver(roomId, {
          winners: [],
          scores: {},
        });
      }
    } else {
      const requesterId = state.players.find(p => String(p) !== String(pid));
      this.doBroadcastTo(roomId, requesterId, {
        type: 'draw_rejected',
        message: '对方拒绝和棋',
      });
    }
  }

  // ========== Bot AI ==========

  makeBotMove(roomId, state, botId) {
    if (!state || state.phase !== 'playing') return;

    const currentPlayerId = state.players[state.currentTurn];
    if (String(currentPlayerId) !== String(botId)) return;

    // 延迟模拟思考
    const delay = 800 + Math.floor(Math.random() * 1200);
    setTimeout(async () => {
      try {
        const currentState = this.getState(roomId);
        if (!currentState || currentState.phase !== 'playing') return;
        const nowPlayerId = currentState.players[currentState.currentTurn];
        if (String(nowPlayerId) !== String(botId)) return;

        const move = decideGomoku(currentState, botId);
        if (!move) {
          console.warn(`[Gomoku-Bot] ${botId} 无法决策`);
          return;
        }

        console.log(`[Gomoku-Bot] ${botId} 落子: (${move.row},${move.col})`);
        this.handlePlace(roomId, botId, move.row, move.col);
      } catch (err) {
        console.error(`[Gomoku-Bot] AI 决策出错:`, err.message);
      }
    }, delay);
  }
}

module.exports = GomokuServer;
