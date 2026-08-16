import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { deleteResult, getAdminResults } from "../../services/adminService";

function normalizeList(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.results)
          ? data.results
          : [];

  return list.map(normalizeResult);
}

function getId(item) {
  return item?.id || item?._id || item?.result_id;
}

function inferCurrencyFromDenom(denom) {
  const text = String(denom || "").toUpperCase();
  const codes = ["VND", "USD", "THB", "MYR", "SGD", "IDR", "PHP", "KHR", "LAK", "MMK", "BND"];
  return codes.find((code) => text.includes(code)) || "";
}

function normalizeStatus(status, finalResult = {}, consensus = {}, item = {}) {
  const rawStatus = String(status || finalResult?.status || consensus?.status || "").trim().toLowerCase();
  const finalStatus = String(finalResult?.status || "").trim().toLowerCase();
  const consensusStatus = String(consensus?.status || "").trim().toLowerCase();

  const matchedAgents =
    Number(
      item.matched_agents ||
        consensus?.matched_agents ||
        finalResult?.matched_agents ||
        finalResult?.so_luong_dong_thuan ||
        0,
    ) || 0;
  const requiredVotes =
    Number(
      consensus?.required_votes ||
        finalResult?.required_votes ||
        2,
    ) || 2;
  const requireRerun = Boolean(finalResult?.require_rerun || consensus?.require_rerun);
  const consensusReached =
    finalResult?.consensus_reached !== undefined
      ? Boolean(finalResult.consensus_reached)
      : consensus?.consensus_reached !== undefined
        ? Boolean(consensus.consensus_reached)
        : null;

  const hasUsableIdentity = Boolean(
    item.denomination ||
      item.country ||
      item.currency ||
      finalResult?.final_denomination ||
      finalResult?.denomination ||
      finalResult?.menh_gia ||
      finalResult?.final_country ||
      finalResult?.country ||
      finalResult?.quoc_gia ||
      finalResult?.currency ||
      finalResult?.loai_tien,
  );

  // 1. Hard technical / terminal failures
  const failedStatuses = new Set([
    "failed",
    "failure",
    "error",
    "timeout",
    "agent_error",
    "technical_error",
    "cancelled",
    "canceled",
    "invalid_conclusion",
    "invalid conclusion",
  ]);
  if (
    failedStatuses.has(rawStatus) ||
    (failedStatuses.has(finalStatus) &&
      !["completed", "completed_partial", "needs_review", "needs review"].includes(rawStatus))
  ) {
    return "failed";
  }

  // 2. Needs review / conflict explicit states
  const conflictStatuses = new Set([
    "conflict",
    "conflict detected",
    "conflict_detected",
    "needs_review",
    "needs review",
    "review",
    "consensus_failed",
    "needs_better_image",
    "no_banknote_detected",
    "not_banknote_or_unclear",
    "completed_with_warning",
  ]);
  if (
    conflictStatuses.has(rawStatus) ||
    conflictStatuses.has(finalStatus) ||
    conflictStatuses.has(consensusStatus) ||
    requireRerun ||
    consensusReached === false
  ) {
    return "conflict";
  }

  // 3. Completed partial — strictly requires affirmative evidence of successful consensus
  if (
    rawStatus === "completed_partial" ||
    rawStatus === "partial" ||
    rawStatus === "partial_success" ||
    finalStatus === "completed_partial"
  ) {
    const isAffirmativeSuccess =
      !requireRerun &&
      consensusReached !== false &&
      matchedAgents >= requiredVotes &&
      hasUsableIdentity;

    return isAffirmativeSuccess ? "completed" : "conflict";
  }

  // 4. Explicit completed / success / reviewed (affirmative raw success)
  const completedStatuses = new Set([
    "completed",
    "success",
    "succeeded",
    "complete",
    "done",
    "paid",
    "reviewed",
    "completed_with_limit",
  ]);
  if (completedStatuses.has(rawStatus) || completedStatuses.has(finalStatus)) {
    if (requireRerun || consensusReached === false) {
      return "conflict";
    }
    return "completed";
  }

  // 5. Default / unknown / malformed fallback: NEVER silently 'completed'
  return "conflict";
}

