import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { authService } from '../../services/authService';
import { useAppStore } from '../../store/appStore';

export default function Register() {
  const navigate = useNavigate();
  const { lang, theme } = useAppStore();
  const isDark = theme === 'dark';

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const errorParam = params.get('error');
  const initialError = errorParam === 'GoogleOAuthNotConfigured' 
    ? 'Hệ thống chưa được cấu hình Đăng nhập Google (Thiếu Client ID).' 
    : errorParam ? 'Đăng nhập Google thất bại: ' + errorParam : '';

  const [formData, setFormData] = useState({ full_name: '', email: '', password: '', confirm_password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState(false);

  const t = {
    EN: {
      title: "Create Account", name: "Full Name", email: "Email Address",
      pass: "Password", conf: "Confirm Password",
      btn: "SIGN UP", or: "Or", google: "Continue with Google",
      hasAcc: "Already have an account?", signin: "Sign in",
      errMatch: "Passwords do not match.", success: "Account Created!"
    },
    VI: {
      title: "Tạo tài khoản mới", name: "Họ và Tên", email: "Địa chỉ Email",
      pass: "Mật khẩu", conf: "Xác nhận Mật khẩu",
      btn: "ĐĂNG KÝ", or: "Hoặc", google: "Tiếp tục với Google",
      hasAcc: "Đã có tài khoản?", signin: "Đăng nhập",
      errMatch: "Mật khẩu xác nhận không khớp.", success: "Đăng ký thành công!"
    }
  }[lang];

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (formData.password.length < 6) {
      setError(lang === 'VI' ? 'Mật khẩu phải có ít nhất 6 ký tự.' : 'Password must be at least 6 characters.');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError(t.errMatch);
      return;
    }

    setIsLoading(true);
    try {
      await authService.register(formData.full_name, formData.email, formData.password);
      setSuccess(true);
      setTimeout(() => navigate('/auth/login'), 2000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const errMsg = Array.isArray(detail) ? detail[0]?.msg : detail;
      setError(errMsg || (lang === 'VI' ? "Đăng ký thất bại." : "Registration failed."));
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="animate-in fade-in zoom-in duration-500 text-center py-12">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner shadow-green-500/20">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h3 className={`text-2xl font-bold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.success}</h3>
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Đang chuyển hướng đến trang đăng nhập...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700 w-full">
      <div className="mb-6 text-center">
        <h2 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.title}</h2>
      </div>

      {error && (
        <div className={`mb-5 p-3 text-sm rounded-xl text-center backdrop-blur-md border ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-100 text-red-600'}`}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="group relative">
          <div className={`absolute -inset-0.5 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 ${isDark ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30' : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20'}`}></div>
          <input
            type="text" name="full_name" required
            className={`relative w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-300 ${isDark ? 'bg-[#0B1120] border border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50' : 'bg-white/50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white'}`}
            placeholder={t.name}
            value={formData.full_name} onChange={handleChange}
          />
        </div>

        <div className="group relative">
          <div className={`absolute -inset-0.5 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 ${isDark ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30' : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20'}`}></div>
          <input
            type="email" name="email" required
            className={`relative w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-300 ${isDark ? 'bg-[#0B1120] border border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50' : 'bg-white/50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white'}`}
            placeholder={t.email}
            value={formData.email} onChange={handleChange}
          />
        </div>

        <div className="group relative">
          <div className={`absolute -inset-0.5 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 ${isDark ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30' : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20'}`}></div>
          <input
            type={showPassword ? "text" : "password"} name="password" required
            className={`relative w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-300 ${isDark ? 'bg-[#0B1120] border border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50' : 'bg-white/50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white'}`}
            placeholder={t.pass}
            value={formData.password} onChange={handleChange}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-3 text-slate-400 hover:text-indigo-500 transition-colors z-10">
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        <div className="group relative">
          <div className={`absolute -inset-0.5 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 ${isDark ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30' : 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20'}`}></div>
          <input
            type={showPassword ? "text" : "password"} name="confirm_password" required
            className={`relative w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-300 ${isDark ? 'bg-[#0B1120] border border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50' : 'bg-white/50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white'}`}
            placeholder={t.conf}
            value={formData.confirm_password} onChange={handleChange}
          />
        </div>

        <button type="submit" disabled={isLoading} className="relative group w-full py-3.5 mt-4 rounded-xl text-sm font-bold text-white transition-all duration-300 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-500 bg-[length:200%_auto] hover:bg-[center_right_1rem] shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center overflow-hidden">
          <div className="absolute inset-0 rounded-xl ring-1 ring-white/20 transition-all group-hover:ring-white/40"></div>
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin relative z-10" /> : <span className="relative z-10">{t.btn}</span>}
        </button>
      </form>

      <div className={`my-5 flex items-center before:flex-1 before:border-t after:flex-1 after:border-t ${isDark ? 'before:border-slate-800 after:border-slate-800' : 'before:border-slate-200 after:border-slate-200'}`}>
        <span className={`px-4 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t.or}</span>
      </div>

      <button type="button" onClick={() => window.location.href = authService.getGoogleLoginUrl()}
        className={`group relative w-full flex items-center justify-center gap-3 py-3 rounded-xl transition-all duration-300 text-sm font-semibold active:scale-[0.98] border ${
          isDark 
            ? 'bg-[#0B1120]/50 border-slate-700/50 text-slate-200 hover:bg-slate-800 hover:border-slate-600' 
            : 'bg-white/50 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm'
        }`}
      >
        <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {t.google}
      </button>

      <div className="mt-6 text-center">
        <span className={`text-[13px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.hasAcc} </span>
        <Link to="/auth/login" className="text-[13px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors">
          {t.signin}
        </Link>
      </div>
    </div>
  );
}
