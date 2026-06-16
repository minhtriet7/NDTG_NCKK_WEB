import os

# --- 1. Header.jsx ---
# Logo redesign: Monogram BA or Minimal Geometric Mark. Let's use `Scan` or `Maximize` from lucide-react.

header_jsx = """
import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { User, LogOut, AlertCircle, X, BoxSelect } from "lucide-react";
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

      <header className="w-full border-b transition-colors duration-300 bg-[#0F172A]/90 border-[#334155] backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link
              to="/"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity z-10"
            >
              <div className="w-8 h-8 flex items-center justify-center text-[#F8FAFC]">
                <BoxSelect className="w-6 h-6 stroke-[1.5]" />
              </div>

              <span className="text-xl font-bold tracking-tight text-[#F8FAFC]">
                Banknote<span className="font-light text-[#CBD5E1]">AI</span>
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
                    className={`text-sm font-medium transition-colors border-b-2 py-1 ${
                      active
                        ? "border-[#6366F1] text-[#F8FAFC]"
                        : "border-transparent text-[#CBD5E1] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-4 z-10">
              <ThemeLangToggle />

              <div className="hidden sm:flex items-center gap-4 ml-2 border-l pl-4 sm:pl-6 transition-colors duration-300 border-[#334155]">
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors hover:bg-[#1E293B]"
                    >
                      <div className="w-7 h-7 bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded-full flex items-center justify-center">
                        <User className="w-4 h-4" />
                      </div>

                      <span className="text-sm font-medium text-[#F8FAFC]">
                        {displayName.split(" ")[0]}
                      </span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowLogoutModal(true)}
                      title={t('header.confirm', 'Log out')}
                      className="p-2 rounded-full transition-colors text-[#CBD5E1] hover:text-red-400 hover:bg-red-400/10"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      className="text-sm font-medium transition-colors text-[#CBD5E1] hover:text-[#F8FAFC]"
                    >
                      {t('header.login', 'Log in')}
                    </Link>

                    <Link
                      to="/auth/register"
                      className="bg-[#F8FAFC] hover:bg-[#CBD5E1] text-[#0F172A] px-5 py-2.5 rounded-md text-sm font-semibold transition-all shadow-sm whitespace-nowrap"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/80 backdrop-blur-sm transition-all duration-300">
          <div className="relative w-full max-w-md p-6 rounded-xl shadow-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 bg-[#1E293B] border border-[#334155]">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>

              <div className="pt-1">
                <h3 className="text-base font-semibold mb-1 text-[#F8FAFC]">
                  {t('header.logoutConfirmTitle', 'Confirm Logout')}
                </h3>
                <p className="text-sm text-[#CBD5E1]">
                  {t('header.logoutConfirmDesc', 'Are you sure you want to log out of your account?')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-transparent text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-[#334155]/50 border border-[#334155]"
              >
                {t('header.cancel', 'Cancel')}
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                className="px-4 py-2 rounded-md text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
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
"""

