import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, Brain, Cpu, Search, Check } from "lucide-react";

// --- Normalization Helpers for Frontend ---
const cleanDenom = (val) => {
  if (!val || val === "N/A") return { numeric: 0, currency: "" };
  const text = String(val).toLowerCase().replace(/\s+/g, "");
  
  // Extract numeric digits
  const numericOnly = text.replace(/[^\d]/g, "");
  const numericVal = Number(numericOnly) || 0;
  
  // Infer currency
  let currency = "";
  if (text.includes("vnd") || text.includes("₫") || text.includes("dong") || text.includes("đồng")) {
    currency = "VND";
  } else if (text.includes("usd") || text.includes("$") || text.includes("đô")) {
    currency = "USD";
  } else if (text.includes("thb") || text.includes("baht") || text.includes("฿")) {
    currency = "THB";
  } else if (text.includes("khr") || text.includes("riel") || text.includes("៛")) {
    currency = "KHR";
  } else if (text.includes("lak") || text.includes("kip") || text.includes("₭")) {
    currency = "LAK";
  } else if (text.includes("mmk") || text.includes("kyat") || text.includes("kyats")) {
    currency = "MMK";
  } else if (text.includes("myr") || text.includes("ringgit") || text.includes("rm")) {
    currency = "MYR";
  } else if (text.includes("sgd") || text.includes("dollar") || text.includes("s$")) {
    currency = "SGD";
  } else if (text.includes("idr") || text.includes("rupiah") || text.includes("rp")) {
    currency = "IDR";
  } else if (text.includes("eur") || text.includes("€")) {
    currency = "EUR";
  }
  
  return { numeric: numericVal, currency };
};

const isDenomMatched = (d1, d2) => {
  if (!d1 || !d2 || d1 === "N/A" || d2 === "N/A") return false;
  const c1 = cleanDenom(d1);
  const c2 = cleanDenom(d2);
  if (c1.numeric === 0 || c2.numeric === 0) return false;
  if (c1.currency && c2.currency && c1.currency !== c2.currency) return false;
  return c1.numeric === c2.numeric;
};

const COUNTRY_MAPPING = {
  "vietnam": "Vietnam",
  "việt nam": "Vietnam",
  "viet nam": "Vietnam",
  "vn": "Vietnam",
  "thailand": "Thailand",
  "thái lan": "Thailand",
  "thai lan": "Thailand",
  "cambodia": "Cambodia",
  "campuchia": "Cambodia",
  "laos": "Laos",
  "lào": "Laos",
  "lao": "Laos",
  "myanmar": "Myanmar",
  "miến điện": "Myanmar",
  "malaysia": "Malaysia",
  "singapore": "Singapore",
  "indonesia": "Indonesia",
  "usa": "United States",
  "mỹ": "United States",
  "hoa kỳ": "United States",
  "united states": "United States",
};

const normalizeCountry = (val) => {
  if (!val || val === "N/A") return "";
  const clean = String(val).toLowerCase().trim();
  return COUNTRY_MAPPING[clean] || val;
};

const isCountryMatched = (c1, c2) => {
  if (!c1 || !c2 || c1 === "N/A" || c2 === "N/A") return false;
  const norm1 = normalizeCountry(c1).toLowerCase();
  const norm2 = normalizeCountry(c2).toLowerCase();
  return norm1 === norm2;
};

const MATERIAL_MAPPING = {
  "polymer": "Polymer",
  "polyme": "Polymer",
  "paper": "Paper",
  "giấy": "Paper",
  "cotton": "Cotton",
  "nylon": "Polymer",
};

const normalizeMaterial = (val) => {
  if (!val || val === "N/A") return "";
  const clean = String(val).toLowerCase().trim();
  for (const [key, label] of Object.entries(MATERIAL_MAPPING)) {
    if (clean.includes(key)) return label;
  }
  return val;
};

const isMaterialMatched = (m1, m2) => {
  if (!m1 || !m2 || m1 === "N/A" || m2 === "N/A") return false;
  const norm1 = normalizeMaterial(m1).toLowerCase();
  const norm2 = normalizeMaterial(m2).toLowerCase();
  return norm1 === norm2;
};

const normalizeText = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const getAgentDenomination = (agent) =>
  normalizeText(
    agent?.menh_gia ||
      agent?.denomination ||
      agent?.final_denomination ||
      agent?.result,
  );

const getAgentCountry = (agent) =>
  normalizeText(agent?.quoc_gia || agent?.country || agent?.origin);

const getAgentReasoning = (agent) =>
  normalizeText(
    agent?.quan_diem ||
      agent?.reasoning ||
      agent?.mo_ta ||
      agent?.description ||
      agent?.error,
  );

