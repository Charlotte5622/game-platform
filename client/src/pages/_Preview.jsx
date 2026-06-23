/**
 * 开发预览页(仅用于设计自检,不影响生产逻辑) — 路由 /preview
 * 用 mock 数据渲染:大厅游戏卡 + 斗地主牌桌
 */
import GameCard from '../components/GameCard';
import DoudizhuGame from '../../../games/doudizhu/client/DoudizhuGame';

const MOCK_GAMES = [
  { id: 'doudizhu', name: '斗地主', description: '经典叫分抢地主,54 张牌,叫牌出牌一气呵成', minPlayers: 3, maxPlayers: 3, version: '1.2' },
  { id: 'mahjong', name: '四人麻将', description: '吃碰杠和、记牌器、手机端自适应,支持 DeepSeek AI', minPlayers: 4, maxPlayers: 4, version: '2.0' },
  { id: 'chinese-chess', name: '中国象棋', description: '猜拳选色、走棋记录、步时超时判负', minPlayers: 2, maxPlayers: 2, version: '1.1' },
  { id: 'uno', name: 'UNO', description: '+2/+4 叠加、反转、跳过,2-6 人欢乐对战', minPlayers: 2, maxPlayers: 6, version: '1.0' },
  { id: 'gomoku', name: '五子棋', description: '15×15 棋盘、禁手规则,落子如飞', minPlayers: 2, maxPlayers: 2, allowBots: false },
  { id: 'turtle-soup', name: '海龟汤', description: '125 道题、5 个分类,AI 智能判别', minPlayers: 1, maxPlayers: 10, type: 'external' },
];

const SUITS = ['♠', '♥', '♦', '♣'];
const mk = (rank, suit) => ({ id: `${rank}-${suit}`, rank, suit });
const MOCK_HAND = [
  mk('3', '♠'), mk('4', '♥'), mk('5', '♦'), mk('6', '♣'), mk('7', '♠'),
  mk('8', '♥'), mk('9', '♦'), mk('10', '♣'), mk('J', '♠'), mk('Q', '♥'),
  mk('K', '♦'), mk('A', '♠'), mk('A', '♥'), mk('2', '♠'),
  { id: 'js', rank: 'JOKER_S', suit: '' }, { id: 'jb', rank: 'JOKER_B', suit: '' },
];

const MOCK_STATE = {
  players: ['p0', 'p1', 'p2'],
  myHand: MOCK_HAND,
  phase: 'playing',
  landlord: 'p0',
  currentTurn: 0,
  lastPlay: { cardType: { type: 'pair' } },
  lastPlayedBy: 'p1',
  playerCardCounts: { p0: 16, p1: 9, p2: 11 },
  kitty: [mk('K', '♥'), mk('7', '♣'), mk('2', '♦')],
  highestBid: 3,
  bids: { p0: { score: 3 }, p1: { score: 0 }, p2: { score: 1 } },
  playHistory: [
    { playerId: 'p1', action: 'play', cards: [mk('9', '♠'), mk('9', '♥')] },
    { playerId: 'p2', action: 'pass' },
  ],
};

const MOCK_PLAYERS = [
  { id: 'p0', nickname: '你', avatar: '🎮', isBot: false },
  { id: 'p1', nickname: 'AI · 小七', avatar: null, isBot: true },
  { id: 'p2', nickname: '阿强', avatar: '😎', isBot: false },
];

export default function Preview() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-12">
      <div>
        <h2 className="font-display text-2xl font-bold text-text mb-1">预览 · 游戏卡</h2>
        <p className="text-sm text-muted mb-6">大厅卡片组件(mock 数据)</p>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {MOCK_GAMES.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-bold text-text mb-1">预览 · 斗地主</h2>
        <p className="text-sm text-muted mb-6">牌桌组件(mock 对局)</p>
        <DoudizhuGame
          socket={null}
          roomId="room-A1B2C3"
          playerId="p0"
          gameState={MOCK_STATE}
          players={MOCK_PLAYERS}
          onAction={() => {}}
        />
      </div>
    </div>
  );
}
