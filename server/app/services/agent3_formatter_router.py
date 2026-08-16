import json
import time
from typing import Any, Callable, Dict, List, Optional


UNKNOWN_VALUES = {
    "",
    "unknown",
    "không xác định",
    "khong xac dinh",
    "none",
    "null",
    "n/a",
    "failed",
    "error",
}
FORMATTER_MIN_BUDGET_SECONDS = 3.0


def _is_unknown(value: Any) -> bool:
    return str(value or "").strip().casefold() in UNKNOWN_VALUES


def _is_strong_completed(result: Dict[str, Any]) -> bool:
    try:
        confidence = float(result.get("do_tin_cay", result.get("confidence", 0.0)))
    except (TypeError, ValueError):
        confidence = 0.0

    return (
        str(result.get("status") or "").strip().casefold() == "completed"
        and not bool(result.get("not_counted_in_consensus"))
        and not _is_unknown(result.get("quoc_gia") or result.get("country"))
        and not _is_unknown(
            result.get("ma_tien_te")
            or result.get("currency")
            or result.get("currency_code")
        )
        and not _is_unknown(result.get("menh_gia") or result.get("denomination"))
        and confidence >= 0.75
    )


def _list_json(payload: Dict[str, Any]) -> str:
    return json.dumps([payload], ensure_ascii=False)


def _compact_text(value: Any, max_chars: int = 2200) -> str:
    return " ".join(str(value or "").split())[:max_chars]


def _compact_evidence_for_formatter(item: Dict[str, Any]) -> Dict[str, Any]:
    compact = {
        "title": _compact_text(item.get("title"), 300),
        "snippet": _compact_text(item.get("snippet") or item.get("text"), 500),
        "source": _compact_text(item.get("source"), 160),
        "url": _compact_text(item.get("url") or item.get("link"), 500),
    }
    for key in (
        "provider",
        "bucket",
        "rank",
        "score",
        "domain",
        "canonical_domain",
        "canonical_url",
        "evidence_id",
        "raw_rank",
        "final_rank",
        "page_fetch_status",
        "fetch_status",
        "source_class",
        "source_trust_level",
        "extracted_country",
        "extracted_currency",
        "extracted_denomination",
        "object_type",
        "banknote_context",
        "identity_complete",
        "complete_identity",
        "content_identity_quality",
        "verification_basis",
        "evidence_disposition",
        "final_disposition",
        "classification_reason",
        "evidence_reason",
        "final_reason",
    ):
        if key in item:
            compact[key] = item.get(key)
    if "rank_reasons" in item:
        compact["rank_reasons"] = [
            _compact_text(reason, 160)
            for reason in list(item.get("rank_reasons") or [])[:20]
        ]
    for key in ("detected_country", "detected_currency"):
        if key in item:
            compact[key] = _compact_text(item.get(key), 80)
    if "detected_amounts" in item:
        compact["detected_amounts"] = list(item.get("detected_amounts") or [])[:10]
    page_text_excerpt = _compact_text(item.get("page_text_excerpt"), 2200)
    if page_text_excerpt:
        compact["page_text_excerpt"] = page_text_excerpt
        compact["page_text_excerpt_chars"] = len(page_text_excerpt)
        compact["page_text_checked"] = item.get("page_text_checked")
        compact["page_text_identity_terms"] = list(item.get("page_text_identity_terms") or [])[:10]
    elif "page_text_checked" in item:
        compact["page_text_checked"] = item.get("page_text_checked")
        compact["page_text_skip_reason"] = item.get("page_text_skip_reason")
        compact["page_text_excerpt_chars"] = 0
    if "link_checked" in item:
        compact["link_checked"] = bool(item.get("link_checked"))
    return compact


def _partial_payload(reason: str) -> Dict[str, Any]:
    return {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": "Không đủ evidence hoặc formatter unavailable",
        "quan_diem": "AG3 không đủ căn cứ để bỏ phiếu",
        "phuong_phap": "Google Lens / SerpAPI",
        "do_tin_cay": 0.0,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Partial",
        "provider": "serpapi",
        "not_counted_in_consensus": True,
        "formatter_router_reason": reason,
    }


