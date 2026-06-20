/**
 * AI 机器人服务
 *
 * 使用 LLM API 为游戏生成智能机器人操作
 * 支持多个游戏，通过 prompt 模板适配
 */

// DeepSeek API（优先）/ ModelScope（备用）
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-cf0075767e944db6951434f0d7ffb518';
const DEEPSEEK_MODEL = 'deepseek-chat';

const MODELSOPE_API_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
const MODELSOPE_API_KEY = process.env.MODELSCOPE_API_KEY || 'ms-33c539d7-90e9-42c7-972d-aa91f595f9a0';
const MODELSOPE_MODEL = 'Qwen/Qwen3.5-397B-A17B';

// 请求队列，防止并发过高
let lastRequestTime = 0;
const MIN_INTERVAL = 1000; // 最小间隔 1 秒

/**
 * 调用单个 LLM API
 */
async function callSingleAPI(apiUrl, apiKey, model, prompt, maxTokens) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是一个游戏AI玩家。请根据游戏状态做出最优决策。只输出JSON格式的操作，不要解释。',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 调用 LLM API（DeepSeek 优先，ModelScope 备用）
 */
async function callLLM(prompt, maxTokens = 200) {
  // 限流
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastRequestTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  // 优先 DeepSeek
  try {
    const result = await callSingleAPI(DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, prompt, maxTokens);
    if (result) return result;
  } catch (err) {
    console.warn('[Bot] DeepSeek 失败，尝试 ModelScope:', err.message);
  }

  // 备用 ModelScope
  try {
    const result = await callSingleAPI(MODELSOPE_API_URL, MODELSOPE_API_KEY, MODELSOPE_MODEL, prompt, maxTokens);
    if (result) return result;
  } catch (err) {
    console.error('[Bot] ModelScope 也失败:', err.message);
  }

  return null;
}

/**
 * 从响应中提取 JSON
 */
function extractJSON(text) {
  if (!text) return null;
  // 尝试直接解析
  try { return JSON.parse(text); } catch {}
  // 提取 ```json ... ``` 块
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) try { return JSON.parse(match[1]); } catch {}
  // 提取第一个 { ... }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) try { return JSON.parse(braceMatch[0]); } catch {}
  return null;
}

// ========== 游戏特定的决策逻辑 ==========

/**
 * 斗地主 AI 决策（代码逻辑 + LLM 辅助）
 */
function decideDoudizhu(gameState, botId) {
  const hand = gameState.playerHands?.[botId] || gameState.myHand || [];

  // 叫分阶段：随机决定
  if (gameState.phase === 'bidding') {
    const highestBid = gameState.highestBid || 0;
    const minBid = highestBid + 1;
    // 简单策略：30% 概率叫分，否则不叫
    if (Math.random() < 0.3 && minBid <= 3) {
      const score = Math.random() < 0.5 ? minBid : 3;
      return { type: 'bid', score };
    }
    return { type: 'bid', score: 0 };
  }

  // 出牌阶段：简单策略
  if (hand.length === 0) return null;

  const lastPlay = gameState.lastPlay;

  if (!lastPlay) {
    // 自由出牌：出最小的一张
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
  }

  // 有上家出牌：尝试出更大的牌，否则不出
  const { getCardType, canBeat } = require('../../../games/doudizhu/server/cards');
  const lastType = lastPlay.cardType;

  // 尝试单张压牌
  for (const card of [...hand].sort((a, b) => a.value - b.value)) {
    const testType = getCardType([card]);
    if (testType && canBeat(lastType, testType)) {
      return { type: 'play', cards: [card] };
    }
  }

  // 尝试对子压牌
  const counts = {};
  hand.forEach(c => { counts[c.value] = (counts[c.value] || 0) + 1; });
  for (const [value, count] of Object.entries(counts)) {
    if (count >= 2) {
      const pairCards = hand.filter(c => c.value === Number(value)).slice(0, 2);
      const testType = getCardType(pairCards);
      if (testType && canBeat(lastType, testType)) {
        return { type: 'play', cards: pairCards };
      }
    }
  }

  // 压不过，不出
  return { type: 'pass' };
}

/**
 * 麻将 Prompt
 */
function buildMahjongPrompt(gameState, botId) {
  const hand = gameState.hands?.[botId] || gameState.myHand || [];
  const handStr = hand.map(c => c.display).join(', ');
  const melds = gameState.melds?.[botId] || [];
  const meldsStr = melds.map(m => m.tiles.map(t => t.display).join('')).join(', ');
  const lastDiscard = gameState.lastDiscard;

  let prompt = `你是麻将AI玩家。
手牌：[${handStr}]
明牌：[${meldsStr || '无'}]`;

  if (lastDiscard) {
    prompt += `\n有人打出了：${lastDiscard.display}`;
  }

  prompt += `\n你只能回复一个JSON对象，不要添加任何其他文字。
type 只能是以下之一：pung、kong、chow、win、pass、discard。
打牌时 tile 填手牌中的牌名。
格式：{"type":"pass"} 或 {"type":"discard","tile":"一万"}`;

  return prompt;
}

