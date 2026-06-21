import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../services/socket';
import { setVolume } from '../services/sounds';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [muted, setMuted] = useState(false);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setVolume(next ? 0 : 0.5);
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/lobby" className="navbar-logo">
        🎮 联机游戏平台
      </Link>

      <div className="navbar-right">
        {user ? (
          <>
            <Link to="/leaderboard" className="navbar-stats">🏆 排行榜</Link>
            <Link to="/stats" className="navbar-stats">📊 战绩</Link>
            <span className="navbar-nickname">{user.nickname}</span>
            <span className="navbar-actions">
              <button onClick={toggleMute} className="navbar-icon-btn" title={muted ? '开启音效' : '关闭音效'}>
                {muted ? '🔇' : '🔊'}
              </button>
              <button onClick={handleLogout} className="navbar-logout">
                退出
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
