import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertCircle } from "lucide-react";
import { getMyHistory } from "../../services/userService";
import { useAppStore } from "../../store/appStore";

const STATUS_CONFIG = {
  completed: { label: "Completed", labelVI: "Hoàn tất", color: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  success: { label: "Completed", labelVI: "Hoàn tất", color: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Failed", labelVI: "Thất bại", color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  error: { label: "Failed", labelVI: "Thất bại", color: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  needs_review: { label: "Needs Review", labelVI: "Cần xem lại", color: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  needs_better_image: { label: "Low Quality", labelVI: "Ảnh kém", color: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  no_banknote_detected: { label: "No Banknote", labelVI: "Không phát hiện", color: "bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
};

function getStatusConfig(status) {
  const key = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const config = STATUS_CONFIG[key];
  if (!config) return { label: status || "Unknown", labelVI: status || "Không rõ", color: "bg-slate-400", text: "text-slate-500" };
  return config;
}

function SkeletonItem() {
  return (
    <div className="flex gap-3 p-3 animate-pulse">
      <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3.5 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-2.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

export default function RecentHistorySide() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { lang } = useAppStore();

  const t = {
    EN: {
      title: "Recent Scans",
      viewAll: "View all",
      noHistory: "No recent scans yet.",
      noImage: "No image",
      loadError: "Failed to load history.",
      retry: "Retry",
    },
    VI: {
      noImage: "Không có ảnh",
      title: "Quét gần đây",
      viewAll: "Xem tất cả",
      noHistory: "Chưa có lần quét gần đây.",
      loadError: "Không thể tải lịch sử.",
      retry: "Thử lại",
    },
  }[lang || "EN"];

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyHistory();
      setHistory((data || []).slice(0, 5));
    } catch (err) {
      console.error("Failed to fetch history:", err);
      setError(t.loadError);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {t.title}
        </h2>
        <Link
          to="/history"
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 transition-colors"
        >
          {t.viewAll}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-col">
        {isLoading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3].map((i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/20">
              <AlertCircle className="h-4 w-4 text-rose-500" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{error}</p>
            <button
              onClick={fetchHistory}
              className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {t.retry}
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center px-5 py-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.noHistory}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((item, i) => {
              const finalResult = item?.final_result || {};
              const denomination =
                finalResult?.final_denomination ||
                finalResult?.menh_gia ||
                finalResult?.denomination ||
                "N/A";
              const country =
                finalResult?.final_country ||
                finalResult?.quoc_gia ||
                finalResult?.country ||
                "";
              const currency =
                finalResult?.final_currency ||
                finalResult?.currency ||
                finalResult?.tien_te ||
                "";
              const identity = [country, currency].filter(Boolean).join(" · ");
              const imageUrl = item?.uploaded_image_url;
              const isValidUrl =
                imageUrl &&
                imageUrl.startsWith("http") &&
                !imageUrl.includes("mocked-cloudinary.com") &&
                !imageUrl.includes("via.placeholder.com");

              const rawDate = item?.created_at;
              const date = rawDate
                ? new Date(rawDate).toLocaleDateString(
                    lang === "VI" ? "vi-VN" : "en-US",
                    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                  )
                : "";

              const statusCfg = getStatusConfig(item?.status);
              const statusLabel = lang === "VI" ? statusCfg.labelVI : statusCfg.label;

              const resultId = item?.id || item?.task_id;

              return (
                <Link
                  key={item?.id || String(i)}
                  to={resultId ? "/result" : "#"}
                  state={resultId ? { scanResult: item } : undefined}
                  className="flex gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative">
                    {isValidUrl ? (
                      <>
                        <img
                          src={imageUrl}
                          alt={denomination}
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                          onError={(e) => {
                            e.target.style.display = "none";
                            if (e.target.nextElementSibling) {
                              e.target.nextElementSibling.style.display = "flex";
                            }
                          }}
                        />
                        <div
                          className="absolute inset-0 hidden items-center justify-center bg-slate-100 px-1 text-center dark:bg-slate-800"
                        >
                          <span className="text-[9px] font-medium leading-tight text-slate-400">
                            {t.noImage}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-1 text-center">
                        <span className="text-[9px] font-medium leading-tight text-slate-400">
                          {t.noImage}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">
                        {denomination}
                      </p>
                      <div className="shrink-0">
                        <span className={`inline-flex max-w-24 items-center truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold dark:border-slate-700 dark:bg-slate-800 ${statusCfg.text}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    {identity ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {identity}
                      </p>
                    ) : null}
                    {date ? (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                        {date}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
