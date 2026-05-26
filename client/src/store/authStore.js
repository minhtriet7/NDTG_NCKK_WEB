import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getMe } from "../services/userService";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (userData, token) =>
        set({
          user: userData,
          token,
          isAuthenticated: true,
        }),

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");

        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      updateTokenBalance: (newBalance) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                token_balance: newBalance,
              }
            : null,
        })),

      updateUser: (payload) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                ...payload,
              }
            : payload,
        })),

      syncProfile: async () => {
        const { token } = get();

        if (!token) return null;

        try {
          const profile = await getMe();

          set({
            user: profile,
            isAuthenticated: true,
          });

          return profile;
        } catch (error) {
          console.error("Lỗi đồng bộ Profile:", error);

          if (error?.response?.status === 401) {
            get().logout();
          }

          return null;
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);