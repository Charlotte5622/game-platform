import { useState, useEffect } from 'react';
import api from '../services/api';
import GameCard from '../components/GameCard';
import { getSocket } from '../services/socket';
import { soundWelcome, soundClick } from '../services/sounds';
import { getTheme, setTheme as applyAndPersistTheme, onThemeChange } from '../services/theme';

// 安全解析 localStorage
function safeGetUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

// 主题配置（含白天模式）
const THEMES = [
  { id: 'day', label: '白天', className: 'theme-opt-day' },
  { id: 'midnight', label: '午夜', className: 'theme-opt-midnight' },
  { id: 'sky', label: '海风', className: 'theme-opt-sky' },
  { id: 'sakura', label: '樱桃', className: 'theme-opt-sakura' },
  { id: 'nord', label: '极境', className: 'theme-opt-nord' },
  { id: 'snow', label: '雪境', className: 'theme-opt-snow' },
];

// 扇形展开：从右下角按钮向左上方展开
function getFanStyle(index, total, isOpen) {
  const radius = 112;
  const startAngle = -94;
  const endAngle = -184;
  const step = total > 1 ? (endAngle - startAngle) / (total - 1) : 0;
  const angle = startAngle + step * index;
  const rad = (angle * Math.PI) / 180;
  const x = Math.round(Math.cos(rad) * radius);
  const y = Math.round(Math.sin(rad) * radius);
  return {
    '--fan-transform': `translate(${x}px, ${y}px) scale(1)`,
    transitionDelay: isOpen ? `${index * 50}ms` : `${(total - 1 - index) * 30}ms`,
  };
}

function StatReadout({ code, value, label }) {
  return (
    <div className="relative flex flex-col gap-1.5 px-4 py-3 rounded-lg bg-black/25 border border-line min-w-[112px]">
      <span className="readout text-[10px] tracking-[0.2em] uppercase text-dim">{code}</span>
      <span className="readout text-[28px] font-bold leading-none text-accent">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

export default function Lobby() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [theme, setThemeState] = useState(() => getTheme());
  const [fanOpen, setFanOpen] = useState(false);
  const user = safeGetUser();

  // 与导航栏切换保持同步(共用 services/theme)
  useEffect(() => onThemeChange(setThemeState), []);

  useEffect(() => {
    Promise.all([
      api.get('/api/games').catch(() => ({ data: { games: [] } })),
      api.get('/api/external-games').catch(() => ({ data: { games: [] } })),
    ]).then(([builtIn, external]) => {
      const allGames = [...builtIn.data.games, ...external.data.games];
      setGames(allGames);
      setLoading(false);
      if (!sessionStorage.getItem('lobby-welcome-played')) {
        soundWelcome();
        sessionStorage.setItem('lobby-welcome-played', '1');
      }
    }).catch(() => {
      setError('加载游戏列表失败');
      setLoading(false);
    });

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

  return (
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pb-24">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line mt-6 px-6 sm:px-10 py-11 sm:py-14 glass">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--c-accent) 20%, transparent), transparent 60%), radial-gradient(60% 120% at 100% 0%, color-mix(in srgb, var(--c-accent-2) 16%, transparent), transparent 60%)',
          }}
        />
        <span className="ghost-word -z-10 text-[40vw] sm:text-[240px] -top-8 sm:-top-16 -right-4 sm:right-6 opacity-70">ARENA</span>
        <span className="scanline left-8 right-8 top-14" />
        <span className="hud-frame" />

        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-9">
          <div>
            <div className="flex items-center gap-3">
              <span className="eyebrow">ARENA OS · 大厅</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-[10px] font-mono tracking-wider text-accent uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live
              </span>
            </div>
            <h1 className="mt-4 font-display text-4xl sm:text-6xl font-bold leading-[0.95] text-text">
              游戏<span className="text-accent">大厅</span>
            </h1>
            <p className="mt-4 text-muted max-w-md">
              {user ? `${user.nickname}，选择你喜欢的游戏开始匹配` : '选择你喜欢的游戏，开始匹配对战'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatReadout code="PLR" value={loading ? '—' : (stats?.onlinePlayers ?? 0)} label="在线玩家" />
            <StatReadout code="RUN" value={loading ? '—' : (stats?.playingRooms ?? 0)} label="进行中" />
            <StatReadout code="WAIT" value={loading ? '—' : (stats?.waitingRooms ?? 0)} label="等待中" />
          </div>
        </div>
      </header>

      {/* 游戏列表 */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="eyebrow mb-2.5">// Games</div>
            <h2 className="font-display text-2xl font-bold text-text">热门游戏</h2>
          </div>
          {!loading && !error && (
            <span className="readout text-sm text-dim">[ {String(games.length).padStart(2, '0')} ]</span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-[var(--radius-lg)] border border-line bg-surface/50 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="grid place-items-center text-center py-20 rounded-[var(--radius-lg)] border border-dashed border-line">
            <div className="text-4xl mb-3">📡</div>
            <p className="text-danger">{error}</p>
            <p className="text-sm text-dim mt-1">请检查服务连接后重试</p>
          </div>
        ) : games.length === 0 ? (
          <div className="grid place-items-center text-center py-20 rounded-[var(--radius-lg)] border border-dashed border-line">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-muted">暂无可用游戏</p>
            <p className="text-sm text-dim mt-1">请在 games/ 目录下添加游戏插件</p>
          </div>
        ) : (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {games.map((game, i) => (
              <GameCard key={game.id} game={game} index={i} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-sm text-dim">
        🎯 更多游戏即将上线,敬请期待
      </footer>

      {/* 主题切换器 — 扇形液体玻璃(沿用) */}
      <div className="theme-switcher">
        {fanOpen && <div className="theme-overlay" onClick={() => setFanOpen(false)} />}
        <div className={`theme-fan${fanOpen ? ' open' : ''}`}>
          {THEMES.map((t, i) => (
            <button
              key={t.id}
              className={`theme-option ${t.className}${theme === t.id ? ' active' : ''}`}
              style={getFanStyle(i, THEMES.length, fanOpen)}
              title={`切换到${t.label}主题`}
              aria-label={`切换到${t.label}主题`}
              aria-pressed={theme === t.id}
              onClick={() => { soundClick(); applyAndPersistTheme(t.id); setFanOpen(false); }}
            >
              <span className="theme-option-swatch" aria-hidden="true" />
              <span className="theme-option-label">{t.label}</span>
            </button>
          ))}
        </div>
        <button className={`theme-trigger${fanOpen ? ' open' : ''}`} onClick={() => setFanOpen(!fanOpen)}>
          <span className="theme-trigger-icon">🎨</span>
        </button>
      </div>
    </div>
  );
}
