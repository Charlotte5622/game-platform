import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import AuthLayout from '../components/AuthLayout';
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

  const segBtn = (active) =>
    `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]' : 'text-muted hover:text-text'
    }`;

  return (
    <AuthLayout
      title="找回密码"
      subtitle="使用验证码设置新密码"
      footer={<Link to="/login" className="text-accent font-medium hover:underline underline-offset-4">返回登录</Link>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-1 p-1 rounded-lg bg-black/30 border border-line" role="tablist" aria-label="找回方式">
          <button type="button" className={segBtn(method === 'phone')} onClick={() => setMethod('phone')}>手机号</button>
          <button type="button" className={segBtn(method === 'email')} onClick={() => setMethod('email')}>邮箱</button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">{method === 'phone' ? '手机号' : '邮箱'}</span>
          <div className="flex gap-2">
            <input
              type={method === 'phone' ? 'tel' : 'email'} className="field flex-1"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={method === 'phone' ? '请输入手机号' : 'name@example.com'}
              disabled={loading} required
            />
            <button type="button" className="btn-ghost px-4 whitespace-nowrap text-sm" onClick={handleSendCode} disabled={loading || !contact.trim()}>
              验证码
            </button>
          </div>
        </label>

        {submitted && (
          <p className="text-sm text-accent bg-accent/10 border border-accent/25 rounded-lg px-3 py-2">操作已提交,请查看验证码。</p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">验证码</span>
          <input
            type="text" inputMode="numeric" className="field"
            value={code} onChange={(event) => setCode(event.target.value)}
            placeholder="6 位验证码" maxLength={8} disabled={loading} required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">新密码</span>
          <input
            type="password" className="field"
            value={newPassword} onChange={(event) => setNewPassword(event.target.value)}
            placeholder="大小写字母 + 数字 + 特殊字符" autoComplete="new-password" minLength={8} disabled={loading} required
          />
        </label>

        {requiresCaptcha && (
          <SliderCaptcha challenge={captcha} disabled={loading} onSolved={setCaptchaAnswer} onReload={loadCaptcha} />
        )}

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2" role="alert">{error}</p>
        )}

        <button type="submit" className="btn-accent w-full py-3 mt-1 text-[15px]" disabled={loading || (requiresCaptcha && !captchaAnswer)}>
          {loading ? '提交中…' : '提交'}
        </button>
      </form>
    </AuthLayout>
  );
}
