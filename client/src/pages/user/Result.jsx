import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import { useCurrencyStore } from "../../store/currencyStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";
import { useAuthStore } from "../../store/authStore";
import { getRecognitionTaskLightStatus, getRecognitionResult } from "../../services/recognitionService";
import {
  formatDenominationLabel,
  formatRecordedBoolean,
  getNormalizedAg3Decision,
  getNormalizedConsensus,
  normalizeUserResultResponse,
} from "../../utils/userResultAdapter";
import {
  buildRecognitionRestoreKey,
  formatCountryDisplay,
  formatSuggestedResultText,
  getAg3FormatterLabel,
  getAg3ProviderLabel,
  getCropPreviewSource,
  getPublicAgentExplanation,
  inferMoneyCurrency,
  normalizeConsensusAgentKey,
  parseMoneyAmount,
  shouldRefetchRecognitionResult,
} from "../../utils/agentVote";

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  History,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  TrendingUp,
  Hash,
  Calendar,
  Image as ImageIcon,
  ExternalLink,
  Maximize2,
  X,
  Brain,
  Gavel,
  ScanLine,
  ShieldCheck,
  Search,
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
  if (!Number.isFinite(n)) return "Not recorded";
  return n <= 1 ? n.toFixed(3) : n.toFixed(1);
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toBooleanOrNull = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return null;
};

const formatConsensusScoreText = (matched, total, fallback = "Not recorded", pattern = null) => {
  const explicitPattern = String(pattern || "").trim();
  if (explicitPattern) return explicitPattern;
  if (matched === null || matched === undefined || total === null || total === undefined) {
    return fallback;
  }
  return `${matched}/${total}`;
};

const getStrictConsensusMatchedCount = (consensusState, ag3Decision, fallback = null) => {
  return toFiniteOrNull(consensusState?.matchedAgents) ?? toFiniteOrNull(fallback);
};

const getAg3DecisionMessage = (decision, lang) => {
  const isVi = lang === "VI";

  if (decision?.technicalError) {
    if ((decision?.timeoutStage === "upload" || decision?.technicalStage === "upload") && decision?.searchPerformed === false) {
      return isVi
        ? "Quá trình xác minh Google Lens không thể bắt đầu vì không thể tải lên ảnh cắt."
        : "Google Lens verification could not start because the crop image upload failed.";
    }
    return isVi
      ? "Nhánh Google Lens không thể chạy vì nhà cung cấp SerpAPI trả về lỗi."
      : "Google Lens verification could not run because the SerpAPI provider returned an error.";
  }

  if (decision?.searchPerformed === true && decision?.rawCount === 0) {
    return isVi
      ? "Google Lens không tìm thấy kết quả nào (0 results)."
      : "Google Lens found no results.";
  }

  if (decision?.voteCreated && decision?.counted && decision?.matched) {
    return isVi
      ? `Google Lens đã tạo một phiếu từ mức đồng thuận ${decision.agreementPattern || "3/5"} và phiếu này được tính vào kết quả cuối.`
      : `Google Lens created one vote from ${decision.agreementPattern || "3/5"} agreement and it was counted in the final result.`;
  }
  if (decision?.voteCreated && decision?.counted) {
    return isVi
      ? "Google Lens đã tạo một phiếu hợp lệ, nhưng phiếu không thuộc nhóm đồng thuận đa số."
      : "Google Lens created a valid vote, but it was not part of the final majority consensus group.";
  }
  if (decision?.voteCreated) {
    return isVi
      ? "Google Lens đã tạo một phiếu hợp lệ, nhưng phiếu không được tính vào đồng thuận do không đủ điều kiện."
      : "Google Lens created a valid vote, but it was not counted in the consensus.";
  }

  const totalSources = Math.max(
    decision?.selectedSourceCount || 0,
    decision?.candidateSourceCount || 0,
  );

  if (totalSources >= 3) {
    return isVi
      ? `AG3 đã xem xét ${totalSources} nguồn độc lập, nhưng chỉ có ${decision?.majorityAchieved || 0} nguồn cùng xác nhận kết quả chính xác. Cần ít nhất 3 nguồn khớp nhau.`
      : `AG3 reviewed ${totalSources} independent sources, but only ${decision?.majorityAchieved || 0} supported the same exact identity. At least 3 matching sources are required.`;
  }

  if (totalSources === 0) {
    return isVi
      ? "Google Lens không tìm thấy nguồn độc lập phù hợp nào."
      : "Google Lens found no usable independent sources.";
  }

  return isVi
    ? `Google Lens chỉ tìm được ${totalSources} nguồn độc lập phù hợp; cần tối thiểu 3 nguồn để AG3 có thể biểu quyết.`
    : `Google Lens found only ${totalSources} independent usable source${totalSources === 1 ? "" : "s"}; at least 3 are required before AG3 can vote.`;
};

const hasAdminResultAccess = (user) => {
  const role = String(
    user?.role ||
      user?.user_role ||
      user?.account_type ||
      user?.user?.role ||
      "",
  ).toLowerCase();

  return Boolean(
    user?.is_admin ||
      user?.isAdmin ||
      user?.user?.is_admin ||
      ["admin", "administrator", "super_admin", "superadmin"].includes(role),
  );
};

const getPublicBilling = (item) => {
  const creditsCharged = firstDefined(
    item?.app_tokens_charged,
    item?.credits_charged,
    item?.billing?.app_tokens_charged,
    item?.billing?.credits_charged,
    item?.billing?.charged_tokens,
    item?.result?.credits_charged,
    item?.result?.billing?.app_tokens_charged,
    item?.result?.billing?.credits_charged,
  );
  const billingMode = firstDefined(
    item?.billing?.billing_mode,
    item?.billing?.mode,
    item?.billing_mode,
    item?.result?.billing?.billing_mode,
    item?.result?.billing?.mode,
    item?.result?.billing_mode,
  );
  const skipped = firstDefined(
    item?.billing?.skipped,
    item?.result?.billing?.skipped,
  );

  const normalizedCredits = toFiniteOrNull(creditsCharged);
  const normalizedSkipped = toBooleanOrNull(skipped);
  const normalizedCharged = toBooleanOrNull(
    firstDefined(item?.billing?.charged, item?.result?.billing?.charged),
  );
  const hasBilling =
    normalizedCredits !== null ||
    billingMode !== undefined ||
    normalizedSkipped !== null ||
    normalizedCharged !== null;

  if (!hasBilling) return null;

  return {
    app_tokens_charged: normalizedCredits,
    credits_charged: normalizedCredits,
    billing_mode: billingMode,
    mode: billingMode,
    charged: firstDefined(
      normalizedCharged,
      normalizedCredits !== null ? normalizedCredits > 0 : null,
    ),
    skipped: firstDefined(
      normalizedSkipped,
      normalizedCredits !== null ? normalizedCredits === 0 : null,
    ),
  };
};

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
    item?.consensus?.display_consensus_pattern,
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

const markdownSymbolsToStrip = ["🤖", "🧠", "👁️", "⚖️", "✅", "🔬", "🔄", "📦", "🧾"];

