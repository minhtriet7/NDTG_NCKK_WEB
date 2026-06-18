import { useTranslation } from "react-i18next";
import { Sun, Moon, Globe } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useLanguageStore } from "../../store/languageStore";

export default function ThemeLangToggle() {
  const appStore = useAppStore();
  const { i18n } = useTranslation();

  const theme = appStore.theme || "light";
  const lang = appStore.lang || "EN";
  const isDark = (appStore.resolvedTheme || theme) === "dark";

  const handleToggleTheme = () => {
    if (typeof appStore.toggleTheme === "function") {
      appStore.toggleTheme();
      return;
    }

    const nextTheme = isDark ? "light" : "dark";

    if (typeof appStore.setTheme === "function") {
      appStore.setTheme(nextTheme);
    } else {
      useAppStore.setState({ theme: nextTheme });
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
    }
  };

  const handleToggleLang = () => {
    const nextLang = lang === "EN" ? "VI" : "EN";

    if (typeof appStore.toggleLang === "function") {
      appStore.toggleLang();
    } else if (typeof appStore.setLang === "function") {
      appStore.setLang(nextLang);
    } else if (typeof appStore.setLanguage === "function") {
      appStore.setLanguage(nextLang);
    } else {
      useAppStore.setState({ lang: nextLang });
    }

    // Synchronize with the secondary language store used by Result/History pages
    if (typeof useLanguageStore.getState().setLanguage === "function") {
      useLanguageStore.getState().setLanguage(nextLang);
    }

    if (i18n && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(nextLang.toLowerCase());
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-2xl border p-1 shadow-sm ${
        isDark
          ? "border-slate-700/80 bg-slate-900/80"
          : "border-slate-200/80 bg-white/75"
      }`}
    >
      <button
        type="button"
        onClick={handleToggleLang}
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-black transition-all duration-200 active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
          isDark
            ? "text-slate-200 hover:bg-slate-800 hover:text-cyan-300"
            : "text-slate-600 hover:bg-slate-100 hover:text-indigo-600"
        }`}
        title="Toggle language"
      >
        <Globe className="w-4 h-4" />
        {lang}
      </button>

      <button
        type="button"
        onClick={handleToggleTheme}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
          isDark
            ? "bg-amber-400/10 text-amber-300 hover:bg-amber-400/15"
            : "text-slate-600 hover:bg-slate-100 hover:text-indigo-600"
        }`}
        title="Toggle theme"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}
