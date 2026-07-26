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
    myanmar: "myanmar",
    burma: "myanmar",
  };
  return aliases[text] || text;
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
