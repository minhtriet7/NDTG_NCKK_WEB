import {
  inferMoneyCurrency,
  normalizeConsensusAgentKey,
  parseMoneyAmount,
} from "./agentVote.js";

const RAW_BLOCKED_KEYS = new Set([
  "raw_backend",
  "raw_result",
  "final_result",
  "agent_results",
  "provider_trace",
  "promotion_trace",
  "consensus_trace",
  "vote_groups",
  "candidate_queries",
  "debate_log",
  "model_attempts",
  "retry_diagnostics",
  "traceback",
  "stack_trace",
  "stacktrace",
  "token_usage",
  "balance_before",
  "balance_after",
  "input_image_path",
  "crop_base64",
  "crop_bytes",
  "prompt",
]);

const PUBLIC_AGENT_KEYS = ["ml_dl", "llm_api", "visual_search"];
const NORMALIZED_MARKER = "__normalizedUserResult";

const hasOwn = (value, key) =>
  Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

const firstDefined = (...values) => {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toSafeString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text === "undefined" || text === "null") return fallback;
  if (text.startsWith("data:image/")) return fallback;
  return text;
};

const toPublicBoolean = (...values) => {
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

const stripBlockedKeys = (value) => {
  if (Array.isArray(value)) return value.map(stripBlockedKeys);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !RAW_BLOCKED_KEYS.has(key))
      .map(([key, item]) => [key, stripBlockedKeys(item)]),
  );
};

const getAgentKey = (vote, fallback = null) =>
  normalizeConsensusAgentKey(
    vote?.agent_key ||
      vote?.agent ||
      vote?.agent_name ||
      vote?.name ||
      vote?.source ||
      fallback,
  ) || fallback;

const isVisualSearchPayload = (payload = {}) => {
  if (!payload || typeof payload !== "object") return false;
  const key = getAgentKey(payload);
  const provider = toSafeString(
    firstDefined(payload.provider, payload.source_provider, payload.phuong_phap, payload.formatter_provider),
    "",
  ).toLowerCase();
  return key === "visual_search" || ["serpapi", "google lens", "lens", "visual search"].some((marker) =>
    provider.includes(marker),
  );
};

const AG3_STRUCTURED_KEYS = [
  "vote_eligible",
  "ag3_vote_eligible",
  "vote_created",
  "valid_vote",
  "counted_in_consensus",
  "not_counted_in_consensus",
  "raw_lens_result_count",
  "eligible_evidence_count",
  "winning_identity",
  "vote_identity",
  "ag3_verification_summary",
];

const hasStructuredAg3Fields = (...payloads) =>
  payloads.some((payload) =>
    Boolean(
      payload &&
        typeof payload === "object" &&
        AG3_STRUCTURED_KEYS.some((key) => hasOwn(payload, key)),
    ),
  );

const getAgentCollection = (agentVotes, agentsMap) => {
  if (Array.isArray(agentVotes)) return agentVotes;
  if (Array.isArray(agentsMap)) return agentsMap;
  if (agentsMap && typeof agentsMap === "object") {
    return PUBLIC_AGENT_KEYS.map((key) => agentsMap[key]).filter(Boolean);
  }
  return [];
};

const normalizeSummary = (payload = {}) => {
  const summary = payload.summary || payload.data || {};
  const denomination = firstDefined(
    summary.denomination,
    summary.final_denomination,
    summary.menh_gia,
    payload.denomination,
  );
  const country = firstDefined(
    summary.country,
    summary.quoc_gia,
    summary.origin,
    payload.country,
  );
  const currency = firstDefined(
    summary.currency,
    summary.currency_code,
    summary.ma_tien_te,
    payload.currency,
    inferMoneyCurrency(denomination),
  );

  return {
    denomination: toSafeString(denomination, null),
    currency: toSafeString(currency, null),
    country: toSafeString(country, null),
    origin: toSafeString(firstDefined(summary.origin, country), null),
    material: toSafeString(firstDefined(summary.material, summary.chat_lieu), null),
    confidence: firstDefined(summary.confidence, payload.confidence, null),
    description: toSafeString(
      firstDefined(summary.description, summary.public_explanation, summary.referee_view),
      "",
    ),
    estimated_usd: firstDefined(summary.estimated_usd, null),
  };
};

const normalizeEvidenceTextList = (value) =>
  toArray(value)
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map((item) => {
      if (item && typeof item === "object") {
        return toSafeString(
          firstDefined(item.text, item.label, item.value),
          "",
        );
      }
      return toSafeString(item, "");
    })
    .filter(Boolean);

const getArticleNestedObjects = (item = {}) => [
  item.article,
  item.page,
  item.metadata,
  item.raw,
  item.result,
  item.source && typeof item.source === "object" ? item.source : null,
].filter((value) => value && typeof value === "object");

const getArticleField = (item, fields) => {
  for (const field of fields) {
    const directValue = item?.[field];
    if (directValue !== null && directValue !== undefined && directValue !== "") {
      return directValue;
    }
  }
  for (const nested of getArticleNestedObjects(item)) {
    for (const field of fields) {
      const nestedValue = nested?.[field];
      if (nestedValue !== null && nestedValue !== undefined && nestedValue !== "") {
        return nestedValue;
      }
    }
  }
  return null;
};

const normalizeEvidenceItem = (item) => {
  if (!item) return null;
  if (typeof item === "string") {
    const text = toSafeString(item, "");
    return text ? { title: text } : null;
  }
  if (typeof item !== "object") return null;

  const title = toSafeString(
    firstDefined(
      getArticleField(item, ["title", "raw_title", "page_title", "name", "source_title"]),
      typeof item.source === "string" ? item.source : null,
      item.domain,
      item.canonical_domain,
      item.text,
      item.label,
    ),
    "",
  );
  const snippet = toSafeString(
    firstDefined(item.snippet, item.description, item.matchedText, item.matched_text),
    "",
  );
  const url = toSafeString(
    getArticleField(item, ["url", "raw_url", "link", "source_url", "href"]),
    "",
  );
  let domain = toSafeString(
    getArticleField(item, ["canonical_domain", "domain", "source_domain"]),
    "",
  );

  if (!domain && url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      domain = "";
    }
  }

  const normalized = {
    title: title || domain || snippet,
    snippet,
    url,
    domain,
    thumbnail: toSafeString(firstDefined(item.thumbnail, item.thumbnail_url, item.image_url), ""),
    raw_rank: toFiniteNumber(firstDefined(item.raw_rank, item.rank, item.position, item.selected_rank)),
    rank: toFiniteNumber(firstDefined(item.rank, item.raw_rank, item.position, item.selected_rank)),
    confidence: item.confidence ?? null,
    ranker_score: toFiniteNumber(firstDefined(item.ranker_score, item.raw_lens_score, item.score)),
    raw_lens_score: toFiniteNumber(firstDefined(item.raw_lens_score, item.ranker_score, item.score)),
    ranker_meaning: "search_relevance",
    source_trust_level: firstDefined(item.source_trust_level, item.source_class, "UNKNOWN"),
    source_class: firstDefined(item.source_class, item.source_trust_level, "UNKNOWN"),
    content_identity_quality: item.content_identity_quality ?? null,
    canonical_domain: firstDefined(item.canonical_domain, domain, null),
    canonical_url: firstDefined(item.canonical_url, url, null),
    independent_domain: toPublicBoolean(item.independent_domain, item.is_independent, item.domain_first),
    qualified_source: toPublicBoolean(item.qualified_source),
    eligible: toPublicBoolean(item.eligible),
    page_fetch_status: firstDefined(item.page_fetch_status, item.fetch_status, item.page_text_checked, null),
    fetch_status: firstDefined(item.fetch_status, item.page_fetch_status, item.page_text_checked, null),
    object_type: firstDefined(item.object_type, item.detected_object_type, null),
    complete_identity: toPublicBoolean(item.complete_identity, item.identity_complete),
    evidence_disposition: firstDefined(item.final_disposition, item.evidence_disposition, null),
    evidence_reason: firstDefined(item.final_reason, item.evidence_reason, item.excluded_reason, null),
    final_disposition: firstDefined(item.final_disposition, item.evidence_disposition, null),
    final_reason: firstDefined(item.final_reason, item.evidence_reason, item.excluded_reason, null),
    badge: item.badge ?? null,
    detected_amounts: item.detected_amounts ?? null,
    detected_currency: item.detected_currency ?? null,
    detected_country: item.detected_country ?? null,
    extracted_denomination: firstDefined(item.extracted_denomination, item.detected_amounts, null),
    extracted_currency: firstDefined(item.extracted_currency, item.detected_currency, null),
    extracted_country: firstDefined(item.extracted_country, item.detected_country, null),
    web_page_text_excerpt: firstDefined(item.web_page_text_excerpt, item.page_text_excerpt, null),
    selected_for_ag3_internal_vote: toPublicBoolean(
      item.selected_for_ag3_internal_vote,
      item.selected_for_ag3_vote,
      item.selected,
    ),
    selected_for_ag3_vote: toPublicBoolean(
      item.selected_for_ag3_internal_vote,
      item.selected_for_ag3_vote,
      item.selected,
    ),
    selected_rank: toFiniteNumber(item.selected_rank),
  };

  if (
    normalized.web_page_text_excerpt &&
    ["", "not_attempted", "skipped", "none", "null"].includes(
      toSafeString(normalized.page_fetch_status || normalized.fetch_status, "").toLowerCase(),
    )
  ) {
    normalized.page_fetch_status = "success";
    normalized.fetch_status = "success";
  }

  return normalized.title || normalized.snippet || normalized.url ? normalized : null;
};

