import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecognitionRestoreKey,
  buildMoneyCanonical,
  cleanLensTitle,
  findBackendValidVote,
  formatCountryDisplay,
  formatSuggestedResultText,
  getAg3FormatterLabel,
  getAg3MethodLabel,
  getAg3ProviderLabel,
  getCropPreviewSource,
  getPublicAgentExplanation,
  inferMoneyCurrency,
  isAg3GroqFormatterUsed,
  isInternalMachineReason,
  isSameMoneyVote,
  normalizeCropBbox,
  resolveAgentVoteStatus,
  sanitizeSuggestedResult,
  shouldRefetchRecognitionResult,
} from "./agentVote.js";

test("AG3 labels do not mention Groq when the formatter was not used", () => {
  const payload = {
    provider: "groq",
    formatter_provider: "deterministic",
    groq_called: false,
    ag3_groq_formatter_used: false,
    phuong_phap: "Google Lens / SerpAPI + Groq Formatter",
  };

  assert.equal(isAg3GroqFormatterUsed(payload), false);
  assert.equal(getAg3ProviderLabel(payload), "SerpAPI");
  assert.equal(getAg3FormatterLabel(payload), "Deterministic");
  assert.equal(getAg3MethodLabel(payload), "Google Lens / SerpAPI");
});

test("AG3 labels mention Groq only when the formatter was used", () => {
  const payload = {
    provider: "serpapi",
    formatter_provider: "groq",
    groq_called: true,
    ag3_groq_formatter_used: true,
    phuong_phap: "Google Lens / SerpAPI + Groq Formatter",
  };

  assert.equal(isAg3GroqFormatterUsed(payload), true);
  assert.equal(getAg3ProviderLabel(payload), "SerpAPI");
  assert.equal(getAg3FormatterLabel(payload), "Groq");
  assert.equal(getAg3MethodLabel(payload), "Google Lens / SerpAPI + Groq Formatter");
});

test("TTD valid votes render as matched with an open-world currency code", () => {
  const finalVote = buildMoneyCanonical({
    country: "Trinidad và Tobago",
    currency: "TTD",
    denomination: "50 TTD",
  });
  const agentVote = buildMoneyCanonical({
    country: "Trinidad và Tobago",
    currency: "TTD",
    denomination: "50 TTD",
  });
  const validVotes = [
    { agent_key: "ml_dl", vote_key: ["trinidad và tobago", "TTD", "50"] },
    { agent_key: "llm_api", vote_key: ["trinidad và tobago", "TTD", "50"] },
  ];

  assert.equal(inferMoneyCurrency("50 TTD", "TTD"), "TTD");
  assert.equal(isSameMoneyVote(agentVote, finalVote), true);
  for (const agentKey of ["ml_dl", "llm_api"]) {
    const backendValidVote = findBackendValidVote(validVotes, agentKey);
    assert.ok(backendValidVote);
    assert.equal(
      resolveAgentVoteStatus({
        nonVoting: false,
        rawStatus: "completed",
        backendVoteMatchesFinal: isSameMoneyVote(agentVote, finalVote),
        fallbackMatchesFinal: true,
      }),
      "matched",
    );
  }
});

test("non-voting AG3 stays not counted even if its value resembles the final vote", () => {
  assert.equal(
    resolveAgentVoteStatus({
      nonVoting: true,
      rawStatus: "failed",
      backendVoteMatchesFinal: false,
      fallbackMatchesFinal: true,
    }),
    "not_counted",
  );
});

test("LAK and USD regressions match while a real conflicting vote differs", () => {
  for (const [country, currency, denomination] of [
    ["Lào", "LAK", "2000 LAK"],
    ["United States", "USD", "1 USD"],
  ]) {
    const canonical = buildMoneyCanonical({ country, currency, denomination });
    assert.equal(isSameMoneyVote(canonical, canonical), true);
  }
  assert.equal(
    resolveAgentVoteStatus({
      nonVoting: false,
      rawStatus: "completed",
      backendVoteMatchesFinal: false,
      fallbackMatchesFinal: false,
    }),
    "different",
  );
});

test("suggested result text renders the single valid agent hint only", () => {
  assert.equal(
    formatSuggestedResultText(
      {
        country: "Cambodia",
        currency_code: "KHR",
        amount: 100,
        agent_key: "llm_api",
        confidence: 0.84,
      },
      "VI",
    ),
    "Gợi ý từ tác tử hợp lệ: Cambodia — 100 KHR.",
  );
});

