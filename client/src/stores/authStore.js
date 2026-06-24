import { create } from 'zustand';
import api, { clearAuthSession, storeAuthSession } from '../services/api';
import { disconnectSocket } from '../services/socket';

const ERROR_TEXT = {
  AUTH_001: '账号或密码输入错误',
  AUTH_101: '尝试次数过多，请 15 分钟后再试',
  AUTH_110: '请先完成滑块验证',
  AUTH_120: '请填写有效联系方式、验证码、昵称，并使用强密码',
  AUTH_121: '验证码无效或已过期',
  AUTH_122: '昵称不可用，请换一个',
  AUTH_130: '头像格式不正确',
  AUTH_131: '昵称至少 2 个字符',
  AUTH_132: '昵称不可用，请换一个',
  AUTH_133: '昵称修改次数已达上限（最多 5 次）',
  AUTH_140: '新密码至少 8 位，需包含大小写字母、数字和特殊字符',
  AUTH_141: '原密码验证未通过',
  AUTH_142: '不能使用最近 5 次用过的密码',
  AUTH_160: '该邮箱未注册',
};

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function friendlyError(err, fallback = '操作未完成，请稍后再试') {
  const code = err.response?.data?.code;
  return ERROR_TEXT[code] || fallback;
}

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token'),
  user: getStoredUser(),
  loading: false,
  error: null,
  captcha: null,
  requiresCaptcha: false,

  login: async (identifier, password, rememberMe = false, captcha = null) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/login', { identifier, username: identifier, password, rememberMe, captcha }, { skipAuthRefresh: true });
      const token = storeAuthSession(res.data);
      set({
        token,
        user: res.data.user,
        loading: false,
        error: null,
        captcha: null,
        requiresCaptcha: false,
      });
      return true;
    } catch (err) {
      set({
        error: friendlyError(err, '登录未完成，请检查信息'),
        loading: false,
        captcha: err.response?.data?.captcha || null,
        requiresCaptcha: Boolean(err.response?.data?.requiresCaptcha),
      });
      return false;
    }
  },

  register: async (payloadOrUsername, password, nickname) => {
    const payload =
      typeof payloadOrUsername === 'object'
        ? payloadOrUsername
        : { phone: payloadOrUsername, password, nickname };
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/register', payload);
      if (!res.data?.token && !res.data?.accessToken) {
        const code = res.data?.code || null;
        set({
          loading: false,
          captcha: res.data?.captcha || null,
          requiresCaptcha: Boolean(res.data?.requiresCaptcha),
        });
        return code || false;
      }
      const token = storeAuthSession(res.data);
      set({
        token,
        user: res.data.user,
        loading: false,
        error: null,
        captcha: null,
        requiresCaptcha: false,
      });
      return true;
    } catch (err) {
      const code = err.response?.data?.code || null;
      set({
        error: friendlyError(err, '注册未完成，请检查信息'),
        loading: false,
        captcha: err.response?.data?.captcha || null,
        requiresCaptcha: Boolean(err.response?.data?.requiresCaptcha),
      });
      return code || false;
    }
  },

  sendCode: async ({ phone, email, purpose = 'register' }) => {
    try {
      await api.post('/api/auth/send-code', { phone, email, purpose });
      set({ error: null });
      return true;
    } catch (err) {
      const code = err.response?.data?.code;
      if (code && ERROR_TEXT[code]) {
        set({ error: ERROR_TEXT[code] });
      }
      return false;
    }
  },

  loadCaptcha: async () => {
    const res = await api.get('/api/auth/captcha');
    set({ captcha: res.data, requiresCaptcha: true });
    return res.data;
  },

  loadMe: async () => {
    try {
      const res = await api.get('/api/auth/me');
      localStorage.setItem('user', JSON.stringify(res.data.user));
      set({ user: res.data.user, token: localStorage.getItem('token') });
      return res.data.user;
    } catch {
      return null;
    }
  },

  changePassword: async (oldPassword, newPassword) => {
    set({ loading: true, error: null });
    try {
      await api.post('/api/auth/change-password', { oldPassword, newPassword }, { skipAuthRefresh: true });
      disconnectSocket();
      clearAuthSession();
      set({ token: null, user: null, loading: false });
      return true;
    } catch (err) {
      set({ error: friendlyError(err, '修改密码失败'), loading: false });
      return false;
    }
  },

  resetPassword: async ({ identifier, phone, email, code, newPassword, captcha }) => {
    set({ loading: true, error: null });
    try {
      await api.post('/api/auth/reset-password', { identifier, phone, email, code, newPassword, captcha });
      set({ loading: false, captcha: null, requiresCaptcha: false });
      return true;
    } catch (err) {
      set({
        error: friendlyError(err, '重置未完成，请检查信息'),
        loading: false,
        captcha: err.response?.data?.captcha || null,
        requiresCaptcha: Boolean(err.response?.data?.requiresCaptcha),
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // local cleanup still happens
    }
    disconnectSocket();
    clearAuthSession();
    set({ token: null, user: null, error: null, captcha: null, requiresCaptcha: false });
  },

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  syncFromStorage: () => {
    set({ token: localStorage.getItem('token'), user: getStoredUser() });
  },

  clearError: () => set({ error: null }),
}));
