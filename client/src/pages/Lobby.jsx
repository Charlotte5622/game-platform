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
      .catch(() => {
        setError('加载游戏列表失败');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="lobby-loading">加载中...</div>;
  }

  if (error) {
    return <div className="lobby-error">{error}</div>;
  }

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h1 className="lobby-title">🎮 游戏大厅</h1>
        <p className="lobby-subtitle">选择一个游戏，开始匹配</p>
      </div>

      {games.length === 0 ? (
        <div className="lobby-empty">
          <p>暂无可用游戏</p>
          <p className="lobby-empty-hint">请在 games/ 目录下添加游戏插件</p>
        </div>
      ) : (
        <div className="lobby-grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