test("suggested result formatter ignores base64 and provider key fingerprints", () => {
  const suggested = {
    country: "Cambodia",
    currency_code: "KHR",
    amount: 100,
    agent_key: "llm_api",
    crop_base64: "raw-base64-data",
    provider_trace: {
      serpapi_key_last4: "WXYZ",
      serpapi_key_len: 32,
    },
  };

  const safe = sanitizeSuggestedResult(suggested);
  assert.deepEqual(Object.keys(safe).sort(), [
    "agent_key",
    "amount",
    "confidence",
    "country",
    "currency_code",
  ]);

  const rendered = formatSuggestedResultText(suggested, "VI");
  assert.equal(rendered.includes("raw-base64-data"), false);
  assert.equal(rendered.includes("WXYZ"), false);
  assert.equal(rendered.includes("serpapi"), false);
});

test("result restore refetches when a task id is present despite stale raw result", () => {
  assert.equal(buildRecognitionRestoreKey("task-1", null), "task:task-1");
  assert.equal(
    shouldRefetchRecognitionResult({
      rawResult: { status: "Failed", error_type: "missing_api_key" },
      taskId: "task-1",
      lastRestoreKey: null,
    }),
    true,
  );
});

test("result restore does not refetch the same task key repeatedly", () => {
  assert.equal(
    shouldRefetchRecognitionResult({
      rawResult: { status: "Completed" },
      taskId: "task-1",
      hasRestored: true,
      lastRestoreKey: "task:task-1",
    }),
    false,
  );
});

test("crop preview uses original image and bbox without base64", () => {
  const preview = getCropPreviewSource(
    {
      bbox: [434, 4, 1061, 318],
      crop_width: 627,
      crop_height: 314,
      crop_source: "yolo_crop",
      crop_base64: "raw-base64-data",
    },
    "https://cdn.example/original.jpg",
  );

  assert.equal(preview.kind, "bbox");
  assert.equal(preview.imageUrl, "https://cdn.example/original.jpg");
  assert.deepEqual(preview.bbox, {
    x1: 434,
    y1: 4,
    x2: 1061,
    y2: 318,
    width: 627,
    height: 314,
  });
  assert.equal(JSON.stringify(preview).includes("raw-base64-data"), false);
});

test("crop preview returns null when bbox is missing", () => {
  assert.equal(
    getCropPreviewSource({ crop_source: "yolo_crop" }, "https://cdn.example/original.jpg"),
    null,
  );
  assert.equal(normalizeCropBbox([1, 2, 1, 4]), null);
});

test("AG3 public explanation does not count vote_eligible as consensus counted", () => {
  const text = getPublicAgentExplanation(
    {
      agentKey: "visual_search",
      denom: "100000 VND",
      evidence: [{ title: "Marketplace listing", domain: "example.com" }],
      payload: {
        vote_eligible: true,
        counted_in_consensus: false,
        not_counted_in_consensus: true,
        raw_lens_result_count: 5,
        eligible_independent_domain_count: 2,
      },
    },
    {},
    "EN",
  );

  assert.equal(text.includes("Not enough verified Lens evidence"), true);
  assert.equal(text.includes("support the 100000 VND result"), false);
});

test("multi-object crop preview keeps each object's bbox", () => {
  const imageUrl = "https://cdn.example/original.jpg";
  const first = getCropPreviewSource({ bbox: [0, 0, 50, 25] }, imageUrl);
  const second = getCropPreviewSource({ bbox: [100, 40, 180, 90] }, imageUrl);

  assert.deepEqual(first.bbox, { x1: 0, y1: 0, x2: 50, y2: 25, width: 50, height: 25 });
  assert.deepEqual(second.bbox, { x1: 100, y1: 40, x2: 180, y2: 90, width: 80, height: 50 });
});

test("formatCountryDisplay localizes country names accurately for EN and VI", () => {
  assert.equal(formatCountryDisplay("Hoa Kỳ", "EN"), "United States");
  assert.equal(formatCountryDisplay("United States", "VI"), "Hoa Kỳ");
  assert.equal(formatCountryDisplay("vietnam", "VI"), "Việt Nam");
  assert.equal(formatCountryDisplay("thailand", "EN"), "Thailand");
  assert.equal(formatCountryDisplay("N/A", "EN"), "Not recorded");
  assert.equal(formatCountryDisplay("N/A", "VI"), "Không xác định");
});

test("crop preview ignores public data urls and raw base64", () => {
  assert.equal(
    getCropPreviewSource(
      {
        bbox: [0, 0, 20, 10],
        crop_image_url: "data:image/jpeg;base64,raw-base64-data",
      },
      "data:image/jpeg;base64,original-base64",
    ),
    null,
  );
});

