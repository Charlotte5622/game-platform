import axios from 'axios';

const api = axios.create({
  baseURL: '',
  timeout: 10000,
  withCredentials: true,
});

let refreshPromise = null;

export function getStoredToken() {
  return localStorage.getItem('token');
}

export function storeAuthSession({ token, accessToken, user }) {
  const nextToken = accessToken || token;
  if (nextToken) localStorage.setItem('token', nextToken);
  if (user) localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new CustomEvent('auth:updated', { detail: { token: nextToken, user } }));
  return nextToken;
}

export function clearAuthSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth:logout'));
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/refresh', {}, { withCredentials: true, timeout: 10000 })
      .then((res) => {
        const token = storeAuthSession(res.data || {});
        if (!token) throw new Error('missing access token');
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const original = error.config || {};

    if (status === 401 && !original._retry && !original.skipAuthRefresh) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        clearAuthSession();
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
