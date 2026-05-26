import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ScanLine, User, LogOut, AlertCircle, X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

import ThemeLangToggle from "../common/ThemeLangToggle";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";

function isPathActive(currentPath, linkPath, aliases = []) {
  const allPaths = [linkPath, ...aliases];

  return allPaths.some((path) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(`${path}/`);
  });
}

export default function Header() {
  const { theme, lang } = useAppStore();
  const { isAuthenticated, user, logout } = useAuthStore();

  const navigate = useNavigate();
  const location = useLocation();

  const isDark = theme === "dark";
  const currentLang = lang || "EN";

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const t = {
    EN: {
      home: "Home",
      dir: "Directory",
      ex: "Exchange",
      workspace: "Workspace",
      history: "History",
      pricing: "Pricing",
      login: "Log in",
      signup: "Sign up",
      logoutConfirmTitle: "Confirm Logout",
      logoutConfirmDesc: "Are you sure you want to log out of your account?",
      cancel: "Cancel",
      confirm: "Log out",
      logoutSuccess: "Logged out successfully!",
    },
    VI: {
      home: "Trang chủ",
      dir: "Danh mục",
      ex: "Tỷ giá",
      workspace: "Không gian quét",
      history: "Lịch sử",
      pricing: "Gói cước",
      login: "Đăng nhập",
      signup: "Đăng ký",
      logoutConfirmTitle: "Xác nhận Đăng xuất",
      logoutConfirmDesc: "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?",
      cancel: "Hủy",
      confirm: "Đăng xuất",
      logoutSuccess: "Đã đăng xuất thành công!",
    },
  }[currentLang];

  const publicLinks = [
    { path: "/", label: t.home },
    { path: "/directory", label: t.dir },
    {
      path: "/currency-converter",
      label: t.ex,
      aliases: ["/exchange"],
    },
  ];

  const privateLinks = [
    {
      path: "/recognize",
      label: t.workspace,
      aliases: ["/workspace", "/processing", "/result", "/result/detail", "/agent-result-detail"],
    },
    { path: "/history", label: t.history },
    { path: "/pricing", label: t.pricing },
  ];

  const navLinks = isAuthenticated
    ? [...publicLinks, ...privateLinks]
    : publicLinks;

  const confirmLogout = () => {
    logout();
    setShowLogoutModal(false);

    toast.success(t.logoutSuccess, {
      style: {
        background: isDark ? "#1e293b" : "#fff",
        color: isDark ? "#fff" : "#0f172a",
      },
    });

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

      <header
        className={`w-full border-b transition-colors duration-300 ${
          isDark
            ? "bg-slate-950 border-slate-800"
            : "bg-white border-slate-100"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity z-10"
            >
              <div className="w-8 h-8 bg-[#009688] rounded-lg flex items-center justify-center shadow-sm">
                <ScanLine className="w-5 h-5 text-white" />
              </div>

              <span
                className={`text-xl font-extrabold tracking-tight ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                Banknote<span className="text-[#009688]">AI</span>
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
                        ? "border-[#009688] text-[#009688]"
                        : `border-transparent ${
                            isDark
                              ? "text-slate-300 hover:text-[#009688]"
                              : "text-slate-600 hover:text-[#009688]"
                          }`
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-4 z-10">
              <ThemeLangToggle />

              <div
                className={`hidden sm:flex items-center gap-4 ml-2 border-l pl-4 sm:pl-6 transition-colors duration-300 ${
                  isDark ? "border-slate-700" : "border-slate-200"
                }`}
              >
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <Link
                      to="/profile"
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${
                        isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"
                      }`}
                    >
                      <div className="w-7 h-7 bg-teal-100 dark:bg-teal-900/50 text-[#009688] rounded-full flex items-center justify-center">
                        <User className="w-4 h-4" />
                      </div>

                      <span
                        className={`text-sm font-bold ${
                          isDark ? "text-slate-200" : "text-slate-700"
                        }`}
                      >
                        {displayName.split(" ")[0]}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowLogoutModal(true)}
                      title={t.confirm}
                      className={`p-2 rounded-full transition-colors ${
                        isDark
                          ? "text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                          : "text-slate-500 hover:text-red-600 hover:bg-red-50"
                      }`}
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      className={`text-sm font-bold transition-colors ${
                        isDark
                          ? "text-slate-300 hover:text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {t.login}
                    </Link>

                    <Link
                      to="/auth/register"
                      className="bg-[#009688] hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.02] shadow-sm whitespace-nowrap"
                    >
                      {t.signup}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-all duration-300">
          <div
            className={`relative w-full max-w-md p-6 rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 ${
              isDark
                ? "bg-slate-900 border border-slate-800"
                : "bg-white border border-slate-200"
            }`}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>

              <div className="pt-1">
                <h3
                  className={`text-lg font-extrabold mb-1 ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {t.logoutConfirmTitle}
                </h3>

                <p
                  className={`text-sm ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.logoutConfirmDesc}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  isDark
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t.cancel}
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20"
              >
                {t.confirm}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowLogoutModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}