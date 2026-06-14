import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

import { useCurrencyStore } from "../../store/currencyStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Cpu,
  Download,
  FileJson,
  History,
  MessageSquare,
  RotateCcw,
  Wallet,
} from "lucide-react";

const normalizeText = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const normalizeStatusLabel = (status, lang) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return lang === "VI" ? "Hoàn thành" : "Completed";
  if (s === "needs_better_image") return lang === "VI" ? "Cần ảnh rõ hơn" : "Needs clearer image";
  if (s === "needs review" || s === "needs_review") return lang === "VI" ? "Cần xem lại" : "Needs review";
  if (s === "partial" || s.includes("partial")) return lang === "VI" ? "Hoàn thành một phần" : "Partially completed";
  if (s === "no_banknote_detected") return lang === "VI" ? "Không phát hiện tiền" : "No banknote detected";
  if (s === "failed") return lang === "VI" ? "Thất bại" : "Failed";
  return status || "N/A";
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

  // Multi-object partial: hiển thị X/Y Completed
  if (consensus?.partial) {
    const completed = consensus?.completed_objects ?? 0;
    const total = consensus?.total_objects ?? matched;
    return lang === "VI"
      ? `Hoàn thành ${completed}/${total}`
      : `${completed}/${total} Completed`;
  }

  // needs_better_image — không dùng matched_agents để quyết định
  if (String(status || "").toLowerCase() === "needs_better_image") {
    return lang === "VI" ? "Cần ảnh rõ hơn" : "Needs clearer image";
  }

  if (
    String(status || "")
      .toLowerCase()
      .includes("re-analysis")
  ) {
    return lang === "VI" ? "Cần phân tích lại" : "Need re-analysis";
  }

  if (matched >= 3) return lang === "VI" ? "Đồng thuận cao" : "High consensus";
  if (matched === 2)
    return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
  if (status) return status;

  return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
};

const getConsensusBadgeClass = (consensus) => {
  const label = String(consensus?.status || "").toLowerCase();
  const matched = Number(consensus?.matched_agents || 0);

  // Partial multi-object: amber warning (không xanh dù có object Completed)
  if (consensus?.partial) {
    return "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30";
  }

  // needs_better_image: amber
  if (label === "needs_better_image") {
    return "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30";
  }

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
    const name = String(
      item?.agent || item?.agent_name || item?.name || "",
    ).toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  });

  return found?.data || found?.result || null;
};


const getAgentPayload = (agentItem) => {
  if (!agentItem) return {};
  return agentItem?.data || agentItem?.result || agentItem;
};

const getAgentLabel = (agentItem, fallback = "Agent") => {
  const raw = String(agentItem?.agent || agentItem?.agent_name || agentItem?.name || fallback);
  const low = raw.toLowerCase();

  if (low.includes("yolo") || low.includes("ml")) return "YOLO / ML";
  if (low.includes("llm") || low.includes("gemini")) return "LLM";
  if (low.includes("lens") || low.includes("visual")) return "Visual Search";
  if (low.includes("aggregator")) return "Aggregator";

  return raw;
};

const getObjectFinalData = (item) => item?.final_result || item?.summary || {};

const getObjectDenomination = (item) => {
  const final = getObjectFinalData(item);
  return normalizeText(
    final.final_denomination ||
      final.menh_gia ||
      final.denomination ||
      final.denomination_label ||
      item?.summary?.denomination,
  );
};

const getObjectCountry = (item) => {
  const final = getObjectFinalData(item);
  return normalizeText(
    final.quoc_gia ||
      final.country ||
      final.origin ||
      item?.summary?.country,
  );
};

const getObjectMatchedAgents = (item) => {
  const final = getObjectFinalData(item);
  if (final.matched_agents !== undefined && final.matched_agents !== null) {
    return Number(final.matched_agents);
  }
  if (final.so_luong_dong_thuan !== undefined && final.so_luong_dong_thuan !== null) {
    return Number(final.so_luong_dong_thuan);
  }
  return 0;
};