/**
 * 象棋 AI 决策（猜拳/选色直接随机，走棋用 LLM）
 */
function decideChess(gameState, botId) {
  // 猜拳阶段：直接随机，不调用 LLM
  if (gameState.phase === 'rps') {
    const choices = ['rock', 'scissors', 'paper'];
    const choice = choices[Math.floor(Math.random() * 3)];
    return { type: 'rps', choice };
  }

  // 选色阶段：直接随机
  if (gameState.phase === 'choosing') {
    const color = Math.random() > 0.5 ? 'red' : 'black';
    return { type: 'choose_color', color };
  }

  // 走棋阶段：返回 null，由 LLM prompt 处理
  return null;
}

/**
 * 象棋走棋 Prompt
 */
function buildChessMovePrompt(gameState, botId) {
  const myColor = gameState.colorMap?.[String(botId)];
  const pieces = gameState.pieces || [];
  const myPieces = pieces.filter(p => p.color === myColor);
  const myPiecesStr = myPieces.map(p => `${p.name}(${p.col},${p.row})`).join(', ');

  return `你是中国象棋AI，执${myColor === 'red' ? '红' : '黑'}方。
你的棋子：[${myPiecesStr}]
棋盘上所有棋子：[${pieces.map(p => `${p.color}${p.name}(${p.col},${p.row})`).join(', ')}]
轮到${gameState.turnColor === 'red' ? '红' : '黑'}方走棋。
col 范围 0-8，row 范围 0-9。
你只能回复一个JSON对象，不要添加任何其他文字。
格式：{"type":"move","from":{"col":数字,"row":数字},"to":{"col":数字,"row":数字}}`;
}

// ========== LLM 响应规范化 ==========

/**
 * 规范化 LLM 返回的 action，兼容各种格式
 * - key: "action" → "type"
 * - RPS 中文值: "石头"→"rock", "剪刀"→"scissors", "布"→"paper"
 */
function normalizeAction(action) {
  if (!action || typeof action !== 'object') return action;

  // "action" → "type"（LLM 可能用任一个 key）
  if (action.action && !action.type) {
    action.type = action.action;
    delete action.action;
  }

  // RPS 中文值修正
  if (action.type === 'rps' && action.choice) {
    const choiceMap = { '石头': 'rock', '剪刀': 'scissors', '布': 'paper', 'rock': 'rock', 'scissors': 'scissors', 'paper': 'paper' };
    action.choice = choiceMap[action.choice] || action.choice;
  }

  // 斗地主出牌：确保 cards 是数组
  if (action.type === 'play' && !Array.isArray(action.cards)) {
    action.cards = action.cards ? [action.cards] : [];
  }

  return action;
}

// ========== 机器人决策主函数 ==========

/**
 * 获取机器人操作
 * @param {string} gameId - 游戏ID
 * @param {object} gameState - 游戏状态
 * @param {string} botId - 机器人ID
 * @returns {object|null} 操作对象
 */
async function getBotAction(gameId, gameState, botId) {
  let action = null;

  // 优先用代码逻辑处理简单决策
  switch (gameId) {
    case 'doudizhu':
      action = decideDoudizhu(gameState, botId);
      break;
    case 'chinese-chess':
      action = decideChess(gameState, botId);
      break;
  }

  // 代码已决策（猜拳/叫分/简单出牌）
  if (action) {
    console.log(`[Bot] ${botId} 代码决策 (${gameId}):`, JSON.stringify(action));
    return action;
  }

  // 需要 LLM 辅助（象棋走棋/麻将/复杂出牌）
  let prompt;
  switch (gameId) {
    case 'chinese-chess':
      prompt = buildChessMovePrompt(gameState, botId);
      break;
    case 'mahjong':
      prompt = buildMahjongPrompt(gameState, botId);
      break;
    default:
      console.warn(`[Bot] ${gameId} 无 LLM prompt`);
      return null;
  }

  console.log(`[Bot] ${botId} 请求 LLM 决策 (${gameId})`);
  const response = await callLLM(prompt);
  action = extractJSON(response);

  if (action) {
    action = normalizeAction(action);
    console.log(`[Bot] ${botId} LLM 决策:`, JSON.stringify(action));
    return action;
  }

  console.warn(`[Bot] ${botId} LLM 无法解析:`, response?.substring(0, 100));
  return null;
}

module.exports = { getBotAction, callLLM };
