import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../services/socket';
import { setVolume, soundClick } from '../services/sounds';
import { isLight, toggleLight, onThemeChange } from '../services/theme';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(() => localStorage.getItem('muted') === 'true');
  const [light, setLight] = useState(() => isLight());

  useEffect(() => {
    setVolume(muted ? 0 : 0.5);
  }, []);

  useEffect(() => onThemeChange(() => setLight(isLight())), []);

  const handleToggleTheme = () => {
    soundClick();
    toggleLight();
  };

  const toggleMute = () => {
    soundClick();
    const next = !muted;
    setMuted(next);
    localStorage.setItem('muted', String(next));
    setVolume(next ? 0 : 0.5);
  };

  const handleLogout = async () => {
    soundClick();
    disconnectSocket();
    await logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    [
      'relative px-2 sm:px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200',
      'whitespace-nowrap shrink-0',
      isActive
        ? 'text-text after:absolute after:left-3 after:right-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:shadow-[0_0_12px_var(--c-accent)]'
        : 'text-muted hover:text-text',
    ].join(' ');

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between h-16 px-4 sm:px-6 glass border-b border-line"
      aria-label="主导航"
    >
      <Link to="/lobby" className="group flex items-center gap-2.5" aria-label="返回游戏大厅">
        <span className="grid place-items-center w-9 h-9 rounded-xl text-lg bg-raised border border-line-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-200 group-hover:scale-105 group-hover:shadow-[0_0_18px_-2px_var(--c-accent)]">
          🎮
        </span>
        <span className="font-display font-bold tracking-tight text-[15px] text-text whitespace-nowrap">
          联机<span className="text-accent">竞技场</span>
        </span>
      </Link>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={handleToggleTheme}
          className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-text border border-transparent hover:border-line hover:bg-raised/60 transition-colors"
          title={light ? '切换到夜间模式' : '切换到白天模式'}
          aria-label={light ? '切换到夜间模式' : '切换到白天模式'}
        >
          {light ? '🌙' : '☀️'}
        </button>

        {user ? (
          <>
            <NavLink to="/leaderboard" className={linkClass}>排行榜</NavLink>
            <NavLink to="/stats" className={linkClass}>战绩</NavLink>
            <NavLink to="/security" className={linkClass}>安全</NavLink>

            <span
              className="hidden sm:flex items-center gap-2 ml-1 pl-3 pr-3 py-1.5 rounded-full bg-raised/70 border border-line text-sm text-text max-w-[160px]"
              title={user.nickname}
            >
              <span className="grid place-items-center w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold">
                {user.nickname?.charAt(0) || '玩'}
              </span>
              <span className="truncate">{user.nickname}</span>
            </span>

            <button
              onClick={toggleMute}
              className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-text border border-transparent hover:border-line hover:bg-raised/60 transition-colors"
              title={muted ? '开启音效' : '关闭音效'}
              aria-label={muted ? '开启音效' : '关闭音效'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              onClick={handleLogout}
              className="btn-ghost px-3.5 py-1.5 text-sm"
            >
              退出
            </button>
          </>
        ) : (
          <Link to="/login" className="btn-accent px-5 py-2 text-sm">
            登录
          </Link>
        )}
      </div>
    </nav>
  );
}
