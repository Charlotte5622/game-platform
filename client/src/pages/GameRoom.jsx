import { Link, useParams } from 'react-router-dom';
import GameHost from '../components/GameHost';
import { getGameComponent } from '../games';

export default function GameRoom() {
  const { gameId } = useParams();
  const GameComponent = getGameComponent(gameId);

  if (!GameComponent) {
    return (
      <div className="game-not-found">
        <div className="game-not-found-icon" aria-hidden="true">🎲</div>
        <h2>游戏 "{gameId}" 未找到</h2>
        <p>请确认游戏已正确注册到平台，或回到大厅重新选择。</p>
        <Link to="/lobby" className="game-not-found-link">返回游戏大厅</Link>
      </div>
    );
  }

  return <GameHost gameId={gameId} GameComponent={GameComponent} />;
}
