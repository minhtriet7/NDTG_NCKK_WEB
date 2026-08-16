const INVALID_CURRENCY_VALUES = new Set([
  "",
  "NULL",
  "N/A",
  "NA",
  "UNKNOWN",
  "KHÔNG XÁC ĐỊNH",
]);

export const normalizeMoneyText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const parseMoneyAmount = (value) => {
  const numberText = String(value || "")
    .replace(/[^\d.,]/g, "")
    .replace(/[.,]/g, "");
  const amount = Number.parseInt(numberText, 10);
  return Number.isFinite(amount) ? amount : null;
};

export const normalizeCurrencyCode = (value) => {
  const text = String(value || "").toUpperCase().trim();
  if (INVALID_CURRENCY_VALUES.has(text)) return null;
  if (/^[A-Z]{3}$/.test(text)) return text;

  const amountThenCode = text.match(/(?:^|[^\d])\d[\d.,\s]*\s+([A-Z]{3})(?![A-Z])/);
  if (amountThenCode) return amountThenCode[1];

  const codeThenAmount = text.match(/(?:^|[^A-Z])([A-Z]{3})\s+\d/);
  return codeThenAmount?.[1] || null;
};

export const inferMoneyCurrency = (denomination, fallbackCurrency = null) =>
  normalizeCurrencyCode(fallbackCurrency) || normalizeCurrencyCode(denomination);

export const normalizeCountryCanonical = (country) => {
  const text = normalizeMoneyText(country);
  const aliases = {
    "viet nam": "vietnam",
    vietnam: "vietnam",
    vn: "vietnam",
    usa: "united states",
    us: "united states",
    "united states": "united states",
    "hoa ky": "united states",
    myanmar: "myanmar",
    burma: "myanmar",
    "thailand": "thailand",
    "thai lan": "thailand",
    "laos": "laos",
    "lao": "laos",
    "cambodia": "cambodia",
    "campuchia": "cambodia",
    "japan": "japan",
    "nhat ban": "japan",
    "china": "china",
    "trung quoc": "china",
    "south korea": "south korea",
    "han quoc": "south korea",
  };
  return aliases[text] || text;
};

export const formatCountryDisplay = (country, lang = "EN") => {
  if (!country) return lang === "VI" ? "Không xác định" : "Not recorded";
  const str = String(country).trim();
  if (
    !str ||
    ["n/a", "unknown", "không xác định", "chua ghi nhan", "not recorded", "null"].includes(
      str.toLowerCase(),
    )
  ) {
    return lang === "VI" ? "Không xác định" : "Not recorded";
  }
  if (str.toLowerCase() === "multiple") return "Multiple";

  const canonical = normalizeCountryCanonical(str);

  const EN_MAP = {
    "united states": "United States",
    vietnam: "Vietnam",
    myanmar: "Myanmar",
    thailand: "Thailand",
    laos: "Laos",
    cambodia: "Cambodia",
    japan: "Japan",
    china: "China",
    "south korea": "South Korea",
    eurozone: "Eurozone",
    "united kingdom": "United Kingdom",
  };

  const VI_MAP = {
    "united states": "Hoa Kỳ",
    vietnam: "Việt Nam",
    myanmar: "Myanmar",
    thailand: "Thái Lan",
    laos: "Lào",
    cambodia: "Campuchia",
    japan: "Nhật Bản",
    china: "Trung Quốc",
    "south korea": "Hàn Quốc",
    eurozone: "Khu vực đồng Euro",
    "united kingdom": "Vương quốc Anh",
  };

  if (String(lang).toUpperCase() === "VI") {
    return VI_MAP[canonical] || str;
  }
  return EN_MAP[canonical] || str.charAt(0).toUpperCase() + str.slice(1);
};

export const buildMoneyCanonical = ({ denomination, currency, country }) => ({
  amount: parseMoneyAmount(denomination),
  currency: inferMoneyCurrency(denomination, currency),
  country: normalizeCountryCanonical(country),
});

export const isSameMoneyVote = (agentCanonical, finalCanonical) =>
  Boolean(
    agentCanonical &&
      finalCanonical &&
      agentCanonical.amount !== null &&
      finalCanonical.amount !== null &&
      agentCanonical.amount === finalCanonical.amount &&
      agentCanonical.currency &&
      finalCanonical.currency &&
      agentCanonical.currency === finalCanonical.currency &&
      agentCanonical.country &&
      finalCanonical.country &&
      agentCanonical.country === finalCanonical.country,
  );

