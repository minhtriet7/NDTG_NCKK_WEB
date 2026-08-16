import React, { useMemo, useState, useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, getAvatarImageSrc, getAdminInitials } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { useTranslation } from "react-i18next";
import { 
  LayoutDashboard, Users, Coins, Settings, LogOut, FileImage, 
  ArrowRightLeft, MessageSquare, Terminal, Landmark, Cpu, 
  BotMessageSquare, SearchCheck, GitMerge, FileText, Sun, Moon, Globe, Home, User as UserIcon, Menu, X, ChevronRight, Shield, FlaskConical
} from "lucide-react";
import SEO from "../components/SEO";

function Box(props) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>; }

const EXPERIMENTS_ENABLED =
  String(import.meta.env.VITE_ENABLE_EXPERIMENT_PAGE ?? "true").toLowerCase() !==
  "false";

function isSafeAvatarUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "none") return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  );
}

function AdminUserSidebarAvatar({ user }) {
  const avatarSrc = getAvatarImageSrc(user);
  const [imgFailed, setImgFailed] = useState(false);
  const initials = getAdminInitials(user);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarSrc]);

  if (avatarSrc && isSafeAvatarUrl(avatarSrc) && !imgFailed) {
    return (
      <img
        src={avatarSrc}
        alt={user?.full_name || user?.name || "Admin avatar"}
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className="inline-flex h-full w-full items-center justify-center font-black text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60"
      aria-label={`Avatar for ${user?.full_name || user?.email || "Admin"}`}
    >
      {initials}
    </span>
  );
}

