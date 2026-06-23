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
  const [codeMessage, setCodeMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const { register, sendCode, loading, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const setFieldError = (field, msg) => {
    setFieldErrors(prev => ({ ...prev, [field]: msg }));
  };

  const clearFieldError = (field) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSendCode = async () => {
    clearFieldError('code');
    setCodeMessage('');
    if (!email.trim()) {
      setFieldError('email', '请先输入邮箱地址');
      return;
    }
    const ok = await sendCode({ email: email.trim(), purpose: 'register' });
    if (ok) {
      setCodeSent(true);
      setCountdown(60);
      setCodeMessage('验证码已发送，请查看邮箱');
    } else {
      setCodeMessage('发送失败，请稍后重试');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFieldErrors({});

    // 前端校验
    const errors = {};
    const nick = nickname.trim();
    if (!nick || nick.length < 2) errors.nickname = '昵称至少 2 个字符';
    if (!email.trim()) errors.email = '请输入邮箱地址';
    if (!password || password.length < 6) errors.password = '密码至少 6 位';
    if (!code.trim()) errors.code = '请输入验证码';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const result = await register({
      email: email.trim(),
      code: code.trim(),
      nickname: nick,
      password,
      rememberMe,
      captcha: captchaAnswer,
    });

    if (result === true) {
      navigate('/lobby');
      return;
    }

    // 后端错误映射到字段
    const errCode = result;
    const serverFieldErrors = {
      AUTH_120: { code: '验证码无效或已过期' },
      AUTH_121: { code: '验证码无效或已过期' },
      AUTH_122: { nickname: '昵称已被占用，请换一个' },
      AUTH_130: { email: '该邮箱已被注册，换个邮箱试试' },
      AUTH_131: { nickname: '该手机号已被注册' },
      AUTH_132: { nickname: '昵称已被占用，请换一个' },
    };

    if (serverFieldErrors[errCode]) {
      setFieldErrors(serverFieldErrors[errCode]);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">注 册</h1>

        <form onSubmit={handleSubmit}>
          {/* 昵称 */}
          <div className="auth-form-group">
            <label htmlFor="register-nickname">昵称</label>
            <input
              id="register-nickname"
              type="text"
              value={nickname}
              onChange={(event) => { setNickname(event.target.value); clearFieldError('nickname'); }}
              placeholder="2-20 个字符"
              autoComplete="nickname"
              maxLength={20}
              disabled={loading}
              className={fieldErrors.nickname ? 'input-error' : ''}
              required
            />
            {fieldErrors.nickname && <p className="field-error">{fieldErrors.nickname}</p>}
          </div>

          {/* 邮箱 */}
          <div className="auth-form-group">
            <label htmlFor="register-email">邮箱地址</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setCodeSent(false); clearFieldError('email'); }}
              placeholder="name@example.com"
              autoComplete="email"
              maxLength={120}
              disabled={loading}
              className={fieldErrors.email ? 'input-error' : ''}
              required
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>

          {/* 密码 */}
          <div className="auth-form-group">
            <label htmlFor="register-password">密码</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); clearFieldError('password'); }}
              placeholder="至少 6 位"
              autoComplete="new-password"
              disabled={loading}
              minLength={6}
              className={fieldErrors.password ? 'input-error' : ''}
              required
            />
            {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>

          {/* 验证码 + 获取验证码按钮（同行） */}
          <div className="auth-form-group">
            <label htmlFor="register-code">邮箱验证码</label>
            <div className="auth-code-row">
              <input
                id="register-code"
                type="text"
                className={`auth-code-input ${fieldErrors.code ? 'input-error' : ''}`}
                inputMode="numeric"
                value={code}
                onChange={(event) => { setCode(event.target.value); clearFieldError('code'); }}
                placeholder="请输入 6 位验证码"
                autoComplete="one-time-code"
                maxLength={8}
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
            {fieldErrors.code && <p className="field-error">{fieldErrors.code}</p>}
            {codeMessage && !fieldErrors.code && <p className="auth-code-hint">{codeMessage}</p>}
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
