import asyncio
import json
import os
import time
from typing import Any, Dict, Optional

from app.agents.agent_3_lens import (
    AGENT3_DEFAULT_BUDGET_SECONDS,
    FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS,
    RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS,
    build_candidate_verification_timeout_result,
    resolve_candidate_verification_mode,
    run_candidate_assisted_verification,
    run_agent3_lens as run_agent3_lens_v1,
    validate_agent3_identity,
)
from app.core.config import settings
from app.services.admin_service import AdminService


DEBUG_AGENT3_SELECTOR = True
MIN_FALLBACK_BUDGET_SECONDS = 8.0
FORMATTER_PROVIDER_VALUES = {"groq", "deterministic", "gemini", "none"}
RATE_LIMIT_MARKERS = (
    "429",
    "run out of searches",
    "quota",
    "rate limit",
    "rate_limit",
    "too many requests",
)
PROVIDER_ERROR_TYPES = {
    "provider_timeout",
    "provider_connection_error",
    "provider_rate_limited",
    "provider_server_error",
    "provider_auth_error",
    "provider_bad_request",
    "provider_malformed_response",
    "provider_no_result",
}
NON_RETRYABLE_PROVIDER_ERRORS = {
    "provider_rate_limited",
    "provider_auth_error",
    "provider_bad_request",
    "provider_malformed_response",
}


def _log(message: str, data: Any = None) -> None:
    if not DEBUG_AGENT3_SELECTOR:
        return

    prefix = "[Agent3Selector]"

    if data is None:
        print(f"{prefix} {message}", flush=True)
        return

    try:
        print(
            f"{prefix} {message}: {json.dumps(data, ensure_ascii=True, default=str)[:3000]}",
            flush=True,
        )
    except Exception:
        print(f"{prefix} {message}: {data}", flush=True)


def _agent3_response(
    status: str,
    message: str,
    method: str = "Agent 3 Selector",
    provider: str = "disabled",
    confidence: float = 0.0,
    technical_error: bool = False,
    error_type: str = "technical_error",
) -> str:
    payload = {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": message,
        "quan_diem": message,
        "phuong_phap": method,
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": status,
        "provider": provider,
        "evidence": [],
        "not_counted_in_consensus": status.strip().lower() != "completed",
        "promotion_trace": {
            "promoted": False,
            "method": "evidence_verification",
            "provider": provider,
            "reason": f"provider_status:{status.strip().lower() or 'unknown'}",
            "selected_identity": None,
            "selected_evidence": None,
            "checks": {
                "identity_complete": False,
                "amount_allowed": False,
                "direct_title_or_snippet_match": False,
                "source_trusted": False,
                "multiple_evidence_agreement": False,
                "conflict_check_passed": True,
                "page_text_checked": False,
            },
            "matched_terms": [],
            "verification_source": "title_snippet_metadata",
        },
    }

    if technical_error:
        payload["error_type"] = error_type
        payload["technical_error"] = True


def _log(message: str, data: Any = None) -> None:
    if not DEBUG_AGENT3_SELECTOR:
        return

    prefix = "[Agent3Selector]"

    if data is None:
        print(f"{prefix} {message}", flush=True)
        return

    try:
        print(
            f"{prefix} {message}: {json.dumps(data, ensure_ascii=True, default=str)[:3000]}",
            flush=True,
        )
    except Exception:
        print(f"{prefix} {message}: {data}", flush=True)


def _agent3_response(
    status: str,
    message: str,
    method: str = "Agent 3 Selector",
    provider: str = "disabled",
    confidence: float = 0.0,
    technical_error: bool = False,
    error_type: str = "technical_error",
) -> str:
    payload = {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": message,
        "quan_diem": message,
        "phuong_phap": method,
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": status,
        "provider": provider,
        "evidence": [],
        "not_counted_in_consensus": status.strip().lower() != "completed",
        "promotion_trace": {
            "promoted": False,
            "method": "evidence_verification",
            "provider": provider,
            "reason": f"provider_status:{status.strip().lower() or 'unknown'}",
            "selected_identity": None,
            "selected_evidence": None,
            "checks": {
                "identity_complete": False,
                "amount_allowed": False,
                "direct_title_or_snippet_match": False,
                "source_trusted": False,
                "multiple_evidence_agreement": False,
                "conflict_check_passed": True,
                "page_text_checked": False,
            },
            "matched_terms": [],
            "verification_source": "title_snippet_metadata",
        },
    }

    if technical_error:
        payload["error_type"] = error_type
        payload["technical_error"] = True

    return json.dumps([payload], ensure_ascii=False)


def _safe_key_fingerprint(value: Any) -> Dict[str, Any]:
    key = str(value or "")
    return {
        "credential_configured": bool(key),
    }


def _safe_error_text(value: Any, limit: int = 200) -> str:
    text = str(value or "").replace("\n", " ")
    for setting_name in ("SERPAPI_KEY", "IMGBB_API_KEY"):
        secret = str(getattr(settings, setting_name, "") or "")
        if secret:
            text = text.replace(secret, "[REDACTED]")
    return text[:limit]


def _normalize_provider_error_type(value: Any) -> str:
    explicit = str(value or "").strip().lower()
    if explicit in PROVIDER_ERROR_TYPES:
        return explicit
    if explicit in {"rate_limit", "provider_quota_exhausted"}:
        return "provider_rate_limited"
    if explicit == "timeout":
        return "provider_timeout"
    if explicit in {"connection_error", "network_error"}:
        return "provider_connection_error"
    if explicit in {"bad_request", "request_error"}:
        return "provider_bad_request"
    if explicit in {"auth_error", "missing_api_key", "provider_config_missing"}:
        return "provider_auth_error"
    return explicit


