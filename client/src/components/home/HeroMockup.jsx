import React, { useState, useEffect } from 'react';
import { Cpu, BotMessageSquare, SearchCheck, GitMerge, Zap, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function HeroMockup() {
  const [tick, setTick] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    const id = setInterval(() => setTick((v) => (v + 1) % 4), 1500);
    return () => clearInterval(id);
  }, []);

  const agentStates = [
    { label: t('home.mockAgent1', 'ML/DL Agent'), icon: Cpu },
    { label: t('home.mockAgent2', 'LLM Agent'), icon: BotMessageSquare },
    { label: t('home.mockAgent3', 'Visual Search'), icon: SearchCheck },
  ];

  return (
    <div className="relative group">
      <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full opacity-50 group-hover:opacity-80 transition-opacity duration-700 pointer-events-none" />

      <div className="relative bg-surface/90 backdrop-blur-xl border border-border-theme rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-700 hover:scale-[1.02]">
        
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border-theme bg-background/50">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex gap-1.5 md:gap-2">
              <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs md:text-sm font-semibold text-secondary ml-2">
              {t('home.mockTitle', 'BanknoteAI Workspace')}
            </span>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold text-primary uppercase tracking-wider">
            <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 animate-pulse" /> <span className="hidden sm:inline">{t('home.mockSub', 'Multi-Agent Engine')}</span>
          </span>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          <div className="border-2 border-dashed border-primary/30 bg-primary/5 rounded-xl md:rounded-2xl p-4 md:p-6 flex items-center gap-4 md:gap-5">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm md:text-base font-bold text-foreground">
                {t('home.mockUpload', 'Upload Banknote Image')}
              </p>
              <p className="text-xs md:text-sm text-secondary">
                {t('home.mockUploadSub', 'JPG, PNG, WEBP supported')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {agentStates.map((a, i) => {
              const done = i < tick;
              return (
                <div
                  key={i}
                  className={`p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all duration-500 text-center ${
                    done
                      ? "bg-primary/10 border-primary/30"
                      : "bg-background border-border-theme"
                  }`}
                >
                  <a.icon className={`w-4 h-4 md:w-5 md:h-5 mx-auto mb-1.5 md:mb-2 ${done ? "text-primary" : "text-secondary"}`} />
                  <p className={`text-[9px] md:text-[11px] font-bold leading-tight mb-1.5 md:mb-2 ${done ? "text-primary" : "text-secondary"}`}>
                    {a.label}
                  </p>
                  <span
                    className={`inline-block text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full ${
                      done
                        ? "bg-primary text-white shadow-md shadow-primary/30"
                        : "bg-surface border border-border-theme text-secondary"
                    }`}
                  >
                    {done ? t('home.mockConsensus', 'Consensus') : t('home.mockPending', 'Pending')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="bg-background border border-border-theme rounded-xl md:rounded-2xl p-4 md:p-5 flex items-center gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <GitMerge className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-bold text-foreground">{t('home.mockAgg', 'Aggregator Decision')}</p>
              <p className="text-[10px] md:text-xs text-secondary truncate">
                {t('home.mockAggSub', 'Majority vote in progress...')}
              </p>
            </div>
            <div className="flex gap-1 md:gap-1.5 shrink-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 md:w-2 h-4 md:h-5 rounded-full transition-all duration-300 ${
                    i <= tick % 4 ? "bg-primary" : "bg-border-theme"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a] rounded-xl md:rounded-2xl p-4 md:p-5 font-mono border border-border-theme">
            <p className="text-[10px] md:text-xs text-slate-400 font-sans font-bold mb-2 md:mb-3 uppercase tracking-wider">
              {t('home.mockJson', 'Structured output')}
            </p>
            <p className="text-[11px] md:text-[13px] leading-relaxed text-slate-300">
              <span className="text-slate-500">{"{"}</span>
              <br />
              <span className="text-primary ml-2 md:ml-4">"denomination":</span>{" "}
              <span className="text-amber-400">"50000 VND"</span>
              {","}
              <br />
              <span className="text-primary ml-2 md:ml-4">"status":</span>{" "}
              <span className="text-green-400">"Completed"</span>
              <br />
              <span className="text-slate-500">{"}"}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
