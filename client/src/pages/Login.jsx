import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const ok = await login(username.trim(), password);
    if (ok) navigate('/lobby');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">🎮 登录</h1>
        <p className="auth-subtitle">欢迎回到联机游戏平台</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="login-username">用户名</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (error) clearError(); }}
              placeholder="请输入用户名"
              autoComplete="username"
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
              disabled={loading}
              required
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) clearError(); }}
              placeholder="请输入密码"
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="auth-footer">
          还没有账号？ <Link to="/register">立即注册</Link>
        </p>
      </div>
    </div>
  );
}
