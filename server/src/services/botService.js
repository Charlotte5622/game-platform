/**
 * AI 机器人服务
 *
 * 使用 LLM API 为游戏生成智能机器人操作
 * 支持多个游戏，通过 prompt 模板适配
 */

const API_URL = 'https://api-inference.modelscope.cn/v1/chat/completions';
const API_KEY = process.env.MODELSCOPE_API_KEY || 'ms-33c539d7-90e9-42c7-972d-aa91f595f9a0';
const MODEL = 'Qwen/Qwen3.5-397B-A17B';

// 请求队列，防止并发过高
let lastRequestTime = 0;
const MIN_INTERVAL = 1000; // 最小间隔 1 秒

/**
 * 调用 LLM API
 */
async function callLLM(prompt, maxTokens = 200) {
  // 限流
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastRequestTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
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

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('LLM API 调用失败:', err.message);
    return null;
  }
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

// ========== 游戏特定的 Prompt 构建 ==========

/**
 * 斗地主 Prompt
 */
function buildDoudizhuPrompt(gameState, botId) {
  const hand = gameState.playerHands?.[botId] || gameState.myHand || [];
  const handStr = hand.map(c => c.display || `${c.rank}`).join(', ');
  const lastPlay = gameState.lastPlay;
  const isLandlord = gameState.landlord === botId;
  const role = isLandlord ? '地主' : '农民';

  let prompt = `你是斗地主AI玩家，身份：${role}。
当前手牌：[${handStr}]
手牌数量：${hand.length}张`;

  if (lastPlay) {
    const lastCards = lastPlay.cards.map(c => c.display || c.rank).join(', ');
    prompt += `\n上家出的牌：[${lastCards}]（${lastPlay.cardType?.type || '未知'}）`;
    prompt += `\n你需要出比这更大的牌，或者选择"不出"。`;
  } else {
    prompt += `\n轮到你自由出牌。`;
  }

  prompt += `\n\n请输出JSON格式：
{"action": "play", "cards": ["牌的id列表"]} 或 {"action": "pass"}`;

  return prompt;
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
当前手牌：[${handStr}]
明牌：[${meldsStr || '无'}]`;

  if (lastDiscard) {
    prompt += `\n有人打出了：${lastDiscard.display}`;
    prompt += `\n你可以选择：碰、杠、吃、和、或不出。`;
  }

  prompt += `\n\n请输出JSON格式：
{"action": "pung"|"kong"|"chow"|"win"|"pass"|"discard", "tile": "要打的牌名"}`;

  return prompt;
}

/**
 * 象棋 Prompt
 */
function buildChessPrompt(gameState, botId) {
  const myColor = gameState.colorMap?.[botId];
  const pieces = gameState.pieces || [];
  const piecesStr = pieces.map(p => `${p.color}${p.name}(${p.col},${p.row})`).join(', ');

  return `你是中国象棋AI玩家，执${myColor === 'red' ? '红' : '黑'}方。
当前棋盘：[${piecesStr}]
轮到${gameState.turnColor === 'red' ? '红' : '黑'}方走棋。

请输出JSON格式：
{"action": "move", "from": {"col": x, "row": y}, "to": {"col": x, "row": y}}`;
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
  let prompt;

  switch (gameId) {
    case 'doudizhu':
      prompt = buildDoudizhuPrompt(gameState, botId);
      break;
    case 'mahjong':
      prompt = buildMahjongPrompt(gameState, botId);
      break;
    case 'chinese-chess':
      prompt = buildChessPrompt(gameState, botId);
      break;
    default:
      console.warn(`[Bot] 不支持的游戏: ${gameId}`);
      return null;
  }

  console.log(`[Bot] ${botId} 请求决策 (${gameId})`);
  const response = await callLLM(prompt);
  const action = extractJSON(response);

  if (action) {
    console.log(`[Bot] ${botId} 决策:`, JSON.stringify(action));
    return action;
  }

  console.warn(`[Bot] ${botId} 无法解析响应:`, response?.substring(0, 100));
  return null;
}

module.exports = { getBotAction, callLLM };
