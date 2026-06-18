import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const ok = await register(username, password, nickname);
    if (ok) navigate('/lobby');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>📝 注册</h1>
        <p style={styles.subtitle}>创建账号，开始游戏</p>

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-20 个字符"
              style={styles.input}
              required
              minLength={3}
              maxLength={20}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="其他玩家看到的名字"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 个字符"
              style={styles.input}
              required
              minLength={6}
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p style={styles.footer}>
          已有账号？ <Link to="/login">立即登录</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: 'calc(100vh - 64px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '40px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: 'var(--shadow)',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '8px',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    marginBottom: '32px',
    fontSize: '14px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
  },
  error: {
    color: 'var(--danger)',
    fontSize: '13px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '16px',
    fontWeight: '700',
    marginTop: '8px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '24px',
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
};
