/**
 * 游戏客户端
 *
 * 处理：
 * - 连接游戏服务器
 * - 显示游戏画面
 * - 发送玩家操作
 * - 接收状态更新
 */

class GameClient {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.playerId = null;
    this.gameState = null;

    this.initUI();
  }

  /**
   * 初始化 UI 事件
   */
  initUI() {
    const actionBtn = document.getElementById('action-btn');
    actionBtn.addEventListener('click', () => this.onAction());
  }

  /**
   * 连接到游戏服务器
   */
  connect(serverUrl, roomId, playerId) {
    this.roomId = roomId;
    this.playerId = playerId;

    // TODO: 建立 WebSocket 连接
    // this.ws = new WebSocket(serverUrl);
    //
    // this.ws.onopen = () => {
    //   console.log('Connected to game server');
    //   this.ws.send(JSON.stringify({
    //     type: 'join',
    //     roomId: this.roomId,
    //     playerId: this.playerId
    //   }));
    // };
    //
    // this.ws.onmessage = (event) => {
    //   const msg = JSON.parse(event.data);
    //   this.handleMessage(msg);
    // };

    console.log('Connecting to', serverUrl);
    this.updateStatus('正在连接...');
  }

  /**
   * 处理服务器消息
   */
  handleMessage(msg) {
    switch (msg.type) {
      case 'game_start':
        this.onGameStart(msg.state);
        break;
      case 'state_update':
        this.onStateUpdate(msg.state);
        break;
      case 'game_over':
        this.onGameOver(msg.winner);
        break;
    }
  }

  /**
   * 游戏开始
   */
  onGameStart(state) {
    this.gameState = state;
    this.updateStatus('游戏开始！');
    document.getElementById('action-btn').disabled = false;
  }

  /**
   * 状态更新
   */
  onStateUpdate(state) {
    this.gameState = state;
    this.render();
  }

  /**
   * 游戏结束
   */
  onGameOver(winner) {
    const isWinner = winner === this.playerId;
    this.updateStatus(isWinner ? '🎉 你赢了！' : '😢 你输了');
    document.getElementById('action-btn').disabled = true;
  }

  /**
   * 玩家操作
   */
  onAction() {
    // TODO: 收集玩家操作并发送
    const action = { /* 你的操作数据 */ };

    // this.ws.send(JSON.stringify({
    //   type: 'action',
    //   roomId: this.roomId,
    //   playerId: this.playerId,
    //   action: action
    // }));

    console.log('Player action:', action);
  }

  /**
   * 渲染游戏画面（子类实现）
   */
  render() {
    // TODO: 根据 this.gameState 更新游戏画面
    console.log('Rendering state:', this.gameState);
  }

  /**
   * 更新状态文字
   */
  updateStatus(text) {
    document.getElementById('status').textContent = text;
  }
}

// 启动游戏
const game = new GameClient();
// game.connect('ws://localhost:8080', 'room-1', 'player-1');
