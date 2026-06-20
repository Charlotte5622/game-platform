import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../services/socket';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

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
            <Link to="/stats" className="navbar-stats">📊 战绩</Link>
            <span className="navbar-nickname">{user.nickname}</span>
            <button onClick={handleLogout} className="navbar-logout">
              退出
            </button>
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
