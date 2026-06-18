import { useState, useEffect } from 'react';
import api from '../services/api';
import GameCard from '../components/GameCard';

export default function Lobby() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/games')
      .then((res) => {
        setGames(res.data.games);
        setLoading(false);
      })
      .catch((err) => {
        setError('加载游戏列表失败');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <p>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🎮 游戏大厅</h1>
        <p style={styles.subtitle}>选择一个游戏，开始匹配</p>
      </div>

      {games.length === 0 ? (
        <div style={styles.empty}>
          <p>暂无可用游戏</p>
          <p style={styles.emptyHint}>
            请在 games/ 目录下添加游戏插件
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    marginBottom: '8px',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '24px',
  },
  empty: {
    textAlign: 'center',
    padding: '80px 20px',
    color: 'var(--text-muted)',
  },
  emptyHint: {
    fontSize: '13px',
    marginTop: '8px',
    opacity: 0.7,
  },
};
