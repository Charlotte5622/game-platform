/**
 * AI 机器人服务
 *
 * 使用 LLM API 为游戏生成智能机器人操作
 * 支持多个游戏，通过 prompt 模板适配
 */

// DeepSeek API
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-4bf...';
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

  // 只用 DeepSeek，失败则由调用方走 fallback（随机走法等）
  try {
    const result = await callSingleAPI(DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, prompt, maxTokens);
    if (result) {
      console.log('[Bot-LLM] ✅ DeepSeek 返回成功');
      return result;
    }
    console.warn('[Bot-LLM] DeepSeek 返回空结果');
  } catch (err) {
    console.warn(`[Bot-LLM] ❌ DeepSeek 失败: ${err.message}`);
  }

  return null;
}

/**
 * 从响应中提取 JSON
 */
function extractJSON(text) {
  if (!text) return null;
  // 去除 <think>...</think> 标签（Qwen 等模型的思考过程）
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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
 * UNO AI 决策（纯代码逻辑，不依赖 LLM）
 *
 * 返回单个 action 或 action 数组（如 [uno, play_card]）
 *
 * 策略：
 * 1. drawStack>0 时：优先出 +2，其次 wild+4，否则摸牌
 * 2. 选牌：根据手牌数/对手威胁/牌类型综合评分
 * 3. wild+4 视为"最后手段"（手牌≤2 或无其他选择时才用）
 * 4. 对手剩 ≤2 张时提升 skip/reverse/+2 优先级
 * 5. 选色：手牌多时选场上已出最多的颜色（后续容易匹配），手牌少时选手中最长色
 * 6. 出到最后一张前喊 UNO
 */
function decideUno(gameState, botId) {
  const hand = gameState.hands?.[botId] || gameState.myHand || [];
  if (!hand || hand.length === 0) return null;

  const currentColor = gameState.currentColor;
  const topCard = gameState.discard?.[gameState.discard.length - 1];
  const drawStack = gameState.drawStack || 0;

  // ---------- 对手最小手牌数 ----------
  const handCounts = gameState.handCounts || {};
  const minEnemyCards = Math.min(
    ...Object.entries(handCounts)
      .filter(([pid]) => String(pid) !== String(botId))
      .map(([, cnt]) => cnt)
  );
  const enemyDanger = minEnemyCards <= 2;  // 对手快要赢了

  // ========== 1. 有叠加 +2/+4 时 ==========
  if (drawStack > 0) {
    const counters = hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) =>
        (gameState.lastCardValue === '+2' && card.value === '+2') ||
        (gameState.lastCardValue === '+2' && card.value === 'wild+4') ||
        (gameState.lastCardValue === 'wild+4' && card.value === 'wild+4')
      );
    if (counters.length > 0) {
      // 优先出 +2，留 wild+4
      const pick = counters.find(c => c.card.value === '+2') || counters[0];
      const chosenColor = pick.card.color === 'black'
        ? chooseColor(hand, gameState, enemyDanger)
        : undefined;
      return maybeUno(hand, { type: 'play_card', cardIndex: pick.index, chosenColor });
    }
    // 无反击牌，必须摸
    return { type: 'draw_card' };
  }

  // ========== 2. 找可出的牌 ==========
  const playable = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) =>
      card.color === 'black' ||
      card.color === currentColor ||
      (topCard && card.value === topCard.value)
    );

  if (playable.length === 0) return { type: 'draw_card' };

  // ========== 3. 评分选牌 ==========
  const scored = playable.map(({ card, index }) => {
    let score = 0;
    const isWild = card.color === 'black';
    const isWild4 = card.value === 'wild+4';
    const isWildNorm = card.value === 'wild';
    const isDraw2 = card.value === '+2';
    const isSkip = card.value === 'skip';
    const isReverse = card.value === 'reverse';
    const isNumber = !isWild && !isDraw2 && !isSkip && !isReverse;

    // --- wild+4：留到最后，只在手牌≤2或无其他选择时用 ---
    if (isWild4) {
      score = (hand.length <= 2) ? 100 : -50;
    } else if (isWildNorm) {
      // wild 普通：手牌少时用，手牌多时留
      score = (hand.length <= 3) ? 80 : 20;
    } else if (isDraw2) {
      score = enemyDanger ? 70 : 35;
    } else if (isSkip || isReverse) {
      score = enemyDanger ? 60 : 25;
    } else if (isNumber) {
      // 数字牌：先出大的（减少手牌总点数）
      const num = parseInt(card.value);
      score = isNaN(num) ? 5 : 5 + num * 2;
    }

    // 颜色匹配加分（非黑牌且颜色=当前色，更容易出）
    if (!isWild && card.color === currentColor) {
      score += 15;
    }

    return { card, index, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const pick = scored[0];
  const chosenColor = pick.card.color === 'black'
    ? chooseColor(hand, gameState, enemyDanger)
    : undefined;

  return maybeUno(hand, { type: 'play_card', cardIndex: pick.index, chosenColor });
}

/**
 * 如果手牌=2张且即将打出1张（到1张），自动喊 UNO
 * 返回 action 数组 [uno, playCard] 或单个 playCard
 */
function maybeUno(hand, playAction) {
  if (hand.length === 2) {
    return [
      { type: 'uno' },
      playAction,
    ];
  }
  return playAction;
}

/**
 * 选色策略
 * - 手牌多 (≥4)：选场上弃牌堆中出现最多的颜色（后续更容易匹配）
 * - 手牌少 (<4)：选手中最多的颜色（集中火力出完）
 */
function chooseColor(hand, gameState, enemyDanger) {
  const handColorCounts = {};
  const discardColorCounts = {};

  // 统计手牌中的颜色（排除黑牌）
  for (const card of hand) {
    if (card.color !== 'black') {
      handColorCounts[card.color] = (handColorCounts[card.color] || 0) + 1;
    }
  }

  // 统计弃牌堆中的颜色
  const discard = gameState.discard || [];
  for (const card of discard) {
    if (card.color !== 'black') {
      discardColorCounts[card.color] = (discardColorCounts[card.color] || 0) + 1;
    }
  }

  // 手牌少：选手中最长色
  if (hand.length < 4) {
    const best = Object.entries(handColorCounts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : 'red';
  }

  // 手牌多：选弃牌堆中最常见的颜色（场上该色已多，后续配对概率高）
  const best = Object.entries(discardColorCounts).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) return best[0];

  // 无弃牌堆数据，退化到手牌中最长色
  const handBest = Object.entries(handColorCounts).sort((a, b) => b[1] - a[1])[0];
  return handBest ? handBest[0] : 'red';
}

/**
 * 海龟汤 AI 决策（代码逻辑，不依赖 LLM）
 * - 投票阶段：随机选一个分类
 * - 提问阶段：轮到 bot 时随机提问
 * - 猜谜阶段：bot 随机决定是否猜测
 */
function decideTurtleSoup(gameState, botId) {
  const { CATEGORIES } = require('../../../games/turtle-soup/server/puzzles');

  // 投票阶段：随机选一个分类
  if (gameState.phase === 'voting') {
    if (gameState.votes?.[botId]) return null; // 已投票
    const availableCategories = (gameState.categories || CATEGORIES).filter(
      c => !(gameState.usedCategories || []).includes(c.id)
    );
    const cats = availableCategories.length > 0 ? availableCategories : (gameState.categories || CATEGORIES);
    const chosen = cats[Math.floor(Math.random() * cats.length)];
    return { type: 'vote', categoryId: chosen.id };
  }

  // 提问阶段
  if (gameState.phase === 'playing') {
    // 已提交猜测，等待其他人
    if (gameState.guessedPlayers?.[botId]) return null;

    // 轮到 bot 提问
    const currentTurnPlayer = gameState.players?.[gameState.currentTurn];
    if (currentTurnPlayer === botId) {
      // 30% 概率提交猜测，70% 概率提问
      if (Math.random() < 0.3) {
        const guesses = [
          '我觉得真相是这样的',
          '我有一个猜测',
          '让我试试看',
        ];
        return { type: 'guess', guess: guesses[Math.floor(Math.random() * guesses.length)] };
      }
      // 提问
      const questions = [
        '这个人是自愿来到这里的吗？',
        '这件事涉及到死亡吗？',
        '有其他人知道这件事吗？',
        '这个场景发生在室内还是室外？',
        '这个人之前来过这里吗？',
        '有什么东西被隐藏了吗？',
        '时间（白天/夜晚）重要吗？',
        '这个人认识在场的其他人吗？',
      ];
      return { type: 'ask', question: questions[Math.floor(Math.random() * questions.length)] };
    }
  }

  return null;
}

/**
 * 斗地主 AI 决策（代码逻辑，不依赖 LLM）
 */
function decideDoudizhu(gameState, botId) {
  const { getCardType, canBeat } = require('../../../games/doudizhu/server/cards');
  const hand = gameState.playerHands?.[botId] || gameState.myHand || [];

  // 叫分阶段
  if (gameState.phase === 'bidding') {
    const highestBid = gameState.highestBid || 0;
    const minBid = highestBid + 1;
    if (Math.random() < 0.3 && minBid <= 3) {
      return { type: 'bid', score: Math.random() < 0.5 ? minBid : 3 };
    }
    return { type: 'bid', score: 0 };
  }

  if (hand.length === 0) return null;

  const lastPlay = gameState.lastPlay;

  // 自由出牌：出最小单张
  if (!lastPlay) {
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
  }

  const lastType = lastPlay.cardType;
  if (!lastType) return { type: 'pass' };

  // 按牌值统计
  const counts = {};
  hand.forEach(c => { counts[c.value] = (counts[c.value] || 0) + 1; });
  const sorted = [...hand].sort((a, b) => a.value - b.value);

  // 1. 尝试同类型压牌
  if (lastType.type === 'single') {
    for (const card of sorted) {
      const t = getCardType([card]);
      if (t && canBeat(lastType, t)) return { type: 'play', cards: [card] };
    }
  }

  if (lastType.type === 'pair') {
    for (const [value, count] of Object.entries(counts)) {
      if (count >= 2) {
        const cards = hand.filter(c => c.value === Number(value)).slice(0, 2);
        const t = getCardType(cards);
        if (t && canBeat(lastType, t)) return { type: 'play', cards };
      }
    }
  }

  if (lastType.type === 'trio' || lastType.type === 'trio_single' || lastType.type === 'trio_pair') {
    for (const [value, count] of Object.entries(counts)) {
      if (count >= 3) {
        const trioCards = hand.filter(c => c.value === Number(value)).slice(0, 3);
        if (lastType.type === 'trio') {
          const t = getCardType(trioCards);
          if (t && canBeat(lastType, t)) return { type: 'play', cards: trioCards };
        }
        if (lastType.type === 'trio_single') {
          const kicker = sorted.find(c => c.value !== Number(value));
          if (kicker) {
            const cards = [...trioCards, kicker];
            const t = getCardType(cards);
            if (t && canBeat(lastType, t)) return { type: 'play', cards };
          }
        }
        if (lastType.type === 'trio_pair') {
          const pairValue = Object.entries(counts).find(([v, c]) => c >= 2 && Number(v) !== Number(value));
          if (pairValue) {
            const pairCards = hand.filter(c => c.value === Number(pairValue[0])).slice(0, 2);
            const cards = [...trioCards, ...pairCards];
            const t = getCardType(cards);
            if (t && canBeat(lastType, t)) return { type: 'play', cards };
          }
        }
      }
    }
  }

  // 2. 同类型压不过，尝试炸弹
  for (const [value, count] of Object.entries(counts)) {
    if (count === 4) {
      const bombCards = hand.filter(c => c.value === Number(value));
      const t = getCardType(bombCards);
      if (t && canBeat(lastType, t)) return { type: 'play', cards: bombCards };
    }
  }

  // 3. 尝试火箭（大小王）
  const jokerS = hand.find(c => c.value === 16);
  const jokerB = hand.find(c => c.value === 17);
  if (jokerS && jokerB) {
    return { type: 'play', cards: [jokerS, jokerB] };
  }

  // 压不过
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
    const choice = ['rock', 'scissors', 'paper'][Math.floor(Math.random() * 3)];
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
 * 校验 LLM 返回的走法是否合法
 */
function validateChessMove(gameState, botId, action) {
  if (!action.from || !action.to) { console.warn('[Chess-Validate] 缺少 from/to'); return false; }
  const { isValidMove, wouldBeInCheck, getPieceAt } = require('../../../games/chinese-chess/server/pieces');
  const myColor = gameState.colorMap?.[String(botId)];
  const pieces = gameState.pieces || [];
  const piece = getPieceAt(pieces, action.from.col, action.from.row);
  if (!piece) { console.warn(`[Chess-Validate] 无棋子 at (${action.from.col},${action.from.row})`); return false; }
  if (piece.color !== myColor) { console.warn(`[Chess-Validate] 棋子颜色不对: ${piece.color} vs ${myColor}`); return false; }
  if (!isValidMove(pieces, piece, action.to.col, action.to.row)) { console.warn(`[Chess-Validate] 非法走法: ${piece.name} (${action.from.col},${action.from.row}) → (${action.to.col},${action.to.row})`); return false; }
  if (wouldBeInCheck(pieces, piece, action.to.col, action.to.row)) { console.warn(`[Chess-Validate] 送将`); return false; }
  return true;
}

/**
 * 象棋 fallback：遍历所有合法走法，随机选一个
 */
function getRandomChessMove(gameState, botId) {
  const { isValidMove, wouldBeInCheck, getPieceAt } = require('../../../games/chinese-chess/server/pieces');
  const myColor = gameState.colorMap?.[String(botId)];
  const pieces = gameState.pieces || [];
  const myPieces = pieces.filter(p => p.color === myColor);
  const validMoves = [];

  for (const piece of myPieces) {
    for (let col = 0; col <= 8; col++) {
      for (let row = 0; row <= 9; row++) {
        if (isValidMove(pieces, piece, col, row) && !wouldBeInCheck(pieces, piece, col, row)) {
          validMoves.push({ from: { col: piece.col, row: piece.row }, to: { col, row } });
        }
      }
    }
  }

  if (validMoves.length === 0) return null;
  return { type: 'move', ...validMoves[Math.floor(Math.random() * validMoves.length)] };
}

/**
 * 象棋走棋 Prompt（给 LLM 合法走法列表，让它选最优）
 */
function buildChessMovePrompt(gameState, botId) {
  const { isValidMove, wouldBeInCheck } = require('../../../games/chinese-chess/server/pieces');
  const myColor = gameState.colorMap?.[String(botId)];
  const pieces = gameState.pieces || [];
  const myPieces = pieces.filter(p => p.color === myColor);
  const enemyPieces = pieces.filter(p => p.color !== myColor);

  // Generate ALL legal moves
  const legalMoves = [];
  for (const piece of myPieces) {
    for (let col = 0; col <= 8; col++) {
      for (let row = 0; row <= 9; row++) {
        if (isValidMove(pieces, piece, col, row) && !wouldBeInCheck(pieces, piece, col, row)) {
          const target = pieces.find(p => p.col === col && p.row === row);
          legalMoves.push({
            i: legalMoves.length,
            piece: piece.name,
            from: piece.col + ',' + piece.row,
            to: col + ',' + row,
            capture: target ? target.name : null,
          });
        }
      }
    }
  }

  if (legalMoves.length === 0) return null;

  const moveList = legalMoves.map(m =>
    '[' + m.i + '] ' + m.piece + ' ' + m.from + '->' + m.to + (m.capture ? ' capture:' + m.capture : '')
  ).join('\n');

  const enemyStr = enemyPieces.map(p => p.name + '(' + p.col + ',' + p.row + ')').join(', ');

  return [
    'You are a strong Chinese Chess AI. Pick the BEST move from the list below.',
    'My color: ' + myColor + '. Enemy pieces: ' + enemyStr,
    '',
    'Legal moves:',
    moveList,
    '',
    'Reply ONLY with the move number (e.g. 3):'
  ].join('\n');
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
    case 'uno':
      action = decideUno(gameState, botId);
      break;
    case 'turtle-soup':
      action = decideTurtleSoup(gameState, botId);
      break;
    case 'gomoku':
      action = decideGomoku(gameState, botId);
      break;
  }
  if (action) {
    console.log(`[Bot] ${botId} 代码决策 (${gameId}):`, JSON.stringify(action));
    return action;
  }

  // 需要 LLM 辅助（象棋走棋/麻将）
  let prompt;
  let legalMoves = null;
  switch (gameId) {
    case 'chinese-chess': {
      const { isValidMove, wouldBeInCheck } = require('../../../games/chinese-chess/server/pieces');
      const myColor = gameState.colorMap?.[String(botId)];
      const pieces = gameState.pieces || [];
      const myPieces = pieces.filter(p => p.color === myColor);
      legalMoves = [];
      for (const piece of myPieces) {
        for (let col = 0; col <= 8; col++) {
          for (let row = 0; row <= 9; row++) {
            if (isValidMove(pieces, piece, col, row) && !wouldBeInCheck(pieces, piece, col, row)) {
              legalMoves.push({ type: 'move', from: { col: piece.col, row: piece.row }, to: { col, row } });
            }
          }
        }
      }
      if (legalMoves.length === 0) return null;
      prompt = buildChessMovePrompt(gameState, botId);
      break;
    }
    case 'mahjong':
      prompt = buildMahjongPrompt(gameState, botId);
      break;
    default:
      console.warn(`[Bot] ${gameId} 无 LLM prompt`);
      return null;
  }

  console.log(`[Bot] ${botId} 请求 LLM 决策 (${gameId})`);
  const response = await callLLM(prompt, 100);
  console.log(`[Bot] ${botId} LLM 原始返回: ${response?.substring(0, 100)}`);

  // 象棋：从 LLM 返回的数字索引中选取合法走法
  if (gameId === 'chinese-chess' && legalMoves) {
    const numMatch = response?.match(/\d+/);
    const idx = numMatch ? parseInt(numMatch[0]) : -1;
    if (idx >= 0 && idx < legalMoves.length) {
      action = legalMoves[idx];
      console.log(`[Bot] ${botId} LLM 选了走法 #${idx}: ${JSON.stringify(action)}`);
      return action;
    }
    // LLM 返回无效索引，随机选一个
    const fallback = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    console.log(`[Bot] ${botId} LLM 返回无效索引 "${response}"，随机选: ${JSON.stringify(fallback)}`);
    return fallback;
  }

  action = extractJSON(response);
  if (action) {
    action = normalizeAction(action);
    console.log(`[Bot] ${botId} LLM 决策:`, JSON.stringify(action));
    return action;
  }

  // LLM 失败：象棋用 fallback 随机合法走法
  if (gameId === 'chinese-chess') {
    const fallback = getRandomChessMove(gameState, botId);
    if (fallback) {
      console.log(`[Bot] ${botId} LLM 失败，使用 fallback:`, JSON.stringify(fallback));
      return fallback;
    }
  }

  console.warn(`[Bot] ${botId} 无法决策 (${gameId})`);
  return null;
}

// ========== UNO AI: chooseBestCard ==========
/**
 * UNO AI 评分选牌（纯代码，不依赖 LLM）
 * @param {Array} hand - 手牌数组 [{color, value}, ...]
 * @param {object} topCard - 弃牌堆顶牌 {color, value}
 * @param {object} game - 游戏对象（含 players 等）
 * @returns {object|null} 最佳出牌 {color, value} 或 null（无可出牌）
 *
 * 评分规则：
 *   +4 Wild: 100  |  Wild: 80  |  +2: 70  |  Skip: 60  |  Reverse: 55
 *   同色牌: 40 + (faceValue / 10)  |  同数字牌: 30  |  其他: 10
 *   同分时优先出面值较小的牌
 */
function chooseBestCard(hand, topCard, game) {
  if (!hand || hand.length === 0 || !topCard) return null;

  // 找出可出的牌（黑色万能牌 或 颜色匹配 或 数字匹配）
  const playable = hand.filter(card =>
    card.color === 'black' ||
    card.color === topCard.color ||
    card.value === topCard.value
  );

  if (playable.length === 0) return null;

  // 数字面值辅助函数
  const faceValue = (val) => {
    const n = parseInt(val);
    return isNaN(n) ? 0 : n;
  };

  const scored = playable.map(card => {
    let score = 0;
    if (card.color === 'black') {
      // Wild 牌
      score = card.value === 'wild+4' ? 100 : 80;
    } else if (card.value === '+2') {
      score = 70;
    } else if (card.value === 'skip') {
      score = 60;
    } else if (card.value === 'reverse') {
      score = 55;
    } else if (card.color === topCard.color) {
      // 同色数字牌
      score = 40 + faceValue(card.value) / 10;
    } else if (card.value === topCard.value) {
      // 同数字不同色
      score = 30;
    } else {
      score = 10;
    }
    return { card, score };
  });

  // 按分数降序，同分按面值升序
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return faceValue(a.card.value) - faceValue(b.card.value);
  });

  return scored[0].card;
}

