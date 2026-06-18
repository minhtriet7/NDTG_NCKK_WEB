import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LogOut, 
  AlertCircle, 
  Home, 
  BookOpen, 
  RefreshCw, 
  LayoutDashboard, 
  History, 
  CreditCard,
  Menu,
  X,
  Sparkles
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

import ThemeLangToggle from "../common/ThemeLangToggle";
import { getAvatarImageSrc, useAuthStore } from "../../store/authStore";
import { useTranslation } from "react-i18next";

function isPathActive(currentPath, linkPath, aliases = []) {
  const allPaths = [linkPath, ...aliases];
  return allPaths.some((path) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(`${path}/`);
  });
}

function getInitials(name = "User") {
  const parts = String(name || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "U").toUpperCase();
}

function HeaderUserAvatar({ user, displayName, size = "sm" }) {
  const avatarSrc = getAvatarImageSrc(user);
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = size === "md" ? "h-9 w-9" : "h-8 w-8";

  useEffect(() => {
    setImageFailed(false);
  }, [avatarSrc]);

  if (avatarSrc && !imageFailed) {
    return (
      <img
        src={avatarSrc}
        alt={`${displayName} avatar`}
        className={`${sizeClass} rounded-full object-cover ring-1 ring-indigo-100 transition group-hover:scale-105 dark:ring-cyan-400/20`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-violet-100 text-xs font-black text-indigo-600 ring-1 ring-indigo-100 transition group-hover:scale-105 dark:from-cyan-500/15 dark:to-violet-500/15 dark:text-cyan-300 dark:ring-cyan-400/20`}
    >
      {getInitials(displayName)}
    </span>
  );
}

export default function Header() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  const publicLinks = [
    { path: "/", label: t('header.home', 'Home'), icon: Home },
    { path: "/directory", label: t('header.dir', 'Directory'), icon: BookOpen },
    {
      path: "/currency-converter",
      label: t('header.ex', 'Exchange'),
      aliases: ["/exchange"],
      icon: RefreshCw,
    },
  ];

  const privateLinks = [
    {
      path: "/recognize",
      label: t('header.workspace', 'Workspace'),
      aliases: ["/workspace", "/processing", "/result", "/result/detail", "/agent-result-detail"],
      icon: LayoutDashboard,
    },
    { path: "/history", label: t('header.history', 'History'), icon: History },
    { path: "/pricing", label: t('header.pricing', 'Pricing'), icon: CreditCard },
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

      <header className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/80 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-950/80 dark:shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent dark:via-indigo-400/50" />

        <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="group flex min-w-0 items-center gap-3 rounded-2xl pr-2 transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 group-hover:border-indigo-300 group-hover:shadow-indigo-500/15 dark:border-slate-700/80 dark:bg-slate-900 dark:group-hover:border-indigo-500/50">
                <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/15 via-transparent to-violet-500/15 opacity-0 transition-opacity group-hover:opacity-100" />
                <img
                  src="/logo.png"
                  alt="Banknote AI Logo"
                  className="relative h-8 w-8 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-110"
                />
              </div>

              <span className="hidden min-[420px]:flex items-baseline text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Banknote
                <span className="ml-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
                  AI
                </span>
              </span>
            </Link>

            <nav className="hidden xl:flex items-center rounded-2xl border border-slate-200/70 bg-slate-100/60 p-1 shadow-inner dark:border-slate-800/80 dark:bg-slate-900/70">
              {navLinks.map((link) => {
                const active = isPathActive(
                  location.pathname,
                  link.path,
                  link.aliases || [],
                );
                const Icon = link.icon;

                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
                      active
                        ? "border border-white/60 bg-white text-slate-950 shadow-sm dark:border-indigo-400/20 dark:bg-indigo-500/15 dark:text-indigo-100"
                        : "text-slate-500 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 transition ${
                        active ? "text-indigo-500 dark:text-cyan-300" : "text-slate-400 group-hover:text-indigo-500"
                      }`}
                    />
                    {link.label}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="flex shrink-0 items-center justify-end gap-2">
              <div className="hidden min-[460px]:block">
                <ThemeLangToggle />
              </div>

              <div className="hidden xl:flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/65 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/65">
                {isAuthenticated ? (
                  <>
                    <Link
                      to="/profile"
                      className="group inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:hover:bg-slate-800"
                    >
                      <HeaderUserAvatar user={user} displayName={displayName} />
                      <span className="max-w-[120px] truncate text-sm font-bold text-slate-700 transition group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-cyan-300">
                        {displayName.split(" ")[0]}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowLogoutModal(true)}
                      title={t('header.confirm', 'Log out')}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/10 dark:hover:border-red-500/20 dark:hover:bg-red-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                    >
                      {t('header.login', 'Log in')}
                    </Link>

                    <Link
                      to="/auth/register"
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-indigo-500/30 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('header.signup', 'Sign up')}
                    </Link>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((value) => !value)}
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 xl:hidden"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-200/70 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-5">
              <nav className="grid gap-2 sm:grid-cols-2">
                {navLinks.map((link) => {
                  const active = isPathActive(
                    location.pathname,
                    link.path,
                    link.aliases || [],
                  );
                  const Icon = link.icon;

                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                        active
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200"
                          : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/20 dark:hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="min-[460px]:hidden">
                  <ThemeLangToggle />
                </div>

                {isAuthenticated ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Link
                      to="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 font-bold text-slate-700 transition hover:text-indigo-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:text-cyan-300"
                    >
                      <HeaderUserAvatar
                        user={user}
                        displayName={displayName}
                        size="md"
                      />
                      <span className="min-w-0 truncate">{displayName}</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setShowLogoutModal(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('header.confirm', 'Log out')}
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      to="/auth/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    >
                      {t('header.login', 'Log in')}
                    </Link>

                    <Link
                      to="/auth/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 px-4 py-3 text-center text-sm font-black text-white shadow-lg shadow-indigo-500/20"
                    >
                      {t('header.signup', 'Sign up')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
