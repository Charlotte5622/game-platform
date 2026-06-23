import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const token = params.get('token');

    if (token) {
      localStorage.setItem('token', token);
      window.history.replaceState(null, '', window.location.pathname);
      api.get('/api/auth/me').then(res => {
        const user = res.data.user;
        localStorage.setItem('user', JSON.stringify(user));
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/lobby', { replace: true });
      }).catch(() => {
        navigate('/login?error=session_failed', { replace: true });
      });
    } else {
      const searchParams = new URLSearchParams(window.location.search);
      const error = searchParams.get('error');
      navigate(`/login${error ? `?error=${error}` : ''}`, { replace: true });
    }
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#e2e8f0', background: '#0f0f23' }}>
      <div style={{ textAlign: 'center' }}>
        <h2>正在登录...</h2>
        <p style={{ color: '#94a3b8' }}>正在完成 GitHub 授权，请稍候</p>
      </div>
    </div>
  );
}
