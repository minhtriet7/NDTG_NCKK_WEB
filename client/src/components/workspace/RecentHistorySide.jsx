import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, History, Loader2, ArrowRight } from "lucide-react";
import { getMyHistory } from "../../services/userService";
import { useAppStore } from "../../store/appStore";


export default function RecentHistorySide() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { lang } = useAppStore();

  const t = {
    EN: {
      title: "Recent Scans",
      viewAll: "View all",
      noHistory: "No scan history yet.",
      completed: "Completed",
      failed: "Failed",
      needsReview: "Needs Review",
      unknown: "Unknown",
    },
    VI: {
      title: "Quét gần đây",
      viewAll: "Xem tất cả",
      noHistory: "Chưa có lịch sử quét.",
      completed: "Hoàn tất",
      failed: "Thất bại",
      needsReview: "Cần xem lại",
      unknown: "Không rõ",
    }
  }[lang || "EN"];

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const data = await getMyHistory();
        if (isMounted) {
          // Chỉ lấy 4 kết quả gần nhất để hiện trên sidebar
          setHistory((data || []).slice(0, 4));
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("completed") || s.includes("success")) return "bg-emerald-500";
    if (s.includes("failed") || s.includes("error")) return "bg-rose-500";
    return "bg-amber-500";
  };

  const getStatusText = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("completed") || s.includes("success")) return t.completed;
    if (s.includes("failed") || s.includes("error")) return t.failed;
    if (s.includes("needs review") || s.includes("needs_review") || s.includes("needs_better_image")) return t.needsReview;
    return status || t.unknown;
  };

  return (
    <div className="p-6 md:p-8 flex flex-col h-full bg-white/50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {t.title}
        </h2>
        <Link to="/history" className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 uppercase tracking-widest transition-colors flex items-center gap-1">
          {t.viewAll} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex-grow flex flex-col">
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400 dark:text-slate-600" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-300 dark:border-slate-800 rounded bg-slate-50/50 dark:bg-slate-900/30">
            <p className="text-sm text-slate-500 font-mono">{t.noHistory}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {history.map((item) => {
              const finalResult = item.final_result || {};
              const denomination = finalResult.final_denomination || finalResult.menh_gia || finalResult.denomination || "N/A";
              const country = finalResult.final_country || finalResult.quoc_gia || finalResult.country || "Unknown";
              const imageUrl = item.uploaded_image_url || "https://via.placeholder.com/150";
              const date = new Date(item.created_at).toLocaleDateString(lang === "VI" ? "vi-VN" : "en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
                <Link 
                  key={item.id} 
                  to="/result" 
                  state={{ scanResult: item }}
                  className="flex gap-4 py-3 border-b border-slate-200 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group"
                >
                  <div className="w-12 h-12 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded">
                    <img src={imageUrl} alt="Banknote thumbnail" className="w-full h-full object-cover grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" />
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden w-full">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate text-sm">
                        {denomination}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(item.status)}`}></span>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">{getStatusText(item.status)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{country}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono mt-1">{date}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
