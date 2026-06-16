import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useScrollReveal } from "../../hooks/useScrollReveal";

export default function StatsSection() {
  const { t } = useTranslation();
  const ref = useScrollReveal();

  const STATS = [
    {
      value:  "1.2M+",
      label:  t("landing.stats_label_1", "Analyses Performed"),
      detail: t("landing.stats_detail_1", "and growing daily"),
      accent: "text-indigo-600 dark:text-indigo-400",
    },
    {
      value:  "99.8%",
      label:  t("landing.stats_label_2", "Consensus Accuracy"),
      detail: t("landing.stats_detail_2", "3-agent majority vote"),
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      value:  "4+",
      label:  t("landing.stats_label_3", "Global Currencies"),
      detail: t("landing.stats_detail_3", "across major economies"),
      accent: "text-purple-600 dark:text-purple-400",
    },
    {
      value:  "< 2.5s",
      label:  t("landing.stats_label_4", "Average Latency"),
      detail: t("landing.stats_detail_4", "end-to-end pipeline"),
      accent: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <section ref={ref} className="relative py-24 overflow-hidden section-deep">

      {/* Top gradient border */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.08] to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.08] to-transparent" />

      {/* Subtle background */}
      <div className="absolute inset-0 pointer-events-none
        bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(99,102,241,0.05),transparent)]
        dark:bg-gradient-to-r dark:from-indigo-500/5 dark:via-purple-500/5 dark:to-indigo-500/5" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">

        {/* ── Label ── */}
        <p className="text-center text-[11px] font-mono font-bold tracking-widest uppercase
                      text-indigo-500 dark:text-indigo-400 mb-12 scroll-reveal">
          {t("landing.stats_section_label", "Platform Metrics")}
        </p>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 md:gap-14 text-center lg:text-left">
          {STATS.map((stat, i) => (
            <StatItem key={i} stat={stat} index={i} />
          ))}
        </div>

        {/* ── Footnote ── */}
        <p className="text-center text-[11px] font-mono on-deep-muted mt-12 scroll-reveal">
          {t("landing.stats_footnote", "Metrics updated in real-time from production telemetry.")}
        </p>

      </div>
    </section>
  );
}

function StatItem({ stat, index }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex flex-col relative group"
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Vertical divider (desktop) */}
      {index > 0 && (
        <div className="hidden lg:block absolute left-[-1.5rem] top-1/2 -translate-y-1/2
                        w-px h-14 bg-slate-200 dark:bg-white/[0.08]
                        group-hover:bg-indigo-300 dark:group-hover:bg-indigo-500/40
                        transition-colors duration-300" />
      )}

      {/* Animated value */}
      <span
        className={`text-4xl md:text-5xl font-black tracking-tight mb-2 font-mono transition-all duration-500
                    ${stat.accent}
                    ${visible ? "animate-count-up" : "opacity-0"}`}
        style={{ animationDelay: `${index * 100}ms` }}
      >
        {stat.value}
      </span>

      {/* Label */}
      <span className="text-sm md:text-base font-bold uppercase tracking-wider on-deep-title mb-1">
        {stat.label}
      </span>

      {/* Detail */}
      <span className="text-xs font-mono on-deep-muted">
        {stat.detail}
      </span>
    </div>
  );
}
