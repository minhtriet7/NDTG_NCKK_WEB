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
  if (s === "conflict" || s === "consensus_failed") return lang === "VI" ? "Chưa đạt đồng thuận" : "Consensus conflict";
  if (s === "agent_error" || s === "technical_error") return lang === "VI" ? "Lỗi kỹ thuật" : "Technical error";
  if (s === "not_banknote_or_unclear") return lang === "VI" ? "Ảnh chưa đủ rõ" : "Image is unclear";
  if (s === "partial" || s.includes("partial")) return lang === "VI" ? "Hoàn thành một phần" : "Partially completed";
  if (s === "no_banknote_detected") return lang === "VI" ? "Không phát hiện tiền" : "No banknote detected";
  if (s === "failed") return lang === "VI" ? "Thất bại" : "Failed";
  return status || "N/A";
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

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

// --- PHASE 1: Helper Functions ---
const safeText = (text, fallback = "N/A") => {
  if (text === null || text === undefined || text === "") return fallback;
  return String(text);
};

const formatCountry = (country) => {
  const c = safeText(country, "Không xác định").trim();
  if (c === "Không xác định" || c === "N/A" || c === "Multiple") return c;
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
};

const formatCurrency = (currency) => {
  const c = safeText(currency, "VND").trim();
  if (c === "Multiple" || c === "N/A") return c;
  return c.toUpperCase();
};

