import React from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { 
  LayoutDashboard, Users, Coins, Settings, LogOut, FileImage, 
  ArrowRightLeft, MessageSquare, Terminal, Landmark, Cpu, 
  BotMessageSquare, SearchCheck, GitMerge, FileText, Sun, Moon, Globe, Home, User as UserIcon
} from "lucide-react";

export default function AdminLayout() {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Lấy toàn bộ store để kiểm tra hàm thay đổi ngôn ngữ
  const appStore = useAppStore();
  const lang = appStore.lang || "EN";
  const theme = appStore.theme || "light";
  const isDark = theme === "dark";

  const handleLogout = () => {
  logout();
  navigate("/auth/admin-login", { replace: true });
};

  // Hàm xử lý đổi ngôn ngữ an toàn, tương tự user app
  const toggleLanguage = () => {
    const nextLang = lang === "EN" ? "VI" : "EN";
    if (typeof appStore.setLang === "function") {
      appStore.setLang(nextLang);
    } else if (typeof appStore.setLanguage === "function") {
      appStore.setLanguage(nextLang);
    } else {
      // Fallback cho Zustand nếu không có hàm cụ thể
      useAppStore.setState({ lang: nextLang });
    }
  };

  const navGroups = [
    {
      title: lang === "VI" ? "Tổng Quan" : "Overview",
      items: [
        { name: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
      ]
    },
    {
      title: lang === "VI" ? "Người dùng & Thanh toán" : "User & Payments",
      items: [
        { name: "Users", icon: Users, path: "/admin/users" },
        { name: "Token Packages", icon: Coins, path: "/admin/token-packages" },
        { name: "Transactions", icon: ArrowRightLeft, path: "/admin/transactions" },
        { name: "Feedbacks", icon: MessageSquare, path: "/admin/feedbacks" },
      ]
    },
    {
      title: lang === "VI" ? "Dữ liệu Nhận diện" : "Recognition Data",
      items: [
        { name: "Results", icon: Terminal, path: "/admin/results" },
        { name: "Banknotes", icon: FileImage, path: "/admin/banknotes" },
        { name: "Currency Rates", icon: Landmark, path: "/admin/currency-rates" },
      ]
    },
    {
      title: lang === "VI" ? "Cấu hình AI Agents" : "AI Agents",
      items: [
        { name: "Agents Manager", icon: Cpu, path: "/admin/agents" },
        { name: "Agents Config", icon: Settings, path: "/admin/agents/config" },
        { name: "AI Model Config", icon: Box, path: "/admin/agents/ai-model" },
        { name: "LLM Config", icon: BotMessageSquare, path: "/admin/agents/llm" },
        { name: "Google Lens Config", icon: SearchCheck, path: "/admin/agents/google-lens" },
        { name: "Aggregator Config", icon: GitMerge, path: "/admin/agents/aggregator" },
      ]
    },
    {
      title: lang === "VI" ? "Hệ thống" : "System",
      items: [
        { name: "System Logs", icon: FileText, path: "/admin/logs" },
        { name: "Settings", icon: Settings, path: "/admin/settings" },
      ]
    }
  ];

  function Box(props) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>; }

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}>
      
      {/* SIDEBAR (Fixed Width: 280px) */}
      <aside className={`w-[280px] flex-shrink-0 border-r flex flex-col transition-colors ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className={`h-[72px] flex items-center px-6 font-black text-2xl tracking-tight border-b shrink-0 ${isDark ? "border-slate-800 text-white" : "border-slate-200 text-slate-900"}`}>
          Banknote<span className="text-teal-600">Admin</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {navGroups.map((group, idx) => (
            <div key={idx}>
              <h3 className={`px-3 mb-2 text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  return (
                    <Link 
                      key={item.name} 
                      to={item.path} 
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive 
                          ? "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400" 
                          : "hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
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
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* TOPBAR (Height: 72px) */}
        <header className={`h-[72px] flex-shrink-0 flex items-center justify-between px-6 border-b transition-colors ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-lg hidden md:block">System Management</h2>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => navigate("/")} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition ${isDark ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"}`}>
              <Home size={16} /> <span className="hidden sm:inline">{lang === "VI" ? "Về trang User" : "Go to User App"}</span>
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

            {/* SỬA NÚT ĐỔI NGÔN NGỮ TẠI ĐÂY */}
            <button 
              onClick={toggleLanguage} 
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition font-bold text-sm ${isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`} 
              title="Toggle Language"
            >
              <Globe size={16} /> {lang}
            </button>

            <button onClick={appStore.toggleTheme} className={`p-2 rounded-lg border transition ${isDark ? "border-slate-700 bg-slate-800 text-amber-400 hover:text-amber-300" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"}`} title="Toggle Theme">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold border ${isDark ? "bg-teal-900/50 text-teal-400 border-teal-800" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                <UserIcon size={18}/>
              </div>
              <button onClick={handleLogout} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 xl:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}