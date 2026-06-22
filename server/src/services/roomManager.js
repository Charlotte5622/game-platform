/**
 * 房间管理器
 *
 * 管理游戏房间的创建、加入、状态查询
 * 房间数据存储在内存中（可扩展到 Redis）
 */

// roomId -> { gameId, roomCode, players: [{id, socketId, ready}], state, gameState, createdAt }
const rooms = new Map();

// socketId -> roomId（快速查找玩家所在房间）
const playerRooms = new Map();

// userId -> roomId（同一用户只能在一个房间）
const userRooms = new Map();

// roomCode -> roomId（通过3位房间号快速查找房间）
const codeToRoom = new Map();

let roomCounter = 0;

/**
 * 生成唯一的随机房间号
 */
function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100 + Math.random() * 900));
  } while (codeToRoom.has(code));
  return code;
}

/**
 * 校验房间号格式（3-6位数字或字母）
 */
function isValidRoomCode(code) {
  return typeof code === 'string' && /^\d{1,6}$/.test(code);
}

/**
 * 检查房间号是否已被占用
 */
function isRoomCodeTaken(code) {
  return codeToRoom.has(code);
}

/**
 * 创建新房间
 * @param {string} [customCode] - 自定义房间号（可选，不传则自动生成）
 */
function createRoom(gameId, creatorSocketId, creatorInfo, customCode) {
  const roomId = `room_${++roomCounter}_${Date.now()}`;

  let roomCode;
  if (customCode) {
    if (!isValidRoomCode(customCode)) {
      return { error: '房间号格式无效（3-6位数字或字母）' };
    }
    if (codeToRoom.has(customCode)) {
      return { error: '房间号已被占用' };
    }
    roomCode = customCode;
  } else {
    roomCode = generateRoomCode();
  }

  const room = {
    id: roomId,
    roomCode,
    gameId,
    hostId: creatorInfo.id,  // 房主 = 创建者
    players: [{
      id: creatorInfo.id,
      socketId: creatorSocketId,
      nickname: creatorInfo.nickname,
      avatar: creatorInfo.avatar || null,
      ready: false,
    }],
    state: 'waiting', // waiting | playing | finished
    gameState: null,
    createdAt: new Date(),
  };

  rooms.set(roomId, room);
  codeToRoom.set(roomCode, roomId);
  playerRooms.set(creatorSocketId, roomId);
  userRooms.set(creatorInfo.id, roomId);

  return { room };
}

/**
 * 加入房间
 * @param {number} [maxPlayers] - 房间最大人数（由游戏配置决定）
 */
function joinRoom(roomId, socketId, userInfo, maxPlayers) {
  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.state !== 'waiting') return { error: '游戏已经开始' };

  // 检查是否已在房间中
  if (room.players.some(p => p.id === userInfo.id)) {
    return { error: '你已经在这个房间中' };
  }

  // 检查是否已在其他房间（需验证用户确实在房间中，防止 leaveRoom 后残留误判）
  const existingRoomId = userRooms.get(userInfo.id);
  if (existingRoomId && existingRoomId !== roomId) {
    const existingRoom = rooms.get(existingRoomId);
    if (existingRoom && existingRoom.players.some(p => p.id === userInfo.id)) {
      return { error: '你已经在其他房间中，请先退出当前房间' };
    }
    // 旧房间已不存在或用户已不在其中，清理残留映射
    userRooms.delete(userInfo.id);
  }

  // 检查人数上限
  if (maxPlayers && room.players.length >= maxPlayers) {
    return { error: '房间已满' };
  }

  room.players.push({
    id: userInfo.id,
    socketId,
    nickname: userInfo.nickname,
    avatar: userInfo.avatar || null,
    ready: false,
  });

  playerRooms.set(socketId, roomId);
  userRooms.set(userInfo.id, roomId);

  return { room };
}

/**
 * 快速匹配：加入已有等待中的房间，或创建新房间
 * 跳过有机器人的房间（避免进入"死"房间）
 * @param {number} [maxPlayers] - 房间最大人数
 */
function quickMatch(gameId, socketId, userInfo, maxPlayers) {
  // 查找等待中的房间（显式检查人数，跳过有机器人的房间）
  for (const [roomId, room] of rooms) {
    if (room.gameId === gameId && room.state === 'waiting' && room.players.length < maxPlayers) {
      // 跳过有机器人的房间
      const hasBots = room.players.some(p => p.isBot);
      if (hasBots) continue;

      const result = joinRoom(roomId, socketId, userInfo, maxPlayers);
      if (!result.error) {
        return { room: result.room, isNew: false };
      }
    }
  }

  // 没有可用房间，创建新房间
  const result = createRoom(gameId, socketId, userInfo);
  if (result.error) return { error: result.error };
  return { room: result.room, isNew: true };
}

/**
 * 玩家准备
 */
function setPlayerReady(roomId, socketId, ready = true) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const player = room.players.find(p => p.socketId === socketId);
  if (player) {
    player.ready = ready;
  }

  return room;
}

/**
 * 检查房间内所有玩家是否都已准备
 * @param {number} [requiredCount] - 需要的玩家人数（默认 2）
 */
function allPlayersReady(roomId, requiredCount) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const needed = requiredCount || 2;
  return room.players.length >= needed && room.players.every(p => p.ready);
}

/**
 * 设置房间状态
 */
function setRoomState(roomId, state) {
  const room = rooms.get(roomId);
  if (room) room.state = state;
  return room;
}

/**
 * 设置游戏状态
 */
function setGameState(roomId, gameState) {
  const room = rooms.get(roomId);
  if (room) room.gameState = gameState;
  return room;
}

/**
 * 获取房间信息
 */
