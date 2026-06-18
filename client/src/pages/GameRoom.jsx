import { useParams } from 'react-router-dom';
import GameHost from '../components/GameHost';
import { getGameComponent } from '../games';

export default function GameRoom() {
  const { gameId } = useParams();
  const GameComponent = getGameComponent(gameId);

  if (!GameComponent) {
    return (
      <div style={styles.container}>
        <h2>游戏 "{gameId}" 未找到</h2>
        <p style={styles.hint}>请确认游戏已正确注册到平台</p>
      </div>
    );
  }

  return <GameHost gameId={gameId} GameComponent={GameComponent} />;
}

const styles = {
  container: {
    minHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  hint: {
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
};