const getObjectRefereeText = (item) => {
  const final = getObjectFinalData(item);
  return stripMarkdownSymbols(
    final.quan_diem_trong_tai ||
      final.referee_view ||
      final.reasoning ||
      final.mo_ta ||
      final.description ||
      `Aggregator selected ${getObjectDenomination(item)} with ${getObjectMatchedAgents(item)}/3 agent agreement.`,
  );
};

const buildMultiObjectDebateLog = (objects, lang = "EN") => {
  if (!Array.isArray(objects) || objects.length === 0) {
    return lang === "VI" ? "Không có nhật ký tranh biện." : "No debate log available.";
  }

  const lines = [];

  lines.push(
    lang === "VI"
      ? `Hệ thống phát hiện ${objects.length} đối tượng tiền giấy. Mỗi đối tượng được crop riêng, sau đó YOLO/ML, LLM và Visual Search phân tích độc lập. Aggregator chỉ so sánh 3 agent trong cùng một đối tượng, không so sánh tờ này với tờ khác.`
      : `The system detected ${objects.length} banknote objects. Each object was cropped and analyzed independently. The aggregator compares the 3 agents inside the same object only; it does not compare one banknote against another.`,
  );

  objects.forEach((item, index) => {
    const objectNo = item?.object_index || index + 1;
    const finalDenom = getObjectDenomination(item);
    const country = getObjectCountry(item);
    const matched = getObjectMatchedAgents(item);
    const agents = Array.isArray(item?.agent_results) ? item.agent_results : [];

    lines.push("");
    lines.push(`## ${lang === "VI" ? "Đối tượng" : "Object"} #${objectNo}`);
    lines.push(`- ${lang === "VI" ? "Kết luận" : "Final"}: ${finalDenom}`);
    lines.push(`- ${lang === "VI" ? "Quốc gia" : "Country"}: ${country}`);
    lines.push(`- ${lang === "VI" ? "Đồng thuận" : "Consensus"}: ${matched}/3 agents`);

    if (item?.bbox) {
      lines.push(`- bbox: [${item.bbox.join(", ")}]`);
    }

    lines.push("");
    lines.push(lang === "VI" ? "### Phiếu của từng agent" : "### Agent votes");

    agents.forEach((agentItem, agentIndex) => {
      const payload = getAgentPayload(agentItem);
      const agentName = getAgentLabel(agentItem, `Agent ${agentIndex + 1}`);
      const denom = getAgentDenomination(payload);
      const countryVote = getAgentCountry(payload);
      const reasoning = stripMarkdownSymbols(getAgentReasoning(payload));
      const status = denom === finalDenom ? (lang === "VI" ? "khớp" : "matched") : (lang === "VI" ? "khác" : "different");

      lines.push(`- ${agentName}: ${denom} / ${countryVote} (${status})`);
      if (reasoning && reasoning !== "N/A") {
        lines.push(`  - ${lang === "VI" ? "Lý do" : "Reason"}: ${reasoning}`);
      }
    });

    lines.push("");
    lines.push(lang === "VI" ? "### Kết luận Aggregator" : "### Aggregator conclusion");
    lines.push(getObjectRefereeText(item));
  });

  return lines.join("\n");
};

