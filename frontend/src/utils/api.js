import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    // 403 with the deactivation message means the account was disabled mid-session —
    // treat it like a 401 so the user is logged out and bounced to /login.
    const isDeactivated =
      status === 403 && /inactive|deactivated/i.test(err.response?.data?.message || '');
    if (status === 401 || isDeactivated) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Use React Router navigation instead of hard redirect to avoid reload loops.
      // AuthContext will set user=null and ProtectedRoute will redirect to /login.
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    return Promise.reject(err);
  }
);
export default api;
