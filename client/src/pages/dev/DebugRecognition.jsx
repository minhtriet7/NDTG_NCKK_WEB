import React, { useState, useRef, useCallback } from "react";
import "./DebugRecognition.css";
import { scanBanknoteDebug } from "../../services/recognitionService";
import { getStoredToken } from "../../services/api";

/* ─────────────────────────────────────
   Helpers
───────────────────────────────────── */
function fmt(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function pickFirst(...values) {
  return values.find(v => v !== undefined && v !== null && v !== "" && v !== "—" && v !== "-") ?? "—";
}

function extractCurrencyFromDenomination(value) {
  const text = String(value || "").toUpperCase();
  const match = text.match(/\b[A-Z]{3}\b/);
  return match ? match[0] : "";
}

function fmtJSON(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

const AGENT_VOTE_KEYS = {
  OpenAI: "ml_dl",
  LLM: "llm_api",
  Lens: "visual_search",
};

function sanitizeDebugValue(value, key = "", seen = new WeakSet()) {
  if (typeof value === "string") {
    const keyLower = String(key).toLowerCase();
    const isBinaryLike = keyLower.includes("base64") || keyLower.includes("image");
    const isLongMarkup = keyLower.includes("html") || keyLower === "raw_response";
    if (isBinaryLike && value.length > 80) {
      return `${value.slice(0, 80)}… [truncated; length=${value.length}]`;
    }
    if (isLongMarkup && value.length > 2000) {
      return `${value.slice(0, 2000)}… [truncated; length=${value.length}]`;
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map(item => sanitizeDebugValue(item, key, seen));
    seen.delete(value);
    return output;
  }
  const output = {};
  Object.entries(value).forEach(([childKey, childValue]) => {
    output[childKey] = sanitizeDebugValue(childValue, childKey, seen);
  });
  seen.delete(value);
  return output;
}

function voteKeyText(voteKey) {
  if (!voteKey) return "—";
  return Array.isArray(voteKey) ? voteKey.join(" | ") : String(voteKey);
}

function deriveWinnerVote(validVotes) {
  const counts = new Map();
  (validVotes || []).forEach(vote => {
    if (!vote?.vote_key) return;
    const key = JSON.stringify(vote.vote_key);
    const current = counts.get(key) || { count: 0, vote };
    current.count += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.vote || null;
}

function findAgentVote(validVotes, agentName) {
  const expectedKey = AGENT_VOTE_KEYS[agentName];
  return (validVotes || []).find(vote => vote?.agent_key === expectedKey) || null;
}

function rejectReason(data) {
  if (!data || Object.keys(data).length === 0) return "no_data";
  if (Array.isArray(data.validation_errors) && data.validation_errors.length) {
    return data.validation_errors.join(", ");
  }
  if (data.not_counted_in_consensus) {
    return data.not_counted_in_consensus_reason || data.not_counted_reason || "not_counted_in_consensus";
  }
  const status = String(data.status || "").toLowerCase();
  if (status && status !== "completed") return `non_voting_status:${status}`;
  return "missing canonical country/currency/amount";
}

function copyText(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function checkAuthToken() {
  try {
    const token = getStoredToken();
    return { hasToken: Boolean(token), preview: token ? token.slice(0, 24) + "..." : null };
  } catch {
    try {
      const raw = localStorage.getItem("auth-storage");
      const parsed = raw ? JSON.parse(raw) : null;
      const token = parsed?.state?.token || localStorage.getItem("access_token") || localStorage.getItem("token") || "";
      return { hasToken: Boolean(token), preview: token ? token.slice(0, 24) + "..." : null };
    } catch {
      return { hasToken: false, preview: null };
    }
  }
}

/* ─────────────────────────────────────
   Tiny UI atoms
───────────────────────────────────── */
function Badge({ label, variant }) {
  return <span className={`dbg-badge ${variant || "neutral"}`}>{label}</span>;
}

function KV({ k, v, vc }) {
  return (
    <div className="dbg-kv">
      <span className="dbg-k">{k}</span>
      <span className={`dbg-v ${vc || ""}`}>{v}</span>
    </div>
  );
}

function JsonBlock({ data }) {
  if (data === null || data === undefined) return null;
  const displayData = typeof data === "string" ? data : sanitizeDebugValue(data);
  return (
    <div className="dbg-json-wrap">
      <pre className="dbg-json">{typeof displayData === "string" ? displayData : fmtJSON(displayData)}</pre>
    </div>
  );
}

function RawJsonDetails({ label = "Raw JSON", data, defaultOpen = false }) {
  if (data === null || data === undefined) return null;
  return (
    <details open={defaultOpen} style={{ marginTop: 8 }}>
      <summary className="dbg-small" style={{ cursor: "pointer", color: "#58a6ff" }}>{label}</summary>
      <JsonBlock data={data} />
    </details>
  );
}

function Section({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dbg-section">
      <div className="dbg-section-header" onClick={() => setOpen(o => !o)}>
        <span className="dbg-section-label">{title}</span>
        {badge}
        <span style={{ color: "#6e7681", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="dbg-section-body">{children}</div>}
    </div>
  );
}

/* ─────────────────────────────────────
   API request panel (shows on error)
───────────────────────────────────── */
function ApiRequestPanel({ apiLog }) {
  if (!apiLog) return null;
  return (
    <div className="dbg-api-log">
      <div className="dbg-api-log-title">🔌 API Request Info</div>
      <KV k="URL" v={apiLog.url} vc="blue" />
      <KV k="Method" v={apiLog.method} />
      <KV k="FormData field" v={apiLog.formField} />
      <KV k="Auth token" v={apiLog.hasToken ? "Present" : "MISSING"} vc={apiLog.hasToken ? "ok" : "err"} />
      <KV k="Status" v={apiLog.status ? String(apiLog.status) : "—"} vc={apiLog.status >= 400 ? "err" : "ok"} />
      {apiLog.errorDetail && (
        <>
          <div className="dbg-small" style={{ marginTop: 8, marginBottom: 4, color: "#f85149" }}>Error detail from backend:</div>
          <JsonBlock data={apiLog.errorDetail} />
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────
   Bbox overlay on image
───────────────────────────────────── */
function BboxOverlay({ objects, rejectedObjects, imgNatural, imgDisplay }) {
  if (!imgNatural || !imgDisplay) return null;
  const { w: nw, h: nh } = imgNatural;
  const { w: dw, h: dh } = imgDisplay;
  if (!nw || !nh || !dw || !dh) return null;
  const sx = dw / nw;
  const sy = dh / nh;

  const renderBox = (bbox, label, cls, key) => {
    if (!bbox) return null;
    const arr = Array.isArray(bbox) ? bbox : [bbox.x1, bbox.y1, bbox.x2, bbox.y2];
    if (arr[0] == null || isNaN(arr[0])) return null;
    return (
      <div key={key} className={`dbg-bbox ${cls}`}
        style={{ left: arr[0]*sx, top: arr[1]*sy, width: (arr[2]-arr[0])*sx, height: (arr[3]-arr[1])*sy }}>
        <span className="dbg-bbox-label">{label}</span>
      </div>
    );
  };

  return (
    <div className="dbg-img-overlay">
      {(objects||[]).map((obj, i) => {
        const cc = obj.crop_checker || {};
        const action = (cc.action || obj.ag0_action || "KEEP").toLowerCase();
        const cls = action === "keep" ? "keep" : action === "review" ? "review" : "drop";
        return renderBox(obj.bbox, `#${obj.object_index||i+1} ${action.toUpperCase()}`, cls, `o${i}`);
      })}
      {(rejectedObjects||[]).filter(o=>o.bbox).map((obj, i) => {
        const action = (obj.ag0_action || "DROP").toLowerCase();
        return renderBox(obj.bbox, `REJ#${i+1} ${action.toUpperCase()}`, "drop", `r${i}`);
      })}
    </div>
  );
}

/* ─────────────────────────────────────
   AG0 panel
───────────────────────────────────── */
function AG0Panel({ obj }) {
  if (!obj) return <span className="dbg-small">—</span>;
  const cc = obj.crop_checker || {};
  const action = (cc.action || obj.ag0_action || "KEEP").toUpperCase();
  const cls = action === "KEEP" ? "keep" : action === "REVIEW" ? "review" : "drop";
  const eligible = obj.agent_eligible === true || cc.agent_eligible === true;
  const score = cc.banknote_score ?? obj.banknote_score;
  const docScore = cc.document_score ?? obj.document_score;
  const conf = cc.confidence ?? obj.crop_confidence;
  const reason = cc.decision_reason || cc.reason || obj.decision_reason || "—";
  const pos = cc.positive_evidence || obj.positive_evidence || [];
  const neg = cc.negative_evidence || obj.negative_evidence || [];
  const codes = cc.reason_codes || [];
  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge label={action} variant={cls} />
        <Badge label={eligible ? "AGENT ELIGIBLE" : "NOT ELIGIBLE"} variant={eligible ? "yes" : "no"} />
        {score != null && <span className="dbg-small">banknote_score: <strong style={{ color: "#c9d1d9" }}>{Number(score).toFixed(3)}</strong></span>}
        {docScore != null && <span className="dbg-small">doc_score: <strong style={{ color: "#c9d1d9" }}>{Number(docScore).toFixed(3)}</strong></span>}
        {conf != null && <span className="dbg-small">conf: <strong style={{ color: "#c9d1d9" }}>{Number(conf).toFixed(2)}</strong></span>}
      </div>
      <KV k="Reason" v={reason} />
      {codes.length > 0 && <KV k="Reason codes" v={codes.join(", ")} />}
      {pos.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginBottom: 3 }}>Positive evidence:</div>
          <ul className="dbg-evidence">{pos.map((e, i) => <li key={i} className="positive">{fmt(e)}</li>)}</ul>
        </>
      )}
      {neg.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginBottom: 3 }}>Negative evidence:</div>
          <ul className="dbg-evidence">{neg.map((e, i) => <li key={i} className="negative">{fmt(e)}</li>)}</ul>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────
   Generic agent panel (AG1/AG2)
───────────────────────────────────── */
function AgentPanel({ agentData, rawContent }) {
  if (!agentData) return <span className="dbg-small">Không có dữ liệu</span>;
  const st = agentData.status || "—";
  const stCls = st === "Completed" ? "completed" : st === "Failed" ? "failed" : st === "Disabled" ? "disabled" : "warning";
  const denom = pickFirst(agentData.menh_gia, agentData.denomination, agentData.final_denomination);
  const currency = pickFirst(agentData.ma_tien_te, agentData.currency, agentData.loai_tien, agentData.currency_code, extractCurrencyFromDenomination(denom));
  const country = pickFirst(agentData.quoc_gia, agentData.country);
  const conf = agentData.do_tin_cay ?? agentData.confidence;
  const model = agentData.model || agentData.model_name || agentData.model_used || "—";
  const provider = agentData.provider || agentData.phuong_phap || "—";
  const errType = agentData.error_type || agentData.error_category || "—";
  const errMsg = agentData.error_message || agentData.loi || "—";
  const attempts = agentData.attempt_count ?? agentData.attempts;
  const duration = agentData.duration_ms;
  const valErrors = agentData.validation_errors || [];
  const fallback = agentData.fallback_info || agentData.fallback;
  const quota = agentData.quota_error || agentData.rate_limit;
  const mat_truoc = agentData.mat_tien || agentData.mat_truoc;
  const desc = agentData.mo_ta || agentData.description;
  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge label={st} variant={stCls} />
        {model !== "—" && <span className="dbg-small">model: <strong style={{ color: "#58a6ff" }}>{model}</strong></span>}
        {provider !== "—" && <span className="dbg-small">provider: <strong style={{ color: "#c9d1d9" }}>{provider}</strong></span>}
        {attempts != null && <span className="dbg-small">attempts: {attempts}</span>}
        {duration != null && <span className="dbg-small">⏱ {duration}ms</span>}
      </div>
      <KV k="Country" v={country} vc={country !== "—" ? "ok" : "muted"} />
      <KV k="Currency" v={currency} vc={currency !== "—" ? "blue" : "muted"} />
      <KV k="Denomination" v={denom} vc={denom !== "—" ? "ok" : "muted"} />
      {conf != null && <KV k="Confidence" v={`${(Number(conf)*100).toFixed(1)}%`} />}
      {mat_truoc && <KV k="Mặt tiền" v={mat_truoc} />}
      {desc && <KV k="Mô tả" v={desc.slice(0,200)} />}
      {errType !== "—" && <KV k="Error type" v={errType} vc="err" />}
      {errMsg !== "—" && <KV k="Error msg" v={errMsg} vc="err" />}
      {quota && <KV k="Quota/Rate limit" v={String(quota)} vc="warn" />}
      {fallback && <KV k="Fallback" v={typeof fallback === "object" ? fmtJSON(fallback) : String(fallback)} vc="warn" />}
      {valErrors.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginTop: 6 }}>Validation errors:</div>
          <ul className="dbg-evidence">{valErrors.map((e, i) => <li key={i} className="negative">{fmt(e)}</li>)}</ul>
        </>
      )}
      {rawContent && (
        <>
          <div className="dbg-small" style={{ marginTop: 8, marginBottom: 4 }}>Raw response:</div>
          <JsonBlock data={rawContent} />
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────
   AG3 panel
───────────────────────────────────── */
function AG3Panel({ agentData }) {
  if (!agentData) return <span className="dbg-small">—</span>;
  const st = agentData.status || "—";
  const stCls = st === "Completed" ? "completed" : st === "Failed" ? "failed" : st === "Disabled" ? "disabled" : "warning";
  const provider = agentData.provider || agentData.phuong_phap || "—";
  const primary = agentData.primary_provider || provider;
  const fallbackProv = agentData.fallback_provider || "—";
  const fallbackEnabled = agentData.fallback_enabled;
  const fallbackRan = agentData.fallback_ran;
  const fallbackSkip = agentData.fallback_skip_reason || agentData.fallback_not_ran_reason || "—";
  const notCounted = agentData.not_counted_in_consensus;
  const notCountedReason = agentData.not_counted_reason || agentData.exclusion_reason || "—";
  const evidence = agentData.evidence || agentData.lens_results || agentData.search_results || [];
  const accepted = agentData.accepted_identity || agentData.final_identity;
  const conf = agentData.do_tin_cay ?? agentData.confidence;
  const provTrace = agentData.provider_trace || [];
  const valErrors = agentData.validation_errors || [];
  const errMsg = agentData.error_message || agentData.loi || "—";
  const errType = agentData.error_type || "—";
  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge label={st} variant={stCls} />
        {notCounted && <Badge label="NOT COUNTED IN VOTE" variant="drop" />}
        {provider !== "—" && <Badge label={`PROVIDER: ${provider.toUpperCase()}`} variant="detected" />}
      </div>
      <KV k="Primary provider" v={primary} vc="blue" />
      <KV k="Fallback provider" v={fallbackProv} />
      {fallbackEnabled != null && <KV k="Fallback enabled" v={String(fallbackEnabled)} vc={fallbackEnabled ? "ok" : "muted"} />}
      {fallbackRan != null && <KV k="Fallback ran" v={String(fallbackRan)} vc={fallbackRan ? "ok" : "warn"} />}
      {!fallbackRan && fallbackSkip !== "—" && <KV k="Fallback skip reason" v={fallbackSkip} vc="warn" />}
      {notCounted && notCountedReason !== "—" && <KV k="Not counted reason" v={notCountedReason} vc="warn" />}
      {accepted && <KV k="Accepted identity" v={fmtJSON(accepted)} vc="ok" />}
      {conf != null && <KV k="Confidence" v={`${(Number(conf)*100).toFixed(1)}%`} />}
      {errType !== "—" && <KV k="Error type" v={errType} vc="err" />}
      {errMsg !== "—" && <KV k="Error msg" v={errMsg} vc="err" />}
      {valErrors.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginTop: 6, marginBottom: 3 }}>Validation errors:</div>
          <ul className="dbg-evidence">{valErrors.map((e, i) => <li key={i} className="negative">{fmt(e)}</li>)}</ul>
        </>
      )}
      {provTrace.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginTop: 6, marginBottom: 3 }}>Provider trace:</div>
          <ul className="dbg-evidence">{provTrace.map((t, i) => <li key={i}>{fmt(t)}</li>)}</ul>
        </>
      )}
      {evidence.length > 0 && (
        <>
          <div className="dbg-small" style={{ marginTop: 8, marginBottom: 4 }}>Evidence ({evidence.length}):</div>
          {evidence.slice(0, 10).map((ev, i) => (
            <div key={i} style={{ background:"#161b22", borderRadius:4, padding:"5px 8px", marginBottom:4, fontSize:11 }}>
              <div style={{ color:"#f0f6fc", fontWeight:700 }}>{fmt(ev.title || ev.name || `#${i+1}`)}</div>
              {ev.snippet && <div style={{ color:"#8b949e", marginTop:2 }}>{ev.snippet.slice(0,200)}</div>}
              {ev.source && <div style={{ color:"#58a6ff" }}>{ev.source}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AG3Diagnostics({ agentData, rawInfo }) {
  if (!agentData || Object.keys(agentData).length === 0) {
    return <span className="dbg-small">Không có dữ liệu AG3</span>;
  }
  const providerTrace = agentData.provider_trace || {};
  const promotionTrace = agentData.promotion_trace || {};
  const stageTrace = agentData.stage_trace || rawInfo?.debug_log?.stage_trace || [];
  const evidence = agentData.evidence || [];
  const provider = pickFirst(agentData.provider, agentData.phuong_phap);
  const primaryProvider = pickFirst(agentData.primary_provider, providerTrace.primary_provider, providerTrace.primary, provider);
  const fallbackProvider = pickFirst(agentData.fallback_provider, providerTrace.fallback_provider, providerTrace.fallback);
  const fallbackAttempted = agentData.fallback_attempted ?? providerTrace.fallback_attempted;
  const fallbackReason = pickFirst(agentData.fallback_reason, providerTrace.fallback_reason);
  const timeoutStage = pickFirst(agentData.timeout_stage, providerTrace.timeout_stage);
  const elapsedMs = agentData.elapsed_ms ?? providerTrace.elapsed_ms;
  return (
    <div>
      <KV k="Status" v={fmt(agentData.status)} vc={agentData.status === "Failed" ? "err" : "ok"} />
      <KV k="Provider" v={provider} vc="blue" />
      <KV k="Primary provider" v={primaryProvider} />
      <KV k="Fallback provider" v={fallbackProvider} />
      <KV k="Timeout stage" v={timeoutStage} vc={timeoutStage !== "—" ? "err" : "muted"} />
      <KV k="Deadline seconds" v={fmt(agentData.deadline_seconds)} />
      <KV k="Elapsed ms" v={fmt(elapsedMs)} />
      <KV k="Remaining ms at stage" v={fmt(agentData.remaining_ms_at_stage)} />
      <KV k="Fallback attempted" v={fmt(fallbackAttempted)} vc={fallbackAttempted ? "warn" : "muted"} />
      <KV k="Fallback reason" v={fallbackReason} vc={fallbackReason !== "—" ? "warn" : "muted"} />
      <KV k="Evidence count" v={agentData.evidence_count ?? evidence.length} />
      <KV k="Raw text" v={agentData.raw_text ? `${agentData.raw_text.slice(0, 500)}${agentData.raw_text.length > 500 ? `… [length=${agentData.raw_text.length}]` : ""}` : "—"} />
      <KV k="Validation errors" v={(agentData.validation_errors || []).join(", ") || "—"} vc={(agentData.validation_errors || []).length ? "err" : "muted"} />
      <RawJsonDetails label="stage_trace raw JSON" data={stageTrace} />
      <RawJsonDetails label="provider_trace raw JSON" data={providerTrace} />
      <RawJsonDetails label="promotion_trace raw JSON" data={promotionTrace} />
      <RawJsonDetails label="primary_result_summary raw JSON" data={agentData.primary_result_summary} />
      <RawJsonDetails label="AG3 full raw JSON" data={agentData} />
      <RawJsonDetails label="AG3 debug wrapper raw JSON" data={rawInfo} />
    </div>
  );
}

/* ─────────────────────────────────────
   AG4 aggregator vote table
───────────────────────────────────── */
function AG4Panel({ finalResult, objectAgentResults }) {
  if (!finalResult) return <span className="dbg-small">—</span>;

  try {
    const validVotes = Array.isArray(finalResult?.valid_votes) ? finalResult.valid_votes : [];

    const pattern = finalResult.consensus_pattern || finalResult.pattern || "—";
    const matched = finalResult.matched_agents ?? finalResult.so_luong_dong_thuan;
    const winnerAgent = pickFirst(finalResult.winner_agent, finalResult.final_agent, finalResult.winner_key);
    const derivedWinner = deriveWinnerVote(validVotes);
    const winnerKey = pickFirst(
      finalResult.winner_vote_key,
      finalResult.vote_key,
      finalResult.winning_vote?.vote_key,
      finalResult.selected_vote?.vote_key,
      derivedWinner?.vote_key,
      derivedWinner?.key
    );
    const opinion = finalResult.quan_diem_trong_tai || finalResult.referee_view || "";
    const attemptsUsed = finalResult.attempts_used;
    const maxAttempts = finalResult.max_attempts;
    const debugFilter = finalResult.debug_filter;

    const agentMap = {};
    for (const ar of (objectAgentResults || [])) agentMap[ar.agent] = ar.data || {};
    const agentNames = ["OpenAI", "LLM", "Lens"];

    const isCounted = (name) => Boolean(findAgentVote(validVotes, name));
    
    const getVoteKey = (name) => {
      const vote = findAgentVote(validVotes, name);
      return vote?.vote_key || vote?.key || "—";
    };

    const getReject = (name, data) => {
      if (!data) return "no data";
      const s = String(data.status || "").toLowerCase();
      if (s === "disabled") return "disabled";
      if (s === "failed") return `failed: ${data.error_message || "unknown"}`;
      if (s === "partial") return `partial: ${data.error_message || data.fallback_reason || "insufficient_evidence"}`;
      if (data.not_counted_in_consensus) return data.not_counted_reason || "not_counted_in_consensus";
      if (!data.menh_gia && !data.denomination && !data.quoc_gia && !data.country) return "missing country/currency/amount";
      return "—";
    };

    const patternCls = pattern === "3/3" || pattern === "2/3" ? "keep"
      : pattern === "1-valid-only" ? "review"
      : pattern === "1-1-1" || pattern === "conflict" ? "drop"
      : pattern === "transient_error" ? "warning" : "neutral";

    return (
      <div>
        <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Badge label={`Pattern: ${pattern}`} variant={patternCls} />
          {matched != null && <Badge label={`${matched} valid votes`} variant={matched >= 2 ? "keep" : "review"} />}
          {attemptsUsed != null && <span className="dbg-small">Attempts: {attemptsUsed}/{maxAttempts}</span>}
        </div>
        {winnerAgent !== "—" && <KV k="Winner agent" v={winnerAgent} vc="ok" />}
        {winnerKey !== "—" && <KV k="Winner vote key" v={winnerKey} vc="blue" />}
        {opinion && <KV k="Referee view" v={opinion} />}
        <div className="dbg-table-wrap">
          <table className="dbg-table">
            <thead>
              <tr>
                <th>Agent</th><th>Status</th><th>Country</th><th>Denomination</th>
                <th>Vote key</th><th>Counted?</th><th>Reject reason</th>
              </tr>
            </thead>
            <tbody>
              {agentNames.map(name => {
                const data = agentMap[name] || {};
                const counted = isCounted(name);
                const s = data.status || "—";
                const sCls = s === "Completed" ? "ok" : s === "Failed" ? "err" : s === "Disabled" ? "muted" : "warn";
                return (
                  <tr key={name} className={counted ? "counted" : "not-counted"}>
                    <td><strong>{name}</strong></td>
                    <td><span className={`dbg-v ${sCls}`}>{s}</span></td>
                    <td>{fmt(data.quoc_gia || data.country)}</td>
                    <td>{fmt(data.menh_gia || data.denomination)}</td>
                    <td style={{ fontFamily:"monospace" }}>{getVoteKey(name)}</td>
                    <td><Badge label={counted ? "YES" : "NO"} variant={counted ? "yes" : "no"} /></td>
                    <td className="dbg-small">{counted ? "—" : getReject(name, data)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {validVotes.length > 0 && (
          <>
            <div className="dbg-small" style={{ marginTop: 10, marginBottom: 4 }}>Valid votes detail:</div>
            <JsonBlock data={validVotes} />
          </>
        )}
        {debugFilter && (
          <div style={{ marginTop: 10 }}>
            <div className="dbg-small" style={{ marginBottom: 4 }}>Object filter:</div>
            <KV k="Before filter" v={debugFilter.before_filter_count} />
            <KV k="After filter" v={debugFilter.after_filter_count} />
            {(debugFilter.dropped_objects||[]).length > 0 && (
              <KV k="Dropped (zero_evidence)" v={debugFilter.dropped_objects.length} vc="warn" />
            )}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div className="dbg-error">
        AG4 debug render error: {String(err?.message || err)}
      </div>
    );
  }
}

function AgentRawOutput({ obj }) {
  const agentResults = obj?.agent_results || [];
  const finalResult = obj?.final_result || {};
  const validVotes = Array.isArray(finalResult.valid_votes) ? finalResult.valid_votes : [];
  const winnerVote = deriveWinnerVote(validVotes);
  const rows = [
    { name: "AG0", label: "Crop Checker", data: obj?.crop_checker || {}, vote: null, counted: false },
    ...agentResults.map((entry, index) => ({
      name: entry.agent === "OpenAI" ? "AG1" : entry.agent === "LLM" ? "AG2" : entry.agent === "Lens" ? "AG3" : `AG${index + 1}`,
      label: entry.agent || `Agent ${index + 1}`,
      data: entry.data || {},
      vote: findAgentVote(validVotes, entry.agent),
      counted: Boolean(findAgentVote(validVotes, entry.agent)),
    })),
    { name: "AG4", label: "Referee / Aggregator", data: finalResult, vote: winnerVote, counted: Boolean(winnerVote) },
  ];
  return (
    <div className="dbg-table-wrap">
      <table className="dbg-table">
        <thead><tr>
          <th>Object</th><th>Agent</th><th>Status</th><th>Provider / method</th><th>Country</th>
          <th>Currency</th><th>Amount</th><th>Confidence</th><th>Vote key</th><th>Counted?</th><th>Reject reason</th><th>Raw JSON</th>
        </tr></thead>
        <tbody>
          {rows.map(row => {
            const data = row.data || {};
            const denomination = pickFirst(data.menh_gia, data.denomination, data.final_denomination, row.vote?.raw_denomination);
            const country = pickFirst(row.vote?.country, data.quoc_gia, data.country, data.final_country);
            const currency = pickFirst(row.vote?.currency_code, data.ma_tien_te, data.currency, data.currency_code, extractCurrencyFromDenomination(denomination));
            const amount = pickFirst(row.vote?.amount, denomination);
            const confidence = data.do_tin_cay ?? data.confidence ?? data.crop_confidence;
            const reason = row.name === "AG0" ? pickFirst(data.decision_reason, data.reason, "gate metadata; not a vote")
              : row.name === "AG4" ? pickFirst(data.consensus_reason, data.quan_diem_trong_tai)
              : row.counted ? "—" : rejectReason(data);
            return (
              <tr key={row.name} className={row.counted ? "counted" : "not-counted"}>
                <td>{fmt(obj?.object_index)}</td><td><strong>{row.name}</strong><div className="dbg-small">{row.label}</div></td>
                <td>{fmt(data.status || data.action || obj?.ag0_action)}</td><td>{pickFirst(data.provider, data.phuong_phap, data.method, obj?.crop_source)}</td>
                <td>{country}</td><td>{currency}</td><td>{amount}</td><td>{confidence == null ? "—" : fmt(confidence)}</td>
                <td className="dbg-mono">{voteKeyText(row.vote?.vote_key)}</td>
                <td><Badge label={row.counted ? "YES" : "NO"} variant={row.counted ? "yes" : "no"} /></td>
                <td className="dbg-small">{reason}</td><td><RawJsonDetails data={data} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <RawJsonDetails label="detected_objects[].agent_results raw JSON" data={agentResults} />
    </div>
  );
}

function VoteMatching({ obj }) {
  const finalResult = obj?.final_result || {};
  const validVotes = Array.isArray(finalResult.valid_votes) ? finalResult.valid_votes : [];
  const winnerVote = deriveWinnerVote(validVotes);
  const winnerVoteKey = finalResult.winner_vote_key || finalResult.vote_key || finalResult.winning_vote?.vote_key || winnerVote?.vote_key;
  const rows = (obj?.agent_results || []).map(entry => {
    const data = entry.data || {};
    const vote = findAgentVote(validVotes, entry.agent);
    return { entry, data, vote, counted: Boolean(vote) };
  });
  return (
    <div>
      <KV k="Canonical country" v={pickFirst(winnerVote?.country, finalResult.country, finalResult.quoc_gia, finalResult.final_country)} vc="ok" />
      <KV k="Canonical currency_code" v={pickFirst(winnerVote?.currency_code, finalResult.currency_code, finalResult.ma_tien_te)} vc="blue" />
      <KV k="Canonical amount" v={pickFirst(winnerVote?.amount, finalResult.final_denomination, finalResult.menh_gia)} />
      <KV k="Canonical vote_key" v={voteKeyText(winnerVoteKey)} vc="blue" />
      <KV k="Matched agents" v={fmt(finalResult.matched_agents)} />
      <KV k="Matched agent keys" v={(finalResult.matched_agents_keys || []).join(", ") || "—"} />
      <KV k="Consensus pattern" v={fmt(finalResult.consensus_pattern)} />
      <KV k="Final agent" v={fmt(finalResult.final_agent)} />
      <KV k="Winner vote key (derived fallback)" v={voteKeyText(winnerVoteKey)} />
      <KV k="Method" v={fmt(finalResult.method)} />
      <KV k="Referee reason" v={pickFirst(finalResult.quan_diem_trong_tai, finalResult.referee_view, finalResult.consensus_reason)} />
      <div className="dbg-table-wrap" style={{ marginTop: 10 }}>
        <table className="dbg-table">
          <thead><tr><th>Agent</th><th>agent_key</th><th>Canonical country</th><th>Currency</th><th>Amount</th><th>agent_key / vote_key</th><th>Counted?</th><th>Reason</th></tr></thead>
          <tbody>{rows.map(({ entry, data, vote, counted }) => (
            <tr key={entry.agent} className={counted ? "counted" : "not-counted"}>
              <td>{entry.agent}</td><td className="dbg-mono">{AGENT_VOTE_KEYS[entry.agent] || "—"}</td>
              <td>{fmt(vote?.country)}</td><td>{fmt(vote?.currency_code)}</td><td>{fmt(vote?.amount)}</td>
              <td className="dbg-mono">{voteKeyText(vote?.vote_key)}</td>
              <td><Badge label={counted ? "YES" : "NO"} variant={counted ? "yes" : "no"} /></td>
              <td className="dbg-small">{counted ? "—" : rejectReason(data)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <RawJsonDetails label="valid_votes raw JSON" data={validVotes} />
      <RawJsonDetails label="consensus_trace raw JSON" data={obj?.consensus_trace || []} />
      <RawJsonDetails label="final_result raw JSON" data={finalResult} />
    </div>
  );
}

/* ─────────────────────────────────────
   Final result panel
───────────────────────────────────── */
function FinalResultPanel({ pipelineStatus, finalDbRecord }) {
  const finalResult = finalDbRecord?.final_result || {};
  const status = pipelineStatus || finalResult.status || finalDbRecord?.status || "—";
  const statusKey = status.replace(/[\s-]/g, "_");
  const ag4VoteWinner = finalResult.winning_vote || finalResult.selected_vote || {};
  const ag1Data = finalDbRecord?.agent_results?.find(a => a.agent === "OpenAI")?.data || {};
  const ag2Data = finalDbRecord?.agent_results?.find(a => a.agent === "LLM")?.data || {};
  const ag3Data = finalDbRecord?.agent_results?.find(a => a.agent === "Lens")?.data || {};

  const country = pickFirst(
    finalResult.quoc_gia, finalResult.country, finalResult.final_country, finalResult.accepted_identity?.country,
    finalResult.winning_vote?.country, finalResult.selected_vote?.country, ag4VoteWinner.country,
    ag1Data.quoc_gia, ag2Data.quoc_gia, ag3Data.quoc_gia
  );
  const denom = pickFirst(
    finalResult.menh_gia, finalResult.denomination, finalResult.final_denomination, finalResult.accepted_identity?.denomination,
    finalResult.winning_vote?.denomination, finalResult.selected_vote?.denomination, ag4VoteWinner.denomination,
    ag1Data.menh_gia, ag2Data.menh_gia, ag3Data.menh_gia
  );
  const currency = pickFirst(
    finalResult.ma_tien_te, finalResult.currency, finalResult.currency_code, finalResult.final_currency, finalResult.accepted_identity?.currency,
    finalResult.winning_vote?.currency, finalResult.selected_vote?.currency, ag4VoteWinner.currency,
    ag1Data.ma_tien_te, ag2Data.ma_tien_te, ag3Data.ma_tien_te,
    extractCurrencyFromDenomination(denom)
  );
  const conf = finalResult.confidence ?? finalResult.do_tin_cay;
  const pattern = finalResult.consensus_pattern || "—";
  const matched = finalResult.matched_agents ?? finalResult.so_luong_dong_thuan;
  const warning = finalResult.warning || finalResult.crop_warning;
  const procMs = finalDbRecord?.processing_time_ms;
  const errMsg = finalResult.message || finalResult.error_message || "";
  return (
    <div>
      <div className={`dbg-final-status ${statusKey}`}>{status.toUpperCase()}</div>
      <div className="dbg-kv">
        <span className="dbg-k">Country</span><span className="dbg-v ok">{country}</span>
        <span className="dbg-k">Currency</span><span className="dbg-v blue">{currency}</span>
        <span className="dbg-k">Denomination</span><span className="dbg-v ok">{denom}</span>
        {conf != null && <><span className="dbg-k">Confidence</span><span className="dbg-v">{(Number(conf)*100).toFixed(1)}%</span></>}
        <span className="dbg-k">Consensus pattern</span><span className="dbg-v">{pattern}</span>
        {matched != null && <><span className="dbg-k">Valid agents</span><span className="dbg-v">{matched}</span></>}
        {procMs != null && <><span className="dbg-k">Total time</span><span className="dbg-v">{procMs} ms</span></>}
        {warning && <><span className="dbg-k">Warning</span><span className="dbg-v warn">{warning}</span></>}
        {errMsg && <><span className="dbg-k">Message</span><span className="dbg-v muted">{errMsg}</span></>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────
   Per-object detail view
───────────────────────────────────── */
function ObjectDetailView({ obj, debugObj }) {
  if (!obj) return null;
  const agentResults = obj.agent_results || [];
  const ag1 = agentResults.find(a => a.agent === "OpenAI")?.data || {};
  const ag2 = agentResults.find(a => a.agent === "LLM")?.data || {};
  const ag3 = agentResults.find(a => a.agent === "Lens")?.data || {};
  const finalResult = obj.final_result || {};
  const cc = obj.crop_checker || {};
  const action = (cc.action || obj.ag0_action || "—").toUpperCase();
  const eligible = obj.agent_eligible === true || cc.agent_eligible === true;
  const stOf = s => s === "Completed" ? "completed" : s === "Failed" ? "failed" : s === "Disabled" ? "disabled" : s === "—" ? "pending" : "warning";
  const ag1Raw = debugObj?.agent_1_raw;
  const ag2Raw = debugObj?.agent_2_raw;
  const ag3RawInfo = debugObj?.agent_3_raw;
  const cropFieldSource = obj.crop_base64 ? "detected_objects[].crop_base64"
    : obj.crop_image_base64 ? "detected_objects[].crop_image_base64"
    : obj.crop_preview_base64 ? "detected_objects[].crop_preview_base64"
    : obj.debug_crop_base64 ? "detected_objects[].debug_crop_base64"
    : debugObj?.crop_image_base64 ? "objects[].crop_image_base64 (debug fallback)"
    : "unavailable (experiment response strips crop base64)";
  const validVotes = Array.isArray(finalResult.valid_votes) ? finalResult.valid_votes : [];
  const derivedWinnerVote = deriveWinnerVote(validVotes);
  const winnerFieldSource = finalResult.winner_vote_key ? "final_result.winner_vote_key"
    : finalResult.vote_key ? "final_result.vote_key"
    : finalResult.winning_vote?.vote_key ? "final_result.winning_vote.vote_key"
    : derivedWinnerVote?.vote_key ? "derived from majority of final_result.valid_votes[].vote_key"
    : "unavailable";
  const missingCrop = cropFieldSource.startsWith("unavailable");
  const missingCountry = !finalResult.country && !finalResult.quoc_gia && !finalResult.final_country;
  const missingCurrency = !finalResult.currency && !finalResult.ma_tien_te && !finalResult.final_currency;
  const missingDenom = !finalResult.denomination && !finalResult.menh_gia && !finalResult.final_denomination;
  const missingWinnerKey = winnerFieldSource === "unavailable";
  const hasMissing = missingCrop || missingCountry || missingCurrency || missingDenom || missingWinnerKey;

  return (
    <>
      {hasMissing && (
        <Section title="Missing Debug Fields" badge={<Badge label="CHECK" variant="warning" />} defaultOpen={true}>
          <div className="dbg-small" style={{ color: "#8b949e", marginBottom: 6 }}>
            The following expected debug fields are missing from the backend response:
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, color: "#f85149", fontSize: 12, fontFamily: "monospace" }}>
            {missingCrop && <li>objects[].crop_base64</li>}
            {missingCountry && <li>final_result.final_country</li>}
            {missingCurrency && <li>final_result.final_currency</li>}
            {missingDenom && <li>final_result.final_denomination</li>}
            {missingWinnerKey && <li>final_result.winner_vote_key</li>}
          </ul>
        </Section>
      )}

      <Section title="Debug Field Mapping" badge={<Badge label="READ ONLY" variant="neutral" />} defaultOpen={false}>
        <KV k="Crop preview source" v={cropFieldSource} vc={missingCrop ? "warn" : "ok"} />
        <KV k="Winner vote key source" v={winnerFieldSource} vc={missingWinnerKey ? "warn" : "ok"} />
        {derivedWinnerVote?.vote_key && <KV k="Derived winner vote_key" v={voteKeyText(derivedWinnerVote.vote_key)} vc="blue" />}
      </Section>

      <Section
        title={`AG0 · Visual Gate / Crop Checker — Object #${obj.object_index}`}
        badge={<><Badge label={action || "—"} variant={eligible?"keep":"drop"} /><Badge label={eligible?"ELIGIBLE":"NOT ELIGIBLE"} variant={eligible?"yes":"no"} /></>}
        defaultOpen={true}
      >
        <AG0Panel obj={obj} />
      </Section>

      <Section title="AG1 · OpenAI Vision"
        badge={<Badge label={ag1.status||"—"} variant={stOf(ag1.status||"—")} />}
        defaultOpen={true}>
        <AgentPanel agentData={ag1} rawContent={ag1Raw} />
      </Section>

      <Section title="AG2 · Gemini / LLM Vision"
        badge={<Badge label={ag2.status||"—"} variant={stOf(ag2.status||"—")} />}
        defaultOpen={true}>
        <AgentPanel agentData={ag2} rawContent={ag2Raw ? fmtJSON(ag2Raw) : null} />
      </Section>

      <Section title="AG3 · Google Lens / Visual Search"
        badge={<Badge label={ag3.status||"—"} variant={stOf(ag3.status||"—")} />}
        defaultOpen={true}>
        <AG3Panel agentData={ag3} />
        {ag3RawInfo && (
          <>
            <div className="dbg-small" style={{ marginTop: 8, marginBottom: 4 }}>AG3 debug log:</div>
            <JsonBlock data={ag3RawInfo} />
          </>
        )}
      </Section>

      <Section title="AG3 Diagnostics" badge={<Badge label={ag3.status || "—"} variant={stOf(ag3.status || "—")} />} defaultOpen={true}>
        <AG3Diagnostics agentData={ag3} rawInfo={ag3RawInfo} />
      </Section>

      <Section title="AG4 · Aggregator"
        badge={<Badge label={finalResult.status||"—"} variant={stOf(finalResult.status||"—")} />}
        defaultOpen={true}>
        <AG4Panel finalResult={finalResult} objectAgentResults={agentResults} />
        {(obj.consensus_trace||[]).length > 0 && (
          <>
            <div className="dbg-small" style={{ marginTop: 10, marginBottom: 4 }}>Consensus trace ({obj.consensus_trace.length} attempts):</div>
            {obj.consensus_trace.map((t, i) => (
              <div key={i} style={{ background:"#161b22", borderRadius:4, padding:"6px 10px", marginBottom:6, fontSize:11 }}>
                <div style={{ display:"flex", gap:6, marginBottom:4 }}>
                  <Badge label={`Attempt ${t.attempt}/${t.max_attempts}`} variant="neutral" />
                  <Badge label={t.pattern||"—"} variant={t.pattern==="2/3"||t.pattern==="3/3"?"keep":"review"} />
                  <Badge label={t.decision||"—"} variant={t.decision==="completed"?"completed":"warning"} />
                </div>
                {t.reason && <div style={{ color:"#8b949e" }}>{t.reason}</div>}
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Agent Raw Output" badge={<Badge label={`OBJECT #${obj.object_index || "—"}`} variant="neutral" />} defaultOpen={true}>
        <AgentRawOutput obj={obj} />
      </Section>

      <Section title="Vote Matching" badge={<Badge label={finalResult.consensus_pattern || "—"} variant="neutral" />} defaultOpen={true}>
        <VoteMatching obj={obj} />
      </Section>
    </>
  );
}

/* ─────────────────────────────────────
   Main page component
───────────────────────────────────── */
export default function DebugRecognition() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imgNatural, setImgNatural] = useState(null);
  const [imgDisplay, setImgDisplay] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [error, setError] = useState(null);       // { code, message, detail }
  const [apiLog, setApiLog] = useState(null);
  const [activeObjIdx, setActiveObjIdx] = useState(0);
  const [copied, setCopied] = useState("");
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── File selection: hiện ảnh NGAY, không đợi backend ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Revoke previous object URL to avoid memory leak
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    // Reset debug state nhưng GIỮ ảnh
    setDebugData(null);
    setError(null);
    setApiLog(null);
    setActiveObjIdx(0);
    setImgNatural(null);
    setImgDisplay(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setDebugData(null);
    setError(null);
    setApiLog(null);
    setActiveObjIdx(0);
  };

  const handleImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setImgNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setImgDisplay({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  /* ── Run pipeline ── */
  const handleRun = async () => {
    if (!selectedFile) return;

    // Kiểm tra auth token trước
    const authStatus = checkAuthToken();

    // Build formData đúng field name "file" theo backend
    const fd = new FormData();
    fd.append("file", selectedFile);

    const newApiLog = {
      url: "/api/v1/recognition/debug_scan",
      method: "POST",
      formField: "file",
      hasToken: authStatus.hasToken,
      tokenPreview: authStatus.preview,
      status: null,
      errorDetail: null,
    };

    setIsLoading(true);
    setError(null);
    setApiLog(null);
    // KHÔNG clear previewUrl hay selectedFile

    try {
      const res = await scanBanknoteDebug(fd);
      newApiLog.status = 200;
      setApiLog(newApiLog);
      setDebugData(res);
      setActiveObjIdx(0);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data;
      newApiLog.status = status || 0;
      newApiLog.errorDetail = detail;
      setApiLog(newApiLog);

      let message = "";
      if (status === 401) {
        message = `401 Not authenticated — Bạn chưa đăng nhập admin. Hãy login vào /auth/admin-login trước.`;
      } else if (status === 403) {
        message = `403 Forbidden — Tài khoản không có quyền admin.`;
      } else if (status === 422) {
        const fastApiDetail = detail?.detail;
        const rawMsg = Array.isArray(fastApiDetail)
          ? fastApiDetail.map(d => `${d.loc?.join(".")||""}: ${d.msg||""}`).join(" | ")
          : String(fastApiDetail || detail?.message || "Unprocessable Entity");
        message = `422 Unprocessable Entity — ${rawMsg}`;
      } else {
        message = err?.response?.data?.detail || err?.response?.data?.message || err?.message || "Pipeline failed";
      }

      setError({ code: status, message });
      // KHÔNG clear selectedFile, KHÔNG clear previewUrl — ảnh vẫn hiện
      setDebugData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setDebugData(null);
    setError(null);
    setApiLog(null);
    setSelectedFile(null);
    setActiveObjIdx(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImgNatural(null);
    setImgDisplay(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const doCopy = (text, label) => {
    copyText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  };

  /* ── Parse response ── */
  const debugObjects = debugData?.objects || [];
  const pipelineStatus = debugData?.pipeline_final_status;
  const inputInfo = debugData?.input_info;
  const modelTrace = debugData?.model_trace;
  const finalDbRecord = debugData?.final_db_record || (debugData?.final_result ? {
    final_result: debugData.final_result,
    agent_results: debugData.agent_results || [],
    processing_time_ms: inputInfo?.processing_time_ms,
    status: pipelineStatus,
  } : null);

  // Defensive extraction — thử nhiều path khác nhau tuỳ response shape
  const finalResult = finalDbRecord?.final_result || debugData?.final_result || {};
  const detectedObjectSource =
    finalResult?.detected_objects ||
    debugData?.objects?.map(o => ({ ...o, agent_results: o.agent_results || [], final_result: o.final_result || {} })) ||
    [];
  const detectedObjects = detectedObjectSource.map((obj, index) => {
    const matchingDebugObj = debugObjects.find(item => item?.object_index === obj?.object_index) || debugObjects[index];
    return {
      ...obj,
      crop_base64: obj.crop_base64 || obj.crop_image_base64 || obj.crop_preview_base64 || obj.debug_crop_base64 || matchingDebugObj?.crop_image_base64,
    };
  });
  const rejectedObjects = finalResult?.rejected_objects || [];

  const currentDetected = detectedObjects[activeObjIdx] || null;
  const currentDebugObj = debugObjects.find(item => item?.object_index === currentDetected?.object_index) || debugObjects[activeObjIdx] || null;

  const allCrops = [
    ...detectedObjects.map(o => ({ ...o, _type: "detected" })),
    ...rejectedObjects.map(o => ({ ...o, _type: "rejected" })),
  ];

  // Header dot state
  const dotCls = isLoading ? "loading" : error ? "error" : debugData ? "" : "";

  const statusBadgeVariant = (s) =>
    !s ? "neutral"
    : s === "Completed" || s === "completed" || s === "completed_partial" ? "completed"
    : s === "no_banknote_detected" ? "drop"
    : s === "needs_better_image" ? "warning"
    : "review";

  // Check auth token status for display
  const authStatus = checkAuthToken();

  /* ── Render state: chưa chọn file ── */
  const hasFile = Boolean(selectedFile && previewUrl);
  const hasResult = Boolean(debugData && !isLoading);

  return (
    <div className="dbg-root">
      {/* ══ Header ══ */}
      <div className="dbg-header">
        <div className={`dbg-header-dot ${dotCls}`} />
        <span className="dbg-header-title">🔬 Debug · Nhận diện tiền</span>
        <span className="dbg-header-sub">
          POST /recognition/debug_scan · debug_mode=True · billing_skipped · admin only
        </span>
        <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
          <Badge
            label={authStatus.hasToken ? "Token present" : "No token"}
            variant={authStatus.hasToken ? "yes" : "warning"}
          />
        </span>
      </div>

      {/* ══ Upload bar ══ */}
      <div className="dbg-upload-bar" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
        <input ref={fileInputRef} type="file" accept="image/*"
          className="dbg-file-input" id="dbg-file-input" onChange={handleFileChange} />
        <label htmlFor="dbg-file-input" className="dbg-btn">📁 Chọn ảnh</label>

        {selectedFile && (
          <span className="dbg-file-name" title={selectedFile.name}>
            {selectedFile.name} · {(selectedFile.size/1024).toFixed(1)} KB · {selectedFile.type}
          </span>
        )}

        <button className="dbg-btn primary" onClick={handleRun} disabled={!selectedFile || isLoading}>
          {isLoading ? "⏳ Đang chạy..." : "▶ Run pipeline"}
        </button>

        {hasFile && <button className="dbg-btn danger" onClick={handleClear}>🗑 Clear</button>}

        {pipelineStatus && (
          <Badge label={pipelineStatus.toUpperCase()} variant={statusBadgeVariant(pipelineStatus)} />
        )}

        <span className="dbg-file-label" style={{ marginLeft:"auto" }}>
          Drag & drop · Không trừ token · Chỉ admin
        </span>
      </div>

      {/* ══ Auth warning ══ */}
      {!authStatus.hasToken && (
        <div className="dbg-warn-banner">
          <strong>Chưa có auth token trong localStorage.</strong> Bạn cần{" "}
          <a href="/auth/admin-login" style={{ color:"#58a6ff" }}>đăng nhập admin</a>{" "}
          trước rồi mới gọi được /dev/debug. (Token được check bằng localStorage, không hardcode.)
        </div>
      )}

      {/* ══ Error banner — KHÔNG xóa ảnh ══ */}
      {error && (
        <div className={`dbg-error ${error.code === 401 || error.code === 403 ? "auth" : ""}`}>
          <div><strong>{error.message}</strong></div>
          {error.code === 401 && (
            <div style={{ marginTop: 6, fontSize: 11 }}>
              → <a href="/auth/admin-login" style={{ color:"#58a6ff" }}>Đăng nhập admin tại /auth/admin-login</a>
              {" "}rồi quay lại /dev/debug.
            </div>
          )}
          {error.code === 422 && (
            <div style={{ marginTop: 6, fontSize: 11 }}>
              → Backend field name là <code>file</code>. FormData đang append đúng. Kiểm tra Content-Type header.
            </div>
          )}
        </div>
      )}

      {/* ══ Loading ══ */}
      {isLoading && (
        <div className="dbg-loading">
          <div className="dbg-spinner" />
          Đang chạy pipeline AG0 → AG1 → AG2 → AG3 → AG4 ...
        </div>
      )}

      {/* ══ MAIN CONTENT: chia làm các state ══ */}

      {/* STATE A: chưa chọn file */}
      {!hasFile && !isLoading && (
        <div className="dbg-empty">
          <div className="dbg-empty-icon">🔬</div>
          <div>Upload ảnh và chạy pipeline để xem debug output</div>
          <div className="dbg-small">Endpoint: POST /api/v1/recognition/debug_scan</div>
        </div>
      )}

      {/* STATE B + C: đã chọn file (dù có lỗi hay không, vẫn hiện ảnh) */}
      {hasFile && (
        <>
          {/* Copy toolbar — chỉ hiện khi có kết quả */}
          {hasResult && (
            <div className="dbg-copy-row">
              {[
                ["📋 Full JSON", fmtJSON(debugData), "full"],
                ["📋 AG0", fmtJSON(currentDetected?.crop_checker||{}), "ag0"],
                ["📋 AG1", fmtJSON(currentDetected?.agent_results?.find(a=>a.agent==="OpenAI")?.data||{}), "ag1"],
                ["📋 AG2", fmtJSON(currentDetected?.agent_results?.find(a=>a.agent==="LLM")?.data||{}), "ag2"],
                ["📋 AG3", fmtJSON(currentDetected?.agent_results?.find(a=>a.agent==="Lens")?.data||{}), "ag3"],
                ["📋 AG4", fmtJSON(currentDetected?.final_result||{}), "ag4"],
              ].map(([label, text, key]) => (
                <button key={key} className="dbg-btn copy" onClick={() => doCopy(text, key)}>
                  {copied === key ? "✓ Copied!" : label}
                </button>
              ))}
              <button className="dbg-btn" style={{ marginLeft:"auto" }} onClick={handleRun} disabled={!selectedFile||isLoading}>
                ↺ Run again
              </button>
            </div>
          )}

          <div className="dbg-layout">
            {/* ══ LEFT PANE: image + crops ══ */}
            <div className="dbg-left">
              {/* Image preview — luôn hiện khi đã chọn file */}
              <div className="dbg-panel">
                <div className="dbg-panel-title">🖼 Ảnh gốc</div>
                <div className="dbg-img-wrap">
                  <img
                    ref={imgRef}
                    src={previewUrl}
                    alt="uploaded"
                    onLoad={handleImgLoad}
                    style={{ maxWidth:"100%" }}
                  />
                  {/* Overlay chỉ hiện khi có kết quả backend */}
                  {hasResult && imgNatural && imgDisplay && (
                    <BboxOverlay
                      objects={detectedObjects}
                      rejectedObjects={rejectedObjects}
                      imgNatural={imgNatural}
                      imgDisplay={imgDisplay}
                    />
                  )}
                </div>
                {imgNatural && (
                  <div className="dbg-small" style={{ marginTop: 6 }}>
                    {imgNatural.w} × {imgNatural.h} px
                  </div>
                )}
                {/* File info */}
                <div style={{ marginTop: 8 }}>
                  <KV k="File name" v={selectedFile.name} />
                  <KV k="MIME type" v={selectedFile.type} />
                  <KV k="File size" v={`${(selectedFile.size/1024).toFixed(2)} KB`} />
                  {imgNatural && <KV k="Dimensions" v={`${imgNatural.w} × ${imgNatural.h} px`} />}
                  {inputInfo && <KV k="Pipeline time" v={`${inputInfo.processing_time_ms} ms`} />}
                  {!hasResult && !isLoading && (
                    <KV k="Status" v={error ? `Error ${error.code}` : "Ready to run"} vc={error ? "err" : "ok"} />
                  )}
                </div>
              </div>

              {/* Crops panel */}
              <div className="dbg-panel">
                <div className="dbg-panel-title">✂ Crop regions</div>
                {!hasResult && !isLoading && (
                  <div className="dbg-small" style={{ color:"#6e7681", padding:"8px 0" }}>
                    Chưa có crop — chưa chạy backend hoặc backend lỗi.
                  </div>
                )}
                {hasResult && (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      <Badge label={`${detectedObjects.length} eligible`} variant="yes" />
                      {" "}
                      <Badge label={`${rejectedObjects.length} rejected`} variant="drop" />
                    </div>
                    {allCrops.length === 0 && (
                      <div className="dbg-small">Không có crop nào được phát hiện.</div>
                    )}
                    <div className="dbg-crops">
                      {allCrops.map((obj, i) => {
                        const cc = obj.crop_checker || {};
                        const action = obj._type === "rejected"
                          ? (obj.ag0_action || "DROP").toUpperCase()
                          : (cc.action || obj.ag0_action || "KEEP").toUpperCase();
                        const eligible = obj.agent_eligible === true || cc.agent_eligible === true;
                        const score = cc.banknote_score ?? obj.banknote_score;
                        const cls = action === "KEEP" ? "keep" : action === "REVIEW" ? "review" : "drop";
                        const cropB64 = pickFirst(obj.crop_base64, obj.crop_preview_base64, obj.crop_image_base64, obj.debug_crop_base64);
                        const cropMime = obj.crop_mime_type || "image/jpeg";
                        const bbox = obj.bbox;
                        return (
                          <div key={i} className="dbg-crop-item">
                            {cropB64 !== "—" ? (
                              <img src={`data:${cropMime};base64,${cropB64}`} alt={`crop ${i+1}`} />
                            ) : (
                              <div style={{ width:"100%", height:70, background:"#0d1117", display:"flex", alignItems:"center", justifyContent:"center", color:"#30363d", fontSize:10, borderRadius:3, textAlign:"center", padding:"4px" }}>
                                Backend chưa trả crop_base64
                              </div>
                            )}
                            <div className="dbg-crop-meta">
                              <span>
                                <Badge label={`#${obj.object_index||i+1}`} variant="neutral" />{" "}
                                <Badge label={action} variant={cls} />
                              </span>
                              <Badge label={eligible ? "ELIGIBLE" : "NOT ELG"} variant={eligible ? "yes" : "no"} />
                              {score != null && <span className="dbg-small">score: {Number(score).toFixed(2)}</span>}
                              {bbox && Array.isArray(bbox) && (
                                <span className="dbg-small dbg-mono">[{bbox.slice(0,2).map(v=>typeof v==="number"?Math.round(v):v).join(",")}]</span>
                              )}
                              {(cc.decision_reason || obj.reason) && (
                                <span className="dbg-small" style={{ wordBreak:"break-word" }}>
                                  {(cc.decision_reason || obj.reason || "").slice(0, 60)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Pipeline info */}
              <div className="dbg-panel">
                <div className="dbg-panel-title">ℹ Pipeline info</div>
                {modelTrace && (
                  <>
                    <KV k="AG1 model" v={modelTrace.ag1_model||"—"} vc="blue" />
                    <KV k="AG2 model" v={modelTrace.ag2_model||"—"} vc="blue" />
                    <KV k="AG3 provider" v={modelTrace.ag3_provider||"—"} vc="blue" />
                    <KV k="AG4 method" v={modelTrace.ag4_model||"rule_based"} />
                    <RawJsonDetails label="model_trace raw JSON" data={modelTrace} />
                    <div className="dbg-sep" />
                  </>
                )}
                {hasResult && (
                  <>
                    <KV k="Detected eligible" v={detectedObjects.length} />
                    <KV k="Rejected/dropped" v={rejectedObjects.length} />
                    <KV k="Billing" v="SKIPPED" vc="ok" />
                    <KV k="Debug mode" v="True" vc="ok" />
                  </>
                )}
                {!hasResult && (
                  <div className="dbg-small">Chưa có kết quả từ backend.</div>
                )}
              </div>
            </div>

            {/* ══ RIGHT PANE: detail / errors ══ */}
            <div className="dbg-right">
              {/* API Request panel — hiện khi có apiLog */}
              {apiLog && (
                <Section title="🔌 API Request" badge={<Badge label={`HTTP ${apiLog.status||"—"}`} variant={apiLog.status>=400?"failed":(apiLog.status===200?"completed":"neutral")} />} defaultOpen={true}>
                  <ApiRequestPanel apiLog={apiLog} />
                </Section>
              )}

              {/* STATE B: Lỗi — hiện chi tiết lỗi, không mất ảnh */}
              {error && !hasResult && (
                <Section title="Lỗi API" badge={<Badge label={`${error.code||"ERR"}`} variant="failed" />} defaultOpen={true}>
                  <div style={{ color:"#f85149", marginBottom:12, fontSize:13 }}>{error.message}</div>
                  {error.code === 401 && (
                    <div style={{ background:"#4d1919", borderRadius:6, padding:"10px 14px", fontSize:12 }}>
                      <div style={{ fontWeight:700, marginBottom:6 }}>Hướng dẫn fix 401:</div>
                      <div>1. Mở <a href="/auth/admin-login" style={{ color:"#58a6ff" }}>/auth/admin-login</a></div>
                      <div>2. Đăng nhập admin</div>
                      <div>3. Quay lại <a href="/dev/debug" style={{ color:"#58a6ff" }}>/dev/debug</a></div>
                      <div style={{ marginTop:6, color:"#8b949e" }}>Auth token hiện tại: {authStatus.hasToken ? `có (${authStatus.preview})` : "không có"}</div>
                    </div>
                  )}
                  {error.code === 422 && (
                    <div style={{ background:"#3d2b00", borderRadius:6, padding:"10px 14px", fontSize:12 }}>
                      <div style={{ fontWeight:700, marginBottom:6 }}>Hướng dẫn fix 422:</div>
                      <div>Backend field name: <code style={{ color:"#3fb950" }}>file</code></div>
                      <div>Frontend đang dùng: <code style={{ color:"#3fb950" }}>formData.append("file", ...)</code></div>
                      <div style={{ marginTop:6 }}>Xem raw detail ở panel API Request phía trên.</div>
                    </div>
                  )}
                  {apiLog?.errorDetail && (
                    <>
                      <div className="dbg-small" style={{ marginTop:12, marginBottom:4 }}>Raw error response:</div>
                      <JsonBlock data={apiLog.errorDetail} />
                    </>
                  )}
                </Section>
              )}

              {/* STATE C: Thành công — hiện object tabs + detail */}
              {hasResult && (
                <>
                  {/* Object tabs */}
                  {detectedObjects.length > 1 && (
                    <div className="dbg-obj-tabs">
                      {detectedObjects.map((o, i) => (
                        <button key={i}
                          className={`dbg-obj-tab ${activeObjIdx===i?"active":""}`}
                          onClick={() => setActiveObjIdx(i)}>
                          Object #{o.object_index||i+1}{" "}
                          <Badge
                            label={(o.final_result?.status||"—").slice(0,8)}
                            variant={(o.final_result?.status||"—")==="Completed"?"completed":"review"}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Image Decode */}
                  <Section title="📷 Image Decode" badge={<Badge label="COMPLETED" variant="completed" />} defaultOpen={false}>
                    <KV k="Filename" v={fmt(selectedFile?.name)} />
                    <KV k="MIME type" v={fmt(selectedFile?.type)} />
                    <KV k="File size" v={selectedFile ? `${(selectedFile.size/1024).toFixed(2)} KB` : "—"} />
                    <KV k="Width × Height" v={imgNatural ? `${imgNatural.w} × ${imgNatural.h} px` : "—"} />
                    <KV k="Decode" v="OK" vc="ok" />
                    {inputInfo && <KV k="Pipeline start" v={inputInfo.started_at||"—"} />}
                  </Section>

                  {/* YOLO detection */}
                  <Section
                    title="🎯 YOLO Detection / AG0 Crop Detection"
                    badge={<Badge
                      label={detectedObjects.length > 0 ? `${detectedObjects.length} ELIGIBLE` : rejectedObjects.length > 0 ? "NO ELIGIBLE CROP" : "NO RESULT"}
                      variant={detectedObjects.length > 0 ? "completed" : "warning"}
                    />}
                    defaultOpen={false}
                  >
                    {[...detectedObjects, ...rejectedObjects].length === 0 && (
                      <KV k="Result" v="no_banknote_detected" vc="err" />
                    )}
                    {[...detectedObjects, ...rejectedObjects].map((obj, i) => {
                      const bbox = obj.bbox;
                      const bboxStr = bbox
                        ? Array.isArray(bbox)
                          ? `[${bbox.map(v=>typeof v==="number"?v.toFixed(1):v).join(", ")}]`
                          : `x1:${bbox.x1} y1:${bbox.y1} x2:${bbox.x2} y2:${bbox.y2}`
                        : "—";
                      const conf = obj.crop_confidence ?? obj.confidence;
                      const src = obj.crop_source || obj.source || "—";
                      return (
                        <div key={i} style={{ background:"#161b22", borderRadius:4, padding:"6px 10px", marginBottom:6, fontSize:11 }}>
                          <div style={{ display:"flex", gap:6, marginBottom:4, alignItems:"center" }}>
                            <strong style={{ color:"#f0f6fc" }}>#{obj.object_index||i+1}</strong>
                            <Badge label={obj.agent_eligible===true?"ELIGIBLE":"NOT ELIGIBLE"} variant={obj.agent_eligible===true?"yes":"no"} />
                            <span className="dbg-small">src: {src}</span>
                          </div>
                          <KV k="BBox" v={bboxStr} />
                          {conf != null && <KV k="Confidence" v={Number(conf).toFixed(3)} />}
                          {(obj.crop_width||obj.width) && (
                            <KV k="Crop size" v={`${obj.crop_width||obj.width} × ${obj.crop_height||obj.height} px`} />
                          )}
                        </div>
                      );
                    })}
                  </Section>

                  {/* Per-object detail */}
                  {currentDetected ? (
                    <ObjectDetailView obj={currentDetected} debugObj={currentDebugObj} />
                  ) : (
                    detectedObjects.length === 0 && (
                      <Section title="AG0–AG4 · Agents" badge={<Badge label="SKIPPED" variant="skipped" />} defaultOpen={true}>
                        <KV k="Reason" v="Không có crop eligible → AG0 gate chặn, agents không chạy" vc="warn" />
                        {rejectedObjects.length > 0 && (
                          <>
                            <div className="dbg-small" style={{ marginTop: 8 }}>Rejected crops:</div>
                            {rejectedObjects.map((o, i) => (
                              <div key={i} style={{ background:"#161b22", borderRadius:4, padding:"5px 8px", marginBottom:4, fontSize:11 }}>
                                <Badge label={o.ag0_action||"DROP"} variant="drop" />
                                <div style={{ color:"#8b949e", marginTop:3 }}>{o.reason || o.decision_reason || "—"}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </Section>
                    )
                  )}

                  {/* Final result */}
                  <Section
                    title="Final Result"
                    badge={<Badge label={pipelineStatus?.toUpperCase()||"—"} variant={statusBadgeVariant(pipelineStatus||"")} />}
                    defaultOpen={true}
                  >
                    <FinalResultPanel pipelineStatus={pipelineStatus} finalDbRecord={finalDbRecord} />
                  </Section>

                  {/* Raw JSON */}
                  <Section title="Raw Debug JSON" badge={<Badge label="FULL RESPONSE" variant="neutral" />} defaultOpen={false}>
                    <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                      <button className="dbg-btn copy" onClick={() => doCopy(fmtJSON(debugData), "full")}>
                        {copied==="full" ? "✓ Copied!" : "Copy full JSON"}
                      </button>
                    </div>
                    <JsonBlock data={debugData} />
                  </Section>
                </>
              )}

              {/* Idle state — đã chọn file nhưng chưa chạy và không có lỗi */}
              {!hasResult && !error && !isLoading && (
                <div style={{ padding:"30px 20px", color:"#6e7681", fontSize:12, textAlign:"center" }}>
                  <div style={{ fontSize:30, marginBottom:8 }}>▶</div>
                  <div>Bấm <strong style={{ color:"#c9d1d9" }}>Run pipeline</strong> để bắt đầu phân tích</div>
                  <div className="dbg-small" style={{ marginTop:6 }}>
                    Auth: {authStatus.hasToken ? "Token có sẵn" : "Chưa có token — cần login admin"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