const normalizeBackendResult = (rawResult, session) => {
  if (!rawResult) return null;

  if (rawResult.data || rawResult.agents || rawResult.consensus) {
    return {
      ...rawResult,
      image_url:
        rawResult.input_image_url ||
        rawResult.image_url ||
        rawResult.uploaded_image_url ||
        rawResult.thumbnail_url ||
        rawResult.result?.input_image_url ||
        rawResult.result?.image_url ||
        rawResult.result?.uploaded_image_url ||
        rawResult.result?.thumbnail_url ||
        session?.previewUrl ||
        null,
      raw_backend: rawResult.raw_backend || rawResult,
    };
  }

  const final = rawResult.final_result || rawResult.result?.final_result || {};
  const agentResults =
    rawResult.agent_results || rawResult.result?.agent_results || [];

  const detectedObjects =
    final.detected_objects ||
    final.detectedObjects ||
    rawResult.detected_objects ||
    rawResult.result?.detected_objects ||
    [];

  const isMultiObject =
    Array.isArray(detectedObjects) &&
    detectedObjects.length > 0 &&
    (final.mode === "multi_object" || final.mode === "single_object" || final.detected_count);

  if (isMultiObject) {
    const firstObject = detectedObjects[0] || {};
    const firstFinal = firstObject.final_result || {};
    const firstSummary = firstObject.summary || {};

    const denomination =
      detectedObjects.length > 1
        ? `${detectedObjects.length} banknotes detected`
        : firstFinal.final_denomination ||
          firstFinal.menh_gia ||
          firstSummary.denomination ||
          "N/A";

    const country =
      detectedObjects.length > 1
        ? "Multiple"
        : firstFinal.quoc_gia ||
          firstFinal.country ||
          firstSummary.country ||
          "Không xác định";

    const currency =
      detectedObjects.length > 1
        ? "Multiple"
        : firstFinal.currency ||
          firstFinal.currency_code ||
          firstSummary.currency ||
          inferCurrencyFromDenomination(denomination, "VND");

    return {
      id: rawResult.id || rawResult._id || rawResult.result_id,
      status: rawResult.status || rawResult.result?.status || final.status || "Completed",
      image_url:
        rawResult.input_image_url ||
        rawResult.uploaded_image_url ||
        rawResult.image_url ||
        rawResult.thumbnail_url ||
        rawResult.result?.input_image_url ||
        rawResult.result?.uploaded_image_url ||
        rawResult.result?.image_url ||
        rawResult.result?.thumbnail_url ||
        session?.previewUrl ||
        null,
      data: {
        denomination,
        currency,
        country,
        origin: country,
        material: detectedObjects.length > 1 ? "Multiple" : firstFinal.chat_lieu || firstFinal.material || "Không xác định",
        description:
          final.quan_diem_trong_tai ||
          `Detected ${detectedObjects.length} banknote object(s).`,
        estimated_usd: "N/A",
      },
      agents: {
        ml_dl: firstObject.agent_results?.find((item) =>
          String(item?.agent || "").toLowerCase().includes("yolo"),
        )?.data,
        llm_api: firstObject.agent_results?.find((item) =>
          String(item?.agent || "").toLowerCase().includes("llm"),
        )?.data,
        visual_search: firstObject.agent_results?.find((item) =>
          String(item?.agent || "").toLowerCase().includes("lens"),
        )?.data,
      },
      consensus: {
        method: final.method || "multi_object_pipeline",
        matched_agents: Number(final.matched_agents || 0),
        status: final.status || "Completed",
        partial: Boolean(final.partial),
        completed_objects: final.completed_objects ?? null,
        needs_better_image_objects: final.needs_better_image_objects ?? null,
        total_objects: final.total_objects ?? detectedObjects.length,
        object_status_summary: final.object_status_summary ?? null,
        referee_view:
          final.quan_diem_trong_tai ||
          `Detected ${detectedObjects.length} banknote object(s). Each object was analyzed separately.`,
        valid_votes: final.valid_votes || [],
        debate_log:
          final.debate_log ||
          final.quan_diem_trong_tai ||
          buildMultiObjectDebateLog(detectedObjects, "EN"),
      },
      multi_object: true,
      detected_objects: detectedObjects,
      token_usage: rawResult.token_usage || rawResult.result?.token_usage || {},
      system_tokens_charged:
        rawResult.system_tokens_charged ||
        rawResult.result?.system_tokens_charged ||
        0,
      input_tokens: rawResult.input_tokens || rawResult.result?.input_tokens || 0,
      output_tokens:
        rawResult.output_tokens || rawResult.result?.output_tokens || 0,
      total_ai_tokens:
        rawResult.total_ai_tokens || rawResult.result?.total_ai_tokens || 0,
      billable_ai_tokens:
        rawResult.billable_ai_tokens || rawResult.result?.billable_ai_tokens || 0,
      billing_mode:
        rawResult.billing_mode || rawResult.result?.billing_mode || "fixed",
      balance_before:
        rawResult.balance_before ?? rawResult.result?.balance_before,
      balance_after: rawResult.balance_after ?? rawResult.result?.balance_after,
      raw_backend: rawResult,
    };
  }

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

  let matchedAgents = 0;
  if (final.matched_agents !== undefined && final.matched_agents !== null) {
    matchedAgents = Number(final.matched_agents);
  } else if (final.so_luong_dong_thuan !== undefined && final.so_luong_dong_thuan !== null) {
    matchedAgents = Number(final.so_luong_dong_thuan);
  }

  const status =
    final.status || rawResult.status || rawResult.result?.status || "Completed";

  const mlData = getAgentDataByName(agentResults, ["yolo", "ml", "agent_1"]);
  const llmData = getAgentDataByName(agentResults, [
    "llm",
    "gemini",
    "agent_2",
  ]);
  const lensData = getAgentDataByName(agentResults, [
    "lens",
    "visual",
    "agent_3",
  ]);

  return {
    id: rawResult.id || rawResult._id || rawResult.result_id,
    status,
    image_url:
      rawResult.input_image_url ||
      rawResult.uploaded_image_url ||
      rawResult.image_url ||
      rawResult.thumbnail_url ||
      rawResult.result?.input_image_url ||
      rawResult.result?.uploaded_image_url ||
      rawResult.result?.image_url ||
      rawResult.result?.thumbnail_url ||
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
    token_usage: rawResult.token_usage || rawResult.result?.token_usage || {},
    system_tokens_charged:
      rawResult.system_tokens_charged ||
      rawResult.result?.system_tokens_charged ||
      0,
    input_tokens: rawResult.input_tokens || rawResult.result?.input_tokens || 0,
    output_tokens:
      rawResult.output_tokens || rawResult.result?.output_tokens || 0,
    total_ai_tokens:
      rawResult.total_ai_tokens || rawResult.result?.total_ai_tokens || 0,
    billable_ai_tokens:
      rawResult.billable_ai_tokens || rawResult.result?.billable_ai_tokens || 0,
    billing_mode:
      rawResult.billing_mode || rawResult.result?.billing_mode || "fixed",
    balance_before:
      rawResult.balance_before ?? rawResult.result?.balance_before,
    balance_after: rawResult.balance_after ?? rawResult.result?.balance_after,
    raw_backend: rawResult,
  };
};

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
      subtitle:
        "Review the final decision, agent outputs, and structured JSON result.",
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
      aggDesc:
        "The aggregator compares all agent outputs and selects the majority result.",
      agentCompare: "Agent Comparison",
      fullLogTitle: "Full Reasoning Log",
      fullLogDesc:
        "Detailed reasoning is collapsed to keep the report readable.",
      hideLog: "Hide Log",
      viewLog: "View Full Log",
      jsonTitle: "Structured JSON Output",
      copy: "Copy",
      download: "Download",
      continueTitle: "Continue scanning",
      continueDesc:
        "Start another scan or review saved results in your history.",
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
      tokenUsageTitle: "Token Usage",
      tokenUsageDesc: "Actual tokens charged for this recognition result.",
      tokensCharged: "Tokens charged",
      balanceBefore: "Balance before",
      balanceAfter: "Balance after",
      aiTokens: "AI tokens",
      billableTokens: "Billable AI tokens",
      billingMode: "Billing mode",
      inputOutputTokens: "Input / Output",
    },
    VI: {
      title: "Báo Cáo Phân Tích",
      subtitle:
        "Xem lại quyết định cuối cùng, kết quả từ các đặc vụ và dữ liệu JSON.",
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
      aggDesc:
        "Hệ thống tổng hợp đối chiếu kết quả từ các đặc vụ và chọn ra kết quả đa số.",
      agentCompare: "So Sánh Các Đặc Vụ",
      fullLogTitle: "Nhật Ký Tranh Biện",
      fullLogDesc: "Lý luận chi tiết được thu gọn để báo cáo dễ đọc hơn.",
      hideLog: "Ẩn Nhật Ký",
      viewLog: "Xem Toàn Bộ Nhật Ký",
      jsonTitle: "Dữ Liệu JSON Cấu Trúc",
      copy: "Sao chép",
      download: "Tải xuống",
      continueTitle: "Tiếp Tục",
      continueDesc:
        "Bắt đầu quét một ảnh khác hoặc xem lại kết quả trong lịch sử.",
      btnScanAnother: "Quét Tờ Tiền Khác",
      btnViewHistory: "Xem Lịch Sử Quét",
      noResult: "Không có dữ liệu kết quả",
      noResultDesc:
        "Vui lòng thực hiện quét một tờ tiền mới từ không gian làm việc.",
      backWorkspace: "Trở lại Không Gian Làm Việc",
      matched: "Trùng Khớp",
      different: "Khác Biệt",
      final: "Chốt Kết Quả",
      noAgentData: "Không có dữ liệu từ đặc vụ này.",
      showLess: "Thu gọn",
      readFull: "Xem toàn bộ lập luận",
      tokenUsageTitle: "Thông Tin Token",
      tokenUsageDesc: "Số token thực tế đã trừ cho lần nhận diện này.",
      tokensCharged: "Token đã trừ",
      balanceBefore: "Số dư trước",
      balanceAfter: "Số dư sau",
      aiTokens: "AI token",
      billableTokens: "AI token tính phí",
      billingMode: "Chế độ tính phí",
      inputOutputTokens: "Đầu vào / Đầu ra",
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

  const isBlobUrl = (url) => String(url || "").startsWith("blob:");

  const previewImage =
    currentItem?.input_image_url ||
    currentItem?.image_url ||
    currentItem?.uploaded_image_url ||
    currentItem?.thumbnail_url ||
    currentItem?.raw_backend?.input_image_url ||
    currentItem?.raw_backend?.image_url ||
    currentItem?.raw_backend?.uploaded_image_url ||
    currentItem?.data?.image_url ||
    (!isBlobUrl(session?.previewUrl) ? session?.previewUrl : null) ||
    (!isBlobUrl(location.state?.previewUrl) ? location.state?.previewUrl : null) ||
    null;

  const matchedAgents = Number(consensus?.matched_agents || 0);

  const consensusText =
    consensus?.referee_view ||
    consensus?.quan_diem_trong_tai ||
    (matchedAgents
      ? `Majority vote selected ${finalDenomination} with ${matchedAgents}/3 agents matched.`
      : "No conclusion provided.");

  const safeDebateLog = currentItem?.multi_object
    ? buildMultiObjectDebateLog(currentItem.detected_objects, lang || "EN")
    : stripMarkdownSymbols(consensus?.debate_log || "No debate log available.");

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
            onClick={() =>
              navigate("/feedback", { state: { scanResult: currentItem } })
            }
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

      <TokenUsageCard currentItem={currentItem} t={t} />

      {currentItem?.multi_object && (
        <MultiObjectResults currentItem={currentItem} t={t} lang={lang} />
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
                className={`px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider ${getConsensusBadgeClass(consensus)}`}
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
                <ReactMarkdown>
                  {stripMarkdownSymbols(consensusText)}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label={t.lblDenomination} value={finalDenomination} />
            <SummaryCard label={t.lblCountry} value={finalCountry} />
            <SummaryCard
              label={t.lblConsensus}
              value={
                currentItem?.multi_object
                  ? (currentItem?.consensus?.partial
                      ? (lang === "VI"
                          ? `Hoàn thành ${currentItem.consensus.completed_objects ?? 0}/${currentItem.consensus.total_objects ?? 0}`
                          : `${currentItem.consensus.completed_objects ?? 0}/${currentItem.consensus.total_objects ?? 0} Completed`)
                      : `${currentItem.detected_objects?.length || 0} objects`)
                  : `${matchedAgents}/3 ${t.agents}`
              }
            />
            <SummaryCard label={t.lblCurrency} value={finalCurrency} />
          </div>
        </div>
      </div>

      {!currentItem?.multi_object && exchangeResults && exchangeResults.length > 0 && (
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

      {!currentItem?.multi_object && (
        <>
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
            status={
              getAgentDenomination(agents.ml_dl) === finalDenomination
                ? "matched"
                : "different"
            }
            t={t}
          />

          <DecisionItem
            label="LLM"
            value={getAgentDenomination(agents.llm_api)}
            status={
              getAgentDenomination(agents.llm_api) === finalDenomination
                ? "matched"
                : "different"
            }
            t={t}
          />

          <DecisionItem
            label="Visual Search"
            value={getAgentDenomination(agents.visual_search)}
            status={
              getAgentDenomination(agents.visual_search) === finalDenomination
                ? "matched"
                : "different"
            }
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

        </>
      )}

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
            className="px-5 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition"
          >
            {t.btnViewHistory}
          </button>
        </div>
      </div>
    </div>
  );
}

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


function MultiObjectResults({ currentItem, t, lang }) {
  const objects = Array.isArray(currentItem?.detected_objects)
    ? currentItem.detected_objects
    : [];

  const [expandedObject, setExpandedObject] = useState(null);

  if (!objects.length) return null;

  const getObjectStatus = (item) => {
    const final = getObjectFinalData(item);
    return final.status || item?.summary?.status || "Completed";
  };

  const getObjectImage = (item) => {
    if (item?.crop_base64) {
      return `data:image/jpeg;base64,${item.crop_base64}`;
    }

    return currentItem?.image_url || null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            {lang === "VI"
              ? `Đã phát hiện ${objects.length} tờ tiền`
              : `${objects.length} banknotes detected`}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lang === "VI"
              ? "Mỗi tờ tiền được crop riêng. YOLO/ML, LLM và Visual Search tranh luận riêng cho từng tờ; Aggregator không so sánh tờ 5.000 với tờ 2.000."
              : "Each banknote is cropped separately. YOLO/ML, LLM, and Visual Search debate each banknote independently; the aggregator does not compare the 5,000 note against the 2,000 note."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {objects.map((item, index) => {
          const objectNo = item?.object_index || index + 1;
          const denomination = getObjectDenomination(item);
          const country = getObjectCountry(item);
          const status = getObjectStatus(item);
          const matchedAgents = getObjectMatchedAgents(item);
          const image = getObjectImage(item);
          const agents = Array.isArray(item?.agent_results)
            ? item.agent_results
            : [];
          const objectDebate = buildMultiObjectDebateLog([item], lang || "EN");
          const isExpanded = expandedObject === objectNo;

          return (
            <div
              key={objectNo}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/40"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    {lang === "VI" ? "Tờ tiền" : "Banknote"} #{objectNo}
                  </p>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">
                    {denomination}
                  </h3>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-black border ${
                    matchedAgents >= 2
                      ? "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30"
                      : "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                  }`}
                >
                  {matchedAgents}/3
                </span>
              </div>

              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {image ? (
                    <img
                      src={image}
                      alt={`Banknote crop ${objectNo}`}
                      className="w-full rounded-xl bg-white dark:bg-slate-900 object-contain max-h-[240px]"
                    />
                  ) : (
                    <div className="h-[180px] rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
                      No crop
                    </div>
                  )}

                  {item?.bbox && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                      bbox: [{item.bbox.join(", ")}]
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <InfoRow label={t.lblCountry} value={country} />
                  <InfoRow label={t.lblDenomination} value={denomination} />
                  <InfoRow label="Status" value={normalizeStatusLabel(status, lang)} />
                  <InfoRow
                    label={t.lblConsensus}
                    value={`${matchedAgents}/3 ${t.agents}`}
                  />

                  <div className="pt-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                      {lang === "VI" ? "Tranh luận agent" : "Agent debate"}
                    </p>

                    <div className="space-y-2">
                      {agents.map((agentItem, agentIndex) => {
                        const data = getAgentPayload(agentItem);
                        const agentName = getAgentLabel(agentItem, `Agent ${agentIndex + 1}`);
                        const agentDenom = getAgentDenomination(data);
                        const isMatched = agentDenom === denomination;

                        return (
                          <div
                            key={agentIndex}
                            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {agentName}
                              </p>
                              <span
                                className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${
                                  isMatched
                                    ? "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30"
                                    : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                                }`}
                              >
                                {isMatched ? t.matched : t.different}
                              </span>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                              <span className="text-slate-500 dark:text-slate-400">
                                {t.lblDenomination}
                              </span>
                              <span className="font-black text-slate-900 dark:text-slate-100 text-right">
                                {agentDenom}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-3">
                              {stripMarkdownSymbols(getAgentReasoning(data))}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4">
                <div className="rounded-2xl bg-slate-950 text-emerald-400 p-4 text-xs overflow-auto">
                  <ReactMarkdown>
                    {isExpanded ? objectDebate : `${objectDebate.slice(0, 520)}${objectDebate.length > 520 ? "..." : ""}`}
                  </ReactMarkdown>
                </div>

                {objectDebate.length > 520 && (
                  <button
                    onClick={() => setExpandedObject(isExpanded ? null : objectNo)}
                    className="mt-3 text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {isExpanded ? t.showLess : t.readFull}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TokenUsageCard({ currentItem, t }) {
  const raw = currentItem?.raw_backend || currentItem || {};
  const usage = raw?.token_usage || currentItem?.token_usage || {};

  const systemTokensCharged =
    raw?.system_tokens_charged ??
    currentItem?.system_tokens_charged ??
    usage?.system_tokens_charged ??
    0;

  const inputTokens =
    raw?.input_tokens ?? currentItem?.input_tokens ?? usage?.input_tokens ?? 0;

  const outputTokens =
    raw?.output_tokens ??
    currentItem?.output_tokens ??
    usage?.output_tokens ??
    0;

  const totalAiTokens =
    raw?.total_ai_tokens ??
    currentItem?.total_ai_tokens ??
    usage?.total_ai_tokens ??
    Number(inputTokens || 0) + Number(outputTokens || 0);

  const billableAiTokens =
    raw?.billable_ai_tokens ??
    currentItem?.billable_ai_tokens ??
    usage?.billable_ai_tokens ??
    0;

  const balanceBefore =
    raw?.balance_before ?? currentItem?.balance_before ?? usage?.balance_before;

  const balanceAfter =
    raw?.balance_after ?? currentItem?.balance_after ?? usage?.balance_after;

  const billingMode =
    raw?.billing_mode ??
    currentItem?.billing_mode ??
    usage?.billing_mode ??
    "fixed";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-teal-100 dark:border-teal-500/20 shadow-sm p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {t.tokenUsageTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t.tokenUsageDesc}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 rounded-2xl bg-teal-600 text-white shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-teal-100">
            {t.tokensCharged}
          </p>
          <p className="text-3xl font-black leading-none mt-1">
            {systemTokensCharged}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <TokenMetric
          icon={<Wallet className="w-4 h-4" />}
          label={t.balanceBefore}
          value={balanceBefore ?? "N/A"}
        />

        <TokenMetric
          icon={<Wallet className="w-4 h-4" />}
          label={t.balanceAfter}
          value={balanceAfter ?? "N/A"}
        />

        <TokenMetric
          icon={<Cpu className="w-4 h-4" />}
          label={t.inputOutputTokens}
          value={`${inputTokens} / ${outputTokens}`}
        />

        <TokenMetric
          icon={<Cpu className="w-4 h-4" />}
          label={t.aiTokens}
          value={totalAiTokens}
        />

        <TokenMetric
          icon={<Coins className="w-4 h-4" />}
          label={t.billingMode}
          value={billingMode}
        />
      </div>

      {Number(billableAiTokens || 0) > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          {t.billableTokens}:{" "}
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {billableAiTokens}
          </span>
        </p>
      )}
    </div>
  );
}

function TokenMetric({ icon, label, value }) {
  return (
    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-wider">
          {label}
        </p>
      </div>

      <p className="text-lg font-black text-slate-900 dark:text-slate-100">
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
        <InfoRow
          label={t.lblMaterial}
          value={data?.chat_lieu || data?.material}
        />
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
