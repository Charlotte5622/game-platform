const { createAllTiles, shuffleTiles, sortHand, getTileTypeKey, isSameTileType } = require('./tiles');
const { checkWin, canPung, canKong, canConcealedKong, canChow, canSelfWin, tileCounts } = require('./handValidator');

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

  getState(roomId) {
    return this._getRoomData ? this._getRoomData(roomId) : null;
  }

  saveState(roomId, state) {
    if (this._setRoomData) this._setRoomData(roomId, state);
  }

  doBroadcast(roomId, message) {
    if (this.broadcast) this.broadcast(roomId, message);
  }

  doBroadcastTo(roomId, playerId, message) {
    if (this.sendToPlayer) this.sendToPlayer(roomId, playerId, message);
  }

  initGameState(players) { return { players }; }
  getVisibleState(gameState, playerId) { return gameState; }
  onPlayerAction(roomId, playerId, action) {}

  /**
   * 依赖注入后调用，用于发送 game_start
   * 子类可覆盖（如斗地主由 setLandlord 触发，麻将直接发送）
   */
  postInit(roomId) {}
}

/**
 * 四人麻将游戏服务器
 *
 * 流程:
 * 1. 洗牌砌墙 (136张)
 * 2. 每人发13张，庄家14张
 * 3. 庄家先打牌
 * 4. 轮流: 摸牌 → 打牌
 * 5. 可选操作: 吃/碰/杠/和
 * 6. 荒牌(摸完无人和)
 */
class MahjongServer extends BaseGameServer {
  constructor() {
    super();
  }