const stripMarkdownSymbols = (text) => {
  if (!text) return "";
  let cleaned = String(text);
  markdownSymbolsToStrip.forEach((symbol) => {
    cleaned = cleaned.replaceAll(symbol, "");
  });
  return cleaned.replace(/`/g, "").trim();
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

const getConsensusStatusLabel = (consensus, lang) => {
  const status = consensus?.status;
  const matched = toFiniteOrNull(consensus?.matched_agents);

  // Multi-object partial: hiển thị X/Y Completed
  if (consensus?.partial) {
    const completed = consensus?.completed_objects ?? 0;
    const total = consensus?.total_objects ?? matched ?? (lang === "VI" ? "Chưa ghi nhận" : "Not recorded");
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
  if (matched === null) return lang === "VI" ? "Chưa ghi nhận" : "Not recorded";
  if (matched === 2)
    return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
  if (status) return status;

  return lang === "VI" ? "Đạt đồng thuận" : "Consensus reached";
};

const getConsensusBadgeClass = (consensus) => {
  const label = String(consensus?.status || "").toLowerCase();
  const matched = toFiniteOrNull(consensus?.matched_agents);

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
    (matched !== null && matched >= 2) ||
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

  return found?.data || found?.result || found || null;
};


const getAgentPayload = (agentItem) => {
  if (!agentItem) return {};
  return agentItem?.data || agentItem?.result || agentItem;
};

// --- PHASE 1: Helper Functions ---
const safeText = (text, fallback = "N/A") => {
  if (text === null || text === undefined || text === "") return fallback;
  return String(text);
};

const formatCountry = (country, lang = "EN") => {
  return formatCountryDisplay(country, lang);
};

const formatCurrency = (currency) => {
  const c = safeText(currency, "Không xác định").trim();
  if (c === "Multiple" || c === "N/A" || c === "Không xác định" || c.toLowerCase() === "null") return "Không xác định";
  return c.toUpperCase();
};

const formatDenomination = (denom, currency = null, fallback = "Not recorded") => {
  const d = formatDenominationLabel(denom, currency, fallback).trim();
  if (d === fallback || d.includes("banknotes") || d.includes("tờ tiền")) return d;

  const inferredCurrency = inferMoneyCurrency(d);
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
    (!inferredCurrency || inferredCurrency === "VND") &&
    standardVndDenominations.has(malformedCandidate);
  const amount = shouldRepairMalformedVnd
    ? malformedCandidate
    : parseMoneyAmount(d);

  if (amount !== null) {
    const formattedAmount = amount.toLocaleString("en-US");
    return inferredCurrency ? `${formattedAmount} ${inferredCurrency}` : `${formattedAmount}`;
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
  const reason = String(payload.reason || vote?.reason || "").trim().toLowerCase();
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
    vote?.hasEvidence;

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

const getPublicVoteBoolean = (...values) => {
  for (const value of values) {
    if (value === true || value === false) return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "matched", "agreed", "counted"].includes(normalized)) return true;
      if (["false", "no", "0", "different", "not_counted", "not counted"].includes(normalized)) return false;
    }
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

const normalizeAgentVote = (
  agentItem,
  fallbackAgentKey = null,
  validVoteKeys = null,
  finalDecision = null,
  consensusPattern = null,
) => {
  const payload = getAgentPayload(agentItem);
  const isErr = isTechnicalError(payload);
  const agentDenomination = getAgentDenomination(payload);

  const rawStatus = String(payload?.status || agentItem?.status || "").toLowerCase();
  const isDisabled = rawStatus === "disabled";
  const evidenceList = payload?.evidence || agentItem?.evidence;
  const hasEvidence = Array.isArray(evidenceList) && evidenceList.length > 0;
  const agentKey = getAgentConsensusKey(agentItem, fallbackAgentKey);
  const denom = agentDenomination !== "N/A" ? agentDenomination : "N/A";

  const rawCurrency =
    payload?.ma_tien_te || payload?.currency_code || payload?.currency || agentItem?.currency || null;
  const displayCurrency = inferMoneyCurrency(denom, rawCurrency) || rawCurrency;
  const hasResult = Boolean(
    denom && denom !== "N/A" && !denom.toLowerCase().includes("không"),
  );

  const explicitMatched = getPublicVoteBoolean(
    agentItem?.matched,
    agentItem?.agreed,
    agentItem?.agreed_with_final,
    agentItem?.matches_final,
    payload?.matched,
    payload?.agreed,
    payload?.agreed_with_final,
    payload?.matches_final,
  );
  const explicitCounted = getPublicVoteBoolean(
    agentItem?.counting,
    agentItem?.counted,
    agentItem?.counted_in_consensus,
    agentItem?.counted_by_backend,
    payload?.counting,
    payload?.counted,
    payload?.counted_in_consensus,
    payload?.counted_by_backend,
  );

  let finalMatched = explicitMatched;
  let finalCounted = explicitCounted;
  const ag3Trace = payload?.ag3_verification_summary || payload?.promotion_trace || {};
  const hasStructuredAg3Fields = agentKey === "visual_search" && [
    payload?.vote_eligible,
    payload?.ag3_vote_eligible,
    payload?.vote_created,
    payload?.valid_vote,
    payload?.counted_in_consensus,
    payload?.not_counted_in_consensus,
    payload?.raw_lens_result_count,
    ag3Trace?.vote_eligible,
    ag3Trace?.ag3_vote_eligible,
    ag3Trace?.vote_created,
    ag3Trace?.valid_vote,
    ag3Trace?.counted_in_consensus,
    ag3Trace?.not_counted_in_consensus,
    ag3Trace?.raw_lens_result_count,
  ].some((value) => value !== undefined && value !== null);

  if (hasStructuredAg3Fields) {
    const voteEligible = Boolean(getPublicVoteBoolean(
      payload?.vote_eligible,
      payload?.ag3_vote_eligible,
      agentItem?.vote_eligible,
      agentItem?.ag3_vote_eligible,
      payload?.valid_vote,
      agentItem?.valid_vote,
      ag3Trace?.vote_eligible,
      ag3Trace?.ag3_vote_eligible,
      ag3Trace?.valid_vote,
    ));
    const countedSignal = getPublicVoteBoolean(
      payload?.counted_in_consensus,
      agentItem?.counted_in_consensus,
      payload?.counted_by_backend,
      agentItem?.counted_by_backend,
      payload?.counted,
      agentItem?.counted,
      payload?.not_counted_in_consensus === false ? true : null,
      agentItem?.not_counted_in_consensus === false ? true : null,
      payload?.not_counted_in_consensus === true ? false : null,
      agentItem?.not_counted_in_consensus === true ? false : null,
      ag3Trace?.counted_in_consensus,
      ag3Trace?.counted_by_backend,
      ag3Trace?.counted,
      ag3Trace?.not_counted_in_consensus === false ? true : null,
      ag3Trace?.not_counted_in_consensus === true ? false : null,
    );
    const matchedSignal = getPublicVoteBoolean(
      payload?.matched,
      agentItem?.matched,
      payload?.agreed_with_final,
      agentItem?.agreed_with_final,
      payload?.matches_final,
      agentItem?.matches_final,
      ag3Trace?.matched,
      ag3Trace?.agreed_with_final,
      ag3Trace?.matches_final,
    );
    finalCounted = Boolean(voteEligible && countedSignal === true);
    finalMatched = Boolean(finalCounted && matchedSignal === true);
  }

  if (!hasStructuredAg3Fields && finalMatched === null) {
    if (validVoteKeys && agentKey && validVoteKeys.has(agentKey)) {
      finalMatched = true;
    } else if (finalDecision && finalDecision.denomination && denom && denom !== "N/A") {
      const voteAmount = parseAmountFromDenomination(denom);
      const decisionAmount = parseAmountFromDenomination(finalDecision.denomination);
      const voteCurr = displayCurrency || inferMoneyCurrency(denom);
      const decisionCurr = finalDecision.currency || inferMoneyCurrency(finalDecision.denomination);
      if (
        voteAmount > 0 &&
        decisionAmount > 0 &&
        voteAmount === decisionAmount &&
        voteCurr &&
        decisionCurr &&
        voteCurr === decisionCurr
      ) {
        finalMatched = true;
      }
    }
    if (
      finalMatched === null &&
      consensusPattern &&
      (String(consensusPattern).includes("3/3") || String(consensusPattern) === "3/3") &&
      !isErr &&
      !isDisabled &&
      rawStatus !== "failed"
    ) {
      finalMatched = true;
    }
  }

  if (!hasStructuredAg3Fields && finalCounted === null) {
    if (finalMatched === true || (validVoteKeys && agentKey && validVoteKeys.has(agentKey))) {
      finalCounted = true;
    } else if (!isErr && !isDisabled && rawStatus !== "failed" && hasResult) {
      finalCounted = true;
    } else {
      finalCounted = false;
    }
  }

  const countedByBackend = finalCounted === true;
  const nonVoting =
    finalCounted === false ||
    (finalMatched !== true && (isNonVotingAgent(payload) || !hasResult));

  const voteStatus =
    finalMatched === true
      ? "matched"
      : finalMatched === false && countedByBackend
        ? "different"
        : finalCounted === false || isErr || isDisabled || rawStatus === "failed"
          ? "not_counted"
          : "not_recorded";

  return {
    isError: isErr,
    isDisabled,
    isNonVoting: nonVoting,
    hasResult,
    hasEvidence,
    agentKey,
    matched: finalMatched,
    counted: finalCounted,
    countedByBackend,
    voteStatus,
    denom: formatDenomination(denom, displayCurrency),
    country: formatCountry(getAgentCountry(payload)),
    currency: formatCurrency(displayCurrency),
    reasoning: stripMarkdownSymbols(getAgentReasoning(payload)),
    public_summary: payload?.public_summary || agentItem?.public_summary || null,
    public_explanation: payload?.public_explanation || agentItem?.public_explanation || null,
    explanation: payload?.explanation || agentItem?.explanation || null,
    reason: payload?.reason || agentItem?.reason || null,
    confidence: formatConfidence(payload?.confidence || payload?.do_tin_cay || agentItem?.confidence),
    payload: payload,
    provider: agentItem?.provider || payload?.provider || null,
    formatter: agentItem?.formatter || payload?.formatter || null,
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

      const normalizedSource = {
        title: safeText(item.title || item.name || item.text, domain || "Source"),
        snippet: item.snippet || item.description || item.matchedText || item.matched_text || "",
        url,
        domain,
        raw_rank: item.raw_rank ?? item.rank ?? item.position ?? item.selected_rank ?? null,
        rank: item.rank ?? item.raw_rank ?? item.position ?? item.selected_rank ?? null,
        confidence: item.confidence ?? null,
        ranker_score: item.ranker_score ?? item.raw_lens_score ?? item.score ?? null,
        raw_lens_score: item.raw_lens_score ?? item.ranker_score ?? item.score ?? null,
        source_trust_level: item.source_trust_level ?? item.source_class ?? "UNKNOWN",
        source_class: item.source_class ?? item.source_trust_level ?? "UNKNOWN",
        canonical_domain: item.canonical_domain || domain || "",
        canonical_url: item.canonical_url || url || "",
        independent_domain: item.independent_domain ?? item.is_independent ?? item.domain_first ?? null,
        qualified_source: item.qualified_source ?? null,
        eligible: item.eligible ?? null,
        page_fetch_status: item.page_fetch_status || item.fetch_status || item.page_text_checked || "",
        fetch_status: item.fetch_status || item.page_fetch_status || item.page_text_checked || "",
        object_type: item.object_type || item.detected_object_type || "",
        complete_identity: item.complete_identity ?? item.identity_complete ?? null,
        evidence_disposition: item.final_disposition || item.evidence_disposition || null,
        evidence_reason: item.final_reason || item.evidence_reason || item.excluded_reason || null,
        final_disposition: item.final_disposition || item.evidence_disposition || null,
        final_reason: item.final_reason || item.evidence_reason || item.excluded_reason || null,
        badge: item.badge || null,
        detected_amounts: item.detected_amounts || item.extracted_denomination || [],
        detected_currency: item.detected_currency || item.extracted_currency || "",
        detected_country: item.detected_country || item.extracted_country || "",
        extracted_denomination: item.extracted_denomination || item.detected_amounts || [],
        extracted_currency: item.extracted_currency || item.detected_currency || "",
        extracted_country: item.extracted_country || item.detected_country || "",
        web_page_text_excerpt: item.web_page_text_excerpt || item.page_text_excerpt || "",
        selected_for_ag3_internal_vote: item.selected_for_ag3_internal_vote ?? item.selected_for_ag3_vote ?? item.selected ?? false,
        selected_for_ag3_vote: item.selected_for_ag3_vote ?? item.selected_for_ag3_internal_vote ?? item.selected ?? false,
        selected_rank: item.selected_rank ?? null,
      };

      if (
        normalizedSource.web_page_text_excerpt &&
        ["", "not_attempted", "skipped", "none", "null"].includes(
          String(normalizedSource.page_fetch_status || normalizedSource.fetch_status || "").toLowerCase(),
        )
      ) {
        normalizedSource.page_fetch_status = "success";
        normalizedSource.fetch_status = "success";
      }

      return normalizedSource;
    });

  return normalized.filter(
    (item, index, items) =>
      index === items.findIndex(
        (candidate) =>
          `${candidate.url}|${candidate.title}` === `${item.url}|${item.title}`,
      ),
  );
};

const normalizeDisplayTextList = (value) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map((item) => {
      if (item && typeof item === "object") {
        return String(
          item.text ||
            item.label ||
            item.value ||
            "",
        ).trim();
      }
      return String(item || "").trim();
    })
    .filter(Boolean);

const formatRecordedScore = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not recorded";
  return formatScore(value);
};

const normalizeCropEvidence = (payload) => {
  if (!payload) return null;
  const quality = payload.crop_quality || payload.cropQuality || null;
  const checker =
    quality ||
    payload.crop_checker ||
    payload.cropChecker ||
    payload.crop_validation ||
    payload.cropValidation ||
    payload;
  const metrics = quality ? null : checker.metrics || checker.technical_metrics || null;
  const fallback = firstDefined(quality?.fallback, checker.fallback);
  const action =
    checker.action ||
    checker.decision ||
    payload.ag0_action ||
    (fallback === true ? "REVIEW" : checker.confidence ? "VALID" : "UNKNOWN");
  const agentEligible = getPublicVoteBoolean(
    checker.agent_eligible,
    checker.eligible_for_agents,
    payload.agent_eligible,
  );

  if (
    action === "UNKNOWN" &&
    !payload.selected_box_reason &&
    !quality?.source &&
    !checker.reason &&
    !metrics
  ) {
    return null;
  }

  return {
    action,
    selectedReason:
      payload.selected_box_reason ||
      payload.selectedBoxReason ||
      checker.selected_box_reason ||
      quality?.source ||
      "",
    reason: checker.reason || checker.message || "",
    rejectedBoxes: [],
    trace: null,
    confidence: firstDefined(
      quality?.confidence,
      checker.confidence,
      payload.crop_confidence,
      payload.confidence,
    ),
    banknote_score: firstDefined(
      checker.banknote_score,
      checker.banknote_like_score,
      payload.banknote_score,
    ),
    document_score: firstDefined(
      checker.document_score,
      checker.document_like_score,
      payload.document_score,
    ),
    agent_eligible: agentEligible,
    source: firstDefined(
      checker.source,
      quality?.source,
      payload.crop_source,
      payload.source,
    ),
    bbox: firstDefined(payload.bbox, checker.bbox),
    metrics: metrics && typeof metrics === "object" ? metrics : null,
  };
};

const normalizeConsensusTrace = (...payloads) => {
  for (const payload of payloads) {
    if (!payload) continue;
    if (Array.isArray(payload)) return payload;
    const trace =
      payload.public_timeline ||
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
    "2/3": lang === "VI" ? "Đạt đồng thuận đa số" : "Reached majority consensus",
    "2/2": lang === "VI" ? "Đồng thuận 2/2 phiếu hợp lệ" : "2/2 valid votes agreed",
    "1-valid-only": lang === "VI" ? "Chỉ có 1 kết quả hợp lệ" : "Only one valid result",
    transient_error: lang === "VI" ? "Lỗi dịch vụ tạm thời" : "Temporary service error",
    zero_evidence: lang === "VI" ? "Không có bằng chứng hợp lệ" : "No valid evidence",
    not_banknote_or_unclear: lang === "VI" ? "Ảnh chưa rõ hoặc không phải tiền giấy" : "Unclear image or not a banknote",
    conflict: lang === "VI" ? "Các AI đưa ra kết quả khác nhau" : "AI agents disagreed",
    "1-1-1": lang === "VI" ? "Ba phiếu khác nhau" : "Three different votes",
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

  const publicResult = normalizeUserResultResponse(rawResult, {
    previewUrl: session?.previewUrl,
    taskId: session?.taskId,
  });
  if (publicResult?.publicContract) {
    return publicResult;
  }

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
    const formattedAgentVotes =
      rawResult.agent_votes ||
      rawResult.result?.agent_votes ||
      rawResult.agent_results ||
      rawResult.result?.agent_results ||
      [];
    const publicBilling = getPublicBilling(rawResult);
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
      agent_votes: formattedAgentVotes,
      billing: publicBilling,
      credits_charged: publicBilling?.credits_charged ?? null,
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
    rawResult.agent_votes ||
    rawResult.result?.agent_votes ||
    rawResult.agent_results ||
    rawResult.result?.agent_results ||
    [];

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
    const firstObjectAgentResults =
      firstObject.agent_votes ||
      firstObject.agent_results ||
      agentResults ||
      [];
    const publicBilling = getPublicBilling(rawResult);

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
      agent_votes: agentResults,
      agents: {
        ml_dl: getAgentDataByName(firstObjectAgentResults, [
          "openai",
          "agent_1",
          "gpt",
          "ml_dl",
          "yolo",
        ]),
        llm_api: getAgentDataByName(firstObjectAgentResults, [
          "llm",
          "gemini",
          "agent_2",
          "llm_api",
        ]),
        visual_search: getAgentDataByName(firstObjectAgentResults, [
          "lens",
          "visual",
          "agent_3",
          "visual_search",
        ]),
      },
      consensus: {
        method: final.method || (isActuallyMulti ? "multi_object_pipeline" : "majority_vote"),
        matched_agents: toFiniteOrNull(final.matched_agents),
        total_agents: toFiniteOrNull(final.total_agents),
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
      crop_quality:
        firstObject.crop_quality || rawResult.crop_quality || null,
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
      credits_charged: publicBilling?.credits_charged ?? null,
      billing: publicBilling,
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

  let matchedAgents = null;
  if (final.matched_agents !== undefined && final.matched_agents !== null) {
    matchedAgents = Number(final.matched_agents);
  } else if (final.so_luong_dong_thuan !== undefined && final.so_luong_dong_thuan !== null) {
    matchedAgents = Number(final.so_luong_dong_thuan);
  }
  const totalAgents = toFiniteOrNull(firstDefined(final.total_agents, final.agent_count, agentResults.length || null));
  const consensusPattern = firstDefined(
    final.pattern,
    final.consensus_pattern,
    matchedAgents !== null && totalAgents !== null ? `${matchedAgents}/${totalAgents}` : null,
  );

  const status =
    final.status || rawResult.status || rawResult.result?.status || "Completed";
  const finalConfidence = firstDefined(
    final.confidence,
    final.do_tin_cay,
    rawResult.confidence,
    rawResult.result?.confidence,
  );

  const mlData = getAgentDataByName(agentResults, [
    "openai",
    "gpt",
    "agent_1",
    "ml_dl",
    "yolo",
  ]);
  const llmData = getAgentDataByName(agentResults, [
    "llm",
    "gemini",
    "agent_2",
    "llm_api",
  ]);
  const lensData = getAgentDataByName(agentResults, [
    "lens",
    "visual",
    "agent_3",
    "visual_search",
  ]);
  const publicBilling = getPublicBilling(rawResult);

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
    agent_votes: agentResults,
    consensus: {
      method: final.method || "majority_vote",
      matched_agents: toFiniteOrNull(matchedAgents),
      total_agents: totalAgents,
      pattern: consensusPattern,
      status,
      consensus_pattern: consensusPattern,
      consensus_reason: final.consensus_reason || null,
      referee_view:
        final.quan_diem_trong_tai ||
        final.referee_view ||
        final.reasoning ||
        description,
      valid_votes: final.valid_votes || [],
      suggested_result_from_valid_agent:
        final.suggested_result_from_valid_agent || null,
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
    crop_quality:
      rawResult.crop_quality || rawResult.result?.crop_quality || null,
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
    credits_charged: publicBilling?.credits_charged ?? null,
    billing: publicBilling,
    raw_backend: rawResult,
  };
};

const buildFeedbackDraft = (item) => {
  if (!item) return {};

  const data = item.data || item.summary || {};
  const denomination = formatDenominationLabel(data.denomination, data.currency, "");
  const country = data.country || "";

  return {
    related_result_id:
      item.feedback?.related_result_id ||
      item.result_id ||
      item.id ||
      "",
    actual_result:
      denomination && country
        ? `${denomination} - ${country}`
        : denomination || country || "",
    country,
    confidence: firstDefined(data.confidence, item.confidence, null),
    image_url:
      item.image_url ||
      item.input_image_url ||
      item.uploaded_image_url ||
      data.image_url ||
      "",
    scanSummary: {
      id: item.result_id || item.id || "",
      status: item.status || item.consensus?.status || "",
      data: {
        denomination,
        country,
        currency: data.currency || "",
        confidence: firstDefined(data.confidence, item.confidence, null),
      },
      consensus: item.consensus || {},
      agents: item.agents || {},
      image_url:
        item.image_url ||
        item.input_image_url ||
        item.uploaded_image_url ||
        data.image_url ||
        "",
    },
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
  const { user } = useAuthStore();

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
      adminDiagnostics: "Admin Diagnostics",
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
      readFull: "View full explanation",
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
      whyChosen: "Why did the system choose this result?",
      consensusTimeline: "Consensus Timeline",
      consensusMajority: "Consensus reached",
      consensusMajorityDetail: "Consensus reached reached. One vote returned a different result.",
      consensusValidDetail: "Consensus of 2 valid votes. One analysis branch did not qualify to vote.",
      consensusFullDetail: "Strong consensus reached: all 3 votes matched.",
      showMore: "Show more",
      showFewer: "Show fewer",
      notRecorded: "Not recorded",
      billingNotRecorded: "Billing was not recorded for this result.",
      consensusNotRecorded: "Consensus details were not recorded.",
    },
    VI: {
      title: "Báo Cáo Phân Tích",
      subtitle:
        "Xem lại quyết định cuối cùng, kết quả từ các tác tử và dữ liệu JSON.",
      viewHistory: "Xem lịch sử",
      adminDiagnostics: "Chẩn đoán Admin",
      scanAnother: "Quét ảnh khác",
      feedback: "Góp ý / Báo lỗi",
      uploadTitle: "Ảnh đã tải lên",
      finalDecision: "Quyết định cuối cùng",
      lblCountry: "Quốc gia",
      lblMaterial: "Chất liệu",
      lblCurrency: "Tiền tệ",
      lblConsensus: "Đồng thuận",
      lblReasoning: "Lập luận",
      agents: "tác tử",
      referee: "Kết luận trọng tài",
      lblDenomination: "Mệnh giá",
      lblOrigin: "Nguồn gốc",
      exchangeDesc: "Giá trị quy đổi dựa trên mệnh giá vừa quét.",
      fullConverter: "Chuyển đổi chi tiết",
      aggDecision: "Quyết định tổng hợp",
      aggDesc:
        "Hệ thống tổng hợp đối chiếu kết quả từ các tác tử và chọn ra kết quả đa số.",
      agentCompare: "So sánh các tác tử",
      fullLogTitle: "Nhật ký tranh biện",
      fullLogDesc: "Lý luận chi tiết được thu gọn để báo cáo dễ đọc hơn.",
      hideLog: "Ẩn nhật ký",
      viewLog: "Xem toàn bộ nhật ký",
      continueTitle: "Tiếp tục",
      continueDesc:
        "Bắt đầu quét một ảnh khác hoặc xem lại kết quả trong lịch sử.",
      btnScanAnother: "Quét tờ tiền khác",
      btnViewHistory: "Xem lịch sử quét",
      noResult: "Không có dữ liệu kết quả",
      noResultDesc:
        "Vui lòng thực hiện quét một tờ tiền mới từ không gian làm việc.",
      backWorkspace: "Trở lại không gian làm việc",
      matched: "Trùng khớp",
      different: "Khác biệt",
      final: "Chốt kết quả",
      noAgentData: "Không có dữ liệu từ tác tử này.",
      showLess: "Thu gọn",
      readFull: "Xem giải thích đầy đủ",
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
      whyChosen: "Vì sao hệ thống chọn kết quả này?",
      consensusTimeline: "Tiến trình đồng thuận",
      consensusMajority: "Đồng thuận đa số",
      consensusMajorityDetail: "Đạt đồng thuận đa số. Có 1 phiếu cho kết quả khác.",
      consensusValidDetail: "Đồng thuận 2 phiếu hợp lệ. Một hướng phân tích không đủ điều kiện bỏ phiếu.",
      consensusFullDetail: "Đồng thuận tuyệt đối 3 phiếu cùng kết quả.",
      showMore: "Xem thêm",
      showFewer: "Thu gọn",
      notRecorded: "Chưa ghi nhận",
      billingNotRecorded: "Chưa ghi nhận dữ liệu tính phí cho kết quả này.",
      consensusNotRecorded: "Chưa ghi nhận chi tiết đồng thuận.",
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
        let resolvedResultId = targetResultId;

        if (targetTaskId) {
          try {
            const res = await getRecognitionTaskLightStatus(targetTaskId);
            const taskStatus = res?.data ?? res ?? {};

            const status = String(taskStatus?.status || "").toLowerCase();
            const TERMINAL = new Set(["done", "completed", "complete", "success", "succeeded", "needs_review", "needs review", "completed_partial", "completed_with_limit", "no_banknote_detected", "needs_better_image", "failed", "failure", "error", "cancelled", "canceled", "timeout", "agent_error", "technical_error"]);

            if (!TERMINAL.has(status) && status !== "not_found" && status !== "stale") {
               navigate(`/processing?taskId=${targetTaskId}`, { replace: true });
               return;
            }

            resolvedResultId =
              taskStatus?.result_id ||
              taskStatus?.recognition_id ||
              taskStatus?.resultId ||
              targetResultId;

            if (resolvedResultId) {
              // API interceptor already unwraps the {success,data} envelope.
              // Use resultRes directly — resultRes?.data is the summary sub-object.
              const resultRes = await getRecognitionResult(resolvedResultId);
              fetchedData = resultRes;
            }
          } catch (e) {
            console.warn("Restore by taskId failed", e);
          }
        }

        if (!fetchedData && resolvedResultId) {
          try {
            // API interceptor already unwraps the {success,data} envelope.
            // Use res directly — res?.data would return the summary sub-object.
            const res = await getRecognitionResult(resolvedResultId);
            fetchedData = res;
            resolvedTaskId = fetchedData?.task_id || targetTaskId;
          } catch (e) {
            console.warn("Restore by resultId failed", e);
          }
        }

        if (fetchedData) {
          const payload = normalizeUserResultResponse(
            {
              ...fetchedData,
              input_image_url:
                fetchedData.input_image_url ||
                fetchedData.image_url ||
                fetchedData.uploaded_image_url ||
                null,
            },
            { taskId: resolvedTaskId, previewUrl: session?.previewUrl },
          ) || fetchedData;
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
  }, [rawResult, targetTaskId, targetResultId, restoreKey, navigate, setScanSession, isRestoring, restoreError, session?.previewUrl]);

  const resultsArray = useMemo(() => {
    if (!rawResult) return [];

    const list = Array.isArray(rawResult) ? rawResult : [rawResult];

    return list
      .map((item) => normalizeBackendResult(item, session))
      .filter(Boolean);
  }, [rawResult, session]);

  const currentItem = resultsArray[activeTab] || null;

  const finalData = currentItem?.data || {};
  const consensus = currentItem?.consensus || {};
  const detectedObjects = Array.isArray(currentItem?.detected_objects)
    ? currentItem.detected_objects
    : [];
  const primaryObject = detectedObjects[0] || null;
  const rejectedObjects = Array.isArray(currentItem?.rejected_objects)
    ? currentItem.rejected_objects
    : [];
  const fallbackAgentResults =
    currentItem?.agent_votes ||
    currentItem?.raw_backend?.agent_votes ||
    currentItem?.raw_backend?.result?.agent_votes ||
    currentItem?.raw_backend?.agent_results ||
    currentItem?.raw_backend?.result?.agent_results ||
    [];
  const singleAgentResults =
    primaryObject?.agent_votes ||
    primaryObject?.agent_results ||
    fallbackAgentResults;

  const limitInfo = currentItem?.raw_backend?.final_result?.limit_info || currentItem?.limit_info;
  const skippedCount = Number(limitInfo?.skipped_count || 0);
  const overflowObjects = currentItem?.raw_backend?.final_result?.overflow_objects || currentItem?.overflow_objects || [];

  const isMulti = currentItem?.multi_object === true && detectedObjects.length > 1;

  const finalDenomination = isMulti
    ? (lang === "VI" ? `Đã phát hiện ${currentItem.detected_objects.length} tờ tiền` : `Detected ${currentItem.detected_objects.length} banknotes`)
    : formatDenomination(finalData.denomination, finalData.currency, t.notRecorded);

  const finalCountry = isMulti
    ? "Multiple"
    : finalData.country
      ? formatCountry(finalData.country, lang)
      : t.notRecorded;
  const finalCurrency = isMulti
    ? "Multiple"
    : finalData.currency
      ? formatCurrency(finalData.currency)
      : t.notRecorded;
  const finalMaterial = isMulti ? "Multiple" : safeText(finalData.material, t.notRecorded);
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

  const normalizedConsensusState = getNormalizedConsensus({
    consensus,
    agent_votes: singleAgentResults,
  });
  const normalizedAg3Decision = getNormalizedAg3Decision({
    consensus,
    agent_votes: singleAgentResults,
  });
  const matchedAgents = getStrictConsensusMatchedCount(
    normalizedConsensusState,
    normalizedAg3Decision,
    firstDefined(consensus?.display_matched_agents, consensus?.matched_agents),
  );
  const totalAgents = toFiniteOrNull(firstDefined(consensus?.display_total_agents, consensus?.total_agents, consensus?.agent_count));
  const consensusScoreText = formatConsensusScoreText(
    matchedAgents,
    totalAgents,
    t.notRecorded,
    consensus?.display_consensus_pattern || (matchedAgents !== null && totalAgents !== null ? `${matchedAgents}/${totalAgents}` : null),
  );
  const allVotes = currentItem?.agent_votes || currentItem?.agentVotes || [];
  const nonMatchingVote = allVotes.find((v) => !v.matched && !v.agreed_with_final);
  const isNonMatchingEligible = nonMatchingVote
    ? (nonMatchingVote.vote_eligible === true || (nonMatchingVote.status === "completed" && nonMatchingVote.denomination && nonMatchingVote.denomination !== "Không xác định" && nonMatchingVote.denomination !== "N/A"))
    : false;

  const hasTechnicalFailure = allVotes?.some(v => v.technical_error === true || String(v.status).toLowerCase() === "failed" || String(v.status).toLowerCase() === "error");

  const consensusMajorityDetailText = matchedAgents === 2
    ? (isNonMatchingEligible
        ? (lang === "VI"
            ? "Đồng thuận đa số. Một phiếu đưa ra kết quả khác."
            : "Consensus reached. One vote returned a different result.")
        : hasTechnicalFailure
          ? (lang === "VI"
              ? "Hai phiếu hợp lệ đã tham gia biểu quyết. Nhánh xác minh web gặp sự cố và không được tính phiếu."
              : "Two AI agents completed the analysis; the web verification branch encountered a technical error and was not counted.")
          : (lang === "VI"
              ? "Đồng thuận 2 phiếu hợp lệ. Một hướng phân tích không đủ điều kiện bỏ phiếu."
              : "Consensus of 2 valid votes. One analysis branch did not qualify to vote."))
    : t.consensusMajorityDetail;

  const consensusSummary =
    matchedAgents === null || totalAgents === null
      ? t.consensusNotRecorded
      : matchedAgents >= 3
      ? t.consensusFullDetail
      : matchedAgents === 2
        ? consensusMajorityDetailText
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
    (matchedAgents !== null && matchedAgents > 0
      ? `Majority vote selected ${finalDenomination} with ${consensusScoreText} agents matched.`
      : "No conclusion provided.");

  const currentRateResultKey = [
    activeTab,
    currentItem?.id || "",
    currentItem?.task_id || "",
    currentItem?.result_id || "",
    finalCurrency,
    finalDenomination,
  ].join("|");
  const useCurrentRateForResult = currentRateOverrideKey === currentRateResultKey;
  const showVndConversion = isValidRecognizedMoneyResult(currentItem) && !isMulti;

  const exchangeResults = (() => {
    if (!showVndConversion) return null;

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
  })();
  const originalAmount = parseAmountFromDenomination(finalDenomination);
  const originalValueText = originalAmount
    ? `${originalAmount.toLocaleString(lang === "VI" ? "vi-VN" : "en-US")} ${finalCurrency}`
    : finalDenomination;
  const vndExchangeItem =
    exchangeResults?.find((item) => item.code === "VND") || null;
  const vndValueText =
    vndExchangeItem?.value === null || vndExchangeItem?.value === undefined
      ? t.notRecorded
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
  const canViewAdminDiagnostics = hasAdminResultAccess(user);
  const adminDiagnosticsResultId =
    currentItem?.resultId ||
    currentItem?.result_id ||
    currentItem?.id ||
    targetResultId ||
    null;
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
                {canViewAdminDiagnostics && adminDiagnosticsResultId && (
                  <button
                    onClick={() => navigate(`/admin/results/${adminDiagnosticsResultId}`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200 dark:hover:bg-cyan-400/15"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t.adminDiagnostics}
                  </button>
                )}
                <button
                  onClick={() =>
                    navigate("/feedback", {
                      state: { feedbackDraft: buildFeedbackDraft(currentItem) },
                    })
                  }
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
                    : consensusScoreText === t.notRecorded
                      ? t.notRecorded
                      : `${consensusScoreText} ${t.agents}`}
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
                value={isMulti ? getConsensusStatusLabel(consensus, lang) : consensusScoreText}
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
            totalAgents={totalAgents}
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
            consensusData={currentItem?.consensus || {}}
            refereeView={stripMarkdownSymbols(consensusText)}
            lensPayload={getAgentDataByName(singleAgentResults, ["lens", "visual", "agent_3"])}
            lensSources={normalizeLensSources(getAgentDataByName(singleAgentResults, ["lens", "visual", "agent_3"]))}
            cropEvidence={normalizeCropEvidence(primaryObject || currentItem)}
            consensusTrace={normalizeConsensusTrace(
              primaryObject?.consensus,
              currentItem?.consensus,
            )}
            conversionResult={currentItem?.conversion_result}
            originalObjectData={primaryObject || currentItem}
            t={t}
            lang={lang}
            ratesData={ratesData}
            parseAmountFromDenomination={parseAmountFromDenomination}
            isSingleObject
            showVndConversion={showVndConversion}
            originalValueText={originalValueText}
            vndValueText={vndValueText}
            hasVndRate={hasVndRate}
            rateMetaText={rateMetaText}
            canRecalculateWithCurrentRate={canRecalculateWithCurrentRate}
            useCurrentRateForResult={useCurrentRateForResult}
            onRecalculateRate={() => setCurrentRateOverrideKey(currentRateResultKey)}
            handleScanAnother={handleScanAnother}
            navigate={navigate}
          />
        )}

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
                        value={formatRecordedScore(checker?.document_score)}
                      />
                      <InfoRow
                        label={lang === "VI" ? "Điểm tiền giấy" : "Banknote Score"}
                        value={formatRecordedScore(checker?.banknote_score)}
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

function VerificationSummaryCard({ matchedAgents, totalAgents, cropEvidence, ag3Decision, lang }) {
  const hasMatched = matchedAgents !== null && totalAgents !== null;
  const hasCrop = Boolean(cropEvidence?.action);
  const hasLens = Boolean(ag3Decision?.rawCount || ag3Decision?.candidateSourceCount);

  if (!hasMatched && !hasCrop && !hasLens) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        {lang === "VI" ? "Tóm tắt kiểm tra" : "Verification summary"}
      </h4>
      <ul className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {hasMatched && (
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              {lang === "VI"
                ? `${matchedAgents}/${totalAgents} tác tử đồng thuận`
                : `${matchedAgents}/${totalAgents} agents matched`}
            </span>
          </li>
        )}
        {hasCrop && (
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              {lang === "VI"
                ? "Vùng cắt đã vượt qua kiểm tra"
                : "Crop passed validation"}
            </span>
          </li>
        )}
        {hasLens && (
          <li className="flex items-center gap-2">
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${ag3Decision?.counted ? "text-emerald-500" : "text-amber-500"}`} />
            <span>{getAg3DecisionMessage(ag3Decision, lang)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function CompactTokenUsageCard({ billing, t, lang }) {
  const credits = billing?.credits_charged ?? billing?.creditsCharged;
  const billingText =
    credits !== undefined && credits !== null
      ? lang === "VI"
        ? `Đã trừ ${credits} token ứng dụng · Cố định theo lượt`
        : `${credits} app token charged · Fixed per scan`
      : t?.notRecorded || (lang === "VI" ? "Chưa ghi nhận" : "Not recorded");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {lang === "VI" ? "Mức sử dụng" : "Usage"}
        </span>
        <Coins className="h-4 w-4 text-amber-500" />
      </div>
      <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-200">
        {billingText}
      </p>
    </div>
  );
}

function CurrencyConversionCard({
  showVndConversion,
  originalValueText,
  vndValueText,
  hasVndRate,
  rateMetaText,
  canRecalculateWithCurrentRate,
  useCurrentRateForResult,
  onRecalculateRate,
  t,
  lang,
}) {
  if (!showVndConversion) return null;

  const isVndNative = String(originalValueText || "").toUpperCase().includes("VND");

  if (isVndNative) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">
            {t?.conversionTitle || (lang === "VI" ? "Quy đổi tiền tệ" : "Currency Conversion")}
          </p>
          <Coins className="h-4 w-4 text-slate-400" />
        </div>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {lang === "VI" ? "Không cần quy đổi." : "No conversion is required."}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {lang === "VI" ? `Giá trị nhận diện: ${originalValueText}` : `Recognized value: ${originalValueText}`}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/80 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10">
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-300">
            {t?.conversionTitle || (lang === "VI" ? "Quy đổi tiền tệ" : "Currency Conversion")}
          </p>
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-200/80 bg-white/80 p-3 dark:border-emerald-500/20 dark:bg-slate-950/40">
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{t?.originalValue}</p>
            <p className="mt-0.5 text-base font-black text-slate-900 dark:text-white">{originalValueText}</p>
          </div>
          <div className="rounded-lg border border-emerald-300/80 bg-white p-3 dark:border-emerald-400/30 dark:bg-slate-950/60">
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{t?.approximateValue}</p>
            <p className="mt-0.5 text-lg font-black text-emerald-800 dark:text-emerald-200">{vndValueText}</p>
            {rateMetaText && (
              <p className="mt-1 text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-100/70">
                {rateMetaText}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-semibold text-emerald-700/90 dark:text-emerald-200/90">
            {hasVndRate ? t?.rateAvailable : t?.rateUnavailable}
          </span>
          <div className="flex items-center gap-3">
            {canRecalculateWithCurrentRate && (
              <button
                type="button"
                onClick={onRecalculateRate}
                disabled={useCurrentRateForResult}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-400/30 dark:text-emerald-100"
              >
                {useCurrentRateForResult ? t?.showingCurrentRate : t?.recalculateCurrentRate}
              </button>
            )}
            <Link
              to="/exchange"
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline dark:text-emerald-200"
            >
              {t?.openConverter}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImagesCard({
  previewImage,
  cropPreview,
  cropSource,
  hasBbox,
  t,
  lang,
  onPreviewImage,
  onPreviewCrop,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
        <ImageIcon className="h-5 w-5 text-indigo-500" />
        {lang === "VI" ? "Hình ảnh nhận diện" : "Banknote Images"}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Original Image Panel */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              {t?.originalImage || (lang === "VI" ? "Ảnh gốc" : "Original image")}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {lang === "VI" ? "Ảnh chụp" : "Input"}
            </span>
          </div>
          <ImagePreviewButton
            src={previewImage}
            alt={t?.originalImage || "Original image"}
            emptyText={lang === "VI" ? "Không có ảnh gốc" : "Original image unavailable"}
            onPreview={onPreviewImage}
            label={t?.viewImage || "View image"}
            heightClass="h-60 sm:h-72"
          />
        </div>

        {/* Selected Crop Panel */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              {t?.cropPreview || (lang === "VI" ? "Vùng cắt chọn" : "Selected crop")}
            </span>
            {cropSource && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                {cropSource}
              </span>
            )}
          </div>
          <CropPreviewButton
            preview={cropPreview}
            alt={t?.cropPreview || "Selected crop"}
            emptyText={
              hasBbox
                ? (t?.cropUnavailable || (lang === "VI" ? "Vùng cắt không khả dụng" : "Crop preview unavailable"))
                : (lang === "VI" ? "Vùng cắt không khả dụng" : "Crop preview unavailable")
            }
            onPreview={onPreviewCrop}
            label={t?.viewImage || "View crop"}
            heightClass="h-60 sm:h-72"
          />
        </div>
      </div>
    </div>
  );
}

function ChipList({ items, maxDefault = 6, lang, label }) {
  const [showAll, setShowAll] = React.useState(false);

  if (!items || items.length === 0) return null;

  const displayItems = showAll ? items : items.slice(0, maxDefault);

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <h5 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {displayItems.map((item, i) => (
          <span
            key={i}
            className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {item}
          </span>
        ))}
      </div>
      {items.length > maxDefault && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-3 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showAll
            ? (lang === "VI" ? "Thu gọn" : "Show less")
            : (lang === "VI" ? `Xem thêm +${items.length - maxDefault}` : `Show +${items.length - maxDefault} more`)}
        </button>
      )}
    </div>
  );
}

export function WhyThisResultCard({
  matchedAgents,
  totalAgents,
  isNonMatchingEligible,
  finalDenomination,
  cropEvidence,
  originalObjectData,
  ag3Decision,
  refereeView,
  t,
  lang,
}) {
  const allVotes = originalObjectData?.agent_votes || originalObjectData?.agentVotes || [];
  const validVoteCount = allVotes?.filter(v => v.vote_created !== false && v.vote_eligible !== false && v.counted_in_consensus !== false).length || allVotes.length;
  const hasTechnicalFailure = allVotes?.some(v => v.technical_error === true || String(v.status).toLowerCase() === "failed" || String(v.status).toLowerCase() === "error");
  const [showTechnicalExplanation, setShowTechnicalExplanation] = React.useState(false);
  const lensStatusText = getAg3DecisionMessage(ag3Decision, lang);
  const lensStatusIconColor = ag3Decision?.counted ? "text-emerald-500" : "text-amber-500";

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-cyan-50/70 p-5 shadow-sm dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-cyan-500/5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
        <Brain className="h-5 w-5 text-indigo-500" />
        {t?.whyChosen || (lang === "VI" ? "Vì sao chọn kết quả này?" : "Why This Result")}
      </h3>

      {/* User-facing summary bullets */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm backdrop-blur dark:bg-slate-900/60">
        <ul className="space-y-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <span>
              {matchedAgents >= 3
                ? (lang === "VI" ? `Cả 3 tác tử AI đều độc lập đồng thuận ${finalDenomination}.` : `All 3 AI agents independently matched on ${finalDenomination}.`)
                : matchedAgents >= 2
                  ? (validVoteCount < 3
                      ? (lang === "VI" ? `Đồng thuận 2/2 phiếu hợp lệ trên ${finalDenomination}.` : `2 of 2 valid agents reached consensus on ${finalDenomination}.`)
                      : (lang === "VI" ? `Đa số phiếu đồng thuận ${finalDenomination}.` : `A majority of valid votes reached consensus on ${finalDenomination}.`))
                  : (lang === "VI" ? `Hệ thống ghi nhận kết quả từ tác tử hợp lệ.` : `System recorded decision from valid agent votes.`)}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <span>
              {lang === "VI"
                ? "Vùng ảnh cắt đã vượt qua kiểm tra chất lượng tiền giấy."
                : "Crop region passed banknote suitability quality checks."}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${lensStatusIconColor}`} />
            <span data-testid="why-lens-status">{lensStatusText}</span>
          </li>
        </ul>

        <div className="mt-4 border-t border-slate-200/60 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowTechnicalExplanation((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {showTechnicalExplanation
              ? (lang === "VI" ? "Ẩn chi tiết kỹ thuật" : "Hide technical explanation")
              : (lang === "VI" ? "Xem chi tiết kỹ thuật" : "Show technical explanation")}
            {showTechnicalExplanation ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed Technical Details */}
      {showTechnicalExplanation && (
        <div className="mt-4 space-y-3 pt-1">
          {/* Crop Evidence (AG0) */}
          {(() => {
            const objectData = originalObjectData || {};
            const cropChecker = objectData?.crop_checker || cropEvidence || {};
            const action = objectData?.ag0_action || cropChecker?.ag0_action || cropChecker?.action;
            if (!action) return null;
            const bScore = formatRecordedScore(
              objectData?.banknote_score ?? cropChecker?.banknote_score,
            );
            const dScore = formatRecordedScore(
              objectData?.document_score ?? cropChecker?.document_score,
            );
            const eligible = objectData?.agent_eligible ?? cropChecker?.agent_eligible;
            const eligibleLabel = formatRecordedBoolean(eligible, "Not recorded");

            return (
              <div className="rounded-xl bg-white/60 p-3.5 text-xs shadow-sm dark:bg-slate-900/40">
                <h5 className="mb-2 font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5 text-indigo-500" />
                  AG0 Crop Check
                </h5>
                <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                  <li><span className="font-semibold">Action:</span> {action}</li>
                  <li><span className="font-semibold">banknote_score:</span> {bScore}</li>
                  <li><span className="font-semibold">document_score:</span> {dScore}</li>
                  <li><span className="font-semibold">agent_eligible:</span> {eligibleLabel}</li>
                </ul>
              </div>
            );
          })()}

          {/* Aggregator Conclusion */}
          <div className="rounded-xl bg-white/60 p-3.5 text-xs shadow-sm dark:bg-slate-900/40">
            <h5 className="mb-2 font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Gavel className="h-3.5 w-3.5 text-purple-500" />
              {lang === "VI" ? "Kết luận trọng tài" : "Aggregator conclusion"}
            </h5>
            <div className="prose prose-xs max-w-none text-slate-700 dark:prose-invert dark:text-slate-300">
              <ReactMarkdown>
                {refereeView || (lang === "VI" ? "Trọng tài chọn kết quả dựa trên đa số tác tử đồng thuận." : "Aggregator selected final decision based on majority consensus.")}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsensusTimelineSection({ consensusTrace, t, lang }) {
  if (!Array.isArray(consensusTrace) || consensusTrace.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-4 text-base font-black text-slate-900 dark:text-slate-100">
        {t?.consensusTimeline || (lang === "VI" ? "Tiến trình đồng thuận" : "Consensus Timeline")}
      </h3>
      <div className="relative space-y-3 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
        {consensusTrace.map((trace, i) => (
          <div key={i} className="relative flex gap-4">
            <div className="z-10 mt-3 h-5 w-5 shrink-0 rounded-full border-4 border-white bg-indigo-500 shadow-sm dark:border-slate-900" />
            <div className="min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100">
                {trace.step || `${lang === "VI" ? "Lần thử" : "Attempt"} ${trace.attempt || i + 1}`}
              </p>
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 mt-0.5">
                {formatTimelinePattern(trace.pattern, lang)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {trace.reason || trace.action || trace.decision || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const getLensDisposition = (src) => {
  const value = String(src?.final_disposition || src?.evidence_disposition || src?.disposition || "").trim().toLowerCase();
  return ["supporting", "conflicting", "partial", "excluded", "duplicate"].includes(value)
    ? value
    : "partial";
};

const dispositionLabels = {
  supporting: { VI: "Ho tro", EN: "Supporting" },
  conflicting: { VI: "Mau thuan", EN: "Conflicting" },
  partial: { VI: "Chua du", EN: "Partial" },
  excluded: { VI: "Bi loai", EN: "Excluded" },
  duplicate: { VI: "Trung nguon", EN: "Duplicate" },
};

const dispositionTone = {
  supporting: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  conflicting: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  partial: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  excluded: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  duplicate: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
};

const getDispositionLabel = (disposition, lang = "VI") =>
  dispositionLabels[disposition]?.[lang] || dispositionLabels[disposition]?.EN || "Partial";

const humanEvidenceReason = (reason, lang = "VI") => {
  const key = String(reason || "").trim();
  const copy = {
    weak_source_or_skipped_page_text: {
      VI: "Trang chua duoc xac minh day du hoac nguon co do tin cay thap.",
      EN: "The page is not fully verified or the source has lower trust.",
    },
    supporting_but_insufficient: {
      VI: "Nguon co thong tin phu hop nhung chua du dieu kien tham gia bieu quyet.",
      EN: "The source is relevant but not enough to join the vote.",
    },
    duplicate_domain: {
      VI: "Da co nguon tot hon tu cung website.",
      EN: "A stronger source from the same website was already counted.",
    },
    trusted_source_conflict: {
      VI: "Co nguon dang tin cay xac nhan menh gia khac.",
      EN: "A trusted source confirms a different denomination.",
    },
    winning_complete_identity: {
      VI: "Danh tinh khop cum AG3 dang dan dau.",
      EN: "The identity matches AG3's winning cluster.",
    },
    conflicting_denomination: {
      VI: "Nguon nay xac nhan menh gia khac voi cum AG3 dang dan dau.",
      EN: "This source confirms a different denomination than AG3's winner.",
    },
    missing_complete_identity: {
      VI: "Nguon chua xac nhan du quoc gia, tien te va menh gia.",
      EN: "The source does not confirm country, currency, and denomination.",
    },
    missing_canonical_domain: {
      VI: "Chua xac dinh duoc domain chuan cua nguon.",
      EN: "The source canonical domain is missing.",
    },
    social_source: {
      VI: "Nguon mang xa hoi khong du dieu kien lam bang chung.",
      EN: "Social media sources are not eligible evidence.",
    },
    non_banknote_numismatic_object: {
      VI: "Nguon noi ve vat the khong phai tien giay.",
      EN: "The source is about a non-banknote object.",
    },
    invalid_banknote_context: {
      VI: "Trang khong co du ngu canh tien giay.",
      EN: "The page does not have enough banknote context.",
    },
    unrelated_noise: {
      VI: "Nguon khong lien quan den danh tinh to tien.",
      EN: "The source is unrelated to the banknote identity.",
    },
  };
  return copy[key]?.[lang] || copy[key]?.EN || key || (lang === "VI" ? "Chua ghi nhan ly do." : "No reason recorded.");
};

const displayEvidenceValue = (value, fallback = "Unknown") => {
  if (Array.isArray(value)) return value.length ? value.filter(Boolean).join(", ") : fallback;
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const getEvidenceAmounts = (src) => {
  const raw = src?.extracted_denomination || src?.detected_amounts || [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
};

const formatEvidenceIdentity = (src) => {
  const country = displayEvidenceValue(src?.extracted_country || src?.detected_country, "Unknown");
  const currency = displayEvidenceValue(src?.extracted_currency || src?.detected_currency, "Unknown");
  const amount = displayEvidenceValue(getEvidenceAmounts(src), "Unknown");
  return `${country} / ${currency} / ${amount}`;
};

const formatAg3Identity = (identity) => {
  if (!identity || typeof identity !== "object") return "Unknown";
  if (identity.identityLabel) return identity.identityLabel;
  const country = displayEvidenceValue(identity.country || identity.quoc_gia, "Unknown");
  const currency = displayEvidenceValue(identity.currency || identity.ma_tien_te, "Unknown");
  const amount = displayEvidenceValue(identity.amount || identity.denomination || identity.menh_gia, "Unknown");
  return `${country} / ${currency} / ${amount}`;
};

const formatSourceClass = (value) => {
  const text = String(value || "UNKNOWN").trim().toUpperCase();
  return text && text !== "NONE" && text !== "NULL" ? text : "UNKNOWN";
};

function renderEvidenceBadge(src, lang) {
  const badge = src?.badge;
  const disposition = getLensDisposition(src);
  const amounts = src?.detected_amounts || [];
  const currency = src?.detected_currency || "";
  const amountText = amounts.length > 0 ? `${amounts[0].toLocaleString()} ${currency}`.trim() : "";

  if (disposition === "supporting" || badge === "Supporting" || badge === "Counted") {
    const labelText = lang === "VI"
      ? `Hỗ trợ${amountText ? ` (${amountText})` : ""}`
      : `Supporting${amountText ? ` (${amountText})` : ""}`;
    return (
      <span className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        {labelText}
      </span>
    );
  }

  if (disposition === "conflicting" || badge === "Conflicting denomination") {
    const labelText = lang === "VI"
      ? `Mâu thuẫn${amountText ? ` (${amountText})` : " mệnh giá"}`
      : `Conflicting${amountText ? ` (${amountText})` : " denomination"}`;
    return (
      <span className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
        {labelText}
      </span>
    );
  }

  if (disposition === "partial" || disposition === "duplicate") {
    const labelText = getDispositionLabel(disposition, lang);
    return (
      <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${dispositionTone[disposition]}`}>
        {labelText}
      </span>
    );
  }

  let subReason = badge || "Excluded";
  if (badge === "Duplicate domain") subReason = lang === "VI" ? "Trùng domain" : "Duplicate domain";
  else if (badge === "Social source") subReason = lang === "VI" ? "Nguồn MXH" : "Social source";
  else if (badge === "Commercial source") subReason = lang === "VI" ? "Nguồn thương mại" : "Commercial source";
  else if (badge === "Noise") subReason = lang === "VI" ? "Nhiễu" : "Noise";
  else if (badge === "Not banknote context") subReason = lang === "VI" ? "Không phải tiền" : "Not banknote";
  else if (badge === "Non-banknote object" || src?.evidence_reason === "non_banknote_numismatic_object") subReason = lang === "VI" ? "Không phải tiền giấy (xu/medal)" : "Non-banknote object (coin/medal)";
  else if (src?.evidence_reason) subReason = src.evidence_reason;

  const excludedLabel = lang === "VI"
    ? `Bị loại${subReason && subReason !== "Excluded" ? ` (${subReason})` : ""}`
    : `Excluded${subReason && subReason !== "Excluded" ? ` (${subReason})` : ""}`;

  return (
    <span className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
      {excludedLabel}
    </span>
  );
}