const normalizeEvidenceItems = (value) =>
  toArray(value)
    .map(normalizeEvidenceItem)
    .filter(Boolean)
    .filter(
      (item, index, items) =>
        index === items.findIndex(
          (candidate) =>
            `${candidate.url || ""}|${candidate.title || ""}` ===
            `${item.url || ""}|${item.title || ""}`,
        ),
    );

const normalizePublicEvidence = (...payloads) => {
  const visibleText = [];
  const keyFeatures = [];
  const lensEvidence = [];

  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    const evidence = payload.public_evidence || payload.evidence || payload;
    const isVisualPayload = isVisualSearchPayload(payload) || isVisualSearchPayload(evidence);
    if (!isVisualPayload) {
      visibleText.push(
        ...normalizeEvidenceTextList(
          firstDefined(evidence.visible_text, evidence.van_ban_nhin_thay),
        ),
      );
      keyFeatures.push(
        ...normalizeEvidenceTextList(
          firstDefined(evidence.key_features, evidence.dac_diem_chinh),
        ),
      );
    }
    lensEvidence.push(
      ...normalizeEvidenceItems(
        firstDefined(
          evidence.lens_evidence,
          evidence.google_lens,
          evidence.sources,
          evidence.links,
          evidence.visual_matches,
          Array.isArray(evidence) ? evidence : null,
        ),
      ),
    );
  }

  return {
    visible_text: [...new Set(visibleText)].slice(0, 8),
    key_features: [...new Set(keyFeatures)].slice(0, 8),
    lens_evidence: lensEvidence.slice(0, 20),
  };
};

const normalizeConsensus = (payload = {}, agentVotes = []) => {
  const consensus = payload.consensus || {};
  const matchedAgents = toFiniteNumber(
    firstDefined(
      consensus.matched_agents,
      consensus.so_luong_dong_thuan,
      payload.matched_agents,
      payload.summary?.matched_agents,
      payload.data?.matched_agents,
      null,
    ),
  );
  const totalAgents = toFiniteNumber(
    firstDefined(
      consensus.total_agents,
      consensus.agent_count,
      payload.total_agents,
      agentVotes.length || null,
      null,
    ),
  );
  const pattern = toSafeString(
    firstDefined(
      consensus.pattern,
      consensus.consensus_pattern,
      payload.pattern,
      matchedAgents !== null && totalAgents !== null
        ? `${matchedAgents}/${totalAgents}`
        : null,
    ),
    null,
  );

  const displayTotalAgents = Math.max(3, totalAgents || 3);
  const displayConsensusPattern = matchedAgents !== null ? `${matchedAgents}/${displayTotalAgents}` : null;

  return {
    method: toSafeString(firstDefined(consensus.method, "majority_vote"), "majority_vote"),
    matched_agents: matchedAgents,
    total_agents: totalAgents,
    pattern,
    consensus_pattern: pattern,
    display_matched_agents: matchedAgents,
    display_total_agents: displayTotalAgents,
    display_consensus_pattern: displayConsensusPattern,
    status: toSafeString(firstDefined(consensus.status, payload.status), null),
    partial: hasOwn(consensus, "partial") ? Boolean(consensus.partial) : null,
    completed_objects: firstDefined(consensus.completed_objects, payload.completed_objects, null),
    needs_better_image_objects: firstDefined(
      consensus.needs_better_image_objects,
      payload.needs_better_image_objects,
      null,
    ),
    total_objects: firstDefined(consensus.total_objects, payload.total_objects, null),
    object_status_summary: consensus.object_status_summary || null,
    warning: consensus.warning || null,
    consensus_reason: toSafeString(consensus.consensus_reason, ""),
    referee_view: toSafeString(
      firstDefined(consensus.referee_view, consensus.quan_diem_trong_tai, consensus.consensus_reason),
      "",
    ),
    valid_votes: toArray(consensus.valid_votes).map(stripBlockedKeys),
    valid_vote_count: toFiniteNumber(
      firstDefined(consensus.valid_vote_count, toArray(consensus.valid_votes).length),
    ),
    matched_agents_keys: toArray(consensus.matched_agents_keys).map((item) =>
      normalizeConsensusAgentKey(item?.agent_key || item?.agent || item?.source || item),
    ).filter(Boolean),
    winner_key: firstDefined(consensus.winner_key, null),
    suggested_result_from_valid_agent: stripBlockedKeys(
      consensus.suggested_result_from_valid_agent || null,
    ),
  };
};

const AGENT_KEY_LABELS = {
  ml_dl: "OpenAI/GPT Vision",
  llm_api: "Gemini/LLM",
  visual_search: "Google Lens/Visual Search",
};