def _classify_provider_error(value: Any) -> str:
    explicit = str(getattr(value, "error_type", "") or "").strip().lower()
    normalized = _normalize_provider_error_type(explicit)
    if normalized in PROVIDER_ERROR_TYPES:
        return normalized
    status_code = getattr(value, "status_code", None)
    if status_code in {401, 403}:
        return "provider_auth_error"
    if status_code == 400:
        return "provider_bad_request"
    if status_code in {408, 504}:
        return "provider_timeout"
    if status_code == 429:
        return "provider_rate_limited"
    if isinstance(status_code, int) and 500 <= status_code <= 599:
        return "provider_server_error"
    text = str(value or "").casefold()
    if any(marker in text for marker in RATE_LIMIT_MARKERS):
        return "provider_rate_limited"
    if isinstance(value, (asyncio.TimeoutError, TimeoutError)) or "timeout" in text:
        return "provider_timeout"
    if any(token in text for token in ("connection", "network", "dns", "proxy", "ssl")):
        return "provider_connection_error"
    if any(token in text for token in ("http 500", "http 502", "http 503", "http 504", "server error")):
        return "provider_server_error"
    if any(token in text for token in ("unauthorized", "forbidden", "auth", "api key", "serpapi_key")):
        return "provider_auth_error"
    if any(token in text for token in ("bad request", "http 400", "invalid request", "invalid parameter")):
        return "provider_bad_request"
    if any(token in text for token in ("malformed", "invalid json", "not valid json", "không trả json")):
        return "provider_malformed_response"
    return "technical_error"


def _fallback_reason_from_provider_error(error_type: str) -> str:
    normalized = _normalize_provider_error_type(error_type)
    mapping = {
        "provider_timeout": "primary_timeout",
        "provider_connection_error": "primary_connection_error",
        "provider_rate_limited": "primary_rate_limited",
        "provider_server_error": "primary_server_error",
        "provider_auth_error": "primary_auth_error",
        "provider_bad_request": "primary_bad_request",
        "provider_malformed_response": "primary_malformed_response",
        "provider_no_result": "primary_no_result",
    }
    return mapping.get(normalized, "primary_technical_error")


def _provider_available(provider: Any) -> bool:
    return _normalize_provider(provider) in {"serpapi", "selenium"}


def _provider_config_source(config: Any) -> str:
    if (
        _setting_value("AGENT3_PRIMARY_PROVIDER") is not None
        or _setting_value("AGENT3_PROVIDER") is not None
    ):
        return "env"
    if any(
        str(getattr(config, field, "") or "").strip()
        for field in ("lens_provider", "agent3_provider")
    ):
        return "admin"
    return "default"


def _normalize_provider(value: Any) -> str:
    provider = str(value or "serpapi").strip().lower()

    aliases = {
        "v1": "serpapi",
        "serp": "serpapi",
        "serp_api": "serpapi",
        "google_lens_serpapi": "serpapi",
        "v2": "selenium",
        "selenium_lens": "selenium",
        "google_lens_selenium": "selenium",
        "off": "disabled",
        "false": "disabled",
        "none": "disabled",
    }

    return aliases.get(provider, provider)


def _setting_value(name: str, default: Any = None) -> Any:
    explicit_fields = getattr(settings, "model_fields_set", set())
    if name not in explicit_fields:
        return default

    value = getattr(settings, name, default)
    if isinstance(value, str) and value.strip() == "":
        return default
    return value


def _is_serpapi_only_mode() -> bool:
    return bool(getattr(settings, "AGENT3_SERPAPI_ONLY_MODE", True))


def _resolve_provider(config: Any) -> str:
    provider = (
        _setting_value("AGENT3_PRIMARY_PROVIDER")
        or _setting_value("AGENT3_PROVIDER")
        or getattr(config, "lens_provider", None)
        or getattr(config, "agent3_provider", None)
        or "serpapi"
    )
    return _normalize_provider(provider)


def _resolve_fallback_provider(config: Any, provider: str) -> str:
    raw_fallback = (
        _setting_value("AGENT3_FALLBACK_PROVIDER")
        or getattr(config, "lens_fallback_provider", None)
        or getattr(config, "agent3_fallback_provider", None)
    )

    fallback_provider = (
        _normalize_provider(raw_fallback)
        if str(raw_fallback or "").strip()
        else ""
    )
    if not fallback_provider:
        fallback_provider = "selenium" if provider == "serpapi" else "serpapi"

    return fallback_provider


def _resolve_fallback_details(
    config: Any,
    provider: str,
    *,
    selenium_enabled: bool,
) -> Dict[str, Any]:
    fallback_provider = _resolve_fallback_provider(config, provider)
    normalized = False
    blocked_reason = None
    if fallback_provider == provider:
        if provider == "serpapi" and selenium_enabled:
            fallback_provider = "selenium"
            normalized = True
        else:
            blocked_reason = (
                "fallback_provider_same_as_primary_and_selenium_disabled"
                if provider == "serpapi" and not selenium_enabled
                else "fallback_provider_same_as_primary"
            )
    return {
        "provider": fallback_provider,
        "normalized": normalized,
        "blocked_reason": blocked_reason,
    }


def _resolve_fallback_enabled(config: Any) -> bool:
    if _setting_value("AGENT3_FALLBACK_ENABLED", None) is not None:
        return bool(getattr(settings, "AGENT3_FALLBACK_ENABLED"))

    return bool(
        getattr(config, "lens_fallback_enabled", False)
        or getattr(config, "agent3_fallback_enabled", False)
    )


def _is_selenium_enabled(config: Any) -> bool:
    if _setting_value("AGENT3_SELENIUM_ENABLED", None) is not None:
        return bool(getattr(settings, "AGENT3_SELENIUM_ENABLED"))

    return bool(getattr(config, "agent3_v2_enabled", False))


