import React from 'react';
import { UploadCloud, Zap, GitMerge, FileCheck, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function WorkflowSection() {
  const icons = [UploadCloud, Zap, GitMerge, FileCheck];
  const { t } = useTranslation();
  
  const fallbackSteps = [
    { num: "01", title: "Upload banknote image", desc: "Drag and drop or select a photo of any Southeast Asian banknote." },
    { num: "02", title: "Agents analyze independently", desc: "ML/DL model, LLM API, and Visual Search each produce their own result in parallel." },
    { num: "03", title: "Aggregator compares results", desc: "Majority voting determines the final answer; conflicts are flagged for review." },
    { num: "04", title: "Review result and export JSON", desc: "View denomination, country, material, consensus status, and download structured data." }
  ];

  const stepsData = t('home.steps', { returnObjects: true });
  const steps = Array.isArray(stepsData) ? stepsData : fallbackSteps;

  return (
    <section className="py-16 md:py-24 bg-surface border-y border-border-theme">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3 md:mb-4 text-foreground">
            {t('home.howTitle', 'How It Works')}
          </h2>
          <p className="max-w-2xl mx-auto text-sm sm:text-base md:text-lg text-secondary px-4">
            {t('home.howSub', 'Four clear steps')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-4 relative">
          <div className="hidden lg:block absolute top-12 left-[12%] right-[12%] h-[2px] bg-gradient-to-r from-transparent via-[#3157F6]/20 to-transparent pointer-events-none" />
          
          <div className="block lg:hidden absolute top-10 bottom-10 left-[50%] -translate-x-1/2 w-[2px] bg-gradient-to-b from-[#3157F6]/10 via-[#3157F6]/20 to-transparent pointer-events-none" />

          {steps.map((step, i) => {
            const Icon = icons[i] || Zap;
            return (
              <div key={i} className="relative z-10 flex flex-col items-center text-center group">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-background border border-border-theme flex items-center justify-center mb-4 md:mb-6 shadow-sm group-hover:border-[#3157F6]/50 group-hover:shadow-[0_0_30px_rgba(49,87,246,0.15)] transition-all duration-300">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-surface border border-border-theme flex items-center justify-center text-[#3157F6] group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 md:w-7 md:h-7" />
                  </div>
                </div>

                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[#3157F6] bg-[#3157F6]/10 px-2 md:px-3 py-1 rounded-full mb-3 md:mb-4">
                  Step {step.num}
                </span>

                <h3 className="text-sm md:text-base font-bold mb-2 md:mb-3 text-foreground px-2 bg-surface">
                  {step.title}
                </h3>
                <p className="text-xs md:text-sm leading-relaxed text-secondary max-w-[250px] mx-auto px-2 bg-surface">
                  {step.desc}
                </p>

                {i < steps.length - 1 && (
                  <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-border-theme hidden lg:block absolute right-[-15px] top-[40px] opacity-50" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
