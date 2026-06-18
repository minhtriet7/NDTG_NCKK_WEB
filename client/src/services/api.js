import axios from "axios";
import { useAuthStore } from "../store/authStore";

const normalizeRootApiUrl = (value) => {
  const url = String(value || "").trim().replace(/\/+$/, "");

  return url.replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
};

const ROOT_API_URL =
  normalizeRootApiUrl(import.meta.env.VITE_API_BASE_URL) ||
  normalizeRootApiUrl(import.meta.env.VITE_API_URL) ||
  "http://localhost:8000";

const API_BASE_URL = `${ROOT_API_URL}/api/v1`;

function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const getStoredToken = () => {
  const zustandToken = useAuthStore.getState()?.token;

  const authStorage = safeParseJSON(localStorage.getItem("auth-storage"));
  const tokenFromStorage = authStorage?.state?.token;

  return (
    zustandToken ||
    tokenFromStorage ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    ""
  );
};

export const normalizeApiData = (response) => {
  const data = response?.data ?? response;

  if (data && typeof data === "object" && "success" in data && "data" in data) {
    return data.data;
  }

  return data;
};

export const normalizeList = (response) => {
  const data = normalizeApiData(response);

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rates)) return data.rates;

  return [];
};

export const normalizeError = (error, fallback = "Có lỗi xảy ra.") => {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "69420",
  },
  timeout: 180000, 
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => normalizeApiData(response),
  async (error) => {
    const originalRequest = error.config;

    if (error?.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      if (isRefreshing) {
        try {
          const token = await new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const authState = useAuthStore.getState();
      const refreshToken = authState?.refreshToken || localStorage.getItem("refresh_token");

      if (!refreshToken) {
        processQueue(error, null);
        isRefreshing = false;
        try { authState.logout(); } catch (e) {}
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
        const newAccessToken = data?.access_token || data?.data?.access_token;
        const newRefreshToken = data?.refresh_token || data?.data?.refresh_token;

        if (newAccessToken) {
          useAuthStore.setState({ token: newAccessToken, refreshToken: newRefreshToken || refreshToken });
          processQueue(null, newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } else {
          throw new Error("No access token returned");
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        try { authState.logout(); } catch (e) {}
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error?.response?.status === 401 && originalRequest.url !== '/auth/refresh' && !isRefreshing) {
      try {
        useAuthStore.getState().logout();
      } catch {
        // ignore
      }
    }

    return Promise.reject(error);
  }
);

export { ROOT_API_URL, API_BASE_URL };
export default api;
