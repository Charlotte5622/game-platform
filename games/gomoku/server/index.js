const { createBoard, checkWin, isValidMove, isBoardFull } = require('./board');
const { decideGomoku } = require('../../../server/src/services/botService');
const { BaseGameServer, RPS_CHOICES, judgeRPS } = require('../../../server/src/services/baseGameServer');

/**
 * 五子棋游戏服务器
 *
 * 流程:
 * 1. 猜拳选先手 (rps = rock-paper-scissors)
 * 2. 胜者选黑/白（黑棋先手）
 * 3. 轮流落子
 * 4. 五连珠获胜，棋盘满平局
 * 5. 支持投降 / 求和
 */
class GomokuServer extends BaseGameServer {
  constructor() { super(); }

  // ========== 初始化 ==========

  initGameState(players) {
    return {
      players: [...players],
      phase: 'rps',           // rps | choosing | playing | ended
      rpsChoices: {},         // pid -> { choice, timestamp }
      rpsRound: 1,            // 猜拳轮次
      rpsWinner: null,        // 猜拳胜者 pid
      blackId: null,          // 黑棋玩家（选色后设置）
      whiteId: null,          // 白棋玩家（选色后设置）
      board: createBoard(),
      currentTurn: 0,         // 索引，0=黑棋
      moves: [],              // 落子记录
      winner: null,
      winLine: null,          // 获胜连线坐标
    };
  }

  getVisibleState(gs, pid) {
    // 五子棋信息完全公开，但排除内部字段
    const { _turnTimer, _turnTimerFired, ...visible } = gs;
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

    // 如果有 bot 玩家，自动出拳
    for (const pid of state.players) {
      if (String(pid).startsWith('bot_')) {
        this.makeBotRPS(roomId, pid);
      }
    }
  }

  // ========== 辅助 ==========

  broadcastState(roomId, state) {
    this.doBroadcast(roomId, {
      type: 'state_update',
      state: this.getVisibleState(state, state.players[0]),
    });
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
      case 'rps':
        this.handleRPS(roomId, pid, action.choice);
        break;
      case 'choose_color':
        this.handleChooseColor(roomId, pid, action.color);
        break;
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

  // ========== 猜拳 ==========

  handleRPS(roomId, pid, choice) {
    const state = this.getState(roomId);
    console.log(`[Gomoku-RPS] handleRPS: pid=${pid} choice=${choice} phase=${state?.phase} rpsChoices=${JSON.stringify(state?.rpsChoices)}`);
    if (!state || state.phase !== 'rps') {
      console.warn(`[Gomoku-RPS] 拒绝: phase=${state?.phase}`);
      return;
    }
    if (!RPS_CHOICES[choice]) {
      console.warn(`[Gomoku-RPS] 拒绝: 无效选项 choice=${choice}, 有效值=${JSON.stringify(Object.keys(RPS_CHOICES))}`);
      return;
    }
    if (state.rpsChoices[pid]) {
      console.warn(`[Gomoku-RPS] 拒绝: 已出拳 pid=${pid}`);
      return;
    }

    console.log(`[Gomoku-RPS] 玩家 ${pid} 出拳: ${choice}, 房间 ${roomId}`);
    state.rpsChoices[pid] = { choice, time: Date.now() };
    this.saveState(roomId, state);

    // 通知该玩家已记录
    this.doBroadcastTo(roomId, pid, {
      type: 'rps_recorded',
      choice,
    });

    // 通知对方该玩家已出拳（不暴露选择）
    const other = state.players.find(p => String(p) !== String(pid));
    this.doBroadcastTo(roomId, other, {
      type: 'rps_opponent_ready',
    });

    // 两人都出拳了 → 结算
    const keys = Object.keys(state.rpsChoices);
    if (keys.length === 2) {
      this.resolveRPS(roomId, state);
    } else {
      // 只有一人出拳，检查对手是否是 bot
      if (String(other).startsWith('bot_') && !state.rpsChoices[other]) {
        // Bot 对手还没出拳，触发 bot 出拳
        this.makeBotRPS(roomId, other);
      }
      // 同步中间状态
      this.broadcastState(roomId, state);
    }
  }

  resolveRPS(roomId, state) {
    const [p1, p2] = state.players;
    const c1 = state.rpsChoices[p1].choice;
    const c2 = state.rpsChoices[p2].choice;
    const result = judgeRPS(c1, c2);
    console.log(`[Gomoku-RPS] 结算: ${p1}=${c1}, ${p2}=${c2}, 结果=${result}`);

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

      // 如果有 bot，重新触发 bot 出拳
      for (const pid of state.players) {
        if (String(pid).startsWith('bot_')) {
          this.makeBotRPS(roomId, pid);
        }
      }
    } else {
      // 有胜者
      const winner = result === 'p1' ? p1 : p2;
      const loser = result === 'p1' ? p2 : p1;
      state.rpsWinner = winner;
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
        type: 'choose_color_prompt',
        message: '你赢了！请选择执黑或执白',
      });

