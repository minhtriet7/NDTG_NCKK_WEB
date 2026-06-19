import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import ThemeLangToggle from '../components/common/ThemeLangToggle';
import { useAppStore } from '../store/appStore';

export default function AuthLayout() {
  const location = useLocation();
  const isLogin = location.pathname.includes("login");
  const isAdminLogin = location.pathname.includes("admin-login");
  
  const { theme, resolvedTheme } = useAppStore();
  const isDark = (resolvedTheme || theme) === 'dark';

  // Background Images
  const loginBg = "https://res.cloudinary.com/dg0qiq4zd/image/upload/v1779085695/13_26_26_18_thg_5_2026_ic0ar6.png"; 
  const registerBg = "https://res.cloudinary.com/dg0qiq4zd/image/upload/v1779085978/ChatGPT_Image_13_31_38_18_thg_5_2026_ospg93.png";
  const adminBg = "https://res.cloudinary.com/dg0qiq4zd/image/upload/v1779542096/ChatGPT_Image_20_13_15_23_thg_5_2026_rosfzj.png";
  
  return (
    <div className={`relative min-h-screen flex justify-center items-center p-0 md:p-4 font-sans overflow-hidden transition-colors duration-500 ${isDark ? 'bg-[#0B1120]' : 'bg-slate-50'}`}>
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 dark:bg-indigo-600/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/20 dark:bg-purple-600/20 blur-[120px] pointer-events-none"></div>

      {/* Navbar */}
      <div className="absolute top-0 left-0 right-0 w-full px-6 py-4 flex justify-between items-center z-50">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity z-10 group">
          <div className="h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
            <img src="/logo.png" alt="Banknote AI Logo" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-tighter text-gray-900 dark:text-white flex items-center">
            Banknote
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600 ml-1 font-extrabold flex items-center">
              AI <Sparkles className="w-[18px] h-[18px] sm:w-5 sm:h-5 ml-1 text-purple-500 animate-pulse" />
            </span>
          </span>
        </Link>
        <ThemeLangToggle />
      </div>

      {/* Main Container */}
      <div className={`relative w-full max-w-[1000px] h-screen md:h-[680px] md:shadow-2xl md:rounded-3xl overflow-hidden flex transition-colors duration-500 ${
        isDark ? 'bg-slate-900/40 backdrop-blur-xl border-slate-800 shadow-indigo-900/20 border' : 'bg-white/60 backdrop-blur-xl border-white shadow-indigo-500/10 border'
      }`}>
        
        {/* Form Container */}
        <div 
          className={`absolute top-0 bottom-0 left-0 w-full md:w-1/2 h-full flex flex-col items-center justify-center p-6 sm:p-12 z-20 transition-transform duration-[800ms] cubic-bezier-auth ${
            isLogin ? 'translate-x-0' : 'md:translate-x-full'
          } ${isDark ? 'bg-[#0F172A]/80 backdrop-blur-2xl' : 'bg-white/80 backdrop-blur-2xl'}`}
        >
          <div className="w-full max-w-[380px]">
            <Outlet />
          </div>
        </div>

        {/* Image Container */}
        <div 
          className={`hidden md:block absolute top-0 bottom-0 right-0 w-1/2 z-10 transition-transform duration-[800ms] cubic-bezier-auth ${
            isLogin ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div 
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[800ms] cubic-bezier-auth ${isLogin ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
            style={{ backgroundImage: `url(${isAdminLogin ? adminBg : loginBg})` }}
          />
          <div 
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[800ms] cubic-bezier-auth ${isLogin ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}
            style={{ backgroundImage: `url(${registerBg})` }}
          />
          {/* Color Overlay for SaaS feel */}
          <div className={`absolute inset-0 pointer-events-none transition-colors duration-500 mix-blend-overlay ${isDark ? 'bg-indigo-900/40' : 'bg-indigo-500/10'}`}></div>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent"></div>
        </div>

      </div>
    </div>
  );
}
