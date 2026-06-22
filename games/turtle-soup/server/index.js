/**
 * 海龟汤游戏服务器
 *
 * 规则：
 * 1. 投票阶段：玩家投票选择谜题类型
 * 2. 出题阶段：随机抽取该类型下的谜题
 * 3. 提问阶段：轮流向AI裁判提问（是否问题）
 * 4. 猜谜阶段：任何时候可以提交最终猜测
 * 5. 判定阶段：AI判定猜测是否正确
 *
 * AI判别：DeepSeek优先，ModelScope备用
 */

const { CATEGORIES, PUZZLES } = require('./puzzles');

// DeepSeek API
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = 'deepseek-chat';

// ModelScope API
const MODELSOPE_API_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
const MODELSOPE_API_KEY = process.env.MODELSCOPE_API_KEY || '';
const MODELSOPE_MODEL = 'Qwen/Qwen3.5-397B-A17B';

// ========== 游戏服务器基类 ==========

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

  /** 广播最新的 gameState 给所有玩家（每个玩家看到各自的可见状态） */
  syncState(roomId) {
    const state = this.getState(roomId);
    if (!state) return;
    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });
    }
  }
  initGameState(players) { return { players }; }
  getVisibleState(gs, pid) { return gs; }
  onPlayerAction(roomId, pid, action) {}
  postInit(roomId) {}
}

// ========== 海龟汤游戏服务器 ==========

class TurtleSoupServer extends BaseGameServer {
  constructor() {
    super();
    this._llmQueue = [];
    this._llmProcessing = false;
  }

  // ========== 初始化 ==========

  initGameState(players) {
    return {
      players: [...players],
      phase: 'voting',           // voting | playing | ended
      categories: CATEGORIES,
      votes: {},                 // pid -> categoryId
      puzzle: null,              // 当前谜题
      currentTurn: 0,            // 当前提问者索引
      questions: [],             // 提问历史 [{pid, question, answer, timestamp}]
      guesses: [],               // 猜测历史 [{pid, guess, result, correct, timestamp}]
      winner: null,
      turnStartTime: Date.now(),
      questionTimeout: 60000,    // 每轮提问限时60秒
      maxQuestions: 30,          // 最多30个问题
      roundNumber: 1,            // 当前轮次
      totalRounds: 5,            // 总轮次
      usedCategories: [],        // 已使用过的分类
      roundScores: {},           // { roundNumber: { pid: score } }
      scores: {},                // pid -> total score
      answeringInProgress: false,
      pendingGuesses: {},
      guessedPlayers: {},
      answerRevealed: false,       // 汤底是否已揭示
      acknowledgedPlayers: {},     // pid -> true 已读玩家
      revealTimer: null,           // 汤底展示计时器
    };
  }

  getVisibleState(gs, pid) {
    // 深拷贝防止客户端修改服务端状态
    // 注意：排除所有不可序列化的字段（Timer对象会导致socket.io栈溢出）
    const {
      revealTimer, voteTimer, _turnTimer, _advancing, _isFinalReveal,
      answeringInProgress,
      ...rest
    } = gs;
    const visible = {
      ...rest,
      questions: gs.questions ? gs.questions.map(q => ({ ...q })) : [],
      guesses: gs.guesses ? gs.guesses.map(g => ({ ...g })) : [],
      votes: gs.votes ? { ...gs.votes } : {},
      scores: gs.scores ? { ...gs.scores } : {},
      roundScores: gs.roundScores ? { ...gs.roundScores } : {},
      pendingGuesses: gs.pendingGuesses ? { ...gs.pendingGuesses } : {},
      guessedPlayers: gs.guessedPlayers ? { ...gs.guessedPlayers } : {},
      usedCategories: gs.usedCategories ? [...gs.usedCategories] : [],
      totalRounds: gs.totalRounds || 5,
    };

    // 隐藏谜底（除非游戏结束或汤底已揭示）
    if (visible.phase !== 'ended' && !visible.answerRevealed && visible.puzzle) {
      visible.puzzle = {
        id: visible.puzzle.id,
        category: visible.puzzle.category,
        title: visible.puzzle.title,
        // 不暴露 answer 和 keyFacts
      };
    }

    // 初始化分数
    if (!visible.scores) {
      visible.scores = {};
      for (const p of visible.players) {
        visible.scores[p] = 0;
      }
    }

    return visible;
  }

