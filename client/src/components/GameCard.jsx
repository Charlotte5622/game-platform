import { useNavigate } from 'react-router-dom';
import { soundClick } from '../services/sounds';

const GAME_ICONS = {
  doudizhu: '🃏',
  mahjong: '🀄',
  'chinese-chess': '♟️',
  uno: '🎴',
  'uno-demo': '🎴',
  'turtle-soup': '🐢',
  gomoku: '⚫',
  emulator: '🕹️',
};

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
  const isExternal = game.type === 'external';
  const isStatic = isExternal && game.proxyMode === 'static';
  const playerRange = game.minPlayers === game.maxPlayers ? `${game.minPlayers} 人` : `${game.minPlayers}-${game.maxPlayers} 人`;
  const handleClick = () => {
    soundClick();
    if (isStatic) {
      navigate('/emulator');
    } else if (isExternal) {
      window.open(`/games/${game.id}/`, '_blank', 'noopener,noreferrer');
    } else {
      navigate(`/game/${game.id}`);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="game-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`开始${game.name}`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="game-card-banner" style={{ background: gradient }}>
        <span className="game-card-banner-icon" aria-hidden="true">{icon}</span>
      </div>

      <div className="game-card-body">
        <h3 className="game-card-name">{game.name}</h3>
        <p className="game-card-desc">{game.description}</p>

        <div className="game-card-meta" aria-label="游戏信息">
          <span className="game-card-tag">👥 {playerRange}</span>
          {game.allowBots === false && <span className="game-card-tag">真人局</span>}
          {game.version && <span className="game-card-tag">v{game.version}</span>}
          {isExternal && <span className="game-card-tag game-card-tag-external">外部</span>}
        </div>

        <span className="game-card-play" style={{ background: gradient }} aria-hidden="true">
          开始游戏 →
        </span>
      </div>
    </div>
  );
}