// ========== Chinese Chess AI: getChineseChessAction ==========
/**
 * 象棋 AI：生成所有合法走法，调用 LLM 选出最优
 * @param {object} gameState - 游戏状态（含 pieces, colorMap, currentPlayer 等）
 * @returns {object|null} {from: {row, col}, to: {row, col}} 或 null
 */
async function getChineseChessAction(gameState) {
  const { isValidMove, wouldBeInCheck, getPieceAt } = require('../../../games/chinese-chess/server/pieces');

  const currentPlayer = gameState.currentPlayer;
  const myColor = gameState.colorMap?.[String(currentPlayer)] || gameState.currentColor;
  const pieces = gameState.pieces || [];
  const myPieces = pieces.filter(p => p.color === myColor);

  // 生成所有合法走法
  const legalMoves = [];
  for (const piece of myPieces) {
    for (let col = 0; col <= 8; col++) {
      for (let row = 0; row <= 9; row++) {
        if (isValidMove(pieces, piece, col, row) && !wouldBeInCheck(pieces, piece, col, row)) {
          const target = pieces.find(p => p.col === col && p.row === row);
          legalMoves.push({
            i: legalMoves.length,
            piece: piece.name,
            from: { row: piece.row, col: piece.col },
            to: { row, col },
            capture: target ? target.name : null,
          });
        }
      }
    }
  }

  if (legalMoves.length === 0) return null;

  // 构造 prompt 给 LLM
  const moveList = legalMoves.map(m =>
    '[' + m.i + '] ' + m.piece + ' (' + m.from.col + ',' + m.from.row + ')->(' + m.to.col + ',' + m.to.row + ')' + (m.capture ? ' 吃:' + m.capture : '')
  ).join('\n');

  const enemyPieces = pieces.filter(p => p.color !== myColor);
  const enemyStr = enemyPieces.map(p => p.name + '(' + p.col + ',' + p.row + ')').join(', ');

  const prompt = [
    'You are a strong Chinese Chess AI. Pick the BEST move from the legal moves below.',
    'My color: ' + myColor + '. Enemy pieces: ' + enemyStr,
    '',
    'Legal moves:',
    moveList,
    '',
    'Reply ONLY with the move number (e.g. 3):',
  ].join('\n');

  // 调用 LLM
  const response = await callLLM(prompt, 100);
  console.log('[ChineseChess-AI] LLM 原始返回:', response?.substring(0, 100));

  // 解析 LLM 返回的走法编号
  const numMatch = response?.match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0]) : -1;
  if (idx >= 0 && idx < legalMoves.length) {
    const chosen = legalMoves[idx];
    console.log('[ChineseChess-AI] LLM 选了走法 #' + idx + ':', JSON.stringify(chosen));
    return { from: chosen.from, to: chosen.to };
  }

  // LLM 返回无效，随机选一个合法走法
  const fallback = legalMoves[Math.floor(Math.random() * legalMoves.length)];
  console.log('[ChineseChess-AI] LLM 返回无效，随机选:', JSON.stringify(fallback));
  return { from: fallback.from, to: fallback.to };
}


