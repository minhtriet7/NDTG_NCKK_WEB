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
    if (s.includes("completed") || s.includes("success")) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (s.includes("failed") || s.includes("error")) return "bg-red-500/10 text-red-500 border-red-500/20";
    return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  };

  const getStatusText = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("completed") || s.includes("success")) return t.completed;
    if (s.includes("failed") || s.includes("error")) return t.failed;
    if (s.includes("needs review") || s.includes("needs_review") || s.includes("needs_better_image")) return t.needsReview;
    return status || t.unknown;
  };

  return (
    <div className="bg-surface rounded-3xl border border-border shadow-sm p-6 md:p-8 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          {t.title}
        </h2>
        <Link to="/history" className="text-sm font-semibold text-primary hover:text-primary-hover flex items-center gap-1 transition-colors">
          {t.viewAll} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="flex-grow flex flex-col">
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-border rounded-2xl bg-background/50">
            <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-3">
              <History className="w-5 h-5 text-secondary" />
            </div>
            <p className="text-sm text-secondary font-medium">{t.noHistory}</p>
          </div>
        ) : (
          <div className="space-y-4">
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
                  className="flex gap-4 p-3 rounded-2xl border border-border bg-background hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-border bg-surface">
                    <img src={imageUrl} alt="Banknote thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden w-full">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-foreground truncate text-sm">
                        {denomination}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${getStatusColor(item.status)}`}>
                        {getStatusText(item.status)}
                      </span>
                    </div>
                    <p className="text-xs text-secondary truncate mt-0.5">{country}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1.5">{date}</p>
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
