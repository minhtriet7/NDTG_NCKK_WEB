import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

import { useCurrencyStore } from "../../store/currencyStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";
import { getRecognitionTaskStatus, getRecognitionResult } from "../../services/recognitionService";
import {
  buildRecognitionRestoreKey,
  buildMoneyCanonical,
  findBackendValidVote,
  formatSuggestedResultText,
  getAg3FormatterLabel,
  getAg3MethodLabel,
  getAg3ProviderLabel,
  getCropPreviewSource,
  inferMoneyCurrency,
  isSameMoneyVote,
  normalizeConsensusAgentKey,
  normalizeCurrencyCode,
  normalizeMoneyText,
  parseMoneyAmount,
  resolveAgentVoteStatus,
  shouldRefetchRecognitionResult,
} from "../../utils/agentVote";

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
  CheckCircle2,
  AlertTriangle,
  Globe,
  Layers,
  Zap,
  BrainCircuit,
  ScanSearch,
  TrendingUp,
  ChevronRight,
  Hash,
  Calendar,
  Check,
  Image as ImageIcon,
  ExternalLink,
  Maximize2,
  X,
  ShieldCheck,
  Gauge,
  Brain,
  Gavel,
  ScanLine,
} from "lucide-react";

const normalizeText = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
};

const normalizeStatusLabel = (status, lang) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return lang === "VI" ? "Hoàn thành" : "Completed";
  if (s === "completed_partial") return lang === "VI" ? "Hoàn thành một phần" : "Partially completed";
  if (s === "completed_with_limit") return lang === "VI" ? "Hoàn thành trong giới hạn" : "Completed with limit";
  if (s === "needs_better_image") return lang === "VI" ? "Cần ảnh rõ hơn" : "Needs clearer image";
  if (s === "needs review" || s === "needs_review") return lang === "VI" ? "Cần xem lại" : "Needs review";
  if (s === "conflict" || s === "consensus_failed") return lang === "VI" ? "Chưa đạt đồng thuận" : "Consensus conflict";
  if (s === "agent_error" || s === "technical_error") return lang === "VI" ? "Lỗi kỹ thuật" : "Technical error";
  if (s === "not_banknote_or_unclear") return lang === "VI" ? "Ảnh chưa đủ rõ" : "Image is unclear";
  if (s === "partial" || s.includes("partial")) return lang === "VI" ? "Hoàn thành một phần" : "Partially completed";
  if (s === "no_banknote_detected") return lang === "VI" ? "Không phát hiện tiền" : "No banknote detected";
  if (s === "failed") return lang === "VI" ? "Thất bại" : "Failed";
  return status || "N/A";
};

const isNoBanknoteResult = (item) => {
  const status = String(
    item?.status ||
    item?.raw_backend?.status ||
    item?.raw_backend?.result?.status ||
    item?.consensus?.status ||
    ""
  ).toLowerCase();

  const detectedCount =
    item?.detected_count ??
    item?.raw_backend?.detected_count ??
    item?.raw_backend?.result?.detected_count;

  return (
    status === "no_banknote_detected" ||
    (Number(detectedCount) === 0 && status.includes("no_banknote"))
  );
};

const isValidRecognizedMoneyResult = (item) => {
  const status = String(
    item?.status ||
    item?.consensus?.status ||
    item?.raw_backend?.status ||
    ""
  ).toLowerCase();

  const denomination = String(item?.data?.denomination || "").trim().toLowerCase();
  const currency = String(item?.data?.currency || "").trim().toLowerCase();

  const validStatus =
    status === "completed" ||
    status === "completed_with_limit" ||
    status === "completed_partial";

  const invalidDenomination =
    !denomination ||
    denomination === "n/a" ||
    denomination === "needs review" ||
    denomination === "review" ||
    denomination === "unknown" ||
    denomination === "không xác định";

  const invalidCurrency =
    !currency ||
    currency === "n/a" ||
    currency === "review" ||
    currency === "unknown" ||
    currency === "không xác định";

  return validStatus && !invalidDenomination && !invalidCurrency;
};

const isInvalidConclusionResult = (item) => {
  if (isNoBanknoteResult(item)) return false;

  const status = String(
    item?.status ||
    item?.consensus?.status ||
    item?.raw_backend?.status ||
    ""
  ).toLowerCase();

  return (
    status.includes("agent_error") ||
    status.includes("technical_error") ||
    status.includes("needs review") ||
    status.includes("needs_review") ||
    status.includes("consensus_failed") ||
    status.includes("failed") ||
    !isValidRecognizedMoneyResult(item)
  );
};

const formatScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n <= 1 ? n.toFixed(3) : n.toFixed(1);
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const TECHNICAL_OR_CONFLICTING_DETAIL = {
  VI: "Không đủ đồng thuận do tác tử kỹ thuật bị lỗi hoặc bằng chứng mâu thuẫn. Vui lòng kiểm tra thủ công hoặc thử lại.",
  EN: "There is not enough consensus because a technical agent failed or the evidence conflicts. Please review manually or try again.",
};

const normalizeForSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();

const getSuggestedResultFromItem = (item) =>
  firstDefined(
    item?.consensus?.suggested_result_from_valid_agent,
    item?.data?.suggested_result_from_valid_agent,
    item?.suggested_result_from_valid_agent,
    item?.raw_backend?.suggested_result_from_valid_agent,
    item?.raw_backend?.final_result?.suggested_result_from_valid_agent,
    item?.raw_backend?.result?.suggested_result_from_valid_agent,
    item?.raw_backend?.result?.final_result?.suggested_result_from_valid_agent,
    item?.detected_objects?.[0]?.final_result?.suggested_result_from_valid_agent,
  ) || null;

const normalizeInvalidConclusionDetail = (message, item, suggestedResult, lang) => {
  const detail = String(message || "").trim();
  const consensusReason = firstDefined(
    item?.consensus?.consensus_reason,
    item?.raw_backend?.consensus_reason,
    item?.raw_backend?.final_result?.consensus_reason,
    item?.raw_backend?.result?.final_result?.consensus_reason,
  );
  const consensusPattern = firstDefined(
    item?.consensus?.consensus_pattern,
    item?.raw_backend?.consensus_pattern,
    item?.raw_backend?.final_result?.consensus_pattern,
    item?.raw_backend?.result?.final_result?.consensus_pattern,
  );
  const validVotes = firstDefined(
    item?.consensus?.valid_votes,
    item?.raw_backend?.valid_votes,
    item?.raw_backend?.final_result?.valid_votes,
    item?.raw_backend?.result?.final_result?.valid_votes,
  );
  const hasSingleValidVote =
    Array.isArray(validVotes) && validVotes.length === 1;
  const isTechnicalOrConflict =
    Boolean(suggestedResult) ||
    String(consensusReason || "").toLowerCase() === "technical_or_conflicting_evidence" ||
    (String(consensusPattern || "").toLowerCase() === "1-valid-only" && hasSingleValidVote);

  if (!isTechnicalOrConflict) return detail;

  const searchable = normalizeForSearch(detail);
  const isMisleadingImagePrompt =
    !detail ||
    searchable.includes("can anh ro hon") ||
    searchable.includes("clearer image") ||
    searchable.includes("khong dat dong thuan sau 3 lan");

  return isMisleadingImagePrompt
    ? TECHNICAL_OR_CONFLICTING_DETAIL[lang === "VI" ? "VI" : "EN"]
    : detail;
};

