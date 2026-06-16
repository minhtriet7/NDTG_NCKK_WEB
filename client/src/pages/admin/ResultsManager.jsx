import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminResults,
  deleteResult,
  markResultReviewed,
  rerunRecognition,
} from "../../services/adminService";
import {
  Search,
  Eye,
  Trash2,
  X,
  Terminal,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Download,
  Copy,
  Play,
  Loader2,
  GitMerge,
  Cpu,
  BotMessageSquare,
  SearchCheck,
} from "lucide-react";
import toast from "react-hot-toast";

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
  return item?.id || item?._id;
}

function safeStr(value) {
  return value === null || value === undefined || value === "" ? "N/A" : String(value);
}

function inferCurrencyFromDenom(denom) {
  const text = String(denom || "").toUpperCase();
  const codes = ["VND", "USD", "THB", "MYR", "SGD", "IDR", "PHP", "KHR", "LAK", "MMK", "BND"];
  return codes.find((code) => text.includes(code)) || "N/A";
}

function normalizeStatus(status, finalResult = {}) {
  const raw = String(status || finalResult?.status || "").toLowerCase();

  if (["success", "completed", "done", "paid"].includes(raw)) return "completed";
  if (["failed", "error"].includes(raw)) return "failed";
  if (["conflict", "needs review", "needs_review", "review"].includes(raw)) return "conflict";

  if (finalResult?.require_rerun) return "conflict";

  return raw || "completed";
}

function normalizeAgentOutputs(record) {
  const agentResults =
    record?.agent_results ||
    record?.result?.agent_results ||
    record?.raw?.agent_results ||
    [];

  if (Array.isArray(agentResults) && agentResults.length > 0) {
    const findAgent = (keywords) => {
      const found = agentResults.find((item) => {
        const name = String(item?.agent || item?.name || "").toLowerCase();
        return keywords.some((keyword) => name.includes(keyword));
      });

      return found?.data || found?.result || null;
    };

    return {
      ml_dl: findAgent(["yolo", "ml", "agent_1", "openai", "chatgpt"]),
      llm_api: findAgent(["llm", "gemini", "agent_2"]),
      visual_search: findAgent(["lens", "visual", "agent_3"]),
    };
  }

  const agents = record?.agents || record?.raw?.agents;

  if (agents) {
    return {
      ml_dl: agents.ml_dl || agents.agent_1 || null,
      llm_api: agents.llm_api || agents.agent_2 || null,
      visual_search: agents.visual_search || agents.agent_3 || null,
    };
  }

  return {
    ml_dl: null,
    llm_api: null,
    visual_search: null,
  };
}

function normalizeResult(item = {}) {
  const final = item.final_result || item.result?.final_result || item.data || {};

  const denomination =
    final.final_denomination ||
    final.menh_gia ||
    final.denomination ||
    item.denomination ||
    item.data?.denomination ||
    "N/A";

  const country =
    final.quoc_gia ||
    final.country ||
    item.country ||
    item.data?.country ||
    "N/A";

  const currency =
    final.loai_tien ||
    final.currency ||
    final.currency_code ||
    item.currency ||
    item.data?.currency ||
    inferCurrencyFromDenom(denomination);

  const material =
    final.chat_lieu ||
    final.material ||
    item.material ||
    item.data?.material ||
    "N/A";

  const status = normalizeStatus(item.status, final);

  const matchedAgents =
    Number(
      final.matched_agents ||
        final.so_luong_dong_thuan ||
        item.matched_agents ||
        item.consensus?.matched_agents ||
        0,
    ) || 0;

  return {
    id: item.id || item._id,
    _id: item._id,
    user_id: item.user_id,
    status,
    original_status: item.status,
    denomination,
    country,
    currency,
    material,
    matched_agents: matchedAgents,
    image_url:
      item.image_url ||
      item.uploaded_image_url ||
      item.data?.image_url ||
      item.result?.uploaded_image_url ||
      "",
    final_result: final,
    agent_results: item.agent_results || item.result?.agent_results || [],
    task_id: item.task_id,
    processing_time_ms: item.processing_time_ms,
    error_message: item.error_message,
    created_at: item.created_at,
    updated_at: item.updated_at,
    raw: item,
  };
}

