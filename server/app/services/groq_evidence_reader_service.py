# -*- coding: utf-8 -*-
"""
groq_evidence_reader_service.py
================================
Groq Evidence Reader — đọc evidence TEXT, KHÔNG đọc ảnh.

Vai trò:
- Nhận danh sách evidence items (title/snippet/source/domain/url/page_text_excerpt)
- Nhận candidate_identity từ deterministic parser
- Gửi cho Groq để phân loại từng item: support/conflict/context_only/noise
- Trả JSON structured classification
- KHÔNG gửi image_bytes / base64 / URL ảnh
- KHÔNG là dependency bắt buộc — nếu fail thì fallback deterministic

Groq chỉ được đọc TEXT. Không nhìn ảnh.
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional

try:
    from groq import AsyncGroq
    GROQ_AVAILABLE = True
    GROQ_IMPORT_ERROR = None
except ImportError as exc:
    AsyncGroq = None  # type: ignore
    GROQ_AVAILABLE = False
    GROQ_IMPORT_ERROR = str(exc)

from app.core.config import settings
from app.utils.currency_normalizer import normalize_currency_identity

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VALID_CLASSIFICATIONS = {"support", "conflict", "context_only", "noise"}
VALID_STATUSES = {"completed", "partial", "uncertain"}
MAX_TITLE_CHARS = 250
MAX_SNIPPET_CHARS = 500
MAX_PAGE_TEXT_CHARS = 1000
MAX_REASON_CHARS = 300

_SYSTEM_PROMPT = (
    "You are a strict banknote evidence classifier for a visual-search pipeline. "
    "You receive structured text evidence from a web image search (Google Lens). "
    "You do NOT see any image. You do NOT guess from images. "
    "You only classify each evidence item based on its text fields. "
    "Your task: given a candidate identity (country/currency_code/denomination) proposed "
    "by a deterministic parser, classify each evidence item as:\n"
    "  - support: text directly supports the candidate identity (correct amount, currency, country, banknote context)\n"
    "  - conflict: text mentions the same currency/country but a DIFFERENT denomination, "
    "or contradicts the candidate\n"
    "  - context_only: mentions country or currency but NOT the specific denomination\n"
    "  - noise: exchange rates, auction prices, travel info, social noise, unrelated content\n\n"
    "Rules:\n"
    "1. Do NOT infer from images — there are no images.\n"
    "2. Do NOT add evidence that is not in the input.\n"
    "3. Classification must be based solely on text fields: title, snippet, source, domain, "
    "url, page_text_excerpt, rank_reasons, detected_country, detected_currency, detected_amounts.\n"
    "4. If denomination cannot be confirmed from text, use context_only or noise.\n"
    "5. A single number without currency/banknote context is NOT sufficient for 'support'.\n"
    "6. Return ONLY a valid JSON object matching the schema. No markdown, no extra text.\n\n"
    "Output schema (STRICTLY follow this):\n"
    "{\n"
    '  "status": "completed|partial|uncertain",\n'
    '  "proposed_identity": {"country": "...", "currency_code": "...", "denomination": "..."},\n'
    '  "evidence_classification": [\n'
    "    {\n"
    '      "rank": 1,\n'
    '      "classification": "support|conflict|context_only|noise",\n'
    '      "supports_country": true,\n'
    '      "supports_currency": true,\n'
    '      "supports_denomination": true,\n'
    '      "conflicting_denomination": null,\n'
    '      "reason": "Short reason based only on text."\n'
    "    }\n"
    "  ],\n"
    '  "supporting_ranks": [1, 5],\n'
    '  "conflicting_ranks": [],\n'
    '  "context_only_ranks": [],\n'
    '  "noise_ranks": [],\n'
    '  "independent_supporting_domains": ["domain1.com"],\n'
    '  "final_reason": "Short explanation of overall classification."\n'
    "}"
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compact_evidence_for_reader(item: Dict[str, Any], top_n: int) -> Dict[str, Any]:
    """Compact a single evidence item for Groq input — TEXT ONLY."""
    compact: Dict[str, Any] = {
        "rank": item.get("rank"),
        "title": str(item.get("title") or "")[:MAX_TITLE_CHARS],
        "snippet": str(item.get("snippet") or "")[:MAX_SNIPPET_CHARS],
        "source": str(item.get("source") or "")[:80],
        "domain": str(item.get("domain") or "")[:80],
        "url": str(item.get("url") or "")[:200],
    }
    page_text = str(item.get("page_text_excerpt") or "")
    if page_text:
        compact["page_text_excerpt"] = page_text[:MAX_PAGE_TEXT_CHARS]
    rank_reasons = list(item.get("rank_reasons") or [])[:10]
    if rank_reasons:
        compact["rank_reasons"] = rank_reasons
    if item.get("detected_country"):
        compact["detected_country"] = str(item["detected_country"])[:60]
    if item.get("detected_currency"):
        compact["detected_currency"] = str(item["detected_currency"])[:20]
    detected_amounts = list(item.get("detected_amounts") or [])[:5]
    if detected_amounts:
        compact["detected_amounts"] = detected_amounts
    return compact


def _build_reader_messages(
    compact_evidence: List[Dict[str, Any]],
    candidate_identity: Optional[Dict[str, Any]],
) -> List[Dict[str, str]]:
    payload = {
        "task": (
            "Classify each evidence item as support/conflict/context_only/noise "
            "for the candidate identity. Base classification ONLY on text fields."
        ),
        "candidate_identity_from_parser": candidate_identity or {},
        "evidence": compact_evidence,
    }
    user_prompt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def _resolve_groq_models() -> List[str]:
    model_config = str(getattr(settings, "AGENT3_GROQ_MODEL", "auto") or "auto").strip().lower()
    chain_config = str(getattr(settings, "AGENT3_GROQ_MODEL_CHAIN", "") or "").strip()

    models: List[str] = []
    if model_config == "auto" and chain_config:
        models = [m.strip() for m in chain_config.split(",") if m.strip()]

    if not models:
        base = getattr(settings, "AGENT3_GROQ_MODEL", "llama3-8b-8192") or "llama3-8b-8192"
        if str(base).lower() != "auto":
            models.append(str(base))
        else:
            models.append("llama3-8b-8192")
        fallback = getattr(settings, "AGENT3_GROQ_FALLBACK_MODEL", None)
        if fallback:
            models.append(str(fallback))

    seen: set = set()
    dedup: List[str] = []
    for m in models:
        if m not in seen:
            seen.add(m)
            dedup.append(m)
    return dedup


def _get_groq_client() -> Optional[Any]:
    global _groq_client, _groq_client_key  # noqa: PLW0603
    if not GROQ_AVAILABLE:
        return None
    api_key = str(getattr(settings, "GROQ_API_KEY", "") or "").strip()
    if not api_key:
        return None
    if _groq_client is None or _groq_client_key != api_key:
        _groq_client = AsyncGroq(api_key=api_key)  # type: ignore
        _groq_client_key = api_key
    return _groq_client


_groq_client: Optional[Any] = None
_groq_client_key: Optional[str] = None


def _parse_reader_output(raw_text: str) -> Dict[str, Any]:
    """Parse Groq output; raise ValueError on bad JSON."""
    text = str(raw_text or "").strip()
    if not text:
        raise ValueError("empty_response")
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"invalid_json:{exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("not_a_dict")
    return parsed


def _validate_reader_output(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate and normalize Groq reader output.
    Returns a clean dict; raises ValueError on fatal schema errors.
    """
    # status
    status = str(data.get("status") or "uncertain").strip().lower()
    if status not in VALID_STATUSES:
        status = "uncertain"

    # proposed_identity
    raw_identity = data.get("proposed_identity") or {}
    if not isinstance(raw_identity, dict):
        raw_identity = {}
    proposed_identity = {
        "country": str(raw_identity.get("country") or "").strip(),
        "currency_code": str(raw_identity.get("currency_code") or "").strip().upper(),
        "denomination": str(raw_identity.get("denomination") or "").strip(),
    }

    # evidence_classification
    raw_classifications = data.get("evidence_classification") or []
    classifications: List[Dict[str, Any]] = []
    for item in raw_classifications:
        if not isinstance(item, dict):
            continue
        clf = str(item.get("classification") or "noise").strip().lower()
        if clf not in VALID_CLASSIFICATIONS:
            clf = "noise"
        conflicting_denom = item.get("conflicting_denomination")
        if conflicting_denom is not None:
            conflicting_denom = str(conflicting_denom).strip()
        classifications.append({
            "rank": item.get("rank"),
            "classification": clf,
            "supports_country": bool(item.get("supports_country")),
            "supports_currency": bool(item.get("supports_currency")),
            "supports_denomination": bool(item.get("supports_denomination")),
            "conflicting_denomination": conflicting_denom,
            "reason": str(item.get("reason") or "")[:MAX_REASON_CHARS],
        })

    # rank arrays
    def _rank_list(key: str) -> List[int]:
        raw = data.get(key) or []
        if not isinstance(raw, list):
            return []
        result = []
        for r in raw:
            try:
                result.append(int(r))
            except (TypeError, ValueError):
                pass
        return result

    # independent_supporting_domains
    raw_domains = data.get("independent_supporting_domains") or []
    if not isinstance(raw_domains, list):
        raw_domains = []
    independent_domains = [str(d).strip().lower() for d in raw_domains if d]

    return {
        "status": status,
        "proposed_identity": proposed_identity,
        "evidence_classification": classifications,
        "supporting_ranks": _rank_list("supporting_ranks"),
        "conflicting_ranks": _rank_list("conflicting_ranks"),
        "context_only_ranks": _rank_list("context_only_ranks"),
        "noise_ranks": _rank_list("noise_ranks"),
        "independent_supporting_domains": independent_domains,
        "final_reason": str(data.get("final_reason") or "")[:500],
    }