const formatResultDate = (value, lang) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(lang === "VI" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getResultNotice = (status, errorMessage, consensus, lang) => {
  const normalized = String(consensus?.status || status || "").toLowerCase();
  const detail =
    errorMessage ||
    consensus?.referee_view ||
    consensus?.quan_diem_trong_tai ||
    "";

  if (["failed", "agent_error", "technical_error"].includes(normalized)) {
    return {
      tone: "error",
      title: lang === "VI" ? "Nhận diện gặp lỗi kỹ thuật" : "Recognition encountered a technical error",
      message:
        detail ||
        (lang === "VI"
          ? "Một dịch vụ phân tích không thể hoàn tất. Vui lòng thử lại với ảnh khác."
          : "An analysis service could not finish. Please retry with another image."),
    };
  }

  if (normalized === "no_banknote_detected") {
    return {
      tone: "warning",
      title: lang === "VI" ? "Không phát hiện vùng tiền giấy hợp lệ" : "No valid banknote region detected",
      message:
        detail ||
        (lang === "VI"
          ? "Hãy chụp rõ toàn bộ tờ tiền, đủ sáng và tránh nền quá phức tạp."
          : "Capture the full banknote clearly with good lighting and a simpler background."),
    };
  }

  if (normalized === "completed_partial") {
    return {
      tone: "warning",
      title:
        lang === "VI"
          ? "Đã hoàn tất với một vùng được bỏ qua"
          : "Completed with one or more skipped regions",
      message:
        lang === "VI"
          ? "Đã nhận diện được tờ tiền hợp lệ. Một số vùng nghi vấn khác đã được bỏ qua."
          : "A valid banknote was recognized. Some other suspicious regions were skipped.",
    };
  }

  if (normalized === "needs_better_image") {
    return {
      tone: "warning",
      title: lang === "VI" ? "Cần ảnh rõ hơn" : "A clearer image is needed",
      message:
        detail ||
        (lang === "VI"
          ? "Kết quả hiện tại chưa đủ tin cậy để xác nhận."
          : "The current evidence is not reliable enough to confirm the result."),
    };
  }

  if (["needs review", "needs_review", "conflict", "consensus_failed"].includes(normalized)) {
    return {
      tone: "warning",
      title: lang === "VI" ? "Kết quả cần được xem lại" : "This result needs review",
      message:
        detail ||
        (lang === "VI"
          ? "Các AI chưa đạt đồng thuận đủ mạnh."
          : "The AI agents did not reach a sufficiently strong consensus."),
    };
  }

  return null;
};

const stripMarkdownSymbols = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/[🤖🧠👁️⚖️✅🔬🔄📦🧾]/g, "")
    .replace(/`/g, "")
    .trim();
};

const inferCurrencyFromDenomination = (denomination, fallback = null) => {
  return inferMoneyCurrency(denomination, fallback);
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

const getAgentMethod = (agent, fallback) => {
  const rawMethod = normalizeText(agent?.phuong_phap || agent?.method || fallback);
  const looksLikeAg3 =
    agent?.ag3_groq_formatter_used !== undefined ||
    agent?.formatter_provider !== undefined ||
    agent?.provider_trace?.formatter_provider !== undefined ||
    /google lens|serpapi|visual search/i.test(rawMethod);
  return looksLikeAg3 ? getAg3MethodLabel(agent, fallback) : rawMethod;
};

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
    label.includes("failed") ||
    label.includes("agent_error") ||
    label.includes("technical")
  ) {
    return "bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30";
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
    const finalData = getObjectFinalData(item);
    const finalCanonical = buildMoneyCanonical({
      denomination: finalDenom,
      currency:
        finalData.ma_tien_te ||
        finalData.currency ||
        finalData.currency_code ||
        inferMoneyCurrency(finalDenom),
      country,
    });
    const validVotes = finalData.valid_votes || item?.consensus?.valid_votes || [];

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
      const normalizedVote = normalizeAgentVote(
        agentItem,
        finalCanonical,
        validVotes,
        getAgentConsensusKey(agentItem),
      );
      const status = normalizedVote.voteStatus === "matched"
        ? lang === "VI" ? "đồng thuận" : "agreed"
        : normalizedVote.voteStatus === "different"
          ? lang === "VI" ? "khác biệt" : "differed"
          : lang === "VI" ? "không tính phiếu" : "not counted";

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

// --- PHASE 1: Helper Functions ---
const safeText = (text, fallback = "N/A") => {
  if (text === null || text === undefined || text === "") return fallback;
  return String(text);
};

const formatCountry = (country) => {
  const c = safeText(country, "Không xác định").trim();
  if (c === "Không xác định" || c === "N/A" || c === "Multiple") return c;
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const formatCurrency = (currency) => {
  const c = safeText(currency, "Không xác định").trim();
  if (c === "Multiple" || c === "N/A" || c === "Không xác định" || c.toLowerCase() === "null") return "Không xác định";
  return c.toUpperCase();
};

const formatDenomination = (denom) => {
  const d = safeText(denom, "N/A").trim();
  if (d === "N/A" || d.includes("banknotes") || d.includes("tờ tiền")) return d;

  const currency = inferMoneyCurrency(d);
  const malformedVndGrouping = d.match(
    /^\s*(\d{1,3})[.,](\d{2})\s*(VND|VNĐ|ĐỒNG)?\s*$/i,
  );
  const malformedCandidate = malformedVndGrouping
    ? Number.parseInt(
        `${malformedVndGrouping[1]}${malformedVndGrouping[2]}0`,
        10,
      )
    : null;
  const standardVndDenominations = new Set([
    1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
  ]);
  const shouldRepairMalformedVnd =
    malformedVndGrouping &&
    (!currency || currency === "VND") &&
    standardVndDenominations.has(malformedCandidate);
  const amount = shouldRepairMalformedVnd
    ? malformedCandidate
    : parseMoneyAmount(d);

  if (amount !== null) {
    const formattedAmount = amount.toLocaleString("en-US");
    return currency ? `${formattedAmount} ${currency}` : `${formattedAmount}`;
  }

  return d;
};

const formatConfidence = (conf) => {
  if (conf === null || conf === undefined || conf === "N/A") return "N/A";
  const num = parseFloat(conf);
  if (isNaN(num)) return "N/A";
  if (num <= 1.0) return `${(num * 100).toFixed(1)}%`;
  return `${num.toFixed(1)}%`;
};

const getAgentDisplayName = (agentName) => {
  const low = String(agentName || "").toLowerCase();
  if (low.includes("yolo") || low.includes("ml") || low.includes("ag0")) return "AG0 YOLO/ML";
  if (low.includes("llm") || low.includes("gemini") || low.includes("agent 2") || low.includes("agent_2") || low.includes("ag2")) return "AG2 Gemini/LLM";
  if (low.includes("lens") || low.includes("visual") || low.includes("agent 3") || low.includes("agent_3") || low.includes("ag3")) return "AG3 Google Lens/Visual Search";
  if (low.includes("agent 1") || low.includes("agent_1") || low.includes("gpt") || low.includes("openai") || low.includes("vision") || low.includes("ag1")) return "AG1 OpenAI/GPT Vision";
  if (low.includes("aggregator") || low.includes("referee") || low.includes("ag4")) return "AG4 Referee/Aggregator";
  return agentName || "Agent";
};

const isTechnicalError = (agentPayload) => {
  if (!agentPayload) return true;
  const status = String(agentPayload.status || "").toLowerCase();
  const error = String(agentPayload.error || "").toLowerCase();
  const reasoning = String(agentPayload.quan_diem || agentPayload.reasoning || "").toLowerCase();

  if (status === "failed" || status === "timeout" || status === "error") return true;
  if (error !== "" && error !== "undefined" && error !== "null") return true;
  if (reasoning.includes("timeout") || reasoning.includes("network") || reasoning.includes("quota") || reasoning.includes("exception")) return true;

  const denom = getAgentDenomination(agentPayload);
  if ((denom === "N/A" || !denom) && (reasoning.includes("failed") || reasoning.includes("error"))) return true;

  return false;
};

const getAgentConsensusKey = (agentItem, fallbackKey) => {
  const payload = getAgentPayload(agentItem);
  const candidates = [
    fallbackKey,
    agentItem?.agent_key,
    payload?.agent_key,
    agentItem?.agent,
    agentItem?.agent_name,
    agentItem?.name,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeConsensusAgentKey(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const getBackendValidVoteCanonical = (validVote) => {
  if (!validVote || typeof validVote !== "object") return null;
  const voteKey = Array.isArray(validVote.vote_key) ? validVote.vote_key : [];
  const agentData = validVote.agent_data || validVote.data || {};
  const agentDenomination = getAgentDenomination(agentData);
  const country =
    validVote.country ||
    validVote.raw_country ||
    voteKey[0] ||
    getAgentCountry(agentData);
  const currency =
    validVote.currency_code ||
    validVote.currency ||
    voteKey[1] ||
    agentData.ma_tien_te ||
    agentData.currency ||
    agentData.currency_code;
  const amount = validVote.amount ?? voteKey[2];
  const denomination =
    validVote.raw_denomination ||
    validVote.denomination ||
    validVote.menh_gia ||
    (agentDenomination !== "N/A" ? agentDenomination : null) ||
    (amount !== null && amount !== undefined ? `${amount} ${currency || ""}` : null);

  return buildMoneyCanonical({ denomination, currency, country });
};

const isNonVotingAgent = (payload) => {
  if (!payload || typeof payload !== "object") return true;
  if (payload.not_counted_in_consensus === true) return true;

  const status = String(payload.status || "").trim().toLowerCase().replace(/\s+/g, "_");
  const errorType = String(payload.error_type || "").trim().toLowerCase().replace(/\s+/g, "_");
  const nonVotingStatuses = new Set([
    "failed",
    "partial",
    "disabled",
    "error",
    "technical_error",
    "no_source",
    "agent_error",
    "timeout",
    "unknown",
  ]);

  return (
    payload.technical_error === true ||
    nonVotingStatuses.has(status) ||
    nonVotingStatuses.has(errorType)
  );
};

const getNonVotingAgentMessage = (vote, lang) => {
  const payload = vote?.payload || {};
  const trace = payload?.promotion_trace || {};
  const reason = String(trace.reason || payload.reason || "").trim().toLowerCase();
  const weakEvidenceReasons = new Set([
    "insufficient_support_signals",
    "insufficient_independent_evidence",
    "insufficient_direct_title_or_snippet_support",
    "page_text_support_required_for_two_sources",
    "weak_single_lens_evidence",
    "weak_source_only",
    "single_untrusted_page_text_source",
    "weak_commercial_source_not_counted",
  ]);
  const hasLensEvidence =
    vote?.agentKey === "visual_search" &&
    (vote?.hasEvidence || Number(trace.page_text_support_count || 0) > 0);

  if (hasLensEvidence && weakEvidenceReasons.has(reason)) {
    return lang === "VI"
      ? "Tìm thấy bằng chứng gần đúng nhưng nguồn chưa đủ mạnh để tính phiếu."
      : "Found near-matching evidence, but the source was not strong enough to count as a vote.";
  }

  if (vote?.hasEvidence) {
    return lang === "VI"
      ? "Không đủ chắc để tính phiếu"
      : "Not confident enough to count";
  }

  return lang === "VI"
    ? "Không có kết quả hợp lệ để tính phiếu"
    : "No valid result to count";
};

const normalizeAgentVote = (
  agentItem,
  finalCanonical,
  consensusValidVotes = [],
  fallbackAgentKey = null,
) => {
  const payload = getAgentPayload(agentItem);
  const isErr = isTechnicalError(payload);
  const agentDenomination = getAgentDenomination(payload);
  const country = getAgentCountry(payload);

  const rawStatus = String(payload?.status || "").toLowerCase();
  const isDisabled = rawStatus === "disabled";
  const hasEvidence = Array.isArray(payload?.evidence) && payload?.evidence.length > 0;
  const agentKey = getAgentConsensusKey(agentItem, fallbackAgentKey);
  const backendValidVote = findBackendValidVote(consensusValidVotes, agentKey);
  const backendVoteKey = Array.isArray(backendValidVote?.vote_key)
    ? backendValidVote.vote_key
    : [];
  const backendCurrency =
    backendValidVote?.currency_code ||
    backendValidVote?.currency ||
    backendVoteKey[1] ||
    null;
  const backendAmount = backendValidVote?.amount ?? backendVoteKey[2];
  const backendDenomination =
    backendValidVote?.raw_denomination ||
    backendValidVote?.denomination ||
    backendValidVote?.menh_gia ||
    (backendAmount !== null && backendAmount !== undefined
      ? `${backendAmount} ${backendCurrency || ""}`.trim()
      : null);
  const denom =
    agentDenomination !== "N/A" ? agentDenomination : backendDenomination || "N/A";

  const rawCurrency =
    payload?.ma_tien_te || payload?.currency_code || payload?.currency || null;
  const agentCurrency = inferMoneyCurrency(denom, rawCurrency || backendCurrency);
  const displayCurrency = agentCurrency || finalCanonical?.currency;
  const hasResult = Boolean(
    denom && denom !== "N/A" && !denom.toLowerCase().includes("không"),
  );

  const agentCanonical = buildMoneyCanonical({
    denomination: denom,
    currency: agentCurrency,
    country,
  });

  const fallbackMatchesFinal = isSameMoneyVote(agentCanonical, finalCanonical);
  const backendVoteCanonical = getBackendValidVoteCanonical(backendValidVote);
  const backendVoteMatchesFinal = isSameMoneyVote(backendVoteCanonical, finalCanonical);
  const nonVoting = isNonVotingAgent(payload) || !hasResult;

  const voteStatus = resolveAgentVoteStatus({
    nonVoting,
    rawStatus,
    backendVoteMatchesFinal,
    fallbackMatchesFinal,
  });

  return {
    isError: isErr,
    isDisabled,
    isNonVoting: nonVoting,
    hasResult,
    hasEvidence,
    agentKey,
    countedByBackend: Boolean(backendValidVote),
    voteStatus,
    denom: formatDenomination(denom),
    country: formatCountry(getAgentCountry(payload)),
    currency: formatCurrency(displayCurrency),
    reasoning: stripMarkdownSymbols(getAgentReasoning(payload)),
    confidence: formatConfidence(payload?.confidence || payload?.do_tin_cay),
    payload: payload
  };
};

const normalizeLensSources = (payload) => {
  if (!payload) return [];
  const candidates = [
    payload.lens, payload.google_lens, payload.visual_search,
    payload.visual_search_results, payload.search_results,
    payload.visual_matches, payload.sources, payload.links,
    payload.evidence, payload.articles, payload.agent_3, payload.agent3
  ];

  let sourceItems = [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      sourceItems = c;
      break;
    }
    if (c && typeof c === 'object' && Array.isArray(c.visual_matches)) {
      sourceItems = c.visual_matches;
      break;
    }
    if (c && typeof c === 'object' && Array.isArray(c.sources)) {
      sourceItems = c.sources;
      break;
    }
  }

  const normalized = sourceItems
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const url = item.url || item.link || item.href || "";
      let domain = item.domain || item.source || "";
      if (!domain && url) {
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = "";
        }
      }

      return {
        title: safeText(item.title || item.name || item.text, domain || "Source"),
        snippet: item.snippet || item.description || item.matchedText || item.matched_text || "",
        url,
        domain,
        thumbnail: item.thumbnail || item.thumbnail_url || item.image || item.image_url || "",
        confidence: firstDefined(item.confidence, item.score),
      };
    });

  return normalized.filter(
    (item, index, items) =>
      index === items.findIndex(
        (candidate) =>
          `${candidate.url}|${candidate.title}` === `${item.url}|${item.title}`,
      ),
  );
};

const normalizeCropEvidence = (payload) => {
  if (!payload) return null;
  const checker =
    payload.crop_checker ||
    payload.cropChecker ||
    payload.crop_validation ||
    payload.cropValidation ||
    payload;
  const rejectedBoxes =
    payload.rejected_boxes ||
    payload.rejectedBoxes ||
    checker.rejected_boxes ||
    checker.rejectedBoxes ||
    [];
  const trace =
    payload.box_selection_trace ||
    payload.boxSelectionTrace ||
    checker.box_selection_trace ||
    checker.trace ||
    null;
  const metrics = checker.metrics || checker.technical_metrics || null;
  const action = checker.action || checker.decision || "UNKNOWN";

  if (
    action === "UNKNOWN" &&
    !payload.selected_box_reason &&
    !checker.reason &&
    !metrics &&
    !trace &&
    rejectedBoxes.length === 0
  ) {
    return null;
  }

  return {
    action,
    selectedReason:
      payload.selected_box_reason ||
      payload.selectedBoxReason ||
      checker.selected_box_reason ||
      "",
    reason: checker.reason || checker.message || "",
    rejectedBoxes: Array.isArray(rejectedBoxes) ? rejectedBoxes : [],
    trace,
    confidence: firstDefined(
      checker.confidence,
      payload.crop_confidence,
      payload.confidence,
    ),
    metrics: metrics && typeof metrics === "object" ? metrics : null,
  };
};

const normalizeConsensusTrace = (...payloads) => {
  for (const payload of payloads) {
    if (!payload) continue;
    if (Array.isArray(payload)) return payload;
    const trace =
      payload.consensus_trace ||
      payload.retry_timeline ||
      payload.timeline;
    if (Array.isArray(trace) && trace.length > 0) return trace;
  }
  return [];
};

const getLensEvidenceState = (payload, sources, lang) => {
  const status = String(payload?.status || "").toLowerCase();
  const technicalError =
    payload?.technical_error === true ||
    payload?.error_type === "technical_error" ||
    isTechnicalError(payload);

  if (status === "disabled") {
    return {
      tone: "muted",
      message:
        lang === "VI"
          ? "Google Lens đang bị tắt trong cấu hình hệ thống."
          : "Google Lens is disabled in the system configuration.",
    };
  }

  if (technicalError) {
    return {
      tone: "error",
      message:
        lang === "VI"
          ? "Google Lens gặp lỗi kỹ thuật nên không có nguồn bài viết và không được tính vào đồng thuận."
          : "Google Lens failed due to a technical error, so no sources are available and its vote was not counted.",
    };
  }

  if (sources.length > 0) return { tone: "success", message: "" };

  const denomination = getAgentDenomination(payload);
  const hasMatchedResult =
    status === "completed" ||
    status === "partial" ||
    (denomination && denomination !== "N/A" && !denomination.toLowerCase().includes("không"));

  return {
    tone: hasMatchedResult ? "warning" : "muted",
    message: hasMatchedResult
      ? lang === "VI"
        ? "Google Lens đã trả kết quả đối chiếu, nhưng danh sách nguồn/bài viết không có trong payload này."
        : "Google Lens returned a matched result, but source articles were not included in this payload."
      : lang === "VI"
        ? "Google Lens không tìm thấy nguồn đối chiếu phù hợp."
        : "Google Lens did not return matching source articles.",
  };
};

const getBackendVndValue = (conversionResult) => {
  if (!conversionResult || typeof conversionResult !== "object") return null;
  const target = String(
    conversionResult.to_currency ||
    conversionResult.target_currency ||
    conversionResult.currency ||
    "",
  ).toUpperCase();
  const value = firstDefined(
    conversionResult.vnd_value,
    conversionResult.amount_vnd,
    conversionResult.converted_amount,
    conversionResult.converted_value,
    conversionResult.result,
  );
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return null;
  if (target && target !== "VND" && conversionResult.vnd_value == null && conversionResult.amount_vnd == null) {
    return null;
  }
  return numberValue;
};

const isCurrencyRatesStale = (ratesData) => {
  const source = String(ratesData?.source || "").toLowerCase();
  const provider = String(ratesData?.provider || "").toLowerCase();
  return Boolean(ratesData?.is_stale ?? ratesData?.isStale) ||
    source.includes("seed") ||
    provider.includes("seed");
};

const getRateTimestamp = (payload) =>
  payload?.last_updated || payload?.lastUpdated || null;

const formatRateTimestamp = (value, lang) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

const formatTimelinePattern = (pattern, lang) => {
  const normalized = String(pattern || "").toLowerCase();
  const labels = {
    "3/3": lang === "VI" ? "Cả 3 AI đồng thuận" : "All 3 AI agents agreed",
    "2/3": lang === "VI" ? "Đạt đồng thuận 2/3" : "Reached 2/3 consensus",
    "1-valid-only": lang === "VI" ? "Chỉ có 1 kết quả hợp lệ" : "Only one valid result",
    transient_error: lang === "VI" ? "Lỗi dịch vụ tạm thời" : "Temporary service error",
    zero_evidence: lang === "VI" ? "Không có bằng chứng hợp lệ" : "No valid evidence",
    not_banknote_or_unclear: lang === "VI" ? "Ảnh chưa rõ hoặc không phải tiền giấy" : "Unclear image or not a banknote",
    conflict: lang === "VI" ? "Các AI đưa ra kết quả khác nhau" : "AI agents disagreed",
    "1-1-1": lang === "VI" ? "Ba kết quả khác nhau" : "Three different results",
  };
  return labels[normalized] || pattern || (lang === "VI" ? "Đang tổng hợp" : "Aggregating");
};

const getCropImageUrl = (object) => {
  if (!object) return null;
  return (
    object.crop_image_url ||
    object.cropped_image_url ||
    object.selected_crop_url ||
    null
  );
};
// --- END PHASE 1 ---

const normalizeBackendResult = (rawResult, session) => {
  if (!rawResult) return null;

  if (rawResult.data || rawResult.agents || rawResult.consensus) {
    const formattedFinal =
      rawResult.final_result ||
      rawResult.result?.final_result ||
      {};
    const formattedObjects =
      rawResult.detected_objects ||
      formattedFinal.detected_objects ||
      rawResult.result?.detected_objects ||
      [];
    const formattedConfidence = firstDefined(
      rawResult.data?.confidence,
      rawResult.confidence,
      formattedFinal.confidence,
      formattedFinal.do_tin_cay,
    );

    return {
      ...rawResult,
      data: {
        ...(rawResult.data || {}),
        confidence: formattedConfidence,
      },
      detected_objects: formattedObjects,
      rejected_objects:
        rawResult.rejected_objects ||
        rawResult.result?.rejected_objects ||
        rawResult.raw_backend?.rejected_objects ||
        [],
      detected_count:
        rawResult.detected_count ??
        rawResult.result?.detected_count ??
        formattedObjects.length,
      multi_object:
        rawResult.multi_object === true ||
        formattedFinal.mode === "multi_object" ||
        formattedObjects.length > 1,
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

  const hasDetectedObjects =
    Array.isArray(detectedObjects) &&
    detectedObjects.length > 0;

  if (hasDetectedObjects) {
    const firstObject = detectedObjects[0] || {};
    const firstFinal = firstObject.final_result || {};
    const firstSummary = firstObject.summary || {};
    const isActuallyMulti =
      final.mode === "multi_object" ||
      detectedObjects.length > 1;
    const firstConfidence = firstDefined(
      firstFinal.confidence,
      firstFinal.do_tin_cay,
      firstSummary.confidence,
      rawResult.confidence,
    );

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
        : firstFinal.ma_tien_te ||
          firstFinal.currency ||
          firstFinal.currency_code ||
          firstSummary.currency ||
          inferCurrencyFromDenomination(denomination, null) ||
          "Không xác định";

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
        confidence: detectedObjects.length > 1 ? null : firstConfidence,
        description:
          final.quan_diem_trong_tai ||
          (detectedObjects.length === 1
            ? "Detected 1 banknote."
            : `Detected ${detectedObjects.length} banknotes.`),
        estimated_usd: "N/A",
      },
      agents: {
        ml_dl: firstObject.agent_results?.find((item) =>
          ["openai", "agent_1", "gpt"].some((name) =>
            String(item?.agent || "").toLowerCase().includes(name),
          ),
        )?.data,
        llm_api: firstObject.agent_results?.find((item) =>
          String(item?.agent || "").toLowerCase().includes("llm"),
        )?.data,
        visual_search: firstObject.agent_results?.find((item) =>
          String(item?.agent || "").toLowerCase().includes("lens"),
        )?.data,
      },
      consensus: {
        method: final.method || (isActuallyMulti ? "multi_object_pipeline" : "majority_vote"),
        matched_agents: Number(final.matched_agents || 0),
        status: final.status || "Completed",
        partial: Boolean(final.partial),
        completed_objects: final.completed_objects ?? null,
        needs_better_image_objects: final.needs_better_image_objects ?? null,
        total_objects: final.total_objects ?? detectedObjects.length,
        object_status_summary: final.object_status_summary ?? null,
        warning: final.warning || null,
        consensus_pattern: final.consensus_pattern || null,
        consensus_reason: final.consensus_reason || null,
        referee_view:
          final.quan_diem_trong_tai ||
          (isActuallyMulti
            ? `Detected ${detectedObjects.length} banknotes. Each object was analyzed separately.`
            : "Detected 1 banknote and analyzed it with the available AI agents."),
        valid_votes: final.valid_votes || [],
        suggested_result_from_valid_agent:
          final.suggested_result_from_valid_agent || null,
        debate_log:
          final.debate_log ||
          final.quan_diem_trong_tai ||
          buildMultiObjectDebateLog(detectedObjects, "EN"),
      },
      multi_object: isActuallyMulti,
      detected_objects: detectedObjects,
      rejected_objects:
        rawResult.rejected_objects ||
        rawResult.result?.rejected_objects ||
        rawResult.raw_backend?.rejected_objects ||
        [],
      detected_count:
        rawResult.detected_count ??
        rawResult.result?.detected_count ??
        detectedObjects.length,
      confidence: detectedObjects.length > 1 ? null : firstConfidence,
      crop_checker: firstObject.crop_checker || rawResult.crop_checker,
      selected_box_reason:
        firstObject.selected_box_reason || rawResult.selected_box_reason,
      box_selection_trace:
        firstObject.box_selection_trace || rawResult.box_selection_trace,
      rejected_boxes:
        firstObject.rejected_boxes || rawResult.rejected_boxes || [],
      consensus_trace:
        firstObject.consensus_trace || rawResult.consensus_trace || [],
      conversion_result:
        rawResult.conversion_result || rawResult.result?.conversion_result || null,
      processing_time_ms:
        rawResult.processing_time_ms ?? rawResult.result?.processing_time_ms,
      error_message:
        rawResult.error_message || rawResult.result?.error_message || null,
      created_at:
        rawResult.created_at || rawResult.result?.created_at || null,
      updated_at:
        rawResult.updated_at || rawResult.result?.updated_at || null,
      token_usage: rawResult.token_usage || rawResult.result?.token_usage || {},
      system_tokens_charged:
        firstDefined(
          rawResult.system_tokens_charged,
          rawResult.result?.system_tokens_charged,
        ),
      input_tokens: firstDefined(
        rawResult.input_tokens,
        rawResult.result?.input_tokens,
      ),
      output_tokens:
        firstDefined(
          rawResult.output_tokens,
          rawResult.result?.output_tokens,
        ),
      total_ai_tokens:
        firstDefined(
          rawResult.total_ai_tokens,
          rawResult.result?.total_ai_tokens,
        ),
      billable_ai_tokens:
        firstDefined(
          rawResult.billable_ai_tokens,
          rawResult.result?.billable_ai_tokens,
        ),
      billing_mode:
        firstDefined(
          rawResult.billing_mode,
          rawResult.result?.billing_mode,
        ),
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
    final.ma_tien_te ||
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
  const finalConfidence = firstDefined(
    final.confidence,
    final.do_tin_cay,
    rawResult.confidence,
    rawResult.result?.confidence,
  );

  const mlData = getAgentDataByName(agentResults, ["openai", "gpt", "agent_1"]);
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
      confidence: finalConfidence,
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
      consensus_pattern: final.consensus_pattern || null,
      consensus_reason: final.consensus_reason || null,
      referee_view:
        final.quan_diem_trong_tai ||
        final.referee_view ||
        final.reasoning ||
        description,
      valid_votes: final.valid_votes || [],
      suggested_result_from_valid_agent:
        final.suggested_result_from_valid_agent || null,
      debate_log:
        final.debate_log ||
        final.quan_diem_trong_tai ||
        final.referee_view ||
        description ||
        "No debate log available.",
    },
    multi_object: false,
    detected_objects: detectedObjects,
    rejected_objects:
      rawResult.rejected_objects ||
      rawResult.result?.rejected_objects ||
      rawResult.raw_backend?.rejected_objects ||
      [],
    detected_count:
      rawResult.detected_count ??
      rawResult.result?.detected_count ??
      detectedObjects.length,
    confidence: finalConfidence,
    crop_checker:
      rawResult.crop_checker || rawResult.result?.crop_checker || null,
    selected_box_reason:
      rawResult.selected_box_reason ||
      rawResult.result?.selected_box_reason ||
      null,
    box_selection_trace:
      rawResult.box_selection_trace ||
      rawResult.result?.box_selection_trace ||
      null,
    rejected_boxes:
      rawResult.rejected_boxes ||
      rawResult.result?.rejected_boxes ||
      [],
    consensus_trace:
      rawResult.consensus_trace ||
      rawResult.result?.consensus_trace ||
      [],
    conversion_result:
      rawResult.conversion_result || rawResult.result?.conversion_result || null,
    processing_time_ms:
      rawResult.processing_time_ms ?? rawResult.result?.processing_time_ms,
    error_message:
      rawResult.error_message || rawResult.result?.error_message || null,
    created_at:
      rawResult.created_at || rawResult.result?.created_at || null,
    updated_at:
      rawResult.updated_at || rawResult.result?.updated_at || null,
    token_usage: rawResult.token_usage || rawResult.result?.token_usage || {},
    system_tokens_charged:
      firstDefined(
        rawResult.system_tokens_charged,
        rawResult.result?.system_tokens_charged,
      ),
    input_tokens: firstDefined(
      rawResult.input_tokens,
      rawResult.result?.input_tokens,
    ),
    output_tokens:
      firstDefined(
        rawResult.output_tokens,
        rawResult.result?.output_tokens,
      ),
    total_ai_tokens:
      firstDefined(
        rawResult.total_ai_tokens,
        rawResult.result?.total_ai_tokens,
      ),
    billable_ai_tokens:
      firstDefined(
        rawResult.billable_ai_tokens,
        rawResult.result?.billable_ai_tokens,
      ),
    billing_mode:
      firstDefined(
        rawResult.billing_mode,
        rawResult.result?.billing_mode,
      ),
    balance_before:
      rawResult.balance_before ?? rawResult.result?.balance_before,
    balance_after: rawResult.balance_after ?? rawResult.result?.balance_after,
    raw_backend: rawResult,
  };
};

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    currentScanSession,
    activeTask,
    setScanSession,
    resetScanSession,
  } = useRecognitionStore();
  const { ratesData, fetchRates } = useCurrencyStore();
  const { lang } = useLanguageStore();

  const [showRawLog, setShowRawLog] = useState(false);
  const [currentRateOverrideKey, setCurrentRateOverrideKey] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [imagePreview, setImagePreview] = useState(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  const [restoredResult, setRestoredResult] = useState(null);
  const hasRestoredRef = useRef(false);
  const lastRestoreKeyRef = useRef(null);

  const handleScanAnother = () => {
    const nonce = String(Date.now());
    setImagePreview(null);
    resetScanSession(nonce);
    navigate("/recognize", {
      replace: true,
      state: { resetScan: true, nonce },
    });
  };

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
      exchangeDesc: "Currency conversion for the analyzed banknote value.",
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
      tokenUsageDesc: "App token charge and AI usage statistics for this recognition result.",
      tokensCharged: "App tokens charged",
      balanceBefore: "Balance before",
      balanceAfter: "Balance after",
      aiTokens: "Raw AI usage",
      billableTokens: "Billable AI usage",
      billingMode: "Billing mode",
      inputOutputTokens: "Input / Output",
      fixedBillingMode: "Fixed per scan",
      dynamicBillingMode: "Dynamic by AI usage",
      skippedBillingMode: "Skipped",
      fixedBillingDesc: "Fixed billing mode: this scan costs a fixed number of app tokens. AI token usage is shown for internal cost tracking only.",
      dynamicBillingDesc: "Dynamic billing mode: app tokens are calculated from billable AI token usage.",
      skippedBillingDesc: "No app tokens charged for this result.",
      billableUsageDesc: "Raw AI tokens plus 10% overhead.",
      lblConfidence: "Confidence",
      lblProvider: "Provider",
      lblFormatter: "Formatter",
      lblVisualSearch: "Google Lens",
      lensEvidence: "Google Lens Evidence",
      lblCropEvidence: "Crop Evidence",
      agentVotes: "AI Agent Votes",
      vndEquivalent: "VND Equivalent",
      originalImage: "Original image",
      cropPreview: "Selected crop",
      cropUnavailable: "No crop preview available",
      resultOverview: "Recognition overview",
      conversionTitle: "Vietnamese Dong equivalent",
      originalValue: "Original value",
      approximateValue: "Approximate value",
      rateAvailable: "Conversion rate available",
      rateUnavailable: "VND conversion rate is currently unavailable",
      openConverter: "Open converter",
      rateAtRecognition: "Rate at recognition time",
      currentCachedRate: "Current cached rate",
      staleRate: "Stale rate",
      rateUpdated: "Updated",
      recalculateCurrentRate: "Recalculate using current rate",
      showingCurrentRate: "Showing current cached rate",
      viewImage: "View image",
      technicalDetails: "Technical details",
      analysisEvidence: "Analysis evidence",
      lblAggregator: "Referee",
      techError: "Technical error / Not counted",
      advDebug: "Advanced Debug",
      whyChosen: "Why did the system choose this result?",
      consensusTimeline: "Consensus Timeline",
      consensusMajority: "Majority consensus",
      consensusMajorityDetail: "Majority consensus reached at 2/3. One agent returned a different result.",
      consensusFullDetail: "Strong consensus reached: all 3 agents matched.",
      showMore: "Show more",
      showFewer: "Show fewer",
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
      exchangeDesc: "Giá trị quy đổi dựa trên mệnh giá vừa quét.",
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
      tokenUsageTitle: "Mức sử dụng token",
      tokenUsageDesc: "Token app đã trừ và thống kê mức sử dụng AI của lần nhận diện này.",
      tokensCharged: "Token app đã trừ",
      balanceBefore: "Số dư trước",
      balanceAfter: "Số dư sau",
      aiTokens: "Mức sử dụng AI gốc",
      billableTokens: "Mức sử dụng AI sau overhead",
      billingMode: "Chế độ tính phí",
      inputOutputTokens: "Đầu vào / Đầu ra",
      fixedBillingMode: "Cố định theo lượt quét",
      dynamicBillingMode: "Động theo mức sử dụng AI",
      skippedBillingMode: "Không tính phí",
      fixedBillingDesc: "Chế độ tính phí cố định: lượt nhận diện này trừ số token app cố định. AI tokens chỉ dùng để theo dõi chi phí hệ thống.",
      dynamicBillingDesc: "Chế độ tính phí động: token app được tính từ mức sử dụng AI sau overhead.",
      skippedBillingDesc: "Kết quả này không bị trừ token app.",
      billableUsageDesc: "AI tokens gốc cộng thêm 10% overhead.",
      lblConfidence: "Độ tin cậy",
      lblProvider: "Provider",
      lblFormatter: "Formatter",
      lblVisualSearch: "Google Lens",
      lensEvidence: "Bằng chứng Google Lens",
      lblCropEvidence: "Kiểm tra vùng ảnh",
      agentVotes: "Phiếu phân tích của AI",
      vndEquivalent: "Quy đổi sang VND",
      originalImage: "Ảnh gốc",
      cropPreview: "Vùng ảnh đã chọn",
      cropUnavailable: "Chưa có ảnh crop để xem",
      resultOverview: "Tổng quan nhận diện",
      conversionTitle: "Quy đổi sang Việt Nam Đồng",
      originalValue: "Giá trị gốc",
      approximateValue: "Giá trị xấp xỉ",
      rateAvailable: "Đã có tỷ giá quy đổi",
      rateUnavailable: "Hiện chưa có tỷ giá quy đổi sang VND",
      openConverter: "Mở công cụ quy đổi",
      rateAtRecognition: "Tỷ giá tại thời điểm nhận diện",
      currentCachedRate: "Tỷ giá cache hiện tại",
      staleRate: "Tỷ giá cũ",
      rateUpdated: "Cập nhật",
      recalculateCurrentRate: "Tính lại bằng tỷ giá hiện tại",
      showingCurrentRate: "Đang hiển thị tỷ giá cache hiện tại",
      viewImage: "Xem ảnh",
      technicalDetails: "Chi tiết kỹ thuật",
      analysisEvidence: "Bằng chứng phân tích",
      lblAggregator: "Trọng tài tổng hợp",
      techError: "Lỗi kỹ thuật / Không tính",
      advDebug: "Gỡ lỗi chuyên sâu",
      whyChosen: "Vì sao hệ thống chọn kết quả này?",
      consensusTimeline: "Tiến trình đồng thuận",
      consensusMajority: "Đồng thuận đa số",
      consensusMajorityDetail: "Đạt đồng thuận đa số 2/3. Có 1 Agent khác kết quả.",
      consensusFullDetail: "Đồng thuận cao 3/3. Cả 3 Agent cùng kết quả.",
      showMore: "Xem thêm",
      showFewer: "Thu gọn",
    },
  };

  const t = dict[lang || "EN"];

  useEffect(() => {
    if (!ratesData) {
      fetchRates().catch(() => {});
    }
  }, [ratesData, fetchRates]);

  const searchParams = new URLSearchParams(location.search);
  const queryTaskId = searchParams.get("taskId") || searchParams.get("task_id");
  const queryResultId = searchParams.get("resultId") || searchParams.get("result_id");

  const rawFromRoute =
    restoredResult ||
    location.state?.scanResult ||
    location.state?.result ||
    location.state?.scanSession?.result ||
    null;

  const sessionFromRoute = location.state?.scanSession || null;
  const session = sessionFromRoute || currentScanSession || null;
  const rawResult = rawFromRoute || session?.result || null;
  const targetTaskId = location.state?.taskId || session?.taskId || queryTaskId || activeTask?.taskId;
  const targetResultId =
    location.state?.resultId ||
    session?.result?.id ||
    session?.result?._id ||
    session?.result?.result_id ||
    queryResultId;
  const restoreKey = buildRecognitionRestoreKey(targetTaskId, targetResultId);

  useEffect(() => {
    const shouldRestore = shouldRefetchRecognitionResult({
      rawResult,
      taskId: targetTaskId,
      resultId: targetResultId,
      isRestoring,
      restoreError,
      hasRestored: hasRestoredRef.current,
      lastRestoreKey: lastRestoreKeyRef.current,
    });
    if (!shouldRestore) return;

    const restoreData = async () => {
      if (!targetTaskId && !targetResultId) {
        if (!rawResult) {
          hasRestoredRef.current = true;
          lastRestoreKeyRef.current = null;
        }
        return;
      }

      hasRestoredRef.current = true;
      lastRestoreKeyRef.current = restoreKey;
      setIsRestoring(true);
      setRestoreError(null);

      try {
        let fetchedData = null;
        let resolvedTaskId = targetTaskId;

        if (targetTaskId) {
          try {
            const res = await getRecognitionTaskStatus(targetTaskId);
            fetchedData = res?.data ?? res;

            const status = String(fetchedData?.status || "").toLowerCase();
            const TERMINAL = new Set(["done", "completed", "complete", "success", "succeeded", "needs_review", "needs review", "completed_partial", "completed_with_limit", "no_banknote_detected", "needs_better_image", "failed", "failure", "error", "cancelled", "canceled", "timeout", "agent_error", "technical_error"]);

            if (!TERMINAL.has(status) && status !== "not_found" && status !== "stale") {
               navigate(`/processing?taskId=${targetTaskId}`, { replace: true });
               return;
            }
          } catch (e) {
            console.warn("Restore by taskId failed", e);
          }
        }

        if (!fetchedData && targetResultId) {
          try {
            const res = await getRecognitionResult(targetResultId);
            fetchedData = res?.data ?? res;
            resolvedTaskId = fetchedData?.task_id || targetResultId;
          } catch (e) {
            console.warn("Restore by resultId failed", e);
          }
        }

        if (fetchedData) {
          const payload = {
             ...fetchedData,
             input_image_url: fetchedData.input_image_url || fetchedData.image_url || fetchedData.uploaded_image_url || null,
          };
          setRestoredResult(payload);
          setScanSession(payload.input_image_url, payload, resolvedTaskId);
        } else {
          setRestoreError("not_found");
        }
      } catch {
        setRestoreError("error");
      } finally {
        setIsRestoring(false);
      }
    };

    restoreData();
  }, [rawResult, targetTaskId, targetResultId, restoreKey, navigate, setScanSession, isRestoring, restoreError]);

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
  const detectedObjects = Array.isArray(currentItem?.detected_objects)
    ? currentItem.detected_objects
    : [];
  const primaryObject = detectedObjects[0] || null;
  const rejectedObjects = Array.isArray(currentItem?.rejected_objects)
    ? currentItem.rejected_objects
    : [];
  const fallbackAgentResults =
    currentItem?.raw_backend?.agent_results ||
    currentItem?.raw_backend?.result?.agent_results ||
    [];
  const singleAgentResults =
    primaryObject?.agent_results ||
    fallbackAgentResults;

  const limitInfo = currentItem?.raw_backend?.final_result?.limit_info || currentItem?.limit_info;
  const skippedCount = Number(limitInfo?.skipped_count || 0);
  const overflowObjects = currentItem?.raw_backend?.final_result?.overflow_objects || currentItem?.overflow_objects || [];

  const isMulti = currentItem?.multi_object === true && detectedObjects.length > 1;

  const finalDenomination = isMulti 
    ? (lang === "VI" ? `Đã phát hiện ${currentItem.detected_objects.length} tờ tiền` : `Detected ${currentItem.detected_objects.length} banknotes`)
    : formatDenomination(finalData.denomination);

  const finalCountry = isMulti ? "Multiple" : formatCountry(finalData.country);
  const finalCurrency = isMulti ? "Multiple" : formatCurrency(finalData.currency);
  const finalMaterial = isMulti ? "Multiple" : safeText(finalData.material, "Không xác định");
  const finalOrigin = finalCountry;
  const finalConfidence = formatConfidence(
    firstDefined(finalData.confidence, currentItem?.confidence),
  );
  const resultNotice = getResultNotice(
    currentItem?.status,
    currentItem?.error_message,
    consensus,
    lang,
  );

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
  const primaryCropImage = getCropImageUrl(primaryObject);
  const primaryCropPreview = getCropPreviewSource(primaryObject, previewImage);

  const matchedAgents = Number(consensus?.matched_agents || 0);
  const consensusSummary =
    matchedAgents >= 3
      ? t.consensusFullDetail
      : matchedAgents === 2
        ? t.consensusMajorityDetail
        : stripMarkdownSymbols(
            consensus?.referee_view ||
              consensus?.quan_diem_trong_tai ||
              (lang === "VI"
                ? "Kết luận dựa trên các phiếu hợp lệ hiện có."
                : "The conclusion is based on the currently valid votes."),
          );

  const consensusText =
    consensus?.referee_view ||
    consensus?.quan_diem_trong_tai ||
    (matchedAgents
      ? `Majority vote selected ${finalDenomination} with ${matchedAgents}/3 agents matched.`
      : "No conclusion provided.");

  const safeDebateLog = currentItem?.multi_object
    ? buildMultiObjectDebateLog(currentItem.detected_objects, lang || "EN")
    : stripMarkdownSymbols(consensus?.debate_log || "No debate log available.");

  const currentRateResultKey = [
    activeTab,
    currentItem?.id || "",
    currentItem?.task_id || "",
    currentItem?.result_id || "",
    finalCurrency,
    finalDenomination,
  ].join("|");
  const useCurrentRateForResult = currentRateOverrideKey === currentRateResultKey;

  const exchangeResults = useMemo(() => {
    const rates = ratesData?.rates || {};
    const amountNumber = parseAmountFromDenomination(finalDenomination);
    const backendVndValue = getBackendVndValue(currentItem?.conversion_result);
    const rateIsStale = isCurrencyRatesStale(ratesData);

    if (amountNumber <= 0 || !finalCurrency || finalCurrency === "N/A") {
      return null;
    }

    if (backendVndValue !== null && !useCurrentRateForResult) {
      return [
        {
          code: "VND",
          name: lang === "VI" ? "Tỷ giá tại thời điểm nhận diện" : "Rate at recognition time",
          value: backendVndValue,
          rateType: "snapshot",
          provider: currentItem?.conversion_result?.provider,
          source: currentItem?.conversion_result?.source,
          lastUpdated: getRateTimestamp(currentItem?.conversion_result),
        },
      ];
    }

    const normalizedCurrency = String(finalCurrency).toUpperCase();

    if (normalizedCurrency === "VND") {
      return [
        {
          code: "VND",
          name: lang === "VI" ? "Giá trị nhận diện" : "Recognized value",
          value: amountNumber,
          rateType: "native",
        },
      ];
    }

    const rateToVnd = Number(rates[normalizedCurrency] || 0);

    if (rateToVnd <= 0) {
      return [
        {
          code: "VND",
          name: lang === "VI" ? "Chưa có tỷ giá quy đổi" : "Conversion rate unavailable",
          value: null,
          rateType: "unavailable",
        },
      ];
    }

    return [
      {
        code: "VND",
        name: rateIsStale
          ? (lang === "VI" ? "Tỷ giá cũ" : "Stale rate")
          : (lang === "VI" ? "Tỷ giá cache hiện tại" : "Current cached rate"),
        value: amountNumber * rateToVnd,
        rateType: rateIsStale ? "stale" : "current",
        provider: ratesData?.provider,
        source: ratesData?.source,
        lastUpdated: getRateTimestamp(ratesData),
      },
    ];
  }, [currentItem?.conversion_result, finalDenomination, finalCurrency, lang, ratesData, useCurrentRateForResult]);
  const originalAmount = parseAmountFromDenomination(finalDenomination);
  const originalValueText = originalAmount
    ? `${originalAmount.toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} ${finalCurrency}`
    : finalDenomination;
  const vndExchangeItem =
    exchangeResults?.find((item) => item.code === "VND") || null;
  const vndValueText =
    vndExchangeItem?.value === null || vndExchangeItem?.value === undefined
      ? "—"
      : `${new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US", {
          maximumFractionDigits: 0,
        }).format(vndExchangeItem.value)} VND`;
  const hasVndRate =
    Boolean(vndExchangeItem) &&
    vndExchangeItem.value !== null &&
    vndExchangeItem.value !== undefined;
  const normalizedFinalCurrency = String(finalCurrency || "").toUpperCase();
  const currentRateToVnd = Number(ratesData?.rates?.[normalizedFinalCurrency] || 0);
  const canRecalculateWithCurrentRate =
    getBackendVndValue(currentItem?.conversion_result) !== null &&
    originalAmount > 0 &&
    normalizedFinalCurrency &&
    normalizedFinalCurrency !== "VND" &&
    currentRateToVnd > 0;
  const rateTimestampText = formatRateTimestamp(vndExchangeItem?.lastUpdated, lang);
  const rateMetaText = [
    vndExchangeItem?.name,
    vndExchangeItem?.provider ? `${t.lblProvider}: ${vndExchangeItem.provider}` : "",
    rateTimestampText ? `${t.rateUpdated}: ${rateTimestampText}` : "",
  ].filter(Boolean).join(" · ");

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

  if (isRestoring) {
    return (
      <div className="max-w-3xl mx-auto font-sans py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-sm flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 mb-4">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <p className="font-bold text-slate-500 dark:text-slate-400">
            {lang === "VI" ? "Đang khôi phục kết quả..." : "Restoring result..."}
          </p>
        </div>
      </div>
    );
  }

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
            onClick={handleScanAnother}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition shadow-md shadow-indigo-500/20"
          >
            {t.backWorkspace}
          </button>
        </div>
      </div>
    );
  }

  if (isNoBanknoteResult(currentItem)) {
    return <NoBanknoteResult item={currentItem} t={t} lang={lang} onScanAnother={handleScanAnother} previewImage={previewImage} rejectedObjects={rejectedObjects} />;
  }

  if (isInvalidConclusionResult(currentItem)) {
    return (
      <InvalidConclusionResult
        currentItem={currentItem}
        previewImage={previewImage}
        t={t}
        lang={lang}
        onScanAnother={handleScanAnother}
        showRawLog={showRawLog}
        setShowRawLog={setShowRawLog}
        handleCopyJSON={handleCopyJSON}
        handleDownloadJSON={handleDownloadJSON}
      />
    );
  }

  return (
    <div className="page-inner py-6">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-12 font-sans sm:px-6">
        {resultsArray.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {resultsArray.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  activeTab === index
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {lang === "VI" ? `Kết quả ${index + 1}` : `Result ${index + 1}`}
              </button>
            ))}
          </div>
        )}

        {limitInfo && skippedCount > 0 && overflowObjects.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-500/10 mb-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  {lang === "VI"
                    ? `Đã phát hiện ${limitInfo.detected_count} tờ tiền`
                    : `Detected ${limitInfo.detected_count} banknotes`}
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  {lang === "VI"
                    ? `Hệ thống chỉ xử lý ${limitInfo.processed_count} tờ có độ tin cậy cao nhất, ${skippedCount} tờ còn lại chưa được xử lý do giới hạn lượt nhận diện.`
                    : `The system processed the ${limitInfo.processed_count} most confident ones and skipped ${skippedCount} due to the task limit.`}
                </p>
              </div>
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/70 to-cyan-50 text-slate-950 shadow-xl shadow-indigo-500/10 dark:border-slate-700 dark:from-slate-950 dark:via-indigo-950/70 dark:to-slate-900 dark:text-white dark:shadow-slate-950/30">
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/10 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  <span className="font-mono">{(currentItem?.id || "").slice(-8) || "—"}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatResultDate(
                    currentItem?.created_at || currentItem?.raw_backend?.created_at,
                    lang,
                  )}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/feedback", { state: { scanResult: currentItem } })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t.feedback}
                </button>
                <button
                  onClick={() => navigate("/history")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <History className="h-4 w-4" />
                  {t.viewHistory}
                </button>
                <button
                  onClick={handleScanAnother}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-black text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t.scanAnother}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${getConsensusBadgeClass(consensus)}`}>
                  {normalizeStatusLabel(currentItem?.status, lang)}
                </span>
                <span className="rounded-full border border-indigo-200 bg-indigo-100/80 px-3 py-1 text-xs font-bold text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200">
                  {isMulti
                    ? lang === "VI"
                      ? `${detectedObjects.length} tờ tiền`
                      : `${detectedObjects.length} banknotes`
                    : `${matchedAgents}/3 ${t.agents}`}
                </span>
              </div>
              <p className="text-sm font-bold text-indigo-600 dark:text-cyan-300">{t.finalDecision}</p>
              <h1 className="mt-2 break-words text-4xl font-black leading-none text-slate-950 dark:text-white sm:text-5xl">
                {finalDenomination}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                {consensusSummary}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[520px]">
              <HeroMetric label={t.lblDenomination} value={finalDenomination} accent />
              <HeroMetric label={t.lblCountry} value={finalCountry} />
              <HeroMetric label={t.lblCurrency} value={finalCurrency} />
              <HeroMetric label={t.lblMaterial} value={finalMaterial} />
              <HeroMetric label={t.lblConfidence} value={finalConfidence} accent />
              <HeroMetric
                label={t.lblConsensus}
                value={isMulti ? getConsensusStatusLabel(consensus, lang) : `${matchedAgents}/3`}
                accent
              />
            </div>
          </div>
        </section>

        {resultNotice && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              resultNotice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            }`}
          >
            {resultNotice.tone === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-black">{resultNotice.title}</p>
              <p className="mt-1 text-sm leading-6 opacity-85">{resultNotice.message}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">{t.originalImage}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.uploadTitle}</p>
              </div>
              <ImageIcon className="h-5 w-5 text-slate-400" />
            </div>

            <div className="space-y-4 p-4">
              <ImagePreviewButton
                src={previewImage}
                alt={t.originalImage}
                emptyText={lang === "VI" ? "Không có ảnh gốc" : "Original image unavailable"}
                onPreview={() => previewImage && setImagePreview({ src: previewImage, alt: t.originalImage })}
                label={t.viewImage}
                heightClass="h-[300px] sm:h-[380px]"
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">{t.cropPreview}</p>
                  {primaryObject?.crop_source && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {primaryObject.crop_source}
                    </span>
                  )}
                </div>
                <CropPreviewButton
                  preview={primaryCropPreview}
                  alt={t.cropPreview}
                  emptyText={
                    primaryObject?.bbox
                      ? t.cropUnavailable
                      : lang === "VI" ? "Không có vùng crop" : "No crop region"
                  }
                  onPreview={() => primaryCropPreview && setImagePreview({ cropPreview: primaryCropPreview, alt: t.cropPreview })}
                  label={t.viewImage}
                  heightClass="h-36 sm:h-44"
                />
              </div>
            </div>
          </section>

          <div className="space-y-6 lg:col-span-7">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">{t.resultOverview}</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{finalDenomination}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {finalCountry} · {finalCurrency}
                  </p>
                </div>
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-left dark:border-cyan-500/30 dark:bg-cyan-500/10 sm:text-right">
                  <p className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-300">{t.lblConfidence}</p>
                  <p className="mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">{finalConfidence}</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <OverviewMetric icon={<Globe />} label={t.lblCountry} value={finalCountry} />
                <OverviewMetric icon={<Coins />} label={t.lblCurrency} value={finalCurrency} />
                <OverviewMetric icon={<ShieldCheck />} label={t.lblMaterial} value={finalMaterial} />
                <OverviewMetric
                  icon={<Gauge />}
                  label={t.lblConsensus}
                  value={isMulti ? `${detectedObjects.length}` : `${matchedAgents}/3`}
                />
              </div>

              <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
                <p className="text-xs font-black uppercase text-slate-400">{t.referee}</p>
                <div className="prose prose-sm mt-2 max-w-none text-slate-600 dark:prose-invert dark:text-slate-300">
                  <ReactMarkdown>{stripMarkdownSymbols(consensusText)}</ReactMarkdown>
                </div>
              </div>
            </section>

            {isValidRecognizedMoneyResult(currentItem) && !isMulti && (
              <section className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <div className="flex flex-col gap-5 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-300">{t.conversionTitle}</p>
                      <p className="mt-1 text-sm text-emerald-800/75 dark:text-emerald-100/70">{t.exchangeDesc}</p>
                    </div>
                    <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-200 bg-white/75 p-4 dark:border-emerald-500/20 dark:bg-slate-950/30">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{t.originalValue}</p>
                      <p className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">{originalValueText}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-300 bg-white p-4 dark:border-emerald-400/30 dark:bg-slate-950/50">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{t.approximateValue}</p>
                      <p className="mt-1 break-words text-2xl font-black text-emerald-800 dark:text-emerald-200">{vndValueText}</p>
                      {rateMetaText && (
                        <p className="mt-2 text-xs font-semibold text-emerald-700/80 dark:text-emerald-100/70">
                          {rateMetaText}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className={`text-xs font-semibold ${hasVndRate ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {hasVndRate ? t.rateAvailable : t.rateUnavailable}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {canRecalculateWithCurrentRate && (
                        <button
                          type="button"
                          onClick={() => setCurrentRateOverrideKey(currentRateResultKey)}
                          disabled={useCurrentRateForResult}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-default disabled:opacity-70 dark:border-emerald-400/30 dark:text-emerald-100 dark:hover:bg-emerald-400/10"
                        >
                          {useCurrentRateForResult ? t.showingCurrentRate : t.recalculateCurrentRate}
                        </button>
                      )}
                      <Link
                        to="/exchange"
                        className="inline-flex items-center gap-1.5 text-sm font-black text-emerald-800 hover:underline dark:text-emerald-200"
                      >
                        {t.openConverter}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {isMulti ? (
          <MultiObjectResults currentItem={currentItem} t={t} lang={lang} ratesData={ratesData} />
        ) : (
          <PerObjectResult
            objectNo={1}
            finalDenomination={finalDenomination}
            country={finalCountry}
            currency={finalCurrency}
            material={finalMaterial}
            origin={finalOrigin}
            matchedAgents={matchedAgents}
            confidence={finalConfidence}
            status={normalizeStatusLabel(currentItem?.status, lang)}
            image={primaryCropImage || previewImage}
            cropPreview={primaryCropPreview}
            agentResults={singleAgentResults}
            consensusValidVotes={
              currentItem?.consensus?.valid_votes ||
              primaryObject?.final_result?.valid_votes ||
              []
            }
            refereeView={stripMarkdownSymbols(consensusText)}
            lensPayload={getAgentDataByName(singleAgentResults, ["lens", "visual", "agent_3"])}
            lensSources={normalizeLensSources(getAgentDataByName(singleAgentResults, ["lens", "visual", "agent_3"]))}
            cropEvidence={normalizeCropEvidence(primaryObject || currentItem)}
            consensusTrace={normalizeConsensusTrace(
              primaryObject,
              currentItem,
              currentItem?.raw_backend?.final_result,
            )}
            conversionResult={currentItem?.conversion_result}
            originalObjectData={primaryObject || currentItem}
            t={t}
            lang={lang}
            ratesData={ratesData}
            parseAmountFromDenomination={parseAmountFromDenomination}
            isSingleObject
          />
        )}

        <TokenUsageCard currentItem={currentItem} t={t} />

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setShowRawLog(!showRawLog)}
            className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 dark:text-white">{t.advDebug || "Advanced Debug"}</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {lang === "VI" ? "Nhật ký đồng thuận và JSON dành cho kiểm tra kỹ thuật" : "Consensus log and raw JSON for technical review"}
                </p>
              </div>
            </div>
            {showRawLog ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />}
          </button>

          {showRawLog && (
            <div className="space-y-5 border-t border-slate-200 p-5 dark:border-slate-800">
              {(currentItem?.final_result?.resize_debug || currentItem?.final_result?.models_used) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {currentItem?.final_result?.resize_debug && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <p className="mb-2 text-xs font-black uppercase text-slate-500">Resize Debug</p>
                      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-xs text-sky-700 dark:text-sky-300">
                        {JSON.stringify(currentItem.final_result.resize_debug, null, 2)}
                      </pre>
                    </div>
                  )}
                  {currentItem?.final_result?.models_used && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <p className="mb-2 text-xs font-black uppercase text-slate-500">Models Used</p>
                      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words text-xs text-fuchsia-700 dark:text-fuchsia-300">
                        {JSON.stringify(currentItem.final_result.models_used, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-500">{t.fullLogTitle}</p>
                <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-emerald-700 dark:border-slate-800 dark:bg-slate-950 dark:text-emerald-300">
                  <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-black uppercase text-slate-500">{t.jsonTitle}</p>
                  <div className="flex gap-2">
                    <button onClick={handleCopyJSON} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Copy className="h-3.5 w-3.5" />
                      {t.copy}
                    </button>
                    <button onClick={handleDownloadJSON} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500">
                      <Download className="h-3.5 w-3.5" />
                      {t.download}
                    </button>
                  </div>
                </div>
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-emerald-700 dark:border-slate-800 dark:bg-slate-950 dark:text-emerald-300">
                  {JSON.stringify(currentItem, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>

        {overflowObjects && overflowObjects.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/50 dark:bg-amber-500/10">
              <h2 className="text-xl font-black text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                {lang === "VI" ? "Tờ tiền vượt giới hạn chưa xử lý" : "Skipped banknotes (Limit exceeded)"}
              </h2>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {lang === "VI"
                  ? "Những vùng ảnh này nghi ngờ là tiền giấy nhưng đã bị bỏ qua để đảm bảo giới hạn token hệ thống. Bạn có thể cắt từng tờ và quét lại."
                  : "These regions are suspected to be banknotes but were skipped to respect system token limits. You can crop them and scan again."}
              </p>
            </div>
            <div className="space-y-4 p-5">
              {overflowObjects.map((obj, index) => {
                const checker = obj?.crop_checker || {};
                const bbox = Array.isArray(obj?.bbox) ? obj.bbox : null;

                return (
                  <article
                    key={`overflow-${index}`}
                    className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-black text-amber-900 dark:text-amber-200">
                        {lang === "VI" ? "Tờ tiền chưa xử lý" : "Skipped Banknote"} #{index + 1}
                      </p>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {lang === "VI" ? "Bỏ qua do giới hạn" : "Skipped by limit"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <InfoRow
                        label={lang === "VI" ? "Điểm giấy tờ" : "Document Score"}
                        value={checker?.document_score ? parseFloat(checker.document_score).toFixed(2) : "N/A"}
                      />
                      <InfoRow
                        label={lang === "VI" ? "Điểm tiền giấy" : "Banknote Score"}
                        value={checker?.banknote_score ? parseFloat(checker.banknote_score).toFixed(2) : "N/A"}
                      />
                      {bbox && (
                        <InfoRow
                          label="BBox"
                          value={`[${bbox.join(", ")}]`}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.continueTitle}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.continueDesc}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => navigate("/history")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4" />
              {t.btnViewHistory}
            </button>
            <button
              onClick={handleScanAnother}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500"
            >
              <RotateCcw className="h-4 w-4" />
              {t.btnScanAnother}
            </button>
          </div>
        </div>
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.alt}
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label={lang === "VI" ? "Đóng ảnh" : "Close image"}
          >
            <X className="h-5 w-5" />
          </button>
          {imagePreview.cropPreview ? (
            <div
              className="h-[80vh] max-h-[88vh] w-[94vw] max-w-5xl overflow-hidden rounded-lg bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <CropPreviewContent preview={imagePreview.cropPreview} alt={imagePreview.alt} />
            </div>
          ) : (
            <img
              src={imagePreview.src}
              alt={imagePreview.alt}
              className="max-h-[88vh] max-w-[94vw] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value, accent = false }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3.5 ${
      accent
        ? "border-indigo-200 bg-indigo-100/70 dark:border-cyan-400/20 dark:bg-cyan-400/10"
        : "border-slate-200 bg-white/75 dark:border-white/10 dark:bg-white/5"
    }`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1.5 break-words text-sm font-black ${
        accent
          ? "text-indigo-700 dark:text-cyan-200"
          : "text-slate-950 dark:text-white"
      }`}>
        {normalizeText(value)}
      </p>
    </div>
  );
}

function OverviewMetric({ icon, label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-center gap-2 text-slate-400">
        {React.cloneElement(icon, { className: "h-4 w-4" })}
        <p className="truncate text-[11px] font-bold uppercase">{label}</p>
      </div>
      <p className="mt-2 break-words text-sm font-black text-slate-900 dark:text-slate-100">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function ImagePreviewButton({
  src,
  alt,
  emptyText,
  onPreview,
  label,
  heightClass,
}) {
  if (!src) {
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40`}>
        <div>
          <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
          <p className="mt-2">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPreview}
      className={`group relative flex w-full ${heightClass} items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950`}
      aria-label={label}
    >
      <img src={src} alt={alt} className="h-full w-full object-contain" />
      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" />
        {label}
      </span>
    </button>
  );
}

function CropPreviewContent({ preview, alt = "Crop" }) {
  const [naturalSize, setNaturalSize] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  if (!preview || failed) return null;

  if (preview.kind === "image") {
    return <img src={preview.src} alt={alt} className="h-full w-full object-contain" />;
  }

  if (preview.kind !== "bbox" || !preview.imageUrl || !preview.bbox) return null;

  const { x1, y1, width, height } = preview.bbox;
  const naturalWidth = naturalSize?.width || 0;
  const naturalHeight = naturalSize?.height || 0;
  const canPosition = naturalWidth > 0 && naturalHeight > 0 && width > 0 && height > 0;

  const positionedStyle = canPosition
    ? {
        width: `${(naturalWidth / width) * 100}%`,
        height: `${(naturalHeight / height) * 100}%`,
        left: `-${(x1 / width) * 100}%`,
        top: `-${(y1 / height) * 100}%`,
      }
    : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      <img
        src={preview.imageUrl}
        alt={alt}
        onLoad={(event) => {
          setNaturalSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
        }}
        onError={() => setFailed(true)}
        className={
          canPosition
            ? "absolute max-w-none select-none"
            : "h-full w-full object-cover"
        }
        style={positionedStyle}
        draggable={false}
      />
    </div>
  );
}

function CropPreviewButton({
  preview,
  alt,
  emptyText,
  onPreview,
  label,
  heightClass,
}) {
  if (!preview) {
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40`}>
        <div>
          <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
          <p className="mt-2">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPreview}
      className={`group relative flex w-full ${heightClass} items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950`}
      aria-label={label}
    >
      <CropPreviewContent preview={preview} alt={alt} />
      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" />
        {label}
      </span>
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-700/50 pb-2">
      <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold shrink-0">{label}</span>
      <span className="font-bold text-slate-900 dark:text-slate-100 text-right text-xs">
        {normalizeText(value)}
      </span>
    </div>
  );
}

function SummaryCard({ label, value, icon, accent = "slate" }) {
  const accentMap = {
    teal: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/20",
    indigo: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/20",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/20",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/20",
    slate: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800",
  };
  const iconClass = accentMap[accent] || accentMap.slate;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 transition-all hover:-translate-y-0.5 hover:shadow-md group">
      {icon && (
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${iconClass}`}>
          {icon}
        </div>
      )}
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
        {normalizeText(value)}
      </p>
    </div>
  );
}
function PerObjectResult({ 
  objectNo,
  finalDenomination,
  country,
  currency,
  material,
  origin,
  matchedAgents,
  confidence,
  status,
  image,
  cropPreview,
  agentResults,
  consensusValidVotes = [],
  refereeView,
  lensPayload,
  lensSources,
  cropEvidence,
  consensusTrace,
  conversionResult,
  originalObjectData = null,
  t,
  lang,
  ratesData,
  parseAmountFromDenomination,
  isSingleObject
}) {
  const [openSections, setOpenSections] = React.useState({
    details: false,
    crop: false,
    agents: true,
    lens: false,
    why: true,
    timeline: false
  });
  const [objectImagePreview, setObjectImagePreview] = React.useState(false);
  const [showAllLensSources, setShowAllLensSources] = React.useState(false);

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Helper for VND
  const getVndText = () => {
    const amount = parseAmountFromDenomination(finalDenomination);
    if (!amount) return "N/A";
    const backendVndValue = getBackendVndValue(conversionResult);
    if (backendVndValue !== null) {
      return `~ ${Math.round(backendVndValue).toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} VND`;
    }
    const cur = String(currency || "").toUpperCase();
    if (cur === "VND") return `${amount.toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} VND`;
    const rate = Number(ratesData?.rates?.[cur] || 0);
    if (rate <= 0) {
      return lang === "VI"
        ? `${amount.toLocaleString("vi-VN")} ${cur} · chưa có tỷ giá VND`
        : `${amount.toLocaleString("en-US")} ${cur} · VND rate unavailable`;
    }
    return `~ ${Math.round(amount * rate).toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} VND`;
  };

  const finalCanonical = buildMoneyCanonical({
    denomination: finalDenomination,
    currency: currency,
    country: country,
  });

  const getVoteData = (agentItem, agentName, agentKey) => {
    const norm = normalizeAgentVote(
      agentItem,
      finalCanonical,
      consensusValidVotes,
      agentKey,
    );
    return { ...norm, name: getAgentDisplayName(agentItem?.agent || agentItem?.agent_name || agentName) };
  };

  // Ensure we have exactly 3 cards for AG1, AG2, AG3
  const ag1 = getAgentDataByName(agentResults, ["agent_1", "openai", "gpt", "vision", "ag1"]) || {};
  const ag2 = getAgentDataByName(agentResults, ["agent_2", "llm", "gemini", "ag2"]) || {};
  const ag3 = getAgentDataByName(agentResults, ["agent_3", "lens", "visual", "ag3"]) || {};
  const lensState = getLensEvidenceState(lensPayload || ag3, lensSources || [], lang);
  const cropMetrics = cropEvidence?.metrics
    ? [
        ["Area", cropEvidence.metrics.area_ratio],
        ["Aspect", cropEvidence.metrics.aspect_ratio],
        ["Texture", cropEvidence.metrics.texture_variance],
        ["Edge", cropEvidence.metrics.edge_density],
        ["Brightness", cropEvidence.metrics.brightness],
        ["Contrast", cropEvidence.metrics.contrast],
        ["Background", cropEvidence.metrics.background_score],
      ].filter(([, value]) => value !== undefined && value !== null)
    : [];

  const votes = [
    getVoteData({ agent: "AG1 OpenAI/GPT Vision", data: ag1 }, "AG1", "ml_dl"),
    getVoteData({ agent: "AG2 Gemini/LLM", data: ag2 }, "AG2", "llm_api"),
    getVoteData({ agent: "AG3 Google Lens/Visual Search", data: ag3 }, "AG3", "visual_search")
  ];

  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${!isSingleObject ? "mt-4" : ""}`}>
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          {!isSingleObject && (cropPreview || image) && (
            <button
              type="button"
              onClick={() => setObjectImagePreview(true)}
              className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              aria-label={lang === "VI" ? "Xem ảnh crop" : "View crop image"}
            >
              {cropPreview ? (
                <CropPreviewContent preview={cropPreview} alt="Crop" />
              ) : (
                <img src={image} alt="Crop" className="h-full w-full object-cover" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                <Maximize2 className="h-4 w-4" />
              </span>
            </button>
          )}
          <div>
            <p className="mb-1 text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">
              {isSingleObject
                ? t.analysisEvidence
                : lang === "VI"
                  ? `Tờ tiền #${objectNo}`
                  : `Banknote #${objectNo}`}
            </p>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{finalDenomination}</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{status}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:text-right">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">{t.lblConfidence}</p>
            <p className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">{confidence}</p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">{t.lblConsensus}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{matchedAgents}/3</span>
            </div>
          </div>
        </div>
      </div>

      {/* A. DETAILS */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <DetailItem label={t.lblCountry} value={country} />
          <DetailItem label={t.lblCurrency} value={currency} />
          <DetailItem label={t.lblMaterial} value={material} />
          <DetailItem label={t.lblConfidence} value={confidence} />
          {!isSingleObject && (
            <DetailItem label={t.vndEquivalent || "VND Equivalent"} value={getVndText()} />
          )}
        </div>
      </div>

      {/* B. AGENT VOTES */}
      <CollapsibleSection title={`B. ${t.agentVotes || "AI Agent Votes"}`} isOpen={openSections.agents} toggle={() => toggleSection('agents')}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {votes.map((vote, i) => (
             <AgentVoteCard key={i} vote={vote} t={t} lang={lang} />
          ))}
        </div>
      </CollapsibleSection>

      {/* C. CROP GATE */}
      <CollapsibleSection title={`C. ${t.lblCropEvidence || "Crop Gate / AG0 Evidence"}`} isOpen={openSections.crop} toggle={() => toggleSection('crop')}>
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/30">
          <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
            {lang === "VI" ? "YOLO tìm vùng nghi là tiền giấy, AG0 kiểm tra vùng crop hợp lệ." : "YOLO detects banknote regions, AG0 validates crop suitability."}
          </p>
          {cropEvidence ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2">
                {cropEvidence.action === "KEEP" || cropEvidence.action === "VALID" ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" /> : cropEvidence.action === "REVIEW" ? <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {cropEvidence.action === "KEEP" || cropEvidence.action === "VALID" ? (lang === "VI" ? "AG0 đã chấp nhận vùng cắt này là vùng tiền giấy hợp lệ." : "AG0 accepted this crop as a valid banknote.") :
                     cropEvidence.action === "REVIEW" ? (lang === "VI" ? "Vùng cắt có vẻ là tiền giấy nhưng cần kiểm tra chéo." : "Crop looks like a banknote but requires cross-validation.") :
                     (lang === "VI" ? "Vùng cắt không đủ điều kiện nhận diện." : "Crop is not suitable for recognition.")}
                  </p>
                  {cropEvidence.selectedReason && (
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
                      {lang === "VI" ? "Lý do chọn vùng: " : "Selected region: "}
                      {cropEvidence.selectedReason}
                    </p>
                  )}
                  {cropEvidence.reason && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {cropEvidence.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                {cropEvidence.confidence !== null && cropEvidence.confidence !== undefined && (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                    AG0: {formatConfidence(cropEvidence.confidence)}
                  </span>
                )}
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                  {lang === "VI" ? "Box bị loại" : "Rejected boxes"}: {cropEvidence.rejectedBoxes.length}
                </span>
              </div>
              {(cropMetrics.length > 0 || cropEvidence.trace || cropEvidence.rejectedBoxes.length > 0) && (
                <details className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200">
                    {lang === "VI" ? "Metrics và chi tiết chọn box" : "Metrics and box selection details"}
                  </summary>
                  {cropMetrics.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {cropMetrics.map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                          <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                          <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                    {JSON.stringify(
                      {
                        box_selection_trace: cropEvidence.trace,
                        rejected_boxes: cropEvidence.rejectedBoxes,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">{lang === "VI" ? "Không có dữ liệu crop evidence." : "No AG0 crop evidence data available."}</p>
          )}
        </div>
      </CollapsibleSection>

      {/* D. GOOGLE LENS EVIDENCE */}
      <CollapsibleSection title={`D. ${t.lensEvidence || "Google Lens Evidence"}`} isOpen={openSections.lens} toggle={() => toggleSection('lens')}>
        {lensSources && lensSources.length > 0 ? (
          <div className="space-y-3">
            {(showAllLensSources ? lensSources : lensSources.slice(0, 5)).map((src, i) => {
              const SourceElement = src.url ? "a" : "div";
              const sourceScore = Number(src.confidence);
              return (
                <SourceElement
                  key={`${src.url || src.title}-${i}`}
                  {...(src.url
                    ? { href: src.url, target: "_blank", rel: "noreferrer" }
                    : {})}
                  className="group block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/5"
                >
                  <div className="flex min-w-0 gap-3">
                    {src.thumbnail && <img src={src.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="line-clamp-2 break-words text-sm font-black text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">{src.title}</h4>
                        {src.url && <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-500" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="break-all text-xs font-semibold text-indigo-600 dark:text-indigo-400">{src.domain || "—"}</p>
                        {Number.isFinite(sourceScore) && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {lang === "VI" ? "điểm" : "score"} {sourceScore.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {src.snippet && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{src.snippet}</p>}
                    </div>
                  </div>
                </SourceElement>
              );
            })}
            {lensSources.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllLensSources((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
              >
                {showAllLensSources ? t.showFewer : `${t.showMore} (${lensSources.length - 5})`}
                {showAllLensSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        ) : (
          <div
            className={`rounded-lg border p-4 text-sm ${
              lensState.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                : lensState.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
            }`}
          >
            {lensState.message}
          </div>
        )}
      </CollapsibleSection>

      {/* E. WHY CHOSEN */}
      <CollapsibleSection title={`E. ${t.whyChosen || "Why did the system choose this result?"}`} isOpen={openSections.why} toggle={() => toggleSection('why')}>
        <div className="space-y-4 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 shadow-sm dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-cyan-500/5">
          {/* Crop Evidence */}
          {(() => {
            const objectData = originalObjectData || {};
            const cropChecker = objectData?.crop_checker || cropEvidence || {};
            const action = objectData?.ag0_action || cropChecker?.ag0_action || cropChecker?.action;
            if (!action) return null;
            const bScore = formatScore(objectData?.banknote_score ?? cropChecker?.banknote_score);
            const dScore = formatScore(objectData?.document_score ?? cropChecker?.document_score);
            const pEvidences = objectData?.positive_evidence || cropChecker?.positive_evidence || [];
            const boxReason = objectData?.selected_box_reason || cropChecker?.selected_box_reason;
            const eligible = objectData?.agent_eligible ?? cropChecker?.agent_eligible;

            return (
              <div className="rounded-xl bg-white/60 p-4 shadow-sm dark:bg-slate-900/40">
                <h5 className="mb-3 flex items-center gap-2 font-black text-slate-900 dark:text-slate-100">
                  <ScanLine className="h-4 w-4 text-indigo-500" />
                  {lang === "VI" ? "Kiểm tra vùng ảnh" : "Crop evidence"}
                </h5>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <li><span className="font-semibold text-slate-900 dark:text-slate-200">AG0 action:</span> {action}</li>
                  <li><span className="font-semibold text-slate-900 dark:text-slate-200">banknote_score:</span> {bScore}</li>
                  <li><span className="font-semibold text-slate-900 dark:text-slate-200">document_score:</span> {dScore}</li>
                  <li><span className="font-semibold text-slate-900 dark:text-slate-200">agent_eligible:</span> {eligible ? "true" : "false"}</li>
                  {pEvidences.length > 0 && (
                    <li><span className="font-semibold text-slate-900 dark:text-slate-200">positive_evidence:</span> {pEvidences.join(", ")}</li>
                  )}
                  {boxReason && (
                    <li><span className="font-semibold text-slate-900 dark:text-slate-200">selected_box_reason:</span> {boxReason}</li>
                  )}
                </ul>
              </div>
            );
          })()}

          {/* Agent Agreement */}
          <div className="rounded-xl bg-white/60 p-4 shadow-sm dark:bg-slate-900/40">
            <h5 className="mb-3 flex items-center gap-2 font-black text-slate-900 dark:text-slate-100">
              <Brain className="h-4 w-4 text-emerald-500" />
              {lang === "VI" ? "Đồng thuận AI" : "Agent agreement"}
            </h5>
            <ul className="mb-3 list-inside list-disc space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
              {votes.map((vote, i) => {
                 let text = `${vote.name} ${lang === "VI" ? "chọn" : "selected"} `;
                 const selectedValue = vote.hasResult
                   ? vote.denom
                   : lang === "VI" ? "Không xác định" : "Unknown";
                 const voteLabel = vote.voteStatus === "matched"
                   ? lang === "VI" ? "đồng thuận" : "agreed"
                   : vote.voteStatus === "different"
                     ? lang === "VI" ? "khác biệt" : "differed"
                     : lang === "VI" ? "không tính phiếu" : "not counted";
                 text += `${selectedValue} (${voteLabel})`;
                 return <li key={i}>{text}</li>;
              })}
            </ul>
            <div className="rounded-lg bg-emerald-100/50 p-3 text-sm text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              <span className="font-bold">
              {matchedAgents >= 3
                ? (lang === "VI" ? `Cả 3 tác tử cùng đồng thuận ${finalDenomination}.` : `All 3 agents agreed on ${finalDenomination}.`)
                : matchedAgents >= 2
                  ? (lang === "VI" ? `2/3 tác tử đồng thuận ${finalDenomination}, tác tử còn lại lỗi kỹ thuật hoặc khác biệt.` : `2/3 agents agreed on ${finalDenomination}, the other had an error or differed.`)
                  : matchedAgents === 1
                    ? (lang === "VI" ? `Chỉ có 1 kết quả hợp lệ.` : `Only 1 valid result.`)
                    : (lang === "VI" ? `Không có sự đồng thuận.` : `No consensus reached.`)}
              </span>
            </div>
          </div>

          {/* Visual/Lens Evidence */}
          {(() => {
             const objectData = originalObjectData || {};
             const visibleText = objectData?.visible_text || objectData?.agent_results?.find(a => a.agent === 'gpt_vision')?.result?.visible_text;
             const keyFeatures = objectData?.key_features || objectData?.agent_results?.find(a => a.agent === 'gpt_vision')?.result?.key_features;
             const lensEvidences = objectData?.lens_evidence || objectData?.agent_results?.find(a => a.agent === 'google_lens')?.result?.evidence || [];
             if (!visibleText && !keyFeatures && lensEvidences.length === 0) return null;

             return (
               <div className="rounded-xl bg-white/60 p-4 shadow-sm dark:bg-slate-900/40">
                 <h5 className="mb-3 flex items-center gap-2 font-black text-slate-900 dark:text-slate-100">
                   <Globe className="h-4 w-4 text-blue-500" />
                   {lang === "VI" ? "Bằng chứng thị giác và Lens" : "Visual and Lens evidence"}
                 </h5>
                 <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                   {visibleText && (
                     <li><span className="font-semibold text-slate-900 dark:text-slate-200">Visible text:</span> {visibleText}</li>
                   )}
                   {keyFeatures && (
                     <li><span className="font-semibold text-slate-900 dark:text-slate-200">Key features:</span> {keyFeatures}</li>
                   )}
                   {lensEvidences.length > 0 && (
                     <li><span className="font-semibold text-slate-900 dark:text-slate-200">Google Lens Evidence:</span> {lensEvidences.slice(0, 3).map(e => e.title || e.source).join(", ")}</li>
                   )}
                 </ul>
               </div>
             );
          })()}

          {/* Aggregator Conclusion */}
          <div className="rounded-xl bg-white/60 p-4 shadow-sm dark:bg-slate-900/40">
             <h5 className="mb-3 flex items-center gap-2 font-black text-slate-900 dark:text-slate-100">
               <Gavel className="h-4 w-4 text-purple-500" />
               {lang === "VI" ? "Kết luận trọng tài" : "Aggregator conclusion"}
             </h5>
             <div className="prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-slate-300">
                <ReactMarkdown>{refereeView || (lang === "VI" ? "Aggregator chọn kết quả cuối vì đa số tác tử đồng thuận cùng mệnh giá/quốc gia/tiền tệ." : "Aggregator selected the final result because the majority of agents agreed on the same denomination/country/currency.")}</ReactMarkdown>
             </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* F. TIMELINE */}
      <CollapsibleSection title={`F. ${t.consensusTimeline || "Consensus Timeline"}`} isOpen={openSections.timeline} toggle={() => toggleSection('timeline')}>
        {consensusTrace && consensusTrace.length > 0 ? (
          <div className="relative space-y-3 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
             {consensusTrace.map((trace, i) => (
                <div key={i} className="relative flex gap-4">
                   <div className="z-10 mt-4 h-5 w-5 shrink-0 rounded-full border-4 border-white bg-indigo-500 shadow-sm dark:border-slate-900" />
                   <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                      <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {trace.step ||
                          `${lang === "VI" ? "Lần thử" : "Attempt"} ${trace.attempt || i + 1}`}
                      </p>
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mt-1">
                        {formatTimelinePattern(trace.pattern, lang)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {trace.reason || trace.action || trace.decision || "—"}
                      </p>
                   </div>
                </div>
             ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">{lang === "VI" ? "Không có dữ liệu tiến trình." : "No timeline data available."}</p>
        )}
      </CollapsibleSection>
      {objectImagePreview && (cropPreview || image) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setObjectImagePreview(false)}
        >
          <button
            type="button"
            onClick={() => setObjectImagePreview(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={lang === "VI" ? "Đóng ảnh" : "Close image"}
          >
            <X className="h-5 w-5" />
          </button>
          {cropPreview ? (
            <div
              className="h-[80vh] max-h-[88vh] w-[94vw] max-w-5xl overflow-hidden rounded-lg bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <CropPreviewContent
                preview={cropPreview}
                alt={lang === "VI" ? `Ảnh crop tờ tiền ${objectNo}` : `Banknote crop ${objectNo}`}
              />
            </div>
          ) : (
          <img
            src={image}
            alt={lang === "VI" ? `Ảnh crop tờ tiền ${objectNo}` : `Banknote crop ${objectNo}`}
            className="max-h-[88vh] max-w-[94vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          )}
        </div>
      )}
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function CollapsibleSection({ title, isOpen, toggle, children }) {
  return (
    <div className="border-b border-slate-200 last:border-0 dark:border-slate-800">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:hover:bg-slate-800/30"
      >
        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h4>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function AgentVoteCard({ vote, t, lang }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { voteStatus, denom, country, currency, reasoning, confidence, isError, isDisabled, isNonVoting, hasResult, hasEvidence, name } = vote;
  const isMatched = voteStatus === "matched";
  const isDifferent = voteStatus === "different";
  const isNotCounted = isNonVoting || voteStatus === "not_counted";

  const statusColor = isMatched
    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
    : isDifferent
      ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50";
  const textColor = isMatched
    ? "text-emerald-700 dark:text-emerald-300"
    : isDifferent
      ? "text-amber-700 dark:text-amber-300"
      : "text-slate-600 dark:text-slate-300";
  const displayStatus = isMatched
    ? t.matched || (lang === "VI" ? "Khớp" : "Matched")
    : isDifferent
      ? t.different || (lang === "VI" ? "Khác biệt" : "Different")
      : lang === "VI" ? "Không tính phiếu" : "Not counted";

  const showAg3Trace =
    vote?.agentKey === "visual_search" ||
    /ag3|lens|visual search/i.test(String(name || ""));

  return (
    <article className={`flex h-full min-h-[260px] flex-col rounded-2xl border p-4 shadow-sm ${statusColor}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm font-black text-slate-900 dark:text-slate-100">{name}</p>
        <span className={`max-w-[120px] rounded-full bg-white/65 px-2.5 py-1 text-center text-[10px] font-black uppercase leading-tight dark:bg-slate-950/30 ${textColor}`}>
          {displayStatus}
        </span>
      </div>
      {showAg3Trace && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-current/10 bg-white/55 p-2 text-[10px] font-bold uppercase leading-tight text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
          <div>
            <span className="block">{t.lblProvider || "Provider"}</span>
            <span className={`mt-1 block text-xs normal-case ${textColor}`}>{getAg3ProviderLabel(vote?.payload)}</span>
          </div>
          <div>
            <span className="block">{t.lblFormatter || "Formatter"}</span>
            <span className={`mt-1 block text-xs normal-case ${textColor}`}>{getAg3FormatterLabel(vote?.payload)}</span>
          </div>
        </div>
      )}
      <div className="mb-4 space-y-1">
        {isNotCounted && !hasResult ? (
          <>
          <p className={`text-sm font-semibold ${textColor}`}>
            {hasEvidence
              ? lang === "VI" ? "Không đủ chắc để tính phiếu" : "Not confident enough to count"
              : lang === "VI" ? "Không có kết quả hợp lệ để tính phiếu" : "No valid result to count"}
          </p>
          {getNonVotingAgentMessage(vote, lang) !== (
            hasEvidence
              ? lang === "VI" ? "Không đủ chắc để tính phiếu" : "Not confident enough to count"
              : lang === "VI" ? "Không có kết quả hợp lệ để tính phiếu" : "No valid result to count"
          ) && (
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
              {getNonVotingAgentMessage(vote, lang)}
            </p>
          )}
          </>
        ) : (
          <>
            <p className={`text-xl font-black ${textColor}`}>{hasResult && !isError ? denom : "—"}</p>
            {hasResult && !isError && (
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{country} · {currency}</p>
            )}
          </>
        )}
      </div>
      {reasoning && reasoning !== "N/A" && (
        <div className="mb-3">
          <p className={`${isExpanded ? "" : "line-clamp-4"} text-xs leading-5 text-slate-600 dark:text-slate-300`}>
            {reasoning}
          </p>
          {reasoning.length > 170 && (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:underline dark:text-indigo-300"
            >
              {isExpanded ? t.showLess : t.readFull}
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}
      {!isError && !isDisabled && confidence !== "N/A" && (
        <p className="mt-auto border-t border-current/10 pt-3 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
          {t.lblConfidence || "Confidence"}: {confidence}
        </p>
      )}
    </article>
  );
}

function MultiObjectResults({ currentItem, t, lang, ratesData }) {
  const objects = Array.isArray(currentItem?.detected_objects) ? currentItem.detected_objects : [];
  if (!objects.length) return null;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            {lang === "VI" ? `Đã phát hiện ${objects.length} tờ tiền` : `${objects.length} banknotes detected`}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lang === "VI" ? "Mỗi tờ tiền được phân tích riêng bởi các agent AI" : "Each banknote was analyzed independently by AI agents"}
          </p>
        </div>
        <span className="w-fit rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/20 dark:text-indigo-300">
          {objects.length} {lang === "VI" ? "tờ" : "items"}
        </span>
      </div>

      <div>
        {objects.map((item, index) => {
          const finalData = item?.final_result || item?.summary || {};
          const agentResults = Array.isArray(item?.agent_results) ? item.agent_results : [];
          const lensPayload = getAgentDataByName(agentResults, ["lens", "visual", "agent_3"]);
          const denomination =
            finalData.final_denomination ||
            finalData.menh_gia ||
            finalData.denomination;
          const originalImageUrl =
            currentItem?.input_image_url ||
            currentItem?.image_url ||
            currentItem?.uploaded_image_url ||
            currentItem?.raw_backend?.input_image_url ||
            currentItem?.raw_backend?.image_url ||
            currentItem?.raw_backend?.uploaded_image_url ||
            null;
          const objectCropPreview = getCropPreviewSource(item, originalImageUrl);
          return (
            <PerObjectResult 
              key={index}
              objectNo={item?.object_index || index + 1}
              finalDenomination={formatDenomination(denomination)}
              country={formatCountry(finalData.quoc_gia || finalData.country || finalData.origin)}
              currency={formatCurrency(
                finalData.currency ||
                finalData.currency_code ||
                finalData.ma_tien_te ||
                inferCurrencyFromDenomination(denomination, "N/A"),
              )}
              material={safeText(finalData.chat_lieu || finalData.material, "Không xác định")}
              origin={formatCountry(finalData.quoc_gia || finalData.country)}
              matchedAgents={Number(finalData.matched_agents || finalData.so_luong_dong_thuan || 0)}
              confidence={formatConfidence(firstDefined(finalData.confidence, finalData.do_tin_cay))}
              status={normalizeStatusLabel(finalData.status || "Completed", lang)}
              image={getCropImageUrl(item) || originalImageUrl}
              cropPreview={objectCropPreview}
              agentResults={agentResults}
              consensusValidVotes={finalData.valid_votes || item?.consensus?.valid_votes || []}
              refereeView={stripMarkdownSymbols(finalData.quan_diem_trong_tai || finalData.referee_view || finalData.reasoning)}
              lensPayload={lensPayload}
              lensSources={normalizeLensSources(lensPayload)}
              cropEvidence={normalizeCropEvidence(item)}
              consensusTrace={normalizeConsensusTrace(item, finalData)}
              conversionResult={null}
              originalObjectData={item}
              t={t}
              lang={lang}
              ratesData={ratesData}
              parseAmountFromDenomination={parseAmountFromDenomination}
              isSingleObject={false}
            />
          );
        })}
      </div>
    </section>
  );
}



function TokenUsageCard({ currentItem, t }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const raw = currentItem?.raw_backend || currentItem || {};
  const usage = raw?.token_usage || currentItem?.token_usage || {};

  const systemTokensCharged =
    raw?.system_tokens_charged ??
    currentItem?.system_tokens_charged ??
    usage?.system_tokens_charged;

  const inputTokens =
    raw?.input_tokens ?? currentItem?.input_tokens ?? usage?.input_tokens;

  const outputTokens =
    raw?.output_tokens ??
    currentItem?.output_tokens ??
    usage?.output_tokens;

  const totalAiTokens =
    raw?.total_ai_tokens ??
    currentItem?.total_ai_tokens ??
    usage?.total_ai_tokens ??
    (
      inputTokens !== undefined &&
      inputTokens !== null &&
      outputTokens !== undefined &&
      outputTokens !== null
        ? Number(inputTokens) + Number(outputTokens)
        : undefined
    );

  const billableAiTokens =
    raw?.billable_ai_tokens ??
    currentItem?.billable_ai_tokens ??
    usage?.billable_ai_tokens;

  const balanceBefore =
    raw?.balance_before ?? currentItem?.balance_before ?? usage?.balance_before;

  const balanceAfter =
    raw?.balance_after ?? currentItem?.balance_after ?? usage?.balance_after;

  const billingMode =
    raw?.billing_mode ??
    currentItem?.billing_mode ??
    usage?.billing_mode;

  const normalizedBillingMode = String(billingMode || "").trim().toLowerCase();
  const hasChargeValue = systemTokensCharged !== undefined && systemTokensCharged !== null;
  const explicitBillingSkipped = Boolean(
    raw?.billing_skipped ??
      currentItem?.billing_skipped ??
      usage?.billing_skipped ??
      raw?.final_result?.billing_skipped,
  );
  const billingSkipped =
    explicitBillingSkipped ||
    normalizedBillingMode === "skipped" ||
    normalizedBillingMode.startsWith("not_billable") ||
    (hasChargeValue && Number(systemTokensCharged) === 0);
  const billingModeLabel = billingSkipped
    ? t.skippedBillingMode
    : normalizedBillingMode === "dynamic"
      ? t.dynamicBillingMode
      : normalizedBillingMode === "fixed"
        ? t.fixedBillingMode
        : billingMode ?? "N/A";
  const billingDescription = billingSkipped
    ? t.skippedBillingDesc
    : normalizedBillingMode === "dynamic"
      ? t.dynamicBillingDesc
      : normalizedBillingMode === "fixed"
        ? t.fixedBillingDesc
        : t.tokenUsageDesc;
  const chargedSummary = billingSkipped
    ? t.skippedBillingDesc
    : `${systemTokensCharged ?? "N/A"} ${String(t.tokensCharged).toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
              {t.tokenUsageTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {chargedSummary}
            </p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-5 dark:border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <TokenMetric
              icon={<Coins className="w-4 h-4" />}
              label={t.tokensCharged}
              value={systemTokensCharged ?? "N/A"}
            />

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
              value={`${inputTokens ?? "N/A"} / ${outputTokens ?? "N/A"}`}
            />

            <TokenMetric
              icon={<Cpu className="w-4 h-4" />}
              label={t.aiTokens}
              value={totalAiTokens ?? "N/A"}
            />

            <TokenMetric
              icon={<Coins className="w-4 h-4" />}
              label={t.billingMode}
              value={billingModeLabel}
            />
          </div>

          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm leading-6 ${
            billingSkipped
              ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
              : "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200"
          }`}>
            {billingDescription}
          </div>

          {Number(billableAiTokens || 0) > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              {t.billableTokens}:{" "}
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {billableAiTokens}
              </span>
              <span className="ml-2">{t.billableUsageDesc}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TokenMetric({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
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
  const isMatched = status === "matched";
  const isDiff = status === "different";
  const isFinal = status === "final";

  const borderColor = isMatched
    ? "border-l-teal-500"
    : isDiff
    ? "border-l-amber-400"
    : "border-l-slate-400 dark:border-l-slate-600";

  const statusClass = isMatched
    ? "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-100 dark:border-teal-500/30"
    : isDiff
    ? "bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30"
    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700";

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 pl-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 border-l-4 ${borderColor} transition-colors`}>
      <div className="flex items-center gap-3">
        {isMatched ? (
          <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" strokeWidth={2.5} />
        ) : isDiff ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={2.5} />
        ) : (
          <Layers className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{label}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{normalizeText(value)}</p>
        </div>
      </div>
      <span className={`w-fit px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusClass}`}>
        {isMatched ? t.matched : isDiff ? t.different : t.final}
      </span>
    </div>
  );
}

function AgentCard({ agentKey, title, method, data, finalCanonical, t, agentType, lang }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const headerGradient = agentType === "yolo"
    ? "from-indigo-900 to-indigo-950"
    : agentType === "llm"
    ? "from-violet-900 to-violet-950"
    : "from-teal-900 to-teal-950";

  const agentIcon = agentType === "yolo"
    ? <Cpu className="w-5 h-5" />
    : agentType === "llm"
    ? <BrainCircuit className="w-5 h-5" />
    : <ScanSearch className="w-5 h-5" />;

  const agentDenomination = getAgentDenomination(data);
  const isErr = isTechnicalError(data);
  const hasResult = Boolean(agentDenomination && agentDenomination !== "N/A" && !agentDenomination.toLowerCase().includes("không"));
  const hasEvidence = Array.isArray(data?.evidence) && data?.evidence.length > 0;

  if (!data || (!isErr && !hasResult && !hasEvidence)) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors flex flex-col h-full">
        <div className={`bg-gradient-to-br ${headerGradient} p-4 flex items-center gap-3`}>
          <span className="text-slate-400">{agentIcon}</span>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{agentKey}</span>
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
        </div>
        <div className="p-6 flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.noAgentData}</p>
        </div>
      </div>
    );
  }

  if (!isErr && !hasResult && hasEvidence) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors flex flex-col h-full">
        <div className={`bg-gradient-to-br ${headerGradient} p-4 flex items-center gap-3`}>
          <span className="text-slate-400">{agentIcon}</span>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{agentKey}</span>
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
        </div>
        <div className="p-6 flex-1 flex flex-col justify-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {lang === "VI" ? "CÓ BẰNG CHỨNG" : "EVIDENCE ONLY"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lang === "VI" ? "Không đủ chắc để tính phiếu" : "Not confident enough to count"}
          </p>
        </div>
      </div>
    );
  }

  const agentCountry = getAgentCountry(data);
  const currency = data?.currency || data?.currency_code || inferMoneyCurrency(agentDenomination);

  const agentCanonical = buildMoneyCanonical({
    denomination: agentDenomination,
    currency: currency,
    country: agentCountry,
  });

  const isMatched = isSameMoneyVote(agentCanonical, finalCanonical);
  const reasoningText = stripMarkdownSymbols(getAgentReasoning(data));
  const confidence = data?.confidence || data?.do_tin_cay || data?.confidence_score;
  const confNum = confidence !== undefined && confidence !== null
    ? (Number(confidence) <= 1 ? Number(confidence) * 100 : Number(confidence))
    : null;
  const showAg3Trace =
    agentType === "lens" ||
    /ag3|lens|visual search/i.test(`${agentKey || ""} ${title || ""}`);

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all ${
      isMatched ? "border-teal-200 dark:border-teal-800/60" : "border-slate-200 dark:border-slate-800"
    }`}>
      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${headerGradient} p-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className={isMatched ? "text-teal-400" : "text-slate-400"}>{agentIcon}</span>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{agentKey}</span>
            <h3 className="text-base font-bold text-white leading-tight">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{getAgentMethod(data, method)}</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border whitespace-nowrap ${
          isMatched
            ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
            : "bg-amber-500/20 text-amber-300 border-amber-500/40"
        }`}>
          {isMatched ? t.matched : t.different}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 space-y-3 flex-1">
        <InfoRow label={t.lblDenomination} value={agentDenomination} />
        <InfoRow label={t.lblCountry} value={getAgentCountry(data)} />
        <InfoRow label={t.lblMaterial} value={data?.chat_lieu || data?.material} />
        {showAg3Trace && (
          <>
            <InfoRow label={t.lblProvider || "Provider"} value={getAg3ProviderLabel(data)} />
            <InfoRow label={t.lblFormatter || "Formatter"} value={getAg3FormatterLabel(data)} />
          </>
        )}

        {confNum !== null && (
          <div className="pt-1">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Confidence</span>
              <span className={`text-xs font-black ${
                confNum >= 80 ? "text-teal-500" : confNum >= 60 ? "text-amber-400" : "text-rose-400"
              }`}>{confNum.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                confNum >= 80 ? "bg-gradient-to-r from-teal-500 to-teal-400" : confNum >= 60 ? "bg-amber-400" : "bg-rose-400"
              }`} style={{ width: `${Math.min(confNum, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Reasoning */}
      <div className="px-5 pb-5">
        <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
          {t.lblReasoning}
        </p>
        <div className={`text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 ${
          !isExpanded ? "line-clamp-5" : ""
        }`}>
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
const genericNoBanknoteReason = {
  type: "no_valid_crop",
  viMessage: "Không tìm thấy vùng nào đủ giống tiền giấy. Các vùng nghi vấn không đủ độ tin cậy nên hệ thống không gửi sang AI Agent để tránh nhận diện sai và không tốn token.",
  enMessage: "No region was sufficiently similar to a banknote. The suspicious regions were not reliable enough, so the system did not send them to AI agents to avoid false recognition and token usage.",
};

const isDocumentLikeRejectedObject = (obj) => {
  const checker = obj?.crop_checker || {};
  const documentScore = Number(obj?.document_score ?? checker?.document_score);
  if (Number.isFinite(documentScore) && documentScore >= 0.6) return true;

  const negativeEvidence = (
    obj?.negative_evidence ||
    checker?.negative_evidence ||
    []
  ).join(" ");
  const reason = String(
    obj?.reason ||
    obj?.decision_reason ||
    checker?.decision_reason ||
    checker?.reason ||
    "",
  ).replace(/document_score\s*=\s*[\d.]+/gi, " ");
  const evidenceText = `${negativeEvidence} ${reason}`.toLowerCase();

  return /(document[-\s]?like|document evidence|high document score|diagram|screenshot|tài liệu|sơ đồ|ảnh chụp màn hình)/i.test(evidenceText);
};

const inferNoBanknoteReason = (rejectedObjects = []) => {
  if (!rejectedObjects || rejectedObjects.length === 0) {
    return genericNoBanknoteReason;
  }

  if (rejectedObjects.some(isDocumentLikeRejectedObject)) {
    return {
      type: "document_diagram",
      viMessage: "Ảnh có dấu hiệu giống tài liệu, sơ đồ hoặc ảnh chụp màn hình hơn là tiền giấy.",
      enMessage: "The image contains evidence that it is more like a document, diagram, or screenshot than a banknote.",
    };
  }

  return genericNoBanknoteReason;
};

const translateRejectEvidence = (evidence, lang) => {
  if (typeof evidence !== 'string') return evidence;

  if (lang === "VI") {
    if (evidence.includes("very elongated crop aspect_ratio")) return "Vùng cắt quá dài/dẹt so với hình dạng tờ tiền thông thường.";
    if (evidence.includes("large white background ratio")) return "Nền trắng chiếm phần lớn vùng ảnh.";
    if (evidence.includes("low color richness")) return "Ảnh có rất ít màu sắc.";
    if (evidence.includes("low mean saturation")) return "Độ bão hòa màu rất thấp, gần như ảnh trắng đen.";
    if (evidence.includes("many long straight lines")) return "Có nhiều đường thẳng dài, giống sơ đồ/bảng/mũi tên.";
    if (evidence.includes("heuristic source=contour")) return "Vùng này không được YOLO xác nhận là tiền; chỉ được OpenCV contour bắt được nên độ tin cậy thấp hơn.";
    if (evidence.includes("low texture")) return "Ảnh có rất ít chi tiết / bề mặt (low texture).";
    if (evidence.includes("low contrast")) return "Ảnh có độ tương phản thấp.";
    if (evidence.includes("blur") || evidence.includes("blurry")) return "Ảnh bị mờ.";
    if (evidence.includes("dark")) return "Ảnh quá tối.";
    if (evidence.includes("coin") || evidence.includes("round")) return "Vùng ảnh có hình dạng tròn giống tiền xu.";
    if (evidence.includes("clothes") || evidence.includes("landscape")) return "Vùng ảnh giống phong cảnh hoặc vật thể thông thường.";
  } else {
    if (evidence.includes("very elongated crop aspect_ratio")) return "The crop is too elongated compared with a typical banknote shape.";
    if (evidence.includes("large white background ratio")) return "A large part of the region is white background.";
    if (evidence.includes("low color richness")) return "The image has very low color richness.";
    if (evidence.includes("low mean saturation")) return "The color saturation is very low, close to black-and-white.";
    if (evidence.includes("many long straight lines")) return "There are many long straight lines, similar to a diagram/table/arrows.";
    if (evidence.includes("heuristic source=contour")) return "This region was not confirmed by YOLO; it was only found by OpenCV contour, so it is less reliable.";
  }

  return evidence;
};

function InvalidConclusionResult({
  currentItem,
  previewImage,
  t,
  lang,
  onScanAnother,
  showRawLog,
  setShowRawLog,
  handleCopyJSON,
  handleDownloadJSON,
}) {
  const labels = lang === "VI" ? {
    title: "Chưa thể kết luận",
    message: "Không đủ đồng thuận do tác tử kỹ thuật bị lỗi hoặc kết quả mâu thuẫn. Kết quả gợi ý bên dưới chỉ nên dùng để tham khảo.",
    originalImage: "Ảnh gốc",
    errorStatus: "Trạng thái",
    errorDetail: "Chi tiết lỗi",
    advDebug: "Gỡ lỗi chuyên sâu",
    jsonTitle: "Dữ liệu JSON",
    copy: "Sao chép",
    download: "Tải xuống",
    backWorkspace: "Trở lại Không Gian Làm Việc",
    scanAnother: "Quét Tờ Tiền Khác"
  } : {
    title: "No reliable conclusion",
    message: "There is not enough consensus because a technical agent failed or the results conflict. Any suggested result below should be treated as a reference only.",
    originalImage: "Original image",
    errorStatus: "Status",
    errorDetail: "Error details",
    advDebug: "Advanced Debug",
    jsonTitle: "JSON Data",
    copy: "Copy",
    download: "Download",
    backWorkspace: "Go back to Workspace",
    scanAnother: "Scan Another Banknote"
  };

  const status = normalizeStatusLabel(
    currentItem?.status || currentItem?.raw_backend?.status || currentItem?.consensus?.status,
    lang
  );

  const suggestedResult = getSuggestedResultFromItem(currentItem);
  const suggestedResultText = formatSuggestedResultText(suggestedResult, lang);
  const rawErrorMsg =
    currentItem?.error_message ||
    currentItem?.raw_backend?.error_message ||
    currentItem?.consensus?.referee_view ||
    currentItem?.consensus?.quan_diem_trong_tai;
  const errorMsg = normalizeInvalidConclusionDetail(
    rawErrorMsg,
    currentItem,
    suggestedResult,
    lang,
  );

  return (
    <div className="page-inner py-6">
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-12 font-sans sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-rose-300 bg-slate-950 text-white shadow-xl">
          <div className="flex flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1 text-xs font-black uppercase text-rose-200">
                {status}
              </span>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl text-rose-400">
                {labels.title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                {labels.message}
              </p>
              {suggestedResultText && (
                <div className="mt-4 rounded-lg border border-sky-700 bg-sky-950/60 p-4 text-sm text-sky-100">
                  <p>{suggestedResultText}</p>
                </div>
              )}
              {errorMsg && (
                <div className="mt-4 p-4 rounded-lg bg-rose-950 border border-rose-800 text-rose-200 text-sm">
                  <p className="font-bold mb-1">{labels.errorDetail}:</p>
                  <p>{errorMsg}</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <button
                onClick={onScanAnother}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-black text-white transition hover:bg-rose-500"
              >
                <RotateCcw className="h-4 w-4" />
                {labels.scanAnother}
              </button>
              <button
                onClick={onScanAnother}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 font-black text-white transition hover:bg-slate-700 hover:border-slate-600"
              >
                {labels.backWorkspace}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm font-black text-slate-900 dark:text-white">
            {labels.originalImage}
          </p>
          {previewImage ? (
            <img
              src={previewImage}
              alt={labels.originalImage}
              className="max-h-[460px] w-full rounded-lg bg-slate-100 object-contain dark:bg-slate-950"
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700">
              {lang === "VI" ? "Không có ảnh" : "No image"}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setShowRawLog(!showRawLog)}
            className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 dark:text-white">{labels.advDebug}</h2>
              </div>
            </div>
            {showRawLog ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />}
          </button>

          {showRawLog && (
            <div className="space-y-5 border-t border-slate-200 p-5 dark:border-slate-800">
              <div>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-black uppercase text-slate-500">{labels.jsonTitle}</p>
                  <div className="flex gap-2">
                    <button onClick={handleCopyJSON} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Copy className="h-3.5 w-3.5" />
                      {labels.copy}
                    </button>
                    <button onClick={handleDownloadJSON} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500">
                      <Download className="h-3.5 w-3.5" />
                      {labels.download}
                    </button>
                  </div>
                </div>
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-emerald-700 dark:border-slate-800 dark:bg-slate-950 dark:text-emerald-300">
                  {JSON.stringify(currentItem, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NoBanknoteResult({
  item,
  rejectedObjects,
  previewImage,
  t,
  lang,
  onScanAnother,
}) {
  const dynamicReason = inferNoBanknoteReason(rejectedObjects);
  const subtitle = lang === "VI" ? dynamicReason.viMessage : dynamicReason.enMessage;

  const labels =
    lang === "VI"
      ? {
          title: "Không phát hiện tiền giấy hợp lệ",
          rejectionTitle: "Vì sao hệ thống loại ảnh này?",
          documentScore: "Điểm giống tài liệu",
          banknoteScore: "Điểm giống tiền giấy",
          suspiciousRegion: "Vùng nghi vấn",
          agentEligible: "Trạng thái: Không gửi sang AI Agent",
          rejectionReason: "Lý do quyết định",
          negativeEvidence: "Bằng chứng loại",
          noEvidence: "Backend không trả về chi tiết vùng bị loại.",
          original: "Ảnh gốc",
          defaultReason: genericNoBanknoteReason.viMessage,
          documentReason: "Điểm giống tài liệu cao hoặc bằng chứng cho thấy vùng này giống tài liệu, sơ đồ hay ảnh chụp màn hình hơn tiền giấy. Hệ thống không gửi vùng này sang AI Agent để tránh nhận diện sai và không tốn token.",
        }
      : {
          title: "No valid banknote detected",
          rejectionTitle: "Why was this image rejected?",
          documentScore: "Document score",
          banknoteScore: "Banknote score",
          suspiciousRegion: "Suspicious region",
          agentEligible: "Status: Not sent to AI agents",
          rejectionReason: "Decision reason",
          negativeEvidence: "Negative evidence",
          noEvidence: "The backend did not return rejected-region details.",
          original: "Original image",
          defaultReason: genericNoBanknoteReason.enMessage,
          documentReason: "The document score is high or the evidence indicates that this region resembles a document, diagram, or screenshot more than a banknote. It was not sent to AI agents to avoid false recognition and token usage.",
        };

  return (
    <div className="page-inner py-6">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 font-sans sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-rose-300 bg-slate-950 text-white shadow-xl">
          <div className="flex flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1 text-xs font-black uppercase text-rose-200">
                no_banknote_detected
              </span>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl text-rose-400">
                {labels.title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                {subtitle}
              </p>
            </div>
            <button
              onClick={onScanAnother}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 font-black text-white transition hover:bg-slate-700 hover:border-slate-600"
            >
              <RotateCcw className="h-4 w-4" />
              {t.backWorkspace || "Back"}
            </button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-3 text-sm font-black text-slate-900 dark:text-white">
              {labels.original}
            </p>
            {previewImage ? (
              <img
                src={previewImage}
                alt={labels.original}
                className="max-h-[460px] w-full rounded-lg bg-slate-100 object-contain dark:bg-slate-950"
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700">
                {lang === "VI" ? "Không có ảnh" : "No image"}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm dark:border-rose-500/30 dark:bg-slate-900">
            <div className="border-b border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-500/20 dark:bg-rose-500/10">
              <h2 className="text-xl font-black text-rose-950 dark:text-rose-100 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                {labels.rejectionTitle}
              </h2>
            </div>

            <div className="space-y-4 p-5">
              {rejectedObjects && rejectedObjects.length > 0 ? (
                rejectedObjects.map((obj, index) => {
                  const checker = obj?.crop_checker || {};
                  const negativeEvidence = obj?.negative_evidence || checker?.negative_evidence || [];
                  const bbox = Array.isArray(obj?.bbox) ? obj.bbox : null;
                  const rejectionExplanation = isDocumentLikeRejectedObject(obj)
                    ? labels.documentReason
                    : labels.defaultReason;

                  return (
                    <article
                      key={index}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-slate-900 dark:text-white">
                          {labels.suspiciousRegion} #{index + 1}
                        </p>
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                          {labels.agentEligible}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <InfoRow
                          label={labels.documentScore}
                          value={formatScore(obj?.document_score ?? checker?.document_score)}
                        />
                        <InfoRow
                          label={labels.banknoteScore}
                          value={formatScore(obj?.banknote_score ?? checker?.banknote_score)}
                        />
                        {bbox && (
                          <InfoRow
                            label="BBox"
                            value={`[${bbox.join(", ")}]`}
                          />
                        )}
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-black uppercase text-slate-400">
                          {labels.rejectionReason}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                          {rejectionExplanation}
                        </p>
                      </div>

                      {negativeEvidence.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-black uppercase text-slate-400">
                            {labels.negativeEvidence}
                          </p>
                          <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                            {negativeEvidence.map((evidence, evidenceIndex) => (
                              <li key={evidenceIndex} className="flex gap-2">
                                <span className="text-rose-500 font-bold">•</span>
                                <span>{translateRejectEvidence(evidence, lang)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {labels.noEvidence}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