const normalizeAgentVote = (
  vote,
  fallbackKey,
  summary = null,
  validVoteKeys = null,
  consensusPattern = null,
) => {
  if (!vote || typeof vote !== "object") return null;

  const cleanVote = stripBlockedKeys(vote);
  const sourcePayload = cleanVote.data || cleanVote.result || cleanVote;
  const agentKey = getAgentKey(cleanVote, fallbackKey);
  const rawStatus = toSafeString(firstDefined(sourcePayload.status, cleanVote.status), "completed").toLowerCase();
  const denomination = firstDefined(
    sourcePayload.denomination,
    sourcePayload.menh_gia,
    sourcePayload.final_denomination,
    sourcePayload.class_name,
    cleanVote.denomination,
  );
  const country = firstDefined(
    sourcePayload.country,
    sourcePayload.quoc_gia,
    sourcePayload.origin,
    cleanVote.country,
  );
  const currency = firstDefined(
    sourcePayload.currency,
    sourcePayload.currency_code,
    sourcePayload.ma_tien_te,
    cleanVote.currency,
    inferMoneyCurrency(denomination),
  );
  const explicitMatched = toPublicBoolean(
    cleanVote.matched,
    cleanVote.agreed,
    cleanVote.agreed_with_final,
    cleanVote.matches_final,
    sourcePayload.matched,
    sourcePayload.agreed,
    sourcePayload.agreed_with_final,
    sourcePayload.matches_final,
  );
  const explicitCounted = toPublicBoolean(
    cleanVote.counting,
    cleanVote.counted,
    cleanVote.counted_by_backend,
    sourcePayload.counting,
    sourcePayload.counted,
    sourcePayload.counted_by_backend,
  );

  let matched = explicitMatched;
  let counted = explicitCounted;

  if (matched === null) {
    if (validVoteKeys && agentKey && validVoteKeys.has(agentKey)) {
      matched = true;
    } else if (summary && summary.denomination && denomination) {
      const voteAmount = parseMoneyAmount(denomination);
      const summaryAmount = parseMoneyAmount(summary.denomination);
      const voteCurr = currency || inferMoneyCurrency(denomination);
      const summaryCurr = summary.currency || inferMoneyCurrency(summary.denomination);
      if (
        voteAmount !== null &&
        voteAmount > 0 &&
        summaryAmount !== null &&
        summaryAmount > 0 &&
        voteAmount === summaryAmount &&
        voteCurr &&
        summaryCurr &&
        voteCurr === summaryCurr
      ) {
        matched = true;
      }
    }
    if (
      matched === null &&
      consensusPattern &&
      (consensusPattern.includes("3/3") || consensusPattern === "3/3") &&
      (rawStatus === "completed" || rawStatus === "success") &&
      parseMoneyAmount(denomination) !== null
    ) {
      matched = true;
    }
  }

  if (counted === null) {
    if (matched === true || (validVoteKeys && agentKey && validVoteKeys.has(agentKey))) {
      counted = true;
    } else if (matched === false) {
      counted = true;
    } else if (["failed", "error", "disabled", "technical_error"].includes(rawStatus)) {
      counted = false;
    }
  }

  const defaultLabel = AGENT_KEY_LABELS[agentKey] || agentKey || "agent";
  const agentLabel = toSafeString(
    firstDefined(cleanVote.label, cleanVote.agent_name, cleanVote.agent, cleanVote.name),
    defaultLabel,
  );

  const provider = agentKey === "visual_search"
    ? toSafeString(firstDefined(cleanVote.provider, sourcePayload.provider, sourcePayload.provider_trace?.selected_provider), "SerpAPI")
    : toSafeString(firstDefined(cleanVote.provider, sourcePayload.provider), null);

  const formatter = agentKey === "visual_search"
    ? toSafeString(firstDefined(cleanVote.formatter, sourcePayload.formatter, sourcePayload.formatter_provider), "Deterministic")
    : toSafeString(firstDefined(cleanVote.formatter, sourcePayload.formatter), null);

  const normalized = {
    agent: agentLabel,
    label: agentLabel,
    agent_name: toSafeString(firstDefined(cleanVote.agent_name, cleanVote.agent), agentLabel),
    agent_key: agentKey,
    status: rawStatus,
    denomination: toSafeString(denomination, null),
    menh_gia: toSafeString(denomination, null),
    country: toSafeString(country, null),
    quoc_gia: toSafeString(country, null),
    currency: toSafeString(currency, null),
    confidence: firstDefined(sourcePayload.confidence, sourcePayload.do_tin_cay, cleanVote.confidence, null),
    public_summary: toSafeString(firstDefined(sourcePayload.public_summary, cleanVote.public_summary), ""),
    public_explanation: toSafeString(firstDefined(sourcePayload.public_explanation, cleanVote.public_explanation), ""),
    explanation: toSafeString(firstDefined(sourcePayload.explanation, cleanVote.explanation), ""),
    reason: toSafeString(
      firstDefined(sourcePayload.reason, sourcePayload.reasoning, cleanVote.reason),
      "",
    ),
    reasoning: toSafeString(
      firstDefined(sourcePayload.reasoning, sourcePayload.quan_diem, cleanVote.reasoning),
      "",
    ),
    evidence: normalizeEvidenceItems(firstDefined(sourcePayload.evidence, cleanVote.evidence)),
  };

  if (matched !== null) {
    normalized.matched = matched;
    normalized.agreed_with_final = matched;
  }
  if (counted !== null) {
    normalized.counting = counted;
    normalized.counted = counted;
  }
  if (provider) {
    normalized.provider = provider;
  }
  if (formatter) {
    normalized.formatter = formatter;
  }

  if (agentKey === "visual_search") {
    const traceRaw = firstDefined(
      sourcePayload.ag3_verification_summary,
      sourcePayload.promotion_trace,
      cleanVote.ag3_verification_summary,
      cleanVote.promotion_trace,
      {}
    );
    const trace = traceRaw && typeof traceRaw === "object" ? traceRaw : {};
    const formatterTraceRaw = firstDefined(
      sourcePayload.ag3_formatter_decision_trace,
      cleanVote.ag3_formatter_decision_trace,
      trace.ag3_formatter_decision_trace,
      {}
    );
    const formatterTrace = formatterTraceRaw && typeof formatterTraceRaw === "object" ? formatterTraceRaw : {};
    normalized.evidence_promoted = Boolean(firstDefined(formatterTrace.promoted, trace.promoted, cleanVote.evidence_promoted, false));
    normalized.evidence_verified = Boolean(firstDefined(formatterTrace.promoted, trace.promoted, cleanVote.evidence_verified, false));
    normalized.ag3_verification_summary = trace;
    normalized.ag3_formatter_decision_trace = formatterTrace;
    for (const key of [
      "initial_lens_result_count",
      "targeted_search_result_count",
      "total_raw_evidence_count",
      "raw_lens_result_count",
      "eligible_evidence_count",
      "qualified_evidence_count",
      "qualified_source_count",
      "eligible_independent_domain_count",
      "qualified_independent_domain_count",
      "supporting_evidence_count",
      "conflicting_evidence_count",
      "partial_evidence_count",
      "excluded_evidence_count",
      "duplicate_evidence_count",
      "selected_voting_set",
      "selected_voting_set_size",
      "raw_articles",
      "candidate_sources",
      "candidate_source_count",
      "selected_voting_sources",
      "required_selected_source_count",
      "selected_source_count",
      "majority_required",
      "majority_achieved",
      "agreement_achieved",
      "agreement_pattern",
      "vote_created",
      "valid_vote",
      "trusted_conflict",
      "candidate_clusters",
      "winning_cluster",
      "promotion_reason",
    ]) {
      normalized[key] = firstDefined(sourcePayload[key], cleanVote[key], trace[key], normalized[key]);
    }

    const structuredAg3Present = hasStructuredAg3Fields(sourcePayload, cleanVote, trace);
    if (structuredAg3Present) {
      const voteEligible = Boolean(
        toPublicBoolean(
          sourcePayload.vote_eligible,
          sourcePayload.ag3_vote_eligible,
          cleanVote.vote_eligible,
          cleanVote.ag3_vote_eligible,
          sourcePayload.valid_vote,
          cleanVote.valid_vote,
          trace.vote_eligible,
          trace.ag3_vote_eligible,
          trace.valid_vote,
        ),
      );
      const countedSignal = toPublicBoolean(
        sourcePayload.counted_in_consensus,
        cleanVote.counted_in_consensus,
        sourcePayload.counted_by_backend,
        cleanVote.counted_by_backend,
        sourcePayload.counted,
        cleanVote.counted,
        sourcePayload.not_counted_in_consensus === false ? true : null,
        cleanVote.not_counted_in_consensus === false ? true : null,
        sourcePayload.not_counted_in_consensus === true ? false : null,
        cleanVote.not_counted_in_consensus === true ? false : null,
        trace.counted_in_consensus,
        trace.counted_by_backend,
        trace.counted,
        trace.not_counted_in_consensus === false ? true : null,
        trace.not_counted_in_consensus === true ? false : null,
      );
      const matchedSignal = toPublicBoolean(
        sourcePayload.matched,
        cleanVote.matched,
        sourcePayload.agreed_with_final,
        cleanVote.agreed_with_final,
        sourcePayload.matches_final,
        cleanVote.matches_final,
        trace.matched,
        trace.agreed_with_final,
        trace.matches_final,
      );
      const countedTruth = Boolean(voteEligible && countedSignal === true);
      const matchedTruth = Boolean(countedTruth && matchedSignal === true);

      normalized.vote_eligible = voteEligible;
      normalized.ag3_vote_eligible = voteEligible;
      normalized.counted_in_consensus = countedTruth;
      normalized.not_counted_in_consensus = !countedTruth;
      normalized.counting = countedTruth;
      normalized.counted = countedTruth;
      normalized.counted_by_backend = countedTruth;
      normalized.matched = matchedTruth;
      normalized.agreed_with_final = matchedTruth;
      normalized.evidence_promoted = Boolean(
        voteEligible && toPublicBoolean(formatterTrace.promoted, trace.promoted) === true,
      );
      normalized.evidence_verified = normalized.evidence_promoted;
      normalized.candidate_identity = firstDefined(sourcePayload.candidate_identity, cleanVote.candidate_identity, trace.candidate_identity, null);
      normalized.winning_identity = firstDefined(sourcePayload.winning_identity, cleanVote.winning_identity, trace.winning_identity, null);
      normalized.vote_identity = firstDefined(sourcePayload.vote_identity, cleanVote.vote_identity, trace.vote_identity, null);
    }
  }

  return normalized;
};

const normalizeAgentsMap = (payloadAgents = {}, agentVotes = []) => {
  const agents = {
    ml_dl: null,
    llm_api: null,
    visual_search: null,
  };

  for (const vote of agentVotes) {
    if (vote?.agent_key && agents[vote.agent_key] === null) {
      agents[vote.agent_key] = vote;
    }
  }

  for (const key of PUBLIC_AGENT_KEYS) {
    const agent = payloadAgents?.[key] || payloadAgents?.[`agent_${PUBLIC_AGENT_KEYS.indexOf(key) + 1}`];
    if (agent && agents[key] === null) {
      const normalized = normalizeAgentVote(agent, key);
      agents[key] = normalized || stripBlockedKeys(agent);
    }
  }

  return agents;
};

const normalizeCropEvidence = (object = {}) => {
  const checker =
    object.crop_checker ||
    object.cropChecker ||
    object.crop_validation ||
    object.cropValidation ||
    object.crop_quality ||
    object.cropQuality ||
    object.crop ||
    {};
  const action = firstDefined(
    object.ag0_action,
    object.action,
    checker.ag0_action,
    checker.action,
    checker.decision,
  );
  const banknoteScore = firstDefined(
    object.banknote_score,
    checker.banknote_score,
    checker.banknote_like_score,
  );
  const documentScore = firstDefined(
    object.document_score,
    checker.document_score,
    checker.document_like_score,
  );
  const agentEligible = toPublicBoolean(
    object.agent_eligible,
    checker.agent_eligible,
    checker.eligible_for_agents,
  );

  return {
    action: toSafeString(action, ""),
    banknote_score: banknoteScore,
    document_score: documentScore,
    agent_eligible: agentEligible,
    source: toSafeString(
      firstDefined(object.crop_source, object.source, checker.source, object.selected_box_reason),
      "",
    ),
    selected_box_reason: toSafeString(
      firstDefined(object.selected_box_reason, checker.selected_box_reason, checker.reason),
      "",
    ),
    bbox: firstDefined(object.bbox, checker.bbox, null),
    confidence: firstDefined(object.confidence, object.crop_confidence, checker.confidence, null),
  };
};

