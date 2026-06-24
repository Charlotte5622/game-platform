/**
 * 游戏服务器基类
 * 
 * 所有游戏共享的基础设施：状态管理、广播、房间数据访问
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

module.exports = { BaseGameServer, RPS_CHOICES, judgeRPS };
