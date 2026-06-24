import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const { sendCode, resetPassword, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  const handleSendCode = async () => {
    clearError();
    await sendCode({ email: email.trim(), purpose: 'reset' });
    setSubmitted(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await resetPassword({
      identifier: email.trim(),
      email: email.trim(),
      code: code.trim(),
      newPassword,
      captcha: captchaAnswer,
    });
    if (ok) navigate('/login');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">找回密码</h1>
        <p className="auth-subtitle">通过邮箱验证码重置密码</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="reset-email">邮箱</label>
            <div className="auth-inline-control">
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={loading}
                required
              />
              <button type="button" onClick={handleSendCode} disabled={loading || !email.trim()}>
                验证码
              </button>
            </div>
          </div>

          {submitted && <p className="auth-note">操作已提交，请查看邮箱验证码。</p>}

          <div className="auth-form-group">
            <label htmlFor="reset-code">验证码</label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6 位验证码"
              maxLength={8}
              disabled={loading}
              required
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="reset-password">新密码</label>
            <input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
              disabled={loading}
              minLength={6}
              required
            />
          </div>

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
            {loading ? '提交中...' : '重置密码'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
