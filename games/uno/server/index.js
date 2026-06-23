/**
 * UNO game server.
 *
 * Main house rules used here:
 * - 7 cards per player.
 * - A card is playable when color matches, value matches, or it is a wild card.
 * - +2 can be stacked with +2 or wild+4. wild+4 can only be stacked with wild+4.
 * - skip skips the next active player.
 * - reverse flips direction; with two active players it behaves like skip.
 * - players must call UNO before playing down to one card, otherwise they draw 2.
 * - action cards may be played as the final card, and their effect still resolves
 *   unless the round has already ended.
 */

const COLORS = ['red', 'green', 'blue', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', '+2'];
const NUMBER_VALUES = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

const COLOR_MAP = {
  red: '#d63031',
  green: '#00b894',
  blue: '#0984e3',
  yellow: '#fdcb6e',
  black: '#2d3436',
};

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

class UnoServer extends BaseGameServer {
  constructor() {
    super();
  }

  initGameState(players) {
    const deck = this.createDeck();
    const hands = {};

    players.forEach(pid => {
      hands[pid] = deck.splice(0, 7);
    });

    // Start with a numbered color card. Starting with +2/skip/reverse creates
    // ambiguous first-turn effects and previously left the state inconsistent.
    const firstCardIndex = deck.findIndex(card => (
      card.color !== 'black' && NUMBER_VALUES.has(card.value)
    ));
    const topCard = firstCardIndex >= 0 ? deck.splice(firstCardIndex, 1)[0] : deck.pop();

    return {
      players: [...players],
      hands,
      deck,
      discard: topCard ? [topCard] : [],
      currentTurn: 0,
      direction: 1,
      currentColor: topCard?.color || COLORS[0],
      drawStack: 0,
      lastCardValue: null,
      phase: 'playing',
      winner: null,
      winners: [],
      finishedPlayers: {},
      calledUno: {},
    };
  }

  getVisibleState(gs, pid) {
    this.ensureStateDefaults(gs);
    const visible = { ...gs };
    visible.myHand = gs.hands?.[pid] || [];
    visible.handCounts = {};
    for (const p of gs.players || []) {
      visible.handCounts[p] = (gs.hands?.[p] || []).length;
    }
    delete visible.hands;
    delete visible.deck;
    visible.deckCount = gs.deck?.length || 0;
    visible.winners = gs.winners || [];
    visible.finishedPlayers = gs.finishedPlayers || {};
    visible.calledUno = gs.calledUno || {};
    return visible;
  }

  postInit(roomId) {
    const state = this.getState(roomId);
    if (!state) return;
    this.ensureStateDefaults(state);

    for (const pid of state.players) {
      this.doBroadcastTo(roomId, pid, {
        type: 'game_start',
        state: this.getVisibleState(state, pid),
      });
    }
  }

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

  onPlayerAction(roomId, pid, action) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    if (state.finishedPlayers?.[pid]) return;

    switch (action?.type) {
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

  handlePlayCard(roomId, pid, cardIndex, chosenColor) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    this.ensureStateDefaults(state);
    if (state.players[state.currentTurn] !== pid) return;

    const hand = state.hands?.[pid];
    const index = Number(cardIndex);
    if (!hand || !Number.isInteger(index) || index < 0 || index >= hand.length) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '无效的牌位' });
      return;
    }

    const card = hand[index];
    if (card.color === 'black' && !this.isValidColor(chosenColor)) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '请选择有效颜色' });
      return;
    }

    if (state.drawStack > 0 && !this.canCounterDraw(state, card)) {
      this.doBroadcastTo(roomId, pid, {
        type: 'error',
        message: `必须出反击牌，或摸 ${state.drawStack} 张牌`,
      });
      return;
    }

    const topCard = state.discard[state.discard.length - 1];
    if (!this.isPlayableCard(state, card, topCard)) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '不能打出这张牌' });
      return;
    }

    const activeCountBeforePlay = this.getActivePlayers(state).length;
    const calledUnoBeforePlay = !!state.calledUno?.[pid];
    hand.splice(index, 1);
    state.discard.push(card);
    state.currentColor = card.color === 'black' ? chosenColor : card.color;

    if (hand.length === 1) {
      if (calledUnoBeforePlay) {
        state.calledUno[pid] = true;
      } else {
        const penaltyCount = this.drawCards(state, pid, 2);
        state.calledUno[pid] = false;
        this.doBroadcast(roomId, {
          type: 'uno_penalty',
          playerId: pid,
          count: penaltyCount,
          message: `玩家未喊 UNO，罚摸 ${penaltyCount} 张`,
        });
      }
    } else {
      state.calledUno[pid] = false;
    }

    if (hand.length === 0) {
      this.markPlayerFinished(roomId, state, pid);
      if (this.tryEndGame(roomId, state)) return;
    }

    this.handleSpecialCard(roomId, state, card, activeCountBeforePlay);
    this.saveState(roomId, state);
    this.broadcastState(roomId, state);
  }

  handleSpecialCard(roomId, state, card, activeCountBeforePlay) {
    const drawAmount = this.getDrawAmount(card.value);

    if (drawAmount > 0) {
      state.drawStack += drawAmount;
      state.lastCardValue = card.value;
      this.advanceTurn(state);
      return;
    }

    state.drawStack = 0;
    state.lastCardValue = null;

    if (card.value === 'skip') {
      this.advanceTurn(state);
      this.advanceTurn(state);
      return;
    }

    if (card.value === 'reverse') {
      state.direction *= -1;
      if (activeCountBeforePlay === 2) {
        this.advanceTurn(state);
        this.advanceTurn(state);
      } else {
        this.advanceTurn(state);
      }
      return;
    }

    this.advanceTurn(state);
  }

  handleDrawCard(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    this.ensureStateDefaults(state);
    if (state.players[state.currentTurn] !== pid) return;

    const drawCount = state.drawStack > 0 ? state.drawStack : 1;
    const actualCount = this.drawCards(state, pid, drawCount);
    state.calledUno[pid] = false;
    state.drawStack = 0;
    state.lastCardValue = null;
    this.advanceTurn(state);
    this.saveState(roomId, state);

    this.doBroadcastTo(roomId, pid, {
      type: 'drew_card',
      count: actualCount,
      hand: state.hands[pid],
    });

    this.broadcastState(roomId, state);
  }

  handleUno(roomId, pid) {
    const state = this.getState(roomId);
    if (!state || state.phase !== 'playing') return;
    this.ensureStateDefaults(state);
    if (state.players[state.currentTurn] !== pid) return;

    const hand = state.hands?.[pid] || [];
    if (hand.length === 0 || hand.length > 2) {
      this.doBroadcastTo(roomId, pid, { type: 'error', message: '现在还不能喊 UNO' });
      return;
    }

    if (state.calledUno[pid]) return;
    state.calledUno[pid] = true;
    this.saveState(roomId, state);

    this.doBroadcast(roomId, {
      type: 'uno_called',
      playerId: pid,
    });
  }

  isValidColor(color) {
    return COLORS.includes(color);
  }

  ensureStateDefaults(state) {
    state.players ||= [];
    state.hands ||= {};
    state.deck ||= [];
    state.discard ||= [];
    state.winners ||= [];
    state.finishedPlayers ||= {};
    state.calledUno ||= {};
    state.drawStack ||= 0;
    state.lastCardValue ||= null;
    if (!state.currentColor) state.currentColor = COLORS[0];
  }

  isPlayableCard(state, card, topCard) {
    return (
      card.color === 'black' ||
      card.color === state.currentColor ||
      (topCard && card.value === topCard.value)
    );
  }

  canCounterDraw(state, card) {
    return (
      (state.lastCardValue === '+2' && card.value === '+2') ||
      (state.lastCardValue === '+2' && card.value === 'wild+4') ||
      (state.lastCardValue === 'wild+4' && card.value === 'wild+4')
    );
  }

  getDrawAmount(value) {
    if (value === '+2') return 2;
    if (value === 'wild+4') return 4;
    return 0;
  }

  drawCards(state, pid, count) {
    let drawn = 0;
    if (!state.hands[pid]) state.hands[pid] = [];

    for (let i = 0; i < count; i++) {
      if (state.deck.length === 0) this.reshuffleDeck(state);
      if (state.deck.length === 0) break;
      state.hands[pid].push(state.deck.pop());
      drawn++;
    }
    return drawn;
  }

  getActivePlayers(state) {
    return state.players.filter(pid => !state.finishedPlayers?.[pid]);
  }

  markPlayerFinished(roomId, state, pid) {
    if (state.finishedPlayers[pid]) return;

    const placement = state.winners.length + 1;
    state.winners.push({ pid, placement });
    state.finishedPlayers[pid] = true;
    state.calledUno[pid] = false;
    state.winner = pid;

    this.doBroadcast(roomId, {
      type: 'player_finished',
      pid,
      placement,
      message: `玩家获得第 ${placement} 名！`,
    });
  }

  tryEndGame(roomId, state) {
    const remaining = this.getActivePlayers(state);
    if (remaining.length > 1) return false;

    if (remaining.length === 1 && !state.finishedPlayers[remaining[0]]) {
      state.winners.push({ pid: remaining[0], placement: state.winners.length + 1 });
      state.finishedPlayers[remaining[0]] = true;
      state.calledUno[remaining[0]] = false;
    }

    state.phase = 'ended';
    this.saveState(roomId, state);
    this.broadcastState(roomId, state);

    const winners = state.winners.map(w => w.pid);
    const scores = {};
    state.winners.forEach((w, index) => {
      scores[w.pid] = state.players.length - index;
    });

    this.doBroadcast(roomId, {
      type: 'game_over',
      winner: state.winners[0]?.pid || null,
      winners,
      standings: state.winners,
      scores,
      message: '游戏结束！',
    });

    if (this.onGameOver) {
      this.onGameOver(roomId, { winners, scores });
    }

    return true;
  }

  advanceTurn(state) {
    const n = state.players.length;
    if (n === 0) return;

    for (let i = 0; i < n; i++) {
      state.currentTurn = (state.currentTurn + state.direction + n) % n;
      if (!state.finishedPlayers[state.players[state.currentTurn]]) {
        return;
      }
    }
  }

  reshuffleDeck(state) {
    if (state.discard.length <= 1) return;
    const top = state.discard.pop();
    state.deck = [...state.discard];
    state.discard = [top];
    this.shuffle(state.deck);
  }

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
