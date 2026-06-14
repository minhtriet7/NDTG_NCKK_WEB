import axios from "axios";
import { useAuthStore } from "../store/authStore";

const ROOT_API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
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
  },
  timeout: 180000, // Tăng lên 3 phút vì Debug Playground chạy song song 2 Agent (V1, V2) nên rất lâu
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

api.interceptors.response.use(
  (response) => normalizeApiData(response),
  (error) => {
    if (error?.response?.status === 401) {
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