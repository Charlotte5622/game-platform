import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function Security() {
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const { changePassword, loading, error, clearError } = useAuthStore();

  const loadDevices = async () => {
    setLoadingDevices(true);
    try {
      const res = await api.get('/api/auth/devices');
      setDevices(res.data.devices || []);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const revokeDevice = async (id) => {
    await api.delete(`/api/auth/devices/${id}`);
    await loadDevices();
  };

  const handlePassword = async (event) => {
    event.preventDefault();
    clearError();
    const ok = await changePassword(oldPassword, newPassword);
    if (ok) setMessage('密码已修改，请重新登录。');
  };

  return (
    <div className="security-page">
      <section className="security-section">
        <div className="security-section-head">
          <h1>账号安全</h1>
          <button type="button" onClick={loadDevices} disabled={loadingDevices}>
            刷新
          </button>
        </div>

        <div className="device-list">
          {devices.map((device) => (
            <article className="device-item" key={device.id}>
              <div>
                <strong>{device.deviceName}</strong>
                <p>{device.userAgent || '未知浏览器'}</p>
                <span>{new Date(device.createdAt).toLocaleString()}</span>
              </div>
              {device.current ? (
                <span className="device-current">当前设备</span>
              ) : (
                <button type="button" onClick={() => revokeDevice(device.id)}>
                  踢出
                </button>
              )}
            </article>
          ))}
          {!devices.length && <p className="auth-note">暂无设备记录。</p>}
        </div>
      </section>

      <section className="security-section">
        <h2>修改密码</h2>
        <form className="security-form" onSubmit={handlePassword}>
          <label>
            <span>原密码</span>
            <input
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-note">{message}</p>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '提交中...' : '修改密码'}
          </button>
        </form>
      </section>
    </div>
  );
}
