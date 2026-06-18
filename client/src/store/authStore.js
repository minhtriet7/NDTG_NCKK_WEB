import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getMe } from "../services/userService";

export function getUserAvatar(user) {
  const value =
    user?.avatar_url ||
    user?.avatar ||
    user?.profile_image ||
    user?.picture ||
    user?.photoURL ||
    user?.user?.avatar_url ||
    user?.user?.avatar ||
    user?.user?.profile_image ||
    user?.user?.picture ||
    user?.user?.photoURL ||
    "";

  return typeof value === "string" ? value.trim() : "";
}

export function getAvatarImageSrc(user) {
  const avatarUrl = getUserAvatar(user);

  if (!avatarUrl) return "";

  const version =
    user?.avatar_updated_at ||
    user?.updated_at ||
    user?.updatedAt ||
    user?.user?.updated_at ||
    user?.user?.updatedAt ||
    "";

  if (!version) return avatarUrl;

  const separator = avatarUrl.includes("?") ? "&" : "?";
  return `${avatarUrl}${separator}v=${encodeURIComponent(version)}`;
}

function normalizeUserAvatarFields(user) {
  if (!user) return user;

  const avatarUrl = getUserAvatar(user);

  if (!avatarUrl) return user;

  return {
    ...user,
    avatar: avatarUrl,
    avatar_url: avatarUrl,
  };
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (userData, token, refreshToken) =>
        set({
          user: normalizeUserAvatarFields(userData),
          token,
          refreshToken,
          isAuthenticated: true,
        }),

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");

        set({
          user: null,
          token: null,
          refreshToken: null,
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
          user: normalizeUserAvatarFields(
            state.user
              ? {
                  ...state.user,
                  ...payload,
                }
              : payload,
          ),
        })),

      syncProfile: async () => {
        const { token } = get();

        if (!token) return null;

        try {
          const profile = await getMe();

          set({
            user: normalizeUserAvatarFields(profile),
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
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