function LensEvidencePanel({
  rawLensSources,
  ag3,
  decision,
  lensState,
  lang,
  lensDispositionFilter,
  setLensDispositionFilter,
  showAllLensSources,
  setShowAllLensSources,
}) {
  const compactSources = Array.isArray(rawLensSources) ? rawLensSources : [];
  const compactDecision = decision || getNormalizedAg3Decision({
    ...(ag3 || {}),
    evidence: compactSources,
  });
  const compactIdentity = compactDecision.voteCreated
    ? compactDecision.voteIdentity
    : compactDecision.candidateIdentity;
  const compactIdentityKnown = Boolean(
    compactIdentity?.country || compactIdentity?.currency || compactIdentity?.denomination,
  );
  const compactDenomination = formatDenominationLabel(
    compactIdentity?.denomination,
    compactIdentity?.currency,
    compactDecision.voteCreated
      ? (lang === "VI" ? "Identity đã xác minh" : "Verified identity")
      : (lang === "VI" ? "Chưa xác minh identity" : "Verification incomplete"),
  );
  const compactCountryCurrency = compactIdentityKnown
    ? [compactIdentity?.country, compactIdentity?.currency].filter(Boolean).join(" · ")
    : (lang === "VI" ? "Chưa xác nhận ứng viên" : "Candidate not confirmed");
  const compactExplanation = getAg3DecisionMessage(compactDecision, lang);
  const sourceKey = (source = {}) =>
    `${source.url || ""}|${source.domain || ""}|${source.title || ""}`.toLowerCase();
  const selectedEvidenceSources = Array.isArray(compactDecision.selectedSources) && compactDecision.selectedSources.length
    ? compactDecision.selectedSources
    : compactDecision.articlePreview.filter((source) =>
        source.selected === true ||
        source.previewStatus === "supporting" ||
        source.votingStatusLabel === "SELECTED FOR VOTING",
      );
  const selectedEvidenceKeys = new Set(selectedEvidenceSources.map(sourceKey));
  const otherReviewedSources = compactDecision.articlePreview.filter((source) => !selectedEvidenceKeys.has(sourceKey(source)));
  const effectiveSetCount = selectedEvidenceSources.length || compactDecision.selectedSourceCount || (compactDecision.selectedSetValid ? 3 : 0);
  const isSetFormed = compactDecision.selectedSetValid || (effectiveSetCount >= 3 && effectiveSetCount <= 5);
  const selectedSetLabel = isSetFormed
    ? `${effectiveSetCount || 3} ${lang === "VI" ? "nguồn" : "sources"}`
    : (lang === "VI" ? "Chưa hình thành" : "Not formed");
  const voteStatusLabel = compactDecision.counted
    ? (compactDecision.matched ? "AG3 VOTE VALID / MATCHED" : "AG3 VOTE VALID")
    : "NOT COUNTED";
  const compactStats = [
    {
      label: lang === "VI" ? "Kết quả đã xem" : "Results reviewed",
      value: compactDecision.rawCount || compactSources.length || 0,
      icon: Search,
    },
    {
      label: lang === "VI" ? "Nguồn phù hợp" : "Suitable sources found",
      value: compactDecision.candidateSourceCount || 0,
      icon: Globe,
    },
    {
      label: lang === "VI" ? "Đã chọn" : "Selected",
      value: selectedSetLabel,
      icon: Globe,
    },
    {
      label: lang === "VI" ? "Mức đồng thuận" : "Agreement",
      value: compactDecision.agreementPattern || (lang === "VI" ? "Chưa đánh giá" : "Not evaluated"),
      icon: CheckCircle2,
    },
    {
      label: lang === "VI" ? "Trạng thái phiếu" : "Vote status",
      value: compactDecision.counted
        ? (compactDecision.matched ? (lang === "VI" ? "Hợp lệ / khớp" : "Valid / matched") : (lang === "VI" ? "Hợp lệ" : "Valid"))
        : (lang === "VI" ? "Không tính" : "Not counted"),
      icon: compactDecision.voteCreated ? ShieldCheck : AlertTriangle,
    },
  ];
  const getPreviewStatusLabel = (status) => {
    const labels = {
      supporting: "SELECTED FOR VOTING",
      reviewed_only: "REVIEWED ONLY",
      candidate: "Candidate source",
      excluded: "Excluded",
      duplicate: "Duplicate",
      partial: "Partial",
    };
    return labels[status] || "REVIEWED ONLY";
  };

  const getCompactBadge = (source = {}) => {
    const label = source.classificationLabel || getPreviewStatusLabel(source.previewStatus);
    if (label === "DUPLICATE DOMAIN") return "DUPLICATE";
    if (label === "MULTI-DENOMINATION") return "PARTIAL";
    if (label === "REVIEWED ONLY") return "PARTIAL";
    if (label === "SELECTED FOR VOTING") return "EXACT";
    return label || "PARTIAL";
  };
  const getBadgeTone = (label) => {
    if (label === "EXACT") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
    if (label === "CONFLICTING") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300";
    if (label === "DUPLICATE") return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (label === "NOISE" || label === "SOCIAL") return "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400";
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  };
  const renderCompactSourceCard = (source, index) => {
    const safeUrl = /^https?:\/\//i.test(source.url || "") ? source.url : "";
    const sourceTitle = source.title || source.domain || (lang === "VI" ? "Nguồn không có tiêu đề" : "Source without title");
    const badgeLabel = getCompactBadge(source);

    return (
      <li
        key={`${source.domain}-${safeUrl || sourceTitle}-${index}`}
        className="flex min-h-[8.5rem] min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/50"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {source.domain || (lang === "VI" ? "Không rõ nguồn" : "Unknown source")}
          </p>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={lang === "VI" ? "Mở nguồn ngoài" : "Open external source"}
              className="shrink-0 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] break-words text-sm font-black leading-5 text-slate-900 dark:text-slate-100">
          {sourceTitle}
        </p>
        <p className="mt-2 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
          {formatAg3Identity(source.identity).replaceAll(" / ", " · ")}
        </p>
        <div className="mt-auto pt-3">
          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black ${getBadgeTone(badgeLabel)}`}>
            {badgeLabel}
          </span>
        </div>
      </li>
    );
  };

  if (compactSources.length || ag3 || compactDecision.rawCount || lensState) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
              <Search className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              Google Lens Verification
            </h4>
            <p className="mt-3 break-words text-2xl font-black text-slate-950 dark:text-white">
              {compactDenomination}
            </p>
            <p className="mt-1 break-words text-xs font-bold text-slate-500 dark:text-slate-400">
              {compactCountryCurrency}
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-black ${
            compactDecision.counted
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
          }`}>
            {compactDecision.counted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {voteStatusLabel}
          </span>
        </div>

        <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
          {compactDecision.counted
            ? (lang === "VI" ? "Google Lens xác minh danh tính này bằng các nguồn web độc lập." : "Google Lens verified this identity using independent web sources.")
            : compactExplanation}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {compactStats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </div>
              <div className="mt-1 text-base font-black text-slate-900 dark:text-slate-100">
                {displayEvidenceValue(value, "0")}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {lang === "VI" ? `Cần ít nhất ${compactDecision.requiredSourceCount || 3} nguồn khớp chính xác để tạo phiếu AG3.` : `Requires at least ${compactDecision.requiredSourceCount || 3} exact supporting sources to create an AG3 vote.`}
        </p>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {lang === "VI" ? "Bằng chứng đã chọn" : "Selected evidence"}
            </p>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {selectedEvidenceSources.length || effectiveSetCount || 0} {lang === "VI" ? "nguồn" : "sources"}
            </span>
          </div>
          {selectedEvidenceSources.length > 0 ? (
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedEvidenceSources.map((source, index) => renderCompactSourceCard(source, index))}
            </ol>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              {lang === "VI" ? "Chưa ghi nhận tập nguồn đã chọn." : "No selected evidence set was recorded."}
            </p>
          )}
        </div>

        {otherReviewedSources.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAllLensSources((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
            >
              {showAllLensSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAllLensSources
                ? (lang === "VI" ? "Ẩn nguồn đã xem khác" : "Hide other reviewed sources")
                : (lang === "VI" ? `Xem ${otherReviewedSources.length} nguồn đã xem khác` : `View ${otherReviewedSources.length} other reviewed sources`)}
            </button>
            {showAllLensSources && (
              <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {otherReviewedSources.map((source, index) => renderCompactSourceCard(source, index))}
              </ol>
            )}
          </div>
        )}
      </section>
    );
  }

  if (compactSources.length || ag3 || compactDecision.rawCount || lensState) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <h4 className="line-clamp-2 text-sm font-black text-slate-900 dark:text-slate-100">
            Google Lens Verification
          </h4>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(220px,0.9fr)]">
          <div className="min-w-0 space-y-4">
            <div>
              <div className={`mb-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-black ${
                compactDecision.voteCreated
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
              }`}
              >
                {compactDecision.voteCreated ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {compactDecision.voteCreated
                  ? (lang === "VI" ? "Phiếu AG3 hợp lệ" : "AG3 vote valid")
                  : (lang === "VI" ? "AG3 chưa tạo phiếu" : "AG3 vote not created")}
              </div>
              <p className="break-words text-xl font-black text-slate-950 dark:text-white">
                {compactDenomination}
              </p>
              <p className="mt-1 break-words text-xs font-bold text-slate-500 dark:text-slate-400">
                {compactCountryCurrency}
              </p>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                {compactExplanation}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {lang === "VI" ? "Nguồn đã xem" : "Sources reviewed"}
              </p>
              {compactDecision.articlePreview.length > 0 ? (
                <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {compactDecision.articlePreview.map((source, index) => {
                    const safeUrl = /^https?:\/\//i.test(source.url || "") ? source.url : "";
                    const sourceTitle = source.title || source.domain || (lang === "VI" ? "Nguồn không có tiêu đề" : "Source without title");
                    const classificationLabel = source.classificationLabel || "PARTIAL";
                    const votingStatusLabel = source.votingStatusLabel || getPreviewStatusLabel(source.previewStatus);
                    const reviewReason = votingStatusLabel === "SELECTED FOR VOTING" ? "" : source.reviewReasonLabel;
                    return (
                      <li
                        key={`${source.domain}-${safeUrl || sourceTitle}-${index}`}
                        className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-[11px] font-black text-slate-500 dark:text-slate-400">
                            <span className="mr-1 text-slate-400 dark:text-slate-500">DOMAIN</span>
                            {source.domain || (lang === "VI" ? "Không rõ nguồn" : "Unknown source")}
                          </p>
                          {safeUrl && (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={lang === "VI" ? "Mở nguồn ngoài" : "Open external source"}
                              className="shrink-0 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-xs font-black leading-5 text-slate-900 dark:text-slate-100">
                          <span className="mr-1 text-[10px] text-slate-400 dark:text-slate-500">TITLE</span>
                          {sourceTitle}
                        </p>
                        <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <span className="mr-1 text-slate-400 dark:text-slate-500">IDENTITY</span>
                          {formatAg3Identity(source.identity).replaceAll(" / ", " · ")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {classificationLabel}
                          </span>
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                            {votingStatusLabel}
                          </span>
                        </div>
                        {reviewReason && (
                          <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            {reviewReason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {lang === "VI" ? "Chưa có bài viết đủ dữ liệu để hiển thị." : "No article details are available yet."}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            {compactStats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex min-w-0 items-center gap-2 font-bold text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 font-black text-slate-900 dark:text-slate-100">
                  {displayEvidenceValue(value, "0")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const summary =
    ag3?.ag3_verification_summary && typeof ag3.ag3_verification_summary === "object"
      ? ag3.ag3_verification_summary
      : {};
  const dispositionCounts = summary.disposition_counts || ag3?.disposition_counts || {};
  const sources = Array.isArray(rawLensSources) ? rawLensSources : [];
  const sourceCountByDisposition = (disposition) =>
    sources.filter((src) => getLensDisposition(src) === disposition).length;
  const countValue = (key, fallback = 0) => {
    const value = ag3?.[key] ?? summary?.[key];
    return value === undefined || value === null || value === "" ? fallback : value;
  };
  const supportingCount = countValue("supporting_evidence_count", dispositionCounts.supporting ?? sourceCountByDisposition("supporting"));
  const conflictingCount = countValue("conflicting_evidence_count", dispositionCounts.conflicting ?? sourceCountByDisposition("conflicting"));
  const partialCount = countValue("partial_evidence_count", dispositionCounts.partial ?? sourceCountByDisposition("partial"));
  const excludedCount = countValue("excluded_evidence_count", dispositionCounts.excluded ?? sourceCountByDisposition("excluded"));
  const duplicateCount = countValue("duplicate_evidence_count", dispositionCounts.duplicate ?? sourceCountByDisposition("duplicate"));
  const qualifiedCount = countValue(
    "qualified_source_count",
    countValue("eligible_evidence_count", sources.filter((src) => src.qualified_source === true || src.eligible === true).length),
  );
  const independentDomainCount = countValue(
    "qualified_independent_domain_count",
    countValue("eligible_independent_domain_count", 0),
  );
  const rawCount = countValue("total_raw_evidence_count", countValue("raw_lens_result_count", sources.length));
  const selectedSet = Array.isArray(summary.selected_voting_set || ag3?.selected_voting_set)
    ? (summary.selected_voting_set || ag3.selected_voting_set)
    : [];
  const selectedFallback = sources
    .filter((src) => src.selected_for_ag3_internal_vote === true || src.selected_for_ag3_vote === true || src.selected_rank)
    .map((src, index) => ({
      selected_rank: src.selected_rank || index + 1,
      domain: src.domain,
      canonical_domain: src.canonical_domain,
      source_class: src.source_class || src.source_trust_level,
      disposition: getLensDisposition(src),
      identity: {
        country: src.detected_country || src.extracted_country,
        currency: src.detected_currency || src.extracted_currency,
        denomination: src.detected_amounts || src.extracted_denomination,
      },
    }));
  const selectedRows = selectedSet.length ? selectedSet : selectedFallback;
  const qualifiedRows = sources.filter(
    (src) =>
      src.qualified_source === true ||
      src.eligible === true ||
      (["supporting", "conflicting"].includes(getLensDisposition(src)) && src.complete_identity !== false),
  );
  const clusters = Array.isArray(summary.candidate_clusters || ag3?.candidate_clusters)
    ? (summary.candidate_clusters || ag3.candidate_clusters)
    : [];
  const winningCluster = summary.winning_cluster || ag3?.winning_cluster || {};
  const winningIdentity = summary.winning_identity || ag3?.winning_identity || {};
  const formatterTrace = summary.ag3_formatter_decision_trace || ag3?.ag3_formatter_decision_trace || {};
  const filteredSources = lensDispositionFilter === "all"
    ? sources
    : sources.filter((src) => getLensDisposition(src) === lensDispositionFilter);
  const visibleSources = showAllLensSources ? filteredSources : filteredSources.slice(0, 10);
  const filterOptions = [
    { key: "all", label: lang === "VI" ? "Tat ca" : "All", count: rawCount },
    { key: "supporting", label: lang === "VI" ? "Ho tro" : "Supporting", count: supportingCount },
    { key: "conflicting", label: lang === "VI" ? "Mau thuan" : "Conflicting", count: conflictingCount },
    { key: "partial", label: lang === "VI" ? "Chua du" : "Partial", count: partialCount },
    { key: "excluded", label: lang === "VI" ? "Bi loai" : "Excluded", count: excludedCount },
    { key: "duplicate", label: lang === "VI" ? "Trung nguon" : "Duplicate", count: duplicateCount },
  ];
  const metricCards = [
    { label: "Raw", value: rawCount, icon: Search },
    { label: "Qualified", value: qualifiedCount, icon: ShieldCheck },
    { label: "Supporting", value: supportingCount, icon: CheckCircle2 },
    { label: "Conflicting", value: conflictingCount, icon: AlertTriangle },
    { label: "Partial", value: partialCount, icon: Clock },
    { label: "Excluded", value: excludedCount, icon: X },
    { label: "Duplicate", value: duplicateCount, icon: Hash },
    { label: "Domains", value: independentDomainCount, icon: Globe },
  ];
  const winningClusterKey = String(winningCluster.cluster_key || "").toLowerCase();
  const winningIdentityText = formatAg3Identity(winningIdentity);
  const selectedSize = countValue("selected_voting_set_size", selectedRows.length);
  const majorityRequired = countValue("majority_required", selectedSize >= 5 ? 3 : selectedSize >= 3 ? 2 : 0);
  const agreement = countValue("agreement_achieved", selectedSize ? `${supportingCount}/${selectedSize}` : "0/0");
  const voteEligible = ag3?.vote_eligible ?? summary.vote_eligible ?? false;
  const counted = ag3?.counted_in_consensus ?? summary.counted_in_consensus ?? ag3?.counted ?? false;

  if (!sources.length) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
        {lensState.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Evidence Summary</p>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {countValue("initial_lens_result_count", rawCount)} initial / {countValue("targeted_search_result_count", 0)} targeted
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metricCards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <div className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{displayEvidenceValue(value, "0")}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">AG3 Decision</p>
          <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <div className="flex justify-between gap-3"><span>Status</span><span>{displayEvidenceValue(ag3?.status, "Unknown")}</span></div>
            <div className="flex justify-between gap-3"><span>Selected set</span><span>{displayEvidenceValue(selectedSize, "0")}</span></div>
            <div className="flex justify-between gap-3"><span>Majority</span><span>{majorityRequired}/{selectedSize || 0}</span></div>
            <div className="flex justify-between gap-3"><span>Agreement</span><span>{displayEvidenceValue(agreement, "0/0")}</span></div>
            <div className="flex justify-between gap-3"><span>Vote eligible</span><span>{displayEvidenceValue(voteEligible)}</span></div>
            <div className="flex justify-between gap-3"><span>Counted</span><span>{displayEvidenceValue(counted)}</span></div>
            <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Winning identity</span>
              <span className="mt-1 block break-words font-black text-slate-900 dark:text-slate-100">{winningIdentityText}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Qualified Independent Sources</p>
          {qualifiedRows.length ? (
            <div className="space-y-2">
              {qualifiedRows.slice(0, 6).map((src, index) => (
                <div key={`${src.url || src.title}-qualified-${index}`} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                  <span className="truncate font-bold text-slate-800 dark:text-slate-200">{src.canonical_domain || src.domain || "unknown"}</span>
                  <span className="shrink-0 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    {formatSourceClass(src.source_class || src.source_trust_level)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No qualified source recorded.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Selected Voting Set</p>
          {selectedRows.length ? (
            <div className="space-y-2">
              {selectedRows.map((row, index) => (
                <div key={`${row.canonical_domain || row.domain || "selected"}-${index}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                  <span className="font-black text-slate-400">#{row.selected_rank || index + 1}</span>
                  <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{formatAg3Identity(row.identity)}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${dispositionTone[getLensDisposition(row)] || dispositionTone.partial}`}>
                    {getDispositionLabel(getLensDisposition(row), lang)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No selected voting set recorded.</p>
          )}
        </section>
      </div>

      {clusters.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Internal Majority</p>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Selected {selectedSize || 0}, required {majorityRequired || 0}, achieved {agreement}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Identity</th>
                  <th className="py-2 pr-3">Sources</th>
                  <th className="py-2 pr-3">Domains</th>
                  <th className="py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {clusters.map((cluster, index) => {
                  const identity = `${displayEvidenceValue(cluster.country, "Unknown")} / ${displayEvidenceValue(cluster.currency, "Unknown")} / ${displayEvidenceValue(cluster.amount, "Unknown")}`;
                  const isWinner =
                    String(cluster.cluster_key || "").toLowerCase() === winningClusterKey ||
                    identity === winningIdentityText ||
                    index === 0;
                  return (
                    <tr key={`${cluster.cluster_key || identity}-${index}`}>
                      <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-200">{identity}</td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{displayEvidenceValue(cluster.support_count || cluster.supporting_count, "0")}</td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{displayEvidenceValue(cluster.independent_domain_count || cluster.independent_domains, "0")}</td>
                      <td className="py-2">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${isWinner ? dispositionTone.supporting : dispositionTone.partial}`}>
                          {isWinner ? "Winner" : "Minority"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Promotion path: {displayEvidenceValue(summary.promotion_reason || summary.promotion_path || ag3?.promotion_reason, "None")}</span>
            <span>Trusted conflict: {displayEvidenceValue(summary.trusted_conflict ?? ag3?.trusted_conflict)}</span>
          </div>
        </section>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 [&::-webkit-details-marker]:hidden">
          <span>Formatter</span>
          <ChevronDown className="h-4 w-4" />
        </summary>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 sm:grid-cols-2">
          <div>Selected formatter: {displayEvidenceValue(formatterTrace.selected_formatter || formatterTrace.formatter_selected, "Deterministic")}</div>
          <div>Groq invoked: {displayEvidenceValue(formatterTrace.groq_invoked ?? formatterTrace.groq_called, "No")}</div>
          <div>Formatter invoked: {displayEvidenceValue(formatterTrace.formatter_invoked)}</div>
          <div>Completed: {displayEvidenceValue(formatterTrace.formatter_completed)}</div>
          <div>Locked identity: {formatAg3Identity(formatterTrace.locked_identity_before_formatter)}</div>
          <div>Output identity: {formatAg3Identity(formatterTrace.formatter_output_identity)}</div>
          <div>Changed locked identity: {displayEvidenceValue(formatterTrace.formatter_changed_locked_identity)}</div>
          {(formatterTrace.groq_invoked ?? formatterTrace.groq_called) !== true && (
            <div className="sm:col-span-2 text-slate-500 dark:text-slate-400">Groq was not invoked for this result.</div>
          )}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => {
          const active = lensDispositionFilter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setLensDispositionFilter(option.key)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-black transition ${
                active
                  ? "border-indigo-500 bg-indigo-600 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {option.label}
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{displayEvidenceValue(option.count, "0")}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {visibleSources.map((src, index) => {
          const disposition = getLensDisposition(src);
          const detailId = `${src.url || src.title || "lens"}-${index}`;
          return (
            <details key={detailId} className="group rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/40">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      #{displayEvidenceValue(src.raw_rank ?? src.rank ?? index + 1, index + 1)}
                    </span>
                    {renderEvidenceBadge(src, lang)}
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {formatSourceClass(src.source_class || src.source_trust_level)}
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {src.canonical_domain || src.domain || "unknown"}
                    </span>
                  </div>
                  <p className="truncate text-xs font-black text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                    {displayEvidenceValue(src.title, "Untitled source")}
                  </p>
                  <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {formatEvidenceIdentity(src)}
                  </p>
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {humanEvidenceReason(src.final_reason || src.evidence_reason, lang)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {src.url && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      aria-label="Open source"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {lang === "VI" ? "Chi tiet" : "Details"}
                    <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                  </span>
                </div>
              </summary>
              <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:grid-cols-2">
                <div>Page fetch: {displayEvidenceValue(src.page_fetch_status || src.fetch_status)}</div>
                <div>Lens score: {displayEvidenceValue(src.raw_lens_score ?? src.ranker_score ?? src.confidence)}</div>
                <div>Canonical domain: {displayEvidenceValue(src.canonical_domain || src.domain)}</div>
                <div>Complete identity: {displayEvidenceValue(src.complete_identity)}</div>
                <div>Object type: {displayEvidenceValue(src.object_type)}</div>
                <div>Independent domain: {displayEvidenceValue(src.independent_domain)}</div>
                <div>Selected vote: {displayEvidenceValue(src.selected_for_ag3_internal_vote || src.selected_for_ag3_vote)}</div>
                <div>Selected rank: {displayEvidenceValue(src.selected_rank)}</div>
                <div className="sm:col-span-2">Classification reason: {displayEvidenceValue(src.final_reason || src.evidence_reason)}</div>
                {src.url && <div className="truncate sm:col-span-2">URL: {src.url}</div>}
                {src.snippet && <p className="sm:col-span-2 line-clamp-2 font-normal">{src.snippet}</p>}
                {src.web_page_text_excerpt && (
                  <div className="sm:col-span-2 max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-normal text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    {src.web_page_text_excerpt}
                  </div>
                )}
                <div className={`sm:col-span-2 rounded-lg border px-2 py-1 text-[11px] font-bold ${dispositionTone[disposition]}`}>
                  {getDispositionLabel(disposition, lang)}
                </div>
              </div>
            </details>
          );
        })}
        {filteredSources.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllLensSources((prev) => !prev)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {showAllLensSources ? "Show fewer sources" : `Show ${filteredSources.length - 10} more sources`}
          </button>
        )}
      </div>
    </div>
  );
}

function PerObjectResult(props) {
  const {
    objectNo = 1,
    finalDenomination,
    country,
    currency,
    matchedAgents: recordedMatchedAgents,
    totalAgents,
    image,
    previewImage,
    cropPreview,
    agentResults,
    consensusValidVotes = [],
    consensusData = {},
    refereeView,
    lensSources,
    cropEvidence,
    consensusTrace,
    originalObjectData = null,
    t,
    lang,
    showVndConversion,
    originalValueText,
    vndValueText,
    hasVndRate,
    rateMetaText,
    canRecalculateWithCurrentRate,
    useCurrentRateForResult,
    onRecalculateRate,
    handleScanAnother,
    navigate,
  } = props;
  const [objectImagePreview, setObjectImagePreview] = React.useState(false);
  const [showAllLensSources, setShowAllLensSources] = React.useState(false);
  const [lensDispositionFilter, setLensDispositionFilter] = React.useState("all");

  const objectData = originalObjectData || {};
  const ag1 = getAgentDataByName(agentResults, ["agent_1", "openai", "gpt", "vision", "ag1"]) || {};
  const ag2 = getAgentDataByName(agentResults, ["agent_2", "llm", "gemini", "ag2"]) || {};
  const ag3 = getAgentDataByName(agentResults, ["agent_3", "lens", "visual", "ag3"]) || {};
  const normalizedConsensus = getNormalizedConsensus({
    consensus: {
      ...consensusData,
      valid_votes: consensusData?.valid_votes || consensusValidVotes,
    },
  });

  const allVotes = originalObjectData?.agent_votes || originalObjectData?.agentVotes || [];
  const hasTechnicalFailure = allVotes?.some(v => v.technical_error === true || String(v.status).toLowerCase() === "failed" || String(v.status).toLowerCase() === "error");
  const ag3Decision = getNormalizedAg3Decision({
    ...ag3,
    consensus: {
      ...consensusData,
      valid_votes: consensusData?.valid_votes || consensusValidVotes,
    },
  });
  const matchedAgents = getStrictConsensusMatchedCount(
    normalizedConsensus,
    ag3Decision,
    recordedMatchedAgents,
  );
  const consensusScoreText = formatConsensusScoreText(
    matchedAgents,
    toFiniteOrNull(totalAgents),
    t.notRecorded,
    matchedAgents !== null && toFiniteOrNull(totalAgents) !== null
      ? `${matchedAgents}/${toFiniteOrNull(totalAgents)}`
      : null,
  );

  const validVoteKeysSet = new Set(
    (Array.isArray(consensusValidVotes) ? consensusValidVotes : []).map((item) =>
      getAgentConsensusKey(item, item?.agent_key || item?.agent || item?.source)
    ).filter(Boolean)
  );
  const finalDecisionObj = { denomination: finalDenomination, currency, country };
  const patternText = `${matchedAgents}/${totalAgents}`;

  const getVoteData = (agentItem, agentName, agentKey) => {
    const norm = normalizeAgentVote(
      agentItem,
      agentKey,
      validVoteKeysSet,
      finalDecisionObj,
      patternText,
    );
    return { ...norm, name: getAgentDisplayName(agentItem?.agent || agentItem?.agent_name || agentName) };
  };

  const lensState = getLensEvidenceState(ag3, lensSources || [], lang);

  const normalizedAg3Vote = getVoteData(
    { agent: "AG3 Google Lens/Visual Search", data: ag3 },
    "AG3",
    "visual_search",
  );
  const ag3DisplayIdentity = ag3Decision.voteCreated
    ? ag3Decision.voteIdentity
    : ag3Decision.candidateIdentity;
  const ag3HasDisplayIdentity = Boolean(
    ag3DisplayIdentity?.country ||
    ag3DisplayIdentity?.currency ||
    ag3DisplayIdentity?.denomination !== undefined,
  );
  const votes = [
    getVoteData({ agent: "AG1 OpenAI/GPT Vision", data: ag1 }, "AG1", "ml_dl"),
    getVoteData({ agent: "AG2 Gemini/LLM", data: ag2 }, "AG2", "llm_api"),
    {
      ...normalizedAg3Vote,
      denom: ag3HasDisplayIdentity
        ? formatDenominationLabel(
            ag3DisplayIdentity.denomination,
            ag3DisplayIdentity.currency,
            normalizedAg3Vote.denom,
          )
        : normalizedAg3Vote.denom,
      country: ag3DisplayIdentity?.country || normalizedAg3Vote.country,
      currency: ag3DisplayIdentity?.currency || normalizedAg3Vote.currency,
      hasResult: ag3HasDisplayIdentity || normalizedAg3Vote.hasResult,
      hasEvidence: ag3Decision.rawCount > 0 || ag3Decision.articlePreview.length > 0,
      matched: ag3Decision.matched,
      counted: ag3Decision.counted,
      countedByBackend: ag3Decision.counted,
      isNonVoting: !ag3Decision.counted,
      voteStatus: ag3Decision.matched
        ? "matched"
        : ag3Decision.counted
          ? "different"
          : "not_counted",
      ag3Decision,
    },
  ];

  const publicEvidence = objectData?.public_evidence || {};
  const visibleTextChips = normalizeDisplayTextList(publicEvidence.visible_text);
  const keyFeaturesChips = normalizeDisplayTextList(publicEvidence.key_features);
  const rawLensSources = Array.isArray(lensSources) ? lensSources : [];
  const showLegacyLensEvidence = false;
  const qualifiedLensSources = rawLensSources.filter(
    (src) =>
      (src.qualified_source === true || src.eligible === true || getLensDisposition(src) === "supporting") &&
      src.complete_identity !== false &&
      src.independent_domain !== false,
  );
  const selectedLensSources = rawLensSources.filter(
    (src) => src.selected_for_ag3_internal_vote === true || src.selected_for_ag3_vote === true || src.selected_rank,
  );
  const visibleLensSources = showAllLensSources ? rawLensSources : rawLensSources.slice(0, 10);
  const lensSummary = ag3?.ag3_verification_summary || {};
  const lensDispositionCounts = lensSummary.disposition_counts || ag3?.disposition_counts || {};
  const lensSupportingCount = lensSummary.supporting_evidence_count ?? ag3?.supporting_evidence_count ?? lensDispositionCounts.supporting ?? rawLensSources.filter((src) => getLensDisposition(src) === "supporting").length;
  const lensPartialCount = lensSummary.partial_evidence_count ?? ag3?.partial_evidence_count ?? lensDispositionCounts.partial ?? rawLensSources.filter((src) => getLensDisposition(src) === "partial").length;
  const lensExcludedCount = lensSummary.excluded_evidence_count ?? ag3?.excluded_evidence_count ?? lensDispositionCounts.excluded ?? rawLensSources.filter((src) => getLensDisposition(src) === "excluded").length;
  const lensDuplicateCount = lensSummary.duplicate_evidence_count ?? ag3?.duplicate_evidence_count ?? lensDispositionCounts.duplicate ?? rawLensSources.filter((src) => getLensDisposition(src) === "duplicate").length;
  const formatBool = (value) => (value === true ? "Yes" : value === false ? "No" : "Unknown");
  const formatMetaValue = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "None";
    if (value === true || value === false) return formatBool(value);
    if (value === null || value === undefined || value === "") return "None";
    return String(value);
  };

  return (
    <div className="space-y-6">
      {/* 1. AI AGENT AGREEMENT (AGENT VOTES) - FULL WIDTH MOVED UP RIGHT AFTER HERO */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {lang === "VI" ? "Đồng thuận của các tác tử AI" : "AI Agent Agreement"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {normalizedConsensus?.validVoteCount < 3
                ? (lang === "VI" ? "Hai phiếu hợp lệ đã tham gia biểu quyết." : "Two valid votes participated in consensus.")
                : (lang === "VI" ? "Ba phiếu hợp lệ đã tham gia biểu quyết." : "Three valid votes participated in consensus.")}
            </p>
          </div>
          <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {consensusScoreText} {lang === "VI" ? (normalizedConsensus?.validVoteCount < 3 ? "phiếu hợp lệ khớp" : "tác tử khớp") : "agents matched"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {votes.map((vote, i) => (
            <AgentVoteCard
              key={i}
              vote={vote}
              publicEvidence={publicEvidence}
              lensSources={lensSources}
              t={t}
              lang={lang}
            />
          ))}
        </div>
      </section>

      {/* 2. MAIN DETAILS GRID (12-column grid items-start) */}
      <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-12">
        {/* LEFT col-span-7: IMAGES CARD */}
        <div className="lg:col-span-7">
          <ImagesCard
            previewImage={previewImage || image}
            cropPreview={cropPreview}
            cropSource={cropEvidence?.source || objectData?.crop_source}
            hasBbox={Boolean(objectData?.bbox || cropEvidence?.bbox)}
            t={t}
            lang={lang}
            onPreviewImage={() => (previewImage || image) && setObjectImagePreview(true)}
            onPreviewCrop={() => cropPreview && setObjectImagePreview(true)}
          />
        </div>

        {/* RIGHT col-span-5: CONVERSION, VERIFICATION SUMMARY, TOKEN USAGE */}
        <div className="space-y-4 lg:col-span-5">
          {/* Currency Conversion Card */}
          <CurrencyConversionCard
            showVndConversion={showVndConversion}
            originalValueText={originalValueText}
            vndValueText={vndValueText}
            hasVndRate={hasVndRate}
            rateMetaText={rateMetaText}
            canRecalculateWithCurrentRate={canRecalculateWithCurrentRate}
            useCurrentRateForResult={useCurrentRateForResult}
            onRecalculateRate={onRecalculateRate}
            t={t}
            lang={lang}
          />

          {/* Verification Summary Card */}
          <VerificationSummaryCard
            matchedAgents={matchedAgents}
            totalAgents={totalAgents}
            cropEvidence={cropEvidence}
            ag3Decision={ag3Decision}
            lang={lang}
          />

          {/* Token Usage Card */}
          <CompactTokenUsageCard
            billing={objectData?.billing}
            t={t}
            lang={lang}
          />
        </div>
      </div>

      <WhyThisResultCard
        matchedAgents={matchedAgents}
        finalDenomination={finalDenomination}
        cropEvidence={cropEvidence}
        originalObjectData={originalObjectData}
        ag3Decision={ag3Decision}
        refereeView={refereeView}
        t={t}
        lang={lang}
      />

      {/* 3. SUPPORTING INFORMATION GRID */}
      <div className="grid grid-cols-1 gap-6 items-start">
        {/* SUPPORTING EVIDENCE */}
        <div className="min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <Globe className="h-5 w-5 text-blue-500" />
              {t?.analysisEvidence || (lang === "VI" ? "Bằng chứng hỗ trợ" : "Supporting Evidence")}
            </h3>

            <div className="space-y-4">
              {/* Google Lens Sources */}
              <LensEvidencePanel
                rawLensSources={rawLensSources}
                ag3={ag3}
                decision={ag3Decision}
                lensState={lensState}
                lang={lang}
                lensDispositionFilter={lensDispositionFilter}
                setLensDispositionFilter={setLensDispositionFilter}
                showAllLensSources={showAllLensSources}
                setShowAllLensSources={setShowAllLensSources}
              />
              {showLegacyLensEvidence && (rawLensSources.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Raw Lens Results ({ag3.raw_lens_result_count ?? rawLensSources.length})
                    </p>
                    <span className="text-[10px] font-bold text-slate-400">
                      {lang === "VI" ? "Độc lập sau lọc" : "Verified independent"}: {ag3.eligible_independent_domain_count ?? 0}
                    </span>
                  </div>

                  {/* Verification Summary Breakdown */}
                  <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {ag3.raw_lens_result_count ?? rawLensSources.length} raw</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> {lensSupportingCount} supporting</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0" /> {lensPartialCount} partial</div>
                      <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {lensExcludedCount} excluded / {lensDuplicateCount} duplicate</div>
                      <div className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> {ag3.eligible_independent_domain_count ?? 0} {lang === "VI" ? "domain độc lập" : "independent verified domains"}</div>
                      <div className={ag3.counted_in_consensus === true ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>
                        {ag3.counted_in_consensus === true
                          ? (lang === "VI" ? "AG3 được tính vào đồng thuận" : "AG3 counted in consensus")
                          : (lang === "VI" ? "AG3 không được tính vào đồng thuận" : "AG3 not counted in consensus")}
                      </div>
                    </div>
                  </div>

                  {/* Source List or Targeted Message */}
                  {ag3?.eligible_independent_domain_count < 3 && (
                    <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3.5 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
                      {ag3?.mode === "targeted_candidate_verification"
                        ? (lang === "VI" ? "Đang tìm kiếm các nguồn bổ sung qua văn bản để đối chiếu..." : "Searching specific sources for verification...")
                        : (lang === "VI" ? "Không đủ bằng chứng độc lập hợp lệ." : "Insufficient valid independent evidence.")}
                    </div>
                  )}

                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="mb-1 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Qualified Independent Sources</div>
                      {qualifiedLensSources.length > 0 ? qualifiedLensSources.map((src, i) => (
                        <div key={`${src.url || src.title}-qualified-${i}`} className="truncate font-semibold text-slate-700 dark:text-slate-300">
                          {src.canonical_domain || src.domain || "unknown"} - {src.title}
                        </div>
                      )) : (
                        <div className="font-semibold text-slate-500 dark:text-slate-400">None</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="mb-1 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Selected Voting Set</div>
                      {selectedLensSources.length > 0 ? selectedLensSources.map((src, i) => (
                        <div key={`${src.url || src.title}-selected-${i}`} className="truncate font-semibold text-slate-700 dark:text-slate-300">
                          #{src.selected_rank || i + 1} {src.canonical_domain || src.domain || "unknown"} - {src.final_disposition || src.evidence_disposition || "unknown"}
                        </div>
                      )) : (
                        <div className="font-semibold text-slate-500 dark:text-slate-400">None</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                      {visibleLensSources.map((src, i) => (
                        <a
                          key={`${src.url || src.title}-${i}`}
                          href={src.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2 flex-wrap">
                              {renderEvidenceBadge(src, lang)}
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {src.domain || src.canonical_domain || "—"}
                              </span>
                            </div>
                            <p className="line-clamp-1 text-xs font-bold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                              {src.title}
                            </p>
                            {src.url && (
                              <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{src.url}</p>
                            )}
                            <div className="mt-2 grid gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                              <div><span className="text-slate-400">Raw rank: </span>{formatMetaValue(src.raw_rank ?? src.rank ?? i + 1)}</div>
                              <div><span className="text-slate-400">Lens score: </span>{formatMetaValue(src.raw_lens_score ?? src.ranker_score ?? src.confidence)}</div>
                              <div><span className="text-slate-400">Page fetch: </span>{formatMetaValue(src.page_fetch_status || src.fetch_status)}</div>
                              <div><span className="text-slate-400">Source class: </span>{formatMetaValue(src.source_class || src.source_trust_level)}</div>
                              <div><span className="text-slate-400">Country: </span>{formatMetaValue(src.extracted_country || src.detected_country)}</div>
                              <div><span className="text-slate-400">Currency: </span>{formatMetaValue(src.extracted_currency || src.detected_currency)}</div>
                              <div><span className="text-slate-400">Denomination: </span>{formatMetaValue(src.extracted_denomination || src.detected_amounts)}</div>
                              <div><span className="text-slate-400">Object type: </span>{formatMetaValue(src.object_type)}</div>
                              <div><span className="text-slate-400">Complete identity: </span>{formatMetaValue(src.complete_identity)}</div>
                              <div><span className="text-slate-400">Canonical domain: </span>{formatMetaValue(src.canonical_domain || src.domain)}</div>
                              <div><span className="text-slate-400">Independent domain: </span>{formatMetaValue(src.independent_domain)}</div>
                              <div><span className="text-slate-400">Disposition: </span>{formatMetaValue(src.final_disposition || src.evidence_disposition)}</div>
                              <div><span className="text-slate-400">Reason: </span>{formatMetaValue(src.final_reason || src.evidence_reason)}</div>
                              <div><span className="text-slate-400">Selected vote: </span>{formatMetaValue(src.selected_for_ag3_internal_vote || src.selected_for_ag3_vote)}</div>
                              <div><span className="text-slate-400">Selected rank: </span>{formatMetaValue(src.selected_rank)}</div>
                            </div>
                            {src.snippet && (
                              <p className="mt-2 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{src.snippet}</p>
                            )}
                            {src.web_page_text_excerpt && (
                              <p className="mt-2 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{src.web_page_text_excerpt}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500" />
                          </div>
                        </a>
                      ))}
                      {rawLensSources.length > 10 && (
                        <button
                          type="button"
                          onClick={() => setShowAllLensSources((prev) => !prev)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {showAllLensSources ? "Show less" : `Show +${rawLensSources.length - 10} raw results`}
                        </button>
                      )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  {lensState.message}
                </div>
              ))}

              {/* Visible Text Chips */}
              {visibleTextChips.length > 0 && (
                <ChipList
                  items={visibleTextChips}
                  maxDefault={6}
                  lang={lang}
                  label={lang === "VI" ? "Văn bản trên tờ tiền" : "Visible Text"}
                />
              )}

              {/* Key Features Chips */}
              {keyFeaturesChips.length > 0 && (
                <ChipList
                  items={keyFeaturesChips}
                  maxDefault={6}
                  lang={lang}
                  label={lang === "VI" ? "Đặc điểm chính" : "Key Features"}
                />
              )}

              {/* Crop Evidence (AG0) collapsed */}
              {cropEvidence && (
                <details className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                  <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                    {lang === "VI" ? "Kiểm tra AG0: Vùng cắt hợp lệ" : "AG0 Crop Check: Accepted"}
                  </summary>
                  <div className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-400">
                    <p><span className="font-semibold">Action:</span> {cropEvidence.action}</p>
                    {cropEvidence.selectedReason && (
                      <p><span className="font-semibold">Reason:</span> {cropEvidence.selectedReason}</p>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* 4. CONSENSUS TIMELINE (ONLY if array has items) */}
      {Array.isArray(consensusTrace) && consensusTrace.length > 0 && (
        <ConsensusTimelineSection
          consensusTrace={consensusTrace}
          t={t}
          lang={lang}
        />
      )}

      {/* 5. BOTTOM ACTIONS */}
      <div className="mt-8 flex flex-col justify-center gap-3 border-t border-slate-200/80 pt-6 dark:border-slate-800 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => navigate && navigate("/history")}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <History className="h-4 w-4" />
          {t?.viewHistory || (lang === "VI" ? "Xem lịch sử nhận diện" : "View Scan History")}
        </button>
        <button
          type="button"
          onClick={handleScanAnother}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-indigo-500 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
        >
          <RotateCcw className="h-4 w-4" />
          {t?.scanAnother || (lang === "VI" ? "Nhận diện tờ tiền khác" : "Scan Another Banknote")}
        </button>
      </div>

      {/* Image Lightbox Modal */}
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
    </div>
  );
}



function AgentVoteCard({ vote, publicEvidence, lensSources, t, lang }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const {
    voteStatus,
    denom,
    country,
    currency,
    confidence,
    isError,
    isDisabled,
    isNonVoting,
    hasResult,
    hasEvidence,
    name,
  } = vote;

  const isMatched = voteStatus === "matched";
  const isDifferent = voteStatus === "different";
  const isNotRecorded = voteStatus === "not_recorded";
  const isNotCounted = isNonVoting || voteStatus === "not_counted";

  const statusColor = isMatched
    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10"
    : isDifferent
      ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10"
      : "border-slate-200 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-800/40";

  const textColor = isMatched
    ? "text-emerald-700 dark:text-emerald-300"
    : isDifferent
      ? "text-amber-700 dark:text-amber-300"
      : "text-slate-600 dark:text-slate-300";

  const displayStatus = isMatched
    ? t.matched || (lang === "VI" ? "Khớp" : "Matched")
    : isDifferent
      ? t.different || (lang === "VI" ? "Khác biệt" : "Different")
      : isNotRecorded
        ? t.notRecorded
        : lang === "VI" ? "Không tính phiếu" : "Not counted";

  const showAg3Trace =
    vote?.agentKey === "visual_search" ||
    /ag3|lens|visual search/i.test(String(name || ""));

  const localizedCountry = formatCountryDisplay(country, lang);
  const providerLabel = getAg3ProviderLabel(vote?.payload);
  const formatterLabel = getAg3FormatterLabel(vote?.payload);
  const publicExplanation = showAg3Trace && vote?.ag3Decision
    ? getAg3DecisionMessage(vote.ag3Decision, lang)
    : getPublicAgentExplanation(
        vote,
        { publicEvidence, lensSources },
        lang,
      );

  return (
    <article className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 shadow-sm transition hover:shadow-md ${statusColor}`}>
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-slate-100">{name}</p>
            {showAg3Trace && (
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {t.lblProvider || "Provider"}: {providerLabel} · {t.lblFormatter || "Formatter"}: {formatterLabel}
              </p>
            )}
          </div>
          <span className={`shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-center text-[10px] font-black uppercase leading-tight backdrop-blur dark:bg-slate-950/40 ${textColor}`}>
            {displayStatus}
          </span>
        </div>

        <div className="mb-3">
          {isNotRecorded ? (
            <p className={`text-sm font-semibold ${textColor}`}>{t.notRecorded}</p>
          ) : isNotCounted && !hasResult ? (
            <div>
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
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                  {getNonVotingAgentMessage(vote, lang)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className={`text-2xl font-black tracking-tight ${textColor}`}>
                {hasResult && !isError ? denom : "—"}
              </p>
              {hasResult && !isError && (
                <p className="mt-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {localizedCountry} · {currency}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-2">
          {publicExplanation ? (
            <div>
              <p className={`${isExpanded ? "" : "line-clamp-3"} text-xs leading-5 text-slate-600 dark:text-slate-300`}>
                {publicExplanation}
              </p>
              {publicExplanation.length > 130 && (
                <button
                  type="button"
                  onClick={() => setIsExpanded((current) => !current)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {isExpanded ? t.showLess : t.readFull}
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === "VI"
                ? "Chưa ghi nhận phần giải thích công khai của tác tử này."
                : "No public explanation was recorded for this agent."}
            </p>
          )}
        </div>
      </div>

      {!isError && !isDisabled && confidence !== "N/A" && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-3 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
            {t.lblConfidence || "Confidence"}
          </span>
          <span className="text-xs font-black text-slate-800 dark:text-slate-200">
            {confidence}
          </span>
        </div>
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
          const agentResults = Array.isArray(item?.agent_votes)
            ? item.agent_votes
            : Array.isArray(item?.agent_results)
              ? item.agent_results
              : [];
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
              finalDenomination={formatDenomination(
                denomination,
                finalData.currency || finalData.currency_code || finalData.ma_tien_te,
                t.notRecorded,
              )}
              country={formatCountry(finalData.quoc_gia || finalData.country || finalData.origin)}
              currency={formatCurrency(
                finalData.currency ||
                finalData.currency_code ||
                finalData.ma_tien_te ||
                inferCurrencyFromDenomination(denomination, "N/A"),
              )}
              material={safeText(finalData.chat_lieu || finalData.material, "Không xác định")}
              origin={formatCountry(finalData.quoc_gia || finalData.country)}
              matchedAgents={toFiniteOrNull(firstDefined(item?.consensus?.display_matched_agents, finalData.matched_agents, finalData.so_luong_dong_thuan))}
              totalAgents={toFiniteOrNull(firstDefined(item?.consensus?.display_total_agents, finalData.total_agents, item?.consensus?.total_agents, item?.agent_votes?.length || null))}
              confidence={formatConfidence(firstDefined(finalData.confidence, finalData.do_tin_cay))}
              status={normalizeStatusLabel(finalData.status || "Completed", lang)}
              image={getCropImageUrl(item) || originalImageUrl}
              cropPreview={objectCropPreview}
              agentResults={agentResults}
              consensusValidVotes={finalData.valid_votes || item?.consensus?.valid_votes || []}
              consensusData={item?.consensus || finalData || {}}
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
  lang,
  onScanAnother,
}) {
  const labels = lang === "VI" ? {
    title: "Chưa thể kết luận",
    message: "Không đủ đồng thuận do tác tử kỹ thuật bị lỗi hoặc kết quả mâu thuẫn. Kết quả gợi ý bên dưới chỉ nên dùng để tham khảo.",
    originalImage: "Ảnh gốc",
    errorStatus: "Trạng thái",
    errorDetail: "Chi tiết lỗi",
    backWorkspace: "Trở lại Không Gian Làm Việc",
    scanAnother: "Quét Tờ Tiền Khác"
  } : {
    title: "No reliable conclusion",
    message: "There is not enough consensus because a technical agent failed or the results conflict. Any suggested result below should be treated as a reference only.",
    originalImage: "Original image",
    errorStatus: "Status",
    errorDetail: "Error details",
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

      </div>
    </div>
  );
}

function NoBanknoteResult({
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
