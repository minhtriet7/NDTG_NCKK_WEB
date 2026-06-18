import api, { ROOT_API_URL } from "./api";

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

  verifyEmail: async (token) => {
    return await api.get("/auth/verify-email", {
      params: { token },
    });
  },

  getGoogleLoginUrl: () => {
    return `${ROOT_API_URL}/api/v1/auth/google/login`;
  },
};
