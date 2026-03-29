import axios from 'axios';
import Constants from 'expo-constants';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
  'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Firebase JWT to every request
api.interceptors.request.use(async (config) => {
  // TODO: import auth from './firebase' and attach token
  // const token = await auth.currentUser?.getIdToken();
  // if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
