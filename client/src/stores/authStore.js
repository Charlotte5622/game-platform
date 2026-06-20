import { create } from 'zustand';
import api from '../services/api';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  loading: false,
  error: null,

  /**
   * 登录
   */
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/login', { username, password });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.error || '登录失败', loading: false });
      return false;
    }
  },

  /**
   * 注册
   */
  register: async (username, password, nickname) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/api/auth/register', { username, password, nickname });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, user, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.error || '注册失败', loading: false });
      return false;
    }
  },

  /**
   * 登出
   */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },

  /**
   * 更新用户信息（如头像）
   */
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  /**
   * 清除错误
   */
  clearError: () => set({ error: null }),
}));
