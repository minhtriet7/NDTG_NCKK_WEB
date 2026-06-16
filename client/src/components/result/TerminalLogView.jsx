import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Terminal, Copy } from "lucide-react";

export default function TerminalLogView({
  safeDebateLog,
  lang = "EN",
  t,
}) {
  const [showLog, setShowLog] = useState(false);

  const handleCopyLog = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(safeDebateLog);
      toast.success(lang === "VI" ? "Đã chép nhật ký tranh biện" : "Debate log copied.");
    } catch {
      toast.error(lang === "VI" ? "Lỗi khi sao chép" : "Unable to copy log.");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm rounded-3xl overflow-hidden">
      {/* Accordion Trigger */}
      <button 
        onClick={() => setShowLog(!showLog)} 
        className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition duration-200"
      >
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Terminal size={18} className="text-indigo-600 dark:text-indigo-400" />
            {t.fullLogTitle}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.fullLogDesc}</p>
        </div>
        <div className="flex items-center gap-3">
          {showLog ? (
            <ChevronUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          )}
        </div>
      </button>

      {showLog && (
        <div className="px-6 pb-6 border-t border-slate-200 dark:border-slate-800 pt-5 bg-slate-50/50 dark:bg-black/30">
          {/* Simulated Terminal Header */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-t-xl">
            {/* Control Dots */}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            
            <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
              <Terminal size={12} className="text-indigo-400" />
              agent_debate_log.sh
            </p>

            <button 
              onClick={handleCopyLog}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
              title={lang === "VI" ? "Sao chép" : "Copy"}
            >
              <Copy size={12} />
            </button>
          </div>

          {/* Terminal Content Body */}
          <div className="bg-black border-x border-b border-slate-800 p-5 rounded-b-xl max-h-[460px] overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed text-slate-300">
            {/* Shell prompt simulation */}
            <div className="text-slate-500 mb-3 select-none">
              guest@ndtg-aggregator:~$ ./print_debate_flow.sh --verbose
            </div>
            
            <div className="prose prose-invert prose-xs max-w-none terminal-log">
              <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