export const normalizeConsensusAgentKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (
    text === "ml_dl" ||
    ["agent_1", "agent 1", "ag1", "openai", "gpt"].some((key) => text.includes(key))
  ) return "ml_dl";
  if (
    text === "llm_api" ||
    ["agent_2", "agent 2", "ag2", "gemini", "llm"].some((key) => text.includes(key))
  ) return "llm_api";
  if (
    text === "visual_search" ||
    ["agent_3", "agent 3", "ag3", "google lens", "lens", "visual search"].some(
      (key) => text.includes(key),
    )
  ) return "visual_search";
  return null;
};

export const findBackendValidVote = (validVotes, agentKey) => {
  if (!Array.isArray(validVotes) || !agentKey) return null;
  return validVotes.find((vote) => {
    const candidates = [
      vote?.agent_key,
      vote?.agent,
      vote?.agent_name,
      vote?.source,
      vote?.name,
    ];
    return candidates.some((candidate) => normalizeConsensusAgentKey(candidate) === agentKey);
  }) || null;
};

export const resolveAgentVoteStatus = ({
  nonVoting,
  rawStatus,
  backendVoteMatchesFinal,
  fallbackMatchesFinal,
}) => {
  if (nonVoting) return "not_counted";
  if (backendVoteMatchesFinal || fallbackMatchesFinal) return "matched";
  return rawStatus === "completed" ? "different" : "not_counted";
};

export const sanitizeSuggestedResult = (suggested) => {
  if (!suggested || typeof suggested !== "object") return null;

  const country = String(suggested.country || suggested.quoc_gia || "").trim();
  const currencyCode = normalizeCurrencyCode(
    suggested.currency_code || suggested.ma_tien_te || suggested.currency,
  );
  const amount =
    suggested.amount !== undefined && suggested.amount !== null
      ? suggested.amount
      : parseMoneyAmount(suggested.final_denomination || suggested.menh_gia);

  if (!country || !currencyCode || amount === null || amount === undefined || amount === "") {
    return null;
  }

  return {
    country,
    currency_code: currencyCode,
    amount,
    agent_key: suggested.agent_key || null,
    confidence:
      suggested.confidence !== undefined && suggested.confidence !== null
        ? suggested.confidence
        : null,
  };
};

export const formatSuggestedResultText = (suggested, lang = "VI") => {
  const safe = sanitizeSuggestedResult(suggested);
  if (!safe) return "";

  const label =
    lang === "VI" ? "Gợi ý từ tác tử hợp lệ" : "Suggested by a valid agent";
  return `${label}: ${safe.country} — ${safe.amount} ${safe.currency_code}.`;
};

export const buildRecognitionRestoreKey = (taskId, resultId) => {
  const normalizedTaskId = String(taskId || "").trim();
  if (normalizedTaskId) return `task:${normalizedTaskId}`;

  const normalizedResultId = String(resultId || "").trim();
  if (normalizedResultId) return `result:${normalizedResultId}`;

  return null;
};

export const shouldRefetchRecognitionResult = ({
  rawResult,
  taskId,
  resultId,
  isRestoring = false,
  restoreError = null,
  hasRestored = false,
  lastRestoreKey = null,
} = {}) => {
  if (isRestoring) return false;

  const restoreKey = buildRecognitionRestoreKey(taskId, resultId);
  if (restoreKey) {
    return restoreKey !== lastRestoreKey;
  }

  if (rawResult && !restoreError) return false;
  return !hasRestored;
};

const normalizeTraceText = (value) => String(value || "").trim();

const normalizeTraceKey = (value) => normalizeTraceText(value).toLowerCase();

const FORMATTER_PROVIDER_VALUES = new Set(["groq", "deterministic", "none", "gemini"]);

export const isAg3GroqFormatterUsed = (agent) => {
  const formatterProvider = normalizeTraceKey(agent?.formatter_provider);
  return (
    agent?.ag3_groq_formatter_used === true ||
    (agent?.groq_called === true && formatterProvider === "groq")
  );
};

