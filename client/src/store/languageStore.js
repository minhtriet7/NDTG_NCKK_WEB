import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useLanguageStore = create(
  persist(
    (set) => ({
      lang: "EN",

      setLanguage: (newLang) => set({ lang: newLang }),

      toggleLanguage: () =>
        set((state) => ({
          lang: state.lang === "EN" ? "VI" : "EN",
        })),
    }),
    {
      name: "app-language",
      storage: createJSONStorage(() => localStorage),
    }
  )
);