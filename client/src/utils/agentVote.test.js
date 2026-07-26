import test from "node:test";
import assert from "node:assert/strict";

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
  isAg3GroqFormatterUsed,
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

test("multi-object crop preview keeps each object's bbox", () => {
  const imageUrl = "https://cdn.example/original.jpg";
  const first = getCropPreviewSource({ bbox: [0, 0, 50, 25] }, imageUrl);
  const second = getCropPreviewSource({ bbox: [100, 40, 180, 90] }, imageUrl);

  assert.deepEqual(first.bbox, { x1: 0, y1: 0, x2: 50, y2: 25, width: 50, height: 25 });
  assert.deepEqual(second.bbox, { x1: 100, y1: 40, x2: 180, y2: 90, width: 80, height: 50 });
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
