import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const { login, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await login(identifier.trim(), password, rememberMe, captchaAnswer);
    if (ok) navigate('/lobby');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">登录</h1>
        <p className="auth-subtitle">回到你的牌桌和房间</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="login-identifier">手机号或昵称</label>
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(event) => { setIdentifier(event.target.value); if (error) clearError(); }}
              placeholder="手机号 / 昵称"
              autoComplete="username"
              maxLength={80}
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
              onChange={(event) => { setPassword(event.target.value); if (error) clearError(); }}
              placeholder="请输入密码"
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>

          <label className="auth-check-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              disabled={loading}
            />
            <span>记住我</span>
          </label>

          {requiresCaptcha && (
            <SliderCaptcha
              challenge={captcha}
              disabled={loading}
              onSolved={setCaptchaAnswer}
              onReload={loadCaptcha}
            />
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading || (requiresCaptcha && !captchaAnswer)}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="auth-footer auth-footer-split">
          <Link to="/reset-password">忘记密码</Link>
          <span>
            没有账号？ <Link to="/register">注册</Link>
          </span>
        </p>
      </div>
    </div>
  );
}
