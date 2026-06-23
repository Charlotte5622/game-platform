import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import AuthLayout from '../components/AuthLayout';
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

  const segBtn = (active) =>
    `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]' : 'text-muted hover:text-text'
    }`;

  return (
    <AuthLayout
      title="注册"
      subtitle="创建账号后直接进入大厅"
      footer={
        <span className="text-muted">
          已有账号？ <Link to="/login" className="text-accent font-medium hover:underline underline-offset-4">登录</Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-1 p-1 rounded-lg bg-black/30 border border-line" role="tablist" aria-label="注册方式">
          <button type="button" className={segBtn(method === 'phone')} onClick={() => setMethod('phone')}>手机号</button>
          <button type="button" className={segBtn(method === 'email')} onClick={() => setMethod('email')}>邮箱</button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">{method === 'phone' ? '手机号' : '邮箱'}</span>
          <div className="flex gap-2">
            <input
              type={method === 'phone' ? 'tel' : 'email'}
              className="field flex-1"
              value={contact}
              onChange={(event) => { setContact(event.target.value); setCodeSent(false); if (error) clearError(); }}
              placeholder={method === 'phone' ? '请输入手机号' : 'name@example.com'}
              autoComplete={method === 'phone' ? 'tel' : 'email'}
              maxLength={120}
              disabled={loading}
              required
            />
            <button type="button" className="btn-ghost px-4 whitespace-nowrap text-sm" onClick={handleSendCode} disabled={loading || !contact.trim()}>
              {codeSent ? '已发送' : '验证码'}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">验证码</span>
          <input
            type="text" inputMode="numeric" className="field"
            value={code}
            onChange={(event) => { setCode(event.target.value); if (error) clearError(); }}
            placeholder="6 位验证码" autoComplete="one-time-code" maxLength={8} disabled={loading} required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">昵称</span>
          <input
            type="text" className="field"
            value={nickname}
            onChange={(event) => { setNickname(event.target.value); if (error) clearError(); }}
            placeholder="2-20 个字符" autoComplete="nickname" maxLength={20} disabled={loading} required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">密码</span>
          <input
            type="password" className="field"
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (error) clearError(); }}
            placeholder="大小写字母 + 数字 + 特殊字符" autoComplete="new-password" minLength={8} disabled={loading} required
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 accent-[var(--c-accent)]" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={loading} />
          <span>记住我</span>
        </label>

        {requiresCaptcha && (
          <SliderCaptcha challenge={captcha} disabled={loading} onSolved={setCaptchaAnswer} onReload={loadCaptcha} />
        )}

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2" role="alert">{error}</p>
        )}

        <button type="submit" className="btn-accent w-full py-3 mt-1 text-[15px]" disabled={loading || (requiresCaptcha && !captchaAnswer)}>
          {loading ? '注册中…' : '注册并登录'}
        </button>
      </form>
    </AuthLayout>
  );
}