def _safe_parse_agent3_result(raw_result: Any) -> Dict[str, Any]:
    try:
        if isinstance(raw_result, dict):
            return raw_result

        parsed = json.loads(raw_result)

        if isinstance(parsed, list):
            return parsed[0] if parsed else {}

        if isinstance(parsed, dict):
            return parsed

        return {}
    except Exception:
        return {}


def _ensure_provider_formatter_separation(
    data: Dict[str, Any],
    provider: Optional[str],
) -> None:
    if not isinstance(data, dict):
        return

    real_provider = _normalize_provider(provider or data.get("provider") or "serpapi")
    reported_provider = str(data.get("provider") or "").strip().lower()
    formatter_provider = str(data.get("formatter_provider") or "").strip().lower()

    if reported_provider in FORMATTER_PROVIDER_VALUES:
        if not formatter_provider:
            data["formatter_provider"] = reported_provider
        data["provider"] = real_provider
    elif not reported_provider:
        data["provider"] = real_provider

    provider_trace = data.get("provider_trace")
    if isinstance(provider_trace, dict):
        if data.get("formatter_provider"):
            provider_trace["formatter_provider"] = data.get("formatter_provider")
        data["provider_trace"] = provider_trace


def _selected_provider_from_result(data: Dict[str, Any], default: str = "serpapi") -> str:
    if not isinstance(data, dict):
        return default
    provider_trace = data.get("provider_trace") or {}
    selected = (
        provider_trace.get("selected_provider")
        if isinstance(provider_trace, dict)
        else None
    )
    normalized = _normalize_provider(selected or data.get("provider") or default)
    if normalized in FORMATTER_PROVIDER_VALUES:
        return default
    return normalized or default


def _remaining_budget(deadline: float) -> float:
    return max(0.0, deadline - time.monotonic())


def _normalized_agent3_result(raw_result: Any, provider: str) -> str:
    data = _safe_parse_agent3_result(raw_result)
    if not data:
        return _agent3_response(
            status="Failed",
            message="Agent 3 returned an invalid or empty response.",
            provider=provider,
            technical_error=True,
        )

    _ensure_provider_formatter_separation(data, provider)
    validated = validate_agent3_identity(
        data,
        evidence=data.get("evidence") or [],
    )
    if bool(data.get("technical_error")) or str(data.get("error_type") or "").strip().lower() == "technical_error":
        technical_keys = (
            "timeout_stage",
            "provider_stage",
            "technical_error",
            "root_error_type",
            "elapsed_ms",
            "remaining_ms",
            "remaining_ms_at_stage",
            "retry_attempted",
            "evidence_preserved",
            "search_performed",
            "raw_lens_result_count",
        )
        validated["status"] = data.get("status") or "Failed"
        validated["error_type"] = data.get("error_type") or "technical_error"
        validated["technical_error"] = True
        validated["not_counted_in_consensus"] = True
        for key in technical_keys:
            if key in data:
                validated[key] = data[key]
        source_errors = data.get("validation_errors")
        if isinstance(source_errors, list) and source_errors:
            validated["validation_errors"] = source_errors
        else:
            root_error_type = str(data.get("root_error_type") or "technical_error").strip()
            validated["validation_errors"] = [f"technical_failure:{root_error_type}"]
        if isinstance(validated.get("ag3_verification_summary"), dict):
            summary = validated["ag3_verification_summary"]
            summary["status"] = validated["status"]
            summary["error_type"] = validated["error_type"]
            summary["technical_error"] = True
            summary["not_counted_in_consensus"] = True
            for key in technical_keys:
                if key in validated:
                    summary[key] = validated[key]
    _ensure_provider_formatter_separation(validated, provider)
    return json.dumps([validated], ensure_ascii=False)


def _is_invalid_text(value: Any) -> bool:
    text = str(value or "").strip().lower()

    return text in {
        "",
        "không xác định",
        "khong xac dinh",
        "unknown",
        "none",
        "null",
        "n/a",
        "na",
        "failed",
        "error",
    }


def _is_weak_agent3_result(raw_result: str) -> bool:
    data = _safe_parse_agent3_result(raw_result)

    if not data:
        return True

    validated = validate_agent3_identity(
        data,
        evidence=data.get("evidence") or [],
    )
    status = str(validated.get("status") or "").strip().lower()
    confidence = float(
        validated.get("do_tin_cay") or validated.get("confidence") or 0.0
    )

    error_type = str(validated.get("error_type") or data.get("error_type") or "").strip().lower()
    weak_errors = {"quota", "rate_limit", "no_source", "insufficient_evidence", "provider_error", "timeout"}

    country = str(validated.get("quoc_gia") or "").strip().lower()
    currency = str(validated.get("ma_tien_te") or "").strip().lower()
    denomination = str(validated.get("menh_gia") or "").strip().lower()

    missing_critical = (
        not country or country in {"không xác định", "unknown", "none"} or
        not currency or currency in {"không xác định", "unknown", "none"} or
        not denomination or denomination in {"không xác định", "unknown", "none"}
    )

    no_accepted = not bool(validated.get("accepted_identity") or validated.get("promotion_trace", {}).get("selected_identity"))

    return (
        status != "completed"
        or confidence < 0.55
        or bool(validated.get("not_counted_in_consensus"))
        or bool(validated.get("validation_errors"))
        or error_type in weak_errors
        or missing_critical
        or no_accepted
    )


