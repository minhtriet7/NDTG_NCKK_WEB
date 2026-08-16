import { Sun, Moon, Globe } from "lucide-react";
import { useAppStore } from "../../store/appStore";

export default function ThemeLangToggle() {
  const theme = useAppStore((state) => state.theme) || "light";
  const lang = useAppStore((state) => state.lang) || "EN";
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const toggleLang = useAppStore((state) => state.toggleLang);

  const isDark = (resolvedTheme || theme) === "dark";

  const handleToggleTheme = () => {
    toggleTheme();
  };

  const handleToggleLang = () => {
    toggleLang();
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
