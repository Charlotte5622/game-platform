import { useNavigate } from 'react-router-dom';

export default function GameCard({ game }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/game/${game.id}`);
  };

  return (
    <div style={styles.card} onClick={handleClick}>
      <div style={styles.icon}>🎮</div>
      <h3 style={styles.name}>{game.name}</h3>
      <p style={styles.desc}>{game.description}</p>
      <div style={styles.meta}>
        <span>👥 {game.minPlayers}-{game.maxPlayers} 人</span>
        {game.version && <span>v{game.version}</span>}
      </div>
      <button style={styles.playBtn}>开始游戏</button>
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  name: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  desc: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  meta: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  playBtn: {
    marginTop: '8px',
    padding: '10px 24px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontWeight: '600',
    fontSize: '14px',
  },
};
