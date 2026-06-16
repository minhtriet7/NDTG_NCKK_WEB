import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Network, ChevronRight, Zap, Shield, Globe } from "lucide-react";
import HeroMockup from "./HeroMockup";

const trustBadges = [
  { icon: Zap,    label: "< 2.5s Latency" },
  { icon: Shield, label: "99.8% Accuracy"  },
  { icon: Globe,  label: "20+ Currencies"  },
];

export default function HeroSection({ isAuthenticated }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden min-h-[94vh] flex items-center justify-center section-deep">

      {/* ── Gradient orbs ── */}
      <div
        className="absolute top-[-8%] left-[8%] w-[640px] h-[640px] rounded-full
                   bg-indigo-600/10 dark:bg-indigo-600/10 blur-[130px] pointer-events-none animate-float"
        style={{ animationDuration: "9s" }}
      />
      <div
        className="absolute bottom-[-6%] right-[4%] w-[520px] h-[520px] rounded-full
                   bg-purple-600/8 dark:bg-purple-600/8 blur-[110px] pointer-events-none animate-float"
        style={{ animationDelay: "3s", animationDuration: "11s" }}
      />
      <div
        className="absolute top-[35%] right-[18%] w-[320px] h-[320px] rounded-full
                   bg-cyan-500/6 dark:bg-cyan-500/6 blur-[90px] pointer-events-none animate-float"
        style={{ animationDelay: "5s", animationDuration: "13s" }}
      />

      {/* ── Grid background ── */}
      <div
        className="absolute inset-0 pointer-events-none
          bg-[linear-gradient(to_right,rgba(99,102,241,0.07)_1px,transparent_1px),
              linear-gradient(to_bottom,rgba(99,102,241,0.07)_1px,transparent_1px)]
          dark:bg-[linear-gradient(to_right,#1E293B40_1px,transparent_1px),
                   linear-gradient(to_bottom,#1E293B40_1px,transparent_1px)]
          bg-[size:2.5rem_2.5rem]
          [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)]"
      />

      {/* ── Top glow bar ── */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[240px] opacity-[0.12] dark:opacity-[0.15] bg-indigo-500 blur-[110px] rounded-full pointer-events-none" />

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 w-full py-20 lg:py-28">
        <div className="flex flex-col lg:flex-row items-center gap-14 lg:gap-20">

          {/* Left — Text */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-7">



            {/* Headline */}
            <h1 className="animate-stagger stagger-2 text-[2.6rem] sm:text-5xl md:text-[3.4rem] xl:text-[3.8rem]
                           font-black tracking-tight leading-[1.07] on-deep-title">
              {t("landing.hero_title_1", "Verify banknotes with")}{" "}
              <br className="hidden sm:block" />
              <span className="gradient-text-brand">
                {t("landing.hero_title_2", "multi-agent")}
              </span>{" "}
              {t("landing.hero_title_3", "intelligence.")}
            </h1>

            {/* Subtitle */}
            <p className="animate-stagger stagger-3 text-base sm:text-lg leading-relaxed on-deep-body max-w-lg font-medium">
              {t(
                "landing.hero_desc",
                "An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth for every banknote."
              )}
            </p>

            {/* CTA */}
            <div className="animate-stagger stagger-4 flex flex-col sm:flex-row gap-3.5 w-full sm:w-auto pt-1">
              <button
                onClick={() => navigate(isAuthenticated ? "/workspace" : "/auth/login")}
                className="group relative flex items-center justify-center gap-2.5 overflow-hidden
                           bg-indigo-600 text-white px-8 py-3.5 rounded-xl text-sm font-bold
                           transition-all duration-300 hover:bg-indigo-500
                           hover:shadow-[0_0_32px_rgba(99,102,241,0.55)] hover:-translate-y-0.5
                           w-full sm:w-auto"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full
                                 transition-transform duration-700
                                 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <span className="relative z-10">{t("landing.btn_start", "Start Workspace")}</span>
                <ChevronRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform duration-200" />
              </button>

              <button
                onClick={() => navigate("/directory")}
                className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold
                           border transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto backdrop-blur-sm
                           text-slate-700 border-slate-300 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/60
                           dark:text-slate-300 dark:border-slate-700/60 dark:hover:text-white dark:hover:bg-white/5 dark:hover:border-slate-500"
              >
                {t("landing.btn_docs", "Explore Directory")}
              </button>
            </div>

            {/* Trust badges */}
            <div className="animate-stagger stagger-5 flex items-center flex-wrap gap-x-6 gap-y-2 pt-1">
              {trustBadges.map(({ icon: Icon, label }, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs font-semibold on-deep-muted">
                  <Icon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Mockup */}
          <div
            className="flex-1 w-full lg:max-w-[560px] animate-float"
            style={{ animationDuration: "7s" }}
          >
            <HeroMockup />
          </div>

        </div>
      </div>

      {/* ── Bottom fade ── */}
      <div className="absolute bottom-0 inset-x-0 h-36 pointer-events-none
                      bg-gradient-to-t from-[var(--section-deep)] to-transparent" />
    </section>
  );
}
