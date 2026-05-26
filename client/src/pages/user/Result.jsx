import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

import { useCurrencyStore } from "../../store/currencyStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";

import {
  Copy,
  Download,
  History,
  RotateCcw,
  FileJson,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// ==========================================
// UTILITIES
// ==========================================

const normalizeText = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const stripMarkdownSymbols = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/[🤖🧠👁️⚖️✅🔬🔄📦🧾]/g, "")
    .replace(/`/g, "")
    .trim();
};

const inferCurrencyFromDenomination = (denomination, fallback = "VND") => {
  const text = String(denomination || "").toUpperCase();

  const known = [
    "VND",
    "USD",
    "THB",
    "MYR",
    "SGD",
    "IDR",
    "PHP",
    "KHR",
    "LAK",
    "MMK",
    "BND",
    "EUR",
    "GBP",
    "JPY",
    "CNY",
    "KRW",
    "AUD",
  ];

  const found = known.find((code) => text.includes(code));
  return found || fallback || "VND";
};

const parseAmountFromDenomination = (value) => {
  if (!value) return 0;

  const raw = String(value)
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");

  return Number.parseInt(raw, 10) || 0;
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

const getConsensusStatusLabel = (consensus, lang) => {
  const status = consensus?.status;
  const matched = Number(consensus?.matched_agents || 0);

  if (String(status || "").toLowerCase().includes("re-analysis")) {
    return lang === "VI" ? "Cần phân tích lại" : "Need re-analysis";
  }

  if (matched >= 3) return lang === "VI" ? "Đồng thuận cao" : "High consensus";
  if (matched === 2) return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
  if (status) return status;

  return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
};

const getConsensusBadgeClass = (consensus) => {
  const label = String(consensus?.status || "").toLowerCase();
  const matched = Number(consensus?.matched_agents || 0);

  if (
    matched >= 2 ||
    label.includes("high") ||
    label.includes("reach") ||
    label.includes("complete") ||
    label.includes("success")
  ) {
    return "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30";
  }

  if (
    label.includes("review") ||
    label.includes("analysis") ||
    label.includes("conflict") ||
    label.includes("failed")
  ) {
    return "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30";
  }

  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
};

const getAgentDataByName = (agentResults, keywords) => {
  if (!Array.isArray(agentResults)) return null;

  const found = agentResults.find((item) => {
    const name = String(item?.agent || item?.name || "").toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  });

  return found?.data || found?.result || null;
};

const normalizeBackendResult = (rawResult, session) => {
  if (!rawResult) return null;

  // Nếu dữ liệu đã là format UI cũ: { data, agents, consensus }
  if (rawResult.data || rawResult.agents || rawResult.consensus) {
    return {
      ...rawResult,
      image_url:
        rawResult.image_url ||
        rawResult.uploaded_image_url ||
        rawResult.thumbnail_url ||
        session?.previewUrl ||
        null,
      raw_backend: rawResult,
    };
  }

  const final = rawResult.final_result || rawResult.result?.final_result || {};
  const agentResults = rawResult.agent_results || rawResult.result?.agent_results || [];

  const denomination =
    final.final_denomination ||
    final.menh_gia ||
    final.denomination ||
    final.denomination_label ||
    "N/A";

  const currency =
    final.currency ||
    final.currency_code ||
    inferCurrencyFromDenomination(denomination, "VND");

  const country =
    final.quoc_gia ||
    final.country ||
    final.origin ||
    final.final_country ||
    "Không xác định";

  const material =
    final.chat_lieu ||
    final.material ||
    final.final_material ||
    "Không xác định";

  const description =
    final.mo_ta ||
    final.description ||
    final.quan_diem_trong_tai ||
    final.referee_view ||
    "";

  const matchedAgents =
    final.matched_agents ||
    final.so_luong_dong_thuan ||
    final.valid_votes?.length ||
    0;

  const status =
    final.status ||
    rawResult.status ||
    rawResult.result?.status ||
    "Completed";

  const mlData = getAgentDataByName(agentResults, ["yolo", "ml", "agent_1"]);
  const llmData = getAgentDataByName(agentResults, ["llm", "gemini", "agent_2"]);
  const lensData = getAgentDataByName(agentResults, ["lens", "visual", "agent_3"]);

  return {
    id: rawResult.id || rawResult._id || rawResult.result_id,
    status,
    image_url:
      rawResult.uploaded_image_url ||
      rawResult.image_url ||
      rawResult.result?.uploaded_image_url ||
      session?.previewUrl ||
      null,
    data: {
      denomination,
      currency,
      country,
      origin: country,
      material,
      description,
      estimated_usd: final.estimated_usd || "N/A",
    },
    agents: {
      ml_dl: mlData,
      llm_api: llmData,
      visual_search: lensData,
    },
    consensus: {
      method: final.method || "majority_vote",
      matched_agents: Number(matchedAgents || 0),
      status,
      referee_view:
        final.quan_diem_trong_tai ||
        final.referee_view ||
        final.reasoning ||
        description,
      valid_votes: final.valid_votes || [],
      debate_log:
        final.debate_log ||
        final.quan_diem_trong_tai ||
        final.referee_view ||
        description ||
        "No debate log available.",
    },
    raw_backend: rawResult,
  };
};

// ==========================================
// COMPONENTS
// ==========================================

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 dark:border-slate-700/50 pb-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-bold text-slate-900 dark:text-slate-100 text-right">
        {normalizeText(value)}
      </span>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 transition-colors">
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-slate-900 dark:text-slate-100">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function DecisionItem({ label, value, status, t }) {
  const statusClass =
    status === "matched"
      ? "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-100 dark:border-teal-500/30"
      : status === "different"
        ? "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30"
        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 transition-colors">
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
          {label}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {normalizeText(value)}
        </p>
      </div>

      <span
        className={`w-fit px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusClass}`}
      >
        {status === "matched"
          ? t.matched
          : status === "different"
            ? t.different
            : t.final}
      </span>
    </div>
  );
}

function AgentCard({ agentKey, title, method, data, finalDenomination, t }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!data) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 transition-colors">
        <span className="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider rounded mb-3">
          {agentKey}
        </span>

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h3>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
          {t.noAgentData}
        </p>
      </div>
    );
  }

  const agentDenomination = getAgentDenomination(data);
  const isMatched =
    agentDenomination !== "N/A" &&
    finalDenomination !== "N/A" &&
    agentDenomination === finalDenomination;

  const reasoningText = stripMarkdownSymbols(getAgentReasoning(data));

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 hover:shadow-md transition-all">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <span className="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider rounded mb-2">
            {agentKey}
          </span>

          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {getAgentMethod(data, method)}
          </p>
        </div>

        <span
          className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded whitespace-nowrap border ${
            isMatched
              ? "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-100 dark:border-teal-500/30"
              : "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30"
          }`}
        >
          {isMatched ? t.matched : t.different}
        </span>
      </div>

      <div className="space-y-3 mb-6 text-sm">
        <InfoRow label={t.lblDenomination} value={agentDenomination} />
        <InfoRow label={t.lblCountry} value={getAgentCountry(data)} />
        <InfoRow label={t.lblMaterial} value={data?.chat_lieu || data?.material} />
      </div>

      <div className="mt-auto">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          {t.lblReasoning}
        </p>

        <div
          className={`text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 ${
            !isExpanded ? "line-clamp-5" : ""
          }`}
        >
          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{reasoningText}</ReactMarkdown>
          </div>
        </div>

        {reasoningText.length > 180 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 text-sm font-semibold transition-colors"
          >
            {isExpanded ? t.showLess : t.readFull}
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();

  const { currentScanSession } = useRecognitionStore();
  const { ratesData, fetchRates } = useCurrencyStore();
  const { lang } = useLanguageStore();

  const [showRawLog, setShowRawLog] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const dict = {
    EN: {
      title: "Analysis Report",
      subtitle: "Review the final decision, agent outputs, and structured JSON result.",
      viewHistory: "View History",
      scanAnother: "Scan Another",
      feedback: "Feedback",
      uploadTitle: "Uploaded Banknote",
      finalDecision: "Final Decision",
      lblCountry: "Country",
      lblMaterial: "Material",
      lblCurrency: "Currency",
      lblConsensus: "Consensus",
      lblReasoning: "Reasoning",
      agents: "agents",
      referee: "Referee Conclusion",
      lblDenomination: "Denomination",
      lblOrigin: "Origin",
      exchangeTitle: "Instant Currency Exchange",
      exchangeDesc: "Live conversion rates for the analyzed banknote value.",
      fullConverter: "Full Converter",
      aggDecision: "Aggregator Decision",
      aggDesc: "The aggregator compares all agent outputs and selects the majority result.",
      agentCompare: "Agent Comparison",
      fullLogTitle: "Full Reasoning Log",
      fullLogDesc: "Detailed reasoning is collapsed to keep the report readable.",
      hideLog: "Hide Log",
      viewLog: "View Full Log",
      jsonTitle: "Structured JSON Output",
      copy: "Copy",
      download: "Download",
      continueTitle: "Continue scanning",
      continueDesc: "Start another scan or review saved results in your history.",
      btnScanAnother: "Scan Another Banknote",
      btnViewHistory: "View Scan History",
      noResult: "No result data available",
      noResultDesc: "Please run a new banknote scan from the workspace.",
      backWorkspace: "Go back to Workspace",
      matched: "Matched",
      different: "Different",
      final: "Final",
      noAgentData: "No agent data available.",
      showLess: "Show less",
      readFull: "Read full reasoning",
    },
    VI: {
      title: "Báo Cáo Phân Tích",
      subtitle: "Xem lại quyết định cuối cùng, kết quả từ các đặc vụ và dữ liệu JSON.",
      viewHistory: "Xem Lịch Sử",
      scanAnother: "Quét Ảnh Khác",
      feedback: "Góp ý / Báo lỗi",
      uploadTitle: "Ảnh Đã Tải Lên",
      finalDecision: "Quyết Định Cuối Cùng",
      lblCountry: "Quốc Gia",
      lblMaterial: "Chất Liệu",
      lblCurrency: "Tiền Tệ",
      lblConsensus: "Đồng Thuận",
      lblReasoning: "Lập Luận",
      agents: "đặc vụ",
      referee: "Kết Luận Trọng Tài",
      lblDenomination: "Mệnh Giá",
      lblOrigin: "Nguồn Gốc",
      exchangeTitle: "Quy Đổi Tỷ Giá Nhanh",
      exchangeDesc: "Tỷ giá chuyển đổi trực tiếp dựa trên mệnh giá vừa quét.",
      fullConverter: "Chuyển Đổi Chi Tiết",
      aggDecision: "Quyết Định Tổng Hợp",
      aggDesc: "Hệ thống tổng hợp đối chiếu kết quả từ các đặc vụ và chọn ra kết quả đa số.",
      agentCompare: "So Sánh Các Đặc Vụ",
      fullLogTitle: "Nhật Ký Tranh Biện",
      fullLogDesc: "Lý luận chi tiết được thu gọn để báo cáo dễ đọc hơn.",
      hideLog: "Ẩn Nhật Ký",
      viewLog: "Xem Toàn Bộ Nhật Ký",
      jsonTitle: "Dữ Liệu JSON Cấu Trúc",
      copy: "Sao chép",
      download: "Tải xuống",
      continueTitle: "Tiếp Tục",
      continueDesc: "Bắt đầu quét một ảnh khác hoặc xem lại kết quả trong lịch sử.",
      btnScanAnother: "Quét Tờ Tiền Khác",
      btnViewHistory: "Xem Lịch Sử Quét",
      noResult: "Không có dữ liệu kết quả",
      noResultDesc: "Vui lòng thực hiện quét một tờ tiền mới từ không gian làm việc.",
      backWorkspace: "Trở lại Không Gian Làm Việc",
      matched: "Trùng Khớp",
      different: "Khác Biệt",
      final: "Chốt Kết Quả",
      noAgentData: "Không có dữ liệu từ đặc vụ này.",
      showLess: "Thu gọn",
      readFull: "Xem toàn bộ lập luận",
    },
  };

  const t = dict[lang || "EN"];

  useEffect(() => {
    if (!ratesData) {
      fetchRates().catch(() => {});
    }
  }, [ratesData, fetchRates]);

  const rawFromRoute =
    location.state?.scanResult ||
    location.state?.result ||
    location.state?.scanSession?.result ||
    null;

  const sessionFromRoute = location.state?.scanSession || null;
  const session = sessionFromRoute || currentScanSession || null;
  const rawResult = rawFromRoute || session?.result || null;

  const resultsArray = useMemo(() => {
    if (!rawResult) return [];

    const list = Array.isArray(rawResult) ? rawResult : [rawResult];

    return list
      .map((item) => normalizeBackendResult(item, session))
      .filter(Boolean);
  }, [rawResult, session]);

  const currentItem = resultsArray[activeTab] || null;

  const finalData = currentItem?.data || {};
  const agents = currentItem?.agents || {};
  const consensus = currentItem?.consensus || {};

  const finalDenomination = normalizeText(finalData.denomination);
  const finalCountry = normalizeText(finalData.country);
  const finalCurrency = normalizeText(finalData.currency);
  const finalMaterial = normalizeText(finalData.material);
  const finalOrigin = normalizeText(finalData.origin);

  const previewImage =
    currentItem?.image_url ||
    currentItem?.thumbnail_url ||
    currentItem?.data?.image_url ||
    session?.previewUrl ||
    location.state?.previewUrl ||
    null;

  const matchedAgents = Number(consensus?.matched_agents || 0);

  const consensusText =
    consensus?.referee_view ||
    consensus?.quan_diem_trong_tai ||
    (matchedAgents
      ? `Majority vote selected ${finalDenomination} with ${matchedAgents}/3 agents matched.`
      : "No conclusion provided.");

  const safeDebateLog = stripMarkdownSymbols(
    consensus?.debate_log || "No debate log available.",
  );

  const exchangeResults = useMemo(() => {
    const rates = ratesData?.rates || {};
    const amountNumber = parseAmountFromDenomination(finalDenomination);

    if (amountNumber <= 0 || !finalCurrency || finalCurrency === "N/A") {
      return null;
    }

    const normalizedCurrency = String(finalCurrency).toUpperCase();

    if (!rates || Object.keys(rates).length === 0) return null;

    if (normalizedCurrency === "VND") {
      return Object.entries(rates)
        .filter(([code, rateToVnd]) => code !== "VND" && Number(rateToVnd) > 0)
        .slice(0, 5)
        .map(([code, rateToVnd]) => ({
          code,
          name: code,
          value: amountNumber / Number(rateToVnd),
        }));
    }

    const rateToVnd = Number(rates[normalizedCurrency] || 0);

    if (rateToVnd <= 0) return null;

    return [
      {
        code: "VND",
        name: "Việt Nam Đồng",
        value: amountNumber * rateToVnd,
      },
    ];
  }, [finalDenomination, finalCurrency, ratesData]);

  const handleCopyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentItem, null, 2));
      toast.success(lang === "VI" ? "Đã chép JSON" : "JSON copied.");
    } catch {
      toast.error(lang === "VI" ? "Lỗi khi sao chép" : "Unable to copy JSON.");
    }
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(currentItem, null, 2)], {
      type: "application/json",
    });

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = objectUrl;
    a.download = `banknote_result_${activeTab + 1}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(objectUrl);
  };

  if (!currentItem) {
    return (
      <div className="max-w-3xl mx-auto font-sans py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>

          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {t.noResult}
          </h2>

          <p className="text-slate-500 dark:text-slate-400 mt-2 mb-6">
            {t.noResultDesc}
          </p>

          <button
            onClick={() => navigate("/recognize")}
            className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition"
          >
            {t.backWorkspace}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto font-sans space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/feedback", { state: { scanResult: currentItem } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <MessageSquare className="w-4 h-4" />
            {t.feedback}
          </button>

          <button
            onClick={() => navigate("/history")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <History className="w-4 h-4" />
            {t.viewHistory}
          </button>

          <button
            onClick={() => navigate("/recognize")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition"
          >
            <RotateCcw className="w-4 h-4" />
            {t.scanAnother}
          </button>
        </div>
      </div>

      {resultsArray.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {resultsArray.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
                activeTab === index
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Result {index + 1}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.uploadTitle}
            </p>
          </div>

          <div className="p-5">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Uploaded banknote"
                className="w-full rounded-2xl bg-slate-50 dark:bg-slate-800 object-contain max-h-[380px]"
              />
            ) : (
              <div className="h-[260px] rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                No image
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.finalDecision}
                </p>

                <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 mt-2">
                  {finalDenomination}
                </h2>
              </div>

              <span
                className={`px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${getConsensusBadgeClass(
                  consensus,
                )}`}
              >
                {getConsensusStatusLabel(consensus, lang)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label={t.lblCountry} value={finalCountry} />
              <InfoRow label={t.lblCurrency} value={finalCurrency} />
              <InfoRow label={t.lblMaterial} value={finalMaterial} />
              <InfoRow label={t.lblOrigin} value={finalOrigin} />
            </div>

            <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                {t.referee}
              </p>

              <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
                <ReactMarkdown>{stripMarkdownSymbols(consensusText)}</ReactMarkdown>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label={t.lblDenomination} value={finalDenomination} />
            <SummaryCard label={t.lblCountry} value={finalCountry} />
            <SummaryCard label={t.lblConsensus} value={`${matchedAgents}/3 ${t.agents}`} />
            <SummaryCard label={t.lblCurrency} value={finalCurrency} />
          </div>
        </div>
      </div>

      {exchangeResults && exchangeResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                {t.exchangeTitle}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t.exchangeDesc}
              </p>
            </div>

            <Link
              to="/exchange"
              className="text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline"
            >
              {t.fullConverter}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {exchangeResults.map((item) => (
              <div
                key={item.code}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50"
              >
                <p className="text-xs font-black uppercase text-slate-400">
                  {item.code}
                </p>

                <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">
                  {new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US", {
                    maximumFractionDigits: item.code === "VND" ? 0 : 2,
                  }).format(item.value)}
                </p>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
          {t.aggDecision}
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
          {t.aggDesc}
        </p>

        <div className="space-y-3">
          <DecisionItem
            label="YOLO / ML"
            value={getAgentDenomination(agents.ml_dl)}
            status={getAgentDenomination(agents.ml_dl) === finalDenomination ? "matched" : "different"}
            t={t}
          />

          <DecisionItem
            label="LLM"
            value={getAgentDenomination(agents.llm_api)}
            status={getAgentDenomination(agents.llm_api) === finalDenomination ? "matched" : "different"}
            t={t}
          />

          <DecisionItem
            label="Visual Search"
            value={getAgentDenomination(agents.visual_search)}
            status={getAgentDenomination(agents.visual_search) === finalDenomination ? "matched" : "different"}
            t={t}
          />

          <DecisionItem
            label="Aggregator"
            value={finalDenomination}
            status="final"
            t={t}
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-4">
          {t.agentCompare}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <AgentCard
            agentKey="Agent 1"
            title="YOLO / ML"
            method="Visual detection"
            data={agents.ml_dl}
            finalDenomination={finalDenomination}
            t={t}
          />

          <AgentCard
            agentKey="Agent 2"
            title="LLM"
            method="Language reasoning"
            data={agents.llm_api}
            finalDenomination={finalDenomination}
            t={t}
          />

          <AgentCard
            agentKey="Agent 3"
            title="Visual Search"
            method="External visual matching"
            data={agents.visual_search}
            finalDenomination={finalDenomination}
            t={t}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowRawLog(!showRawLog)}
          className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
        >
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {t.fullLogTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t.fullLogDesc}
            </p>
          </div>

          {showRawLog ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showRawLog && (
          <div className="px-6 pb-6">
            <div className="bg-slate-950 text-emerald-400 rounded-2xl p-4 text-sm overflow-auto max-h-[420px]">
              <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <FileJson className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {t.jsonTitle}
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopyJSON}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Copy className="w-4 h-4" />
              {t.copy}
            </button>

            <button
              onClick={handleDownloadJSON}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-teal-600 text-white text-sm font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition"
            >
              <Download className="w-4 h-4" />
              {t.download}
            </button>
          </div>
        </div>

        <pre className="bg-slate-950 text-emerald-400 p-6 text-xs overflow-auto max-h-[520px]">
          {JSON.stringify(currentItem, null, 2)}
        </pre>
      </div>

      <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black">{t.continueTitle}</h2>
          <p className="text-slate-400 mt-2">{t.continueDesc}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate("/recognize")}
            className="px-5 py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500 transition"
          >
            {t.btnScanAnother}
          </button>

          <button
            onClick={() => navigate("/history")}
            className="px-5 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/15 transition"
          >
            {t.btnViewHistory}
          </button>
        </div>
      </div>
    </div>
  );
}