def _validated_partial_json(
    reason: str,
    evidence: List[Dict[str, Any]],
    validator: Callable[..., Dict[str, Any]],
) -> str:
    validated = validator(_partial_payload(reason), evidence=evidence)
    validated["not_counted_in_consensus"] = True
    return _list_json(validated)


def _deadline_partial_json(
    evidence: List[Dict[str, Any]],
    validator: Callable[..., Dict[str, Any]],
    remaining_seconds: float,
) -> str:
    parsed = json.loads(
        _validated_partial_json("deadline_budget_low", evidence, validator)
    )
    item = parsed[0]
    item.update(
        {
            "status": "Partial",
            "not_counted_in_consensus": True,
            "timeout_stage": "before_formatter",
            "remaining_ms_at_stage": int(max(0.0, remaining_seconds) * 1000),
            "evidence_preserved": bool(evidence),
            "top5_evidence_count": len(evidence[:5]),
        }
    )
    promotion_trace = dict(item.get("promotion_trace") or {})
    promotion_trace.update(
        {
            "promoted": False,
            "reason": "deadline_budget_low",
            "timeout_stage": "before_formatter",
            "remaining_ms_at_stage": int(max(0.0, remaining_seconds) * 1000),
            "evidence_preserved": bool(evidence),
        }
    )
    item["promotion_trace"] = promotion_trace
    return json.dumps(parsed, ensure_ascii=False)


def _deterministic_fallback_json(
    deterministic: Dict[str, Any],
    reason: str,
    evidence: List[Dict[str, Any]],
    validator: Callable[..., Dict[str, Any]],
) -> str:
    status = str(deterministic.get("status") or "").strip().casefold()
    if status != "completed" or bool(
        deterministic.get("not_counted_in_consensus")
    ):
        return _list_json(deterministic)
    return _validated_partial_json(reason, evidence, validator)


def _set_trace(debug_log: Optional[Dict], **values: Any) -> None:
    if debug_log is None:
        return
    trace = debug_log.setdefault("formatter_router", {})
    trace.update(values)


