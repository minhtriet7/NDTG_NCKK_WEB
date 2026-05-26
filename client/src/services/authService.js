import api from "./api";

export const authService = {
  login: async (email, password) => {
    return await api.post("/auth/login", {
      email,
      password,
    });
  },

  register: async (full_name, email, password) => {
    return await api.post("/auth/register", {
      full_name,
      email,
      password,
    });
  },

  forgotPassword: async (email) => {
    return await api.post("/auth/forgot-password", { email });
  },

  getGoogleLoginUrl: () => {
    const root =
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      "http://localhost:8000";

    return `${root}/api/v1/auth/google/login`;
  },
};