hero_mockup_jsx = """
import React, { useEffect, useState } from 'react';
import { Scan, Cpu, Bot, CheckCircle2, ChevronRight } from 'lucide-react';

export default function HeroMockup() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 5);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { icon: Scan, label: "Image Input" },
    { icon: Cpu, label: "Detection" },
    { icon: Bot, label: "AI Analysis" },
    { icon: CheckCircle2, label: "Verification" },
    { icon: ChevronRight, label: "Consensus" },
  ];

  return (
    <div className="relative w-full max-w-lg mx-auto bg-[#020617] rounded-2xl border border-[#334155] p-6 shadow-2xl overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[#0F172A]/50 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none" />
      
      {/* Fake Header */}
      <div className="flex items-center gap-2 mb-8 border-b border-[#334155] pb-4 relative z-10">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#334155]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#334155]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#334155]" />
        </div>
        <div className="mx-auto px-4 py-1 rounded-md bg-[#1E293B] border border-[#334155] text-[10px] text-[#CBD5E1] font-mono">
          multi-agent-pipeline.log
        </div>
      </div>

      <div className="relative z-10 space-y-6">
        {steps.map((step, idx) => {
          const isActive = activeStep === idx;
          const isPast = activeStep > idx;
          const Icon = step.icon;

          return (
            <div key={idx} className="relative flex items-center gap-4">
              {idx !== steps.length - 1 && (
                <div className={`absolute left-4 top-10 w-px h-8 ${isPast ? 'bg-[#6366F1]' : 'bg-[#334155]'} transition-colors duration-500`} />
              )}
              
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-500 ${
                isActive 
                  ? 'bg-[#6366F1]/10 border-[#6366F1] text-[#6366F1] shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                  : isPast 
                    ? 'bg-[#1E293B] border-[#334155] text-[#CBD5E1]' 
                    : 'bg-transparent border-[#334155] text-[#334155]'
              }`}>
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-medium transition-colors duration-500 ${isActive ? 'text-[#F8FAFC]' : isPast ? 'text-[#CBD5E1]' : 'text-[#334155]'}`}>
                    {step.label}
                  </span>
                  {isActive && (
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#6366F1] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6366F1]"></span>
                    </span>
                  )}
                </div>
                
                {isActive && (
                  <div className="mt-2 h-1.5 w-full bg-[#1E293B] rounded-full overflow-hidden">
                    <div className="h-full bg-[#6366F1] w-full origin-left animate-[scaleX_2.5s_ease-in-out]" style={{ animationFillMode: 'forwards' }}>
                      <style>{`@keyframes scaleX { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }`}</style>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 pt-4 border-t border-[#334155] relative z-10 flex justify-between items-center">
        <span className="text-[10px] text-[#334155] font-mono">STATUS: {activeStep === 4 ? 'COMPLETED' : 'PROCESSING'}</span>
        <span className="text-[10px] text-[#334155] font-mono">LATENCY: 1.2s</span>
      </div>
    </div>
  );
}
"""

hero_section_jsx = """
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import HeroMockup from './HeroMockup';

export default function HeroSection({ isAuthenticated }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden py-24 md:py-32 bg-[#0F172A]">
      {/* Minimal grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-8">
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold tracking-wide bg-[#1E293B] text-[#CBD5E1] border border-[#334155]">
              <Network className="w-3.5 h-3.5" />
              ENTERPRISE COMPUTER VISION
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight text-[#F8FAFC]">
              Verify banknotes with <br className="hidden md:block"/>
              <span className="text-[#6366F1]">multi-agent</span> intelligence.
            </h1>

            <p className="text-lg leading-relaxed text-[#CBD5E1] max-w-xl">
              An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
              <button
                onClick={() => navigate(isAuthenticated ? "/workspace" : "/auth/login")}
                className="flex items-center justify-center gap-2 bg-[#F8FAFC] hover:bg-[#CBD5E1] text-[#0F172A] px-8 py-3.5 rounded-md text-sm font-semibold transition-colors w-full sm:w-auto"
              >
                Start Workspace
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => navigate("/directory")}
                className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-md text-sm font-medium bg-transparent text-[#CBD5E1] border border-[#334155] hover:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors w-full sm:w-auto"
              >
                View Documentation
              </button>
            </div>
          </div>

          <div className="flex-1 w-full lg:max-w-xl">
            <HeroMockup />
          </div>
          
        </div>
      </div>
    </section>
  );
}
"""

