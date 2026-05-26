import React from "react";
import { Sun, Moon, Globe } from "lucide-react";
import { useAppStore } from "../../store/appStore";

export default function ThemeLangToggle() {
  const appStore = useAppStore();

  const theme = appStore.theme || "light";
  const lang = appStore.lang || "EN";
  const isDark = theme === "dark";

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
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={handleToggleLang}
        className={`flex items-center gap-1.5 px-3 py-2 shadow-sm border rounded-xl text-sm font-bold transition-all duration-200 hover:scale-[1.05] active:scale-95 ${
          isDark
            ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
        title="Toggle language"
      >
        <Globe className="w-4 h-4" />
        {lang}
      </button>

      <button
        type="button"
        onClick={handleToggleTheme}
        className={`flex items-center justify-center p-2 shadow-sm border rounded-xl transition-all duration-200 hover:scale-[1.05] active:scale-95 ${
          isDark
            ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700"
            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
        title="Toggle theme"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}