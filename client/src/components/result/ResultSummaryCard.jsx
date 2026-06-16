import React from "react";
import { CheckCircle, Cpu, Search, Coins } from "lucide-react";

const CircularProgress = ({ percentage, size = 110, strokeWidth = 7 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  let color = "#10B981"; // Emerald
  if (percentage < 70) color = "#F43F5E"; // Rose
  else if (percentage < 90) color = "#F59E0B"; // Amber
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.05)]">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth={strokeWidth} fill="none" />
        <circle 
          cx={size / 2} 
          cy={size / 2} 
          r={radius} 
          stroke={color} 
          strokeWidth={strokeWidth} 
          strokeDasharray={circumference} 
          strokeDashoffset={offset} 
          strokeLinecap="round" 
          fill="none" 
          className="transition-all duration-1000 ease-out" 
          style={{ filter: `drop-shadow(0 0 4px ${color}a0)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
          {percentage.toFixed(1)}
          <span className="text-xs text-slate-400 font-bold">%</span>
        </span>
      </div>
    </div>
  );
};

export default function ResultSummaryCard({
  finalDenomination,
  finalCountry,
  finalCurrency,
  finalMaterial,
  confidence,
  matchedAgents,
  aiFeatures = [],
  lang = "EN",
  ratesData = null,
}) {
  // VND Equivalent Calculation
  const parseAmountFromDenomination = (value) => {
    if (!value) return 0;
    const raw = String(value)
      .replace(/[^\d.,]/g, "")
      .replace(/\./g, "")
      .replace(/,/g, "");
    return parseInt(raw, 10) || 0;
  };

  const amountVal = parseAmountFromDenomination(finalDenomination);
  const normalizedCurrency = String(finalCurrency || "").toUpperCase();
  const rates = ratesData?.rates || {};
  
  let convertedText = "N/A";
  let showVndHighlight = false;

  if (amountVal > 0) {
    if (normalizedCurrency === "VND") {
      convertedText = `${amountVal.toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} VND`;
      showVndHighlight = true;
    } else {
      const rateToVnd = Number(rates[normalizedCurrency] || 0);
      if (rateToVnd > 0) {
        const convertedVnd = amountVal * rateToVnd;
        convertedText = `~ ${Math.round(convertedVnd).toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} VND`;
        showVndHighlight = true;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* MAIN AI RESULT */}
      <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md rounded-[2rem] p-6 relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <Cpu size={18} className="text-indigo-650 dark:text-indigo-400" />
          {lang === "VI" ? "Kết quả nhận diện AI" : "AI Recognition Results"}
        </h2>
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div className="flex-1 space-y-5 w-full">
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black tracking-wider uppercase">{lang === "VI" ? "Mệnh giá" : "Denomination"}</p>
              <p className="text-3xl font-black bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700 dark:from-indigo-400 dark:to-indigo-300 bg-clip-text text-transparent tracking-tight mt-1">{finalDenomination}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black tracking-wider uppercase">{lang === "VI" ? "Quốc gia" : "Country"}</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">{finalCountry}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-slate-50/50 dark:bg-slate-800/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider mb-1">{lang === "VI" ? "Tiền Tệ" : "Currency"}</p>
                <p className="font-extrabold text-sm text-indigo-650 dark:text-indigo-400">{finalCurrency}</p>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-800/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider mb-1">{lang === "VI" ? "Chất Liệu" : "Material"}</p>
                <p className="font-extrabold text-sm text-slate-700 dark:text-slate-350">{finalMaterial}</p>
              </div>
            </div>
          </div>
          
          <div className="flex-shrink-0 flex flex-col items-center justify-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3 font-black tracking-wider uppercase">{lang === "VI" ? "Độ tin cậy" : "Confidence"}</p>
            <CircularProgress percentage={confidence} size={110} strokeWidth={6} />
          </div>
        </div>

        {/* VND Equivalent Highlight Box */}
        {showVndHighlight && (
          <div className="mt-5 p-4 rounded-[1.5rem] bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 shadow-sm relative overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-700 transition duration-300">
            <div className="absolute top-0 right-0 p-3.5 opacity-10 dark:opacity-20 group-hover:scale-110 transition duration-300">
              <Coins size={36} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black tracking-wider uppercase mb-1">
              {lang === "VI" ? "Giá trị quy đổi Việt Nam" : "Vietnamese Dong Equivalent"}
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">
              {convertedText}
            </p>
            {normalizedCurrency !== "VND" && rates[normalizedCurrency] && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                {lang === "VI" 
                  ? `Tỷ giá quy đổi: 1 ${normalizedCurrency} ≈ ${Math.round(rates[normalizedCurrency]).toLocaleString("vi-VN")} VND` 
                  : `Rate: 1 ${normalizedCurrency} ≈ ${Math.round(rates[normalizedCurrency]).toLocaleString("en-US")} VND`}
              </p>
            )}
            {normalizedCurrency === "VND" && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                {lang === "VI" ? "Đồng nội tệ Việt Nam chính thức" : "Official Vietnamese national currency"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI DETECTED FEATURES */}
      <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md rounded-[2rem] p-6 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Search size={16} className="text-indigo-605 dark:text-indigo-400" />
          {lang === "VI" ? "Đặc điểm AI nhận diện" : "AI Detected Features"}
        </h3>
        <ul className="space-y-3">
          {aiFeatures.map((feat, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle size={14} strokeWidth={2.5} />
              </div>
              <span className="text-sm text-slate-650 dark:text-slate-300 leading-relaxed font-medium">{feat}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* RECOGNITION SUMMARY */}
      <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md rounded-[2rem] p-6 hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300">
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">AI Prediction Summary</h3>
        <p className="text-sm text-slate-605 dark:text-slate-305 leading-relaxed border-l-2 border-indigo-500 pl-3">
          {lang === "VI" ? (
            <>
              Hệ thống AI phân tích và xác định hình ảnh chứa tiền giấy <strong className="text-slate-950 dark:text-white font-extrabold">{finalCountry}</strong> mệnh giá <strong className="text-slate-950 dark:text-white font-extrabold">{finalDenomination}</strong> với độ tin cậy <strong className="text-indigo-650 dark:text-indigo-400 font-extrabold">{confidence.toFixed(1)}%</strong>.
              {matchedAgents > 0 ? ` Dựa trên mức độ đồng thuận ${matchedAgents}/3 tác tử, mô hình xác thực thành công các đặc trưng chính yếu của tờ tiền.` : " Không có sự đồng thuận rõ ràng giữa các mô hình."}
            </>
          ) : (
            <>
              The AI system analyzed and identified the banknote as <strong className="text-slate-950 dark:text-white font-extrabold">{finalCountry}</strong> with denomination <strong className="text-slate-950 dark:text-white font-extrabold">{finalDenomination}</strong> at <strong className="text-indigo-650 dark:text-indigo-400 font-extrabold">{confidence.toFixed(1)}%</strong> confidence.
              {matchedAgents > 0 ? ` Based on a ${matchedAgents}/3 agent consensus, the model successfully validated key security features.` : " No clear consensus was reached among the models."}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