agent_system_section_jsx = """
import React from 'react';
import { ScanLine, Bot, Sparkles, Search } from 'lucide-react';

export default function AgentSystemSection() {
  const agents = [
    { 
      icon: ScanLine, 
      label: "Pre-processing", 
      name: "YOLOv8 Cropper", 
      desc: "Isolates the banknote from the background, ensuring all downstream AI agents focus only on relevant pixels." 
    },
    { 
      icon: Bot, 
      label: "Agent 1", 
      name: "OpenAI GPT-4o", 
      desc: "Performs OCR and logical reasoning on visible text, watermarks, and serial numbers to deduce currency origin." 
    },
    { 
      icon: Sparkles, 
      label: "Agent 2", 
      name: "Google Gemini", 
      desc: "Applies deep multimodal analysis to verify historical figures and geometric patterns against its knowledge base." 
    },
    { 
      icon: Search, 
      label: "Agent 3", 
      name: "Google Lens", 
      desc: "Executes a visual reverse search to compare the cropped region against millions of verified public datasets." 
    }
  ];

  return (
    <section className="py-24 bg-[#0F172A] border-t border-[#334155]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-semibold tracking-tight text-[#F8FAFC] mb-4">
            The Multi-Agent Architecture
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-[#CBD5E1]">
            A redundant, independent verification pipeline designed for zero-trust environments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {agents.map((agent, i) => {
            const Icon = agent.icon;
            return (
              <div 
                key={i} 
                className="group p-6 rounded-xl bg-[#1E293B] border border-[#334155] hover:border-[#6366F1]/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#020617] border border-[#334155] flex items-center justify-center mb-6 text-[#CBD5E1] group-hover:text-[#6366F1] transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#CBD5E1] mb-2 block">
                  {agent.label}
                </span>
                
                <h3 className="text-lg font-medium text-[#F8FAFC] mb-3">
                  {agent.name}
                </h3>
                
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
"""

stats_section_jsx = """
import React from 'react';

export default function StatsSection() {
  const stats = [
    { label: "Analyses Performed", value: "1.2M+" },
    { label: "Consensus Accuracy", value: "98.5%" },
    { label: "Supported Regions", value: "20+" },
    { label: "Average Latency", value: "< 2s" },
  ];

  return (
    <section className="py-16 bg-[#020617] border-y border-[#334155]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 text-center lg:text-left">
          {stats.map((stat, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-3xl md:text-4xl font-semibold text-[#F8FAFC] tracking-tight mb-2">
                {stat.value}
              </span>
              <span className="text-sm text-[#CBD5E1] font-medium">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
"""

workflow_section_jsx = """
import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function WorkflowSection() {
  const steps = [
    { title: "Input", desc: "Upload high-res image." },
    { title: "Pre-process", desc: "YOLO extracts target." },
    { title: "Parallel Execution", desc: "3 AI models evaluate." },
    { title: "Consensus", desc: "Majority voting referee." },
    { title: "Output", desc: "Structured JSON data." }
  ];

  return (
    <section className="py-24 bg-[#0F172A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-12">
          
          <div className="max-w-sm">
            <h2 className="text-3xl font-semibold tracking-tight text-[#F8FAFC] mb-4">
              Pipeline Flow
            </h2>
            <p className="text-lg text-[#CBD5E1]">
              A deterministic workflow ensuring hallucination resistance through structural redundancy.
            </p>
          </div>

          <div className="flex-1 w-full overflow-x-auto pb-4 hide-scrollbar">
            <div className="flex items-center gap-4 min-w-max">
              {steps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-5 w-48 shrink-0">
                    <div className="text-xs font-mono text-[#CBD5E1] mb-2">0{i+1}</div>
                    <h4 className="text-sm font-medium text-[#F8FAFC] mb-1">{step.title}</h4>
                    <p className="text-xs text-[#CBD5E1]">{step.desc}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <ArrowRight className="w-5 h-5 text-[#334155] shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
"""

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Updated {path}")

base = "client/src/components"
write_file(f"{base}/layout/Header.jsx", header_jsx)
write_file(f"{base}/home/HeroMockup.jsx", hero_mockup_jsx)
write_file(f"{base}/home/HeroSection.jsx", hero_section_jsx)
write_file(f"{base}/home/AgentSystemSection.jsx", agent_system_section_jsx)
write_file(f"{base}/home/StatsSection.jsx", stats_section_jsx)
write_file(f"{base}/home/WorkflowSection.jsx", workflow_section_jsx)