const getAgentMethod = (agent, fallback) =>
  normalizeText(agent?.phuong_phap || agent?.method || fallback);

const stripMarkdownSymbols = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/[≡ƒñû≡ƒºá≡ƒæü∩╕ÅΓÜû∩╕ÅΓ£à≡ƒö¼≡ƒöä≡ƒôª≡ƒº╛]/g, "")
    .replace(/`/g, "")
    .trim();
};

function InfoRow({ label, value, isMatched }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800/40 pb-2">
      <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{label}</span>
      <span className="font-extrabold text-slate-800 dark:text-slate-200 text-sm text-right flex items-center gap-1 justify-end">
        {normalizeText(value)}
        {isMatched && (
          <Check size={13} className="text-emerald-500 shrink-0 stroke-[3px]" />
        )}
      </span>
    </div>
  );
}

function PipelineNode({ label, value, isMatched, lang, icon }) {
  return (
    <div className={`p-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-3 ${
      isMatched 
        ? "bg-emerald-500/[0.03] dark:bg-emerald-500/[0.02] border-emerald-200/80 dark:border-emerald-800/40 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-sm"
        : "bg-slate-50/50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/40"
    }`}>
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isMatched 
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
        }`}>
          {icon}
        </div>
        <div className="overflow-hidden">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5 truncate">{value === "N/A" || !value ? (lang === "VI" ? "Không có" : "None") : String(value)}</p>
        </div>
      </div>
      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${
        isMatched
          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-250 dark:border-slate-700"
      }`}>
        {isMatched ? (lang === "VI" ? "Khớp" : "Matched") : (lang === "VI" ? "Khác" : "Diff")}
      </span>
    </div>
  );
}

function AgentCard({ agentKey, title, method, data, finalDenomination, finalCountry, finalMaterial, t }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!data) {
    return (
      <div className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm rounded-3xl p-6 flex flex-col h-full hover:border-slate-300 dark:hover:border-slate-700 transition duration-300">
        <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider rounded mb-3 w-fit">
          {agentKey}
        </span>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 font-medium">
          {t.noAgentData}
        </p>
      </div>
    );
  }

  const agentDenomination = getAgentDenomination(data);
  const agentCountry = getAgentCountry(data);
  const agentMaterial = data?.chat_lieu || data?.material || "N/A";

  const isDenomMatch = isDenomMatched(agentDenomination, finalDenomination);
  const isCountryMatch = isCountryMatched(agentCountry, finalCountry);
  const isMaterialMatch = isMaterialMatched(agentMaterial, finalMaterial);

  const reasoningText = stripMarkdownSymbols(getAgentReasoning(data));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reasoningText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md rounded-[2rem] p-6 flex flex-col hover:border-indigo-300 dark:hover:border-indigo-800/60 hover:shadow-xl transition duration-300">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider rounded mb-2 w-fit">
            {agentKey}
          </span>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold mt-1">
            {getAgentMethod(data, method)}
          </p>
        </div>

        <span
          className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border whitespace-nowrap ${
            isDenomMatch
              ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20"
              : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
          }`}
        >
          {isDenomMatch ? t.matched : t.different}
        </span>
      </div>

      <div className="space-y-2.5 mb-6">
        <InfoRow label={t.lblDenomination} value={agentDenomination} isMatched={isDenomMatch} />
        <InfoRow label={t.lblCountry} value={agentCountry} isMatched={isCountryMatch} />
        <InfoRow label={t.lblMaterial} value={agentMaterial} isMatched={isMaterialMatch} />
      </div>

      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800/50">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {t.lblReasoning}
          </p>
          <button 
            onClick={handleCopy} 
            className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer transition active:scale-95"
          >
            {copied ? (t.lang === "VI" ? "Đã copy!" : "Copied!") : (t.lang === "VI" ? "Sao chép" : "Copy")}
          </button>
        </div>

        <div
          className={`text-xs text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl leading-relaxed ${
            !isExpanded ? "line-clamp-4" : ""
          }`}
        >
          <div className="prose prose-xs prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{reasoningText}</ReactMarkdown>
          </div>
        </div>

        {reasoningText.length > 150 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-black transition-colors flex items-center gap-1 cursor-pointer"
          >
            {isExpanded ? (
              <>
                {t.showLess} <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                {t.readFull} <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AgentCompareBento({
  agents,
  finalDenomination,
  finalCountry,
  finalMaterial,
  matchedAgents,
  consensus,
  lang = "EN",
  t,
}) {
  return (
    <div className="space-y-8">
      {/* Aggregator decision flow map */}
      <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md rounded-[2rem] p-6 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition duration-300">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t.aggDecision}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">{t.aggDesc}</p>
        
        <div className="py-2 grid grid-cols-1 md:grid-cols-12 items-center gap-4 relative">
          {/* Inputs Column */}
          <div className="flex flex-col gap-3.5 col-span-1 md:col-span-5 z-10">
            <PipelineNode 
              label="ChatGPT Vision" 
              value={getAgentDenomination(agents.ml_dl)} 
              isMatched={isDenomMatched(getAgentDenomination(agents.ml_dl), finalDenomination)} 
              lang={lang}
              icon={<Search size={15} />}
            />
            <PipelineNode 
              label="LLM" 
              value={getAgentDenomination(agents.llm_api)} 
              isMatched={isDenomMatched(getAgentDenomination(agents.llm_api), finalDenomination)} 
              lang={lang}
              icon={<Brain size={15} />}
            />
            <PipelineNode 
              label={lang === "VI" ? "Tìm kiếm ảnh" : "Visual Search"} 
              value={getAgentDenomination(agents.visual_search)} 
              isMatched={isDenomMatched(getAgentDenomination(agents.visual_search), finalDenomination)} 
              lang={lang}
              icon={<Cpu size={15} />}
            />
          </div>
          
          {/* SVG Connector Column (Converging lines) */}
          <div className="col-span-1 md:col-span-2 flex justify-center items-center h-full">
            {/* Desktop Converging paths */}
            <svg className="w-full h-36 hidden md:block text-indigo-400 dark:text-indigo-800" viewBox="0 0 120 120" fill="none" stroke="currentColor">
              <path d="M 10 20 L 50 20 Q 80 20 80 60" strokeWidth="2.2" strokeDasharray="4 3" className="opacity-45" />
              <path d="M 10 60 L 80 60" strokeWidth="2.2" strokeDasharray="4 3" className="opacity-45" />
              <path d="M 10 100 L 50 100 Q 80 100 80 60" strokeWidth="2.2" strokeDasharray="4 3" className="opacity-45" />
              <path d="M 80 60 L 115 60" strokeWidth="3" stroke="#6366F1" />
              <polygon points="112,56 120,60 112,64" fill="#6366F1" stroke="none" />
              <circle cx="80" cy="60" r="4.5" fill="#6366F1" className="animate-ping" style={{ transformOrigin: "80px 60px" }} />
              <circle cx="80" cy="60" r="3" fill="#6366F1" stroke="none" />
            </svg>
            
            {/* Mobile arrow */}
            <div className="md:hidden flex items-center justify-center py-2">
              <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                ↓
              </div>
            </div>
          </div>
          
          {/* Aggregator Result Box */}
          <div className="col-span-1 md:col-span-5 z-10 h-full flex items-center">
            <div className="w-full p-5 rounded-[1.5rem] bg-indigo-500/[0.04] dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/40 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{lang === "VI" ? "Bộ tổng hợp AI" : "AI Aggregator"}</p>
              </div>
              <p className="text-2xl font-black bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700 dark:from-indigo-400 dark:to-indigo-300 bg-clip-text text-transparent tracking-tight">{finalDenomination}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed font-semibold">
                {consensus?.method === "majority_vote" || consensus?.method === "multi_object_pipeline"
                  ? (lang === "VI" ? `Đồng thuận đa số (${matchedAgents}/3 tác tử)` : `Majority consensus (${matchedAgents}/3 agents)`)
                  : consensus?.method || "Majority vote"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Cards of individual agents */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">{t.agentCompare}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <AgentCard agentKey="Agent 1" title="ChatGPT Vision" method={lang === "VI" ? "Trí tuệ nhân tạo (ChatGPT)" : "Generative AI (ChatGPT)"} data={agents.ml_dl} finalDenomination={finalDenomination} finalCountry={finalCountry} finalMaterial={finalMaterial} t={t} />
          <AgentCard agentKey="Agent 2" title="LLM" method={lang === "VI" ? "Suy luận ngôn ngữ lớn" : "Language reasoning"} data={agents.llm_api} finalDenomination={finalDenomination} finalCountry={finalCountry} finalMaterial={finalMaterial} t={t} />
          <AgentCard agentKey="Agent 3" title={lang === "VI" ? "Tìm kiếm ảnh" : "Visual Search"} method={lang === "VI" ? "Đối chiếu ảnh bên ngoài" : "External matching"} data={agents.visual_search} finalDenomination={finalDenomination} finalCountry={finalCountry} finalMaterial={finalMaterial} t={t} />
        </div>
      </div>
    </div>
  );
}
