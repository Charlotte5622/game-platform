import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const { login, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      const messages = {
        github_auth_failed: 'GitHub 授权失败，请重试',
        github_not_configured: 'GitHub 登录暂不可用',
        github_token_failed: 'GitHub 登录失败，请重试',
        github_profile_failed: '获取 GitHub 信息失败',
        account_disabled: '账号已被禁用',
        session_failed: '登录会话创建失败',
        github_failed: 'GitHub 登录失败，请重试',
      };
      useAuthStore.setState({ error: messages[oauthError] || '登录失败，请重试' });
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

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


        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="login-identifier">邮箱 / 昵称</label>
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(event) => { setIdentifier(event.target.value); if (error) clearError(); }}
              placeholder="邮箱地址 / 昵称"
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

        <div className="auth-divider">
          <span>或者</span>
        </div>

        <a href="/api/auth/github" className="auth-github-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          使用 GitHub 登录
        </a>

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
