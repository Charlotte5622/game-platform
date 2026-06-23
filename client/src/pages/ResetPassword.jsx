import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import { useAuthStore } from '../stores/authStore';

export default function ResetPassword() {
  const [method, setMethod] = useState('phone');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const { sendCode, resetPassword, loading, error, clearError, captcha, requiresCaptcha, loadCaptcha } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (requiresCaptcha && !captcha) loadCaptcha();
  }, [requiresCaptcha, captcha, loadCaptcha]);

  const payload = method === 'phone' ? { phone: contact.trim() } : { email: contact.trim() };

  const handleSendCode = async () => {
    clearError();
    await sendCode({ ...payload, purpose: 'reset' });
    setSubmitted(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await resetPassword({
      ...payload,
      identifier: contact.trim(),
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
        <p className="auth-subtitle">使用验证码设置新密码</p>

        <form onSubmit={handleSubmit}>
          <div className="auth-segment" role="tablist" aria-label="找回方式">
            <button type="button" className={method === 'phone' ? 'active' : ''} onClick={() => setMethod('phone')}>
              手机号
            </button>
            <button type="button" className={method === 'email' ? 'active' : ''} onClick={() => setMethod('email')}>
              邮箱
            </button>
          </div>

          <div className="auth-form-group">
            <label htmlFor="reset-contact">{method === 'phone' ? '手机号' : '邮箱'}</label>
            <div className="auth-inline-control">
              <input
                id="reset-contact"
                type={method === 'phone' ? 'tel' : 'email'}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={method === 'phone' ? '请输入手机号' : 'name@example.com'}
                disabled={loading}
                required
              />
              <button type="button" onClick={handleSendCode} disabled={loading || !contact.trim()}>
                验证码
              </button>
            </div>
          </div>

          {submitted && <p className="auth-note">操作已提交，请查看验证码。</p>}

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
              placeholder="大小写字母 + 数字 + 特殊字符"
              autoComplete="new-password"
              disabled={loading}
              minLength={8}
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
            {loading ? '提交中...' : '提交'}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