def _skip_result(
    reason: str,
    error_type: Optional[str] = None,
    groq_called: bool = False,
) -> Dict[str, Any]:
    return {
        "groq_evidence_reader_used": False,
        "groq_called": groq_called,
        "groq_skipped_reason": reason,
        "groq_error_type": error_type,
        "status": "skipped",
        "proposed_identity": None,
        "evidence_classification": [],
        "supporting_ranks": [],
        "conflicting_ranks": [],
        "context_only_ranks": [],
        "noise_ranks": [],
        "independent_supporting_domains": [],
        "support_count": 0,
        "conflict_count": 0,
        "context_only_count": 0,
        "noise_count": 0,
        "final_reason": f"groq_evidence_reader_skipped:{reason}",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def read_evidence_with_groq(
    evidence_items: List[Dict[str, Any]],
    candidate_identity: Optional[Dict[str, Any]],
    *,
    timeout_seconds: Optional[float] = None,
    top_n: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Call Groq to classify evidence items as support/conflict/context_only/noise.

    GUARANTEES:
    - Never raises. Always returns a dict.
    - Never sends image_bytes / base64 / image URLs to Groq.
    - If Groq unavailable/fails/times out, returns a skip result with reason.
    - Groq output is validated before use.

    Returns dict with:
        groq_evidence_reader_used: bool
        groq_called: bool
        groq_skipped_reason: Optional[str]
        groq_error_type: Optional[str]
        status: completed|partial|uncertain|skipped
        proposed_identity: Optional[dict]
        evidence_classification: List[dict]
        supporting_ranks: List[int]
        conflicting_ranks: List[int]
        context_only_ranks: List[int]
        noise_ranks: List[int]
        independent_supporting_domains: List[str]
        support_count: int
        conflict_count: int
        context_only_count: int
        noise_count: int
        final_reason: str
    """
    # --- Config checks ---
    if not GROQ_AVAILABLE:
        return _skip_result("groq_package_missing", error_type="import_error")

    api_key = str(getattr(settings, "GROQ_API_KEY", "") or "").strip()
    if not api_key:
        return _skip_result("groq_api_key_missing")

    if not evidence_items:
        return _skip_result("no_evidence_to_classify")

    # --- Prepare compact evidence (TEXT ONLY — no images) ---
    resolved_top_n = int(top_n or getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_TOP_N", 5) or 5)
    resolved_top_n = max(1, min(resolved_top_n, 10))
    compact = [
        _compact_evidence_for_reader(item, resolved_top_n)
        for item in evidence_items[:resolved_top_n]
    ]

    messages = _build_reader_messages(compact, candidate_identity)

    # --- Timeout ---
    configured_timeout = float(
        timeout_seconds
        or getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_TIMEOUT_SECONDS", 5.0)
        or 5.0
    )
    configured_timeout = max(1.0, configured_timeout)

    max_tokens = int(
        getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_MAX_OUTPUT_TOKENS", 800) or 800
    )

    # --- Get client ---
    client = _get_groq_client()
    if client is None:
        return _skip_result("groq_client_unavailable")

    models = _resolve_groq_models()
    fallback_enabled = bool(getattr(settings, "AGENT3_GROQ_FALLBACK_ENABLED", True))

    last_error_reason: Optional[str] = None
    last_error_type: Optional[str] = None

    for model_name in models:
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_completion_tokens=max_tokens,
                ),
                timeout=configured_timeout,
            )
            try:
                raw_text = response.choices[0].message.content
            except (AttributeError, IndexError, TypeError):
                last_error_reason = "groq_bad_response_structure"
                last_error_type = "api_error"
                if not fallback_enabled:
                    break
                continue

            try:
                parsed = _parse_reader_output(raw_text)
                validated = _validate_reader_output(parsed)
            except ValueError as exc:
                last_error_reason = f"groq_invalid_json:{exc}"
                last_error_type = "invalid_json"
                if not fallback_enabled:
                    break
                continue

            # --- Count per classification ---
            clf_counts: Dict[str, int] = {
                "support": 0, "conflict": 0, "context_only": 0, "noise": 0,
            }
            for clf_item in validated["evidence_classification"]:
                key = clf_item["classification"]
                if key in clf_counts:
                    clf_counts[key] += 1

            return {
                "groq_evidence_reader_used": True,
                "groq_called": True,
                "groq_model_used": model_name,
                "groq_skipped_reason": None,
                "groq_error_type": None,
                "groq_raw_output_sample": str(raw_text or "")[:500],
                **validated,
                "support_count": clf_counts["support"],
                "conflict_count": clf_counts["conflict"],
                "context_only_count": clf_counts["context_only"],
                "noise_count": clf_counts["noise"],
            }

        except asyncio.TimeoutError:
            last_error_reason = f"groq_timeout_{model_name}"
            last_error_type = "timeout"
        except Exception as exc:
            msg = str(exc).casefold()
            if "401" in msg or "403" in msg or "auth" in msg:
                last_error_type = "auth_error"
            elif "429" in msg or "rate limit" in msg:
                last_error_type = "rate_limit"
            elif "500" in msg or "502" in msg or "503" in msg:
                last_error_type = "provider_unavailable"
            else:
                last_error_type = "api_error"
            last_error_reason = f"groq_api_error:{type(exc).__name__}"

        if not fallback_enabled:
            break

    return _skip_result(
        last_error_reason or "groq_all_models_failed",
        error_type=last_error_type or "unknown",
        groq_called=True,
    )


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

def reconcile_ag3_evidence(
    deterministic_result: Optional[Dict[str, Any]],
    groq_result: Optional[Dict[str, Any]],
    evidence_items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compare deterministic parser result vs Groq evidence classification.

    Returns:
    {
        reconciled_identity: {country, currency_code, denomination} | None
        agreement_level: "strong" | "medium" | "weak" | "conflict" | "deterministic_only"
        supporting_domains: List[str]
        conflicting_domains: List[str]
        reason: str
        eligible_for_validation: bool
        groq_failed: bool
        groq_skipped: bool
    }
    """
    groq_used = bool(groq_result and groq_result.get("groq_evidence_reader_used"))
    groq_skipped = (
        not groq_result
        or groq_result.get("status") == "skipped"
        or not groq_result.get("groq_evidence_reader_used")
    )

    det_identity = None
    if deterministic_result:
        det_country = str(deterministic_result.get("country") or "").strip()
        det_currency = str(deterministic_result.get("currency") or deterministic_result.get("currency_code") or "").strip().upper()
        det_denom = str(deterministic_result.get("amount") or deterministic_result.get("denomination") or "").strip()
        if det_country and det_currency and det_denom:
            det_identity = {
                "country": det_country,
                "currency_code": det_currency,
                "denomination": det_denom,
            }

    # --- Groq skipped/failed: use deterministic only ---
    if groq_skipped or not groq_used:
        if det_identity:
            return {
                "reconciled_identity": det_identity,
                "agreement_level": "deterministic_only",
                "supporting_domains": list(
                    set(
                        str(i.get("domain") or i.get("source") or "").strip().lower()
                        for i in evidence_items
                        if i.get("domain") or i.get("source")
                    )
                )[:10],
                "conflicting_domains": [],
                "reason": "groq_skipped_deterministic_used",
                "eligible_for_validation": True,
                "groq_failed": bool(groq_result and groq_result.get("groq_error_type")),
                "groq_skipped": groq_skipped,
            }
        return {
            "reconciled_identity": None,
            "agreement_level": "conflict",
            "supporting_domains": [],
            "conflicting_domains": [],
            "reason": "groq_skipped_and_deterministic_no_identity",
            "eligible_for_validation": False,
            "groq_failed": False,
            "groq_skipped": True,
        }

    # --- Groq was used ---
    groq_identity = groq_result.get("proposed_identity") or {}
    groq_country = str(groq_identity.get("country") or "").strip()
    groq_currency = str(groq_identity.get("currency_code") or "").strip().upper()
    groq_denom = str(groq_identity.get("denomination") or "").strip()
    groq_status = str(groq_result.get("status") or "uncertain").strip().lower()

    groq_has_identity = bool(groq_country and groq_currency and groq_denom)
    groq_supports = groq_result.get("support_count", 0)
    groq_conflicts = groq_result.get("conflict_count", 0)
    groq_domains = list(groq_result.get("independent_supporting_domains") or [])

    def _identity_comparison(
        a: Optional[Dict],
        b_country: str,
        b_currency: str,
        b_denom: str,
    ) -> Dict[str, Any]:
        if not a:
            return {
                "match": False,
                "conflict_fields": ["incomplete_identity"],
                "deterministic_key": None,
                "groq_key": None,
            }
        det_identity = normalize_currency_identity(
            a.get("country"),
            a.get("currency_code") or a.get("currency"),
            a.get("denomination") or a.get("amount"),
        )
        groq_identity_norm = normalize_currency_identity(
            b_country,
            b_currency,
            b_denom,
        )
        det_key = det_identity.get("vote_key")
        groq_key = groq_identity_norm.get("vote_key")
        if not det_key or not groq_key:
            return {
                "match": False,
                "conflict_fields": ["incomplete_identity"],
                "deterministic_key": list(det_key) if det_key else None,
                "groq_key": list(groq_key) if groq_key else None,
            }
        conflict_fields = [
            name
            for index, name in enumerate(("country", "currency", "denomination"))
            if det_key[index] != groq_key[index]
        ]
        return {
            "match": not conflict_fields,
            "conflict_fields": conflict_fields,
            "deterministic_key": list(det_key),
            "groq_key": list(groq_key),
        }

    # CASE 1: Both agree, strong evidence
    if det_identity and groq_has_identity and groq_status == "completed":
        comparison = _identity_comparison(
            det_identity,
            groq_country,
            groq_currency,
            groq_denom,
        )
        if comparison["match"]:
            return {
                "reconciled_identity": det_identity,
                "agreement_level": "strong",
                "supporting_domains": groq_domains,
                "conflicting_domains": [],
                "reason": "deterministic_and_groq_agree_completed",
                "canonical_identity_match": True,
                "deterministic_canonical_key": comparison["deterministic_key"],
                "groq_canonical_key": comparison["groq_key"],
                "eligible_for_validation": True,
                "groq_failed": False,
                "groq_skipped": False,
            }

    # CASE 2: Deterministic strong, Groq uncertain but not conflicting
    if det_identity and (not groq_has_identity or groq_status == "uncertain"):
        if groq_conflicts == 0 or groq_supports >= groq_conflicts:
            return {
                "reconciled_identity": det_identity,
                "agreement_level": "medium",
                "supporting_domains": groq_domains,
                "conflicting_domains": [],
                "reason": "deterministic_strong_groq_uncertain",
                "eligible_for_validation": True,
                "groq_failed": False,
                "groq_skipped": False,
            }

    # CASE 3: Groq has identity, deterministic weak/missing but Groq supports >= 2 domains
    if not det_identity and groq_has_identity and groq_status == "completed":
        if groq_supports >= 2 and len(groq_domains) >= 2 and groq_conflicts < 2:
            reconciled = {
                "country": groq_country,
                "currency_code": groq_currency,
                "denomination": groq_denom,
            }
            return {
                "reconciled_identity": reconciled,
                "agreement_level": "medium",
                "supporting_domains": groq_domains,
                "conflicting_domains": [],
                "reason": "groq_supported_deterministic_weak",
                "eligible_for_validation": True,
                "groq_failed": False,
                "groq_skipped": False,
            }

    # CASE 4: Both have different identities — conflict
    if det_identity and groq_has_identity:
        comparison = _identity_comparison(
            det_identity,
            groq_country,
            groq_currency,
            groq_denom,
        )
        if not comparison["match"]:
            conflicting_domains = [
                str(i.get("domain") or "").strip().lower()
                for i in evidence_items
                if i.get("domain")
            ]
            return {
                "reconciled_identity": None,
                "agreement_level": "conflict",
                "supporting_domains": [],
                "conflicting_domains": list(set(conflicting_domains))[:5],
                "reason": "deterministic_groq_identity_conflict",
                "canonical_identity_match": False,
                "conflict_fields": comparison["conflict_fields"],
                "deterministic_canonical_key": comparison["deterministic_key"],
                "groq_canonical_key": comparison["groq_key"],
                "eligible_for_validation": False,
                "groq_failed": False,
                "groq_skipped": False,
            }

    # CASE 5: Groq conflict dominant
    if groq_conflicts >= 2 and groq_conflicts > groq_supports:
        return {
            "reconciled_identity": None,
            "agreement_level": "conflict",
            "supporting_domains": [],
            "conflicting_domains": groq_domains,
            "reason": "groq_conflict_dominant",
            "eligible_for_validation": False,
            "groq_failed": False,
            "groq_skipped": False,
        }

    # CASE 6: Weak — not enough from either side
    if det_identity:
        return {
            "reconciled_identity": det_identity,
            "agreement_level": "weak",
            "supporting_domains": groq_domains,
            "conflicting_domains": [],
            "reason": "weak_evidence_deterministic_fallback",
            "eligible_for_validation": True,
            "groq_failed": False,
            "groq_skipped": False,
        }

    return {
        "reconciled_identity": None,
        "agreement_level": "conflict",
        "supporting_domains": [],
        "conflicting_domains": [],
        "reason": "insufficient_evidence_both_parsers",
        "eligible_for_validation": False,
        "groq_failed": False,
        "groq_skipped": groq_skipped,
    }


# ---------------------------------------------------------------------------
# Mode selector: when to call Groq Evidence Reader
# ---------------------------------------------------------------------------

def should_call_groq_evidence_reader(
    mode: str,
    deterministic_promoted: bool,
    deterministic_support_count: int,
    deterministic_exact_count: int,
    has_conflict: bool,
    evidence_count: int,
) -> tuple[bool, str]:
    """
    Decide whether to call Groq Evidence Reader based on mode and deterministic result.

    Returns (should_call: bool, reason: str)
    """
    mode = str(mode or "when_weak").strip().lower()

    if mode == "never":
        return False, "mode_never"

    if evidence_count == 0:
        return False, "no_evidence"

    if mode == "always":
        return True, "mode_always"

    # mode == "when_weak"
    if deterministic_promoted and deterministic_exact_count >= 2 and not has_conflict:
        return False, "deterministic_already_strong"

    return True, "deterministic_weak_or_conflict"


__all__ = [
    "read_evidence_with_groq",
    "reconcile_ag3_evidence",
    "should_call_groq_evidence_reader",
    "GROQ_AVAILABLE",
    "GROQ_IMPORT_ERROR",
]
