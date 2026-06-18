const { verifySocketToken } = require('../middleware/auth');
const { getGameInstance, gameExists } = require('./gameLoader');
const roomManager = require('./roomManager');

/**
 * 设置 WebSocket 事件处理
 */
function setupSocketHandlers(io, prisma) {
  // 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('未提供认证 Token'));
    }

    const user = verifySocketToken(token);
    if (!user) {
      return next(new Error('Token 无效或已过期'));
    }

    socket.user = user; // { id, username }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`🔌 玩家连接: ${socket.user.username} (${socket.id})`);

    // ========== 大厅事件 ==========

    // 获取在线统计
    socket.on('get_stats', (callback) => {
      callback(roomManager.getStats());
    });

    // ========== 房间事件 ==========

    // 快速匹配
    socket.on('quick_match', ({ gameId }, callback) => {
      if (!gameExists(gameId)) {
        return callback({ error: '游戏不存在' });
      }

      const result = roomManager.quickMatch(gameId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      });

      // 加入 Socket.IO 房间
      socket.join(result.room.id);

      // 通知房间内所有人
      io.to(result.room.id).emit('room_update', {
        roomId: result.room.id,
        players: result.room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({
        roomId: result.room.id,
        isNew: result.isNew,
        players: result.room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          ready: p.ready,
        })),
      });
    });

    // 加入指定房间
    socket.on('join_room', ({ roomId }, callback) => {
      const result = roomManager.joinRoom(roomId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      });

      if (result.error) {
        return callback({ error: result.error });
      }

      socket.join(roomId);

      io.to(roomId).emit('room_update', {
        roomId,
        players: result.room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({ roomId, players: result.room.players });
    });

    // 玩家准备
    socket.on('player_ready', ({ roomId, ready = true }) => {
      const room = roomManager.setPlayerReady(roomId, socket.id, ready);
      if (!room) return;

      io.to(roomId).emit('room_update', {
        roomId,
        players: room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          ready: p.ready,
        })),
        state: room.state,
      });

      // 检查是否所有人都准备好了
      if (roomManager.allPlayersReady(roomId)) {
        startGame(io, room, prisma);
      }
    });

    // ========== 游戏事件 ==========

    // 玩家操作
    socket.on('game_action', ({ roomId, action }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'playing') return;

      const gameInstance = getGameInstance(room.gameId);
      if (!gameInstance) return;

      // 调用游戏逻辑处理操作
      gameInstance.onPlayerAction(roomId, socket.user.id, action);
    });

    // ========== 断开连接 ==========

    socket.on('disconnect', () => {
      console.log(`🔌 玩家断开: ${socket.user.username} (${socket.id})`);

      const result = roomManager.leaveRoom(socket.id);
      if (result && !result.empty && result.room) {
        // 通知房间内其他人
        io.to(result.roomId).emit('room_update', {
          roomId: result.roomId,
          players: result.room.players.map(p => ({
            id: p.id,
            nickname: p.nickname,
            ready: p.ready,
          })),
          state: result.room.state,
        });

        // 如果游戏进行中，通知游戏结束
        if (result.room.state === 'playing') {
          io.to(result.roomId).emit('game_over', {
            reason: 'player_disconnect',
            message: '有玩家断开连接，游戏结束',
          });
          roomManager.setRoomState(result.roomId, 'finished');
        }
      }
    });
  });

  // 保存 io 实例供游戏使用
  global.gameIO = io;
}

/**
 * 开始游戏
 */
function startGame(io, room, prisma) {
  const gameInstance = getGameInstance(room.gameId);
  if (!gameInstance) {
    io.to(room.id).emit('error', { message: '游戏加载失败' });
    return;
  }

  roomManager.setRoomState(room.id, 'playing');

  // 初始化游戏状态
  const playerIds = room.players.map(p => p.id);
  const gameState = gameInstance.initGameState(playerIds);

  // 设置广播回调
  gameInstance.broadcast = (roomId, message) => {
    io.to(roomId).emit(message.type, message);
  };

  // 设置游戏结束回调
  gameInstance.onGameOver = async (roomId, result) => {
    roomManager.setRoomState(roomId, 'finished');

    // 记录战绩
    try {
      for (const player of room.players) {
        const playerResult = result.winners?.includes(player.id) ? 'win' : 'lose';
        await prisma.gameRecord.create({
          data: {
            userId: player.id,
            gameId: room.gameId,
            result: playerResult,
            score: result.scores?.[player.id] || 0,
            duration: result.duration || null,
          },
        });
      }
    } catch (err) {
      console.error('记录战绩失败:', err);
    }
  };

  // 通知每个玩家（发送各自可见的状态）
  for (const player of room.players) {
    const visibleState = gameInstance.getVisibleState
      ? gameInstance.getVisibleState(gameState, player.id)
      : gameState;

    io.to(player.socketId).emit('game_start', {
      roomId: room.id,
      state: visibleState,
    });
  }

  // 存储游戏状态
  roomManager.setGameState(room.id, gameState);

  console.log(`🎮 游戏开始: ${room.gameId} 房间 ${room.id}`);
}

module.exports = { setupSocketHandlers };
