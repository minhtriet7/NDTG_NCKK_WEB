import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Layers3, Coins, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import HeroMockup from './HeroMockup';

const SCAN_ROUTE = "/workspace";

export default function HeroSection({ isAuthenticated, tokenBalance }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleStartScan = () => {
    if (isAuthenticated) {
      navigate(SCAN_ROUTE);
    } else {
      navigate('/auth/login');
    }
  };

  const heroTitle = t('home.heroTitle', 'Identify Southeast Asian Banknotes with Multi-Agent Analysis');
  
  return (
    <section className="relative overflow-hidden py-16 sm:py-24 md:py-32 bg-background">
      <div className="absolute top-[-10%] left-[-10%] w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-[#3157F6]/10 rounded-full blur-[100px] md:blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[250px] md:w-[400px] h-[250px] md:h-[400px] bg-[#3157F6]/5 rounded-full blur-[80px] md:blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 md:space-y-8">
            
            <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider bg-[#3157F6]/10 text-[#3157F6] border border-[#3157F6]/20 backdrop-blur-md">
              <Layers3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {t('home.heroBadge', 'Multi-Agent Banknote Analysis')}
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-foreground">
              {heroTitle.includes("Multi-Agent") || heroTitle.includes("đa tác tử") ? (
                <>
                  {heroTitle.split(/Multi-Agent|đa tác tử/i)[0]}
                  <span className="text-[#3157F6]">
                    {heroTitle.match(/Multi-Agent|đa tác tử/i)[0]}
                  </span>
                  {heroTitle.split(/Multi-Agent|đa tác tử/i)[1]}
                </>
              ) : (
                heroTitle
              )}
            </h1>

            <p className="text-base sm:text-lg md:text-xl leading-relaxed text-secondary max-w-2xl px-2 sm:px-0">
              {t('home.heroSubtitle', 'Upload a banknote image and compare results from visual recognition, language reasoning, and visual search before generating a structured result.')}
            </p>

            {isAuthenticated && tokenBalance !== null && (
              <div className="inline-flex items-center gap-3 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-surface border border-border-theme shadow-sm">
                <Coins className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                <span className="text-xs md:text-sm font-medium text-secondary">
                  {t('home.heroTokenLabel', 'Token Balance')}:
                </span>
                <span className="text-sm md:text-base font-black text-foreground">
                  {tokenBalance} {t('home.heroTokenUnit', 'tokens')}
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto px-4 sm:px-0">
              <button
                onClick={handleStartScan}
                className="flex items-center justify-center gap-2 bg-[#3157F6] hover:bg-[#3157F6]/90 text-white px-6 md:px-8 py-3.5 md:py-4 rounded-xl text-sm md:text-base font-bold shadow-[0_4px_20px_rgba(49,87,246,0.3)] hover:-translate-y-0.5 transition-all group active:scale-95"
              >
                {t('home.heroCta', 'Start Scan')}
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              
              <Link
                to="/directory"
                className="flex items-center justify-center gap-2 px-6 md:px-8 py-3.5 md:py-4 rounded-xl text-sm md:text-base font-bold bg-surface text-foreground border border-border-theme hover:bg-background transition-all shadow-sm active:scale-95"
              >
                {t('home.heroCtaSub', 'View Supported Banknotes')}
              </Link>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3 md:gap-6 pt-4 border-t border-border-theme w-full max-w-sm sm:max-w-md lg:max-w-none">
              {[t('home.heroPill1', '3-Agent Verification'), t('home.heroPill2', 'JSON Output'), t('home.heroPill3', 'Majority Voting')].map((pill, idx) => pill && (
                <span key={idx} className="text-xs md:text-sm font-semibold flex items-center gap-1.5 md:gap-2 text-secondary">
                  <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#3157F6]" /> {pill}
                </span>
              ))}
            </div>

          </div>

          <div className="flex-1 w-full lg:max-w-[560px] px-2 sm:px-4 lg:px-0">
            <HeroMockup />
          </div>
          
        </div>
      </div>
    </section>
  );
}