function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

/**
 * 获取玩家所在房间ID（通过 socketId）
 */
function getPlayerRoom(socketId) {
  return playerRooms.get(socketId) || null;
}

/**
 * 获取用户所在房间（通过 userId）
 */
function getUserRoom(userId) {
  const roomId = userRooms.get(userId);
  return roomId ? { roomId, room: rooms.get(roomId) } : null;
}

/**
 * 玩家离开房间
 */
function leaveRoom(socketId) {
  const roomId = playerRooms.get(socketId);
  if (!roomId) return null;

  const room = rooms.get(roomId);
  if (!room) {
    playerRooms.delete(socketId);
    return null;
  }

  // 找到离开的玩家（不清理 userRooms，由 disconnect 统一清理）
  const leavingPlayer = room.players.find(p => p.socketId === socketId);

  // 移除玩家
  room.players = room.players.filter(p => p.socketId !== socketId);
  playerRooms.delete(socketId);

  // 如果房间空了，删除房间
  if (room.players.length === 0) {
    codeToRoom.delete(room.roomCode);
    rooms.delete(roomId);
    return { room: null, roomId, empty: true };
  }

  // 如果离开的是房主，优先转移给非机器人玩家
  if (leavingPlayer && room.hostId === leavingPlayer.id) {
    const humanPlayer = room.players.find(p => !p.isBot);
    room.hostId = humanPlayer ? humanPlayer.id : room.players[0].id;
  }

  return { room, roomId, empty: false };
}

/**
 * 获取房间的游戏数据
 */
function getGameData(roomId) {
  const room = rooms.get(roomId);
  return room ? room.gameState : null;
}

/**
 * 设置房间的游戏数据
 */
function setGameData(roomId, data) {
  const room = rooms.get(roomId);
  if (room) room.gameState = data;
}

/**
 * 通过3位房间号加入房间
 * @param {string} code - 3位房间号
 * @param {string} socketId - 玩家 socket ID
 * @param {object} userInfo - { id, nickname }
 * @param {number} [maxPlayers] - 房间最大人数
 * @param {string} [gameId] - 游戏 ID（校验房间属于该游戏）
 */
function joinByCode(code, socketId, userInfo, maxPlayers, gameId) {
  const roomId = codeToRoom.get(code);
  if (!roomId) return { error: '房间号不存在' };

  const room = rooms.get(roomId);
  if (!room) return { error: '房间不存在' };

  // 校验房间属于当前游戏
  if (gameId && room.gameId !== gameId) {
    return { error: '该房间号不属于当前游戏' };
  }

  const result = joinRoom(roomId, socketId, userInfo, maxPlayers);
  if (result.error) return result;

  return { room: result.room, roomId };
}

/**
 * 清理用户的 userId 映射（仅在 disconnect 时调用）
 */
function cleanupUser(userId) {
  userRooms.delete(userId);
}

/**
 * 清理玩家的所有映射（踢人时调用）
 */
function cleanupPlayer(socketId, userId) {
  if (socketId) playerRooms.delete(socketId);
  if (userId) userRooms.delete(userId);
}

/**
 * 彻底销毁房间（人类全部离开后清理残留机器人房间）
 * 从所有 Map 中移除，返回被销毁的房间信息
 */
function destroyRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  // 清理所有玩家的映射
  for (const player of room.players) {
    if (player.socketId) playerRooms.delete(player.socketId);
    if (player.id) userRooms.delete(player.id);
  }

  // 清理房间号映射
  codeToRoom.delete(room.roomCode);

  // 删除房间
  rooms.delete(roomId);

  console.log(`🗑️ 房间已销毁: ${room.roomCode} (${roomId})`);
  return room;
}

/**
 * 更新玩家的 socketId（重连场景）
 */
function updatePlayerSocket(userId, newSocketId) {
  const roomId = userRooms.get(userId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  const player = room.players.find(p => p.id === userId);
  if (player) {
    // 清除旧的 socketId 映射
    playerRooms.delete(player.socketId);
    // 更新为新的 socketId
    player.socketId = newSocketId;
    playerRooms.set(newSocketId, roomId);
  }
}

/**
 * 获取在线统计
 */
function getStats() {
  return {
    totalRooms: rooms.size,
    waitingRooms: Array.from(rooms.values()).filter(r => r.state === 'waiting').length,
    playingRooms: Array.from(rooms.values()).filter(r => r.state === 'playing').length,
    onlinePlayers: playerRooms.size,
  };
}

/**
 * 清理只有机器人的孤儿房间
 * 返回被销毁的房间 ID 列表
 */
function cleanupOrphanRooms(botManager) {
  const destroyed = [];
  for (const [roomId, room] of rooms) {
    if (room.state !== 'playing' && room.state !== 'waiting') continue;
    const humans = room.players.filter(p => !p.isBot);
    if (humans.length === 0 && room.players.length > 0) {
      console.log(`🧹 清理孤儿房间: ${room.roomCode} (${roomId}), ${room.players.length} 个机器人`);
      if (botManager) botManager.stopRoomBots(roomId);
      destroyRoom(roomId);
      destroyed.push(roomId);
    }
  }
  return destroyed;
}

module.exports = {
  createRoom,
  joinRoom,
  joinByCode,
  quickMatch,
  setPlayerReady,
  allPlayersReady,
  setRoomState,
  setGameState,
  getGameData,
  setGameData,
  getRoom,
  getPlayerRoom,
  getUserRoom,
  leaveRoom,
  destroyRoom,
  cleanupUser,
  cleanupPlayer,
  updatePlayerSocket,
  isValidRoomCode,
  isRoomCodeTaken,
  getStats,
  cleanupOrphanRooms,
};
