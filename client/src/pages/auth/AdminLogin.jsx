import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Shield, Lock, Mail, ArrowRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { authService } from "../../services/authService";

export default function AdminLogin() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);
  const { lang, theme } = useAppStore();

  const isDark = theme === "dark";

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const t = useMemo(
    () => ({
      EN: {
        badge: "SECURE ADMIN PORTAL",
        title: "System Administration",
        subtitle: "Authenticate to access the management workspace.",
        email: "Email Address",
        emailPlaceholder: "admin@example.com",
        password: "Password",
        passwordPlaceholder: "••••••••",
        submit: "Authorize Access",
        loading: "Verifying credentials...",
        userLogin: "Return to User Portal",
        accessDenied: "Access denied. Administrator privileges required.",
        invalid: "Invalid authentication credentials.",
        note: "Unauthorized access attempts are logged and monitored.",
      },
      VI: {
        badge: "CỔNG QUẢN TRỊ BẢO MẬT",
        title: "Quản trị Hệ thống",
        subtitle: "Xác thực để truy cập không gian làm việc của admin.",
        email: "Địa chỉ Email",
        emailPlaceholder: "admin@example.com",
        password: "Mật khẩu",
        passwordPlaceholder: "••••••••",
        submit: "Cấp quyền Truy cập",
        loading: "Đang xác thực...",
        userLogin: "Quay lại Cổng Người dùng",
        accessDenied: "Từ chối truy cập. Yêu cầu quyền quản trị viên.",
        invalid: "Thông tin xác thực không hợp lệ.",
        note: "Mọi nỗ lực truy cập trái phép đều được ghi nhận và giám sát.",
      },
    }),
    [],
  );

  const text = t[lang || "EN"] || t.EN;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError("");

    try {
      const data = await authService.login(formData.email, formData.password);
      const user = data?.user;
      const token = data?.access_token || data?.token;

      if (!user || !token) {
        setError(text.invalid);
        return;
      }

      if (String(user?.role || "").toLowerCase() !== "admin") {
        setError(text.accessDenied);
        return;
      }

      loginStore(user, token);
      navigate("/admin/dashboard", { replace: true });
    } catch {
      setError(text.invalid);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full relative">
      {/* Decorative background elements */}
      <div className={`absolute -top-20 -left-20 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none ${isDark ? "bg-teal-500" : "bg-teal-400"}`}></div>
      <div className={`absolute -bottom-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none ${isDark ? "bg-cyan-500" : "bg-cyan-400"}`}></div>

      <div className="mb-8 relative z-10">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase mb-6 ${
            isDark
              ? "bg-teal-500/10 border-teal-500/20 text-teal-400"
              : "bg-teal-50 border-teal-200 text-teal-700"
          }`}
        >
          <Shield size={12} className="fill-current" />
          {text.badge}
        </div>

        <h1 className={`text-3xl sm:text-4xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
          {text.title}
        </h1>

        <p className={`mt-3 text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {text.subtitle}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-3 animate-[shake_0.5s_ease-in-out]">
          <div className="mt-0.5 w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400 leading-tight">
            {error}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
        <div className="group">
          <label htmlFor="admin-email" className={`block text-xs font-bold uppercase tracking-wider mb-2 transition-colors ${isDark ? "text-slate-400 group-focus-within:text-teal-400" : "text-slate-500 group-focus-within:text-teal-600"}`}>
            {text.email}
          </label>
          <div className="relative">
            <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${isDark ? "text-slate-500 group-focus-within:text-teal-400" : "text-slate-400 group-focus-within:text-teal-600"}`}>
              <Mail size={18} />
            </div>
            <input
              id="admin-email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder={text.emailPlaceholder}
              className={`block w-full h-12 pl-11 pr-4 rounded-xl border outline-none text-sm transition-all duration-300 font-medium ${
                isDark
                  ? "bg-slate-900/50 border-slate-700 text-slate-100 placeholder-slate-600 focus:bg-slate-900 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 shadow-inner"
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              }`}
            />
          </div>
        </div>

        <div className="group">
          <label htmlFor="admin-password" className={`block text-xs font-bold uppercase tracking-wider mb-2 transition-colors ${isDark ? "text-slate-400 group-focus-within:text-teal-400" : "text-slate-500 group-focus-within:text-teal-600"}`}>
            {text.password}
          </label>
          <div className="relative">
            <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${isDark ? "text-slate-500 group-focus-within:text-teal-400" : "text-slate-400 group-focus-within:text-teal-600"}`}>
              <Lock size={18} />
            </div>
            <input
              id="admin-password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
              placeholder={text.passwordPlaceholder}
              className={`block w-full h-12 pl-11 pr-4 rounded-xl border outline-none text-sm transition-all duration-300 font-medium tracking-widest ${
                isDark
                  ? "bg-slate-900/50 border-slate-700 text-slate-100 placeholder-slate-600 focus:bg-slate-900 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 shadow-inner"
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              }`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 mt-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl font-bold flex justify-between items-center px-6 transition-all duration-300 shadow-[0_0_20px_rgba(13,148,136,0.3)] hover:shadow-[0_0_25px_rgba(13,148,136,0.5)] disabled:opacity-70 disabled:cursor-not-allowed group"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 justify-center w-full">
              <Loader2 className="w-5 h-5 animate-spin" />
              {text.loading}
            </span>
          ) : (
            <>
              <span>{text.submit}</span>
              <ArrowRight size={18} className="transform transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 relative z-10">
        <p className={`text-[11px] uppercase tracking-wider font-bold mb-4 text-center ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          {text.note}
        </p>
        
        <button
          type="button"
          onClick={() => navigate("/auth/login")}
          className={`w-full h-11 rounded-xl border text-sm font-bold transition-all duration-300 ${
            isDark
              ? "border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-white"
              : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {text.userLogin}
        </button>
      </div>
    </div>
  );
}
