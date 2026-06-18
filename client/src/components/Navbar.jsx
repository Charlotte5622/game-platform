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
    <nav style={styles.nav}>
      <Link to="/lobby" style={styles.logo}>
        🎮 联机游戏平台
      </Link>

      <div style={styles.right}>
        {user ? (
          <>
            <span style={styles.nickname}>{user.nickname}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>
              退出
            </button>
          </>
        ) : (
          <Link to="/login" style={styles.loginLink}>
            登录
          </Link>
        )}
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '64px',
    background: 'rgba(15, 15, 35, 0.95)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 1000,
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text)',
    textDecoration: 'none',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  nickname: {
    color: 'var(--secondary)',
    fontWeight: '600',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    padding: '6px 16px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  loginLink: {
    color: 'var(--secondary)',
    textDecoration: 'none',
    fontWeight: '600',
  },
};
