import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function Register() {
  const [method, setMethod] = useState('phone');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const { register, sendCode, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  const contactPayload = method === 'phone' ? { phone: contact.trim() } : { email: contact.trim() };

  const handleSendCode = async () => {
    clearError();
    const ok = await sendCode({ ...contactPayload, purpose: 'register' });
    if (ok) setCodeSent(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await register({
      ...contactPayload,
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
          <div className="auth-segment" role="tablist" aria-label="注册方式">
            <button type="button" className={method === 'phone' ? 'active' : ''} onClick={() => setMethod('phone')}>
              手机号
            </button>
            <button type="button" className={method === 'email' ? 'active' : ''} onClick={() => setMethod('email')}>
              邮箱
            </button>
          </div>

          <div className="auth-form-group">
            <label htmlFor="register-contact">{method === 'phone' ? '手机号' : '邮箱'}</label>
            <div className="auth-inline-control">
              <input
                id="register-contact"
                type={method === 'phone' ? 'tel' : 'email'}
                value={contact}
                onChange={(event) => { setContact(event.target.value); setCodeSent(false); if (error) clearError(); }}
                placeholder={method === 'phone' ? '请输入手机号' : 'name@example.com'}
                autoComplete={method === 'phone' ? 'tel' : 'email'}
                maxLength={120}
                disabled={loading}
                required
              />
              <button type="button" onClick={handleSendCode} disabled={loading || !contact.trim()}>
                {codeSent ? '已发送' : '验证码'}
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
              placeholder="6 位验证码"
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
              placeholder="大小写字母 + 数字 + 特殊字符"
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

        <p className="auth-footer">
          已有账号？ <Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