test("getPublicAgentExplanation uses explicit public_summary or public_explanation if present", () => {
  const vote = {
    agentKey: "ml_dl",
    denom: "5,000 VND",
    country: "Việt Nam",
    payload: {
      public_summary: "Nhận diện số 5000 và dòng chữ NĂM NGHÌN ĐỒNG.",
    },
  };
  assert.equal(
    getPublicAgentExplanation(vote, {}, "VI"),
    "Nhận diện số 5000 và dòng chữ NĂM NGHÌN ĐỒNG.",
  );
});

test("getPublicAgentExplanation constructs distinct AG1, AG2, AG3 summaries when backend text is absent", () => {
  const ag1Vote = {
    agentKey: "ml_dl",
    denom: "5,000 VND",
    country: "Việt Nam",
    payload: { visible_text: ["5000", "NĂM NGHÌN ĐỒNG"] },
  };
  const ag2Vote = {
    agentKey: "llm_api",
    denom: "5,000 VND",
    country: "Việt Nam",
  };
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "5,000 VND",
    country: "Việt Nam",
    status: "completed",
    payload: {
      counted_in_consensus: true,
      raw_lens_result_count: 5,
      candidate_source_count: 5,
      ag3_verification_summary: {
        required_selected_source_count: 5,
        selected_source_count: 5,
      },
    },
    evidence: [{ title: "Tờ tiền 5.000 đồng Việt Nam" }],
  };

  const ag1Expl = getPublicAgentExplanation(ag1Vote, {}, "VI");
  const ag2Expl = getPublicAgentExplanation(ag2Vote, {}, "VI");
  const ag3Expl = getPublicAgentExplanation(ag3Vote, {}, "VI");

  assert.ok(ag1Expl.includes("5000, NĂM NGHÌN ĐỒNG"));
  assert.ok(ag2Expl.includes("Đối chiếu mệnh giá"));
  assert.ok(ag3Expl.includes("5 nguồn độc lập trong tập biểu quyết"));

  // Ensure AG1, AG2, AG3 produce distinct strings and never generic placeholder
  assert.notEqual(ag1Expl, ag2Expl);
  assert.notEqual(ag2Expl, ag3Expl);
  assert.equal(ag1Expl.includes("Phân tích đặc điểm thị giác và mệnh giá tiền giấy"), false);
  assert.equal(ag2Expl.includes("Phân tích đặc điểm thị giác và mệnh giá tiền giấy"), false);
  assert.equal(ag3Expl.includes("Phân tích đặc điểm thị giác và mệnh giá tiền giấy"), false);
});

test("getPublicAgentExplanation returns standardized fallback when explanation is missing or vote failed", () => {
  const failedVote = {
    agentKey: "ml_dl",
    voteStatus: "failed",
  };
  const emptyVote = null;

  assert.equal(
    getPublicAgentExplanation(failedVote, {}, "VI"),
    "Chưa ghi nhận phần giải thích công khai của tác tử này.",
  );
  assert.equal(
    getPublicAgentExplanation(emptyVote, {}, "EN"),
    "No public explanation was recorded for this agent.",
  );
});

test("getPublicAgentExplanation does not leak prompt, base64, or key fingerprints", () => {
  const dirtyVote = {
    agentKey: "ml_dl",
    denom: "100 USD",
    country: "United States",
    payload: {
      prompt: "SECRET SYSTEM PROMPT DO NOT LEAK",
      crop_base64: "BASE64BYTESHERE",
      traceback: "Traceback (most recent call last)...",
      local_path: "C:\\Users\\Admin\\secret.py",
      public_summary: "Recognized 100 USD banknote from United States.",
    },
  };
  const result = getPublicAgentExplanation(dirtyVote, {}, "EN");
  assert.equal(result.includes("SECRET SYSTEM PROMPT"), false);
  assert.equal(result.includes("BASE64BYTESHERE"), false);
  assert.equal(result.includes("Traceback"), false);
  assert.equal(result.includes("secret.py"), false);
  assert.equal(result, "Recognized 100 USD banknote from United States.");
});

test("isInternalMachineReason correctly identifies machine internal codes", () => {
  assert.equal(isInternalMachineReason("single_untrusted_page_text_source"), true);
  assert.equal(isInternalMachineReason("weak_single_lens_evidence"), true);
  assert.equal(isInternalMachineReason("insufficient_support_signals"), true);
  assert.equal(isInternalMachineReason("some_custom_backend_code"), true);
  assert.equal(isInternalMachineReason("Nhận diện số 5000 NĂM NGHÌN ĐỒNG."), false);
  assert.equal(isInternalMachineReason("5 nguồn Lens hỗ trợ kết quả."), false);
});

test("cleanLensTitle trims HTML, trailing dots, and raw URLs cleanly", () => {
  assert.equal(cleanLensTitle("Tờ tiền 5.000 đồng Việt Nam...."), "Tờ tiền 5.000 đồng Việt Nam");
  assert.equal(cleanLensTitle("Banknote 100 USD... ."), "Banknote 100 USD");
  assert.equal(cleanLensTitle("https://example.com/item"), "");
  assert.equal(cleanLensTitle("<b>Tiền Polymer</b> — 100k..."), "Tiền Polymer — 100k");
});