  postInit(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    // 初始化分数
    for (const pid of state.players) {
      if (!state.scores[pid]) state.scores[pid] = 0;
    }

    this.saveState(roomId, state);

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
    if (!state || state.phase === 'ended') return;

    console.log(`[TurtleSoup] Player ${pid} action: ${action.type}`);

    switch (action.type) {
      case 'vote':
        this.handleVote(roomId, pid, action.categoryId);
        break;
      case 'ask':
        this.handleAsk(roomId, pid, action.question);
        break;
      case 'guess':
        this.handleGuess(roomId, pid, action.guess);
        break;
      case 'skip':
        this.handleSkip(roomId, pid);
        break;
      case 'acknowledge_answer':
        this.handleAcknowledge(roomId, pid);
        break;
    }
  }

  // ========== 投票阶段 ==========

  handleVote(roomId, pid, categoryId) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'voting') return;

    // 验证分类
    const validCategory = CATEGORIES.find(c => c.id === categoryId);
    if (!validCategory) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '无效的分类' });
      return;
    }

    state.votes[pid] = categoryId;
    this.saveState(roomId, state);

    // 广播投票更新 + 同步完整状态
    this.doBroadcast(roomId, {
      type: 'vote_update',
      votes: this.getVoteSummary(state),
      voterId: pid,
    });
    this.syncState(roomId);

    // 检查是否所有人类玩家都已投票（排除bot）
    const humanPlayers = state.players.filter(pid => !String(pid).startsWith('bot_'));
    if (Object.keys(state.votes).length >= humanPlayers.length) {
      this.startPuzzlePhase(roomId, state);
    } else if (!state.voteTimer) {
      // 启动投票超时计时器（60秒后自动为未投票者随机分配）
      state.voteTimer = setTimeout(() => {
        const currentState = this.getState(roomId);
        if (!currentState || currentState.phase !== 'voting') return;
        // 为未投票的玩家随机分配
        for (const p of currentState.players) {
          if (!currentState.votes[p]) {
            const randomCat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
            currentState.votes[p] = randomCat.id;
          }
        }
        this.saveState(roomId, currentState);
        this.doBroadcast(roomId, {
          type: 'vote_update',
          votes: this.getVoteSummary(currentState),
          voterId: null,
        });
        this.syncState(roomId);
        this.startPuzzlePhase(roomId, currentState);
      }, 60000);
    }
  }

  getVoteSummary(state) {
    const summary = {};
    for (const cat of CATEGORIES) {
      summary[cat.id] = 0;
    }
    for (const [, catId] of Object.entries(state.votes)) {
      summary[catId] = (summary[catId] || 0) + 1;
    }
    return summary;
  }

  startPuzzlePhase(roomId, state) {
    // 过滤已使用的分类
    const availableCategories = CATEGORIES.filter(c => !(state.usedCategories || []).includes(c.id));
    const catsToVote = availableCategories.length > 0 ? availableCategories : CATEGORIES;

    // 统计票数，选最高票分类（只从可选分类中选）
    const voteSummary = this.getVoteSummary(state);
    let maxVotes = 0;
    let winnerCategory = catsToVote[0].id;

    for (const [catId, count] of Object.entries(voteSummary)) {
      if (count > maxVotes && catsToVote.some(c => c.id === catId)) {
        maxVotes = count;
        winnerCategory = catId;
      }
    }

    // 平票随机选
    const tied = Object.entries(voteSummary)
      .filter(([catId, count]) => count === maxVotes && catsToVote.some(c => c.id === catId))
      .map(([catId]) => catId);
    if (tied.length > 0) winnerCategory = tied[Math.floor(Math.random() * tied.length)];

    // 从该分类随机选一个谜题
    const categoryPuzzles = PUZZLES.filter(p => p.category === winnerCategory);
    const puzzle = categoryPuzzles.length > 0
      ? categoryPuzzles[Math.floor(Math.random() * categoryPuzzles.length)]
      : PUZZLES[Math.floor(Math.random() * PUZZLES.length)];

    // 记录已使用的分类
    if (!state.usedCategories) state.usedCategories = [];
    state.usedCategories.push(winnerCategory);

    state.phase = 'playing';
    state.puzzle = puzzle;
    state.currentTurn = 0;
    state.turnStartTime = Date.now();

    // 初始化分数
    for (const pid of state.players) {
      if (!state.scores[pid]) state.scores[pid] = 0;
    }

    this.saveState(roomId, state);

    const categoryInfo = CATEGORIES.find(c => c.id === winnerCategory);

    // 广播谜题 + 同步状态
    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'puzzle_revealed',
        puzzle: { id: puzzle.id, category: puzzle.category, title: puzzle.title },
        categoryInfo,
        currentTurnPlayer: state.players[state.currentTurn],
        state: this.getVisibleState(state, pid),
      });
    }
    this.syncState(roomId);
  }

  // ========== 提问阶段 ==========

  handleAsk(roomId, pid, question) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    if (!state.puzzle) return;

    // 检查玩家是否已提交猜测
    if (state.guessedPlayers[pid]) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '你已提交猜测，无法继续提问' });
      return;
    }

    // 检查是否轮到该玩家
    if (state.players[state.currentTurn] !== pid) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '还没轮到你提问' });
      return;
    }

    // 并发保护：AI正在回答时不允许再提问
    if (state.answeringInProgress) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: 'AI正在回答上一个问题，请等待' });
      return;
    }

    // 检查问题数量限制
    if (state.questions.length >= state.maxQuestions) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '已达到最大提问数量' });
      return;
    }

    if (!question || question.trim().length === 0) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '请输入问题' });
      return;
    }

    // 标记AI正在回答
    state.answeringInProgress = true;

    // 记录问题
    const questionEntry = {
      pid,
      question: question.trim(),
      answer: null,
      timestamp: Date.now(),
    };
    state.questions.push(questionEntry);

    // 异步调用 AI 判别
    this.judgeQuestion(roomId, state, questionEntry);
  }

  async judgeQuestion(roomId, state, questionEntry) {
    const questionIndex = state.questions.length - 1;

    // 先广播"正在思考"
    this.doBroadcast(roomId, {
      type: 'ai_thinking',
      questionIndex,
    });

    try {
      const answer = await this.callAIJudge(
        state.puzzle.title,
        state.puzzle.answer,
        state.puzzle.keyFacts,
        questionEntry.question,
        'question'
      );

      questionEntry.answer = answer;
      state.answeringInProgress = false;
      this.saveState(roomId, state);

      // 广播回答 + 同步状态
      this.doBroadcast(roomId, {
        type: 'question_answered',
        questionIndex,
        pid: questionEntry.pid,
        question: questionEntry.question,
        answer: answer,
      });
      this.syncState(roomId);

      // 推进到下一个玩家
      this.advanceTurn(roomId, state);

    } catch (err) {
      console.error(`[TurtleSoup] AI判别失败:`, err.message);
      // AI失败：移除该问题（不罚提问次数），恢复并发标记
      const idx = state.questions.indexOf(questionEntry);
      if (idx !== -1) state.questions.splice(idx, 1);
      state.answeringInProgress = false;
      this.saveState(roomId, state);

      this.doBroadcastTo(roomId, questionEntry.pid, {
        type: 'error',
        message: 'AI判别失败，请重新提问',
      });
    }
  }

  advanceTurn(roomId, state) {
    state.currentTurn = (state.currentTurn + 1) % state.players.length;
    state.turnStartTime = Date.now();
    // 注意：roundNumber 不在这里递增，只在一轮结束时递增
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'turn_changed',
      currentTurnPlayer: state.players[state.currentTurn],
      roundNumber: state.roundNumber,
      questionsRemaining: state.maxQuestions - state.questions.length,
    });
    this.syncState(roomId);
  }

  // ========== 猜谜阶段 ==========

  handleGuess(roomId, pid, guess) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    if (!guess || guess.trim().length === 0) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '请输入猜测' });
      return;
    }

    // 检查是否已经提交过猜测
    if (state.guessedPlayers[pid]) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '你已经提交过猜测了' });
      return;
    }

    // 存储猜测，但不立即判定
    state.pendingGuesses[pid] = { guess: guess.trim(), timestamp: Date.now() };
    state.guessedPlayers[pid] = true;
    this.saveState(roomId, state);

    // 广播猜测已提交
    this.doBroadcast(roomId, {
      type: 'guess_submitted',
      pid,
      guessCount: Object.keys(state.pendingGuesses).length,
      totalPlayers: state.players.length,
    });
    this.syncState(roomId);

    // 检查是否所有人类玩家都已提交猜测（排除bot）
    const humanPlayers = state.players.filter(pid => !String(pid).startsWith('bot_'));
    if (Object.keys(state.pendingGuesses).length >= humanPlayers.length) {
      this.judgeAllGuesses(roomId, state);
    }
  }

  async judgeGuess(roomId, state, guessEntry) {
    const guessIndex = state.guesses.length - 1;

    // 广播"正在判定"
    this.doBroadcast(roomId, {
      type: 'ai_judging_guess',
      guessIndex,
    });

    try {
      const result = await this.callAIJudge(
        state.puzzle.title,
        state.puzzle.answer,
        state.puzzle.keyFacts,
        guessEntry.guess,
        'guess'
      );

      // 解析结果
      const isCorrect = this.parseGuessResult(result);
      guessEntry.result = result;
      guessEntry.correct = isCorrect;

      this.saveState(roomId, state);

      // 广播猜测结果 + 同步状态
      this.doBroadcast(roomId, {
        type: 'guess_result',
        guessIndex,
        pid: guessEntry.pid,
        guess: guessEntry.guess,
        result: result,
        correct: isCorrect,
      });
      this.syncState(roomId);

      if (isCorrect) {
        // 猜对了！游戏结束
        state.winner = guessEntry.pid;
        state.scores[guessEntry.pid] = (state.scores[guessEntry.pid] || 0) + 100;

        // 给提问者加分
        for (let i = 0; i < state.questions.length; i++) {
          const q = state.questions[i];
          state.scores[q.pid] = (state.scores[q.pid] || 0) + 5;
        }

        this.endGame(roomId, state);
      }

    } catch (err) {
      console.error(`[TurtleSoup] AI判定猜测失败:`, err.message);
      guessEntry.result = 'AI判定失败，请重试';
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'guess_result',
        guessIndex,
        pid: guessEntry.pid,
        guess: guessEntry.guess,
        result: 'AI判定失败，请重试',
        correct: false,
      });
    }
  }

  async judgeAllGuesses(roomId, state) {
    const pendingGuesses = { ...state.pendingGuesses };

    this.doBroadcast(roomId, {
      type: 'ai_judging_all_guesses',
      count: Object.keys(pendingGuesses).length,
    });

    const roundNum = state.roundNumber;
    if (!state.roundScores[roundNum]) state.roundScores[roundNum] = {};

    const results = [];

    for (const [pid, guessData] of Object.entries(pendingGuesses)) {
      const guessEntry = {
        pid,
        guess: guessData.guess,
        result: null,
        score: 0,
        timestamp: guessData.timestamp,
      };
      state.guesses.push(guessEntry);

      try {
        // 用相关度打分替代二元判定
        const prompt = `谜题: ${state.puzzle.title}\n真相: ${state.puzzle.answer}\n关键事实: ${(state.puzzle.keyFacts || []).join(', ')}\n\n玩家猜测: ${guessData.guess}\n\n请根据猜测与真相的相关程度打分(0-100):\n- 90-100: 完全正确或几乎完全正确\n- 70-89: 非常接近，抓住了核心要点\n- 50-69: 部分正确，抓住了某些关键点\n- 30-49: 有一定相关性但偏离较大\n- 0-29: 基本不相关或完全错误\n\n只回复一个数字(0-100)，不要其他内容。`;

        const scoreStr = await this.callAI(prompt, 10);
        const score = Math.max(0, Math.min(100, parseInt(scoreStr) || 0));

        guessEntry.result = `${score}分`;
        guessEntry.score = score;
        state.roundScores[roundNum][pid] = (state.roundScores[roundNum][pid] || 0) + score;
        state.scores[pid] = (state.scores[pid] || 0) + score;

        results.push({ pid, guess: guessData.guess, score, result: `${score}分` });
      } catch (err) {
        console.error(`[TurtleSoup] AI打分失败 (${pid}):`, err.message);
        guessEntry.result = 'AI打分失败';
        guessEntry.score = 0;
        results.push({ pid, guess: guessData.guess, score: 0, result: 'AI打分失败' });
      }
    }

    // 给提问者加分
    for (const q of state.questions) {
      const bonus = 3;
      state.scores[q.pid] = (state.scores[q.pid] || 0) + bonus;
    }

    state.pendingGuesses = {};
    state.guessedPlayers = {};
    state.answerRevealed = true;
    state.acknowledgedPlayers = {};
    this.saveState(roomId, state);

    // 广播本轮结果（含汤底）
    this.doBroadcast(roomId, {
      type: 'round_results',
      roundNumber: roundNum,
      results,
      scores: { ...state.scores },
      roundScores: { ...state.roundScores[roundNum] },
      puzzle: state.puzzle,
      revealDuration: 120,
    });
    this.syncState(roomId);

    // 判断是否进入下一轮
    if (roundNum < (state.totalRounds || 5)) {
      // 中间轮次：120秒后自动进入下一轮（如果所有人已读则提前进入）
      state.revealTimer = setTimeout(() => {
        this.advanceToNextRound(roomId, roundNum);
      }, 120000);
      this.saveState(roomId, state);
    } else {
      // 最后一轮：也要先展示汤底，120秒后（或全员已读）再结束游戏
      state.revealTimer = setTimeout(() => {
        this.endGame(roomId, this.getState(roomId));
      }, 120000);
      state._isFinalReveal = true;
      this.saveState(roomId, state);
    }
  }

  parseGuessResult(result) {
    if (!result) return false;
    const lower = result.toLowerCase();
    // 先排除"部分正确"和"不正确"的情况
    if (lower.includes('部分正确') || lower.includes('不完整') || lower.includes('不正确') || lower.includes('不准确')) {
      return false;
    }
    // 再检查完全正确的关键词
    return (
      lower.includes('猜对') ||
      lower.includes('完全正确') ||
      lower.includes('正确，') ||
      lower.includes('正确！') ||
      lower.includes('一致') ||
      lower.includes('符合') ||
      lower.includes('correct') ||
      lower.includes('right')
    );
  }

  // ========== 跳过回合 ==========

  handleSkip(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== pid) return;

    this.doBroadcast(roomId, {
      type: 'player_skipped',
      pid,
    });

    this.advanceTurn(roomId, state);
    this.syncState(roomId);
  }

  // ========== 汤底已读 ==========

  handleAcknowledge(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || !state.answerRevealed) return;

    // 已经点过已读
    if (state.acknowledgedPlayers[pid]) return;

    state.acknowledgedPlayers[pid] = true;
    this.saveState(roomId, state);

    // 广播已读状态更新
    this.doBroadcast(roomId, {
      type: 'answer_ack_update',
      pid,
      acknowledgedPlayers: { ...state.acknowledgedPlayers },
      totalPlayers: state.players.length,
    });
    this.syncState(roomId);

    // 检查是否所有人类玩家都已读（排除bot）
    const humanPlayers = state.players.filter(pid => !String(pid).startsWith('bot_'));
    if (Object.keys(state.acknowledgedPlayers).length >= humanPlayers.length) {
      // 清除倒计时
      if (state.revealTimer) {
        clearTimeout(state.revealTimer);
        state.revealTimer = null;
      }
      if (state._isFinalReveal) {
        // 最后一轮：全员已读，结束游戏
        state._isFinalReveal = false;
        this.saveState(roomId, state);
        this.endGame(roomId, state);
      } else {
        // 中间轮次：全员已读，进入下一轮
        this.advanceToNextRound(roomId, state.roundNumber);
      }
    }
  }

  /** 进入下一轮投票（带竞态防护） */
  advanceToNextRound(roomId, currentRound) {
    const currentState = this.getState(roomId);
    if (!currentState || currentState.phase === 'ended') return;
    // 竞态防护：防止被调用两次导致 roundNumber 递增两次
    if (currentState._advancing) return;
    currentState._advancing = true;

    currentState.roundNumber = currentRound + 1;
    currentState.phase = 'voting';
    currentState.votes = {};
    currentState.puzzle = null;
    currentState.questions = [];
    currentState.guesses = [];
    currentState.currentTurn = 0;
    currentState.pendingGuesses = {};
    currentState.guessedPlayers = {};
    currentState.answerRevealed = false;
    currentState.acknowledgedPlayers = {};
    if (currentState.voteTimer) clearTimeout(currentState.voteTimer);
    currentState.voteTimer = null;
    if (currentState.revealTimer) clearTimeout(currentState.revealTimer);
    currentState.revealTimer = null;
    currentState._advancing = false; // 重置锁
    this.saveState(roomId, currentState);
    this.syncState(roomId);
    this.doBroadcast(roomId, {
      type: 'new_round',
      roundNumber: currentRound + 1,
      totalRounds: currentState.totalRounds || 5,
      usedCategories: currentState.usedCategories || [],
    });
  }

  // ========== 游戏结束 ==========

  endGame(roomId, state) {
    state.phase = 'ended';
    this.saveState(roomId, state);

    // 计算最终分数
    const finalScores = {};
    for (const pid of state.players) {
      finalScores[pid] = state.scores[pid] || 0;
    }

    this.doBroadcast(roomId, {
      type: 'game_over',
      winner: state.winner,
      puzzle: state.puzzle, // 暴露完整谜底
      scores: finalScores,
      questions: state.questions,
      guesses: state.guesses,
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, {
        winners: state.winner ? [state.winner] : [],
        scores: finalScores,
      });
    }
  }

  // ========== AI 判别 ==========

  async callAIJudge(puzzleTitle, puzzleAnswer, keyFacts, userInput, mode) {
    const systemPrompt = mode === 'question'
      ? `你是"海龟汤"推理游戏的AI裁判。

海龟汤规则：
- 出题者会给出一个诡异的场景描述
- 玩家只能问"是/不是"类型的问题
- 你必须根据谜底回答

你的回答只能是以下之一：
- "是" - 问题的答案是肯定的
- "不是" - 问题的答案是否定的
- "是也不是" - 部分正确部分不正确
- "不相关" - 问题与谜底无关

请严格按照规则回答，不要解释原因。`
      : `你是"海龟汤"推理游戏的AI裁判。

海龟汤规则：
- 出题者会给出一个诡异的场景描述
- 玩家会提交他们的最终猜测
- 你需要判断猜测是否与谜底一致

判定标准：
- 如果猜测的核心逻辑与谜底一致，回答"正确，猜对了！"
- 如果猜测部分正确但不完整，回答"部分正确，但不完整，关键点：..."
- 如果猜测完全错误，回答"不正确，继续思考吧"

请简要说明判定理由。`;

    const userPrompt = mode === 'question'
      ? `场景：${puzzleTitle}

谜底：${puzzleAnswer}

关键事实：${keyFacts.join('、')}

玩家提问：${userInput}

请回答（是/不是/是也不是/不相关）：`
      : `场景：${puzzleTitle}

谜底：${puzzleAnswer}

关键事实：${keyFacts.join('、')}

玩家猜测：${userInput}

请判定猜测是否正确：`;

    // DeepSeek优先
    try {
      const result = await this.callSingleAPI(
        DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
        systemPrompt, userPrompt, mode === 'question' ? 50 : 150
      );
      if (result) {
        console.log(`[TurtleSoup-LLM] DeepSeek: ${result.substring(0, 100)}`);
        return result;
      }
    } catch (err) {
      console.warn(`[TurtleSoup-LLM] DeepSeek失败: ${err.message}`);
    }

    // ModelScope备用
    try {
      const result = await this.callSingleAPI(
        MODELSOPE_API_URL, MODELSOPE_API_KEY, MODELSOPE_MODEL,
        systemPrompt, userPrompt, mode === 'question' ? 50 : 150
      );
      if (result) {
        console.log(`[TurtleSoup-LLM] ModelScope: ${result.substring(0, 100)}`);
        return result;
      }
    } catch (err) {
      console.warn(`[TurtleSoup-LLM] ModelScope失败: ${err.message}`);
    }

    // 兜底：根据模式返回默认值
    if (mode === 'question') {
      return '不相关';
    }
    return 'AI判定失败，请重试';
  }

  // 简单AI调用（直接传prompt）
  async callAI(prompt, maxTokens = 100) {
    try {
      const result = await this.callSingleAPI(
        DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
        '你是一个精确的评分助手。只回复数字。', prompt, maxTokens
      );
      if (result) return result;
    } catch (err) {
      console.warn(`[TurtleSoup-LLM] callAI失败: ${err.message}`);
    }
    try {
      const result = await this.callSingleAPI(
        MODELSOPE_API_URL, MODELSOPE_API_KEY, MODELSOPE_MODEL,
        '你是一个精确的评分助手。只回复数字。', prompt, maxTokens
      );
      if (result) return result;
    } catch (err) {}
    return '50';
  }

  async callSingleAPI(apiUrl, apiKey, model, systemPrompt, userPrompt, maxTokens) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = TurtleSoupServer;