def _finalize_formatter_json(
    result_json: str,
    *,
    debug_log: Optional[Dict],
    outcome: str,
    formatter_provider: str,
    groq_called: bool,
    groq_skipped_reason: Optional[str] = None,
    groq_error_type: Optional[str] = None,
    formatter_fallback: bool = False,
) -> str:
    """Attach a JSON-safe formatter trace to every AG3 router outcome."""
    try:
        parsed = json.loads(result_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        parsed = [_partial_payload("formatter_output_invalid_json")]

    if isinstance(parsed, dict):
        items = [parsed]
    elif isinstance(parsed, list):
        items = [item for item in parsed if isinstance(item, dict)]
    else:
        items = []
    if not items:
        items = [_partial_payload("formatter_output_empty")]

    output_status = str(items[0].get("status") or "Unknown")
    groq_used = bool(formatter_provider == "groq" and groq_called and outcome == "groq_candidate_validated")
    for item in items:
        reported_provider = str(item.get("provider") or "").strip().lower()
        if reported_provider in {"groq", "deterministic", "none", ""}:
            item["provider"] = "serpapi"
        item["formatter_provider"] = formatter_provider
        item["groq_called"] = bool(groq_called)
        item["groq_skipped_reason"] = groq_skipped_reason
        item["groq_error_type"] = groq_error_type
        item["ag3_groq_formatter_used"] = groq_used
        if not groq_used:
            item.setdefault("ag3_groq_skipped_reason", groq_skipped_reason)
        item["phuong_phap"] = (
            "Google Lens / SerpAPI + Groq Formatter"
            if groq_used
            else "Google Lens / SerpAPI"
        )
        item["formatter_output_status"] = str(item.get("status") or "Unknown")
        item["formatter_fallback"] = bool(formatter_fallback)

    _set_trace(
        debug_log,
        outcome=outcome,
        formatter_provider=formatter_provider,
        groq_called=bool(groq_called),
        groq_skipped_reason=groq_skipped_reason,
        groq_error_type=groq_error_type,
        formatter_output_status=output_status,
        formatter_fallback=bool(formatter_fallback),
    )
    return json.dumps(items, ensure_ascii=False)


async def run_agent3_formatter(
    top_evidence: List[Dict[str, Any]],
    *,
    raw_lens_data: str,
    deadline: Optional[float],
    context: str,
    debug_log: Optional[Dict],
    deterministic_parser: Callable[..., Dict[str, Any]],
    validator: Callable[..., Dict[str, Any]],
    parse_formatted_result: Callable[..., str],
    groq_extractions: Optional[Dict[str, Any]] = None,
) -> str:
    """Route ranked evidence through deterministic parsing and Groq safely."""
    router_started_at = time.monotonic()
    evidence = [
        _compact_evidence_for_formatter(item)
        for item in list(top_evidence or [])[:10]
        if isinstance(item, dict)
    ]
    formatter_provider_evidence = evidence[:5]
    _set_trace(
        debug_log,
        formatter_provider="groq",
        evidence_count=len(evidence),
        source_of_truth_evidence_count=len(evidence),
        formatter_provider_input_count=len(formatter_provider_evidence),
        evidence_limit=10,
        formatter_provider_input_limit=5,
    )

    if not evidence:
        _set_trace(debug_log, outcome="partial", reason="no_evidence")
        return _finalize_formatter_json(
            _validated_partial_json("no_evidence", evidence, validator),
            debug_log=debug_log,
            outcome="partial",
            formatter_provider="none",
            groq_called=False,
            groq_skipped_reason="no_evidence",
        )

    remaining_seconds = (
        max(0.0, deadline - time.monotonic())
        if deadline is not None
        else None
    )
    if (
        remaining_seconds is not None
        and remaining_seconds < FORMATTER_MIN_BUDGET_SECONDS
    ):
        elapsed_ms = int((time.monotonic() - router_started_at) * 1000)
        _set_trace(
            debug_log,
            outcome="partial",
            reason="deadline_budget_low",
            timeout_stage="before_formatter",
            elapsed_ms=elapsed_ms,
            groq_called=False,
            groq_skipped_reason="deadline_budget_low",
            fallback_attempted=False,
            fallback_reason="deadline_budget_low",
        )
        result = _finalize_formatter_json(
            _deadline_partial_json(evidence, validator, remaining_seconds),
            debug_log=debug_log,
            outcome="partial",
            formatter_provider="none",
            groq_called=False,
            groq_skipped_reason="deadline_budget_low",
            formatter_fallback=True,
        )
        parsed = json.loads(result)
        parsed[0]["elapsed_ms"] = elapsed_ms
        return json.dumps(parsed, ensure_ascii=False)

    try:
        deterministic = deterministic_parser(
            evidence,
            raw_lens_text=raw_lens_data,
            groq_extractions=groq_extractions,
        )
        deterministic = validator(
            deterministic,
            evidence=evidence,
            groq_extractions=groq_extractions,
        )
    except Exception:
        deterministic = validator(
            _partial_payload("deterministic_parser_error"),
            evidence=evidence,
            groq_extractions=groq_extractions,
        )

    if _is_strong_completed(deterministic):
        return _finalize_formatter_json(
            _list_json(deterministic),
            debug_log=debug_log,
            outcome="deterministic_strong",
            formatter_provider="deterministic",
            groq_called=False,
            groq_skipped_reason="deterministic_strong",
        )

    try:
        # Lazy import keeps AG3 import-safe until the Groq dependency is installed
        # and avoids creating a client unless this route actually needs Groq.
        from app.services.groq_formatter_service import (
            AuthError,
            BadJson,
            MissingKey,
            NoEvidence,
            ProviderUnavailable,
            RateLimit,
            Timeout,
            format_lens_evidence,
        )
    except Exception:
        _set_trace(
            debug_log,
            outcome="deterministic_fallback",
            reason="module_unavailable",
            groq_called=False,
        )
        return _finalize_formatter_json(
            _deterministic_fallback_json(
                deterministic,
                "module_unavailable",
                evidence,
                validator,
            ),
            debug_log=debug_log,
            outcome="deterministic_fallback",
            formatter_provider="deterministic",
            groq_called=False,
            groq_skipped_reason="module_unavailable",
            groq_error_type="module_unavailable",
            formatter_fallback=True,
        )

    try:
        _set_trace(debug_log, groq_called=True, model="primary")

        locked_c = deterministic.get("quoc_gia") or deterministic.get("country")
        locked_curr = deterministic.get("ma_tien_te") or deterministic.get("currency")
        locked_denom = deterministic.get("menh_gia") or deterministic.get("denomination")

        locked_identity = {
            "quoc_gia": locked_c,
            "ma_tien_te": locked_curr,
            "menh_gia": locked_denom,
        }

        candidate = await format_lens_evidence(
            formatter_provider_evidence,
            deadline=deadline,
            locked_identity=locked_identity,
        )
        candidate["provider"] = "serpapi"
        candidate["formatter_provider"] = "groq"
        candidate["phuong_phap"] = "Google Lens / SerpAPI + Groq Formatter"

        locked_c = deterministic.get("quoc_gia") or deterministic.get("country")
        locked_curr = deterministic.get("ma_tien_te") or deterministic.get("currency")
        locked_denom = deterministic.get("menh_gia") or deterministic.get("denomination")

        # Reuse the existing AG3 parser so Groq output always reaches
        # validate_agent3_identity before it can become an AG4 vote.
        result_str = parse_formatted_result(
            json.dumps([candidate], ensure_ascii=False),
            raw_lens_data,
            evidence=evidence,
        )
        parsed_items = json.loads(result_str)
        if isinstance(parsed_items, list) and parsed_items:
            res_item = parsed_items[0]
            out_c = res_item.get("quoc_gia") or res_item.get("country")
            out_curr = res_item.get("ma_tien_te") or res_item.get("currency")
            out_denom = res_item.get("menh_gia") or res_item.get("denomination")
            if not _is_unknown(locked_c) and not _is_unknown(locked_denom) and (out_c != locked_c or out_curr != locked_curr or str(out_denom) != str(locked_denom)):
                res_item["quoc_gia"] = locked_c
                res_item["ma_tien_te"] = locked_curr
                res_item["menh_gia"] = locked_denom
                res_item["formatter_changed_locked_identity"] = True
                result_str = json.dumps([res_item], ensure_ascii=False)

        return _finalize_formatter_json(
            result_str,
            debug_log=debug_log,
            outcome="groq_candidate_validated",
            formatter_provider="groq",
            groq_called=True,
        )
    except BadJson:
        _set_trace(debug_log, outcome="partial", reason="groq_bad_json")
        return _finalize_formatter_json(
            _validated_partial_json("groq_bad_json", evidence, validator),
            debug_log=debug_log,
            outcome="partial",
            formatter_provider="groq",
            groq_called=True,
            groq_error_type="BadJson",
        )
    except NoEvidence:
        _set_trace(debug_log, outcome="partial", reason="groq_no_evidence")
        return _finalize_formatter_json(
            _validated_partial_json("groq_no_evidence", evidence, validator),
            debug_log=debug_log,
            outcome="partial",
            formatter_provider="groq",
            groq_called=True,
            groq_error_type="NoEvidence",
        )
    except MissingKey:
        _set_trace(
            debug_log,
            outcome="deterministic_fallback",
            reason="missing_api_key",
            groq_called=False,
        )
        return _finalize_formatter_json(
            _deterministic_fallback_json(
                deterministic,
                "missing_api_key",
                evidence,
                validator,
            ),
            debug_log=debug_log,
            outcome="deterministic_fallback",
            formatter_provider="deterministic",
            groq_called=False,
            groq_skipped_reason="missing_api_key",
            groq_error_type="MissingKey",
            formatter_fallback=True,
        )
    except (AuthError, RateLimit, Timeout, ProviderUnavailable) as exc:
        _set_trace(
            debug_log,
            outcome="deterministic_fallback",
            reason=exc.__class__.__name__,
        )
        return _finalize_formatter_json(
            _deterministic_fallback_json(
                deterministic,
                exc.__class__.__name__,
                evidence,
                validator,
            ),
            debug_log=debug_log,
            outcome="deterministic_fallback",
            formatter_provider="deterministic",
            groq_called=True,
            groq_error_type=exc.__class__.__name__,
            formatter_fallback=True,
        )
    except Exception:
        _set_trace(debug_log, outcome="partial", reason="groq_unexpected_error")
        return _finalize_formatter_json(
            _validated_partial_json("groq_unexpected_error", evidence, validator),
            debug_log=debug_log,
            outcome="partial",
            formatter_provider="groq",
            groq_called=True,
            groq_error_type="UnexpectedError",
        )


__all__ = ["run_agent3_formatter"]
