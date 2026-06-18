/**
 * 游戏服务器基类
 * 提供房间管理、广播等基础功能
 */
class GameServer {
  constructor() {
    this.rooms = new Map();
    this.broadcast = null;  // 由平台设置
    this.onGameOver = null; // 由平台设置
  }

  initGameState(players) {
    return { players, turn: 0 };
  }

  getVisibleState(gameState, playerId) {
    return gameState;
  }

  onPlayerAction(roomId, playerId, action) {
    // 子类实现
  }
}

const BaseGameServer = GameServer;
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
    // 覆盖父类的 rooms，使用自定义结构
    this.rooms = new Map();
  }

  /**
   * 初始化游戏状态
   */
  initGameState(players) {
    const deck = shuffleDeck(createDeck());
    const { hands, kitty } = dealCards(deck);

    // 为每个玩家创建手牌映射
    const playerHands = {};
    players.forEach((playerId, i) => {
      playerHands[playerId] = hands[i];
    });

    return {
      players: [...players],
      playerHands,
      kitty,                    // 底牌
      landlord: null,           // 地主玩家 ID
      currentTurn: 0,           // 当前轮到的玩家索引
      phase: 'bidding',         // bidding | playing
      bids: {},                 // playerId -> bid score (0=不叫, 1/2/3)
      bidTurn: 0,               // 当前叫分的玩家索引
      bidCount: 0,              // 已叫分的人数
      highestBid: 0,            // 最高叫分
      highestBidder: null,      // 最高叫分者
      lastPlay: null,           // 上一手牌 { playerId, cards, type }
      passCount: 0,             // 连续过牌次数
      playHistory: [],          // 出牌历史
    };
  }

  /**
   * 获取玩家可见的状态（隐藏其他玩家手牌）
   */
  getVisibleState(gameState, playerId) {
    const visible = { ...gameState };

    // 只显示当前玩家的手牌
    visible.myHand = gameState.playerHands[playerId] || [];

    // 显示其他玩家的牌数
    visible.playerCardCounts = {};
    for (const pid of gameState.players) {
      visible.playerCardCounts[pid] = gameState.playerHands[pid]?.length || 0;
    }

    // 删除其他玩家的手牌详情
    delete visible.playerHands;

    return visible;
  }

  /**
   * 处理玩家操作
   */
  onPlayerAction(roomId, playerId, action) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const state = room.data;
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

  /**
   * 处理叫分
   */
  handleBid(roomId, playerId, score) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    if (state.phase !== 'bidding') return;
    if (state.players[state.bidTurn] !== playerId) return;
    if (score < 0 || score > 3) return;
    if (score !== 0 && score <= state.highestBid) return;

    // 记录叫分
    state.bids[playerId] = score;
    state.bidCount++;

    if (score > 0) {
      state.highestBid = score;
      state.highestBidder = playerId;
    }

    // 广播叫分结果
    this.broadcast(roomId, {
      type: 'bid_update',
      playerId,
      score,
      highestBid: state.highestBid,
      bidTurn: state.bidTurn,
    });

    // 叫 3 分直接成为地主
    if (score === 3) {
      this.setLandlord(roomId, playerId);
      return;
    }

    // 所有人叫完
    if (state.bidCount >= 3) {
      if (state.highestBidder) {
        this.setLandlord(roomId, state.highestBidder);
      } else {
        // 没人叫，重新发牌
        this.restartGame(roomId);
      }
      return;
    }

    // 下一个人叫分
    state.bidTurn = (state.bidTurn + 1) % 3;
  }

  /**
   * 设置地主
   */
  setLandlord(roomId, playerId) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    state.landlord = playerId;
    state.phase = 'playing';

    // 地主拿底牌
    state.playerHands[playerId].push(...state.kitty);
    state.playerHands[playerId].sort((a, b) => a.value - b.value);

    // 地主先出牌
    state.currentTurn = state.players.indexOf(playerId);

    // 广播游戏开始（每人可见状态不同）
    for (const pid of state.players) {
      if (this.broadcast) {
        this.broadcast(roomId, {
          type: 'game_start',
          state: this.getVisibleState(state, pid),
        });
      }
    }
  }

  /**
   * 处理出牌
   */
  handlePlay(roomId, playerId, cards) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    if (state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== playerId) return;
    if (!cards || cards.length === 0) return;

    // 验证牌在手中
    const hand = state.playerHands[playerId];
    const cardIds = new Set(cards.map(c => c.id));
    const hasAll = cardIds.every(id => hand.some(c => c.id === id));
    if (!hasAll) return;

    // 验证牌型
    const cardType = getCardType(cards);
    if (!cardType) return;

    // 验证能否压过上一手
    if (state.lastPlay && state.lastPlay.playerId !== playerId) {
      if (!canBeat(state.lastPlay.type, cardType)) return;
    }

    // 从手牌中移除
    state.playerHands[playerId] = hand.filter(c => !cardIds.has(c.id));

    // 更新状态
    state.lastPlay = { playerId, cards, type: cardType };
    state.passCount = 0;
    state.playHistory.push({ playerId, cards, type: cardType });

    // 广播出牌
    this.broadcast(roomId, {
      type: 'play_update',
      playerId,
      cards,
      cardType,
      remainingCards: state.playerHands[playerId].length,
    });

    // 检查是否出完
    if (state.playerHands[playerId].length === 0) {
      this.handleGameOver(roomId, playerId);
      return;
    }

    // 下一个玩家
    state.currentTurn = (state.currentTurn + 1) % 3;
  }

  /**
   * 处理过牌
   */
  handlePass(roomId, playerId) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    if (state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== playerId) return;

    // 如果是自己出的牌，不能过
    if (state.lastPlay && state.lastPlay.playerId === playerId) return;

    state.passCount++;

    // 广播过牌
    this.broadcast(roomId, {
      type: 'pass_update',
      playerId,
    });

    // 两人都过，轮到最后出牌者重新出
    if (state.passCount >= 2) {
      state.lastPlay = null;
      state.passCount = 0;
    }

    // 下一个玩家
    state.currentTurn = (state.currentTurn + 1) % 3;
  }

  /**
   * 游戏结束
   */
  handleGameOver(roomId, winnerId) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    const isLandlord = winnerId === state.landlord;
    const winners = isLandlord
      ? [state.landlord]
      : state.players.filter(p => p !== state.landlord);

    const result = {
      winners,
      landlord: state.landlord,
      scores: {},
    };

    // 计算分数
    const baseScore = state.highestBid;
    for (const pid of state.players) {
      if (pid === state.landlord) {
        result.scores[pid] = isLandlord ? baseScore * 2 : -baseScore * 2;
      } else {
        result.scores[pid] = isLandlord ? -baseScore : baseScore;
      }
    }

    // 广播游戏结束
    this.broadcast(roomId, {
      type: 'game_over',
      winner: winnerId,
      winners,
      landlord: state.landlord,
      scores: result.scores,
      message: isLandlord ? '地主获胜！' : '农民获胜！',
    });

    // 回调给平台记录战绩
    if (this.onGameOver) {
      this.onGameOver(roomId, result);
    }
  }

  /**
   * 重新发牌（没人叫地主时）
   */
  restartGame(roomId) {
    const room = this.rooms.get(roomId);
    const state = room.data;

    const deck = shuffleDeck(createDeck());
    const { hands, kitty } = dealCards(deck);

    state.playerHands = {};
    state.players.forEach((playerId, i) => {
      state.playerHands[playerId] = hands[i];
    });
    state.kitty = kitty;
    state.landlord = null;
    state.phase = 'bidding';
    state.bids = {};
    state.bidTurn = 0;
    state.bidCount = 0;
    state.highestBid = 0;
    state.highestBidder = null;
    state.lastPlay = null;
    state.passCount = 0;
    state.playHistory = [];

    // 广播重新开始
    for (const pid of state.players) {
      if (this.broadcast) {
        this.broadcast(roomId, {
          type: 'game_restart',
          state: this.getVisibleState(state, pid),
        });
      }
    }
  }
}

module.exports = DoudizhuServer;
