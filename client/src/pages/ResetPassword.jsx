import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeMessage, setCodeMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const { sendCode, resetPassword, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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
      setFieldErrors({ email: '请先输入邮箱地址' });
      return;
    }
    const ok = await sendCode({ email: email.trim(), purpose: 'reset' });
    if (ok) {
      setCodeSent(true);
      setCountdown(60);
      setCodeMessage('验证码已发送，请查看邮箱');
    } else {
      // sendCode 失败时 error 已在 store 中设置，通过 error 显示
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    setFieldErrors({});

    const errors = {};
    if (!email.trim()) errors.email = '请输入邮箱地址';
    if (!code.trim()) errors.code = '请输入验证码';
    if (!newPassword || newPassword.length < 6) errors.password = '密码至少 6 位';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

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
          {/* 邮箱 */}
          <div className="auth-form-group">
            <label htmlFor="reset-email">邮箱地址</label>
            <input
              id="reset-email"
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

          {/* 新密码 */}
          <div className="auth-form-group">
            <label htmlFor="reset-password">新密码</label>
            <input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => { setNewPassword(event.target.value); clearFieldError('password'); }}
              placeholder="至少 6 位"
              autoComplete="new-password"
              disabled={loading}
              minLength={6}
              className={fieldErrors.password ? 'input-error' : ''}
              required
            />
            {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>

          {/* 验证码 + 获取验证码按钮 */}
          <div className="auth-form-group">
            <label htmlFor="reset-code">邮箱验证码</label>
            <div className="auth-code-row">
              <input
                id="reset-code"
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
