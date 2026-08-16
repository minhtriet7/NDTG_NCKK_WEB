import { create } from "zustand";
import { persist } from "zustand/middleware";

let systemThemeCleanup = null;

function normalizeTheme(theme) {
  return ["light", "dark", "system"].includes(theme) ? theme : "light";
}

function normalizeLang(lang) {
  const str = String(lang || "").trim().toUpperCase();
  return str === "VI" ? "VI" : "EN";
}

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme) {
  const normalized = normalizeTheme(theme);
  return normalized === "system" ? getSystemTheme() : normalized;
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  const resolvedTheme = resolveTheme(normalizedTheme);

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("theme", normalizedTheme);
  }

  return resolvedTheme;
}

function unsubscribeSystemTheme() {
  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }
}

function subscribeSystemTheme(onChange) {
  unsubscribeSystemTheme();

  if (typeof window === "undefined" || !window.matchMedia) {
    return;
  }

  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => onChange();

  if (query.addEventListener) {
    query.addEventListener("change", listener);
    systemThemeCleanup = () => query.removeEventListener("change", listener);
  } else if (query.addListener) {
    query.addListener(listener);
    systemThemeCleanup = () => query.removeListener(listener);
  }
}

function getInitialLanguage() {
  if (typeof localStorage === "undefined") return "EN";
  try {
    const legacyRaw = localStorage.getItem("app-language");
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      const legacyLang = parsed && (parsed.lang || (parsed.state && parsed.state.lang));
      localStorage.removeItem("app-language");
      if (legacyLang) return normalizeLang(legacyLang);
    }
  } catch {
    /* ignore storage parse errors */
  }

  return "EN";
}

export const useAppStore = create(
  persist(
    (set, get) => ({
      theme: "light",
      resolvedTheme: "light",
      lang: getInitialLanguage(),

      setTheme: (theme) => {
        const nextTheme = normalizeTheme(theme);
        const resolvedTheme = applyTheme(nextTheme);
        const current = get();

        if (nextTheme === "system") {
          subscribeSystemTheme(() => {
            if (get().theme !== "system") return;
            const nextResolvedTheme = applyTheme("system");
            if (get().resolvedTheme !== nextResolvedTheme) {
              set({ resolvedTheme: nextResolvedTheme });
            }
          });
        } else {
          unsubscribeSystemTheme();
        }

        if (
          current.theme !== nextTheme ||
          current.resolvedTheme !== resolvedTheme
        ) {
          set({ theme: nextTheme, resolvedTheme });
        }
      },

      toggleTheme: () => {
        const currentTheme = get().resolvedTheme || resolveTheme(get().theme);
        const newTheme = currentTheme === "light" ? "dark" : "light";
        get().setTheme(newTheme);
      },

      setLang: (lang) => set({ lang: normalizeLang(lang) }),
      toggleLang: () =>
        set((state) => ({
          lang: state.lang === "EN" ? "VI" : "EN",
        })),

      initTheme: () => {
        const storedTheme =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("theme")
            : null;
        const theme = normalizeTheme(storedTheme || get().theme);
        const resolvedTheme = applyTheme(theme);
        const current = get();

        if (theme === "system") {
          subscribeSystemTheme(() => {
            if (get().theme !== "system") return;
            const nextResolvedTheme = applyTheme("system");
            if (get().resolvedTheme !== nextResolvedTheme) {
              set({ resolvedTheme: nextResolvedTheme });
            }
          });
        } else {
          unsubscribeSystemTheme();
        }

        if (current.theme !== theme || current.resolvedTheme !== resolvedTheme) {
          set({ theme, resolvedTheme });
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
