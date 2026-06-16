import React from 'react';
import { useAppStore } from '../../../store/appStore';
import { ScanLine, BrainCircuit, Award } from 'lucide-react';

export default function ResultSection({ result }) {
  const { theme, lang } = useAppStore();
  const isDark = theme === 'dark';

  const t = {
    EN: { final: "Final Result", conf: "Confidence", yolo: "ChatGPT Agent", gemini: "Gemini Agent" },
    VI: { final: "Kết quả Cuối cùng", conf: "Độ tin cậy", yolo: "Tác tử ChatGPT", gemini: "Tác tử Gemini" }
  }[lang];

  if (!result) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
      
      {/* KHỐI TRỌNG TÀI TỔNG HỢP (KẾT QUẢ CUỐI) */}
      <div className={`p-6 md:p-8 rounded-3xl border shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 ${isDark ? 'bg-slate-900 border-teal-800/50 shadow-teal-900/20' : 'bg-white border-teal-200 shadow-teal-100'}`}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#009688] rounded-2xl flex items-center justify-center shadow-inner">
            <Award className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#009688] uppercase tracking-widest">{t.final}</p>
            <h2 className={`text-3xl md:text-4xl font-extrabold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {result.final_value} {result.currency}
            </h2>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500 uppercase tracking-widest font-bold">{t.conf}</p>
          <p className={`text-3xl font-black ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>{result.confidence}%</p>
        </div>
      </div>

      {/* CHI TIẾT CÁC AGENT CON */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* YOLO AGENT */}
        <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><ScanLine className="w-5 h-5" /></div>
            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.yolo}</h3>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Visual Details</p>
              <p className={`font-mono mt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{result.yolo?.label || 'N/A'}</p>
            </div>
            <div className={`text-xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{result.yolo?.confidence || 0}%</div>
          </div>
        </div>

        {/* GEMINI AGENT */}
        <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-800 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><BrainCircuit className="w-5 h-5" /></div>
            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.gemini}</h3>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">Semantics</p>
              <p className={`font-mono mt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{result.gemini?.label || 'N/A'}</p>
            </div>
            <div className={`text-xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>{result.gemini?.confidence || 0}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}