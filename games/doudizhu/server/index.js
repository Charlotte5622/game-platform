const { BaseGameServer } = require('../../../server/src/services/baseGameServer');

const { createDeck, shuffleDeck, dealCards, getCardType, canBeat } = require('./cards');

/**
 * 斗地主游戏服务器
 *
 * 游戏流程：
 * 1. 洗牌发牌（每人17张，3张底牌）
 * 2. 叫地主（轮流叫分 1/2/3，最高者为地主）
 * 3. 出牌（地主先出，逆时针轮流）
 * 4. 胜负判定（地主先出完 vs 农民先出完）
 */
class DoudizhuServer extends BaseGameServer {
  constructor() {
    super();
  }

  /**
   * 初始化游戏状态
   */
  initGameState(players) {
    const deck = shuffleDeck(createDeck());
    const { hands, kitty } = dealCards(deck);

    const playerHands = {};
    players.forEach((playerId, i) => {
      playerHands[playerId] = hands[i];
    });

    return {
      players: [...players],
      playerHands,
      kitty,
      landlord: null,
      phase: 'bidding',        // bidding | playing
      bidTurn: 0,               // 当前叫分玩家索引
      bidRound: 0,              // 叫分轮次 (0, 1, 2)
      bids: {},                 // playerId -> { score, timestamp }
      highestBid: 0,
      highestBidder: null,
      currentTurn: 0,           // 出牌玩家索引
      lastPlay: null,           // { playerId, cards, cardType }
      lastPlayedBy: null,       // 最后出牌的玩家 ID
      consecutivePasses: 0,     // 连续过牌次数
      bombCount: 0,             // 炸弹/火箭打出次数（用于计分翻倍）
      playHistory: [],          // [{ playerId, cards, cardType, action }]
    };
  }

  /**
   * 获取玩家可见的状态（隐藏其他玩家手牌）
   */
  getVisibleState(gameState, playerId) {
    const visible = { ...gameState };

    // 当前玩家手牌
    visible.myHand = (gameState.playerHands[playerId] || []).sort((a, b) => a.value - b.value);

    // 各玩家牌数
    visible.playerCardCounts = {};
    for (const pid of gameState.players) {
      visible.playerCardCounts[pid] = gameState.playerHands[pid]?.length || 0;
    }

    // 隐藏其他玩家手牌
    delete visible.playerHands;

    return visible;
  }

  /**
   * 处理玩家操作
   */
  onPlayerAction(roomId, playerId, action) {
    const state = this.getState(roomId);
    if (!state) return;

    switch (action.type) {
      case 'bid':
        this.handleBid(roomId, playerId, action.score);
        break;
      case 'play':
        this.handlePlay(roomId, playerId, action.cards);
        break;
      case 'pass':
        this.handlePass(roomId, playerId);
        break;
    }
  }

  // ========== 叫分逻辑 ==========

  handleBid(roomId, playerId, score) {
    const state = this.getState(roomId);
    if (!state) return;

    if (state.phase !== 'bidding') return;
    if (state.players[state.bidTurn] !== playerId) return;
    if (state.bids[playerId] !== undefined) return; // 已经叫过

    // 验证叫分
    if (score !== 0 && (score < 1 || score > 3)) return;
    if (score !== 0 && score <= state.highestBid) return;

    // 记录叫分
    state.bids[playerId] = { score, time: Date.now() };
    state.bidRound++;

    if (score > 0) {
      state.highestBid = score;
      state.highestBidder = playerId;
    }

    // 广播叫分结果 + 完整状态
    this.doBroadcast(roomId, {
      type: 'bid_update',
      playerId,
      score,
      highestBid: state.highestBid,
      bidRound: state.bidRound,
      bids: state.bids,
    });
    this.broadcastStateUpdate(roomId, state);

    // 叫 3 分直接成为地主
    if (score === 3) {
      this.saveState(roomId, state);
      setTimeout(() => this.setLandlord(roomId, playerId), 1000);
      return;
    }

    // 所有人叫完
    if (state.bidRound >= 3) {
      this.saveState(roomId, state);
      if (state.highestBidder) {
        setTimeout(() => this.setLandlord(roomId, state.highestBidder), 1000);
      } else {
        // 没人叫，重新发牌
        setTimeout(() => this.restartGame(roomId), 1500);
      }
      return;
    }

    // 下一个人叫分
    state.bidTurn = (state.bidTurn + 1) % 3;
    this.saveState(roomId, state);
  }

  /**
   * 设置地主
   */
  setLandlord(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state) return;

    state.landlord = playerId;
    state.phase = 'playing';

    // 地主拿底牌
    state.playerHands[playerId] = [
      ...state.playerHands[playerId],
      ...state.kitty,
    ].sort((a, b) => a.value - b.value);

    // 地主先出牌
    state.currentTurn = state.players.indexOf(playerId);

