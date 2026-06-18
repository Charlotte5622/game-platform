const { verifySocketToken } = require('../middleware/auth');
const { createGameInstance, getGameMaxPlayers, gameExists } = require('./gameLoader');
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

    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`🔌 玩家连接: ${socket.user.username} (${socket.id})`);

    socket.on('get_stats', (callback) => {
      callback(roomManager.getStats());
    });

    // ========== 快速匹配 ==========
    socket.on('quick_match', ({ gameId }, callback) => {
      if (!gameExists(gameId)) {
        return callback({ error: '游戏不存在' });
      }

      const maxPlayers = getGameMaxPlayers(gameId);
      const result = roomManager.quickMatch(gameId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      }, maxPlayers);

      socket.join(result.room.id);

      io.to(result.room.id).emit('room_update', {
        roomId: result.room.id,
        roomCode: result.room.roomCode,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({
        roomId: result.room.id,
        roomCode: result.room.roomCode,
        isNew: result.isNew,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
      });
    });

    // ========== 加入房间 ==========
    socket.on('join_room', ({ roomId }, callback) => {
      const existingRoom = roomManager.getRoom(roomId);
      if (!existingRoom) return callback({ error: '房间不存在' });

      const maxPlayers = getGameMaxPlayers(existingRoom.gameId);
      const result = roomManager.joinRoom(roomId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      }, maxPlayers);

      if (result.error) return callback({ error: result.error });

      socket.join(roomId);

      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: result.room.roomCode,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({ roomId, roomCode: result.room.roomCode, players: result.room.players });
    });

    // ========== 通过房间号加入 ==========
    socket.on('join_by_code', ({ code, gameId }, callback) => {
      // 校验房间号格式
      if (!code || !/^\d{3}$/.test(code)) {
        return callback({ error: '房间号必须是3位数字' });
      }

      const maxPlayers = getGameMaxPlayers(gameId);
      const result = roomManager.joinByCode(code, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      }, maxPlayers);

      if (result.error) return callback({ error: result.error });

      socket.join(result.roomId);

      io.to(result.roomId).emit('room_update', {
        roomId: result.roomId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({
        roomId: result.roomId,
        roomCode: code,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
      });
    });

    // ========== 准备 ==========
    socket.on('player_ready', ({ roomId, ready = true }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'waiting') return; // BUG-3: 只在等待状态允许准备

      const updatedRoom = roomManager.setPlayerReady(roomId, socket.id, ready);
      if (!updatedRoom) return;

      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: updatedRoom.roomCode,
        players: updatedRoom.players.map(p => ({
          id: p.id, nickname: p.nickname, ready: p.ready,
        })),
        state: updatedRoom.state,
      });

      if (roomManager.allPlayersReady(roomId)) {
        startGame(io, updatedRoom, prisma);
      }
    });

    // ========== 游戏操作 ==========
    socket.on('game_action', ({ roomId, action }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'playing') return;

      // BUG-1 修复：使用房间自己的游戏实例，而非全局单例
      if (!room.gameInstance) return;
      room.gameInstance.onPlayerAction(roomId, socket.user.id, action);
    });

    // ========== 断开连接 ==========
    socket.on('disconnect', () => {
      console.log(`🔌 玩家断开: ${socket.user.username} (${socket.id})`);

      const result = roomManager.leaveRoom(socket.id);
      if (result && !result.empty && result.room) {
        io.to(result.roomId).emit('room_update', {
          roomId: result.roomId,
          roomCode: result.room.roomCode,
          players: result.room.players.map(p => ({
            id: p.id, nickname: p.nickname, ready: p.ready,
          })),
          state: result.room.state,
        });

        if (result.room.state === 'playing') {
          // BUG-2 修复：统一 game_over 事件结构
          io.to(result.roomId).emit('game_over', {
            type: 'game_over',
            reason: 'player_disconnect',
            winner: null,
            winners: [],
            landlord: null,
            scores: {},
            message: '有玩家断开连接，游戏结束',
          });
          roomManager.setRoomState(result.roomId, 'finished');
        }
      }
    });
  });

  global.gameIO = io;
}

/**
 * 开始游戏
 */
function startGame(io, room, prisma) {
  // BUG-1 修复：为每个房间创建独立的游戏实例
  const gameInstance = createGameInstance(room.gameId);
  if (!gameInstance) {
    io.to(room.id).emit('error', { message: '游戏加载失败' });
    return;
  }

  // 将实例存到 room 上，game_action 时直接取用
  room.gameInstance = gameInstance;

  roomManager.setRoomState(room.id, 'playing');

  const playerIds = room.players.map(p => p.id);
  const gameState = gameInstance.initGameState(playerIds);
  roomManager.setGameState(room.id, gameState);

  // ========== 注入依赖 ==========

  gameInstance._getRoomData = (roomId) => roomManager.getGameData(roomId);
  gameInstance._setRoomData = (roomId, data) => roomManager.setGameData(roomId, data);

  gameInstance.broadcast = (roomId, message) => {
    io.to(roomId).emit(message.type, message);
  };

  gameInstance.sendToPlayer = (roomId, playerId, message) => {
    const curRoom = roomManager.getRoom(roomId);
    if (!curRoom) return;
    const target = curRoom.players.find(p => p.id === playerId);
    if (target) {
      io.to(target.socketId).emit(message.type, message);
    }
  };

  gameInstance.onGameOver = async (roomId, result) => {
    roomManager.setRoomState(roomId, 'finished');
    try {
      const curRoom = roomManager.getRoom(roomId);
      if (!curRoom) return;
      for (const player of curRoom.players) {
        const playerResult = result.winners?.includes(player.id) ? 'win' : 'lose';
        await prisma.gameRecord.create({
          data: {
            userId: player.id,
            gameId: curRoom.gameId,
            result: playerResult,
            score: result.scores?.[player.id] || 0,
          },
        });
      }
    } catch (err) {
      console.error('记录战绩失败:', err);
    }
  };

  console.log(`🎮 游戏开始: ${room.gameId} 房间 ${room.id}`);
}

module.exports = { setupSocketHandlers };
