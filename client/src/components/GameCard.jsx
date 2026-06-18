import { useNavigate } from 'react-router-dom';

// 游戏图标映射
const GAME_ICONS = {
  doudizhu: '🃏',
  mahjong: '🀄',
  'chinese-chess': '♟️',
};

// 游戏渐变色映射
const GAME_GRADIENTS = [
  'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
  'linear-gradient(135deg, #00b894 0%, #55efc4 100%)',
  'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)',
  'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)',
  'linear-gradient(135deg, #fdcb6e 0%, #ffeaa7 100%)',
  'linear-gradient(135deg, #e84393 0%, #fd79a8 100%)',
];

export default function GameCard({ game, index = 0 }) {
  const navigate = useNavigate();
  const icon = GAME_ICONS[game.id] || '🎮';
  const gradient = GAME_GRADIENTS[index % GAME_GRADIENTS.length];

  return (
    <div
      className="game-card"
      onClick={() => navigate(`/game/${game.id}`)}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* 顶部渐变条 */}
      <div className="game-card-banner" style={{ background: gradient }}>
        <span className="game-card-banner-icon">{icon}</span>
      </div>

      {/* 内容 */}
      <div className="game-card-body">
        <h3 className="game-card-name">{game.name}</h3>
        <p className="game-card-desc">{game.description}</p>

        <div className="game-card-meta">
          <span className="game-card-tag">👥 {game.minPlayers}-{game.maxPlayers} 人</span>
          {game.version && <span className="game-card-tag">v{game.version}</span>}
        </div>

        <button className="game-card-play" style={{ background: gradient }}>
          开始游戏 →
        </button>
      </div>
    </div>
  );
}