def _summarize_result(raw_result: str) -> Dict[str, Any]:
    data = _safe_parse_agent3_result(raw_result)
    provider_trace = data.get("provider_trace") if isinstance(data.get("provider_trace"), dict) else {}
    raw_error_type = (
        data.get("provider_error_type")
        or data.get("root_error_type")
        or provider_trace.get("root_error_type")
        or provider_trace.get("primary_error_type")
        or data.get("error_type")
        or data.get("error_code")
    )
    provider_error_type = _normalize_provider_error_type(raw_error_type)
    return {
        "status": data.get("status"),
        "provider": data.get("provider"),
        "country": data.get("quoc_gia") or data.get("country"),
        "denomination": data.get("menh_gia") or data.get("denomination"),
        "confidence": data.get("do_tin_cay") or data.get("confidence"),
        "method": data.get("phuong_phap"),
        "evidence_count": len(data.get("evidence") or []),
        "error_type": data.get("error_type") or data.get("error_code"),
        "provider_error_type": provider_error_type if provider_error_type in PROVIDER_ERROR_TYPES else None,
        "root_error_type": data.get("root_error_type") or provider_trace.get("root_error_type"),
        "search_performed": data.get("search_performed", provider_trace.get("search_performed")),
        "technical_error": bool(data.get("technical_error")),
        "description": str(data.get("mo_ta") or "")[:300],
    }


def _fallback_reason_for_result(raw_result: str) -> str:
    data = _safe_parse_agent3_result(raw_result)
    status = str(data.get("status") or "").strip().lower()
    provider_trace = data.get("provider_trace") if isinstance(data.get("provider_trace"), dict) else {}
    error_type = (
        data.get("provider_error_type")
        or data.get("root_error_type")
        or provider_trace.get("root_error_type")
        or provider_trace.get("primary_error_type")
        or data.get("error_type")
        or data.get("error_code")
        or ""
    )
    normalized = _normalize_provider_error_type(error_type)
    if normalized in PROVIDER_ERROR_TYPES:
        return _fallback_reason_from_provider_error(normalized)
    if (
        status in {"failed", "error", "technical_error"}
        or bool(data.get("technical_error"))
        or any(token in str(error_type).lower() for token in ("technical", "timeout", "quota", "provider"))
    ):
        return "primary_technical_error"
    return "primary_partial_weak_evidence"


def _attach_provider_trace(
    raw_result: str,
    *,
    primary: str,
    fallback: Optional[str],
    fallback_attempted: bool,
    fallback_reason: str,
    selected_provider: Optional[str],
    primary_summary: Optional[Dict[str, Any]] = None,
    trace_context: Optional[Dict[str, Any]] = None,
    fallback_result_status: Optional[str] = None,
    fallback_error_type: Optional[str] = None,
) -> str:
    data = _safe_parse_agent3_result(raw_result)
    if not data:
        return raw_result

    _ensure_provider_formatter_separation(data, selected_provider or primary)
    provider_trace = dict(data.get("provider_trace") or {})
    key_fingerprint = _safe_key_fingerprint(getattr(settings, "SERPAPI_KEY", None))
    provider_trace.update({
        "primary": primary,
        "fallback": fallback,
        "primary_provider": primary,
        "fallback_provider": fallback,
        "fallback_attempted": bool(fallback_attempted),
        "fallback_reason": fallback_reason,
        "selected_provider": selected_provider,
        "serpapi_credential_configured": key_fingerprint["credential_configured"],
        "process_id": os.getpid(),
        "serpapi_no_cache": bool(
            getattr(settings, "AGENT3_SERPAPI_NO_CACHE", False)
        ),
    })
    if trace_context:
        provider_trace.update(trace_context)
    primary_error_type = (
        (primary_summary or {}).get("provider_error_type")
        or _normalize_provider_error_type((primary_summary or {}).get("error_type"))
        or (primary_summary or {}).get("error_type")
    )
    if primary_error_type:
        provider_trace["primary_error_type"] = primary_error_type
    provider_trace.setdefault("fallback_error_type", fallback_error_type)
    provider_trace["fallback_available"] = bool(
        provider_trace.get("fallback_available", _provider_available(fallback))
    )
    provider_trace["only_mode"] = bool(
        provider_trace.get("only_mode", provider_trace.get("serpapi_only_mode", False))
    )
    provider_trace.setdefault("remaining_ms_before_fallback", None)
    final_status = str(data.get("status") or "").strip().lower()
    final_technical_error = bool(data.get("technical_error"))
    provider_trace["technical_error"] = final_technical_error
    if "search_performed" in data:
        provider_trace["search_performed"] = bool(data.get("search_performed"))
    elif selected_provider and final_status not in {"disabled", "failed", "error"} and not final_technical_error:
        provider_trace["search_performed"] = True
    else:
        provider_trace.setdefault("search_performed", False)
    if data.get("formatter_provider"):
        provider_trace["formatter_provider"] = data.get("formatter_provider")
    if fallback_result_status is not None:
        provider_trace["fallback_result_status"] = fallback_result_status
    for key in ("timeout_stage", "elapsed_ms"):
        if data.get(key) is not None:
            provider_trace[key] = data[key]
    data["provider_trace"] = provider_trace
    if fallback_attempted:
        data["fallback_from_provider"] = primary
        data["fallback_reason"] = fallback_reason
    if primary_summary is not None:
        data["primary_result_summary"] = primary_summary
    return json.dumps([data], ensure_ascii=False)