export const getAg3ProviderLabel = (agent, fallback = "SerpAPI") => {
  const selectedProvider = normalizeTraceText(
    agent?.provider_trace?.selected_provider ||
      agent?.provider ||
      agent?.source_provider ||
      fallback,
  );
  const providerKey = selectedProvider.toLowerCase();
  if (!selectedProvider || FORMATTER_PROVIDER_VALUES.has(providerKey)) return fallback;
  if (providerKey === "serpapi") return "SerpAPI";
  return selectedProvider;
};

export const getAg3FormatterLabel = (agent) => {
  const formatterProvider = normalizeTraceKey(agent?.formatter_provider);
  if (isAg3GroqFormatterUsed(agent)) return "Groq";
  if (formatterProvider === "none") return "None";
  return "Deterministic";
};

export const getAg3MethodLabel = (agent, fallback = "Google Lens / SerpAPI") => {
  const rawMethod = normalizeTraceText(agent?.phuong_phap || agent?.method || fallback);
  if (isAg3GroqFormatterUsed(agent)) return rawMethod || "Google Lens / SerpAPI + Groq Formatter";

  const withoutGroq = rawMethod
    .replace(/\s*(?:\+|\/)?\s*Groq\s+Formatter\b/gi, "")
    .replace(/\s*Google Lens\s*\+\s*/i, "Google Lens / ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return withoutGroq || "Google Lens / SerpAPI";
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const normalizeCropBbox = (bbox) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const values = bbox.map(toFiniteNumber);
  if (values.some((value) => value === null)) return null;

  const [x1, y1, x2, y2] = values;
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;

  return { x1, y1, x2, y2, width, height };
};

export const getCropPreviewSource = (object, originalImageUrl) => {
  if (!object || typeof object !== "object") return null;

  const directUrl =
    object.crop_image_url ||
    object.cropped_image_url ||
    object.selected_crop_url ||
    null;
  if (directUrl && !String(directUrl).startsWith("data:")) {
    return {
      kind: "image",
      src: directUrl,
      crop_source: object.crop_source || null,
    };
  }

  const bbox = normalizeCropBbox(object.bbox);
  const sourceImage = String(
    originalImageUrl ||
      object.input_image_url ||
      object.image_url ||
      object.uploaded_image_url ||
      "",
  ).trim();

  if (!bbox || !sourceImage || sourceImage.startsWith("data:")) return null;

  return {
    kind: "bbox",
    imageUrl: sourceImage,
    bbox,
    crop_width: toFiniteNumber(object.crop_width) || bbox.width,
    crop_height: toFiniteNumber(object.crop_height) || bbox.height,
    crop_source: object.crop_source || null,
  };
};

export const isInternalMachineReason = (value) => {
  if (!value) return true;
  const text = String(value).trim();
  if (!text || text === "N/A" || text === "null" || text === "undefined") return true;

  const knownInternalCodes = new Set([
    "single_untrusted_page_text_source",
    "insufficient_support_signals",
    "insufficient_independent_evidence",
    "insufficient_direct_title_or_snippet_support",
    "page_text_support_required_for_two_sources",
    "weak_single_lens_evidence",
    "weak_source_only",
    "single_untrusted_source",
    "weak_commercial_source_not_counted",
    "no_valid_sources",
    "no_lens_results",
    "search_error",
    "timeout",
    "technical_error",
    "not_counted",
    "not_recorded",
  ]);

  if (knownInternalCodes.has(text.toLowerCase())) return true;
  if (/^[a-z0-9_]{3,}$/.test(text) && text.includes("_")) return true;

  return false;
};

export const cleanLensTitle = (title, maxLen = 100) => {
  if (!title) return "";
  let cleaned = String(title)
    .replace(/<[^>]*>/g, "")
    .trim();

  if (/^https?:\/\//i.test(cleaned)) {
    return "";
  }

  cleaned = cleaned.replace(/[\s.,;:_…\-\u2026]+$/g, "").trim();
  if (!cleaned) return "";

  if (cleaned.length > maxLen) {
    const truncated = cleaned.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 50) {
      cleaned = truncated.slice(0, lastSpace).trim();
    } else {
      cleaned = truncated.trim();
    }
    cleaned = cleaned.replace(/[\s.,;:_…\-\u2026]+$/g, "").trim();
  }

  return cleaned;
};

