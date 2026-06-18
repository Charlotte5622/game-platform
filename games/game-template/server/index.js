/**
 * 游戏服务器入口
 *
 * 这是游戏的服务端逻辑，处理：
 * - 玩家连接/断开
 * - 游戏状态同步
 * - 游戏规则验证
 */

class GameServer {
  constructor() {
    this.rooms = new Map(); // roomId -> gameState
  }

  /**
   * 玩家加入房间
   */
  onPlayerJoin(roomId, playerId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        players: [],
        state: 'waiting', // waiting | playing | finished
        data: {}
      });
    }

    const room = this.rooms.get(roomId);
    room.players.push(playerId);

    console.log(`Player ${playerId} joined room ${roomId}`);

    // 检查是否可以开始游戏
    if (room.players.length >= 2 && room.state === 'waiting') {
      this.startGame(roomId);
    }
  }

  /**
   * 开始游戏
   */
  startGame(roomId) {
    const room = this.rooms.get(roomId);
    room.state = 'playing';
    room.data = this.initGameState(room.players);

    console.log(`Game started in room ${roomId}`);

    // 通知所有玩家游戏开始
    this.broadcast(roomId, {
      type: 'game_start',
      state: room.data
    });
  }

  /**
   * 初始化游戏状态（子类实现）
   */
  initGameState(players) {
    // TODO: 在这里初始化你的游戏数据
    return { players, turn: 0 };
  }

  /**
   * 处理玩家操作（子类实现）
   */
  onPlayerAction(roomId, playerId, action) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'playing') return;

    // TODO: 验证并处理玩家操作
    // const isValid = this.validateAction(room.data, playerId, action);
    // if (isValid) {
    //   room.data = this.applyAction(room.data, action);
    //   this.broadcast(roomId, { type: 'state_update', state: room.data });
    // }
  }

  /**
   * 广播消息给房间所有玩家
   */
  broadcast(roomId, message) {
    // TODO: 通过 WebSocket 发送给房间所有玩家
    console.log(`Broadcast to ${roomId}:`, message);
  }
}

module.exports = GameServer;
