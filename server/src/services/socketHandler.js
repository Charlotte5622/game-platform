const { verifySocketToken } = require('../middleware/auth');
const { createGameInstance, getGameMaxPlayers, getGameMinPlayers, gameExists, isVariablePlayers, gameAllowsBots } = require('./gameLoader');
const roomManager = require('./roomManager');
const botManager = require('./botManager');

// 在线用户跟踪：socketId -> { userId, username }
const connectedSockets = new Map();

// 断线宽限期：userId -> { roomId, timeout, socketId }
const pendingDisconnects = new Map();
const DISCONNECT_GRACE_MS = 30000; // 30秒宽限期

/**
 * 广播最新统计给所有客户端（防抖：100ms 内只发一次）
 */
let statsTimer = null;
function broadcastStatsDebounced(io) {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    const stats = roomManager.getStats();
    const uniqueUsers = new Set([...connectedSockets.values()].map(u => u.userId));
    stats.onlinePlayers = uniqueUsers.size;
    io.emit('stats_update', stats);
  }, 100);
}

/**
 * 设置 WebSocket 事件处理
 */
function setupSocketHandlers(io, prisma) {
  // 认证中间件（同时从数据库刷新头像）
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('未提供认证 Token'));
    }

    const user = verifySocketToken(token);
    if (!user) {
      return next(new Error('Token 无效或已过期'));
    }

    socket.user = user;

    // 从数据库获取最新头像（JWT中的avatar可能是旧值）
    try {
      if (prisma && user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { avatar: true },
        });
        if (dbUser) {
          socket.user.avatar = dbUser.avatar || null;
        }
      }
    } catch (err) {
      console.warn('[Socket] 刷新用户头像失败:', err.message);
    }

    next();
  });

  /**
   * 离开当前房间（切换游戏时自动清理旧房间）
   * 核心原则：一个用户同一时刻只能在一个房间，切换游戏必须先离开旧房间
   */
  function leaveCurrentRoom(socket) {
    const userId = socket.user.id;
    const socketId = socket.id;
    const roomId = roomManager.getPlayerRoom(socketId) || roomManager.getUserRoom(userId)?.roomId;
    if (!roomId) return null;
    const room = roomManager.getRoom(roomId);
    if (!room) { roomManager.cleanupUser(userId); return null; }

    console.log(`🔄 用户 ${socket.user.username} 切换游戏，离开旧房间 ${room.roomCode} (${room.gameId})`);

    botManager.stopRoomBots(roomId);
    const result = roomManager.leaveRoom(socketId);
    roomManager.cleanupUser(userId);
    socket.leave(roomId);

    if (result && !result.empty && result.room) {
      const remainingHumans = result.room.players.filter(p => !p.isBot);
      if (remainingHumans.length === 0) {
        roomManager.destroyRoom(roomId);
      } else if (result.room.state === 'playing') {
        io.to(roomId).emit('game_over', { type: 'game_over', reason: 'player_leave', message: '有玩家离开房间，游戏结束' });
        roomManager.destroyRoom(roomId);
      } else {
        io.to(roomId).emit('room_update', {
          roomId, roomCode: result.room.roomCode, hostId: result.room.hostId,
          players: result.room.players.map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready })),
          state: result.room.state,
        });
      }
    }
    broadcastStatsDebounced(io);
    return roomId;
  }

  io.on('connection', (socket) => {
    console.log(`🔌 玩家连接: ${socket.user.username} (${socket.id})`);

    // 跟踪在线连接
    connectedSockets.set(socket.id, { userId: socket.user.id, username: socket.user.username });

    socket.on('get_stats', (callback) => {
      const stats = roomManager.getStats();
      // 统计去重后的在线用户数（同一用户多 tab 只算 1 人）
      const uniqueUsers = new Set([...connectedSockets.values()].map(u => u.userId));
      stats.onlinePlayers = uniqueUsers.size;
      callback(stats);
    });

    // ========== 快速匹配 ==========
    socket.on('quick_match', ({ gameId }, callback) => {
      if (!gameExists(gameId)) {
        return callback({ error: '游戏不存在' });
      }

      // 检查是否有断线宽限期（重连场景）
      const pending = pendingDisconnects.get(socket.user.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDisconnects.delete(socket.user.id);
        console.log(`✅ 玩家 ${socket.user.username} 宽限期内重连`);

        // 更新玩家的 socketId
        roomManager.updatePlayerSocket(socket.user.id, socket.id);
        socket.join(pending.roomId);

        const room = roomManager.getRoom(pending.roomId);
        if (room) {
          // 如果游戏已在进行中，直接标记为 playing 避免 UI 闪跳
          if (room.state === 'playing') {
            callback({
              roomId: room.id,
              roomCode: room.roomCode,
              isNew: false,
              hostId: room.hostId,
              state: 'playing',
              players: room.players.map(p => ({
                id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
              })),
            });
            // 同步当前游戏状态
            if (room.gameInstance) {
              const state = room.gameInstance.getState(room.id);
              if (state) {
                socket.emit('game_start', {
                  roomId: room.id,
                  state: room.gameInstance.getVisibleState(state, socket.user.id),
                });
              }
            }
          } else {
            callback({
              roomId: room.id,
              roomCode: room.roomCode,
              isNew: false,
              hostId: room.hostId,
              players: room.players.map(p => ({
                id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
              })),
            });
          }
          // 通知对手已重连
          socket.to(pending.roomId).emit('opponent_reconnected');
        }
        return;
      }

      // 检查用户是否已在房间中
      const existing = roomManager.getUserRoom(socket.user.id);
      if (existing && existing.room) {
        // 同一游戏 + 房间有效 → 重连/重新加入
        if (existing.room.gameId === gameId && existing.room.state !== 'finished') {
          socket.join(existing.roomId);
          roomManager.updatePlayerSocket(socket.user.id, socket.id);
          // 清除断线记录（玩家已重连）
          const pending = pendingDisconnects.get(socket.user.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingDisconnects.delete(socket.user.id);
            console.log(`✅ 玩家 ${socket.user.username} 重连成功，清除断线记录`);
            // 通知其他玩家已重连
            socket.to(existing.roomId).emit('opponent_reconnected');
          }
          callback({
            roomId: existing.roomId,
            roomCode: existing.room.roomCode,
            isNew: false,
            hostId: existing.room.hostId,
            players: existing.room.players.map(p => ({
              id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
            })),
          });
          if (existing.room.state === 'playing') {
            const gameInstance = existing.room.gameInstance;
            if (gameInstance && gameInstance.getVisibleState) {
              const state = gameInstance.getState(existing.roomId);
              if (state) {
                socket.emit('game_start', {
                  roomId: existing.roomId,
                  state: gameInstance.getVisibleState(state, socket.user.id),
                });
              }
            }
          }
          return;
        }
        // 不同游戏 或 房间已结束 → 先离开旧房间
        console.log(`🔄 quick_match: 用户 ${socket.user.username} 从 ${existing.room.gameId} 切换到 ${gameId}`);
        leaveCurrentRoom(socket);
      }

      const maxPlayers = getGameMaxPlayers(gameId);
      const result = roomManager.quickMatch(gameId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      avatar: socket.user.avatar,
      }, maxPlayers);

      if (result.error) return callback({ error: result.error });

      socket.join(result.room.id);

      io.to(result.room.id).emit('room_update', {
        roomId: result.room.id,
        roomCode: result.room.roomCode,
        hostId: result.room.hostId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({
        roomId: result.room.id,
        roomCode: result.room.roomCode,
        isNew: result.isNew,
        hostId: result.room.hostId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
      });

      broadcastStatsDebounced(io);
    });

    // ========== 加入房间 ==========
    socket.on('join_room', ({ roomId }, callback) => {
      const existingRoom = roomManager.getRoom(roomId);
      if (!existingRoom) return callback({ error: '房间不存在' });

      const maxPlayers = getGameMaxPlayers(existingRoom.gameId);
      const result = roomManager.joinRoom(roomId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      avatar: socket.user.avatar,
      }, maxPlayers);

      if (result.error) return callback({ error: result.error });

      socket.join(roomId);

      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: result.room.roomCode,
        hostId: result.room.hostId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({ roomId, roomCode: result.room.roomCode, hostId: result.room.hostId, players: result.room.players });

      broadcastStatsDebounced(io);
    });

    // ========== 通过房间号加入 ==========
    socket.on('join_by_code', ({ code, gameId }, callback) => {
      // 校验房间号格式（3-6位数字或字母）
      if (!code || !/^\d{1,6}$/.test(code)) {
        return callback({ error: '房间号格式无效（1-6位数字）' });
      }

      // 离开其他游戏的房间
      const existingForJoin = roomManager.getUserRoom(socket.user.id);
      if (existingForJoin && existingForJoin.room && existingForJoin.room.gameId !== gameId) {
        leaveCurrentRoom(socket);
      }

      const maxPlayers = getGameMaxPlayers(gameId);
      const result = roomManager.joinByCode(code, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      avatar: socket.user.avatar,
      }, maxPlayers, gameId);

      if (result.error) return callback({ error: result.error });

      socket.join(result.roomId);

      io.to(result.roomId).emit('room_update', {
        roomId: result.roomId,
        roomCode: result.room.roomCode,
        hostId: result.room.hostId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
        state: result.room.state,
      });

      callback({
        roomId: result.roomId,
        roomCode: result.room.roomCode,
        hostId: result.room.hostId,
        players: result.room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
      });

      broadcastStatsDebounced(io);
    });
    // ========== 准备/取消准备 ==========
    socket.on('player_ready', ({ roomId, ready = true }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'waiting') return;

      const updatedRoom = roomManager.setPlayerReady(roomId, socket.id, ready);
      if (!updatedRoom) return;

      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: updatedRoom.roomCode,
        hostId: updatedRoom.hostId,
        players: updatedRoom.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
        state: updatedRoom.state,
      });

      // 所有游戏都不自动开始，等房主手动开始
      // （之前固定人数游戏会自动开始，现在统一由房主控制）

      broadcastStatsDebounced(io);
    });

    // ========== 添加机器人（仅固定人数游戏允许） ==========
    socket.on('add_bots', ({ roomId }, callback) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'waiting') {
        return callback?.({ error: '房间不在等待状态' });
      }

      // 检查是否为房主
      if (room.hostId !== socket.user.id) {
        return callback?.({ error: '只有房主可以添加机器人' });
      }

      // 检查游戏是否允许添加机器人
      if (!gameAllowsBots(room.gameId)) {
        return callback?.({ error: '该游戏不支持添加机器人' });
      }

      const maxPlayers = getGameMaxPlayers(room.gameId);
      const currentCount = room.players.length;

      // 已满：返回成功但 botsAdded=0，不报错
      if (currentCount >= maxPlayers) {
        return callback?.({ ok: true, botsAdded: 0 });
      }

      // 每次只添加一个机器人
      const bot = botManager.addOneBot(room, room.gameId);

      // 广播房间更新
      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          ready: p.ready,
          isBot: p.isBot || false,
        })),
        state: room.state,
      });

      callback?.({ ok: true, botsAdded: bot ? 1 : 0 });

      // 所有游戏都不自动开始，等房主手动开始
    });

    // ========== 创建房间 ==========
    socket.on('create_room', ({ gameId, roomCode }, callback) => {
      if (!gameExists(gameId)) {
        return callback?.({ error: '游戏不存在' });
      }

      // 检查用户是否已在房间中
      const existing = roomManager.getUserRoom(socket.user.id);
      if (existing && existing.room) {
        // 同一游戏 + 房间有效 → 重连
        if (existing.room.gameId === gameId && existing.room.state !== 'finished') {
          socket.join(existing.roomId);
          roomManager.updatePlayerSocket(socket.user.id, socket.id);
          return callback?.({
            roomId: existing.roomId,
            roomCode: existing.room.roomCode,
            hostId: existing.room.hostId,
            players: existing.room.players.map(p => ({
              id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
            })),
          });
        }
        // 不同游戏 → 先离开旧房间
        leaveCurrentRoom(socket);
      }

      // 创建新房间（支持自定义房间号）
      const result = roomManager.createRoom(gameId, socket.id, {
        id: socket.user.id,
        nickname: socket.user.username,
      avatar: socket.user.avatar,
      }, roomCode || undefined);

      if (result.error) {
        return callback?.({ error: result.error });
      }

      const room = result.room;
      socket.join(room.id);

      callback?.({
        roomId: room.id,
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
        })),
      });

      broadcastStatsDebounced(io);
    });

    // ========== 返回房间（游戏结束后重新加入） ==========
    socket.on('return_to_room', ({ roomId }, callback) => {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        return callback?.({ error: '房间已不存在' });
      }

      // 检查玩家是否原本在房间中
      const wasInRoom = room.players.some(p => p.id === socket.user.id);
      if (!wasInRoom) {
        return callback?.({ error: '你不在这个房间中' });
      }

      // 移除机器人（如果有）并停止定时器
      if (room.players.some(p => p.isBot)) {
        botManager.stopRoomBots(roomId);
      }
      room.players = room.players.filter(p => !p.isBot);
      
      // 重置房间状态
      room.state = 'waiting';
      room.gameInstance = null;
      room.players.forEach(p => { p.ready = false; });

      // 重新加入 Socket.IO 房间
      socket.join(room.id);
      roomManager.updatePlayerSocket(socket.user.id, socket.id);

      // 广播房间更新
      io.to(room.id).emit('room_update', {
        roomId: room.id,
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
        })),
        state: 'waiting',
      });

      callback?.({
        roomId: room.id,
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
        })),
      });
    });

    // ========== 房主开始游戏（自由人数游戏） ==========
    socket.on('host_start_game', ({ roomId }, callback) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'waiting') {
        return callback?.({ error: '房间不在等待状态' });
      }

      // 只有房主才能开始
      if (room.hostId !== socket.user.id) {
        return callback?.({ error: '只有房主才能开始游戏' });
      }

      // 检查最少人数
      const minPlayers = getGameMinPlayers(room.gameId);
      if (room.players.length < minPlayers) {
        return callback?.({ error: `至少需要 ${minPlayers} 人才能开始` });
      }

      // 检查所有人是否都已准备
      if (!room.players.every(p => p.ready)) {
        return callback?.({ error: '还有玩家未准备' });
      }

      callback?.({ ok: true });
      startGame(io, room, prisma);
    });

    // ========== 房主踢人 ==========
    socket.on('kick_player', ({ roomId, targetId }, callback) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'waiting') {
        return callback?.({ error: '房间不在等待状态' });
      }

      // 只有房主才能踢人
      if (room.hostId !== socket.user.id) {
        return callback?.({ error: '只有房主才能踢人' });
      }

      // 不能踢自己
      if (targetId === socket.user.id) {
        return callback?.({ error: '不能踢自己' });
      }

      // 不能踢机器人（用 add_bots/remove 控制）
      const targetPlayer = room.players.find(p => p.id === targetId);
      if (!targetPlayer) {
        return callback?.({ error: '玩家不存在' });
      }

      if (targetPlayer.isBot) {
        // 踢机器人：直接移除
        room.players = room.players.filter(p => p.id !== targetId);
        io.to(roomId).emit('room_update', {
          roomId,
          roomCode: room.roomCode,
          hostId: room.hostId,
          players: room.players.map(p => ({
            id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
          })),
          state: room.state,
        });
        return callback?.({ ok: true });
      }

      // 踢人类玩家：通知被踢者，然后移除
      const targetSocketId = targetPlayer.socketId;
      io.to(targetSocketId).emit('kicked', { message: '你被房主踢出了房间' });

      // 让被踢者的 socket 离开 Socket.IO 房间
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) targetSocket.leave(roomId);

      // 移除玩家
      room.players = room.players.filter(p => p.id !== targetId);
      roomManager.cleanupPlayer(targetSocketId, targetId);

      io.to(roomId).emit('room_update', {
        roomId,
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(p => ({
          id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
        })),
        state: room.state,
      });

      callback?.({ ok: true });
      broadcastStatsDebounced(io);
    });

    // ========== 游戏操作 ==========
    socket.on('game_action', ({ roomId, action }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'playing') return;
      if (!room.players.some(p => p.id === socket.user.id)) return; // 验证玩家在房间中

      // BUG-1 修复：使用房间自己的游戏实例，而非全局单例
      if (!room.gameInstance) return;
      room.gameInstance.onPlayerAction(roomId, socket.user.id, action);
    });

    // ========== 主动离开房间 ==========
    socket.on('leave_room', (callback) => {
      console.log(`🚪 玩家主动离开: ${socket.user.username} (${socket.id})`);

      // 清理断线宽限期
      const pending = pendingDisconnects.get(socket.user.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDisconnects.delete(socket.user.id);
      }

      const result = roomManager.leaveRoom(socket.id);
      roomManager.cleanupUser(socket.user.id);
      if (result && result.roomId) socket.leave(result.roomId);
      if (result && !result.empty && result.room) {
        if (result.room.state === 'playing') {
          // 游戏中离开：先发 game_over，再销毁房间
          botManager.stopRoomBots(result.roomId);
          io.to(result.roomId).emit('game_over', {
            type: 'game_over',
            reason: 'player_leave',
            winner: null,
            winners: [],
            landlord: null,
            scores: {},
            message: '有玩家离开房间，游戏结束',
          });
          // 检查剩余是否全是机器人，是则彻底销毁
          const remainingHumans = result.room.players.filter(p => !p.isBot);
          if (remainingHumans.length === 0) {
            roomManager.destroyRoom(result.roomId);
          }
        } else {
          // 等待中离开：检查剩余是否全是机器人
          const remainingHumans = result.room.players.filter(p => !p.isBot);
          if (remainingHumans.length === 0) {
            console.log(`🤖 房间 ${result.roomId} 剩余全是机器人，彻底销毁`);
            botManager.stopRoomBots(result.roomId);
            roomManager.destroyRoom(result.roomId);
            broadcastStatsDebounced(io);
            if (typeof callback === 'function') callback();
            return;
          }

          io.to(result.roomId).emit('room_update', {
            roomId: result.roomId,
            roomCode: result.room.roomCode,
            hostId: result.room.hostId,
            players: result.room.players.map(p => ({
              id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
            })),
            state: result.room.state,
          });
        }
      }

      broadcastStatsDebounced(io);
      if (typeof callback === 'function') callback();
    });

    // ========== 同步游戏状态（后台切换回来时调用） ==========
    socket.on('sync_state', ({ roomId }) => {
      if (!roomId) return;
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      // 检查用户是否在这个房间
      const isMember = room.players.some(p => p.id === socket.user.id);
      if (!isMember) return;
      // 同步游戏状态
      if (room.state === 'playing' && room.gameInstance) {
        const state = room.gameInstance.getState(roomId);
        if (state) {
          socket.emit('state_update', {
            roomId,
            state: room.gameInstance.getVisibleState(state, socket.user.id),
          });
        }
      } else {
        // 等待中：同步房间状态
        socket.emit('room_update', {
          roomId: room.id,
          roomCode: room.roomCode,
          hostId: room.hostId,
          players: room.players.map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false })),
          state: room.state,
        });
      }
    });

    // ========== 断开连接（宽限期模式） ==========
    socket.on('disconnect', () => {
      console.log(`🔌 玩家断开: ${socket.user.username} (${socket.id})`);
      connectedSockets.delete(socket.id);

      // 查找该玩家所在的房间
      const roomId = roomManager.getPlayerRoom(socket.id) || roomManager.getUserRoom(socket.user.id)?.roomId;
      if (!roomId) {
        // 不在任何房间，直接清理
        roomManager.cleanupUser(socket.user.id);
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        roomManager.cleanupUser(socket.user.id);
        return;
      }

      // 游戏进行中
      if (room.state === 'playing') {
        const remainingHumans = room.players.filter(p => p.id !== socket.user.id && !p.isBot);

        // 如果剩余玩家全是机器人，给予宽限期等待重连（手机切后台场景）
        if (remainingHumans.length === 0) {
          console.log(`⏳ 玩家 ${socket.user.username} 断线，剩余全是机器人，等待重连（2分钟宽限期）`);

          const existing = pendingDisconnects.get(socket.user.id);
          if (existing) clearTimeout(existing.timeout);

          // 5分钟宽限期：手机切后台后有足够时间回来
          const timeout = setTimeout(() => {
            pendingDisconnects.delete(socket.user.id);
            const currentRoom = roomManager.getRoom(roomId);
            if (!currentRoom) return;
            // 检查用户是否已重连
            const reconnected = currentRoom.players.find(p => p.id === socket.user.id);
            if (reconnected && reconnected.socketId && reconnected.socketId !== socket.id) {
              console.log(`✅ 玩家 ${socket.user.username} 已重连，保留房间`);
              return;
            }
            console.log(`🤖 玩家 ${socket.user.username} 超时未重连，销毁房间`);
            botManager.stopRoomBots(roomId);
            io.to(roomId).emit('game_over', {
              type: 'game_over',
              reason: 'player_disconnect',
              winner: null,
              message: '玩家长时间未返回，游戏结束',
            });
            roomManager.destroyRoom(roomId);
            roomManager.cleanupUser(socket.user.id);
            broadcastStatsDebounced(io);
          }, 2 * 60 * 1000); // 2分钟

          pendingDisconnects.set(socket.user.id, { roomId, timeout, socketId: socket.id });
          return;
        }

        // 有其他玩家在：30秒宽限期
        const existing = pendingDisconnects.get(socket.user.id);
        if (existing) clearTimeout(existing.timeout);

        console.log(`⏳ 玩家 ${socket.user.username} 断线，等待重连`);

        // 通知所有其他玩家该玩家断线
        const others = room.players.filter(p => p.id !== socket.user.id && !p.isBot);
        for (const other of others) {
          io.to(other.socketId).emit('opponent_disconnected', {
            message: '对方已断线，正在等待重连...',
            disconnectedPlayer: socket.user.username,
          });
        }

        // 宽限期：超时后检查是否需要销毁房间
        const timeout = setTimeout(() => {
          pendingDisconnects.delete(socket.user.id);
          const currentRoom = roomManager.getRoom(roomId);
          if (!currentRoom) return;

          const remainingHumans = currentRoom.players.filter(p => p.id !== socket.user.id && !p.isBot);
          if (remainingHumans.length === 0) {
            console.log(`🤖 玩家 ${socket.user.username} 宽限期过期，剩余全是机器人，销毁房间`);
            botManager.stopRoomBots(roomId);
            io.to(roomId).emit('game_over', {
              type: 'game_over', reason: 'player_disconnect',
              message: '所有玩家已离开，游戏结束',
            });
            roomManager.destroyRoom(roomId);
            roomManager.cleanupUser(socket.user.id);
            broadcastStatsDebounced(io);
          } else {
            console.log(`⏳ 玩家 ${socket.user.username} 宽限期过期，房间仍有 ${remainingHumans.length} 位人类玩家`);
          }
        }, DISCONNECT_GRACE_MS);

        pendingDisconnects.set(socket.user.id, { roomId, timeout, socketId: socket.id });
      } else {
        // 等待中：直接移除（不影响游戏）
        const result = roomManager.leaveRoom(socket.id);
        roomManager.cleanupUser(socket.user.id);
        if (result && !result.empty && result.room) {
          // 如果剩余玩家全是机器人，彻底销毁房间
          const remainingHumans = result.room.players.filter(p => !p.isBot);
          if (remainingHumans.length === 0) {
            console.log(`🤖 房间 ${roomId} 剩余全是机器人，彻底销毁`);
            botManager.stopRoomBots(roomId);
            roomManager.destroyRoom(roomId);
            broadcastStatsDebounced(io);
            return;
          }

          io.to(roomId).emit('room_update', {
            roomId,
            roomCode: result.room.roomCode,
            hostId: result.room.hostId,
            players: result.room.players.map(p => ({
              id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready,
            })),
            state: result.room.state,
          });
        }
        broadcastStatsDebounced(io);
      }
    });
  });

  global.gameIO = io;
}

