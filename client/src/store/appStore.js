import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAppStore = create(
  persist(
    (set, get) => ({
      theme: "light",
      lang: "EN",

      setTheme: (theme) => {
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }

        set({ theme });
      },

      toggleTheme: () => {
        const newTheme = get().theme === "light" ? "dark" : "light";
        get().setTheme(newTheme);
      },

      setLang: (lang) => set({ lang }),
      toggleLang: () =>
        set((state) => ({
          lang: state.lang === "EN" ? "VI" : "EN",
        })),

      initTheme: () => {
        const { theme } = get();

        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      },

      currentScanSession: null,
      setScanSession: (data) => set({ currentScanSession: data }),
      clearScanSession: () => set({ currentScanSession: null }),
    }),
    {
      name: "app-settings",
      partialize: (state) => ({
        theme: state.theme,
        lang: state.lang,
      }),
    }
  )
);