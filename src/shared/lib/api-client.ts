import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const persisted = localStorage.getItem('shop-live-store');
  let token = localStorage.getItem('accessToken');

  if (!token && persisted) {
    try {
      const parsed = JSON.parse(persisted) as { state?: { accessToken?: string | null } };
      token = parsed.state?.accessToken ?? null;
    } catch {
      token = null;
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