/**
 * 开始游戏
 */
async function startGame(io, room, prisma) {
  // BUG-1 修复：为每个房间创建独立的游戏实例
  const gameInstance = createGameInstance(room.gameId);
  if (!gameInstance) {
    io.to(room.id).emit('error', { message: '游戏加载失败' });
    return;
  }

  // 将实例存到 room 上，game_action 时直接取用
  room.gameInstance = gameInstance;

  roomManager.setRoomState(room.id, 'playing');
  room.startTime = Date.now(); // 记录游戏开始时间

  // 游戏开始前：从数据库刷新所有人类玩家的头像/昵称，确保客户端拿到最新数据
  const humanIds = room.players.filter(p => !p.isBot).map(p => p.id);
  if (humanIds.length > 0 && prisma) {
    try {
      const dbUsers = await prisma.user.findMany({
        where: { id: { in: humanIds } },
        select: { id: true, nickname: true, avatar: true },
      });
      const dbMap = {};
      dbUsers.forEach(u => { dbMap[u.id] = u; });
      for (const p of room.players) {
        if (dbMap[p.id]) {
          p.nickname = dbMap[p.id].nickname || p.nickname;
          p.avatar = dbMap[p.id].avatar || null;
        }
      }
    } catch (err) {
      console.warn('[startGame] 刷新玩家头像失败:', err.message);
    }
  }

  io.to(room.id).emit('room_update', {
    roomId: room.id,
    roomCode: room.roomCode,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id: p.id, nickname: p.nickname, avatar: p.avatar, ready: p.ready, isBot: p.isBot || false,
    })),
    state: 'playing',
  });

  const playerIds = room.players.map(p => p.id);
  const gameState = gameInstance.initGameState(playerIds);
  // 注入玩家信息（昵称、头像），供游戏内广播使用
  gameState.playerInfo = {};
  for (const p of room.players) {
    gameState.playerInfo[p.id] = { nickname: p.nickname || '玩家', avatar: p.avatar || null };
  }
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

      // 计算游戏时长（秒）
      const duration = curRoom.startTime ? Math.round((Date.now() - curRoom.startTime) / 1000) : null;

      for (const player of curRoom.players) {
        // 跳过机器人（ID是字符串如 "bot_1_xxx"，Prisma要求Int）
        if (String(player.id).startsWith('bot_')) continue;

        let playerResult = 'draw';
        if (result.winners && result.winners.length > 0) {
          playerResult = result.winners.includes(player.id) ? 'win' : 'lose';
        }

        await prisma.gameRecord.create({
          data: {
            userId: player.id,
            gameId: curRoom.gameId,
            result: playerResult,
            score: result.scores?.[player.id] || 0,
            duration,
          },
        });
      }
      console.log(`📊 战绩已记录: ${curRoom.gameId}, 时长=${duration}s`);
    } catch (err) {
      console.error('记录战绩失败:', err);
    }

    // 停止机器人
    botManager.stopRoomBots(roomId);
  };

  // 通知游戏实例依赖已注入完毕（如麻将直接发送 game_start，斗地主在 setLandlord 中发送）
  if (gameInstance.postInit) {
    gameInstance.postInit(room.id);
  }

  // 启动机器人决策循环
  const botIds = room.players.filter(p => p.isBot).map(p => p.id);
  if (botIds.length > 0) {
    botManager.startBotDecisionLoop(
      room.id,
      room.gameId,
      botIds,
      (roomId) => roomManager.getGameData(roomId),
      (roomId, botId, action) => {
        const curRoom = roomManager.getRoom(roomId);
        if (curRoom?.gameInstance) {
          console.log(`[Bot→Game] ${botId} → ${action.type} in ${roomId}`);
          curRoom.gameInstance.onPlayerAction(roomId, botId, action);
        } else {
          console.warn(`[Bot→Game] ${botId} 房间或游戏实例不存在: ${roomId}`);
        }
      }
    );
    console.log(`🤖 ${botIds.length} 个机器人已激活`);
  }

  console.log(`🎮 游戏开始: ${room.gameId} 房间 ${room.id}`);
}

module.exports = { setupSocketHandlers };