const normalizeDetectedObject = (object, index, rootAgentVotes = []) => {
  if (!object || typeof object !== "object") return null;

  const summary = normalizeSummary(object.summary ? object : { summary: object.summary || object });
  const localVotesSource = getAgentCollection(object.agent_votes || object.agentVotes, object.agents);
  const localVotes = localVotesSource.length ? localVotesSource : rootAgentVotes;
  const agentVotes = localVotes
    .map((vote, voteIndex) =>
      normalizeAgentVote(vote, PUBLIC_AGENT_KEYS[voteIndex] || null),
    )
    .filter(Boolean);
  const crop = normalizeCropEvidence(object);
  const publicEvidence = object.public_evidence
    ? normalizePublicEvidence(object.public_evidence)
    : normalizePublicEvidence(object, ...agentVotes);
  const consensus = normalizeConsensus(object, agentVotes);

  return {
    object_index: firstDefined(object.object_index, object.index, index + 1),
    bbox: firstDefined(object.bbox, crop.bbox, null),
    status: toSafeString(firstDefined(object.status, summary.status), null),
    denomination: summary.denomination,
    currency: summary.currency,
    country: summary.country,
    material: summary.material,
    confidence: firstDefined(summary.confidence, object.confidence, crop.confidence, null),
    summary,
    agents: normalizeAgentsMap(object.agents, agentVotes),
    agent_votes: agentVotes,
    consensus,
    public_evidence: publicEvidence,
    crop_checker: crop,
    crop_quality: {
      action: crop.action,
      confidence: crop.confidence,
      source: crop.source,
      fallback: object.crop_quality?.fallback ?? null,
    },
    crop_source: crop.source,
    crop_image_url: firstDefined(
      object.crop_image_url,
      object.cropped_image_url,
      object.selected_crop_url,
      object.image_url,
      null,
    ),
    image_url: firstDefined(object.image_url, object.crop_image_url, null),
  };
};

export const isPublicUserResultPayload = (payload) =>
  Boolean(
    payload &&
      typeof payload === "object" &&
      (payload.summary ||
        payload.data ||
        payload.consensus ||
        payload.agent_votes ||
        payload.agentVotes ||
        payload.agents ||
        payload.detected_objects ||
        payload.detectedObjects ||
        payload.image ||
        payload.crop ||
        payload.evidence ||
        payload.billing ||
        payload.public_warnings),
  );

export const normalizeUserResultResponse = (payload, options = {}) => {
  if (!payload) return null;
  if (payload?.[NORMALIZED_MARKER] === true) return payload;

  const candidate =
    payload.data && isPublicUserResultPayload(payload.data) && !payload.summary
      ? payload.data
      : payload.result && isPublicUserResultPayload(payload.result)
        ? payload.result
        : payload;

  if (!candidate || typeof candidate !== "object") return null;

  const summary = normalizeSummary(candidate);
  const rawConsensus = candidate.consensus || candidate.final_result || {};
  const hasConsensusData = Boolean(
    candidate.consensus ||
      rawConsensus.matched_agents !== undefined ||
      rawConsensus.pattern ||
      (Array.isArray(rawConsensus.valid_votes) && rawConsensus.valid_votes.length > 0),
  );
  const validVoteKeys = new Set(
    toArray(firstDefined(rawConsensus.valid_votes, candidate.valid_votes))
      .map((item) => normalizeConsensusAgentKey(item?.agent_key || item?.agent || item?.source || item))
      .filter(Boolean),
  );
  const consensusPattern = toSafeString(
    firstDefined(rawConsensus.pattern, rawConsensus.consensus_pattern, candidate.pattern),
    "",
  );

  const rawVotes = getAgentCollection(candidate.agent_votes || candidate.agentVotes, candidate.agents);
  const agentVotes = rawVotes
    .map((vote, index) =>
      normalizeAgentVote(
        vote,
        PUBLIC_AGENT_KEYS[index] || null,
        hasConsensusData ? summary : null,
        validVoteKeys,
        consensusPattern,
      ),
    )
    .filter(Boolean);
  const consensus = normalizeConsensus(candidate, agentVotes);
  const detectedObjects = toArray(candidate.detected_objects || candidate.detectedObjects)
    .map((object, index) => normalizeDetectedObject(object, index, agentVotes))
    .filter(Boolean);
  const publicEvidence = normalizePublicEvidence(
    candidate.public_evidence,
    candidate.evidence,
    ...detectedObjects,
    ...agentVotes,
  );
  const imageUrl = firstDefined(
    candidate.image?.originalUrl,
    candidate.image?.original_url,
    candidate.image?.inputUrl,
    candidate.image?.input_url,
    candidate.input_image_url,
    candidate.image_url,
    candidate.uploaded_image_url,
    candidate.thumbnail_url,
    options.previewUrl,
    null,
  );
  const selectedCropUrl = firstDefined(
    candidate.image?.selectedCropUrl,
    candidate.image?.selected_crop_url,
    candidate.crop?.selected_crop_url,
    detectedObjects[0]?.selected_crop_url,
    detectedObjects[0]?.crop_image_url,
    null,
  );
  const billingCandidate = candidate.billing && typeof candidate.billing === "object"
    ? candidate.billing
    : null;
  const hasBillingCharge =
    billingCandidate &&
    [
      "app_tokens_charged",
      "credits_charged",
      "charged",
      "skipped",
      "billing_mode",
      "mode",
    ].some((key) => hasOwn(billingCandidate, key));
  const chargeValue = firstDefined(
    billingCandidate?.app_tokens_charged,
    billingCandidate?.credits_charged,
    candidate.app_tokens_charged,
    candidate.credits_charged,
    candidate.system_tokens_charged,
    null,
  );
  const normalizedCharge = toFiniteNumber(chargeValue);
  const billing = hasBillingCharge || chargeValue !== null
    ? {
        app_tokens_charged: normalizedCharge,
        credits_charged: normalizedCharge,
        charged: firstDefined(
          toPublicBoolean(billingCandidate?.charged),
          normalizedCharge !== null ? normalizedCharge > 0 : null,
        ),
        billing_mode: firstDefined(billingCandidate?.billing_mode, billingCandidate?.mode, candidate.billing_mode, null),
        mode: firstDefined(billingCandidate?.mode, billingCandidate?.billing_mode, candidate.billing_mode, null),
        skipped: firstDefined(
          toPublicBoolean(billingCandidate?.skipped),
          normalizedCharge !== null ? normalizedCharge === 0 : null,
        ),
      }
    : null;
  const crop = candidate.crop
    ? normalizeCropEvidence(candidate.crop)
    : detectedObjects[0]?.crop_checker || detectedObjects[0]?.crop_quality || null;
  const resultId = firstDefined(candidate.resultId, candidate.result_id, candidate.id, candidate._id, null);
  const taskId = firstDefined(candidate.taskId, candidate.task_id, options.taskId, null);

  const normalized = {
    publicContract: isPublicUserResultPayload(candidate),
    id: resultId,
    resultId,
    result_id: resultId,
    taskId,
    task_id: taskId,
    status: toSafeString(firstDefined(candidate.status, consensus.status), null),
    createdAt: firstDefined(candidate.createdAt, candidate.created_at, null),
    created_at: firstDefined(candidate.created_at, candidate.createdAt, null),
    completedAt: firstDefined(candidate.completedAt, candidate.completed_at, candidate.updated_at, null),
    updated_at: firstDefined(candidate.updated_at, candidate.completedAt, null),
    image: {
      originalUrl: imageUrl,
      original_url: imageUrl,
      inputUrl: imageUrl,
      input_url: imageUrl,
      selectedCropUrl,
      selected_crop_url: selectedCropUrl,
    },
    image_url: imageUrl,
    input_image_url: imageUrl,
    uploaded_image_url: firstDefined(candidate.uploaded_image_url, imageUrl, null),
    thumbnail_url: candidate.thumbnail_url || null,
    summary,
    data: summary,
    agents: normalizeAgentsMap(candidate.agents, agentVotes),
    agentVotes,
    agent_votes: agentVotes,
    consensus,
    detected_objects: detectedObjects,
    detectedObjects,
    rejected_objects: toArray(candidate.rejected_objects).map(stripBlockedKeys),
    detected_count: toFiniteNumber(
      firstDefined(candidate.detected_count, detectedObjects.length || null, null),
    ),
    multi_object:
      candidate.multi_object === true ||
      detectedObjects.length > 1 ||
      consensus.method === "multi_object_pipeline",
    confidence: firstDefined(summary.confidence, candidate.confidence, null),
    crop_quality: candidate.crop_quality ? stripBlockedKeys(candidate.crop_quality) : null,
    crop,
    public_evidence: publicEvidence,
    evidence: publicEvidence,
    explanation: stripBlockedKeys(candidate.explanation || null),
    conversion: stripBlockedKeys(candidate.conversion || candidate.conversion_result || null),
    conversion_result: stripBlockedKeys(candidate.conversion_result || candidate.conversion || null),
    processing_time_ms: candidate.processing_time_ms ?? null,
    error_message: toSafeString(candidate.error_message, ""),
    app_tokens_charged: billing?.app_tokens_charged ?? null,
    credits_charged: billing?.credits_charged ?? null,
    billing,
    feedback: {
      related_result_id: firstDefined(
        candidate.feedback?.related_result_id,
        resultId,
        null,
      ),
    },
    public_warnings: toArray(candidate.public_warnings || candidate.warnings)
      .map((item) => toSafeString(item, ""))
      .filter(Boolean),
    warnings: toArray(candidate.warnings || candidate.public_warnings)
      .map((item) => toSafeString(item, ""))
      .filter(Boolean),
  };

  const clean = stripBlockedKeys(normalized);
  Object.defineProperty(clean, NORMALIZED_MARKER, {
    value: true,
    enumerable: false,
  });
  return clean;
};

