import React, { useMemo, useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { useLanguageStore } from "../store/languageStore";
import { 
  LayoutDashboard, Users, Coins, Settings, LogOut, FileImage, 
  ArrowRightLeft, MessageSquare, Terminal, Landmark, Cpu, 
  BotMessageSquare, SearchCheck, GitMerge, FileText, Sun, Moon, Globe, Home, User as UserIcon, Menu, X, ChevronRight, Shield
} from "lucide-react";
import SEO from "../components/SEO";

function Box(props) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>; }

export default function AdminLayout() {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { i18n } = useTranslation();
  
  const lang = useAppStore((state) => state.lang || "EN");
  const theme = useAppStore((state) => state.theme || "light");
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const initTheme = useAppStore((state) => state.initTheme);
  const setLang = useAppStore((state) => state.setLang);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const isDark = (resolvedTheme || theme) === "dark";

  useEffect(() => {
    if (typeof initTheme === "function") {
      initTheme();
    }
  }, [initTheme]);

  useEffect(() => {
    if (i18n && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(lang.toLowerCase());
    }
    if (typeof useLanguageStore.getState().setLanguage === "function") {
      useLanguageStore.getState().setLanguage(lang);
    }
  }, [lang, i18n]);

  const handleLogout = () => {
    logout();
    navigate("/auth/admin-login", { replace: true });
  };

  const toggleLanguage = () => {
    const nextLang = lang === "EN" ? "VI" : "EN";
    if (typeof setLang === "function") {
      setLang(nextLang);
    } else {
      useAppStore.setState({ lang: nextLang });
    }

    if (typeof useLanguageStore.getState().setLanguage === "function") {
      useLanguageStore.getState().setLanguage(nextLang);
    }

    if (i18n && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(nextLang.toLowerCase());
    }
  };

  const navGroups = useMemo(() => [
    {
      title: lang === "VI" ? "Tổng Quan" : "Overview",
      items: [
        { name: lang === "VI" ? "Bảng Điều Khiển" : "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
      ]
    },
    {
      title: lang === "VI" ? "Người dùng & Thanh toán" : "User & Payments",
      items: [
        { name: lang === "VI" ? "Người dùng" : "Users", icon: Users, path: "/admin/users" },
        { name: lang === "VI" ? "Gói Token" : "Token Packages", icon: Coins, path: "/admin/token-packages" },
        { name: lang === "VI" ? "Giao dịch" : "Transactions", icon: ArrowRightLeft, path: "/admin/transactions" },
        { name: lang === "VI" ? "Phản hồi" : "Feedbacks", icon: MessageSquare, path: "/admin/feedbacks" },
      ]
    },
    {
      title: lang === "VI" ? "Dữ liệu Nhận diện" : "Recognition Data",
      items: [
        { name: lang === "VI" ? "Kết quả" : "Results", icon: Terminal, path: "/admin/results" },
        { name: lang === "VI" ? "Tiền giấy" : "Banknotes", icon: FileImage, path: "/admin/banknotes" },
        { name: lang === "VI" ? "Tỷ giá" : "Currency Rates", icon: Landmark, path: "/admin/currency-rates" },
      ]
    },
    {
      title: lang === "VI" ? "Cấu hình AI Agents" : "AI Agents",
      items: [
        { name: lang === "VI" ? "Quản lý Agents" : "Agents Manager", icon: Cpu, path: "/admin/agents" },
        { name: lang === "VI" ? "Cấu hình Agents" : "Agents Config", icon: Settings, path: "/admin/agents/config" },
        { name: lang === "VI" ? "Mô hình AI" : "AI Model", icon: Box, path: "/admin/agents/ai-model" },
        { name: lang === "VI" ? "Cấu hình LLM" : "LLM Config", icon: BotMessageSquare, path: "/admin/agents/llm" },
        { name: lang === "VI" ? "Google Lens" : "Google Lens", icon: SearchCheck, path: "/admin/agents/google-lens" },
        { name: lang === "VI" ? "Tổng hợp" : "Aggregator", icon: GitMerge, path: "/admin/agents/aggregator" },
      ]
    },
    {
      title: lang === "VI" ? "Hệ thống" : "System",
      items: [
        { name: lang === "VI" ? "Nhật ký Hệ thống" : "System Logs", icon: FileText, path: "/admin/logs" },
        { name: lang === "VI" ? "Cài đặt" : "Settings", icon: Settings, path: "/admin/settings" },
        { name: lang === "VI" ? "Quản lý Nội dung" : "Content Manager", icon: FileText, path: "/admin/pages" },
      ]
    }
  ], [lang]);

  // Tìm tên trang hiện tại cho Breadcrumb
  const currentPage = useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (location.pathname === item.path || location.pathname.startsWith(item.path + '/')) {
          return item.name;
        }
      }
    }
    return "Admin Panel";
  }, [location.pathname, navGroups]);

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

      {/* SIDEBAR (Gradient Dark Styling) */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] flex-shrink-0 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} bg-gradient-to-b from-slate-950 to-slate-900 border-r border-slate-800 text-slate-300`}>
        <div className="h-[72px] flex items-center justify-between px-6 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950">
              <Shield size={18} className="fill-current" />
            </div>
            <span className="font-black text-xl tracking-tight text-white">
              Banknote<span className="text-teal-400">Admin</span>
            </span>
          </div>
          <button className="lg:hidden p-2 text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <div className="px-6 py-5 border-b border-slate-800/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
            {user?.avatar_url ? (
               <img src={user.avatar_url} alt="Admin" className="w-full h-full object-cover" />
            ) : (
               <UserIcon size={20} className="text-teal-400" />
            )}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white truncate">{user?.full_name || user?.name || "Admin User"}</p>
            <p className="text-xs text-teal-400 font-mono truncate">{user?.email || "admin@system.local"}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
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
                      key={item.name} 
                      to={item.path} 
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
                        isActive 
                          ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/5 text-teal-400" 
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                      }`}
                    >
                      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-teal-500 rounded-r-full shadow-[0_0_10px_rgba(20,184,166,0.5)]" />}
                      <item.icon className="w-4 h-4" /> {item.name}
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
            <button className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">Admin Panel</span>
              <ChevronRight size={14} className="hidden sm:block" />
              <span className={`text-teal-600 dark:text-teal-400`}>{currentPage}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            <button onClick={() => navigate("/")} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition ${isDark ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"}`}>
              <Home size={16} /> <span className="hidden sm:inline">{lang === "VI" ? "Về trang User" : "User App"}</span>
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

            <button 
              onClick={toggleLanguage} 
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition font-bold text-sm ${isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`} 
              title="Toggle Language"
            >
              <Globe size={16} /> {lang}
            </button>

            <button onClick={toggleTheme} className={`p-2 rounded-lg border transition ${isDark ? "border-slate-700 bg-slate-800 text-amber-400 hover:text-amber-300" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`} title="Toggle Theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>

            <button onClick={handleLogout} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition ml-1" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER (Animated Background) */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle noise/dot background pattern */}
          <div className={`absolute inset-0 pointer-events-none opacity-[0.03] ${isDark ? 'bg-[url("https://www.transparenttextures.com/patterns/cubes.png")]' : ''}`}></div>
          <div className="relative z-10 p-4 md:p-6 xl:p-8 animate-[fadeInUp_0.3s_ease-out]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
