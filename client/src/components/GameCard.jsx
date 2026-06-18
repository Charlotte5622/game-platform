import { useNavigate } from 'react-router-dom';

export default function GameCard({ game }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/game/${game.id}`);
  };

  return (
    <div className="game-card" onClick={handleClick}>
      <div className="game-card-icon">🎮</div>
      <h3 className="game-card-name">{game.name}</h3>
      <p className="game-card-desc">{game.description}</p>
      <div className="game-card-meta">
        <span>👥 {game.minPlayers}-{game.maxPlayers} 人</span>
        {game.version && <span>v{game.version}</span>}
      </div>
      <button className="game-card-play">开始游戏</button>
    </div>
  );
}
