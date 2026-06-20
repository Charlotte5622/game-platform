import { useState, useEffect } from 'react';
import api from '../services/api';
import GameCard from '../components/GameCard';
import { getSocket } from '../services/socket';

// 主题配置
const THEMES = [
  { id: 'midnight', label: '午夜', className: 'theme-btn-midnight' },
  { id: 'sky', label: '晴空', className: 'theme-btn-sky' },
  { id: 'sakura', label: '樱落', className: 'theme-btn-sakura' },
  { id: 'aurora', label: '极光', className: 'theme-btn-aurora' },
  { id: 'snow', label: '雪境', className: 'theme-btn-snow' },
];

export default function Lobby() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('lobby-theme') || 'midnight');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // 应用主题到 body
  useEffect(() => {
    if (theme === 'midnight') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', theme);
    }
    localStorage.setItem('lobby-theme', theme);
  }, [theme]);

  useEffect(() => {
    // 同时获取内置游戏和外部游戏
    Promise.all([
      api.get('/api/games').catch(() => ({ data: { games: [] } })),
      api.get('/api/external-games').catch(() => ({ data: { games: [] } })),
    ]).then(([builtIn, external]) => {
      const allGames = [
        ...builtIn.data.games,
        ...external.data.games,
      ];
      setGames(allGames);
      setLoading(false);
    }).catch(() => {
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
          <div className="lobby-hero-content">
            <h1 className="lobby-hero-title">🎮 游戏大厅</h1>
            <p className="lobby-hero-sub">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lobby">
        <div className="lobby-hero">
          <div className="lobby-hero-bg" />
          <div className="lobby-hero-content">
            <h1 className="lobby-hero-title">🎮 游戏大厅</h1>
            <p className="lobby-hero-sub lobby-hero-error">{error}</p>
          </div>
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
          <p className="lobby-hero-sub">
            {user ? `${user.nickname}，选择你喜欢的游戏开始匹配` : '选择你喜欢的游戏，开始匹配对战'}
          </p>

          <div className="lobby-stats">
            <div className="lobby-stat">
              <span className="lobby-stat-num">{stats?.onlinePlayers || '—'}</span>
              <span className="lobby-stat-label">在线玩家</span>
            </div>
            <div className="lobby-stat-divider" />
            <div className="lobby-stat">
              <span className="lobby-stat-num">{stats?.playingRooms || '—'}</span>
              <span className="lobby-stat-label">进行中</span>
            </div>
            <div className="lobby-stat-divider" />
            <div className="lobby-stat">
              <span className="lobby-stat-num">{stats?.waitingRooms || '—'}</span>
              <span className="lobby-stat-label">等待中</span>
            </div>
          </div>
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

      {/* 主题切换器 */}
      <div className="theme-switcher">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-btn ${t.className}${theme === t.id ? ' active' : ''}`}
            onClick={() => setTheme(t.id)}
            title={t.label}
          />
        ))}
      </div>
    </div>
  );
}
