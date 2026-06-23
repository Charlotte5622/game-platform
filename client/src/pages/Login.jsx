import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SliderCaptcha from '../components/SliderCaptcha';
import AuthLayout from '../components/AuthLayout';
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
    <AuthLayout
      title="登录"
      subtitle="回到你的牌桌和房间"
      footer={
        <div className="flex items-center justify-between">
          <Link to="/reset-password" className="text-muted hover:text-accent transition-colors">忘记密码</Link>
          <span className="text-muted">
            没有账号？ <Link to="/register" className="text-accent font-medium hover:underline underline-offset-4">注册</Link>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">手机号或昵称</span>
          <input
            type="text"
            className="field"
            value={identifier}
            onChange={(event) => { setIdentifier(event.target.value); if (error) clearError(); }}
            placeholder="手机号 / 昵称"
            autoComplete="username"
            maxLength={80}
            disabled={loading}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">密码</span>
          <input
            type="password"
            className="field"
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (error) clearError(); }}
            placeholder="请输入密码"
            autoComplete="current-password"
            disabled={loading}
            required
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[var(--c-accent)]"
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

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-accent w-full py-3 mt-1 text-[15px]"
          disabled={loading || (requiresCaptcha && !captchaAnswer)}
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </AuthLayout>
  );
}