export default function AdminLayout() {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { t } = useTranslation();

  const lang = useAppStore((state) => state.lang || "EN");
  const theme = useAppStore((state) => state.theme || "light");
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const toggleLang = useAppStore((state) => state.toggleLang);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const isDark = (resolvedTheme || theme) === "dark";

  const handleLogout = () => {
    logout();
    navigate("/auth/admin-login", { replace: true });
  };

  const navGroups = useMemo(() => [
    {
      title: t("admin.nav.overviewGroup"),
      items: [
        { name: t("admin.nav.dashboard"), icon: LayoutDashboard, path: "/admin/dashboard" },
      ]
    },
    {
      title: t("admin.nav.usersGroup"),
      items: [
        { name: t("admin.nav.users"), icon: Users, path: "/admin/users" },
        { name: t("admin.nav.tokenPackages"), icon: Coins, path: "/admin/token-packages" },
        { name: t("admin.nav.transactions"), icon: ArrowRightLeft, path: "/admin/transactions" },
        { name: t("admin.nav.feedbacks"), icon: MessageSquare, path: "/admin/feedbacks" },
      ]
    },
    {
      title: t("admin.nav.recognitionGroup"),
      items: [
        { name: t("admin.nav.results"), icon: Terminal, path: "/admin/results" },
        ...(EXPERIMENTS_ENABLED
          ? [{ name: t("admin.nav.experiments"), icon: FlaskConical, path: "/admin/experiments" },
             { name: "Benchmark Metrics", icon: FlaskConical, path: "/admin/benchmark-metrics" }]
          : []),
        { name: t("admin.nav.banknotes"), icon: FileImage, path: "/admin/banknotes" },
        { name: t("admin.nav.currencyRates"), icon: Landmark, path: "/admin/currency-rates" },
      ]
    },
    {
      title: t("admin.nav.agentsGroup"),
      items: [
        { name: t("admin.nav.agentsManager"), icon: Cpu, path: "/admin/agents" },
        { name: t("admin.nav.agentsConfig"), icon: Settings, path: "/admin/agents/config" },
        { name: "AG1 OpenAI/GPT Vision", icon: Box, path: "/admin/agents/ai-model" },
        { name: "AG2 Gemini/LLM", icon: BotMessageSquare, path: "/admin/agents/llm" },
        { name: "AG3 Google Lens/Visual Search", icon: SearchCheck, path: "/admin/agents/google-lens" },
        { name: "AG3 Isolated Test", icon: SearchCheck, path: "/admin/ag3-test" },
        { name: t("admin.nav.aggregator"), icon: GitMerge, path: "/admin/agents/aggregator" },
      ]
    },
    {
      title: t("admin.nav.systemGroup"),
      items: [
        { name: t("admin.nav.systemLogs"), icon: FileText, path: "/admin/logs" },
        { name: t("admin.nav.settings"), icon: Settings, path: "/admin/settings" },
        { name: t("admin.nav.contentManager"), icon: FileText, path: "/admin/pages" },
      ]
    }
  ], [t]);

  // Find current page name for Breadcrumb
  const currentPage = useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (location.pathname === item.path || location.pathname.startsWith(item.path + '/')) {
          return item.name;
        }
      }
    }
    return t("admin.panel");
  }, [t, location.pathname, navGroups]);

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      <SEO title={currentPage} noindex={true} />
      
      {/* OVERLAY MOBILE */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] flex-shrink-0 flex flex-col border-r transition-all duration-300 lg:static lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} ${isDark ? "bg-gradient-to-b from-slate-950 to-slate-900 border-slate-800 text-slate-300" : "bg-white border-slate-200 text-slate-700"}`}>
        <div className={`h-[72px] flex items-center justify-between px-6 border-b shrink-0 ${isDark ? "border-slate-800/60" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950">
              <Shield size={18} className="fill-current" />
            </div>
            <span className="font-black text-xl tracking-tight text-slate-900 dark:text-white">
              Banknote<span className="text-teal-400">Admin</span>
            </span>
          </div>
          <button
            className="lg:hidden p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
            aria-label={t("admin.panel")}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className={`px-6 py-5 border-b flex items-center gap-3 ${isDark ? "border-slate-800/60" : "border-slate-200"}`}>
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
            <AdminUserSidebarAvatar user={user} />
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.full_name || user?.name || t("admin.adminUser")}</p>
            <p className="text-xs text-teal-400 font-mono truncate">{user?.email || "admin@system.local"}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {navGroups.map((group, idx) => (
            <div key={idx}>
              <h3 className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path + '/') && item.path !== '/admin');
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
                        isActive
                          ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/5 text-teal-400"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                      }`}
                    >
                      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-teal-500 rounded-r-full shadow-[0_0_10px_rgba(20,184,166,0.5)]" />}
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        
        {/* TOPBAR */}
        <header className={`h-[72px] flex-shrink-0 flex items-center justify-between px-4 lg:px-6 border-b transition-colors z-20 ${isDark ? "bg-slate-900/50 border-slate-800 backdrop-blur-md" : "bg-white/80 border-slate-200 backdrop-blur-md"}`}>
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              onClick={() => setIsSidebarOpen(true)}
              aria-label={t("admin.panel")}
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">{t("admin.panel")}</span>
              <ChevronRight size={14} className="hidden sm:block" />
              <span className="text-teal-600 dark:text-teal-400">{currentPage}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => navigate("/")}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition ${isDark ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"}`}
              title={t("admin.userApp")}
            >
              <Home size={16} /> <span className="hidden sm:inline">{t("admin.userApp")}</span>
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

            <button
              onClick={toggleLang}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition font-bold text-sm ${isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`}
              title={t("admin.changeLanguage")}
            >
              <Globe size={16} /> {lang}
            </button>

            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg border transition ${isDark ? "border-slate-700 bg-slate-800 text-amber-400 hover:text-amber-300" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`}
              title={t("admin.changeTheme")}
              aria-label={t("admin.changeTheme")}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>

            <button
              onClick={handleLogout}
              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition ml-1"
              title={t("admin.logout")}
              aria-label={t("admin.logout")}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle dot background pattern — dark only */}
          <div className={`absolute inset-0 pointer-events-none opacity-[0.03] ${isDark ? 'bg-[url("https://www.transparenttextures.com/patterns/cubes.png")]' : ''}`}></div>
          <div className="relative z-10 p-4 md:p-6 xl:p-8 animate-[fadeInUp_0.3s_ease-out]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