export const formatRecordedBoolean = (value, fallback = "Not recorded") => {
  if (value === true) return "true";
  if (value === false) return "false";
  return fallback;
};

export const formatDenominationLabel = (
  denomination,
  currency,
  fallback = "Not recorded",
) => {
  const denom = toSafeString(denomination, "");
  const normalizedDenom = denom.trim();
  const invalid = normalizedDenom.toLowerCase();
  if (
    !normalizedDenom ||
    ["n/a", "na", "null", "undefined", "unknown"].includes(invalid)
  ) {
    return fallback;
  }

  const code = toSafeString(currency, "").trim().toUpperCase();
  if (code && !normalizedDenom.toUpperCase().includes(code)) {
    return `${normalizedDenom} ${code}`;
  }

  return normalizedDenom;
};

export const publicResultRawBlockedKeys = RAW_BLOCKED_KEYS;

const normalizeIdentityForDecision = (identity = {}) => {
  if (!identity || typeof identity !== "object") return {};
  const denomination = firstDefined(
    identity.denomination,
    identity.menh_gia,
    identity.amount,
    identity.value,
    Array.isArray(identity.detected_amounts) ? identity.detected_amounts[0] : null,
    Array.isArray(identity.extracted_denomination) ? identity.extracted_denomination[0] : null,
    null,
  );
  const normalized = {
    country: toSafeString(firstDefined(identity.country, identity.quoc_gia, identity.detected_country, identity.extracted_country), ""),
    currency: toSafeString(firstDefined(identity.currency, identity.ma_tien_te, identity.currency_code, identity.detected_currency, identity.extracted_currency), "").toUpperCase(),
    denomination,
  };
  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );
};

const AG3_UNKNOWN_VALUES = new Set([
  "?",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
  "khong xac dinh",
  "khong ro",
  "khong",
]);

const isUnknownAg3Value = (value) => {
  if (Array.isArray(value)) return value.length === 0 || value.every(isUnknownAg3Value);
  const text = toSafeString(value, "");
  return !text || AG3_UNKNOWN_VALUES.has(text.toLowerCase());
};

const formatAg3IdentityPart = (value) => {
  if (Array.isArray(value)) {
    const parts = value.map(formatAg3IdentityPart).filter((part) => part !== "?");
    return parts.length ? Array.from(new Set(parts)).join(", ") : "?";
  }
  if (isUnknownAg3Value(value)) return "?";
  return toSafeString(value, "?");
};

const collectAg3Amounts = (...values) => {
  const amounts = [];
  const addValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }
    if (isUnknownAg3Value(value)) return;
    toSafeString(value, "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (!amounts.includes(part)) amounts.push(part);
      });
  };
  values.forEach(addValue);
  return amounts;
};

const hasAg3CodeMarker = (value, markers) => {
  const code = toSafeString(value, "").toLowerCase();
  return Boolean(code && markers.some((marker) => code.includes(marker)));
};

const formatAg3SourceIdentityLabel = (source, normalizedEvidence, identity) => {
  const country = formatAg3IdentityPart(
    firstDefined(identity.country, normalizedEvidence.detected_country, normalizedEvidence.extracted_country),
  );
  const currency = formatAg3IdentityPart(
    firstDefined(identity.currency, normalizedEvidence.detected_currency, normalizedEvidence.extracted_currency),
  ).toUpperCase();
  const amounts = collectAg3Amounts(
    normalizedEvidence.detected_amounts,
    normalizedEvidence.extracted_denomination,
    source.detected_amounts,
    source.extracted_denomination,
    identity.denomination,
    source.denomination,
    source.amount,
    source.value,
  );
  const denomination = amounts.length ? amounts.join(", ") : formatAg3IdentityPart(identity.denomination);
  return `${country} \u00b7 ${currency || "?"} \u00b7 ${denomination}`;
};

const classifyAg3SourceForDisplay = (source, normalizedEvidence, disposition) => {
  const finalReason = firstDefined(
    normalizedEvidence.final_reason,
    normalizedEvidence.evidence_reason,
    source.final_reason,
    source.evidence_reason,
    source.excluded_reason,
  );
  const quality = toSafeString(
    firstDefined(normalizedEvidence.content_identity_quality, source.content_identity_quality),
    "",
  ).toUpperCase();
  const sourceClass = toSafeString(
    firstDefined(normalizedEvidence.source_class, normalizedEvidence.source_trust_level, source.source_class, source.source_trust_level),
    "",
  ).toUpperCase();
  const amounts = collectAg3Amounts(
    normalizedEvidence.detected_amounts,
    normalizedEvidence.extracted_denomination,
    source.detected_amounts,
    source.extracted_denomination,
  );
  const hasMultipleDenominations =
    amounts.length > 1 ||
    hasAg3CodeMarker(quality, ["multi_denom", "multiple_denom"]) ||
    hasAg3CodeMarker(finalReason, ["multi_denom", "multiple_denom", "multiple_denominations"]);
  const isDuplicate = disposition === "duplicate" || hasAg3CodeMarker(finalReason, ["duplicate_domain", "mirror_duplicate"]);
  const isSocial = sourceClass === "SOCIAL" || hasAg3CodeMarker(finalReason, ["social_source"]);
  const isNoise =
    quality === "NOISE" ||
    sourceClass === "NOISE" ||
    hasAg3CodeMarker(finalReason, ["content_identity_quality_noise", "noise"]);
  const isConflicting = disposition === "conflicting" || hasAg3CodeMarker(finalReason, ["conflict"]);
  const isComplete = toPublicBoolean(normalizedEvidence.complete_identity, source.complete_identity, source.identity_complete) === true;

  if (isDuplicate) return "DUPLICATE DOMAIN";
  if (isSocial) return "SOCIAL";
  if (isNoise) return "NOISE";
  if (isConflicting) return "CONFLICTING";
  if (hasMultipleDenominations) return "MULTI-DENOMINATION";
  if ((isComplete && disposition === "supporting") || ["COMPLETE_EXACT", "COMPLETE_IDENTITY", "PAGE_TEXT_COMPLETE"].includes(quality)) {
    return "EXACT";
  }
  if (disposition === "partial" || quality === "PARTIAL_IDENTITY") return "PARTIAL";
  if (disposition === "supporting") return "EXACT";
  return "PARTIAL";
};