const formatDenomination = (denom) => {
  const d = safeText(denom, "N/A").trim();
  if (d === "N/A" || d.includes("banknotes") || d.includes("tờ tiền")) return d;
  
  const parts = d.split(" ");
  if (parts.length > 0) {
    const num = parts[0].replace(/,/g, "");
    if (!isNaN(num) && num !== "") {
      parts[0] = Number(num).toLocaleString("en-US");
      return parts.join(" ");
    }
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

const normalizeAgentVote = (agentItem, finalDenom) => {
  const payload = getAgentPayload(agentItem);
  const isErr = isTechnicalError(payload);
  const denom = getAgentDenomination(payload);
  const rawStatus = String(payload?.status || "").toLowerCase();
  const isDisabled = rawStatus === "disabled";
  const hasResult = Boolean(denom && denom !== "N/A" && !denom.toLowerCase().includes("không"));

  let voteStatus = "Technical error / Not counted";
  if (isDisabled) {
    voteStatus = "Disabled";
  } else if (!isErr && !hasResult) {
    voteStatus = "No data";
  } else if (!isErr) {
    if (denom === finalDenom && denom !== "N/A") {
      voteStatus = "Matched";
    } else {
      voteStatus = "Different";
    }
  }

  return {
    isError: isErr,
    isDisabled,
    hasResult,
    voteStatus,
    denom: formatDenomination(denom),
    country: formatCountry(getAgentCountry(payload)),
    currency: formatCurrency(payload?.currency || payload?.currency_code),
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
  if (object.crop_base64) {
    return `data:image/jpeg;base64,${object.crop_base64}`;
  }
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
        referee_view:
          final.quan_diem_trong_tai ||
          (isActuallyMulti
            ? `Detected ${detectedObjects.length} banknotes. Each object was analyzed separately.`
            : "Detected 1 banknote and analyzed it with the available AI agents."),
        valid_votes: final.valid_votes || [],
        debate_log:
          final.debate_log ||
          final.quan_diem_trong_tai ||
          buildMultiObjectDebateLog(detectedObjects, "EN"),
      },
      multi_object: isActuallyMulti,
      detected_objects: detectedObjects,
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
    multi_object: false,
    detected_objects: detectedObjects,
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

  const { currentScanSession } = useRecognitionStore();
  const { ratesData, fetchRates } = useCurrencyStore();
  const { lang } = useLanguageStore();

  const [showRawLog, setShowRawLog] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [imagePreview, setImagePreview] = useState(null);

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
      lblConfidence: "Confidence",
      lblVisualSearch: "Google Lens",
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
      viewImage: "View image",
      technicalDetails: "Technical details",
      analysisEvidence: "Analysis evidence",
      lblAggregator: "Referee",
      techError: "Technical error / Not counted",
      advDebug: "Advanced Debug",
      whyChosen: "Why did the system choose this result?",
      consensusTimeline: "Consensus Timeline",
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
      tokenUsageTitle: "Lượt dùng token",
      tokenUsageDesc: "Số token thực tế đã trừ cho lần nhận diện này.",
      tokensCharged: "Token đã trừ",
      balanceBefore: "Số dư trước",
      balanceAfter: "Số dư sau",
      aiTokens: "AI token",
      billableTokens: "AI token tính phí",
      billingMode: "Chế độ tính phí",
      inputOutputTokens: "Đầu vào / Đầu ra",
      lblConfidence: "Độ tin cậy",
      lblVisualSearch: "Google Lens",
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
      viewImage: "Xem ảnh",
      technicalDetails: "Chi tiết kỹ thuật",
      analysisEvidence: "Bằng chứng phân tích",
      lblAggregator: "Trọng tài tổng hợp",
      techError: "Lỗi kỹ thuật / Không tính",
      advDebug: "Gỡ lỗi chuyên sâu",
      whyChosen: "Tại sao hệ thống chọn kết quả này?",
      consensusTimeline: "Tiến trình đồng thuận",
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
  const detectedObjects = Array.isArray(currentItem?.detected_objects)
    ? currentItem.detected_objects
    : [];
  const primaryObject = detectedObjects[0] || null;
  const fallbackAgentResults =
    currentItem?.raw_backend?.agent_results ||
    currentItem?.raw_backend?.result?.agent_results ||
    [];
  const singleAgentResults =
    primaryObject?.agent_results ||
    fallbackAgentResults;

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
  const primaryCropImage = getCropImageUrl(primaryObject);
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
    const backendVndValue = getBackendVndValue(currentItem?.conversion_result);

    if (amountNumber <= 0 || !finalCurrency || finalCurrency === "N/A") {
      return null;
    }

    if (backendVndValue !== null) {
      return [
        {
          code: "VND",
          name: lang === "VI" ? "Giá trị quy đổi từ backend" : "Backend conversion",
          value: backendVndValue,
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
        },
      ];
    }

    return [
      {
        code: "VND",
        name: "Việt Nam Đồng",
        value: amountNumber * rateToVnd,
      },
    ];
  }, [currentItem?.conversion_result, finalDenomination, finalCurrency, lang, ratesData]);
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
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition shadow-md shadow-indigo-500/20"
          >
            {t.backWorkspace}
          </button>
        </div>
      </div>
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

        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
          <div className="border-b border-white/10 px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-400">
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
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t.feedback}
                </button>
                <button
                  onClick={() => navigate("/history")}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  <History className="h-4 w-4" />
                  {t.viewHistory}
                </button>
                <button
                  onClick={() => navigate("/recognize")}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3.5 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
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
                <span className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-200">
                  {isMulti
                    ? lang === "VI"
                      ? `${detectedObjects.length} tờ tiền`
                      : `${detectedObjects.length} banknotes`
                    : `${matchedAgents}/3 ${t.agents}`}
                </span>
              </div>
              <p className="text-sm font-bold text-cyan-300">{t.finalDecision}</p>
              <h1 className="mt-2 break-words text-4xl font-black leading-none text-white sm:text-5xl">
                {finalDenomination}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {stripMarkdownSymbols(consensusText)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
              <HeroMetric label={t.lblCountry} value={finalCountry} />
              <HeroMetric label={t.lblCurrency} value={finalCurrency} />
              <HeroMetric label={t.lblConfidence} value={finalConfidence} accent />
              <HeroMetric label={t.lblConsensus} value={getConsensusStatusLabel(consensus, lang)} />
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
                <ImagePreviewButton
                  src={primaryCropImage}
                  alt={t.cropPreview}
                  emptyText={t.cropUnavailable}
                  onPreview={() => primaryCropImage && setImagePreview({ src: primaryCropImage, alt: t.cropPreview })}
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

            {!isMulti && (
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
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className={`text-xs font-semibold ${hasVndRate ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {hasVndRate ? t.rateAvailable : t.rateUnavailable}
                    </p>
                    <Link
                      to="/exchange"
                      className="inline-flex items-center gap-1.5 text-sm font-black text-emerald-800 hover:underline dark:text-emerald-200"
                    >
                      {t.openConverter}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {!isMulti && exchangeResults && exchangeResults.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.exchangeTitle}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.exchangeDesc}</p>
              </div>
              <Link to="/exchange" className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline dark:text-indigo-400">
                {t.fullConverter}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {exchangeResults.map((item) => (
                <div key={`${item.code}-${item.name}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-xs font-black uppercase text-slate-400">{item.code}</p>
                  <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">
                    {item.value === null
                      ? "—"
                      : new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US", {
                          maximumFractionDigits: item.code === "VND" ? 0 : 2,
                        }).format(item.value)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.name}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {isMulti ? (
          <MultiObjectResults currentItem={currentItem} t={t} lang={lang} />
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
            agentResults={singleAgentResults}
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
            t={t}
            lang={lang}
            ratesData={ratesData}
            parseAmountFromDenomination={parseAmountFromDenomination}
            isSingleObject
          />
        )}

        <TokenUsageCard currentItem={currentItem} t={t} />

        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
          <button
            onClick={() => setShowRawLog(!showRawLog)}
            className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-white">{t.advDebug || "Advanced Debug"}</h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  {lang === "VI" ? "Nhật ký đồng thuận và JSON dành cho kiểm tra kỹ thuật" : "Consensus log and raw JSON for technical review"}
                </p>
              </div>
            </div>
            {showRawLog ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />}
          </button>

          {showRawLog && (
            <div className="space-y-5 border-t border-slate-800 p-5">
              <div>
                <p className="mb-2 text-xs font-black uppercase text-slate-500">{t.fullLogTitle}</p>
                <div className="max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-emerald-300">
                  <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-black uppercase text-slate-500">{t.jsonTitle}</p>
                  <div className="flex gap-2">
                    <button onClick={handleCopyJSON} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800">
                      <Copy className="h-3.5 w-3.5" />
                      {t.copy}
                    </button>
                    <button onClick={handleDownloadJSON} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500">
                      <Download className="h-3.5 w-3.5" />
                      {t.download}
                    </button>
                  </div>
                </div>
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-emerald-300">
                  {JSON.stringify(currentItem, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>

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
              onClick={() => navigate("/recognize")}
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
          <img
            src={imagePreview.src}
            alt={imagePreview.alt}
            className="max-h-[88vh] max-w-[94vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value, accent = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-black ${accent ? "text-cyan-300" : "text-white"}`}>
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
  agentResults,
  refereeView,
  lensPayload,
  lensSources,
  cropEvidence,
  consensusTrace,
  conversionResult,
  t,
  lang,
  ratesData,
  parseAmountFromDenomination,
  isSingleObject
}) {
  const [openSections, setOpenSections] = React.useState({
    details: true,
    crop: true,
    agents: true,
    lens: true,
    why: true,
    timeline: false
  });
  const [objectImagePreview, setObjectImagePreview] = React.useState(false);

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

  const getVoteData = (agentItem, agentName) => {
    const norm = normalizeAgentVote(agentItem, finalDenomination);
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
    getVoteData({ agent: "AG1 OpenAI/GPT Vision", data: ag1 }, "AG1"),
    getVoteData({ agent: "AG2 Gemini/LLM", data: ag2 }, "AG2"),
    getVoteData({ agent: "AG3 Google Lens/Visual Search", data: ag3 }, "AG3")
  ];

  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${!isSingleObject ? "mt-4" : ""}`}>
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          {!isSingleObject && image && (
            <button
              type="button"
              onClick={() => setObjectImagePreview(true)}
              className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              aria-label={lang === "VI" ? "Xem ảnh crop" : "View crop image"}
            >
              <img src={image} alt="Crop" className="h-full w-full object-cover" />
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
          <DetailItem label={t.vndEquivalent || "VND Equivalent"} value={getVndText()} />
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
      <CollapsibleSection title={`D. ${t.lblVisualSearch || "Google Lens Evidence"}`} isOpen={openSections.lens} toggle={() => toggleSection('lens')}>
        {lensSources && lensSources.length > 0 ? (
          <div className="space-y-3">
            {lensSources.slice(0, 5).map((src, i) => {
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
                            score {sourceScore.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {src.snippet && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{src.snippet}</p>}
                    </div>
                  </div>
                </SourceElement>
              );
            })}
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
         <div className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700 dark:prose-invert dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
            <ReactMarkdown>{refereeView || (lang === "VI" ? "Không có giải thích chi tiết." : "No referee reasoning provided.")}</ReactMarkdown>
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
      {objectImagePreview && image && (
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
          <img
            src={image}
            alt={lang === "VI" ? `Ảnh crop tờ tiền ${objectNo}` : `Banknote crop ${objectNo}`}
            className="max-h-[88vh] max-w-[94vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
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
  const { voteStatus, denom, country, currency, reasoning, confidence, isError, isDisabled, hasResult, name } = vote;
  const isMatched = voteStatus === "Matched";
  const isNoData = voteStatus === "No data";
  const statusColor = isError
    ? "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10"
    : isDisabled || isNoData
      ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
      : isMatched
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
        : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10";
  const textColor = isError
    ? "text-rose-700 dark:text-rose-300"
    : isDisabled || isNoData
      ? "text-slate-600 dark:text-slate-300"
      : isMatched
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-amber-700 dark:text-amber-300";
  const displayStatus = isError
    ? t.techError || "Technical error"
    : isDisabled
      ? lang === "VI" ? "Đã tắt" : "Disabled"
      : isNoData
        ? lang === "VI" ? "Không có dữ liệu" : "No data"
        : isMatched
          ? t.matched || "Matched"
          : t.different || "Different";

  return (
    <article className={`flex h-full flex-col rounded-lg border p-4 ${statusColor}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm font-black text-slate-900 dark:text-slate-100">{name}</p>
        <span className={`max-w-[120px] rounded-full bg-white/65 px-2.5 py-1 text-center text-[10px] font-black uppercase leading-tight dark:bg-slate-950/30 ${textColor}`}>
          {displayStatus}
        </span>
      </div>
      <div className="mb-4 space-y-1">
        <p className={`text-xl font-black ${textColor}`}>{hasResult && !isError ? denom : "—"}</p>
        {hasResult && !isError && (
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{country} · {currency}</p>
        )}
      </div>
      {reasoning && reasoning !== "N/A" && (
        <p className="line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{reasoning}</p>
      )}
      {!isError && !isDisabled && confidence !== "N/A" && (
        <p className="mt-auto border-t border-current/10 pt-3 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
          {t.lblConfidence || "Confidence"}: {confidence}
        </p>
      )}
    </article>
  );
}

function MultiObjectResults({ currentItem, t, lang }) {
  const objects = Array.isArray(currentItem?.detected_objects) ? currentItem.detected_objects : [];
  if (!objects.length) return null;

  const { ratesData } = useCurrencyStore();

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
              image={item?.crop_base64 ? `data:image/jpeg;base64,${item.crop_base64}` : currentItem?.image_url}
              agentResults={agentResults}
              refereeView={stripMarkdownSymbols(finalData.quan_diem_trong_tai || finalData.referee_view || finalData.reasoning)}
              lensPayload={lensPayload}
              lensSources={normalizeLensSources(lensPayload)}
              cropEvidence={normalizeCropEvidence(item)}
              consensusTrace={normalizeConsensusTrace(item, finalData)}
              conversionResult={null}
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
              {systemTokensCharged ?? "N/A"} {String(t.tokensCharged).toLowerCase()}
            </p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-5 dark:border-slate-800">
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
              value={billingMode ?? "N/A"}
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

function AgentCard({ agentKey, title, method, data, finalDenomination, t, agentType }) {
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

  if (!data) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className={`bg-gradient-to-br ${headerGradient} p-4 flex items-center gap-3`}>
          <span className="text-slate-400">{agentIcon}</span>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{agentKey}</span>
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.noAgentData}</p>
        </div>
      </div>
    );
  }

  const agentDenomination = getAgentDenomination(data);
  const isMatched = agentDenomination !== "N/A" && finalDenomination !== "N/A" && agentDenomination && finalDenomination && String(agentDenomination).toLowerCase().trim() === String(finalDenomination).toLowerCase().trim();
  const reasoningText = stripMarkdownSymbols(getAgentReasoning(data));
  const confidence = data?.confidence || data?.do_tin_cay || data?.confidence_score;
  const confNum = confidence !== undefined && confidence !== null
    ? (Number(confidence) <= 1 ? Number(confidence) * 100 : Number(confidence))
    : null;

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
