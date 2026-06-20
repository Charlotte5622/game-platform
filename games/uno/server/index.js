/**
 * UNO 游戏服务器（本地化版本）
 *
 * 规则：
 * - 每人发 7 张牌
 * - 出牌规则：颜色相同 或 值相同 或 黑牌(wild)
 * - +2：下家摸 2 张，可叠加 +2/+4 反击
 * - +4(wild+4)：下家摸 4 张，可叠加 +4 反击
 * - skip：跳过下家
 * - reverse：反转方向（2 人局 = 跳过对方）
 * - wild：任意出，出牌者选色
 * - 出完手牌即获胜
 */

const COLORS = ['red', 'green', 'blue', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', '+2'];

// 花色颜色映射（前端用）
const COLOR_MAP = {
  red: '#d63031',
  green: '#00b894',
  blue: '#0984e3',
  yellow: '#fdcb6e',
  black: '#2d3436',
};

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
 * UNO 游戏服务器
 */
class UnoServer extends BaseGameServer {
  constructor() { super(); }

  // ========== 初始化 ==========

  initGameState(players) {
    const deck = this.createDeck();

    // 每人发 7 张
    const hands = {};
    players.forEach(pid => {
      hands[pid] = deck.splice(0, 7);
    });

    // 翻开第一张（不能是黑牌）
    let topCard = deck.pop();
    while (topCard.color === 'black') {
      deck.unshift(topCard);
      this.shuffle(deck);
      topCard = deck.pop();
    }

    return {
      players: [...players],
      hands,
      deck,
      discard: [topCard],
      currentTurn: 0,
      direction: 1,         // 1=顺时针, -1=逆时针
      currentColor: topCard.color,
      drawStack: 0,         // +2/+4 累计摸牌数
      lastCardValue: null,  // 上一张牌的值
      phase: 'playing',     // playing | ended
      winner: null,
      calledUno: {},        // pid -> boolean (是否喊了 UNO)
    };
  }

  getVisibleState(gs, pid) {
    // 隐藏其他玩家手牌
    const visible = { ...gs };
    visible.myHand = gs.hands[pid] || [];
    visible.handCounts = {};
    for (const p of gs.players) {
      visible.handCounts[p] = (gs.hands[p] || []).length;
    }
    delete visible.hands;
    delete visible.deck; // 不暴露牌堆
    visible.deckCount = gs.deck.length;
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

  // ========== 牌组 ==========

  createDeck() {
    const deck = [];
    for (const color of COLORS) {
      for (const value of VALUES) {
        deck.push({ color, value, id: `${color}_${value}_1` });
        if (value !== '0') {
          deck.push({ color, value, id: `${color}_${value}_2` });
        }
      }
    }
    // 黑牌：wild 和 wild+4 各 4 张
    for (let i = 0; i < 4; i++) {
      deck.push({ color: 'black', value: 'wild', id: `wild_${i}` });
      deck.push({ color: 'black', value: 'wild+4', id: `wild4_${i}` });
    }
    this.shuffle(deck);
    return deck;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ========== 玩家操作 ==========

  onPlayerAction(roomId, pid, action) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    switch (action.type) {
      case 'play_card':
        this.handlePlayCard(roomId, pid, action.cardIndex, action.chosenColor);
        break;
      case 'draw_card':
        this.handleDrawCard(roomId, pid);
        break;
      case 'uno':
        this.handleUno(roomId, pid);
        break;
    }
  }

  // ========== 出牌 ==========

  handlePlayCard(roomId, pid, cardIndex, chosenColor) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== pid) return;

    const hand = state.hands[pid];
    if (cardIndex < 0 || cardIndex >= hand.length) return;

    const card = hand[cardIndex];

    // 叠加验证：有 drawStack 时只能出反击牌
    if (state.drawStack > 0) {
      const canCounter =
        (state.lastCardValue === '+2' && card.value === '+2') ||
        (state.lastCardValue === '+2' && card.value === 'wild+4') ||
        (state.lastCardValue === 'wild+4' && card.value === 'wild+4');
      if (!canCounter) {
        this.doBroadcastTo(roomId, pid, {
          type: 'error',
          message: `必须出 +2 或 +4 反击，或摸 ${state.drawStack} 张牌`,
        });
        return;
      }
    }

    // 普通验证
    const topCard = state.discard[state.discard.length - 1];
    const isValid =
      card.color === 'black' ||
      card.color === state.currentColor ||
      card.value === topCard.value;

    if (!isValid) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不能打出这张牌' });
      return;
    }

    // 打出
    hand.splice(cardIndex, 1);
    state.discard.push(card);

    // 设置颜色
    if (card.color === 'black') {
      state.currentColor = chosenColor || COLORS[0];
    } else {
      state.currentColor = card.color;
    }

    // 检查胜负
    if (hand.length === 0) {
      state.phase = 'playing'; // 保持 playing 直到广播完
      this.saveState(roomId, state);

      this.doBroadcast(roomId, {
        type: 'game_over',
        winner: pid,
        message: '出完所有牌，获胜！',
      });

      if (this.onGameOver) {
        const loser = state.players.find(p => p !== pid);
        this.onGameOver(roomId, {
          winners: [pid],
          scores: { [pid]: 10, [loser]: -10 },
        });
      }
      state.phase = 'ended';
      this.saveState(roomId, state);
      return;
    }

    // 处理特殊牌
    this.handleSpecialCard(roomId, state, card);

    this.saveState(roomId, state);
    this.broadcastState(roomId, state);
  }

  /**
   * 处理特殊牌效果
   */
  handleSpecialCard(roomId, state, card) {
    const n = state.players.length;
    const drawAmount = this.getDrawAmount(card.value);

    if (drawAmount > 0) {
      // +2 或 +4：叠加摸牌数
      state.drawStack += drawAmount;
      state.lastCardValue = card.value;
      this.advanceTurn(state);

    } else if (card.value === 'skip') {
      state.drawStack = 0;
      state.lastCardValue = null;
      this.advanceTurn(state); // 跳过一次
      this.advanceTurn(state); // 再跳一次

    } else if (card.value === 'reverse') {
      state.drawStack = 0;
      state.lastCardValue = null;
      state.direction *= -1;
      if (n === 2) {
        // 2 人局反转 = 跳过对方
        this.advanceTurn(state);
        this.advanceTurn(state);
      } else {
        this.advanceTurn(state);
      }

    } else {
      // 普通牌
      state.drawStack = 0;
      state.lastCardValue = null;
      this.advanceTurn(state);
    }
  }

  getDrawAmount(value) {
    if (value === '+2') return 2;
    if (value === 'wild+4') return 4;
    return 0;
  }

  advanceTurn(state) {
    state.currentTurn = (state.currentTurn + state.direction + state.players.length) % state.players.length;
  }

  // ========== 摸牌 ==========

  handleDrawCard(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    if (state.players[state.currentTurn] !== pid) return;

    const drawCount = state.drawStack > 0 ? state.drawStack : 1;

    // 确保牌堆够用
    for (let d = 0; d < drawCount; d++) {
      if (state.deck.length === 0) {
        this.reshuffleDeck(state);
      }
      if (state.deck.length > 0) {
        state.hands[pid].push(state.deck.pop());
      }
    }

    // 清除叠加
    state.drawStack = 0;
    state.lastCardValue = null;

    // 摸牌后轮到下家
    this.advanceTurn(state);

    this.saveState(roomId, state);

    // 通知摸牌者
    this.doBroadcastTo(roomId, pid, {
      type: 'drew_card',
      count: drawCount,
      hand: state.hands[pid],
    });

    // 广播状态
    this.broadcastState(roomId, state);
  }

  /**
   * 牌堆用完时，回收弃牌堆重新洗牌
   */
  reshuffleDeck(state) {
    if (state.discard.length <= 1) return;
    const top = state.discard.pop();
    state.deck = [...state.discard];
    state.discard = [top];
    this.shuffle(state.deck);
  }

  // ========== UNO ==========

  handleUno(roomId, pid) {
    const state = this.getState(roomId);
    if (!state) return;

    state.calledUno[pid] = true;
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'uno_called',
      playerId: pid,
    });
  }

  // ========== 辅助 ==========

  broadcastState(roomId, state) {
    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'state_update',
        state: this.getVisibleState(state, pid),
      });
    }
  }
}

module.exports = UnoServer;
