import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ScanLine, User, LogOut, AlertCircle, X } from "lucide-react";
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

      <header className="w-full border-b transition-colors duration-300 bg-background/90 border-border-theme backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity z-10"
            >
              <div className="w-8 h-8 bg-[#3157F6]/10 rounded-lg flex items-center justify-center border border-[#3157F6]/20 shadow-sm">
                <ScanLine className="w-5 h-5 text-[#3157F6]" />
              </div>

              <span className="text-xl font-extrabold tracking-tight text-foreground">
                Banknote<span className="text-[#3157F6]">AI</span>
              </span>
            </Link>

            <nav className="hidden lg:flex gap-6 xl:gap-8 absolute left-1/2 transform -translate-x-1/2">
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
                    className={`text-sm font-semibold transition-colors border-b-2 py-1 ${
                      active
                        ? "border-[#3157F6] text-[#3157F6]"
                        : "border-transparent text-secondary hover:text-[#3157F6]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-4 z-10">
              <ThemeLangToggle />

              <div className="hidden sm:flex items-center gap-4 ml-2 border-l pl-4 sm:pl-6 transition-colors duration-300 border-border-theme">
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors hover:bg-[#3157F6]/10"
                    >
                      <div className="w-7 h-7 bg-[#3157F6]/10 text-[#3157F6] rounded-full flex items-center justify-center">
                        <User className="w-4 h-4" />
                      </div>

                      <span className="text-sm font-bold text-foreground">
                        {displayName.split(" ")[0]}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowLogoutModal(true)}
                      title={t('header.confirm', 'Log out')}
                      className="p-2 rounded-full transition-colors text-secondary hover:text-red-500 hover:bg-red-500/10"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      className="text-sm font-bold transition-colors text-secondary hover:text-[#3157F6]"
                    >
                      {t('header.login', 'Log in')}
                    </Link>

                    <Link
                      to="/auth/register"
                      className="bg-[#3157F6] hover:bg-[#3157F6]/90 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] shadow-sm whitespace-nowrap"
                    >
                      {t('header.signup', 'Sign up')}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-all duration-300">
          <div className="relative w-full max-w-md p-6 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 bg-surface border border-border-theme">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>

              <div className="pt-1">
                <h3 className="text-lg font-extrabold mb-1 text-foreground">
                  {t('header.logoutConfirmTitle', 'Confirm Logout')}
                </h3>

                <p className="text-sm text-secondary">
                  {t('header.logoutConfirmDesc', 'Are you sure you want to log out of your account?')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors bg-background text-foreground hover:bg-background/80 border border-border-theme"
              >
                {t('header.cancel', 'Cancel')}
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
              >
                {t('header.confirm', 'Log out')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowLogoutModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-secondary hover:text-foreground hover:bg-primary/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}