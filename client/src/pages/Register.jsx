import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function Register() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const { register, sendCode, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    clearError();
    const ok = await sendCode({ email: email.trim(), purpose: 'register' });
    if (ok) {
      setCodeSent(true);
      setCountdown(60);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await register({
      email: email.trim(),
      code: code.trim(),
      nickname: nickname.trim(),
      password,
      rememberMe,
      captcha: captchaAnswer,
    });
    if (ok) navigate('/lobby');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">注册</h1>
        <p className="auth-subtitle">创建账号后直接进入大厅</p>

        <form onSubmit={handleSubmit}>
          {/* 邮箱 + 验证码 — 企业风格：一行布局 */}
          <div className="auth-form-group">
            <label htmlFor="register-email">邮箱地址</label>
            <div className="auth-code-row">
              <input
                id="register-email"
                type="email"
                className="auth-code-input"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setCodeSent(false); if (error) clearError(); }}
                placeholder="name@example.com"
                autoComplete="email"
                maxLength={120}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="auth-code-btn"
                onClick={handleSendCode}
                disabled={loading || !email.trim() || countdown > 0}
              >
                {countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '获取验证码'}
              </button>
            </div>
          </div>

          <div className="auth-form-group">
            <label htmlFor="register-code">验证码</label>
            <input
              id="register-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) => { setCode(event.target.value); if (error) clearError(); }}
              placeholder="请输入 6 位验证码"
              autoComplete="one-time-code"
              maxLength={8}
              disabled={loading}
              required
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="register-nickname">昵称</label>
            <input
              id="register-nickname"
              type="text"
              value={nickname}
              onChange={(event) => { setNickname(event.target.value); if (error) clearError(); }}
              placeholder="2-20 个字符"
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
              onChange={(event) => { setPassword(event.target.value); if (error) clearError(); }}
              placeholder="大小写字母 + 数字 + 特殊字符，至少 8 位"
              autoComplete="new-password"
              disabled={loading}
              minLength={8}
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
            {loading ? '注册中...' : '注册并登录'}
          </button>
        </form>

        <div className="auth-divider">
          <span>或者</span>
        </div>

        <a href="/api/auth/github" className="auth-github-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          使用 GitHub 注册
        </a>

        <p className="auth-footer">
          已有账号？ <Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