const prettifyAg3Reason = (value) => {
  const text = toSafeString(value, "");
  if (!text) return "";
  return text
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getAg3SourceReviewReason = (source, classificationLabel, disposition) => {
  const backendReason = firstDefined(
    source.final_reason,
    source.evidence_reason,
    source.excluded_reason,
    source.badge,
  );
  if (classificationLabel === "DUPLICATE DOMAIN") return "Duplicate domain";
  if (classificationLabel === "MULTI-DENOMINATION") return "Multiple denominations";
  if (classificationLabel === "SOCIAL") return "Social source";
  if (classificationLabel === "NOISE") return "Excluded as noise";
  if (classificationLabel === "CONFLICTING") return "Conflicting identity";
  if (classificationLabel === "PARTIAL") return prettifyAg3Reason(backendReason) || "Partial identity";
  if (disposition === "supporting") return "Supporting source not selected";
  return prettifyAg3Reason(backendReason);
};

const applyAg3VotingDisplay = (source, selected) => ({
  ...source,
  selected,
  previewStatus: selected ? "supporting" : "reviewed_only",
  votingStatusLabel: selected ? "SELECTED FOR VOTING" : "REVIEWED ONLY",
  reviewReasonLabel: selected ? "" : source.reviewReasonLabel,
});

const normalizeAg3SourceForDecision = (source = {}) => {
  if (!source || typeof source !== "object") return null;
  const normalizedEvidence = normalizeEvidenceItem(source) || {};
  const identity = normalizeIdentityForDecision(
    source.identity || {
      country: firstDefined(source.detected_country, source.extracted_country),
      currency: firstDefined(source.detected_currency, source.extracted_currency),
      denomination: firstDefined(source.detected_amounts, source.extracted_denomination),
    },
  );
  const disposition = toSafeString(
    firstDefined(source.disposition, source.final_disposition, source.evidence_disposition),
    "",
  ).toLowerCase();
  const selected = toPublicBoolean(
    source.selected_for_ag3_internal_vote,
    source.selected_for_ag3_vote,
    normalizedEvidence.selected_for_ag3_internal_vote,
    normalizedEvidence.selected_for_ag3_vote,
    source.selected,
    hasOwn(source, "selected_rank") ? true : null,
  ) === true;
  const classificationLabel = classifyAg3SourceForDisplay(source, normalizedEvidence, disposition);
  const displayAmounts = collectAg3Amounts(
    normalizedEvidence.detected_amounts,
    normalizedEvidence.extracted_denomination,
    source.detected_amounts,
    source.extracted_denomination,
    identity.denomination,
    source.denomination,
    source.amount,
    source.value,
  );
  const displayIdentity = displayAmounts.length
    ? { ...identity, denomination: displayAmounts }
    : identity;
  const reviewReasonLabel = getAg3SourceReviewReason(
    { ...source, ...normalizedEvidence },
    classificationLabel,
    disposition,
  );
  const identityLabel = formatAg3SourceIdentityLabel(source, normalizedEvidence, displayIdentity);
  return {
    ...normalizedEvidence,
    domain: toSafeString(
      firstDefined(normalizedEvidence.canonical_domain, normalizedEvidence.domain),
      "",
    ),
    title: toSafeString(
      firstDefined(normalizedEvidence.title, normalizedEvidence.domain),
      "",
    ),
    url: toSafeString(normalizedEvidence.url, ""),
    identity: { ...displayIdentity, identityLabel },
    identityLabel,
    classificationLabel,
    votingStatusLabel: selected ? "SELECTED FOR VOTING" : "REVIEWED ONLY",
    reviewReasonLabel: selected ? "" : reviewReasonLabel,
    disposition,
    qualified: toPublicBoolean(source.qualified_source, source.eligible) === true,
    selected,
  };
};

const uniqueAg3Sources = (sources = []) => sources.filter((source, index, list) => {
  const sourceKey = source.url
    ? `url:${source.url.toLowerCase()}`
    : source.domain
      ? `domain:${source.domain.toLowerCase()}`
      : `title:${source.title.toLowerCase()}`;
  return sourceKey !== "title:" && index === list.findIndex((candidate) => {
    const candidateKey = candidate.url
      ? `url:${candidate.url.toLowerCase()}`
      : candidate.domain
        ? `domain:${candidate.domain.toLowerCase()}`
        : `title:${candidate.title.toLowerCase()}`;
    return candidateKey === sourceKey;
  });
});

const firstNonEmptyArray = (...values) => {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
};

const hasDecisionIdentity = (identity = {}) => Boolean(
  identity && typeof identity === "object" &&
  (identity.country || identity.currency || identity.denomination !== undefined),
);

const ag3SourceMatchesIdentity = (source, identity) => {
  if (!hasDecisionIdentity(identity)) return false;
  const sourceIdentity = source?.identity || {};
  const sourceCurrency = toSafeString(sourceIdentity.currency, "").toUpperCase();
  const identityCurrency = toSafeString(identity.currency, "").toUpperCase();
  const sourceAmount = toFiniteNumber(
    Array.isArray(sourceIdentity.denomination)
      ? sourceIdentity.denomination[0]
      : sourceIdentity.denomination,
  );
  const identityAmount = toFiniteNumber(
    Array.isArray(identity.denomination) ? identity.denomination[0] : identity.denomination,
  );
  return Boolean(
    sourceCurrency && identityCurrency && sourceCurrency === identityCurrency &&
    sourceAmount !== null && identityAmount !== null && sourceAmount === identityAmount,
  );
};

const findAg3Payload = (result = {}) => {
  if (!result || typeof result !== "object") return {};
  if (hasStructuredAg3Fields(result, result.ag3_verification_summary || {})) return result;
  const votes = [
    ...toArray(result.agent_votes),
    ...toArray(result.agentVotes),
    ...toArray(result.votes),
    ...toArray(result.agents),
  ];
  return votes.find((vote) => getAgentKey(vote) === "visual_search") || {};
};

const findAg3CountingTrace = (result = {}, ag3 = {}) => {
  const traceKeys = ["visual_search", "ag3", "agent_3", "google_lens", "lens"];
  const traceContainers = [
    result?.agent_counting_traces,
    result?.consensus?.agent_counting_traces,
    result?.final_result?.agent_counting_traces,
    ag3?.agent_counting_traces,
  ];

  for (const container of traceContainers) {
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    for (const key of traceKeys) {
      const trace = container[key];
      if (trace && typeof trace === "object" && !Array.isArray(trace)) return trace;
    }
  }

  for (const trace of [
    result?.visual_search_counting_trace,
    result?.ag3_counting_trace,
    ag3?.agent_counting_trace,
    ag3?.counting_trace,
  ]) {
    if (trace && typeof trace === "object" && !Array.isArray(trace)) return trace;
  }

  return {};
};

export const getNormalizedConsensus = (result = {}) => {
  const consensus = result?.consensus && typeof result.consensus === "object"
    ? result.consensus
    : {};
  const validVotes = toArray(firstDefined(consensus.valid_votes, result?.valid_votes));
  const validVoteKeys = validVotes
    .map((vote) => normalizeConsensusAgentKey(vote?.agent_key || vote?.agent || vote?.source || vote))
    .filter(Boolean);
  const matchedAgentsKeys = toArray(
    firstDefined(consensus.matched_agents_keys, consensus.matched_agent_keys, result?.matched_agents_keys),
  )
    .map((key) => normalizeConsensusAgentKey(key?.agent_key || key?.agent || key?.source || key))
    .filter(Boolean);
  const validVoteCount = toFiniteNumber(
    firstDefined(consensus.valid_vote_count, result?.valid_vote_count, validVotes.length),
  );
  const matchedAgents = toFiniteNumber(
    firstDefined(
      consensus.matched_agents,
      result?.matched_agents,
      matchedAgentsKeys.length ? matchedAgentsKeys.length : null,
    ),
  );
  const consensusPattern = toSafeString(
    firstDefined(
      consensus.consensus_pattern,
      consensus.pattern,
      result?.consensus_pattern,
    ),
    "",
  );

  return {
    validVotes,
    validVoteKeys,
    validVoteCount,
    matchedAgentsKeys,
    matchedAgents,
    winnerKey: firstDefined(consensus.winner_key, result?.winner_key, null),
    consensusPattern,
  };
};

export const getNormalizedAg3Decision = (result = {}) => {
  const ag3 = findAg3Payload(result);
  const summary =
    ag3?.ag3_verification_summary && typeof ag3.ag3_verification_summary === "object"
      ? ag3.ag3_verification_summary
      : {};
  const promotionTrace =
    ag3?.promotion_trace && typeof ag3.promotion_trace === "object"
      ? ag3.promotion_trace
      : {};
  const countingTrace = findAg3CountingTrace(result, ag3);
  const consensus = getNormalizedConsensus(result);
  const rawSources = uniqueAg3Sources(
    firstNonEmptyArray(
      ag3?.raw_articles,
      ag3?.evidence,
      ag3?.lens_evidence,
      ag3?.sources,
      summary.raw_articles,
      promotionTrace.raw_articles,
    ).map(normalizeAg3SourceForDecision).filter(Boolean),
  );
  const explicitCandidateSources = uniqueAg3Sources(
    firstNonEmptyArray(ag3?.candidate_sources, summary.candidate_sources, promotionTrace.candidate_sources)
      .map(normalizeAg3SourceForDecision)
      .filter(Boolean),
  );
  const derivedCandidateSources = uniqueAg3Sources(
    rawSources.filter((source) => source.qualified),
  );
  const selectedSourceCandidates = uniqueAg3Sources(
    firstNonEmptyArray(
      ag3?.selected_voting_sources,
      summary.selected_voting_sources,
      promotionTrace.selected_voting_sources,
      ag3?.selected_sources,
      summary.selected_sources,
      promotionTrace.selected_sources,
      ag3?.selected_voting_set,
      summary.selected_voting_set,
      promotionTrace.selected_voting_set,
    ).map(normalizeAg3SourceForDecision).filter(Boolean),
  );
  const requiredSourceCount = firstDefined(ag3?.required_selected_source_count, summary.required_selected_source_count, promotionTrace.required_selected_source_count, 3);
  const selectedSetCandidates = selectedSourceCandidates.length
    ? selectedSourceCandidates
    : rawSources.filter((source) => source.selected);
  const selectedDomains = new Set(
    selectedSetCandidates
      .map((source) => source.domain.trim().toLowerCase())
      .filter((domain) => domain && !["unknown", "none", "null"].includes(domain)),
  );
  const initialSelectedSetValid = Boolean(
    selectedSetCandidates.length >= 3 &&
    selectedSetCandidates.length <= 5 &&
    selectedDomains.size === selectedSetCandidates.length,
  );
  const selectedVotingSources = initialSelectedSetValid ? selectedSetCandidates : [];
  const candidateSources = explicitCandidateSources.length
    ? explicitCandidateSources
    : derivedCandidateSources.length
      ? derivedCandidateSources
      : initialSelectedSetValid
        ? []
        : selectedSetCandidates;
  const rawCount = toFiniteNumber(
    firstDefined(
      ag3?.total_raw_evidence_count,
      ag3?.raw_lens_result_count,
      summary.total_raw_evidence_count,
      summary.raw_lens_result_count,
      promotionTrace.total_raw_evidence_count,
      promotionTrace.raw_lens_result_count,
      rawSources.length,
    ),
  ) ?? 0;
  const initialCount = toFiniteNumber(
    firstDefined(ag3?.initial_lens_result_count, summary.initial_lens_result_count, promotionTrace.initial_lens_result_count),
  ) ?? rawCount;
  const targetedCount = toFiniteNumber(
    firstDefined(ag3?.targeted_search_result_count, summary.targeted_search_result_count, promotionTrace.targeted_search_result_count),
  ) ?? Math.max(0, rawCount - initialCount);
  const explicitCandidateSourceCount = toFiniteNumber(
    firstDefined(
      ag3?.usable_source_count,
      ag3?.qualified_source_count,
      ag3?.qualified_independent_domain_count,
      ag3?.eligible_independent_domain_count,
      ag3?.candidate_source_count,
      countingTrace?.usable_source_count,
      countingTrace?.qualified_source_count,
      countingTrace?.qualified_independent_domain_count,
      countingTrace?.eligible_independent_domain_count,
      countingTrace?.candidate_source_count,
      summary.usable_source_count,
      summary.qualified_source_count,
      summary.qualified_independent_domain_count,
      summary.eligible_independent_domain_count,
      summary.candidate_source_count,
      promotionTrace.usable_source_count,
      promotionTrace.qualified_source_count,
      promotionTrace.qualified_independent_domain_count,
      promotionTrace.eligible_independent_domain_count,
      promotionTrace.candidate_source_count,
    ),
  );
  const candidateSourceCount = explicitCandidateSourceCount ?? candidateSources.length ?? 0;
  const rawAgreementPattern = toSafeString(
    firstDefined(
      ag3?.agreement_pattern,
      ag3?.agreement_achieved,
      countingTrace?.agreement_pattern,
      countingTrace?.agreement_achieved,
      summary.agreement_pattern,
      summary.agreement_achieved,
      promotionTrace.agreement_pattern,
      promotionTrace.agreement_achieved,
    ),
    "",
  );
  const agreementDenominator = toFiniteNumber(rawAgreementPattern.match(/^\d+\/(\d+)$/)?.[1]);
  const selectedSourceDataCount = initialSelectedSetValid ? selectedSetCandidates.length : null;
  const explicitSelectedSourceCount = toFiniteNumber(
    firstDefined(
      ag3?.selected_voting_source_count,
      ag3?.selected_voting_set_size,
      countingTrace.selected_voting_source_count,
      countingTrace.selected_voting_set_size,
      summary.selected_voting_source_count,
      summary.selected_voting_set_size,
      promotionTrace.selected_voting_source_count,
      promotionTrace.selected_voting_set_size,
      agreementDenominator,
      selectedSourceDataCount,
      ag3?.selected_source_count,
      countingTrace.selected_source_count,
      summary.selected_source_count,
      promotionTrace.selected_source_count,
    )
  );
  const derivedSelectedCount = selectedSetCandidates.length;
  const candidateSetValid = Boolean(
    (derivedSelectedCount >= 3 && derivedSelectedCount <= 5 && selectedDomains.size === derivedSelectedCount) ||
    (explicitSelectedSourceCount >= 3 && explicitSelectedSourceCount <= 5) ||
    ag3?.vote_created === true ||
    countingTrace?.vote_created === true ||
    summary?.vote_created === true ||
    promotionTrace?.vote_created === true
  );
  const selectedSetValid = candidateSetValid;
  const selectedSourceCount = explicitSelectedSourceCount ?? (selectedSetValid ? derivedSelectedCount : 0);
  const majorityRequired = 3;
  const winningCluster = firstDefined(ag3?.winning_cluster, summary.winning_cluster, promotionTrace.winning_cluster, {});
  const explicitMajorityAchieved = toFiniteNumber(
    firstDefined(
      ag3?.support_count,
      winningCluster?.support_count,
      ag3?.majority_achieved,
      ag3?.selected_supporting_count,
      countingTrace?.support_count,
      countingTrace?.majority_achieved,
      countingTrace?.selected_supporting_count,
      summary.support_count,
      summary.winning_cluster?.support_count,
      summary.majority_achieved,
      summary.selected_supporting_count,
      promotionTrace.support_count,
      promotionTrace.winning_cluster?.support_count,
      promotionTrace.majority_achieved,
      promotionTrace.selected_supporting_count,
    )
  );
  const majorityAchieved = explicitMajorityAchieved ?? 0;
  const candidateIdentity = normalizeIdentityForDecision(
    firstDefined(ag3?.candidate_identity, summary.candidate_identity, promotionTrace.candidate_identity, {}),
  );
  const winningIdentity = normalizeIdentityForDecision(
    firstDefined(ag3?.winning_identity, winningCluster, summary.winning_identity, promotionTrace.winning_identity, {}),
  );
  const voteIdentity = normalizeIdentityForDecision(
    firstDefined(ag3?.vote_identity, ag3?.winning_identity, winningCluster, summary.vote_identity, promotionTrace.vote_identity, {}),
  );
  const ag3IsValidVote = consensus.validVoteKeys.includes("visual_search") || consensus.matchedAgentsKeys.includes("visual_search");
  const ag3IsMatchedVote = consensus.matchedAgentsKeys.includes("visual_search");

  const explicitValidVote = toPublicBoolean(ag3?.valid_vote, countingTrace?.valid_vote, summary.valid_vote, promotionTrace.valid_vote);
  const explicitVoteEligible = toPublicBoolean(
    ag3?.vote_eligible,
    ag3?.ag3_vote_eligible,
    countingTrace?.vote_eligible,
    countingTrace?.ag3_vote_eligible,
    summary.vote_eligible,
    promotionTrace.vote_eligible,
  );
  const voteEligible = ag3IsValidVote || explicitValidVote === true || explicitVoteEligible === true || Boolean(
    explicitVoteEligible !== false &&
    selectedSetValid &&
    majorityAchieved >= majorityRequired &&
    hasDecisionIdentity(voteIdentity)
  );
  const explicitVoteCreated = toPublicBoolean(ag3?.vote_created, countingTrace?.vote_created, summary.vote_created, promotionTrace.vote_created);
  const voteCreated = ag3IsValidVote || explicitValidVote === true || explicitVoteCreated === true || Boolean(
    explicitVoteCreated !== false &&
    voteEligible &&
    hasDecisionIdentity(voteIdentity)
  );
  const searchPerformed = toPublicBoolean(ag3?.search_performed, countingTrace?.search_performed, summary.search_performed, promotionTrace.search_performed);
  const agreementPattern = (voteCreated || voteEligible || selectedSetValid) && searchPerformed !== false
    ? (
        /^\d+\/\d+$/.test(rawAgreementPattern) && !rawAgreementPattern.startsWith("0/") && rawAgreementPattern !== "0/5"
          ? rawAgreementPattern
          : `${majorityAchieved}/${selectedSourceCount || 5}`
      )
    : null;
  const aggregatorCounted = toPublicBoolean(
    ag3?.counted_in_consensus,
    ag3?.counted_by_backend,
    ag3?.counted,
    ag3?.not_counted_in_consensus === false ? true : null,
    ag3?.not_counted_in_consensus === true ? false : null,
    countingTrace?.counted_in_consensus,
    countingTrace?.counted_by_backend,
    countingTrace?.counted,
    countingTrace?.not_counted_in_consensus === false ? true : null,
    countingTrace?.not_counted_in_consensus === true ? false : null,
    summary?.counted_in_consensus,
    summary?.counted_by_backend,
    summary?.counted,
    summary?.not_counted_in_consensus === false ? true : null,
    summary?.not_counted_in_consensus === true ? false : null,
    promotionTrace?.counted_in_consensus,
    promotionTrace?.counted_by_backend,
    promotionTrace?.counted,
    promotionTrace?.not_counted_in_consensus === false ? true : null,
    promotionTrace?.not_counted_in_consensus === true ? false : null,
  );
  const aggregatorMatched = toPublicBoolean(
    ag3?.matched,
    ag3?.agreed_with_final,
    ag3?.matches_final,
    countingTrace?.matched,
    countingTrace?.agreed_with_final,
    countingTrace?.matches_final,
    summary?.matched,
    summary?.agreed_with_final,
    summary?.matches_final,
    promotionTrace?.matched,
    promotionTrace?.agreed_with_final,
    promotionTrace?.matches_final,
  );
  const counted = Boolean(
    ag3IsValidVote || ((voteCreated || voteEligible) && aggregatorCounted === true)
  );
  const matched = Boolean(
    ag3IsMatchedVote || (counted && aggregatorMatched === true)
  );
  const technicalError = Boolean(
    ag3?.technical_error === true || 
    (ag3?.status && ["failed", "timeout", "error", "technical_error", "agent_error"].includes(String(ag3.status).toLowerCase())) ||
    String(ag3?.error_type).toLowerCase() === "technical_error"
  );
  const technicalStage = toSafeString(firstDefined(ag3?.technical_stage, summary.technical_stage, ag3?.timeout_stage, summary.timeout_stage), "");
  const errorType = toSafeString(firstDefined(ag3?.error_type, summary.error_type), "");
  const selectedSources = selectedVotingSources.map((source) => applyAg3VotingDisplay(source, true));
  const supportingSources = selectedSources
    .filter((source) =>
      source.disposition === "supporting" || ag3SourceMatchesIdentity(source, voteIdentity),
    )
    .slice(0, 3);
  const articlePreview = rawSources.map((source) => {
    const isSelected = selectedVotingSources.some(
      (s) =>
        (s.url && source.url && s.url === source.url) ||
        (
          s.domain &&
          source.domain &&
          s.title &&
          source.title &&
          s.domain.toLowerCase() === source.domain.toLowerCase() &&
          s.title.toLowerCase() === source.title.toLowerCase()
        )
    );
    return applyAg3VotingDisplay(source, source.selected || isSelected);
  });

  return {
    rawCount,
    initialCount,
    targetedCount,
    candidateSourceCount,
    requiredSourceCount,
    selectedSourceCount,
    selectedSetValid,
    majorityRequired,
    majorityAchieved,
    agreementPattern,
    candidateIdentity,
    winningIdentity,
    voteIdentity,
    voteEligible,
    voteCreated,
    counted,
    matched,
    technicalError,
    technicalStage,
    errorType,
    searchPerformed,
    articlePreview,
    initialResultCount: initialCount,
    targetedResultCount: targetedCount,
    totalResultCount: rawCount,
    selectedSources,
    supportingSources,
    selectionReason: toSafeString(firstDefined(ag3?.selection_reason, summary.selection_reason, summary.promotion_reason), ""),
  };
};

export const getWhyThisResultLensStatus = (
  ag3,
  ag3Vote,
  finalDenomination = "",
  lang = "VI",
) => {
  const ag3Summary =
    ag3?.ag3_verification_summary && typeof ag3.ag3_verification_summary === "object"
      ? ag3.ag3_verification_summary
      : {};
  const ag3VoteSummary =
    ag3Vote?.ag3_verification_summary && typeof ag3Vote.ag3_verification_summary === "object"
      ? ag3Vote.ag3_verification_summary
      : {};
  const eligibleSignal = firstDefined(
    ag3?.vote_eligible,
    ag3Summary?.vote_eligible,
    ag3Vote?.vote_eligible,
    ag3VoteSummary?.vote_eligible,
    null,
  );
  const fallbackEligibleCount = toFiniteNumber(
    firstDefined(
      ag3?.eligible_evidence_count,
      ag3Summary?.eligible_evidence_count,
      ag3Vote?.eligible_evidence_count,
      ag3VoteSummary?.eligible_evidence_count,
      null,
    ),
  );
  const isAg3Eligible = ag3
    ? Boolean(eligibleSignal ?? (fallbackEligibleCount !== null && fallbackEligibleCount > 0))
    : false;

  const explicitlyNotCounted = Boolean(
    ag3?.not_counted_in_consensus === true ||
      ag3Summary?.not_counted_in_consensus === true ||
      ag3Vote?.not_counted_in_consensus === true ||
      ag3VoteSummary?.not_counted_in_consensus === true ||
      ag3?.vote_eligible === false ||
      ag3Summary?.vote_eligible === false ||
      ag3Vote?.vote_eligible === false,
  );
  const isAg3Counted = ag3
    ? !explicitlyNotCounted && Boolean(
        ag3?.counted_in_consensus === true ||
          ag3Summary?.counted_in_consensus === true ||
          ag3Vote?.counted_in_consensus === true ||
          ag3VoteSummary?.counted_in_consensus === true ||
          ag3?.counted_by_backend === true ||
          ag3?.counted === true ||
          ag3Vote?.counted === true,
      )
    : false;

  const isAg3Matched = ag3
    ? !explicitlyNotCounted && Boolean(
        ag3?.matched === true ||
          ag3Summary?.matched === true ||
          ag3?.agreed_with_final === true ||
          ag3?.matches_final === true ||
          ag3Vote?.matched === true,
      )
    : false;

  const totalRawCount =
    ag3?.total_raw_evidence_count ??
    ag3Summary?.total_raw_evidence_count ??
    ag3Vote?.total_raw_evidence_count ??
    ag3VoteSummary?.total_raw_evidence_count ??
    ag3?.raw_lens_result_count ??
    ag3Summary?.raw_lens_result_count ??
    ag3Vote?.raw_lens_result_count ??
    ag3VoteSummary?.raw_lens_result_count ??
    0;
  const indepCount =
    ag3?.qualified_independent_domain_count ??
    ag3Summary?.qualified_independent_domain_count ??
    ag3?.eligible_independent_domain_count ??
    ag3Summary?.eligible_independent_domain_count ??
    ag3Vote?.qualified_independent_domain_count ??
    ag3VoteSummary?.qualified_independent_domain_count ??
    ag3Vote?.eligible_independent_domain_count ??
    ag3VoteSummary?.eligible_independent_domain_count ??
    0;

  if (!ag3 && !ag3Vote) {
    return {
      iconColor: "text-slate-400",
      text:
        lang === "VI"
          ? "Google Lens: Chưa ghi nhận dữ liệu phiếu bầu từ tác tử này."
          : "Google Lens: No vote data recorded from this agent.",
      isEligible: false,
      isCounted: false,
      isMatched: false,
    };
  }

  if (!isAg3Eligible) {
    return {
      iconColor: "text-amber-500",
      text:
        lang === "VI"
          ? `Google Lens: Tìm được ${totalRawCount} kết quả thô, có ${indepCount} nguồn hợp lệ. Chưa đủ điều kiện tạo phiếu bầu.`
          : `Google Lens: Found ${totalRawCount} raw results, ${indepCount} valid independent sources. Ineligible for voting.`,
      isEligible: false,
      isCounted: isAg3Counted,
      isMatched: isAg3Matched,
    };
  }

  if (isAg3Counted && isAg3Matched) {
    return {
      iconColor: "text-emerald-500",
      text:
        lang === "VI"
          ? `Google Lens: Tìm được ${totalRawCount} kết quả thô, có ${indepCount} nguồn hợp lệ. Tạo 1 phiếu xác nhận mệnh giá ${finalDenomination}.`
          : `Google Lens: Found ${totalRawCount} raw results, ${indepCount} valid independent sources. Created 1 vote supporting ${finalDenomination}.`,
      isEligible: true,
      isCounted: true,
      isMatched: true,
    };
  }

  return {
    iconColor: "text-amber-500",
    text:
      lang === "VI"
        ? `Google Lens: Tìm được ${totalRawCount} kết quả thô, có ${indepCount} nguồn hợp lệ. Tạo 1 phiếu nhưng không khớp mệnh giá hoặc không được tính vào đồng thuận.`
        : `Google Lens: Found ${totalRawCount} raw results, ${indepCount} valid independent sources. Created 1 vote but not counted in consensus.`,
    isEligible: true,
    isCounted: isAg3Counted,
    isMatched: isAg3Matched,
  };
};
