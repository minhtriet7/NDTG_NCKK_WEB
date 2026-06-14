import React from 'react';
import { Cpu, BotMessageSquare, SearchCheck, GitMerge } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AgentSystemSection() {
  const icons = [Cpu, BotMessageSquare, SearchCheck, GitMerge];
  const { t } = useTranslation();
  
  const fallbackAgents = [
    { label: "Agent 1", name: "ML / DL Model", desc: "Detects visual patterns, denomination clues, and cropped banknote regions.", accent: "teal" },
    { label: "Agent 2", name: "LLM API", desc: "Reads visible text and reasons over country, currency, material, and description.", accent: "violet" },
    { label: "Agent 3", name: "Visual Search", desc: "Compares the uploaded image with external visual references when available.", accent: "blue" },
    { label: "Aggregator", name: "Majority Voting", desc: "Applies majority voting and marks conflicts when results do not agree.", accent: "amber" }
  ];

  const agentsData = t('home.agents', { returnObjects: true });
  const agents = Array.isArray(agentsData) ? agentsData : fallbackAgents;

  return (
    <section className="py-16 md:py-28 relative overflow-hidden bg-background">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] md:w-[800px] h-[200px] md:h-[400px] bg-[#3157F6]/5 rounded-[100%] blur-[80px] md:blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-3 md:mb-4 text-foreground">
            {t('home.agentsTitle', 'The Agent System')}
          </h2>
          <p className="max-w-xl mx-auto text-sm sm:text-base md:text-lg text-secondary px-4">
            {t('home.agentsSub', 'Each agent operates independently')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {agents.map((agent, i) => {
            const Icon = icons[i];
            const isAggregator = i === 3;
            return (
              <div 
                key={i} 
                className={`group relative p-[1px] rounded-[1.2rem] md:rounded-3xl overflow-hidden transition-transform duration-500 hover:-translate-y-1 md:hover:-translate-y-2 ${isAggregator ? 'sm:col-span-2 lg:col-span-1' : ''}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#3157F6]/50 via-transparent to-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative h-full bg-surface/90 backdrop-blur-md rounded-[1.1rem] md:rounded-[23px] border border-border-theme p-6 md:p-8 flex flex-col items-start z-10 hover:bg-surface transition-colors">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-[#3157F6]/10 border border-[#3157F6]/20 flex items-center justify-center mb-5 md:mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(49,87,246,0.1)]">
                    <Icon className={`w-6 h-6 md:w-7 md:h-7 ${isAggregator ? 'text-amber-500' : 'text-[#3157F6]'}`} />
                  </div>
                  
                  <span className={`text-[9px] md:text-[10px] font-black px-3 py-1 rounded-full mb-3 md:mb-4 border ${isAggregator ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-[#3157F6]/10 text-[#3157F6] border-[#3157F6]/20'}`}>
                    {agent.label}
                  </span>
                  
                  <h3 className="text-base md:text-lg font-bold mb-2 md:mb-3 text-foreground">
                    {agent.name}
                  </h3>
                  
                  <p className="text-xs md:text-sm leading-relaxed text-secondary">
                    {agent.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