async def _run_by_provider(
    provider: str,
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
    public_crop_url: Optional[str] = None,
    **kwargs,
) -> str:
    force_enable_selenium = bool(kwargs.pop("force_enable_selenium", False) or kwargs.pop("force_enable", False))
    disable_selenium_proxy = bool(kwargs.pop("disable_selenium_proxy", False))
    provider = _normalize_provider(provider)
    deadline = deadline or (time.monotonic() + AGENT3_DEFAULT_BUDGET_SECONDS)

    _log("Running provider", {"provider": provider, "image_bytes": len(image_bytes)})

    if provider == "serpapi":
        result = await asyncio.wait_for(
            run_agent3_lens_v1(
                image_bytes,
                context=context,
                debug_log=debug_log,
                deadline=deadline,
                public_crop_url=public_crop_url,
            ),
            timeout=max(0.1, _remaining_budget(deadline)),
        )
        result = _normalized_agent3_result(result, provider)
        _log("Provider serpapi finished", _summarize_result(result))
        return result

    if provider == "selenium":
        if _is_serpapi_only_mode():
            _log("Provider selenium disabled by serpapi_only_mode")
            return json.dumps([{
                "status": "Disabled",
                "message": "Selenium disabled by AG3 SerpAPI-only policy.",
                "provider": "selenium",
                "not_counted_in_consensus": True,
                "provider_trace": {
                    "primary_provider": "serpapi",
                    "selected_provider": None,
                    "fallback_attempted": False,
                    "fallback_reason": "disabled_by_policy",
                    "serpapi_only_mode": True,
                    "only_mode": True,
                    "selenium_enabled": False,
                    "fallback_enabled": False,
                    "fallback_available": True,
                },
            }], ensure_ascii=False)

        from app.services.admin_service import AdminService
        try:
            config = await AdminService.get_system_config()
            selenium_enabled = _is_selenium_enabled(config)
        except Exception:
            selenium_enabled = getattr(settings, "AGENT3_SELENIUM_ENABLED", False)

        if not selenium_enabled and not force_enable_selenium:
            _log("Provider selenium disabled by config and not forced")
            return json.dumps([{
                "status": "Disabled",
                "message": "Selenium bị tắt qua cấu hình, và cờ force_enable_selenium = False.",
                "provider": "selenium"
            }], ensure_ascii=False)

        from app.agents.agent_3_lens_v2 import run_agent3_lens_v2
        from app.core.config import settings as _sel_cfg
        selenium_timeout = float(getattr(_sel_cfg, "AGENT3_SELENIUM_TIMEOUT_SECONDS", 60) or 60)
        test_total = float(getattr(_sel_cfg, "AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS", 90) or 90)
        effective_timeout = max(selenium_timeout, test_total)

        # Push deadline far enough so v2 can run for the full selenium budget
        extended_deadline = time.monotonic() + effective_timeout + 5
        if deadline is None or deadline < extended_deadline:
            deadline = extended_deadline

        result = await asyncio.wait_for(
            run_agent3_lens_v2(
                image_bytes,
                context=context,
                debug_log=debug_log,
                deadline=deadline,
                disable_selenium_proxy=disable_selenium_proxy,
            ),
            timeout=effective_timeout + 10.0,
        )
        result = _normalized_agent3_result(result, provider)
        _log("Provider selenium finished", _summarize_result(result))
        return result

    if provider == "disabled":
        result = _agent3_response(
            status="Disabled",
            message="Agent 3 đang bị tắt theo cấu hình admin.",
            provider="disabled",
        )
        _log("Provider disabled", _summarize_result(result))
        return result

    result = _agent3_response(
        status="Failed",
        message=f"Agent 3 provider không hợp lệ: {provider}",
        provider=provider,
        technical_error=True,
    )
    _log("Invalid provider", _summarize_result(result))
    return result