      // 如果胜者是 bot，自动选色
      if (String(winner).startsWith('bot_')) {
        this.makeBotChoose(roomId, winner);
      }
    }
  }

  // ========== 选色 ==========

  handleChooseColor(roomId, pid, color) {
    const state = this.getState(roomId);
    console.log(`[Gomoku] handleChooseColor: pid=${pid}, color=${color}, phase=${state?.phase}, rpsWinner=${state?.rpsWinner}`);
    if (!state || state.phase !== 'choosing') {
      console.log(`[Gomoku] 选色拒绝: phase=${state?.phase}`);
      return;
    }
    if (String(pid) !== String(state.rpsWinner)) {
      console.log(`[Gomoku] 选色拒绝: 不是胜者 pid=${pid} rpsWinner=${state.rpsWinner}`);
      return;
    }
    if (color !== 'black' && color !== 'white') {
      console.log(`[Gomoku] 选色拒绝: 颜色不对 color=${color}`);
      return;
    }

    const other = state.players.find(p => String(p) !== String(pid));
    // 统一用字符串 key
    state[color + 'Id'] = pid;
    state[color === 'black' ? 'whiteId' : 'blackId'] = other;

    // 黑棋先走，设置 players 顺序: [blackId, whiteId]
    state.players = [state.blackId, state.whiteId];
    state.currentTurn = 0; // 黑棋先走
    state.phase = 'playing';

    console.log(`[Gomoku] 选色完成: blackId=${state.blackId}, whiteId=${state.whiteId}, currentTurn=${state.currentTurn}`);

    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'color_chosen',
      blackId: state.blackId,
      whiteId: state.whiteId,
      message: `${String(pid) === String(state.rpsWinner) ? '你' : '对方'}选择了${color === 'black' ? '执黑（先手）' : '执白（后手）'}，黑棋先行`,
    });

    // 向每个玩家发送完整的 game_start
    for (const p of state.players) {
      this.doBroadcastTo(roomId, p, {
        type: 'game_start',
        state: this.getVisibleState(state, p),
      });
    }

    // 如果黑棋是 bot，触发 AI 走棋
    const blackPlayerId = state.players[0];
    if (String(blackPlayerId).startsWith('bot_')) {
      this.makeBotMove(roomId, state, blackPlayerId);
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

    // 如果下一个是 bot，触发 bot 走棋
    const nextPlayerId = state.players[state.currentTurn];
    if (String(nextPlayerId).startsWith('bot_')) {
      this.makeBotMove(roomId, state, nextPlayerId);
    }
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

    // 如果对手是 bot，延迟后随机同意或拒绝（50/50）
    if (String(opponentId).startsWith('bot_')) {
      setTimeout(() => {
        const currentState = this.getState(roomId);
        if (!currentState || currentState.phase !== 'playing') return;

        if (Math.random() < 0.5) {
          // 同意和棋
          currentState.phase = 'ended';
          this.saveState(roomId, currentState);

          this.doBroadcast(roomId, {
            type: 'state_update',
            state: this.getVisibleState(currentState, pid),
          });

          this.doBroadcastTo(roomId, pid, {
            type: 'game_over',
            reason: 'draw_agreed',
            message: '对手同意和棋，本局平局',
          });
        } else {
          // 拒绝和棋
          this.doBroadcastTo(roomId, pid, {
            type: 'draw_rejected',
            message: '对手拒绝了和棋请求',
          });
        }
      }, 1500 + Math.floor(Math.random() * 500));
      return;
    }

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
    if (!state || state.phase !== 'playing' || !state.drawRequest) return;

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
          reason: 'draw_agreed',
        });
      }
    } else {
      const requesterId = state.players.find(p => String(p) !== String(pid));
      this.doBroadcastTo(roomId, requesterId, {
        type: 'draw_rejected',
        message: '对方已拒绝您的求和',
      });
    }
  }

  // ========== Bot 辅助 ==========

  makeBotRPS(roomId, botId) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'rps') return;
    if (state.rpsChoices[botId]) return; // bot 已出拳

    const delay = 1000 + Math.floor(Math.random() * 1000);
    setTimeout(() => {
      const currentState = this.getState(roomId);
      if (!currentState || currentState.phase !== 'rps') return;
      if (currentState.rpsChoices[botId]) return; // bot 已出拳

      const choices = Object.keys(RPS_CHOICES);
      const choice = choices[Math.floor(Math.random() * choices.length)];
      console.log(`[Gomoku-Bot] ${botId} 出拳: ${choice}`);
      this.handleRPS(roomId, botId, choice);
    }, delay);
  }

  makeBotChoose(roomId, botId) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'choosing') return;
    if (String(state.rpsWinner) !== String(botId)) return;

    const delay = 1500 + Math.floor(Math.random() * 1000);
    setTimeout(() => {
      const currentState = this.getState(roomId);
      if (!currentState || currentState.phase !== 'choosing') return;

      const color = Math.random() < 0.5 ? 'black' : 'white';
      console.log(`[Gomoku-Bot] ${botId} 选色: ${color}`);
      this.handleChooseColor(roomId, botId, color);
    }, delay);
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
