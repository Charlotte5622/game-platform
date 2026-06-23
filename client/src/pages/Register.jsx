import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const ok = await register(username.trim(), password, nickname.trim());
    if (ok) navigate('/lobby');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">📝 注册</h1>
        <p className="auth-subtitle">创建账号，开始游戏</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="register-username">用户名</label>
            <input
              id="register-username"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (error) clearError(); }}
              placeholder="3-20 个字符"
              autoComplete="username"
              pattern="[A-Za-z0-9_]+"
              disabled={loading}
              required
              minLength={3}
              maxLength={20}
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="register-nickname">昵称</label>
            <input
              id="register-nickname"
              type="text"
              value={nickname}
              onChange={(e) => { setNickname(e.target.value); if (error) clearError(); }}
              placeholder="其他玩家看到的名字"
              autoComplete="nickname"
              maxLength={20}
              disabled={loading}
              required
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="register-password">密码</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) clearError(); }}
              placeholder="至少 6 个字符"
              autoComplete="new-password"
              disabled={loading}
              required
              minLength={6}
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="auth-footer">
          已有账号？ <Link to="/login">立即登录</Link>
        </p>
      </div>
    </div>
  );
}
