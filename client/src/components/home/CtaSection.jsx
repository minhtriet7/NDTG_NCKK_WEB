import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";

export default function CtaSection({ isAuthenticated }) {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const ref      = useScrollReveal();

  return (
    <section ref={ref} className="relative py-28 section-deep overflow-hidden">

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[700px] h-[350px] rounded-full pointer-events-none
                      bg-indigo-500/8 dark:bg-indigo-500/10 blur-[120px]" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-400/30 dark:via-indigo-500/30 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center relative z-10 scroll-reveal">

        {/* Label */}
        <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-indigo-500 dark:text-indigo-400 mb-6">
          {t("home.ctaLabel", "Get Started")}
        </p>

        {/* Headline */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight on-deep-title mb-6 leading-[1.1]">
          {t("home.ctaTitle", "Ready to analyze a banknote?")}
        </h2>

        {/* Body */}
        <p className="text-lg on-deep-body font-medium leading-relaxed mb-10 max-w-xl mx-auto">
          {t(
            "home.ctaSub",
            "Upload an image and get a structured, consensus-based result in seconds — no setup required."
          )}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate(isAuthenticated ? "/workspace" : "/auth/login")}
            className="group relative inline-flex items-center justify-center gap-2.5 overflow-hidden
                       bg-indigo-600 text-white px-9 py-4 rounded-xl text-base font-bold
                       transition-all duration-300 hover:bg-indigo-500
                       hover:shadow-[0_0_36px_rgba(99,102,241,0.55)] hover:-translate-y-0.5"
          >
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full
                             transition-transform duration-700
                             bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            <span className="relative z-10">{t("home.ctaMain", "Start Scan")}</span>
            <ChevronRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform duration-200" />
          </button>

          <button
            onClick={() => navigate("/pricing")}
            className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-xl text-base font-bold
                       border transition-all duration-300 hover:-translate-y-0.5
                       text-slate-700 border-slate-300 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/60
                       dark:text-slate-300 dark:border-slate-700/60 dark:hover:text-white dark:hover:bg-white/5 dark:hover:border-slate-500"
          >
            {t("home.ctaSecond", "View Pricing")}
          </button>
        </div>

        {/* Trust micro-note */}
        <p className="mt-8 text-xs font-mono on-deep-muted">
          No credit card required · Free tokens on signup
        </p>

      </div>
    </section>
  );
}
