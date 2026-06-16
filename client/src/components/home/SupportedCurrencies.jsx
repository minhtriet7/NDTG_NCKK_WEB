import { useTranslation } from "react-i18next";
import { useScrollReveal } from "../../hooks/useScrollReveal";

const CURRENCIES = [
  {
    code:     "VND",
    name:     "Vietnamese Dong",
    country:  "Vietnam",
    gradient: "from-red-500/15 via-yellow-500/10 to-transparent dark:from-red-500/20 dark:via-yellow-500/10",
    accent:   "text-red-600 dark:text-red-400",
    bar:      "bg-red-500",
    note:     "500,000 – Polymer",
    image:    "/currencies/vnd.jpg",
    status:   "High Accuracy",
    features: ["Polymer substrate", "UV-reactive ink", "Latent image"],
  },
  {
    code:     "USD",
    name:     "US Dollar",
    country:  "United States",
    gradient: "from-emerald-500/15 via-teal-500/8 to-transparent dark:from-emerald-500/20 dark:via-teal-500/10",
    accent:   "text-emerald-600 dark:text-emerald-400",
    bar:      "bg-emerald-500",
    note:     "100 – Federal Reserve",
    image:    "/currencies/usd.jpg",
    status:   "High Accuracy",
    features: ["Security thread", "Color-shift ink", "Microprinting"],
  },
  {
    code:     "EUR",
    name:     "Euro",
    country:  "European Union",
    gradient: "from-blue-500/15 via-indigo-500/8 to-transparent dark:from-blue-500/20 dark:via-indigo-500/10",
    accent:   "text-blue-600 dark:text-blue-400",
    bar:      "bg-blue-500",
    note:     "100 – Europa Series",
    image:    "/currencies/eur.jpg",
    status:   "High Accuracy",
    features: ["Hologram stripe", "Emerald number", "Portrait window"],
  },
  {
    code:     "JPY",
    name:     "Japanese Yen",
    country:  "Japan",
    gradient: "from-purple-500/15 via-pink-500/8 to-transparent dark:from-purple-500/20 dark:via-pink-500/10",
    accent:   "text-purple-600 dark:text-purple-400",
    bar:      "bg-purple-500",
    note:     "10,000 – Fukuzawa",
    image:    "/currencies/jpy.jpg",
    status:   "High Accuracy",
    features: ["Hologram foil", "Watermark", "Iridescent ink"],
  },
];

export default function SupportedCurrencies() {
  const { t } = useTranslation();
  const ref   = useScrollReveal();

  return (
    <section ref={ref} className="py-24 section-alt overflow-hidden relative">

      {/* Subtle top/bottom dividers */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.06] to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.06] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* ── Section header ── */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 scroll-reveal">
          <div>
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 border border-indigo-500/20 mb-5 shadow-sm backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-indigo-700 dark:text-indigo-300">
                {t("landing.curr_label", "Coverage")}
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight on-deep-title">
              {t("landing.curr_title", "Supported Currencies")}
            </h2>
          </div>
          <p className="max-w-sm text-base on-deep-body font-medium leading-relaxed md:text-right">
            {t(
              "landing.curr_desc",
              "Out-of-the-box support for major global currencies, powered by extensive LLM knowledge graphs."
            )}
          </p>
        </div>

        {/* ── Currency cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CURRENCIES.map((currency, i) => (
            <div
              key={i}
              className={`group relative flex flex-col rounded-2xl overflow-hidden
                           border border-slate-200 dark:border-white/[0.07]
                           bg-white dark:bg-white/[0.03] backdrop-blur-sm
                           hover:border-slate-300 dark:hover:border-white/[0.12]
                           hover:shadow-lg dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
                           transition-all duration-400 bento-card
                           scroll-reveal reveal-delay-${i + 1}`}
            >
              {/* Currency header with gradient */}
              <div className={`relative p-6 bg-gradient-to-br ${currency.gradient}`}>
                <div className="flex items-start justify-between mb-6">
                  {/* Currency code — large typographic treatment */}
                  <span className={`text-4xl font-black font-mono tracking-tight ${currency.accent}`}>
                    {currency.code}
                  </span>
                  {/* Status badge */}
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full
                                   bg-emerald-50 text-emerald-700
                                   dark:bg-emerald-500/10 dark:text-emerald-400
                                   border border-emerald-200 dark:border-emerald-500/20">
                    {currency.status}
                  </span>
                </div>

                {/* Representative denomination / Image */}
                <div className="h-32 flex items-center justify-center relative
                                rounded-xl border border-slate-200 dark:border-white/[0.08]
                                bg-slate-100/50 dark:bg-slate-800/30 overflow-hidden group-hover:border-indigo-500/40 transition-colors duration-500">
                  {currency.image ? (
                    <>
                      <img
                        src={currency.image}
                        alt={currency.note}
                        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex justify-center">
                        <span className={`text-sm font-black font-mono px-3 py-1 rounded-lg backdrop-blur-md bg-white/20 dark:bg-black/40 border border-white/20 dark:border-white/10 text-white shadow-lg`}>
                          {currency.note}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className={`text-xl font-black font-mono ${currency.accent} opacity-60
                                      group-hover:opacity-90 transition-opacity duration-300`}>
                      {currency.note}
                    </span>
                  )}
                </div>
              </div>

              {/* Info section */}
              <div className="p-5 flex flex-col gap-3 flex-grow
                              border-t border-slate-100 dark:border-white/[0.05]">
                <div>
                  <h4 className="text-base font-bold on-deep-title leading-tight">{currency.name}</h4>
                  <p className="text-xs on-deep-muted font-mono mt-0.5">{currency.country}</p>
                </div>

                {/* Security features */}
                <ul className="space-y-1 mt-1">
                  {currency.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${currency.bar}`} />
                      <span className="text-[11px] on-deep-muted font-medium">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bottom accent bar */}
              <div className={`h-[3px] ${currency.bar} w-0 group-hover:w-full transition-all duration-600 ease-out`} />
            </div>
          ))}
        </div>

        {/* ── More coming note ── */}
        <p className="text-center text-[12px] font-mono on-deep-muted mt-8 scroll-reveal">
          Additional currencies available via custom model training.
        </p>

      </div>
    </section>
  );
}