export const getPublicAgentExplanation = (vote, context = {}, lang = "VI") => {
  if (!vote || typeof vote !== "object") {
    return String(lang).toUpperCase() === "VI"
      ? "Chưa ghi nhận phần giải thích công khai của tác tử này."
      : "No public explanation was recorded for this agent.";
  }

  const {
    denom,
    country,
    reasoning,
    voteStatus,
    agentKey,
    payload,
    evidence,
  } = vote;

  const sourcePayload = payload || {};
  const isLanguageVi = String(lang).toUpperCase() === "VI";

  // 1. Check explicit public summary / explanation fields first
  const explicitText = String(
    sourcePayload.public_summary ||
      sourcePayload.public_explanation ||
      sourcePayload.explanation ||
      sourcePayload.publicSummary ||
      sourcePayload.publicExplanation ||
      vote.public_summary ||
      vote.public_explanation ||
      vote.explanation ||
      vote.publicSummary ||
      vote.publicExplanation ||
      "",
  ).trim();

  if (
    explicitText &&
    explicitText !== "N/A" &&
    explicitText !== "Not recorded" &&
    explicitText !== "Chưa ghi nhận" &&
    explicitText !== "Chua ghi nhan" &&
    !isInternalMachineReason(explicitText)
  ) {
    return explicitText;
  }

  // 2. Check reason / reasoning fields next
  const reasonText = String(
    sourcePayload.reason ||
      vote.reason ||
      sourcePayload.reasoning ||
      reasoning ||
      "",
  ).trim();

  const isGeneric =
    !reasonText ||
    reasonText === "N/A" ||
    reasonText === "Not recorded" ||
    reasonText === "Chua ghi nhan" ||
    reasonText === "Chưa ghi nhận" ||
    reasonText.includes("Phân tích đặc điểm thị giác") ||
    reasonText.includes("Analyzed visual banknote") ||
    isInternalMachineReason(reasonText);

  if (!isGeneric) {
    return reasonText;
  }

  // 3. If vote status is failed or not_recorded, return standardized fallback
  if (voteStatus === "not_recorded" || voteStatus === "failed") {
    return isLanguageVi
      ? "Chưa ghi nhận phần giải thích công khai của tác tử này."
      : "No public explanation was recorded for this agent.";
  }

  // 4. Build structured agent-specific summary if no explicit backend text is present
  const key = String(agentKey || vote.agent_key || "").toLowerCase();
  const normalizedCountry =
    country && country !== "Not recorded" && country !== "Không xác định"
      ? country
      : "";
  const normalizedDenom =
    denom && denom !== "N/A" && denom !== "Not recorded" ? denom : "";

  if (
    key === "ml_dl" ||
    key.includes("ag1") ||
    key.includes("vision") ||
    key.includes("gpt")
  ) {
    const visibleText =
      context?.publicEvidence?.visible_text || sourcePayload?.visible_text || [];
    const keyFeatures =
      context?.publicEvidence?.key_features || sourcePayload?.key_features || [];
    const textClues = [...visibleText, ...keyFeatures]
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");

    if (textClues) {
      return isLanguageVi
        ? `Nhận diện đặc điểm "${textClues}" và chi tiết nhận dạng của tiền ${normalizedCountry || "giấy"}.`
        : `Recognized features "${textClues}" and security patterns of ${normalizedCountry || "banknote"}.`;
    }

    if (normalizedDenom) {
      return isLanguageVi
        ? `Nhận diện đặc điểm thị giác tờ tiền ${normalizedDenom}${normalizedCountry ? ` (${normalizedCountry})` : ""}.`
        : `Recognized visual features of banknote ${normalizedDenom}${normalizedCountry ? ` (${normalizedCountry})` : ""}.`;
    }
  } else if (
    key === "llm_api" ||
    key.includes("ag2") ||
    key.includes("gemini") ||
    key.includes("llm")
  ) {
    if (normalizedDenom) {
      return isLanguageVi
        ? `Đối chiếu mệnh giá, quốc gia và bố cục tờ tiền cho kết quả ${normalizedDenom}${normalizedCountry ? ` (${normalizedCountry})` : ""}.`
        : `Verified denomination, country, and currency layout for ${normalizedDenom}${normalizedCountry ? ` (${normalizedCountry})` : ""}.`;
    }
  } else if (
    key === "visual_search" ||
    key.includes("ag3") ||
    key.includes("lens") ||
    key.includes("visual")
  ) {
    const lensSources =
      context?.lensSources || evidence || sourcePayload?.lens_evidence || [];
    const ag3Summary = sourcePayload?.ag3_verification_summary || {};
    const rawCount = ag3Summary?.total_raw_evidence_count ?? sourcePayload?.raw_lens_result_count ?? (Array.isArray(lensSources) ? lensSources.length : 0);
    const candidateSourceCount = ag3Summary?.candidate_source_count ?? sourcePayload?.candidate_source_count ?? sourcePayload?.eligible_independent_domain_count ?? (Array.isArray(lensSources) ? new Set(lensSources.map(s => s.domain || s.canonical_domain).filter(Boolean)).size : 0);
    const requiredSourceCount = ag3Summary?.required_selected_source_count ?? sourcePayload?.required_selected_source_count ?? 3;
    const effectiveSelectedCount = ag3Summary?.selected_source_count || sourcePayload?.selected_source_count || sourcePayload?.selected_voting_source_count || (ag3Summary?.vote_created ? 3 : 0);
    const effectiveCandidateCount = Math.max(candidateSourceCount, effectiveSelectedCount);
    const explicitlyNotCounted = sourcePayload?.not_counted_in_consensus === true;
    const countedSignal = explicitlyNotCounted
      ? false
      : sourcePayload?.counted_in_consensus === true ||
        sourcePayload?.counted_by_backend === true ||
        sourcePayload?.counted === true ||
        vote?.counted_in_consensus === true ||
        vote?.counted === true;
    const isCounted = Boolean(countedSignal);
    const promotionReason = sourcePayload?.promotion_reason || sourcePayload?.reason || "";

    const topTitle =
      lensSources.length > 0
        ? cleanLensTitle(lensSources[0]?.title || lensSources[0]?.snippet || "", 100)
        : "";
    const denomText = normalizedDenom || (isLanguageVi ? "tờ tiền" : "banknote");

    if (isCounted && (effectiveSelectedCount >= 3 || candidateSourceCount >= 3)) {
      const displayCount = effectiveSelectedCount >= 3 ? effectiveSelectedCount : Math.min(5, Math.max(3, candidateSourceCount));
      if (isLanguageVi) {
        return topTitle
          ? `Có ${displayCount} nguồn độc lập trong tập biểu quyết xác thực kết quả ${denomText}. Nguồn nổi bật: ${topTitle}.`
          : `Có ${displayCount} nguồn độc lập trong tập biểu quyết xác thực kết quả ${denomText}.`;
      }
      return topTitle
        ? `${displayCount} verified independent sources formed the voting set for ${denomText}. Top source: ${topTitle}.`
        : `${displayCount} verified independent sources formed the voting set for ${denomText}.`;
    }

    const majorityAchieved = ag3Summary?.majority_achieved || sourcePayload?.majority_achieved || 0;
    const reasonText = promotionReason.includes("conflicting")
      ? (isLanguageVi ? "Phát hiện xung đột mệnh giá trong kết quả tìm kiếm." : "Conflicting denomination found in search results.")
      : effectiveCandidateCount >= 3
        ? (isLanguageVi ? `Đã xem xét ${effectiveCandidateCount} nguồn độc lập nhưng chỉ có ${majorityAchieved} nguồn cùng xác nhận kết quả (cần tối thiểu 3 nguồn đồng thuận).` : `Reviewed ${effectiveCandidateCount} independent sources, but only ${majorityAchieved} supported the same exact identity. At least 3 matching sources are required.`)
        : (isLanguageVi ? `Cần tối thiểu 3 nguồn độc lập trước khi biểu quyết.` : `At least 3 independent sources are required before voting.`);

    if (isLanguageVi) {
      return `Chưa đủ bằng chứng Google Lens được xác thực. Tìm thấy ${rawCount} kết quả và ${candidateSourceCount} nguồn phù hợp. Lí do: ${reasonText}`;
    }
    const suitableSourceLabel = candidateSourceCount === 1 ? "suitable source" : "suitable sources";
    return `Not enough verified Lens evidence. ${rawCount} Lens results and ${candidateSourceCount} ${suitableSourceLabel} were found. Reason: ${reasonText}`;
  }

  return isLanguageVi
    ? "Chưa ghi nhận phần giải thích công khai của tác tử này."
    : "No public explanation was recorded for this agent.";
};
