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

// roomCode -> roomId（通过3位房间号快速查找房间）
const codeToRoom = new Map();

let roomCounter = 0;

/**
 * 生成唯一的3位房间号
 */
function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100 + Math.random() * 900)); // 100-999
  } while (codeToRoom.has(code));
  return code;
}

/**
 * 创建新房间
 */
function createRoom(gameId, creatorSocketId, creatorInfo) {
  const roomId = `room_${++roomCounter}_${Date.now()}`;
  const roomCode = generateRoomCode();

  const room = {
    id: roomId,
    roomCode,
    gameId,
    players: [{
      id: creatorInfo.id,
      socketId: creatorSocketId,
      nickname: creatorInfo.nickname,
      ready: false,
    }],
    state: 'waiting', // waiting | playing | finished
    gameState: null,
    createdAt: new Date(),
  };

  rooms.set(roomId, room);
  codeToRoom.set(roomCode, roomId);
  playerRooms.set(creatorSocketId, roomId);

  return room;
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

  // 检查人数上限
  if (maxPlayers && room.players.length >= maxPlayers) {
    return { error: '房间已满' };
  }

  room.players.push({
    id: userInfo.id,
    socketId,
    nickname: userInfo.nickname,
    ready: false,
  });

  playerRooms.set(socketId, roomId);

  return { room };
}

/**
 * 快速匹配：加入已有等待中的房间，或创建新房间
 * @param {number} [maxPlayers] - 房间最大人数
 */
function quickMatch(gameId, socketId, userInfo, maxPlayers) {
  // 查找等待中的房间
  for (const [roomId, room] of rooms) {
    if (room.gameId === gameId && room.state === 'waiting') {
      const result = joinRoom(roomId, socketId, userInfo, maxPlayers);
      if (!result.error) {
        return { room: result.room, isNew: false };
      }
    }
  }

  // 没有可用房间，创建新房间
  const room = createRoom(gameId, socketId, userInfo);
  return { room, isNew: true };
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
 */
function allPlayersReady(roomId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  return room.players.length >= 2 && room.players.every(p => p.ready);
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
 * 获取玩家所在房间
 */
function getPlayerRoom(socketId) {
  const roomId = playerRooms.get(socketId);
  return roomId ? rooms.get(roomId) : null;
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

  // 移除玩家
  room.players = room.players.filter(p => p.socketId !== socketId);
  playerRooms.delete(socketId);

  // 如果房间空了，删除房间
  if (room.players.length === 0) {
    codeToRoom.delete(room.roomCode);
    rooms.delete(roomId);
    return { room: null, roomId, empty: true };
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
 */
function joinByCode(code, socketId, userInfo, maxPlayers) {
  const roomId = codeToRoom.get(code);
  if (!roomId) return { error: '房间号不存在' };

  const result = joinRoom(roomId, socketId, userInfo, maxPlayers);
  if (result.error) return result;

  return { room: result.room, roomId };
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
  leaveRoom,
  getStats,
};
