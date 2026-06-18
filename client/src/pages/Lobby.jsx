import { useState, useEffect } from 'react';
import api from '../services/api';
import GameCard from '../components/GameCard';
import { getSocket } from '../services/socket';

export default function Lobby() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

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

    // 获取在线统计 + 监听实时更新
    try {
      const s = getSocket();
      if (s) {
        s.emit('get_stats', (data) => setStats(data));
        const handleStatsUpdate = (data) => setStats(data);
        s.on('stats_update', handleStatsUpdate);
        return () => s.off('stats_update', handleStatsUpdate);
      }
    } catch {}
  }, []);

  if (loading) {
    return (
      <div className="lobby">
        <div className="lobby-hero">
          <div className="lobby-hero-bg" />
          <h1 className="lobby-hero-title">🎮 游戏大厅</h1>
          <p className="lobby-hero-sub">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lobby">
        <div className="lobby-hero">
          <div className="lobby-hero-bg" />
          <h1 className="lobby-hero-title">🎮 游戏大厅</h1>
          <p className="lobby-hero-sub" style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      {/* Hero 区域 */}
      <div className="lobby-hero">
        <div className="lobby-hero-bg" />
        <div className="lobby-hero-content">
          <h1 className="lobby-hero-title">🎮 游戏大厅</h1>
          <p className="lobby-hero-sub">选择你喜欢的游戏，开始匹配对战</p>

          {stats && (
            <div className="lobby-stats">
              <div className="lobby-stat">
                <span className="lobby-stat-num">{stats.onlinePlayers || 0}</span>
                <span className="lobby-stat-label">在线玩家</span>
              </div>
              <div className="lobby-stat-divider" />
              <div className="lobby-stat">
                <span className="lobby-stat-num">{stats.playingRooms || 0}</span>
                <span className="lobby-stat-label">进行中</span>
              </div>
              <div className="lobby-stat-divider" />
              <div className="lobby-stat">
                <span className="lobby-stat-num">{stats.waitingRooms || 0}</span>
                <span className="lobby-stat-label">等待中</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 游戏列表 */}
      <div className="lobby-section">
        <div className="lobby-section-header">
          <h2 className="lobby-section-title">热门游戏</h2>
          <span className="lobby-section-count">{games.length} 款游戏</span>
        </div>

        {games.length === 0 ? (
          <div className="lobby-empty">
            <div className="lobby-empty-icon">📦</div>
            <p className="lobby-empty-text">暂无可用游戏</p>
            <p className="lobby-empty-hint">请在 games/ 目录下添加游戏插件</p>
          </div>
        ) : (
          <div className="lobby-grid">
            {games.map((game, i) => (
              <GameCard key={game.id} game={game} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* 底部装饰 */}
      <div className="lobby-footer">
        <p>🎯 更多游戏即将上线，敬请期待</p>
      </div>
    </div>
  );
}