    this.saveState(roomId, state);

    // 向每个玩家发送各自可见的游戏状态
    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'game_start',
        state: this.getVisibleState(state, pid),
      });
    }
  }

  // ========== 出牌逻辑 ==========

  handlePlay(roomId, playerId, cards) {
    const state = this.getState(roomId);
    if (!state) return;

    if (state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== playerId) return;
    if (!cards || cards.length === 0) return;

    // 验证牌在手中
    const hand = state.playerHands[playerId];
    const cardIds = new Set(cards.map(c => c.id));
    const hasAll = [...cardIds].every(id => hand.some(c => c.id === id));
    if (!hasAll) return;

    // 验证牌型
    const cardType = getCardType(cards);
    if (!cardType) {
      this.doBroadcastTo(roomId, playerId, { type: 'error', message: '无效牌型' });
      return;
    }

    // 验证能否压过上一手
    if (state.lastPlay && state.lastPlayedBy !== playerId) {
      if (!canBeat(state.lastPlay.cardType, cardType)) {
        this.doBroadcastTo(roomId, playerId, { type: 'error', message: '打不过上家' });
        return;
      }
    }

    // 从手牌中移除
    state.playerHands[playerId] = hand.filter(c => !cardIds.has(c.id));

    // 更新状态
    state.lastPlay = { playerId, cards, cardType };
    state.lastPlayedBy = playerId;
    state.consecutivePasses = 0;

    // 炸弹/火箭翻倍计数
    if (cardType.type === 'bomb' || cardType.type === 'rocket') {
      state.bombCount++;
    }
    state.playHistory.push({
      playerId,
      cards,
      cardType,
      action: 'play',
    });

    // 广播出牌
    this.doBroadcast(roomId, {
      type: 'play_update',
      playerId,
      cards,
      cardType,
      remainingCards: state.playerHands[playerId].length,
    });

    // 检查是否出完
    if (state.playerHands[playerId].length === 0) {
      this.saveState(roomId, state);
      setTimeout(() => this.handleGameOver(roomId, playerId), 500);
      return;
    }

    // 下一个玩家
    state.currentTurn = (state.currentTurn + 1) % 3;
    this.saveState(roomId, state);

    // 广播状态更新
    this.broadcastStateUpdate(roomId, state);
  }

  /**
   * 过牌
   */
  handlePass(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state) return;

    if (state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== playerId) return;

    // 如果是自己出的牌（其他人已过），不能过，必须出
    if (state.lastPlayedBy === playerId) {
      this.doBroadcastTo(roomId, playerId, { type: 'error', message: '轮到你出牌，不能跳过' });
      return;
    }

    state.consecutivePasses++;
    state.playHistory.push({ playerId, cards: [], action: 'pass' });

    // 广播过牌
    this.doBroadcast(roomId, {
      type: 'pass_update',
      playerId,
    });

    // 两人连续过牌 → 最后出牌者重新自由出牌
    if (state.consecutivePasses >= 2) {
      state.lastPlay = null;
      state.consecutivePasses = 0;
      // 轮到最后出牌的人
      state.currentTurn = state.players.indexOf(state.lastPlayedBy);
    } else {
      // 下一个玩家
      state.currentTurn = (state.currentTurn + 1) % 3;
    }

    this.saveState(roomId, state);
    this.broadcastStateUpdate(roomId, state);
  }

  /**
   * 广播状态更新（每人看到自己的手牌）
   */
  broadcastStateUpdate(roomId, state) {
    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });
    }
  }

  // ========== 游戏结束 ==========

  handleGameOver(roomId, winnerId) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return; // 防止重复触发
    state.phase = 'ended'; // 标记游戏结束，防止重复触发

    const isLandlord = winnerId === state.landlord;
    const winners = isLandlord
      ? [state.landlord]
      : state.players.filter(p => p !== state.landlord);

    const multiplier = Math.pow(2, state.bombCount || 0);
    const baseScore = state.highestBid * multiplier;
    const scores = {};
    for (const pid of state.players) {
      if (pid === state.landlord) {
        scores[pid] = isLandlord ? baseScore * 2 : -baseScore * 2;
      } else {
        scores[pid] = isLandlord ? -baseScore : baseScore;
      }
    }

    this.doBroadcast(roomId, {
      type: 'game_over',
      winner: winnerId,
      winners,
      landlord: state.landlord,
      scores,
      message: isLandlord ? '🎉 地主获胜！' : '🎉 农民获胜！',
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, { winners, scores, landlord: state.landlord });
    }
  }

  /**
   * 重新发牌
   */
  restartGame(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    const players = state.players;
    const newState = this.initGameState(players);
    this.saveState(roomId, newState);

    for (const pid of players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'game_restart',
        state: this.getVisibleState(newState, pid),
        message: '没有人叫地主，重新发牌',
      });
    }
  }
}

module.exports = DoudizhuServer;
