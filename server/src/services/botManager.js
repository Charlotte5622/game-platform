/**
 * 机器人管理器
 *
 * 功能：
 * 1. 为房间添加机器人玩家
 * 2. 管理机器人的生命周期
 * 3. 定时调用 AI 决策
 */

const { getBotAction } = require('./botService');

// 活跃的机器人: botId -> { roomId, gameId, socketId, timer }
const activeBots = new Map();

let botCounter = 0;

/**
 * 创建一个机器人玩家
 */
function createBot(roomId, gameId) {
  botCounter++;
  const botId = `bot_${botCounter}`;
  return {
    id: botId,
    nickname: `AI-${['小明', '小红', '小刚', '小丽', '小华', '小芳'][botCounter % 6]}`,
    socketId: null,
    isBot: true,
    ready: true, // 机器人自动准备
  };
}

/**
 * 为房间填充机器人到指定人数
 */
function fillRoomWithBots(room, gameId, targetCount) {
  const bots = [];
  const currentCount = room.players.length;

  for (let i = 0; i < targetCount - currentCount; i++) {
    const bot = createBot(room.id, gameId);
    room.players.push(bot);
    bots.push(bot);
  }

  return bots;
}

/**
 * 启动机器人的定时决策
 */
function startBotDecisionLoop(roomId, gameId, botIds, getGameState, onAction) {
  for (const botId of botIds) {
    const timer = setInterval(async () => {
      try {
        const gameState = getGameState(roomId);
        if (!gameState || gameState.phase === 'ended') {
          console.log(`[Bot] ${botId} 游戏已结束，停止`);
          stopBot(botId);
          return;
        }

        // 检查是否轮到该机器人
        const isBotTurn = isPlayersTurn(gameState, botId, gameId);
        if (!isBotTurn) return;

        // 检查是否有待响应的动作
        const needsResponse = checkNeedsResponse(gameState, botId);
        if (!needsResponse && !isBotTurn) return;

        console.log(`[Bot] ${botId} 轮到决策 phase=${gameState.phase} gameId=${gameId}`);

        // 调用 AI 获取决策
        const action = await getBotAction(gameId, gameState, botId);
        if (action) {
          console.log(`[Bot] ${botId} 执行动作: ${JSON.stringify(action)}`);
          onAction(roomId, botId, action);
        } else {
          console.warn(`[Bot] ${botId} AI 未返回有效动作`);
        }
      } catch (err) {
        console.error(`[Bot] ${botId} 决策出错:`, err.message, err.stack);
      }
    }, 2000 + Math.random() * 3000); // 2-5 秒随机间隔

    activeBots.set(botId, { roomId, gameId, timer });
  }
}

/**
 * 检查是否轮到该玩家
 */
function isPlayersTurn(gameState, botId, gameId) {
  if (gameId === 'doudizhu') {
    if (gameState.phase === 'bidding') {
      return gameState.players[gameState.bidTurn] === botId;
    }
    return gameState.players[gameState.currentTurn] === botId;
  }

  if (gameId === 'mahjong') {
    return gameState.players[gameState.currentTurn] === botId;
  }

  if (gameId === 'chinese-chess') {
    // 猜拳阶段：如果 bot 还没出拳，就是它的回合
    if (gameState.phase === 'rps') {
      const hasChosen = !!gameState.rpsChoices?.[botId];
      console.log(`[Bot-Turn] ${botId} RPS: hasChosen=${hasChosen} rpsChoices=${JSON.stringify(gameState.rpsChoices)}`);
      return !hasChosen;
    }
    // 选色阶段：如果 bot 是赢家且还没选色
    if (gameState.phase === 'choosing') {
      const isWinner = gameState.winner === botId;
      console.log(`[Bot-Turn] ${botId} choosing: isWinner=${isWinner} winner=${gameState.winner}`);
      return isWinner;
    }
    // 走棋阶段：检查颜色
    if (gameState.phase === 'playing') {
      const botColor = gameState.colorMap?.[String(botId)];
      const isTurn = gameState.turnColor === botColor;
      console.log(`[Bot-Turn] ${botId} playing: botColor=${botColor} turnColor=${gameState.turnColor} isTurn=${isTurn}`);
      return isTurn;
    }
  }

  return false;
}

/**
 * 检查是否需要响应（碰/杠/吃/和）
 */
function checkNeedsResponse(gameState, botId) {
  if (!gameState.waitingAction) return false;
  return gameState.waitingAction.responders?.some(r => r.pid === botId);
}

/**
 * 停止单个机器人
 */
function stopBot(botId) {
  const bot = activeBots.get(botId);
  if (bot) {
    clearInterval(bot.timer);
    activeBots.delete(botId);
  }
}

/**
 * 停止房间内所有机器人
 */
function stopRoomBots(roomId) {
  for (const [botId, bot] of activeBots) {
    if (bot.roomId === roomId) {
      clearInterval(bot.timer);
      activeBots.delete(botId);
    }
  }
}

/**
 * 获取房间内的机器人数量
 */
function getBotCount(roomId) {
  let count = 0;
  for (const bot of activeBots.values()) {
    if (bot.roomId === roomId) count++;
  }
  return count;
}

module.exports = {
  createBot,
  fillRoomWithBots,
  startBotDecisionLoop,
  stopBot,
  stopRoomBots,
  getBotCount,
};