async def _run_agent3_lens_core(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
    public_crop_url: Optional[str] = None,
) -> str:
    """
    Entry point thay thế cho app.agents.agent_3_lens.run_agent3_lens.
    RecognitionService chỉ cần import hàm này.
    """
    deadline = deadline or (time.monotonic() + AGENT3_DEFAULT_BUDGET_SECONDS)
    _log("Start Agent 3 selector", {"budget_seconds": round(_remaining_budget(deadline), 3)})

    try:
        config = await AdminService.get_system_config()
    except Exception as exc:
        _log("Cannot read admin config, fallback to v1", {"error": _safe_error_text(exc)})

        try:
            result = await _run_by_provider(
                "serpapi",
                image_bytes,
                context=context,
                debug_log=debug_log,
                deadline=deadline,
                public_crop_url=public_crop_url,
            )
            _log("Fallback v1 after config error finished", _summarize_result(result))
            return _attach_provider_trace(
                result,
                primary="serpapi",
                fallback=None,
                fallback_attempted=False,
                fallback_reason="config_unavailable_forced_serpapi",
                selected_provider="serpapi",
                trace_context={
                    "provider_config_source": "config_unavailable",
                    "fallback_enabled": False,
                    "selenium_enabled": False,
                    "serpapi_only_mode": _is_serpapi_only_mode(),
                },
            )
        except Exception as fallback_exc:
            _log(
                "Fallback v1 after config error failed",
                {
                    "config_error": _safe_error_text(exc),
                    "fallback_error": _safe_error_text(fallback_exc),
                },
            )
            error_result = _agent3_response(
                status="Failed",
                message=(
                    "Agent 3 configuration and forced primary provider both failed: "
                    f"{_safe_error_text(exc)}"
                ),
                provider="unknown",
                technical_error=True,
            )
            return _attach_provider_trace(
                error_result,
                primary="serpapi",
                fallback=None,
                fallback_attempted=False,
                fallback_reason="config_unavailable_forced_serpapi_failed",
                selected_provider=None,
                trace_context={
                    "provider_config_source": "config_unavailable",
                    "fallback_enabled": False,
                    "selenium_enabled": False,
                    "serpapi_only_mode": _is_serpapi_only_mode(),
                },
            )

    enable_agent_3 = bool(getattr(config, "enable_agent_3", True))
    lens_enabled = bool(getattr(config, "lens_enabled", True))
    serpapi_only_mode = _is_serpapi_only_mode()
    provider = "serpapi" if serpapi_only_mode else _resolve_provider(config)
    selenium_enabled = False if serpapi_only_mode else _is_selenium_enabled(config)
    fallback_config_enabled = False if serpapi_only_mode else _resolve_fallback_enabled(config)
    fallback_details = _resolve_fallback_details(
        config,
        provider,
        selenium_enabled=selenium_enabled,
    )
    fallback_provider = fallback_details["provider"]
    fallback_available = _provider_available(fallback_provider)
    fallback_blocked_reason = (
        "disabled_by_policy"
        if serpapi_only_mode
        else fallback_details["blocked_reason"]
    )
    if not fallback_available and not fallback_blocked_reason:
        fallback_blocked_reason = "fallback_unavailable"
    fallback_enabled = bool(
        fallback_config_enabled
        and not fallback_blocked_reason
        and fallback_available
        and fallback_provider != provider
        and fallback_provider != "disabled"
        and (fallback_provider != "selenium" or selenium_enabled)
    )
    trace_context = {
        "provider_config_source": _provider_config_source(config),
        "fallback_enabled": fallback_enabled,
        "fallback_available": fallback_available,
        "selenium_enabled": selenium_enabled,
        "serpapi_only_mode": serpapi_only_mode,
        "only_mode": serpapi_only_mode,
        "fallback_provider_normalized": bool(fallback_details["normalized"]),
        "remaining_ms_before_fallback": None,
    }
    if serpapi_only_mode:
        trace_context["fallback_policy_reason"] = "disabled_by_policy"
        trace_context["selenium_disabled_by_policy"] = True
        trace_context["disabled_by_policy"] = True

    if not enable_agent_3 or not lens_enabled or provider == "disabled":
        _log("Agent 3 disabled by admin config")
        disabled_result = _agent3_response(
            status="Disabled",
            message="Agent 3 đang bị tắt theo cấu hình admin.",
            provider="disabled",
        )
        return _attach_provider_trace(
            disabled_result,
            primary=provider,
            fallback=fallback_provider,
            fallback_attempted=False,
            fallback_reason="agent3_disabled",
            selected_provider="disabled",
            trace_context=trace_context,
        )

    forced_primary_result = None
    if provider == "selenium" and not selenium_enabled:
        _log("Agent 3 v2 disabled by admin config; evaluating configured fallback")
        forced_primary_result = _agent3_response(
            status="Disabled",
            message="Agent 3 Selenium đang bị tắt theo cấu hình.",
            provider="selenium",
        )

    try:
        primary_result = forced_primary_result or await _run_by_provider(
            provider,
            image_bytes,
            context=context,
            debug_log=debug_log,
            deadline=deadline,
            public_crop_url=public_crop_url,
        )
        primary_summary = _summarize_result(primary_result)
        primary_is_weak = _is_weak_agent3_result(primary_result)

        _log(
            "Primary result evaluated",
            {
                "provider": provider,
                "is_weak": primary_is_weak,
                "summary": primary_summary,
            },
        )

        if (
            primary_is_weak
            and fallback_enabled
            and not fallback_blocked_reason
            and fallback_provider != provider
            and fallback_provider != "disabled"
            and (fallback_provider != "selenium" or selenium_enabled)
            and _remaining_budget(deadline) >= MIN_FALLBACK_BUDGET_SECONDS
        ):
            fallback_reason = _fallback_reason_for_result(primary_result)
            remaining_ms_before_fallback = int(_remaining_budget(deadline) * 1000)
            fallback_trace_context = {
                **trace_context,
                "remaining_ms_before_fallback": remaining_ms_before_fallback,
            }
            _log(
                f"fallback_used=True reason={fallback_reason}",
                {"from_provider": provider, "fallback_provider": fallback_provider},
            )
            _log(
                "Primary result weak, running fallback",
                {
                    "from_provider": provider,
                    "fallback_provider": fallback_provider,
                    "primary_summary": primary_summary,
                },
            )

            try:
                fallback_result = await _run_by_provider(
                    fallback_provider,
                    image_bytes,
                    context=context,
                    debug_log=debug_log,
                    deadline=deadline,
                    public_crop_url=public_crop_url,
                )
            except (ImportError, ModuleNotFoundError):
                return _attach_provider_trace(
                    primary_result,
                    primary=provider,
                    fallback=fallback_provider,
                    fallback_attempted=True,
                    fallback_reason="module_unavailable",
                    selected_provider=provider,
                    primary_summary=primary_summary,
                    trace_context=fallback_trace_context,
                    fallback_result_status="Failed",
                    fallback_error_type="module_unavailable",
                )
            except Exception as fallback_exc:
                return _attach_provider_trace(
                    primary_result,
                    primary=provider,
                    fallback=fallback_provider,
                    fallback_attempted=True,
                    fallback_reason="fallback_failed",
                    selected_provider=provider,
                    primary_summary=primary_summary,
                    trace_context=fallback_trace_context,
                    fallback_result_status="Failed",
                    fallback_error_type=_classify_provider_error(fallback_exc),
                )

            fallback_summary = _summarize_result(fallback_result)
            _log("Fallback result finished", fallback_summary)
            return _attach_provider_trace(
                fallback_result,
                primary=provider,
                fallback=fallback_provider,
                fallback_attempted=True,
                fallback_reason=fallback_reason,
                selected_provider=fallback_provider,
                primary_summary=primary_summary,
                trace_context=fallback_trace_context,
                fallback_result_status=str(
                    fallback_summary.get("status") or "unknown"
                ),
            )

        if serpapi_only_mode:
            fallback_skip_reason = "disabled_by_policy"
        elif not primary_is_weak:
            fallback_skip_reason = "primary_result_accepted"
        elif fallback_blocked_reason:
            fallback_skip_reason = fallback_blocked_reason
        elif fallback_provider == "selenium" and not selenium_enabled:
            fallback_skip_reason = "selenium_disabled"
        elif not fallback_enabled:
            fallback_skip_reason = "fallback_disabled"
        elif _remaining_budget(deadline) < MIN_FALLBACK_BUDGET_SECONDS:
            fallback_skip_reason = "fallback_budget_low"
        else:
            fallback_skip_reason = "fallback_provider_unavailable"
        _log(f"fallback_used=False reason={fallback_skip_reason}")
        if primary_is_weak and _remaining_budget(deadline) < MIN_FALLBACK_BUDGET_SECONDS:
            _log(
                "Fallback skipped because deadline budget is too low",
                {"remaining_seconds": round(_remaining_budget(deadline), 3)},
            )
        return _attach_provider_trace(
            primary_result,
            primary=provider,
            fallback=fallback_provider,
            fallback_attempted=False,
            fallback_reason=fallback_skip_reason,
            selected_provider=provider,
            primary_summary=primary_summary,
            trace_context=trace_context,
        )

    except Exception as exc:
        error_type = exc.__class__.__name__
        error_message = _safe_error_text(exc)
        primary_error_type = _classify_provider_error(exc)
        _log(f"primary failed type={error_type} message={error_message}")

        if (
            fallback_enabled
            and not fallback_blocked_reason
            and fallback_provider != provider
            and fallback_provider != "disabled"
            and (fallback_provider != "selenium" or selenium_enabled)
            and _remaining_budget(deadline) >= MIN_FALLBACK_BUDGET_SECONDS
        ):
            try:
                fallback_reason = _fallback_reason_from_provider_error(primary_error_type)
                remaining_ms_before_fallback = int(_remaining_budget(deadline) * 1000)
                fallback_trace_context = {
                    **trace_context,
                    "remaining_ms_before_fallback": remaining_ms_before_fallback,
                }
                _log(
                    f"fallback_used=True reason={fallback_reason}",
                    {"from_provider": provider, "fallback_provider": fallback_provider},
                )
                fallback_result = await _run_by_provider(
                    fallback_provider,
                    image_bytes,
                    context=context,
                    debug_log=debug_log,
                    deadline=deadline,
                    public_crop_url=public_crop_url,
                )

                fallback_summary = _summarize_result(fallback_result)
                _log(f"fallback success status={fallback_summary.get('status')}")
                traced_result = _attach_provider_trace(
                    fallback_result,
                    primary=provider,
                    fallback=fallback_provider,
                    fallback_attempted=True,
                    fallback_reason=fallback_reason,
                    selected_provider=fallback_provider,
                    primary_summary={"error_type": primary_error_type},
                    trace_context=fallback_trace_context,
                    fallback_result_status=str(
                        fallback_summary.get("status") or "unknown"
                    ),
                )
                traced_data = _safe_parse_agent3_result(traced_result)
                if traced_data:
                    traced_data["primary_error_type"] = primary_error_type
                    return json.dumps([traced_data], ensure_ascii=False)
                return traced_result

            except Exception as fallback_exc:
                fb_error_type = fallback_exc.__class__.__name__
                fb_error_message = _safe_error_text(fallback_exc)
                _log(f"fallback failed type={fb_error_type} message={fb_error_message}")

                failed_result = _agent3_response(
                    status="Failed",
                    message=(
                        f"Agent 3 provider '{provider}' lỗi: {error_type}: {error_message}. "
                        f"Fallback '{fallback_provider}' cũng lỗi: {fb_error_type}: {fb_error_message}."
                    ),
                    provider=provider,
                    technical_error=True,
                    error_type=primary_error_type,
                )
                return _attach_provider_trace(
                    failed_result,
                    primary=provider,
                    fallback=fallback_provider,
                    fallback_attempted=True,
                    fallback_reason=(
                        "module_unavailable"
                        if isinstance(fallback_exc, (ImportError, ModuleNotFoundError))
                        else "fallback_failed"
                    ),
                    selected_provider=provider,
                    primary_summary={"error_type": primary_error_type},
                    trace_context={
                        **trace_context,
                        "remaining_ms_before_fallback": int(_remaining_budget(deadline) * 1000),
                    },
                    fallback_result_status="Failed",
                    fallback_error_type=_classify_provider_error(fallback_exc),
                )

        _log(
            "fallback_used=False reason=primary_exception_no_enabled_fallback",
            {"provider": provider, "fallback_provider": fallback_provider},
        )
        failed_result = _agent3_response(
            status="Failed",
            message=f"Agent 3 provider '{provider}' lỗi: {error_type}: {error_message}",
            provider=provider,
            technical_error=True,
            error_type=primary_error_type,
        )
        if serpapi_only_mode:
            fallback_skip_reason = "disabled_by_policy"
        elif fallback_blocked_reason:
            fallback_skip_reason = fallback_blocked_reason
        elif fallback_provider == "selenium" and not selenium_enabled:
            fallback_skip_reason = "selenium_disabled"
        elif not fallback_enabled:
            fallback_skip_reason = "fallback_disabled"
        elif _remaining_budget(deadline) < MIN_FALLBACK_BUDGET_SECONDS:
            fallback_skip_reason = "fallback_budget_low"
        else:
            fallback_skip_reason = "primary_exception_no_enabled_fallback"
        return _attach_provider_trace(
            failed_result,
            primary=provider,
            fallback=fallback_provider,
            fallback_attempted=False,
            fallback_reason=fallback_skip_reason,
            selected_provider=None,
            primary_summary={"error_type": primary_error_type},
            trace_context=trace_context,
        )