function getAgentDenom(data) {
  if (Array.isArray(data)) {
    return safeStr(data[0]?.menh_gia || data[0]?.denomination || data[0]?.class_name);
  }

  return safeStr(
    data?.final_denomination ||
      data?.menh_gia ||
      data?.denomination ||
      data?.result ||
      data?.class_name,
  );
}

function getAgentCountry(data) {
  if (Array.isArray(data)) {
    return safeStr(data[0]?.quoc_gia || data[0]?.country || data[0]?.origin);
  }

  return safeStr(data?.quoc_gia || data?.country || data?.origin);
}

function getAgentConfidence(data) {
  if (Array.isArray(data)) return data[0]?.confidence;
  return data?.confidence || data?.do_tin_cay || data?.confidence_score;
}

export default function ResultsManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedScan, setSelectedScan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = {
    EN: {
      title: "Recognition Results",
      subtitle: "Monitor scan outputs, consensus status, and agent decisions.",
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
      noData: "No scan records found.",
      errLoad: "Failed to load results.",
      drwTitle: "Scan Details",
      btnClose: "Close",
      msgDel: "Record deleted.",
      markReview: "Mark Reviewed",
      rerun: "Rerun Scan",
      copy: "Copy JSON",
      download: "Download JSON",
      agents: "Agent Outputs",
      copied: "JSON copied.",
      reviewed: "Record marked as reviewed.",
      rerunSuccess: "Rerun requested.",
    },
    VI: {
      title: "Kết quả Nhận diện",
      subtitle:
        "Theo dõi kết quả quét, trạng thái đồng thuận và quyết định của tác tử.",
      searchPlaceholder: "Tìm quốc gia, mệnh giá, mã tiền...",
      statusAll: "Tất cả trạng thái",
      statusCompleted: "Hoàn tất",
      statusConflict: "Cần xem xét",
      statusFailed: "Thất bại",
      thTime: "Thời gian",
      thImg: "Ảnh",
      thResult: "Kết quả",
      thConsensus: "Đồng thuận",
      thStatus: "Trạng thái",
      thAction: "Thao tác",
      noData: "Chưa có dữ liệu quét.",
      errLoad: "Không thể tải danh sách kết quả.",
      drwTitle: "Chi tiết Nhận diện",
      btnClose: "Đóng",
      msgDel: "Đã xóa bản ghi.",
      markReview: "Đã kiểm duyệt",
      rerun: "Quét lại",
      copy: "Sao chép JSON",
      download: "Tải JSON",
      agents: "Kết quả tác tử",
      copied: "Đã sao chép JSON.",
      reviewed: "Đã đánh dấu kiểm duyệt.",
      rerunSuccess: "Đã yêu cầu quét lại.",
    },
  }[lang || "EN"];

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
    loadData();
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

  const selectedAgents = useMemo(() => {
    if (!selectedScan) {
      return {
        ml_dl: null,
        llm_api: null,
        visual_search: null,
      };
    }

    return normalizeAgentOutputs(selectedScan);
  }, [selectedScan]);

  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    setIsProcessing(true);

    try {
      await deleteResult(id);
      toast.success(t.msgDel);
      setSelectedScan(null);
      await loadData();
    } catch (error) {
      console.error("Delete result failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to delete record.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReviewed = async (id) => {
    if (!id) return;

    setIsProcessing(true);

    try {
      await markResultReviewed(id);
      toast.success(t.reviewed);
      setSelectedScan(null);
      await loadData();
    } catch (error) {
      console.error("Mark reviewed failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Action failed.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRerun = async (id) => {
    if (!id) return;

    setIsProcessing(true);

    try {
      await rerunRecognition(id);
      toast.success(t.rerunSuccess);
      setSelectedScan(null);
      await loadData();
    } catch (error) {
      console.error("Rerun failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Action failed.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async (payload) => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success(t.copied);
  };

  const handleDownload = (payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `recognition_result_${getId(payload) || Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const renderStatus = (status) => {
    if (status === "completed") {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
          <CheckCircle size={12} className="inline mr-1 mb-0.5" />
          Completed
        </span>
      );
    }

    if (status === "conflict") {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle size={12} className="inline mr-1 mb-0.5" />
          Needs Review
        </span>
      );
    }

    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
        <AlertTriangle size={12} className="inline mr-1 mb-0.5" />
        Failed
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-[fadeInUp_0.3s_ease-out]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Results" value={kpis.total} className={cardBg} textMain={textMain} />
        <KpiCard label="Completed" value={kpis.completed} className={cardBg} textMain="text-teal-600" />
        <KpiCard label="Needs Review" value={kpis.conflict} className={cardBg} textMain="text-amber-600" />
        <KpiCard label="Failed" value={kpis.failed} className={cardBg} textMain="text-rose-600" />
      </div>

      <div className={`p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 ${cardBg}`}>
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

      <div className={`rounded-xl border shadow-sm overflow-hidden ${cardBg}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead
              className={`uppercase text-[11px] font-bold tracking-wider text-slate-500 border-b ${
                isDark ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"
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
                    <Loader2 className="animate-spin mx-auto" />
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
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className={`px-6 py-4 ${textMain}`}>
                      {result.created_at
                        ? new Date(result.created_at).toLocaleString(lang === "VI" ? "vi-VN" : "en-US")
                        : "N/A"}
                    </td>

                    <td className="px-6 py-4">
                      <div className="w-12 h-8 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        {result.image_url ? (
                          <img
                            src={result.image_url}
                            alt="note"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg>";
                            }}
                          />
                        ) : (
                          <span className="text-[10px]">No Img</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className={`font-bold ${textMain}`}>
                        {result.denomination}
                      </p>
                      <p className="text-xs text-slate-500">
                        {result.country} · {result.currency}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {result.matched_agents}/3 Matched
                      </span>
                    </td>

                    <td className="px-6 py-4">{renderStatus(result.status)}</td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedScan(result)}
                        className="p-2 text-slate-400 hover:text-teal-600 transition-colors"
                      >
                        <Eye size={18} />
                      </button>

                      <button
                        onClick={() => handleDelete(getId(result))}
                        disabled={isProcessing}
                        className="p-2 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
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

      {selectedScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div
            className={`w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden ${cardBg}`}
          >
            <div
              className={`px-6 py-4 border-b flex justify-between items-center ${
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              }`}
            >
              <h3 className={`font-bold flex items-center gap-2 ${textMain}`}>
                <Terminal size={20} className="text-teal-500" />
                {t.drwTitle}
              </h3>

              <button
                onClick={() => setSelectedScan(null)}
                className="p-2 text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-slate-100 dark:bg-slate-950 rounded-xl flex items-center justify-center min-h-[220px] border border-slate-200 dark:border-slate-800 overflow-hidden p-2">
                  {selectedScan.image_url ? (
                    <img
                      src={selectedScan.image_url}
                      alt="scan"
                      className="max-h-[220px] object-contain rounded-xl"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg>";
                      }}
                    />
                  ) : (
                    <span className="text-slate-400">No Image</span>
                  )}
                </div>

                <div className="lg:col-span-2 bg-slate-900 rounded-xl p-6 text-white shadow-inner">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Final Decision
                  </h4>

                  <p className="text-4xl font-black text-teal-400">
                    {selectedScan.denomination}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
                    <InfoItem label="Country" value={selectedScan.country} />
                    <InfoItem label="Currency" value={selectedScan.currency} />
                    <InfoItem label="Material" value={selectedScan.material} />
                    <InfoItem label="Status" value={selectedScan.status} />
                  </div>

                  {selectedScan.error_message && (
                    <div className="mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm">
                      {selectedScan.error_message}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4
                  className={`text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  <GitMerge size={16} />
                  {t.agents}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <AgentCard
                    isDark={isDark}
                    title="ChatGPT Vision"
                    icon={<Cpu size={16} />}
                    data={selectedAgents.ml_dl}
                    finalDenom={selectedScan.denomination}
                  />

                  <AgentCard
                    isDark={isDark}
                    title="LLM"
                    icon={<BotMessageSquare size={16} />}
                    data={selectedAgents.llm_api}
                    finalDenom={selectedScan.denomination}
                  />

                  <AgentCard
                    isDark={isDark}
                    title="Visual Search"
                    icon={<SearchCheck size={16} />}
                    data={selectedAgents.visual_search}
                    finalDenom={selectedScan.denomination}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleCopy(selectedScan.raw || selectedScan)}
                  className="px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                >
                  <Copy size={16} />
                  {t.copy}
                </button>

                <button
                  onClick={() => handleDownload(selectedScan.raw || selectedScan)}
                  className="px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                >
                  <Download size={16} />
                  {t.download}
                </button>

                <button
                  onClick={() => handleMarkReviewed(getId(selectedScan))}
                  disabled={isProcessing}
                  className="px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  <CheckCircle size={16} />
                  {t.markReview}
                </button>

                <button
                  onClick={() => handleRerun(getId(selectedScan))}
                  disabled={isProcessing}
                  className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  <Play size={16} />
                  {t.rerun}
                </button>
              </div>

              <div>
                <h4
                  className={`text-sm font-bold uppercase tracking-wider mb-3 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  JSON Payload
                </h4>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <pre className="text-xs text-teal-300 font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                    {JSON.stringify(selectedScan.raw || selectedScan, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `,
        }}
      />
    </div>
  );
}

function KpiCard({ label, value, className, textMain }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm ${className}`}>
      <p className="text-xs font-bold text-slate-500 uppercase">{label}</p>
      <p className={`text-2xl font-black mt-2 ${textMain}`}>{value}</p>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="font-semibold capitalize">{safeStr(value)}</p>
    </div>
  );
}

function AgentCard({ title, icon, data, finalDenom, isDark }) {
  if (!data) {
    return (
      <div
        className={`p-4 rounded-xl border border-dashed flex flex-col items-center justify-center text-center min-h-[140px] ${
          isDark
            ? "bg-slate-900 border-slate-700 text-slate-500"
            : "bg-white border-slate-200 text-slate-400"
        }`}
      >
        {icon}
        <p className="text-sm font-bold mt-2">{title}</p>
        <p className="text-xs mt-1">No data</p>
      </div>
    );
  }

  const denom = getAgentDenom(data);
  const country = getAgentCountry(data);
  const confidence = getAgentConfidence(data);
  const isMatch = denom === finalDenom && finalDenom !== "N/A";

  return (
    <div
      className={`p-4 rounded-xl border shadow-sm flex flex-col ${
        isDark
          ? "bg-slate-900 border-slate-800"
          : "bg-white border-slate-200"
      }`}
    >
      <div
        className={`flex items-center justify-between mb-3 border-b pb-2 ${
          isDark ? "border-slate-800" : "border-slate-50"
        }`}
      >
        <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
          {icon} {title}
        </p>

        {isMatch ? (
          <CheckCircle size={14} className="text-teal-500" />
        ) : (
          <AlertTriangle size={14} className="text-amber-500" />
        )}
      </div>

      <div className="space-y-2 mt-auto">
        <div className="flex justify-between gap-3">
          <span className="text-xs text-slate-400">Denom:</span>
          <span
            className={`text-sm font-bold text-right ${
              isMatch
                ? isDark
                  ? "text-white"
                  : "text-slate-900"
                : isDark
                  ? "text-amber-400"
                  : "text-amber-600"
            }`}
          >
            {denom}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-xs text-slate-400">Country:</span>
          <span
            className={`text-sm font-semibold text-right ${
              isDark ? "text-slate-300" : "text-slate-700"
            }`}
          >
            {country}
          </span>
        </div>

        {confidence !== undefined && confidence !== null && confidence !== "" && (
          <div className="flex justify-between gap-3">
            <span className="text-xs text-slate-400">Confidence:</span>
            <span
              className={`text-sm font-semibold text-right ${
                isDark ? "text-slate-300" : "text-slate-700"
              }`}
            >
              {Number(confidence) <= 1
                ? `${(Number(confidence) * 100).toFixed(2)}%`
                : `${Number(confidence).toFixed(2)}%`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