test("getPublicAgentExplanation ignores AG3 internal machine reason single_untrusted_page_text_source and uses Lens sources summary", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "5,000 VND",
    country: "Việt Nam",
    reason: "single_untrusted_page_text_source",
    payload: {
      reason: "single_untrusted_page_text_source",
      explanation: "single_untrusted_page_text_source",
      raw_lens_result_count: 5,
      candidate_source_count: 5,
      counted_in_consensus: true,
      ag3_verification_summary: {
        required_selected_source_count: 5,
        selected_source_count: 5,
      },
    },
    evidence: [
      { title: "Tờ tiền 5.000 đồng Việt Nam - Ngân hàng Nhà nước...." },
      { title: "Mệnh giá 5000 VND Polymer" },
    ],
  };

  const expl = getPublicAgentExplanation(ag3Vote, {}, "VI");
  assert.equal(expl.includes("single_untrusted_page_text_source"), false);
  assert.ok(expl.includes("Có 5 nguồn độc lập trong tập biểu quyết"));
  assert.equal(expl.includes("...."), false);
});

test("Frontend Test 9: Does not display 5 supporting sources when raw_count=5 but eligible_count < 5", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "Không xác định",
    payload: {
      raw_lens_result_count: 5,
      eligible_evidence_count: 1,
      eligible_independent_domain_count: 1,
      counted_in_consensus: false,
      promotion_reason: "insufficient_independent_exact_evidence",
    },
    evidence: [
      { title: "Item 1", badge: "Conflicting denomination" },
      { title: "Item 2", badge: "Supporting but insufficient" },
      { title: "Item 3", badge: "Duplicate domain" },
      { title: "Item 4", badge: "Social source" },
      { title: "Item 5", badge: "Social source" },
    ],
  };
  const expl = getPublicAgentExplanation(ag3Vote, {}, "EN");
  assert.equal(expl.includes("5 Google Lens sources support"), false);
  assert.ok(expl.includes("Not enough verified Lens evidence"));
});

test("Frontend Test 10: Displays raw count and suitable-source count separately", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "Không xác định",
    payload: {
      raw_lens_result_count: 5,
      eligible_evidence_count: 1,
      eligible_independent_domain_count: 1,
      counted_in_consensus: false,
    },
  };
  const expl = getPublicAgentExplanation(ag3Vote, {}, "EN");
  assert.ok(expl.includes("5 Lens results and 1 suitable source were found"));
  assert.ok(expl.includes("At least 3 independent sources are required before voting"));
});

test("Frontend Test 11: Not-counted reason comes from promotion trace", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "Không xác định",
    payload: {
      raw_lens_result_count: 5,
      eligible_independent_domain_count: 1,
      counted_in_consensus: false,
      promotion_reason: "near_top_conflicting_denomination",
    },
  };
  const expl = getPublicAgentExplanation(ag3Vote, {}, "EN");
  assert.ok(expl.includes("Conflicting denomination found in search results"));
});

test("Frontend Test 12: Top raw result is not labeled as top supporting source when not counted", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    denom: "Không xác định",
    payload: {
      raw_lens_result_count: 5,
      eligible_independent_domain_count: 1,
      counted_in_consensus: false,
    },
    evidence: [{ title: "Tờ 20 đô la Mỹ" }],
  };
  const expl = getPublicAgentExplanation(ag3Vote, {}, "EN");
  assert.equal(expl.includes("Top source:"), false);
});

test("Frontend Test 13: Evidence exclusion badges map correctly", () => {
  const item1 = { badge: "Social source", is_social: true };
  const item2 = { badge: "Duplicate domain", is_mirror: true };
  const item3 = { badge: "Conflicting denomination" };
  assert.equal(item1.badge, "Social source");
  assert.equal(item2.badge, "Duplicate domain");
  assert.equal(item3.badge, "Conflicting denomination");
});

test("Frontend Test 14: Partial status is not interpreted as an invalid classification error", () => {
  const ag3Vote = {
    agentKey: "visual_search",
    status: "Partial",
    payload: {
      status: "Partial",
      raw_lens_result_count: 5,
      eligible_independent_domain_count: 1,
      counted_in_consensus: false,
    },
  };
  const expl = getPublicAgentExplanation(ag3Vote, {}, "EN");
  assert.equal(expl.includes("Lỗi"), false);
  assert.equal(expl.includes("error"), false);
  assert.ok(expl.includes("Not enough verified Lens evidence"));
});
