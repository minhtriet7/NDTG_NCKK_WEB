import React from 'react';
import { useTranslation } from 'react-i18next';

export default function StatsSection({ stats }) {
  const { t: i18n_t } = useTranslation();
  const t = i18n_t('home', { returnObjects: true });

  if (!stats || stats.length === 0) return null;

  return (
    <section className="py-16 md:py-20 bg-background border-t border-border-theme relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <p className="text-center text-[10px] md:text-xs font-bold uppercase tracking-widest text-foreground opacity-50 mb-8 md:mb-10">
          {t?.statsTitle}
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat, i) => (
            <div 
              key={i}
              className="bg-surface rounded-2xl md:rounded-3xl p-5 md:p-8 border border-border-theme shadow-sm hover:shadow-lg hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-primary/10 text-primary mb-4 md:mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                <stat.icon className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <h3 className="text-2xl md:text-3xl lg:text-4xl font-black mb-1 md:mb-2 text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70 group-hover:from-primary group-hover:to-blue-400 transition-colors duration-300">
                {stat.value}
              </h3>
              <p className="text-xs md:text-sm font-medium text-foreground opacity-60">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
