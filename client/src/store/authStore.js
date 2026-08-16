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

  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "undefined" || trimmed === "none") return "";
  return trimmed;
}

export function isUserAdmin(user) {
  if (!user) return false;
  const role = String(
    user?.role?.name ||
      user?.role ||
      user?.user_role ||
      user?.user?.role ||
      (user?.is_admin ? "admin" : "")
  ).trim().toLowerCase();

  return ["admin", "administrator", "super_admin", "superadmin"].includes(role);
}

export function getAdminInitials(user) {
  const nameStr = String(
    user?.full_name ||
      user?.name ||
      user?.display_name ||
      user?.email?.split("@")[0] ||
      "Admin"
  ).trim();

  const parts = nameStr.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return String(parts[0]?.[0] || "A").toUpperCase();
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