function normalizeResult(item = {}) {
  const final = item.final_result || item.result?.final_result || item.data || {};
  const consensus = item.consensus || {};
  const denomination =
    item.denomination ||
    item.data?.denomination ||
    final.final_denomination ||
    final.menh_gia ||
    final.denomination ||
    "";
  const country =
    item.country ||
    item.data?.country ||
    final.quoc_gia ||
    final.country ||
    final.final_country ||
    "";
  const currency =
    item.currency ||
    item.data?.currency ||
    final.loai_tien ||
    final.currency ||
    final.currency_code ||
    inferCurrencyFromDenom(denomination);
  const matchedAgents =
    Number(
      item.matched_agents ||
        consensus.matched_agents ||
        final.matched_agents ||
        final.so_luong_dong_thuan ||
        0,
    ) || 0;
  const totalAgents =
    Number(consensus.total_agents || final.total_agents || item.total_agents || 3) || 3;

  return {
    id: getId(item),
    _id: item._id,
    user_id: item.user_id,
    task_id: item.task_id,
    status: normalizeStatus(item.status, final, consensus, item),
    original_status: item.status,
    denomination,
    country,
    currency,
    confidence: item.confidence || final.confidence || final.do_tin_cay,
    matched_agents: matchedAgents,
    total_agents: totalAgents,
    consensus: {
      status: consensus.status || final.status || item.status,
      matched_agents: matchedAgents,
      total_agents: totalAgents,
    },
    image_url:
      item.image_url ||
      item.uploaded_image_url ||
      item.data?.image_url ||
      item.result?.uploaded_image_url ||
      "",
    processing_time_ms: item.processing_time_ms,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

const COPY = {
  EN: {
    title: "Recognition Results",
    subtitle: "Monitor scan outputs and consensus status.",
    searchPlaceholder: "Search by country, denomination, currency...",
    statusAll: "All Statuses",
    statusCompleted: "Completed",
    statusConflict: "Needs Review",
    statusFailed: "Failed",
    thTime: "Time",
    thImg: "Image",
    thResult: "Final Result",
    thConsensus: "Consensus",
    thStatus: "Status",
    thAction: "Actions",
    totalResults: "Total Results",
    completed: "Completed",
    needsReview: "Needs Review",
    failed: "Failed",
    noData: "No scan records found.",
    errLoad: "Failed to load results.",
    msgDel: "Record deleted.",
    confirmDelete: "Are you sure you want to delete this record?",
    deleteFailed: "Failed to delete record.",
    noDataYet: "No data yet",
    noRunsYet: "No runs yet",
    noImage: "No image",
    matched: "matched",
    refresh: "Refresh",
    viewDiagnostics: "View diagnostics",
    delete: "Delete",
  },
  VI: {
    title: "Ket qua nhan dien",
    subtitle: "Theo doi ket qua quet va trang thai dong thuan.",
    searchPlaceholder: "Tim quoc gia, menh gia, ma tien...",
    statusAll: "Tat ca trang thai",
    statusCompleted: "Hoan tat",
    statusConflict: "Can xem xet",
    statusFailed: "That bai",
    thTime: "Thoi gian",
    thImg: "Anh",
    thResult: "Ket qua",
    thConsensus: "Dong thuan",
    thStatus: "Trang thai",
    thAction: "Thao tac",
    totalResults: "Tong ket qua",
    completed: "Hoan tat",
    needsReview: "Can xem xet",
    failed: "That bai",
    noData: "Chua co du lieu quet.",
    errLoad: "Khong the tai danh sach ket qua.",
    msgDel: "Da xoa ban ghi.",
    confirmDelete: "Ban co chac muon xoa ban ghi nay?",
    deleteFailed: "Khong the xoa ban ghi.",
    noDataYet: "Chua co du lieu",
    noRunsYet: "Chua co luot chay",
    noImage: "Chua co anh",
    matched: "khop",
    refresh: "Tai lai",
    viewDiagnostics: "Xem chan doan",
    delete: "Xoa",
  },
};

export default function ResultsManager() {
  const { lang, theme } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === "dark";
  const t = COPY[lang || "EN"] || COPY.EN;

  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);

  const cardBg = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";
  const textMain = isDark ? "text-slate-100" : "text-slate-900";
  const inputCls = `h-11 px-4 rounded-xl border outline-none text-sm transition-colors ${
    isDark
      ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500"
      : "bg-slate-50 border-slate-200 focus:border-teal-500 focus:bg-white"
  }`;

  const loadData = async () => {
    setIsLoading(true);

    try {
      const data = await getAdminResults();
      setResults(normalizeList(data));
    } catch (error) {
      console.error("Load results failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.errLoad,
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        loadData();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return results.filter((result) => {
      const matchStatus =
        statusFilter === "all" || result.status === statusFilter;

      if (!term) return matchStatus;

      const matchSearch =
        String(result.denomination || "").toLowerCase().includes(term) ||
        String(result.country || "").toLowerCase().includes(term) ||
        String(result.currency || "").toLowerCase().includes(term) ||
        String(result.user_id || "").toLowerCase().includes(term);

      return matchStatus && matchSearch;
    });
  }, [results, searchTerm, statusFilter]);

  const kpis = useMemo(() => {
    return {
      total: results.length,
      completed: results.filter((item) => item.status === "completed").length,
      conflict: results.filter((item) => item.status === "conflict").length,
      failed: results.filter((item) => item.status === "failed").length,
    };
  }, [results]);

  const handleOpenDetail = (result) => {
    const id = getId(result);

    if (!id) return;

    navigate(`/admin/results/${id}`, {
      state: {
        resultSummary: result,
        from: `${location.pathname}${location.search}`,
      },
    });
  };

  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm(t.confirmDelete)) return;

    setIsProcessing(true);

    try {
      await deleteResult(id);
      toast.success(t.msgDel);
      await loadData();
    } catch (error) {
      console.error("Delete result failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.deleteFailed,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRowKeyDown = (event, result) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenDetail(result);
    }
  };

  const renderStatus = (status) => {
    if (status === "completed") {
      return (
        <span className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
          <CheckCircle size={12} className="mb-0.5 mr-1 inline" />
          {t.completed}
        </span>
      );
    }

    if (status === "conflict") {
      return (
        <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle size={12} className="mb-0.5 mr-1 inline" />
          {t.needsReview}
        </span>
      );
    }

    return (
      <span className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
        <AlertTriangle size={12} className="mb-0.5 mr-1 inline" />
        {t.failed}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label={t.totalResults} value={kpis.total} className={cardBg} textMain={textMain} />
        <KpiCard label={t.completed} value={kpis.completed} className={cardBg} textMain="text-teal-600" />
        <KpiCard label={t.needsReview} value={kpis.conflict} className={cardBg} textMain="text-amber-600" />
        <KpiCard label={t.failed} value={kpis.failed} className={cardBg} textMain="text-rose-600" />
      </div>

      <div className={`flex flex-col gap-4 rounded-xl border p-4 shadow-sm md:flex-row ${cardBg}`}>
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className={`${inputCls} w-full pl-10`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={inputCls}
        >
          <option value="all">{t.statusAll}</option>
          <option value="completed">{t.statusCompleted}</option>
          <option value="conflict">{t.statusConflict}</option>
          <option value="failed">{t.statusFailed}</option>
        </select>
      </div>

      <div className={`overflow-hidden rounded-xl border shadow-sm ${cardBg}`}>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead
              className={`border-b text-[11px] font-bold uppercase tracking-wider text-slate-500 ${
                isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <tr>
                <th className="px-6 py-4">{t.thTime}</th>
                <th className="px-6 py-4">{t.thImg}</th>
                <th className="px-6 py-4">{t.thResult}</th>
                <th className="px-6 py-4">{t.thConsensus}</th>
                <th className="px-6 py-4">{t.thStatus}</th>
                <th className="px-6 py-4 text-right">{t.thAction}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    <Loader2 className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              ) : (
                filteredResults.map((result) => (
                  <tr
                    key={getId(result)}
                    tabIndex={0}
                    onClick={() => handleOpenDetail(result)}
                    onKeyDown={(event) => handleRowKeyDown(event, result)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/50 dark:focus:bg-slate-800/50"
                  >
                    <td className={`px-6 py-4 ${textMain}`}>
                      {result.created_at
                        ? new Date(result.created_at).toLocaleString(lang === "VI" ? "vi-VN" : "en-US")
                        : t.noRunsYet}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex h-8 w-12 items-center justify-center overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                        {result.image_url ? (
                          <img
                            src={result.image_url}
                            alt="Recognition input"
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500">{t.noImage}</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className={`font-bold ${textMain}`}>
                        {result.denomination || t.noDataYet}
                      </p>
                      <p className="text-xs text-slate-500">
                        {result.country || t.noDataYet} - {result.currency || t.noDataYet}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {result.matched_agents}/{result.total_agents} {t.matched}
                      </span>
                    </td>

                    <td className="px-6 py-4">{renderStatus(result.status)}</td>

                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        aria-label={t.viewDiagnostics}
                        title={t.viewDiagnostics}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenDetail(result);
                        }}
                        className="p-2 text-slate-400 transition-colors hover:text-teal-600"
                      >
                        <Eye size={18} />
                      </button>

                      <button
                        type="button"
                        aria-label={t.delete}
                        title={t.delete}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(getId(result));
                        }}
                        disabled={isProcessing}
                        className="p-2 text-slate-400 transition-colors hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, className, textMain }) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${className}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${textMain}`}>{value}</p>
    </div>
  );
}