async def run_agent3_candidate_verification(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    mode: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """Post-Lens hook used only after AG1 and AG2 have produced their votes."""
    return await run_candidate_assisted_verification(
        agent1_result,
        agent2_result,
        agent3_result,
        mode=mode,
        timeout_seconds=timeout_seconds,
    )


def resolve_agent3_candidate_verification_policy(
    agent1_result: Optional[Dict[str, Any]],
    agent2_result: Optional[Dict[str, Any]],
    *,
    agent3_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    mode = resolve_candidate_verification_mode(
        agent1_result,
        agent2_result,
        agent3_result=agent3_result,
    )
    timeout_seconds = (
        FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
        if mode == "fast_race_to_3"
        else RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
        if mode == "rescue_consensus"
        else 0.0
    )
    return {"mode": mode, "timeout_seconds": timeout_seconds}


def build_agent3_candidate_timeout_result(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    mode: str,
    timeout_seconds: float,
) -> Dict[str, Any]:
    return build_candidate_verification_timeout_result(
        agent1_result,
        agent2_result,
        agent3_result,
        mode=mode,
        timeout_seconds=timeout_seconds,
    )

async def run_agent3_lens(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
    experiment_mode: bool = False,
    public_crop_url: Optional[str] = None,
) -> str:
    from app.core.config import settings

    # 1. Run core logic to get primary/fallback results
    result_str = await _run_agent3_lens_core(
        image_bytes,
        context,
        debug_log,
        deadline,
        public_crop_url=public_crop_url,
    )

    # 2. Check if Groq Formatter should run
    is_groq_enabled = getattr(settings, "AGENT3_GROQ_FORMATTER_ENABLED", False)
    apply_prod = getattr(settings, "AGENT3_GROQ_FORMATTER_APPLY_PRODUCTION", False)
    apply_exp = getattr(settings, "AGENT3_GROQ_FORMATTER_APPLY_EXPERIMENT", True)

    should_run_groq = is_groq_enabled and ((experiment_mode and apply_exp) or (not experiment_mode and apply_prod))

    if not should_run_groq:
        return result_str

    data = _safe_parse_agent3_result(result_str)
    if not data:
        return result_str
    real_provider = _selected_provider_from_result(data)

    evidence = data.get("evidence") or []
    if not evidence:
        return result_str


    # 3. Call Groq
    try:
        from app.services.groq_formatter_service import format_lens_evidence
    except Exception as exc:
        data["ag3_groq_formatter_enabled"] = True
        data["ag3_groq_formatter_available"] = False
        data["ag3_groq_formatter_used"] = False
        data["ag3_groq_skipped_reason"] = "groq_package_missing"
        data["ag3_groq_error"] = _safe_error_text(exc)
        data["groq_called"] = False
        data["formatter_provider"] = "deterministic"
        data["provider"] = real_provider
        data["phuong_phap"] = "Google Lens / SerpAPI"
        if data.get("not_counted_in_consensus"):
            data["not_counted_in_consensus_reason"] = (
                "AG3 SerpAPI ran, but the evidence source was not strong enough to count as a vote."
            )
        _ensure_provider_formatter_separation(data, real_provider)
        return json.dumps([data], ensure_ascii=False)

    try:
        groq_result = await format_lens_evidence(evidence, deadline)

        if groq_result.get("ag3_groq_formatter_available") is False:
            data["ag3_groq_formatter_enabled"] = True
            data["ag3_groq_formatter_available"] = False
            data["ag3_groq_formatter_used"] = False
            data["ag3_groq_skipped_reason"] = groq_result.get("ag3_groq_skipped_reason")
            data["ag3_groq_error"] = groq_result.get("ag3_groq_error")
            data["groq_called"] = False
            data["formatter_provider"] = "deterministic"
            data["provider"] = real_provider
            data["phuong_phap"] = "Google Lens / SerpAPI"

            # PHẦN F - Custom message
            if data.get("not_counted_in_consensus"):
                data["not_counted_in_consensus_reason"] = (
                    "AG3 SerpAPI đã chạy nhưng không có đủ evidence độc lập để xác nhận danh tính. "
                    "Groq Formatter bị bỏ qua do thiếu package groq. AG3 không được tính vào đồng thuận."
                )
            if data.get("not_counted_in_consensus"):
                data["not_counted_in_consensus_reason"] = (
                    "AG3 SerpAPI ran, but the evidence source was not strong enough to count as a vote."
                )
            _ensure_provider_formatter_separation(data, real_provider)
            return json.dumps([data], ensure_ascii=False)

        # Validate the output from Groq

        validated = validate_agent3_identity(groq_result, evidence=evidence)
        _ensure_provider_formatter_separation(validated, real_provider)

        # Check if validation passed with required fields
        status = str(validated.get("status") or "").strip().lower()
        country = str(validated.get("quoc_gia") or "").strip().lower()
        currency = str(validated.get("ma_tien_te") or "").strip().lower()
        denomination = str(validated.get("menh_gia") or "").strip().lower()

        missing_critical = (
            not country or country in {"không xác định", "unknown", "none"} or
            not currency or currency in {"không xác định", "unknown", "none"} or
            not denomination or denomination in {"không xác định", "unknown", "none"}
        )


        # Append debug traces
        data["ag3_groq_formatter_enabled"] = True
        data["ag3_groq_formatter_available"] = True
        data["ag3_groq_formatter_used"] = True

        data["ag3_groq_model_used"] = groq_result.get("ag3_groq_model_used", "unknown")
        data["formatter_provider"] = "groq"
        data["provider"] = real_provider
        data["phuong_phap"] = "Google Lens / SerpAPI + Groq Formatter"

        if status == "completed" and not missing_critical:
            data.update(validated)
            data["status"] = "Completed"
            data["not_counted_in_consensus"] = False
        else:
            # Keep partial, but record validation errors
            data["validation_errors"] = validated.get("validation_errors", [])
            data["not_counted_in_consensus"] = True
        _ensure_provider_formatter_separation(data, real_provider)
        return json.dumps([data], ensure_ascii=False)

    except Exception as exc:

        # Fallback to original result if Groq fails
        data["ag3_groq_formatter_enabled"] = True
        data["ag3_groq_formatter_available"] = True
        data["ag3_groq_formatter_used"] = False

        data["ag3_groq_trace"] = {"error": exc.__class__.__name__, "message": _safe_error_text(exc)}
        data["groq_called"] = False
        data["formatter_provider"] = "deterministic"
        data["provider"] = real_provider
        data["phuong_phap"] = "Google Lens / SerpAPI"
        _ensure_provider_formatter_separation(data, real_provider)
        return json.dumps([data], ensure_ascii=False)