  /**
   * 依赖注入后发送 game_start（麻将无叫分流程，直接开始）
   */
  postInit(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'game_start',
        state: this.getVisibleState(state, pid),
      });
    }

    // 庄家摸第14张牌
    const dealer = state.players[state.dealer];
    this.drawTile(roomId, dealer);
  }

  // ========== 初始化 ==========

  initGameState(players) {
    const allTiles = shuffleTiles(createAllTiles());

    // 发牌: 每人13张
    const hands = {};
    players.forEach((pid, i) => {
      hands[pid] = sortHand(allTiles.slice(i * 13, (i + 1) * 13));
    });

    // 墙牌 (剩余的牌)
    const wall = allTiles.slice(52); // 136 - 52 = 84 张

    return {
      players: [...players],
      hands,
      melds: {},           // pid -> [{ type, tiles }]  明牌/杠
      discards: {},         // pid -> [打出的牌]
      wall,                 // 墙牌
      dealer: 0,            // 庄家索引
      currentTurn: 0,       // 当前轮到谁
      phase: 'playing',     // playing | ended
      lastDiscard: null,     // 最后打出的牌 { pid, tile }
      lastDiscardBy: null,   // 最后打出牌的玩家
      waitingAction: null,   // 等待玩家响应动作 { pid, actions, discardedTile }
      kongCount: 0,          // 杠的数量（用于计算番数）
      roundWind: 'dong',     // 圈风
      turnWind: {},          // pid -> 门风
    };
  }

  getVisibleState(gameState, playerId) {
    const visible = { ...gameState };

    // 当前玩家手牌
    visible.myHand = sortHand(gameState.hands[playerId] || []);

    // 其他玩家手牌数量
    visible.handCounts = {};
    for (const pid of gameState.players) {
      visible.handCounts[pid] = (gameState.hands[pid] || []).length;
    }

    // 所有人的明牌
    visible.melds = gameState.melds;
    visible.discards = gameState.discards;

    // 隐藏手牌详情
    delete visible.hands;
    delete visible.wall; // 墙牌不暴露

    // 墙牌剩余数
    visible.wallCount = gameState.wall.length;

    return visible;
  }

  // ========== 玩家操作 ==========

  onPlayerAction(roomId, playerId, action) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;

    switch (action.type) {
      case 'discard':
        this.handleDiscard(roomId, playerId, action.tile);
        break;
      case 'chow':
        this.handleChow(roomId, playerId, action.tiles);
        break;
      case 'pung':
        this.handlePung(roomId, playerId);
        break;
      case 'kong':
        this.handleKong(roomId, playerId, action.concealed);
        break;
      case 'win':
        this.handleWin(roomId, playerId);
        break;
      case 'pass':
        this.handlePassAction(roomId, playerId);
        break;
    }
  }

  // ========== 摸牌 ==========

  drawTile(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state || state.wall.length === 0) {
      this.handleDrawnGame(roomId);
      return;
    }

    const tile = state.wall.shift();
    state.hands[playerId].push(tile);
    state.currentTurn = state.players.indexOf(playerId);

    // 通知该玩家摸到的牌
    this.doBroadcastTo(roomId, playerId, {
      type: 'draw',
      tile,
      hand: sortHand(state.hands[playerId]),
      wallCount: state.wall.length,
    });

    // 通知其他玩家有人摸牌（不暴露牌面）
    for (const pid of state.players) {
      if (pid !== playerId) {
        this.doBroadcastTo(roomId, pid, {
          type: 'player_draw',
          playerId,
          wallCount: state.wall.length,
        });
      }
    }

    // 合并检查：暗杠 + 自摸，发一条 action_hint
    const concealedKongs = canConcealedKong(state.hands[playerId]);
    const canWin = canSelfWin(state.hands[playerId]);

    if (concealedKongs.length > 0 || canWin) {
      const actions = ['discard'];
      if (concealedKongs.length > 0) actions.push('kong');
      if (canWin) actions.unshift('win'); // win 放最前

      this.doBroadcastTo(roomId, playerId, {
        type: 'action_hint',
        actions,
        kongOptions: concealedKongs.length > 0 ? concealedKongs : undefined,
        hint: canWin ? '可以自摸' : undefined,
      });
    }

    // 出牌超时：30秒内不出牌，随机打一张
    const turnPlayer = playerId;
    const turnSnapshot = state.currentTurn;
    setTimeout(() => {
      const currentState = this.getState(roomId);
      if (!currentState || currentState.phase !== 'playing') return;
      if (currentState.currentTurn !== turnSnapshot) return; // 已经不是该玩家的回合
      const hand = currentState.hands[turnPlayer];
      if (hand.length === 0) return;
      // 随机打一张
      const randomTile = hand[Math.floor(Math.random() * hand.length)];
      this.handleDiscard(roomId, turnPlayer, randomTile);
    }, 30000);

    this.saveState(roomId, state);
  }

  // ========== 打牌 ==========

  handleDiscard(roomId, playerId, tile) {
    const state = this.getState(roomId);
    if (!state) return;
    if (state.players[state.currentTurn] !== playerId) return;

    // 从手牌移除
    const hand = state.hands[playerId];
    const idx = hand.findIndex(t => t.id === tile.id);
    if (idx === -1) return;

    hand.splice(idx, 1);
    state.hands[playerId] = hand;

    // 记录弃牌
    if (!state.discards[playerId]) state.discards[playerId] = [];
    state.discards[playerId].push(tile);

    // 设置最后打出的牌
    state.lastDiscard = tile;
    state.lastDiscardBy = playerId;

    // 广播出牌
    this.doBroadcast(roomId, {
      type: 'discard',
      playerId,
      tile,
    });

    // 检查其他人能否 碰/杠/和
    this.checkResponseActions(roomId, playerId, tile);
  }

  // ========== 检查响应动作 ==========

  checkResponseActions(roomId, discardBy, tile) {
    const state = this.getState(roomId);
    if (!state) return;

    const responders = []; // { pid, actions }

    for (const pid of state.players) {
      if (pid === discardBy) continue;

      const hand = state.hands[pid];
      const actions = [];

      // 检查和
      const testHand = [...hand, tile];
      if (checkWin(testHand).isWin) {
        actions.push('win');
      }

      // 检查杠
      if (canKong(hand, tile)) {
        actions.push('kong');
      }

      // 检查碰
      if (canPung(hand, tile)) {
        actions.push('pung');
      }

      // 检查吃（只有下家能吃）
      const nextIdx = (state.players.indexOf(discardBy) + 1) % 4;
      if (pid === state.players[nextIdx] && canChow(hand, tile).length > 0) {
        actions.push('chow');
      }

      if (actions.length > 0) {
        responders.push({ pid, actions });
      }
    }

    if (responders.length > 0) {
      // 有玩家可以响应，等待操作
      state.waitingAction = {
        responders,
        discardedTile: tile,
        discardBy,
        responses: {},
        timeout: Date.now() + 30000, // 30秒超时
      };

      // 通知每个可响应的玩家
      for (const { pid, actions } of responders) {
        const msg = {
          type: 'action_required',
          actions: [...actions, 'pass'],
          discardedTile: tile,
          discardBy,
          timeout: state.waitingAction.timeout,
        };
        // 如果能吃，附带可选的吃法
        if (actions.includes('chow')) {
          msg.chowOptions = canChow(state.hands[pid], tile);
        }
        this.doBroadcastTo(roomId, pid, msg);
      }

      // 设置超时自动过
      const waitingRef = state.waitingAction;
      setTimeout(() => {
        const currentState = this.getState(roomId);
        if (currentState && currentState.waitingAction === waitingRef) {
          // 超时未响应的玩家自动过
          for (const { pid } of responders) {
            if (!waitingRef.responses[pid]) {
              waitingRef.responses[pid] = 'pass';
            }
          }
          // 全部超时，进入下一轮
          currentState.waitingAction = null;
          this.saveState(roomId, currentState);
          this.nextTurn(roomId);
        }
      }, 31000);

      this.saveState(roomId, state);
    } else {
      // 无人响应，下家摸牌
      this.nextTurn(roomId);
    }
  }

  // ========== 吃 ==========

  handleChow(roomId, playerId, tiles) {
    const state = this.getState(roomId);
    if (!state || !state.waitingAction) return;

    const { discardedTile, discardBy } = state.waitingAction;

    // 从手牌移除吃的两张
    for (const tile of tiles) {
      const idx = state.hands[playerId].findIndex(t => t.id === tile.id);
      if (idx === -1) return;
      state.hands[playerId].splice(idx, 1);
    }

    // 记录明牌
    if (!state.melds[playerId]) state.melds[playerId] = [];
    state.melds[playerId].push({
      type: 'chow',
      tiles: [discardedTile, ...tiles],
    });

    // 从弃牌中移除
    const discardIdx = state.discards[discardBy].findIndex(t => t.id === discardedTile.id);
    if (discardIdx !== -1) state.discards[discardBy].splice(discardIdx, 1);

    state.waitingAction = null;
    state.currentTurn = state.players.indexOf(playerId);

    // 广播吃
    this.doBroadcast(roomId, {
      type: 'chow',
      playerId,
      tiles: [discardedTile, ...tiles],
    });

    // 吃完需要打牌，提示该玩家出牌
    this.doBroadcastTo(roomId, playerId, {
      type: 'action_hint',
      actions: ['discard'],
    });

    this.saveState(roomId, state);
  }

  // ========== 碰 ==========

  handlePung(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state || !state.waitingAction) return;

    const { discardedTile, discardBy } = state.waitingAction;

    // 从手牌移除两张相同的
    const key = getTileTypeKey(discardedTile);
    const matching = state.hands[playerId].filter(t => getTileTypeKey(t) === key);
    if (matching.length < 2) return;

    // 移除前两张
    let removed = 0;
    state.hands[playerId] = state.hands[playerId].filter(t => {
      if (removed < 2 && getTileTypeKey(t) === key) {
        removed++;
        return false;
      }
      return true;
    });

    // 记录明牌
    if (!state.melds[playerId]) state.melds[playerId] = [];
    state.melds[playerId].push({
      type: 'pung',
      tiles: [discardedTile, matching[0], matching[1]],
    });

    // 从弃牌中移除
    const discardIdx = state.discards[discardBy].findIndex(t => t.id === discardedTile.id);
    if (discardIdx !== -1) state.discards[discardBy].splice(discardIdx, 1);

    state.waitingAction = null;
    state.currentTurn = state.players.indexOf(playerId);

    // 广播碰
    this.doBroadcast(roomId, {
      type: 'pung',
      playerId,
      tile: discardedTile,
    });

    // 碰完需要打牌，提示该玩家出牌
    this.doBroadcastTo(roomId, playerId, {
      type: 'action_hint',
      actions: ['discard'],
    });

    this.saveState(roomId, state);
  }

  // ========== 杠 ==========

  handleKong(roomId, playerId, concealed = false) {
    const state = this.getState(roomId);
    if (!state) return;

    if (concealed) {
      // 暗杠
      const kongTiles = canConcealedKong(state.hands[playerId]);
      if (kongTiles.length === 0) return;

      const key = kongTiles[0];
      const matching = state.hands[playerId].filter(t => getTileTypeKey(t) === key);
      if (matching.length < 4) return;

      // 移除4张
      state.hands[playerId] = state.hands[playerId].filter(t => getTileTypeKey(t) !== key);

      // 记录暗杠
      if (!state.melds[playerId]) state.melds[playerId] = [];
      state.melds[playerId].push({
        type: 'concealed_kong',
        tiles: matching,
      });

      state.kongCount++;

      // 广播暗杠
      this.doBroadcast(roomId, {
        type: 'kong',
        playerId,
        concealed: true,
      });

      // 暗杠后需要摸牌
      this.saveState(roomId, state);
      this.drawTile(roomId, playerId);
    } else {
      // 明杠（从弃牌杠）
      if (!state.waitingAction) return;

      const { discardedTile, discardBy } = state.waitingAction;

      const key = getTileTypeKey(discardedTile);
      const matching = state.hands[playerId].filter(t => getTileTypeKey(t) === key);
      if (matching.length < 3) return;

      // 移除3张
      let removed = 0;
      state.hands[playerId] = state.hands[playerId].filter(t => {
        if (removed < 3 && getTileTypeKey(t) === key) {
          removed++;
          return false;
        }
        return true;
      });

      // 记录明杠
      if (!state.melds[playerId]) state.melds[playerId] = [];
      state.melds[playerId].push({
        type: 'kong',
        tiles: [discardedTile, ...matching.slice(0, 3)],
      });

      // 从弃牌中移除
      const discardIdx = state.discards[discardBy].findIndex(t => t.id === discardedTile.id);
      if (discardIdx !== -1) state.discards[discardBy].splice(discardIdx, 1);

      state.waitingAction = null;
      state.kongCount++;
      state.currentTurn = state.players.indexOf(playerId);

      // 广播明杠
      this.doBroadcast(roomId, {
        type: 'kong',
        playerId,
        concealed: false,
      });

      // 杠后需要摸牌
      this.saveState(roomId, state);
      this.drawTile(roomId, playerId);
    }
  }

  // ========== 和牌 ==========

  handleWin(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state) return;

    const hand = state.hands[playerId];
    const winResult = checkWin(hand);

    if (!winResult.isWin) {
      this.doBroadcastTo(roomId, playerId, { type: 'error', message: '不是和牌' });
      return;
    }

    state.phase = 'ended';

    // 计算得分（简化版）
    const score = this.calculateScore(state, playerId, winResult);

    // 广播和牌
    this.doBroadcast(roomId, {
      type: 'win',
      playerId,
      hand,
      pattern: winResult.pattern,
      score,
      melds: state.melds[playerId] || [],
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, {
        winners: [playerId],
        scores: score,
      });
    }
  }

  // ========== 过（不响应）==========

  handlePassAction(roomId, playerId) {
    const state = this.getState(roomId);
    if (!state || !state.waitingAction) return;

    const { responders, responses } = state.waitingAction;

    // 记录该玩家选择过
    state.waitingAction.responses[playerId] = 'pass';

    // 检查是否所有人都过了
    const allPassed = responders.every(r => state.waitingAction.responses[r.pid] === 'pass');

    if (allPassed) {
      state.waitingAction = null;
      this.saveState(roomId, state);
      this.nextTurn(roomId);
    } else {
      this.saveState(roomId, state);
    }
  }

  // ========== 下一轮 ==========

  nextTurn(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    const currentIdx = state.currentTurn;
    const nextIdx = (currentIdx + 1) % 4;
    const nextPlayer = state.players[nextIdx];

    state.currentTurn = nextIdx;
    this.saveState(roomId, state);

    // 下家摸牌
    this.drawTile(roomId, nextPlayer);
  }

  // ========== 荒牌 ==========

  handleDrawnGame(roomId) {
    const state = this.getState(roomId);
    if (!state) return;

    state.phase = 'ended';

    this.doBroadcast(roomId, {
      type: 'drawn_game',
      message: '荒牌，本局平局',
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, {
        winners: [],
        scores: {},
      });
    }
  }

  // ========== 计分 ==========

  calculateScore(state, winnerId, winResult) {
    // 简化计分: 基础分 + 杠分
    const base = 10;
    const kongBonus = state.kongCount * 5;

    const scores = {};
    for (const pid of state.players) {
      scores[pid] = pid === winnerId ? (base + kongBonus) * 3 : -(base + kongBonus);
    }

    return scores;
  }
}

module.exports = MahjongServer;