// ========== Gomoku AI: decideGomoku ==========
/**
 * 五子棋 AI（纯代码评分，不依赖 LLM）
 *
 * 评分算法：检查每个空位的进攻/防守分数
 * - 进攻分：己方连珠数（5=必胜，4=必杀，3=威胁）
 * - 防守分：对手连珠数（4=必须堵，3=威胁）
 * 选择最高分位置
 */
function decideGomoku(gameState, botId) {
  const board = gameState.board;
  const SIZE = 15;
  const myColor = String(botId) === String(gameState.blackId) ? 'black' : 'white';
  const enemyColor = myColor === 'black' ? 'white' : 'black';

  // 四个方向增量
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  /**
   * 评估某个位置在某个方向上，某颜色的连珠数
   * 返回 { count, openEnds } — count 为连续棋子数，openEnds 为两端开放数 (0/1/2)
   */
  function countLine(row, col, dr, dc, color) {
    let count = 1;
    let openEnds = 0;

    // 正方向
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === color) {
      count++;
      r += dr;
      c += dc;
    }
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === null) openEnds++;

    // 反方向
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === color) {
      count++;
      r -= dr;
      c -= dc;
    }
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === null) openEnds++;

    return { count, openEnds };
  }

  /**
   * 评估某个位置对于某颜色的得分
   */
  function scoreForColor(row, col, color) {
    let totalScore = 0;

    for (const [dr, dc] of directions) {
      const { count, openEnds } = countLine(row, col, dr, dc, color);

      if (count >= 5) {
        totalScore += 1000000; // 五连珠，必胜
      } else if (count === 4) {
        if (openEnds === 2) totalScore += 100000;  // 活四，必杀
        else if (openEnds === 1) totalScore += 10000; // 冲四
      } else if (count === 3) {
        if (openEnds === 2) totalScore += 5000;  // 活三
        else if (openEnds === 1) totalScore += 500; // 眠三
      } else if (count === 2) {
        if (openEnds === 2) totalScore += 200;  // 活二
        else if (openEnds === 1) totalScore += 50; // 眠二
      } else if (count === 1) {
        if (openEnds === 2) totalScore += 10;
      }
    }

    return totalScore;
  }

  // 收集所有空位（优先考虑已有棋子周围的空位）
  const candidates = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) {
        // 在已有棋子周围 2 格范围内找空位
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === null) {
              candidates.add(`${nr},${nc}`);
            }
          }
        }
      }
    }
  }

  // 如果棋盘为空，下天元
  if (candidates.size === 0) {
    return { row: 7, col: 7 };
  }

  let bestScore = -1;
  let bestMove = null;

  for (const key of candidates) {
    const [row, col] = key.split(',').map(Number);

    // 进攻分（己方）
    const attackScore = scoreForColor(row, col, myColor);
    // 防守分（对手）
    const defendScore = scoreForColor(row, col, enemyColor);

    // 综合评分：进攻略优先于防守
    const score = attackScore * 1.1 + defendScore;

    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }

  return bestMove;
}

module.exports = { getBotAction, callLLM, chooseBestCard, getChineseChessAction, decideGomoku };
