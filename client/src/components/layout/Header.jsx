import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { 
  User, 
  LogOut, 
  AlertCircle, 
  Home, 
  BookOpen, 
  RefreshCw, 
  LayoutDashboard, 
  History, 
  CreditCard
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

import ThemeLangToggle from "../common/ThemeLangToggle";
import { useAuthStore } from "../../store/authStore";
import { useTranslation } from "react-i18next";

function isPathActive(currentPath, linkPath, aliases = []) {
  const allPaths = [linkPath, ...aliases];
  return allPaths.some((path) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(`${path}/`);
  });
}

export default function Header() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { t } = useTranslation();

  const publicLinks = [
    { path: "/", label: t('header.home', 'Home') },
    { path: "/directory", label: t('header.dir', 'Directory') },
    {
      path: "/currency-converter",
      label: t('header.ex', 'Exchange'),
      aliases: ["/exchange"],
    },
  ];

  const privateLinks = [
    {
      path: "/recognize",
      label: t('header.workspace', 'Workspace'),
      aliases: ["/workspace", "/processing", "/result", "/result/detail", "/agent-result-detail"],
    },
    { path: "/history", label: t('header.history', 'History') },
    { path: "/pricing", label: t('header.pricing', 'Pricing') },
  ];

  const navLinks = isAuthenticated
    ? [...publicLinks, ...privateLinks]
    : publicLinks;

  const confirmLogout = () => {
    logout();
    setShowLogoutModal(false);
    toast.success(t('header.logoutSuccess', 'Logged out successfully!'));
    navigate("/");
  };

  const displayName =
    user?.full_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "User";

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />

      <header className="sticky top-0 z-50 w-full transition-all duration-500 bg-white/70 dark:bg-[#0B1120]/70 backdrop-blur-2xl border-b border-gray-200/50 dark:border-[#1E293B]/50 shadow-[0_4px_30px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.2)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20">
            {/* Logo Section */}
            <Link
              to="/"
              className="flex items-center gap-3 hover:opacity-90 transition-opacity z-10 group"
            >
              <div className="h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <img src="/logo.png" alt="Banknote AI Logo" className="w-full h-full object-contain drop-shadow-md" />
              </div>

              <span className="text-xl sm:text-2xl font-black tracking-tighter text-gray-900 dark:text-white flex items-center">
                Banknote
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600 ml-1 font-extrabold">
                  AI
                </span>
              </span>
            </Link>

            {/* Desktop Navigation (Transparent with Animated Underline) */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-4 absolute left-1/2 -translate-x-1/2">
              {navLinks.map((link) => {
                const active = isPathActive(
                  location.pathname,
                  link.path,
                  link.aliases || [],
                );

                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="group relative px-2 py-2 text-[14px] font-semibold transition-colors duration-300"
                  >
                    <span className={`relative z-10 transition-colors duration-300 ${
                      active
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
                    }`}>
                      {link.label}
                    </span>

                    {/* Animated Underline Effect */}
                    <span className={`absolute bottom-0 left-1/2 h-[2.5px] bg-indigo-500 dark:bg-indigo-400 rounded-t-full transition-all duration-300 ease-out -translate-x-1/2
                      ${active ? "w-full opacity-100" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-100"}
                    `} />
                    
                    {/* Subtle glow for active state */}
                    {active && (
                      <span className="absolute bottom-0 left-1/2 w-3/4 h-[8px] bg-indigo-500/20 blur-sm -translate-x-1/2 pointer-events-none" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right Action Section */}
            <div className="flex items-center gap-3 sm:gap-5 z-10">
              <ThemeLangToggle />

              <div className="hidden sm:flex items-center gap-4 pl-4 sm:pl-5 transition-colors duration-300 border-l border-gray-200 dark:border-slate-700/50">
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full transition-all duration-300 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-[#334155] hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/10 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center ring-2 ring-white dark:ring-[#0F172A] group-hover:scale-105 transition-transform duration-300 shadow-sm">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {displayName.split(" ")[0]}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowLogoutModal(true)}
                      title={t('header.confirm', 'Log out')}
                      className="p-2.5 rounded-full transition-all duration-300 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20"
                    >
                      <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      className="text-sm font-semibold transition-colors text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-2"
                    >
                      {t('header.login', 'Log in')}
                    </Link>

                    <Link
                      to="/auth/register"
                      className="relative group inline-flex items-center justify-center px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-500 bg-[length:200%_auto] hover:bg-[center_right_1rem] rounded-full shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                    >
                      {t('header.signup', 'Sign up')}
                      <div className="absolute inset-0 rounded-full ring-1 ring-white/20 transition-all group-hover:ring-white/40"></div>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 dark:bg-[#0B1120]/60 backdrop-blur-md transition-all duration-300">
          <div className="relative w-full max-w-md p-7 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 bg-white dark:bg-[#1E293B] border border-gray-100 dark:border-[#334155]">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
            
            <div className="flex items-start gap-4 mb-6 mt-2">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0 border border-red-100 dark:border-red-500/20 shadow-inner">
                <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>

              <div className="pt-1">
                <h3 className="text-lg font-bold mb-1.5 text-gray-900 dark:text-white">
                  {t('header.logoutConfirmTitle', 'Confirm Logout')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('header.logoutConfirmDesc', 'Are you sure you want to log out of your account? You will need to log back in to access your workspace.')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-transparent dark:text-gray-300 dark:hover:bg-[#334155] border border-gray-200 dark:border-[#334155] hover:border-gray-300"
              >
                {t('header.cancel', 'Cancel')}
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5 border border-red-600/50"
              >
                {t('header.confirm', 'Log out')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
