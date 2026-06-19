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
      timeoutCount: {},        // pid -> 连续超时次数
      drawRequest: null,       // { from, timestamp } 求和请求
      timerSettings: null,     // { totalTime, stepTime, enabled }
      timeRemaining: {},       // pid -> 剩余总时间(ms)
    };
  }

  getVisibleState(gs, pid) {
    // 象棋信息完全公开，但排除内部字段
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

    console.log(`[Chess] 收到动作: ${action.type} from ${pid} in ${roomId}`);

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
      case 'set_timer':
        this.handleSetTimer(roomId, pid, action.settings);
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

  // ========== 猜拳 ==========

  handleRPS(roomId, pid, choice) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'rps') return;
    if (!RPS_CHOICES[choice]) return;
    if (state.rpsChoices[pid]) return; // 已出拳

    console.log(`[RPS] 玩家 ${pid} 出拳: ${choice}, 房间 ${roomId}`);
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

    // 两人都出拳了 → 先结算再广播，客户端直接收到最终状态
    const keys = Object.keys(state.rpsChoices);
    if (keys.length === 2) {
      this.resolveRPS(roomId, state);
    } else {
      // 只有一人出拳，同步中间状态
      this.broadcastState(roomId, state);
    }
  }

  resolveRPS(roomId, state) {
    const [p1, p2] = state.players;
    const c1 = state.rpsChoices[p1].choice;
    const c2 = state.rpsChoices[p2].choice;
    const result = judgeRPS(c1, c2);
    console.log(`[RPS] 结算: ${p1}=${c1}, ${p2}=${c2}, 结果=${result}`);

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
    if (String(pid) !== String(state.winner)) return;
    if (color !== 'red' && color !== 'black') return;

    const other = state.players.find(p => String(p) !== String(pid));
    // 统一用整数 key 存 colorMap
    state.colorMap[Number(pid)] = color;
    state.colorMap[Number(other)] = color === 'red' ? 'black' : 'red';

    // 红方先走
    const redPlayerId = Number(Object.entries(state.colorMap).find(([, c]) => c === 'red')[0]);
    state.currentTurn = state.players.findIndex(p => Number(p) === redPlayerId);
    state.turnColor = 'red';
    state.phase = 'playing';

    console.log(`[Chess] 选色完成: colorMap=${JSON.stringify(state.colorMap)}, redPlayerId=${redPlayerId}, currentTurn=${state.currentTurn}, players=${JSON.stringify(state.players)}`);

    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'color_chosen',
      colorMap: state.colorMap,
      redPlayer: redPlayerKey,
      message: `${pid === state.winner ? '你' : '对方'}选择了${color === 'red' ? '红方' : '黑方'}，红方先行`,
    });

    // 发送当前棋盘状态 + 启动计时器
    this.startTurnTimer(roomId, state);
    this.broadcastState(roomId, state);
  }

  // ========== 走棋 ==========

  handleMove(roomId, pid, from, to) {
    const state = this.getState(roomId);
    console.log(`[Chess] handleMove: pid=${pid}, from=${JSON.stringify(from)}, to=${JSON.stringify(to)}, phase=${state?.phase}, currentTurn=${state?.currentTurn}, turnColor=${state?.turnColor}, players=${JSON.stringify(state?.players)}`);

    if (!state || state.phase !== 'playing') {
      console.log(`[Chess] 拒绝走法: 状态不对 phase=${state?.phase}`);
      return;
    }

    // 验证是否轮到该玩家（统一 Number 比较）
    const expectedPid = state.players[state.currentTurn];
    console.log(`[Chess] 回合检查: expected=${expectedPid}, actual=${pid}`);
    if (Number(expectedPid) !== Number(pid)) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '还没轮到你' });
      return;
    }

    const { col: fromCol, row: fromRow } = from;
    const { col: toCol, row: toRow } = to;

    // 找到要走的棋子
    const piece = getPieceAt(state.pieces, fromCol, fromRow);
    if (!piece) {
      console.log(`[Chess] 拒绝走法: 没有棋子 at ${fromCol},${fromRow}`);
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '该位置没有棋子' });
      return;
    }
    if (piece.color !== state.turnColor) {
      console.log(`[Chess] 拒绝走法: 棋子颜色不对 piece.color=${piece.color} turnColor=${state.turnColor}`);
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不是你的棋子' });
      return;
    }

    console.log(`[Chess] 验证走法: ${piece.name} ${fromCol},${fromRow} → ${toCol},${toRow}`);

    // 验证走法
    if (!isValidMove(state.pieces, piece, toCol, toRow)) {
      console.log(`[Chess] 拒绝走法: 不合法`);
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不合法的走法' });
      return;
    }

    // 验证走完不会被将军（不能送将）
    if (wouldBeInCheck(state.pieces, piece, toCol, toRow)) {
      console.log(`[Chess] 拒绝走法: 送将`);
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

    // 走棋成功，重置该玩家的连续超时计数
    state.timeoutCount[pid] = 0;

    // 切换走棋方
    const nextColor = state.turnColor === 'red' ? 'black' : 'red';
    state.turnColor = nextColor;
    state.currentTurn = state.players.findIndex(p => state.colorMap[p] === nextColor);

    // 检查将军/绝杀
    const opponentColor = nextColor;
    state.check = isInCheck(state.pieces, opponentColor);

    if (state.check) {
      if (isCheckmate(state.pieces, opponentColor)) {
        // 绝杀，游戏结束（不启动计时器）
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

    // 设置走棋计时器（60秒）— 非绝杀时才启动
    this.startTurnTimer(roomId, state);

    this.saveState(roomId, state);
    this.broadcastState(roomId, state);
  }

  // ========== 计时器设置 ==========

  handleSetTimer(roomId, pid, settings) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'rps') return;

    // 验证设置
    const totalTime = Math.max(0, Math.min(60 * 60 * 1000, Number(settings?.totalTime) || 0));
    const stepTime = Math.max(0, Math.min(10 * 60 * 1000, Number(settings?.stepTime) || 0));
    const enabled = totalTime > 0 || stepTime > 0;

    state.timerSettings = { totalTime, stepTime, enabled };

    // 初始化双方剩余总时间
    if (enabled && totalTime > 0) {
      for (const p of state.players) {
        state.timeRemaining[p] = totalTime;
      }
    }

    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'timer_settings_updated',
      settings: state.timerSettings,
    });

    this.broadcastState(roomId, state);
  }

  // ========== 投降 ==========

  handleResign(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    const winnerPid = state.players.find(p => p !== pid);
    const winnerColor = state.colorMap[winnerPid];

    state.phase = 'ended';
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'game_over',
      reason: 'resign',
      winner: winnerPid,
      loser: pid,
      winnerColor,
      message: '对方投降，游戏结束',
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, {
        winners: [winnerPid],
        scores: { [winnerPid]: 10, [pid]: -10 },
      });
    }
  }

  // ========== 求和 ==========

  handleDrawRequest(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    const other = state.players.find(p => p !== pid);
    state.drawRequest = { from: pid, timestamp: Date.now() };
    this.saveState(roomId, state);

    // 通知对方有求和请求
    this.doBroadcastTo(roomId, other, {
      type: 'draw_request_received',
      from: pid,
      message: '对方请求和棋',
    });

    // 通知发起者已发送
    this.doBroadcastTo(roomId, pid, {
      type: 'draw_request_sent',
      message: '和棋请求已发送，等待对方回应',
    });
  }

  handleDrawResponse(roomId, pid, accept) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing' || !state.drawRequest) return;
    if (state.drawRequest.from === pid) return; // 请求方不能回应自己的请求

    const requester = state.drawRequest.from;
    state.drawRequest = null;

    if (accept) {
      // 接受和棋
      state.phase = 'ended';
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'game_over',
        reason: 'draw_agreed',
        winner: null,
        message: '双方同意和棋',
      });

      if (this.onGameOver) {
        this.onGameOver(roomId, {
          winners: [],
          scores: { [state.players[0]]: 0, [state.players[1]]: 0 },
        });
      }
    } else {
      // 拒绝和棋
      this.saveState(roomId, state);
      this.doBroadcastTo(roomId, requester, {
        type: 'draw_rejected',
        message: '对方拒绝了和棋请求',
      });
    }
  }

  // ========== 走棋计时器 ==========

  startTurnTimer(roomId, state) {
    // 清除旧计时器
    if (state._turnTimer) {
      clearTimeout(state._turnTimer);
    }

    const TURN_TIME = 60000; // 60秒
    const MAX_TIMEOUTS = 3;  // 连续超时3次判负
    state.turnDeadline = Date.now() + TURN_TIME;
    this.saveState(roomId, state);

    // 广播计时器
    this.doBroadcast(roomId, {
      type: 'turn_timer',
      deadline: state.turnDeadline,
      currentTurn: state.currentTurn,
    });

    // 捕获当前回合索引为局部变量，避免闭包引用被修改的 state
    const capturedTurn = state.currentTurn;
    state._turnTimer = setTimeout(() => {
      const currentState = this.getState(roomId);
      if (!currentState || currentState.phase !== 'playing') return;
      // 确认还是同一个回合
      if (currentState.currentTurn !== capturedTurn) return;

      const timeoutPlayer = currentState.players[currentState.currentTurn];
      currentState.timeoutCount[timeoutPlayer] = (currentState.timeoutCount[timeoutPlayer] || 0) + 1;
      const count = currentState.timeoutCount[timeoutPlayer];

      console.log(`[Chess] 玩家 ${timeoutPlayer} 超时 ${count}/${MAX_TIMEOUTS}`);

      if (count >= MAX_TIMEOUTS) {
        // 连续超时3次，判负
        const winnerPid = currentState.players.find(p => p !== timeoutPlayer);
        currentState.phase = 'ended';
        this.saveState(roomId, currentState);

        this.doBroadcast(roomId, {
          type: 'game_over',
          reason: 'timeout_loss',
          winner: winnerPid,
          loser: timeoutPlayer,
          message: `超时${MAX_TIMEOUTS}次，判负`,
        });

        if (this.onGameOver) {
          this.onGameOver(roomId, {
            winners: [winnerPid],
            scores: { [winnerPid]: 10, [timeoutPlayer]: -10 },
          });
        }
        return;
      }

      // 超时但未判负，跳过回合
      const nextColor = currentState.turnColor === 'red' ? 'black' : 'red';
      currentState.turnColor = nextColor;
      currentState.currentTurn = currentState.players.findIndex(p => currentState.colorMap[p] === nextColor);
      this.startTurnTimer(roomId, currentState);

      this.doBroadcast(roomId, {
        type: 'turn_timeout',
        timeoutPlayer,
        timeoutCount: count,
        maxTimeouts: MAX_TIMEOUTS,
        message: `走棋超时(${count}/${MAX_TIMEOUTS})，轮到对方`,
      });

      this.saveState(roomId, currentState);
      this.broadcastState(roomId, currentState);
    }, TURN_TIME + 1000); // 多给1秒缓冲
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
