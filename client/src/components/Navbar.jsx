import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../services/socket';
import { setVolume, soundClick } from '../services/sounds';
import { RiLogoutBoxLine, RiVolumeUpLine, RiVolumeMuteLine } from '@remixicon/react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(() => localStorage.getItem('muted') === 'true');

  useEffect(() => {
    setVolume(muted ? 0 : 0.5);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('muted', String(next));
    setVolume(next ? 0 : 0.5);
    soundClick();
  };

  const handleLogout = async () => {
    soundClick();
    disconnectSocket();
    await logout();
    navigate('/login');
  };

  const navClass = ({ isActive }) => `navbar-link${isActive ? ' active' : ''}`;

  return (
    <nav className="navbar" aria-label="主导航">
      <Link to="/lobby" className="navbar-logo" aria-label="返回游戏大厅">
        <span className="navbar-logo-mark">🎮</span>
        <span>联机游戏平台</span>
      </Link>

      <div className="navbar-right">
        {user ? (
          <>
            <NavLink to="/leaderboard" className={navClass}>排行榜</NavLink>
            <NavLink to="/stats" className={navClass}>战绩</NavLink>
            <NavLink to="/security" className={navClass}>安全</NavLink>
            <span className="navbar-nickname" title={user.nickname}>{user.nickname}</span>
            <span className="navbar-actions">
              <button onClick={toggleMute} className="navbar-icon-btn" title={muted ? '开启音效' : '关闭音效'} aria-label={muted ? '开启音效' : '关闭音效'}>
                {muted ? <RiVolumeMuteLine size={20} /> : <RiVolumeUpLine size={20} />}
              </button>
              <button onClick={handleLogout} className="navbar-icon-btn" title="退出登录" aria-label="退出登录">
                <RiLogoutBoxLine size={20} />
              </button>
            </span>
          </>
        ) : (
          <Link to="/login" className="navbar-login">
            登录
          </Link>
        )}
      </div>
    </nav>
  );
}
