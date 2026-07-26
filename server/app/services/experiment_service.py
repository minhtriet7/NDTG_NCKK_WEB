import asyncio
import re
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Dict, Iterable, List, Optional
from xml.sax.saxutils import escape

from fastapi import HTTPException

from app.core.config import settings
from app.models.experiment_run_model import ExperimentRun
from app.models.user_model import User
from app.schemas.experiment_schema import ExperimentRunInput
from app.services.recognition_service import RecognitionService
from app.utils.benchmark_normalization import (
    calculate_field_correctness,
    normalize_country as _shared_normalize_country,
    normalize_currency as _shared_normalize_currency,
    normalize_denomination as _shared_normalize_denomination,
)


_BACKGROUND_JOBS = set()
STALE_RUN_MINUTES = 30


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _stale_metadata(record: ExperimentRun) -> Dict[str, Any]:
    status_value = str(record.status or "").strip().casefold()
    reference_time = _as_utc(record.updated_at or record.created_at)
    if status_value not in {"queued", "running"} or reference_time is None:
        return {"is_stale": False, "stale_age_minutes": None}
    age_minutes = max(
        0,
        int((now_utc() - reference_time).total_seconds() // 60),
    )
    return {
        "is_stale": age_minutes >= STALE_RUN_MINUTES,
        "stale_age_minutes": age_minutes,
    }



import json
import os

def _extract_file_name(record) -> str:
    if getattr(record, "file_name", None):
        return str(record.file_name)
    image_path = getattr(record, "image_path", "")
    if image_path:
        return os.path.basename(image_path)
    return str(record.image_id)

def _extract_angle(record) -> str:
    if getattr(record, "angle", None):
        return str(record.angle)
    metadata = getattr(record, "metadata", {})
    if isinstance(metadata, dict) and metadata.get("angle"):
        return str(metadata.get("angle"))
    
    file_name = _extract_file_name(record)
    text_to_search = (str(record.image_id) + " " + file_name).upper()
    for ang in ["TOP", "LEFT", "RIGHT", "ZOOM", "MESSY"]:
        if ang in text_to_search:
            return ang
    return ""

def _get_debug_field(record, field_name: str):
    val = getattr(record, field_name, None)
    if val is not None:
        return val
        
    sources = [
        getattr(record, "final_result", {}),
        getattr(record, "debug_info", {}),
        getattr(record, "agent_errors", {}),
        getattr(record, "raw_results", {})
    ]
    
    def _search_dict(d, key):
        if not isinstance(d, dict):
            return None
        if key in d:
            return d[key]
        for k, v in d.items():
            if isinstance(v, dict):
                res = _search_dict(v, key)
                if res is not None:
                    return res
            elif isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                res = _search_dict(v[0], key)
                if res is not None:
                    return res
        return None

    for source in sources:
        val = _search_dict(source, field_name)
        if val is not None:
            return val
    return None

def _format_debug_field(val):
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        try:
            return json.dumps(val, ensure_ascii=False)
        except Exception:
            return str(val)
    return val


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def serialize_experiment_run(record: ExperimentRun) -> Dict[str, Any]:
    stale = _stale_metadata(record)
    legacy_valid_agent_count = sum(
        _is_valid_agent_status(status_value)
        for status_value in (
            record.ag1_status,
            record.ag2_status,
            record.ag3_status,
        )
    )
    stored_valid_agent_count = getattr(record, "valid_agent_count", 0)
    resolved_valid_agent_count = (
        stored_valid_agent_count
        if stored_valid_agent_count or legacy_valid_agent_count == 0
        else legacy_valid_agent_count
    )
    resolved_completed_agent_count = (
        getattr(record, "completed_agent_count", 0) or resolved_valid_agent_count
    )
    resolved_valid_vote_count = getattr(record, "valid_vote_count", 0)
    resolved_max_matching_votes = getattr(record, "max_matching_votes", 0)
    resolved_required_votes = getattr(record, "required_votes", 2)
    stored_pipeline_status = getattr(record, "pipeline_status", None)
    resolved_pipeline_status = (
        record.status
        if not stored_pipeline_status
        or (stored_pipeline_status == "queued" and record.status != "queued")
        else stored_pipeline_status
    )
    resolved_field_correct_count = getattr(record, "field_correct_count", 0)
    if not resolved_field_correct_count and record.correct_count:
        resolved_field_correct_count = record.correct_count
    resolved_field_score_pct = getattr(record, "field_score_pct", 0.0)
    if not resolved_field_score_pct and record.score_pct:
        resolved_field_score_pct = record.score_pct

    return {
        "id": str(record.id),
        "experiment_id": record.experiment_id,
        "dataset_id": record.dataset_id,
        "image_id": record.image_id,
        "run_no": record.run_no,
        "repeat_count": record.repeat_count,
        "admin_id": record.admin_id,
        "ground_truth_country": record.ground_truth_country,
        "ground_truth_currency": record.ground_truth_currency,
        "ground_truth_denomination": record.ground_truth_denomination,
        "predicted_country": record.predicted_country,
        "predicted_currency": record.predicted_currency,
        "predicted_denomination": record.predicted_denomination,
        "normalized_ground_truth_country": getattr(
            record, "normalized_ground_truth_country", None
        ),
        "normalized_predicted_country": getattr(
            record, "normalized_predicted_country", None
        ),
        "normalized_ground_truth_currency": getattr(
            record, "normalized_ground_truth_currency", None
        ),
        "normalized_predicted_currency": getattr(
            record, "normalized_predicted_currency", None
        ),
        "normalized_ground_truth_denomination": getattr(
            record, "normalized_ground_truth_denomination", None
        ),
        "normalized_predicted_denomination": getattr(
            record, "normalized_predicted_denomination", None
        ),
        "country_correct": record.country_correct,
        "currency_correct": record.currency_correct,
        "denomination_correct": record.denomination_correct,
        "correct_count": record.correct_count,
        "score_pct": record.score_pct,
        "exact_match": record.exact_match,
        "field_correct_count": resolved_field_correct_count,
        "field_total": getattr(record, "field_total", 3),
        "field_score_pct": resolved_field_score_pct,
        "valid_agent_count": resolved_valid_agent_count,
        "agent_total": getattr(record, "agent_total", 3),
        "agent_vote_pct": (
            getattr(record, "agent_vote_pct", 0.0)
            or round(resolved_valid_agent_count / 3 * 100, 2)
        ),
        "completed_agent_count": resolved_completed_agent_count,
        "valid_vote_count": resolved_valid_vote_count,
        "max_matching_votes": resolved_max_matching_votes,
        "required_votes": resolved_required_votes,
        "consensus_reached": getattr(record, "consensus_reached", False),
        "vote_groups": getattr(record, "vote_groups", []) or [],
        "winner_key": getattr(record, "winner_key", None),
        "ag1_model": getattr(record, "ag1_model", None),
        "ag2_model": getattr(record, "ag2_model", None),
        "ag3_provider": getattr(record, "ag3_provider", None),
        "ag4_model": getattr(record, "ag4_model", None),
        "pipeline_status": resolved_pipeline_status,
        "has_warning": getattr(record, "has_warning", False),
        "has_error": getattr(record, "has_error", False),
        "issue_severity": getattr(record, "issue_severity", None),
        "issue_stage": getattr(record, "issue_stage", None),
        "issue_type": getattr(record, "issue_type", None),
        "issue_message": getattr(record, "issue_message", None),
        "ag0_status": record.ag0_status,
        "ag1_status": record.ag1_status,
        "ag2_status": record.ag2_status,
        "ag3_status": record.ag3_status,
        "ag4_status": record.ag4_status,
        "ag0_error_type": record.ag0_error_type,
        "ag0_error_message": record.ag0_error_message,
        "ag1_error_type": record.ag1_error_type,
        "ag1_error_message": record.ag1_error_message,
        "ag2_error_type": record.ag2_error_type,
        "ag2_error_message": record.ag2_error_message,
        "ag3_error_type": record.ag3_error_type,
        "ag3_error_message": record.ag3_error_message,
        "ag4_error_type": record.ag4_error_type,
        "ag4_error_message": record.ag4_error_message,
        "agent_errors": record.agent_errors or {},
        "status": record.status,
        "error_stage": record.error_stage,
        "error_type": record.error_type,
        "error_message": record.error_message,
        "provider": record.provider,
        "http_status": record.http_status,
        "retry_after": record.retry_after,
        "raw_excerpt": record.raw_excerpt,
        "duration_ms": record.duration_ms,
        "delay_between_runs": record.delay_between_runs,
        "stop_on_rate_limit": record.stop_on_rate_limit,
        "stop_on_provider_error": getattr(record, "stop_on_provider_error", True),
        "force_rerun": record.force_rerun,
        "created_at": record.created_at,


        "ag0_crop_used": _format_debug_field(_get_debug_field(record, "ag0_crop_used")),
        "ag0_original_fallback_used": _format_debug_field(_get_debug_field(record, "ag0_original_fallback_used")),
        "fallback_reason": _format_debug_field(_get_debug_field(record, "fallback_reason")),
        "image_used_by_ag1": _format_debug_field(_get_debug_field(record, "image_used_by_ag1")),
        "image_used_by_ag2": _format_debug_field(_get_debug_field(record, "image_used_by_ag2")),
        "image_used_by_ag3": _format_debug_field(_get_debug_field(record, "image_used_by_ag3")),
        "crop_quality_issues": _format_debug_field(_get_debug_field(record, "crop_quality_issues")),

        "ag2_model_chain_used": _format_debug_field(_get_debug_field(record, "ag2_model_chain_used")),
        "ag2_model_attempts": _format_debug_field(_get_debug_field(record, "ag2_model_attempts")),
        "ag2_final_model": _format_debug_field(_get_debug_field(record, "ag2_final_model")),
        "ag2_fallback_reason": _format_debug_field(_get_debug_field(record, "ag2_fallback_reason")),

        "ag3_provider_chain_enabled": _format_debug_field(_get_debug_field(record, "ag3_provider_chain_enabled")),
        "ag3_primary_provider": _format_debug_field(_get_debug_field(record, "ag3_primary_provider")),
        "ag3_fallback_provider": _format_debug_field(_get_debug_field(record, "ag3_fallback_provider")),
        "ag3_provider_used": _format_debug_field(_get_debug_field(record, "ag3_provider_used")),
        "ag3_provider_trace": _format_debug_field(_get_debug_field(record, "ag3_provider_trace")),
        "ag3_primary_status": _format_debug_field(_get_debug_field(record, "ag3_primary_status")),
        "ag3_fallback_status": _format_debug_field(_get_debug_field(record, "ag3_fallback_status")),
        "ag3_fallback_triggered": _format_debug_field(_get_debug_field(record, "ag3_fallback_triggered")),
        "ag3_fallback_reason": _format_debug_field(_get_debug_field(record, "ag3_fallback_reason")),
        "ag3_selenium_skipped_reason": _format_debug_field(_get_debug_field(record, "ag3_selenium_skipped_reason")),
        "ag3_groq_formatter_enabled": _format_debug_field(_get_debug_field(record, "ag3_groq_formatter_enabled")),
        "ag3_groq_formatter_used": _format_debug_field(_get_debug_field(record, "ag3_groq_formatter_used")),
        "ag3_groq_model_used": _format_debug_field(_get_debug_field(record, "ag3_groq_model_used")),
        "ag3_groq_trace": _format_debug_field(_get_debug_field(record, "ag3_groq_trace")),
        "ag3_evidence_count": _format_debug_field(_get_debug_field(record, "ag3_evidence_count")),
        "ag3_validation_errors": _format_debug_field(_get_debug_field(record, "ag3_validation_errors")),
        "ag3_not_counted_in_consensus_reason": _format_debug_field(_get_debug_field(record, "ag3_not_counted_in_consensus_reason")),

        "consensus_pattern": _format_debug_field(_get_debug_field(record, "consensus_pattern")),
        "matched_count": _format_debug_field(_get_debug_field(record, "matched_count")),
        "completed_agent_count": resolved_completed_agent_count,
        "valid_vote_count": resolved_valid_vote_count,
        "max_matching_votes": resolved_max_matching_votes,
        "required_votes": resolved_required_votes,
        "consensus_reached": getattr(record, "consensus_reached", False),
        "winner_key": _format_debug_field(_get_debug_field(record, "winner_key")),
        "resolved_by": _format_debug_field(_get_debug_field(record, "resolved_by")),
        "ag4_conflict_rerun_triggered": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_triggered")),
        "ag4_conflict_rerun_attempts": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_attempts")),
        "ag4_conflict_rerun_max_attempts": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_max_attempts")),
        "ag4_conflict_rerun_original_pattern": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_original_pattern")),
        "ag4_conflict_rerun_final_pattern": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_final_pattern")),
        "ag4_conflict_rerun_resolved": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_resolved")),
        "ag4_conflict_rerun_image_source": _format_debug_field(_get_debug_field(record, "ag4_conflict_rerun_image_source")),
        

        "vision_resize_enabled": _format_debug_field(_get_debug_field(record, "vision_resize_enabled")),
        "vision_resize_max_side": _format_debug_field(_get_debug_field(record, "vision_resize_max_side")),
        "vision_resize_applied_mode": _format_debug_field(_get_debug_field(record, "vision_resize_applied_mode")),
        "vision_resize_no_square_for_banknote": _format_debug_field(_get_debug_field(record, "vision_resize_no_square_for_banknote")),

        "ag1_resize_applied": _format_debug_field(_get_debug_field(record, "ag1_resize_applied")),
        "ag1_original_size": _format_debug_field(_get_debug_field(record, "ag1_original_size")),
        "ag1_resized_size": _format_debug_field(_get_debug_field(record, "ag1_resized_size")),
        "ag1_original_bytes": _format_debug_field(_get_debug_field(record, "ag1_original_bytes")),
        "ag1_resized_bytes": _format_debug_field(_get_debug_field(record, "ag1_resized_bytes")),
        "ag1_resize_ratio": _format_debug_field(_get_debug_field(record, "ag1_resize_ratio")),
        "ag1_aspect_ratio_original": _format_debug_field(_get_debug_field(record, "ag1_aspect_ratio_original")),
        "ag1_aspect_ratio_resized": _format_debug_field(_get_debug_field(record, "ag1_aspect_ratio_resized")),
        "ag1_aspect_ratio_delta": _format_debug_field(_get_debug_field(record, "ag1_aspect_ratio_delta")),
        "ag1_resize_error": _format_debug_field(_get_debug_field(record, "ag1_resize_error")),

        "ag2_resize_applied": _format_debug_field(_get_debug_field(record, "ag2_resize_applied")),
        "ag2_original_size": _format_debug_field(_get_debug_field(record, "ag2_original_size")),
        "ag2_resized_size": _format_debug_field(_get_debug_field(record, "ag2_resized_size")),
        "ag2_original_bytes": _format_debug_field(_get_debug_field(record, "ag2_original_bytes")),
        "ag2_resized_bytes": _format_debug_field(_get_debug_field(record, "ag2_resized_bytes")),
        "ag2_resize_ratio": _format_debug_field(_get_debug_field(record, "ag2_resize_ratio")),
        "ag2_aspect_ratio_original": _format_debug_field(_get_debug_field(record, "ag2_aspect_ratio_original")),
        "ag2_aspect_ratio_resized": _format_debug_field(_get_debug_field(record, "ag2_aspect_ratio_resized")),
        "ag2_aspect_ratio_delta": _format_debug_field(_get_debug_field(record, "ag2_aspect_ratio_delta")),
        "ag2_resize_error": _format_debug_field(_get_debug_field(record, "ag2_resize_error")),

        "ag3_resize_applied": _format_debug_field(_get_debug_field(record, "ag3_resize_applied")),
        "ag3_original_size": _format_debug_field(_get_debug_field(record, "ag3_original_size")),
        "ag3_resized_size": _format_debug_field(_get_debug_field(record, "ag3_resized_size")),
        "ag3_original_bytes": _format_debug_field(_get_debug_field(record, "ag3_original_bytes")),
        "ag3_resized_bytes": _format_debug_field(_get_debug_field(record, "ag3_resized_bytes")),
        "ag3_resize_ratio": _format_debug_field(_get_debug_field(record, "ag3_resize_ratio")),
        "ag3_aspect_ratio_original": _format_debug_field(_get_debug_field(record, "ag3_aspect_ratio_original")),
        "ag3_aspect_ratio_resized": _format_debug_field(_get_debug_field(record, "ag3_aspect_ratio_resized")),
        "ag3_aspect_ratio_delta": _format_debug_field(_get_debug_field(record, "ag3_aspect_ratio_delta")),
        "ag3_resize_error": _format_debug_field(_get_debug_field(record, "ag3_resize_error")),

        "file_name": _extract_file_name(record),
        "angle": _extract_angle(record),
        
        "resize_debug": json.dumps(getattr(record, "resize_debug", {}), ensure_ascii=False) if getattr(record, "resize_debug", None) else "",
        "models_used": json.dumps(getattr(record, "models_used", {}), ensure_ascii=False) if getattr(record, "models_used", None) else "",

        "started_at": record.started_at,
        "finished_at": record.finished_at,
        "updated_at": record.updated_at,
        **stale,
    }


def _first_value(source: Dict[str, Any], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        value = source.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _prediction_source(final_result: Dict[str, Any]) -> Dict[str, Any]:
    source = dict(final_result or {})
    detected_objects = source.get("detected_objects") or []
    if detected_objects and isinstance(detected_objects[0], dict):
        first_object = detected_objects[0]
        nested = first_object.get("final_result")
        summary = first_object.get("summary")
        if isinstance(nested, dict):
            source = {**first_object, **nested, **source}
        elif isinstance(summary, dict):
            source = {**first_object, **summary, **source}
        else:
            source = {**first_object, **source}
    return source


def _extract_prediction(final_result: Dict[str, Any]) -> Dict[str, Optional[str]]:
    source = _prediction_source(final_result)
    denomination = _first_value(
        source,
        ("final_denomination", "denomination", "menh_gia"),
    )
    country = _first_value(
        source,
        ("final_country", "country", "quoc_gia"),
    )
    currency = _first_value(
        source,
        ("currency", "currency_code", "loai_tien"),
    )

    if not currency and denomination:
        matches = re.findall(r"\b[A-Za-z]{3}\b", denomination.upper())
        if matches:
            currency = matches[-1]

    return {
        "country": country,
        "currency": currency.upper() if currency else None,
        "denomination": denomination,
    }


def _normalize_text(value: Optional[str]) -> str:
    normalized = _shared_normalize_country(value)
    return normalized or ""


def _normalize_currency(value: Optional[str]) -> str:
    normalized = _shared_normalize_currency(value)
    return normalized or ""


def _normalize_denomination(value: Optional[str]) -> str:
    normalized = _shared_normalize_denomination(value)
    return "" if normalized is None else str(normalized)


ERROR_TYPE_PRIORITY = {
    "rate_limit": 0,
    "auth_error": 1,
    "unsupported_value": 2,
    "invalid_request_error": 3,
    "model_not_found": 4,
    "provider_unavailable": 5,
    "timeout": 6,
    "provider_error": 7,
    "parse_error": 8,
    "invalid_response": 9,
    "no_banknote_detected": 10,
    "partial_result": 11,
    "unknown_error": 12,
}

FATAL_BATCH_ERROR_TYPES = {
    "rate_limit",
    "auth_error",
    "invalid_api_key",
    "missing_api_key",
    "quota_exceeded",
    "unsupported_value",
    "invalid_request_error",
    "model_not_found",
    "provider_config_error",
    "provider_unavailable",
    "provider_unavailable_global",
    "billing_provider_error",
}

NON_FATAL_AG3_ERROR_TYPES = {
    "ag3_timeout",
    "timeout",
    "deadline_exhausted",
    "no_safe_result",
    "partial_result",
    "no_source",
    "insufficient_evidence",
    "weak_lens_evidence",
    "weak_single_lens_evidence",
    "mixed_denomination_lens_evidence",
    "near_top_conflicting_denomination",
    "provider_error",
}


def _safe_excerpt(value: Any, limit: int = 500) -> Optional[str]:
    if value is None:
        return None
    try:
        if isinstance(value, (dict, list)):
            text = json.dumps(value, ensure_ascii=False, default=str)
        else:
            text = str(value)
    except Exception:
        text = str(value)
    text = " ".join(text.replace("\x00", "").split())
    return text[:limit] or None


def _extract_http_status(text: str, source: Optional[Dict[str, Any]] = None) -> Optional[int]:
    if source:
        for key in ("http_status", "status_code", "http_code"):
            try:
                value = int(source.get(key))
                if 100 <= value <= 599:
                    return value
            except (TypeError, ValueError):
                pass
    match = re.search(r"\b(401|403|408|409|429|500|502|503|504)\b", text)
    return int(match.group(1)) if match else None


def _extract_retry_after(text: str, source: Optional[Dict[str, Any]] = None) -> Optional[int]:
    if source:
        for key in ("retry_after", "retry_after_seconds"):
            try:
                value = int(float(source.get(key)))
                if value >= 0:
                    return value
            except (TypeError, ValueError):
                pass
    match = re.search(
        r"retry[\s_-]*after(?:[\s:=]+)(\d+)",
        text,
        flags=re.IGNORECASE,
    )
    return int(match.group(1)) if match else None


def _normalize_error_type(
    text: str,
    status_value: str = "",
    explicit_type: Optional[str] = None,
) -> str:
    combined = " ".join(
        part for part in (str(explicit_type or ""), status_value, text) if part
    ).casefold()
    if any(
        marker in combined
        for marker in (
            "429",
            "quota",
            "rate limit",
            "rate_limit",
            "resource_exhausted",
            "too many requests",
        )
    ):
        return "rate_limit"
    if any(
        marker in combined
        for marker in (
            "timeout",
            "timed out",
            "deadline exceeded",
            "deadline exhausted",
            "deadline_exhausted",
            "408",
        )
    ):
        return "timeout"
    if any(
        marker in combined
        for marker in (
            "authentication",
            "unauthorized",
            "forbidden",
            "api key",
            "api_key",
            "xác thực",
            "401",
            "403",
        )
    ):
        return "auth_error"
    if any(
        marker in combined
        for marker in (
            "unsupported_value",
            "unsupported value",
            "unsupported parameter",
            "does not support",
            "only the default",
        )
    ):
        return "unsupported_value"
    if any(
        marker in combined
        for marker in (
            "model_not_found",
            "model not found",
            "model does not exist",
        )
    ):
        return "model_not_found"
    if any(
        marker in combined
        for marker in (
            "invalid_request_error",
            "invalid request",
            "bad request",
        )
    ):
        return "invalid_request_error"
    if any(
        marker in combined
        for marker in (
            "503",
            "unavailable",
            "high demand",
            "try again later",
            "temporarily unavailable",
            "overloaded",
        )
    ):
        return "provider_unavailable"
    if any(marker in combined for marker in ("parse json", "parse_error", "không parse", "lỗi parse")):
        return "parse_error"
    if any(
        marker in combined
        for marker in (
            "invalid response",
            "invalid_response",
            "invalid json",
            "sai cấu trúc",
            "malformed",
        )
    ):
        return "invalid_response"
    if "no_banknote_detected" in combined or "no banknote" in combined:
        return "no_banknote_detected"
    if "no safe result" in combined or "no_safe_result" in combined:
        return "no_safe_result"
    if "no_source" in combined or "no source" in combined:
        return "no_source"
    if "insufficient_evidence" in combined or "insufficient evidence" in combined:
        return "insufficient_evidence"
    for non_fatal_type in (
        "weak_lens_evidence",
        "weak_single_lens_evidence",
        "mixed_denomination_lens_evidence",
        "near_top_conflicting_denomination",
    ):
        if non_fatal_type in combined:
            return non_fatal_type
    if any(
        marker in combined
        for marker in (
            "502",
            "500",
            "connection",
            "provider",
            "api error",
            "technical_error",
        )
    ):
        return "provider_error"
    if any(
        marker in combined
        for marker in (
            "partial",
            "needs review",
            "needs_review",
            "needs_better_image",
            "consensus_failed",
        )
    ):
        return "partial_result"
    return "unknown_error"


def _fatal_batch_error_type(agent_errors: Dict[str, Any]) -> Optional[str]:
    fatal_errors = [
        error
        for error in (agent_errors or {}).values()
        if isinstance(error, dict)
        and error.get("error_type") in FATAL_BATCH_ERROR_TYPES
    ]
    if not fatal_errors:
        return None
    fatal_errors.sort(
        key=lambda error: ERROR_TYPE_PRIORITY.get(
            error.get("error_type"),
            ERROR_TYPE_PRIORITY["unknown_error"],
        )
    )
    return fatal_errors[0].get("error_type")


def _is_failure_status(status_value: str) -> bool:
    normalized = str(status_value or "").strip().casefold()
    return any(
        marker in normalized
        for marker in ("failed", "error", "timeout", "invalid", "partial")
    )


def _is_valid_agent_status(status_value: str) -> bool:
    statuses = [
        item.strip().casefold()
        for item in str(status_value or "").split("/")
        if item.strip()
    ]
    return bool(statuses) and all(
        status in {"completed", "complete", "success", "succeeded"}
        for status in statuses
    )


def _issue_severity(error_type: Optional[str]) -> Optional[str]:
    if not error_type:
        return None
    if error_type in {"partial_result", "no_banknote_detected"}:
        return "warning"
    return "error"


def _mark_nonfatal_ag3_warning(
    agent_errors: Dict[str, Any],
    *,
    final_completed: bool,
) -> bool:
    if not final_completed:
        return False
    ag3_error = (agent_errors or {}).get("ag3")
    if not isinstance(ag3_error, dict):
        return False
    if ag3_error.get("error_type") not in NON_FATAL_AG3_ERROR_TYPES:
        return False
    ag3_error["severity"] = "warning"
    return True


def _resolve_experiment_pipeline_status(
    *,
    final_completed: bool,
    valid_agent_count: int,
    agent_errors: Dict[str, Any],
) -> tuple[str, bool, bool]:
    has_warning = any(
        error.get("severity") == "warning"
        for error in (agent_errors or {}).values()
        if isinstance(error, dict)
    )
    has_error = any(
        error.get("severity") == "error"
        for error in (agent_errors or {}).values()
        if isinstance(error, dict)
    )
    if not final_completed or has_error:
        status_value = "failed"
    elif has_warning or valid_agent_count < 3:
        status_value = "completed_with_warning"
    else:
        status_value = "completed"
    return status_value, has_warning, has_error


def _agent_error_detail(
    agent_results: List[Dict[str, Any]],
    agent_name: str,
    stage: str,
    default_provider: str,
    duration_ms: int,
) -> Dict[str, Any]:
    matching = [
        item
        for item in agent_results or []
        if str(item.get("agent") or "").casefold() == agent_name.casefold()
    ]
    if not matching:
        return {
            "status": "skipped",
            "error": None,
        }

    statuses = []
    error_sources = []
    for item in matching:
        data = item.get("data") if isinstance(item.get("data"), dict) else item
        status_value = str(data.get("status") or "unknown").strip()
        if status_value not in statuses:
            statuses.append(status_value)
        if (
            _is_failure_status(status_value)
            or data.get("technical_error")
            or data.get("error")
            or data.get("error_message")
            or data.get("fallback_error")
        ):
            error_sources.append(data)

    status_text = " / ".join(statuses) if statuses else "unknown"
    if not error_sources:
        return {"status": status_text, "error": None}

    source = error_sources[0]
    message = _first_value(
        source,
        (
            "error_message",
            "error",
            "message",
            "fallback_error",
            "quan_diem",
            "mo_ta",
            "raw",
        ),
    ) or f"{stage} returned status {status_text}."
    explicit_type = _first_value(source, ("error_type", "type"))
    error_type = _normalize_error_type(message, status_text, explicit_type)
    if stage == "AG3" and error_type == "timeout":
        error_type = "ag3_timeout"
    provider = _first_value(source, ("provider", "model", "model_name"))
    if not provider:
        method = _first_value(source, ("phuong_phap", "method")) or ""
        provider = method or default_provider

    return {
        "status": status_text,
        "error": {
            "stage": stage,
            "error_type": error_type,
            "severity": _issue_severity(error_type),
            "error_message": message[:1000],
            "provider": provider,
            "http_status": _extract_http_status(message, source),
            "retry_after": _extract_retry_after(message, source),
            "duration_ms": duration_ms,
            "raw_excerpt": _safe_excerpt(source),
        },
    }


def _ag0_error_detail(
    pipeline_status: str,
    final_result: Dict[str, Any],
    duration_ms: int,
) -> Dict[str, Any]:
    if str(pipeline_status).casefold() != "no_banknote_detected":
        return {"status": "completed", "error": None}
    rejected = final_result.get("rejected_objects") or []
    first_rejected = rejected[0] if rejected and isinstance(rejected[0], dict) else {}
    message = (
        _first_value(
            first_rejected,
            ("reason", "decision_reason", "error_message"),
        )
        or _first_value(final_result, ("message", "crop_failure_reason"))
        or "No valid banknote crop passed AG0."
    )
    return {
        "status": "rejected",
        "error": {
            "stage": "AG0",
            "error_type": "no_banknote_detected",
            "severity": "warning",
            "error_message": message[:1000],
            "provider": "local_yolo_opencv",
            "http_status": None,
            "retry_after": None,
            "duration_ms": duration_ms,
            "raw_excerpt": _safe_excerpt(first_rejected or final_result),
        },
    }


def _ag4_error_detail(
    pipeline_status: str,
    final_result: Dict[str, Any],
    duration_ms: int,
) -> Dict[str, Any]:
    normalized = str(pipeline_status or "").strip().casefold()
    if normalized in {"completed", "completed_with_limit"}:
        return {"status": pipeline_status, "error": None}
    if normalized == "no_banknote_detected":
        return {"status": "skipped", "error": None}
    message = _first_value(
        final_result,
        ("error_message", "message", "quan_diem_trong_tai", "referee_view"),
    ) or f"Aggregator returned status {pipeline_status}."
    error_type = _normalize_error_type(message, pipeline_status)
    if normalized == "completed_partial":
        error_type = "partial_result"
    return {
        "status": pipeline_status,
        "error": {
            "stage": "AG4",
            "error_type": error_type,
            "severity": _issue_severity(error_type),
            "error_message": message[:1000],
            "provider": "aggregator",
            "http_status": _extract_http_status(message, final_result),
            "retry_after": _extract_retry_after(message, final_result),
            "duration_ms": duration_ms,
            "raw_excerpt": _safe_excerpt(final_result),
        },
    }


def _primary_error(agent_errors: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    errors = [value for value in agent_errors.values() if isinstance(value, dict)]
    if not errors:
        return None
    return sorted(
        errors,
        key=lambda item: (
            0 if item.get("severity") == "error" else 1,
            ERROR_TYPE_PRIORITY.get(
                item.get("error_type"),
                ERROR_TYPE_PRIORITY["unknown_error"],
            ),
        ),
    )[0]


class ExperimentService:
    @staticmethod
    async def start_batch(
        admin: User,
        image_bytes: bytes,
        payload: ExperimentRunInput,
    ) -> Dict[str, Any]:
        completed_count = 0
        if not payload.force_rerun:
            active_count = await ExperimentRun.find(
                {
                    "dataset_id": payload.dataset_id,
                    "image_id": payload.image_id,
                    "status": {"$in": ["queued", "running"]},
                }
            ).count()
            if active_count:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "An experiment for this image is already queued or running. "
                        "Please wait for it to finish."
                    ),
                )

            completed_count = await ExperimentRun.find(
                {
                    "dataset_id": payload.dataset_id,
                    "image_id": payload.image_id,
                    "status": {
                        "$in": [
                            "Completed",
                            "completed",
                            "completed_partial",
                            "completed_with_limit",
                            "completed_with_warning",
                        ]
                    },
                }
            ).count()
            if completed_count >= payload.repeat_count:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This image already has enough completed runs. "
                        "Enable Force rerun to run again."
                    ),
                )

        missing_runs = (
            payload.repeat_count
            if payload.force_rerun
            else payload.repeat_count - completed_count
        )
        first_run_no = 1 if payload.force_rerun else completed_count + 1
        experiment_id = uuid.uuid4().hex
        records = []

        for run_no in range(first_run_no, first_run_no + missing_runs):
            record = ExperimentRun(
                experiment_id=experiment_id,
                dataset_id=payload.dataset_id,
                image_id=payload.image_id,
                run_no=run_no,
                repeat_count=payload.repeat_count,
                admin_id=str(admin.id),
                ground_truth_country=payload.ground_truth_country,
                ground_truth_currency=payload.ground_truth_currency,
                ground_truth_denomination=payload.ground_truth_denomination,
                delay_between_runs=payload.delay_between_runs,
                stop_on_rate_limit=payload.stop_on_rate_limit,
                stop_on_provider_error=payload.stop_on_provider_error,
                force_rerun=payload.force_rerun,
                ag1_model=settings.OPENAI_EXPERIMENT_MODEL,
                ag2_model=settings.GEMINI_EXPERIMENT_MODEL,
                ag3_provider="pending",
                ag4_model="rule_based",
            )
            await record.insert()
            records.append(record)

        job = asyncio.create_task(
            ExperimentService._run_batch(
                admin=admin,
                image_bytes=image_bytes,
                records=records,
                delay_between_runs=payload.delay_between_runs,
                stop_on_rate_limit=payload.stop_on_rate_limit,
                stop_on_provider_error=payload.stop_on_provider_error,
            )
        )
        _BACKGROUND_JOBS.add(job)
        job.add_done_callback(_BACKGROUND_JOBS.discard)

        return {
            "experiment_id": experiment_id,
            "status": "queued",
            "repeat_count": payload.repeat_count,
            "created_run_count": len(records),
            "existing_completed_count": completed_count,
            "delay_between_runs": payload.delay_between_runs,
            "stop_on_rate_limit": payload.stop_on_rate_limit,
            "stop_on_provider_error": payload.stop_on_provider_error,
            "force_rerun": payload.force_rerun,
            "runs": [serialize_experiment_run(record) for record in records],
        }

    @staticmethod
    async def _run_batch(
        admin: User,
        image_bytes: bytes,
        records: List[ExperimentRun],
        delay_between_runs: int,
        stop_on_rate_limit: bool,
        stop_on_provider_error: bool,
    ) -> None:
        for index, record in enumerate(records):
            fresh_record = await ExperimentRun.get(record.id)
            if not fresh_record or fresh_record.status != "queued":
                continue
            record = fresh_record
            error_type = await ExperimentService._run_once(
                admin=admin,
                image_bytes=image_bytes,
                record=record,
            )
            remaining_records = records[index + 1 :]
            if stop_on_rate_limit and error_type == "rate_limit":
                await ExperimentService._stop_remaining_for_rate_limit(
                    remaining_records
                )
                break
            if stop_on_provider_error and error_type in FATAL_BATCH_ERROR_TYPES:
                await ExperimentService._stop_remaining_records(
                    remaining_records,
                    status_value="stopped_provider_error",
                    error_type=error_type or "provider_error",
                    message=(
                        "Experiment stopped after a provider/configuration "
                        f"error ({error_type})."
                    ),
                    severity="error",
                )
                break
            if remaining_records and delay_between_runs > 0:
                await asyncio.sleep(delay_between_runs)

    @staticmethod
    async def _stop_remaining_for_rate_limit(
        records: List[ExperimentRun],
    ) -> None:
        await ExperimentService._stop_remaining_records(
            records,
            status_value="stopped_rate_limit",
            error_type="rate_limit",
            message="Rate limit detected. Experiment stopped to protect provider quota.",
            severity="error",
            http_status=429,
        )

    @staticmethod
    async def _stop_remaining_records(
        records: List[ExperimentRun],
        *,
        status_value: str,
        error_type: str,
        message: str,
        severity: str,
        http_status: Optional[int] = None,
    ) -> int:
        stopped_count = 0
        for record in records:
            fresh_record = await ExperimentRun.get(record.id)
            if not fresh_record or fresh_record.status != "queued":
                continue
            record = fresh_record
            timestamp = now_utc()
            record.status = status_value
            record.ag0_status = "skipped"
            record.ag1_status = "skipped"
            record.ag2_status = "skipped"
            record.ag3_status = "skipped"
            record.ag4_status = "skipped"
            record.error_stage = "batch"
            record.error_type = error_type
            record.error_message = message
            record.field_correct_count = 0
            record.field_total = 3
            record.field_score_pct = 0.0
            record.valid_agent_count = 0
            record.agent_total = 3
            record.agent_vote_pct = 0.0
            record.pipeline_status = status_value
            record.has_warning = severity == "warning"
            record.has_error = severity == "error"
            record.issue_severity = severity
            record.issue_stage = "batch"
            record.issue_type = error_type
            record.issue_message = message
            record.provider = None
            record.http_status = http_status
            record.retry_after = None
            record.raw_excerpt = None
            record.agent_errors = {
                "batch": {
                    "stage": "batch",
                    "error_type": error_type,
                    "severity": severity,
                    "error_message": message,
                    "provider": None,
                    "http_status": http_status,
                    "retry_after": None,
                    "duration_ms": 0,
                    "raw_excerpt": None,
                }
            }
            record.finished_at = timestamp
            record.updated_at = timestamp
            await record.save()
            stopped_count += 1
        return stopped_count

    @staticmethod
    async def stop_remaining_runs(
        *,
        admin: User,
        experiment_id: str,
    ) -> Dict[str, Any]:
        experiment = await ExperimentRun.find_one(
            ExperimentRun.experiment_id == experiment_id.strip()
        )
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment batch not found.")

        queued_records = await ExperimentRun.find(
            {
                "experiment_id": experiment_id.strip(),
                "status": "queued",
            }
        ).to_list()
        stopped_count = await ExperimentService._stop_remaining_records(
            queued_records,
            status_value="stopped_by_admin",
            error_type="cancelled_by_admin",
            message="Remaining experiment runs were stopped by an administrator.",
            severity="warning",
        )
        running_count = await ExperimentRun.find(
            {
                "experiment_id": experiment_id.strip(),
                "status": "running",
            }
        ).count()
        return {
            "experiment_id": experiment_id.strip(),
            "status": "stop_requested",
            "stopped_count": stopped_count,
            "running_count": running_count,
            "requested_by": str(admin.id),
        }

    @staticmethod
    async def _run_once(
        admin: User,
        image_bytes: bytes,
        record: ExperimentRun,
    ) -> Optional[str]:
        started_at = now_utc()
        record.status = "running"
        record.ag0_status = "running"
        record.ag1_status = "waiting"
        record.ag2_status = "waiting"
        record.ag3_status = "waiting"
        record.ag4_status = "waiting"
        record.started_at = started_at
        record.updated_at = started_at
        await record.save()

        try:
            result = await RecognitionService.run_pipeline(
                user=admin,
                image_bytes=image_bytes,
                task=None,
                debug_mode=False,
                experiment_mode=True,
            )
            model_trace = result.get("model_trace") or {}
            record.ag1_model = (
                model_trace.get("ag1_model")
                or record.ag1_model
                or settings.OPENAI_EXPERIMENT_MODEL
            )
            record.ag2_model = (
                model_trace.get("ag2_model")
                or record.ag2_model
                or settings.GEMINI_EXPERIMENT_MODEL
            )
            record.ag3_provider = (
                model_trace.get("ag3_provider")
                or record.ag3_provider
                or "unknown"
            )
            record.ag4_model = (
                model_trace.get("ag4_model")
                or record.ag4_model
                or "rule_based"
            )
            
            record.resize_debug = model_trace.get("resize_debug", {})
            record.models_used = model_trace.get("models_used", {})
            
            final_result = result.get("final_result") or {}
            agent_results = result.get("agent_results") or []
            pipeline_status = str(
                result.get("pipeline_final_status")
                or final_result.get("status")
                or "unknown"
            )

            prediction = _extract_prediction(final_result)
            correctness = calculate_field_correctness(
                ground_truth_country=record.ground_truth_country,
                predicted_country=prediction["country"],
                ground_truth_currency=record.ground_truth_currency,
                predicted_currency=prediction["currency"],
                ground_truth_denomination=record.ground_truth_denomination,
                predicted_denomination=prediction["denomination"],
            )
            country_correct = correctness["country_correct"]
            currency_correct = correctness["currency_correct"]
            denomination_correct = correctness["denomination_correct"]
            correct_count = correctness["field_correct_count"]

            elapsed_ms = int((now_utc() - started_at).total_seconds() * 1000)
            ag0 = _ag0_error_detail(
                pipeline_status,
                final_result,
                elapsed_ms,
            )
            ag1 = _agent_error_detail(
                agent_results,
                "OpenAI",
                "AG1",
                "openai",
                elapsed_ms,
            )
            ag2 = _agent_error_detail(
                agent_results,
                "LLM",
                "AG2",
                "gemini",
                elapsed_ms,
            )
            ag3 = _agent_error_detail(
                agent_results,
                "Lens",
                "AG3",
                "lens",
                elapsed_ms,
            )
            ag4 = _ag4_error_detail(
                pipeline_status,
                final_result,
                elapsed_ms,
            )
            agent_errors = {
                stage: detail["error"]
                for stage, detail in {
                    "ag0": ag0,
                    "ag1": ag1,
                    "ag2": ag2,
                    "ag3": ag3,
                    "ag4": ag4,
                }.items()
                if detail.get("error")
            }
            valid_agent_count = sum(
                _is_valid_agent_status(detail["status"])
                for detail in (ag1, ag2, ag3)
            )
            valid_votes_from_final = final_result.get("valid_votes") or []
            completed_agent_count = _safe_int(
                final_result.get("completed_agent_count"),
                valid_agent_count,
            )
            valid_vote_count = _safe_int(
                final_result.get("valid_vote_count"),
                len(valid_votes_from_final),
            )
            max_matching_votes = _safe_int(
                final_result.get("max_matching_votes"),
                _safe_int(final_result.get("matched_agents"), 0),
            )
            required_votes = _safe_int(final_result.get("required_votes"), 2)
            consensus_reached = bool(final_result.get("consensus_reached"))
            vote_groups = final_result.get("vote_groups") or []
            winner_key = final_result.get("winner_key")
            raw_pipeline_status = str(pipeline_status or "").strip().casefold()
            final_completed = raw_pipeline_status in {
                "completed",
                "completed_partial",
                "completed_with_limit",
            }
            _mark_nonfatal_ag3_warning(
                agent_errors,
                final_completed=final_completed,
            )
            primary_error = _primary_error(agent_errors)
            if final_completed and valid_agent_count < 3 and not primary_error:
                for stage, detail in (("AG1", ag1), ("AG2", ag2), ("AG3", ag3)):
                    if _is_valid_agent_status(detail["status"]):
                        continue
                    synthetic_issue = {
                        "stage": stage,
                        "error_type": "partial_result",
                        "severity": "warning",
                        "error_message": (
                            f"{stage} did not return a fully completed vote "
                            f"(status={detail['status']})."
                        ),
                        "provider": None,
                        "http_status": None,
                        "retry_after": None,
                        "duration_ms": elapsed_ms,
                        "raw_excerpt": None,
                    }
                    detail["error"] = synthetic_issue
                    agent_errors[stage.casefold()] = synthetic_issue
                    primary_error = synthetic_issue
                    break
            normalized_pipeline_status, has_warning, has_error = (
                _resolve_experiment_pipeline_status(
                    final_completed=final_completed,
                    valid_agent_count=valid_agent_count,
                    agent_errors=agent_errors,
                )
            )

            record.predicted_country = prediction["country"]
            record.predicted_currency = prediction["currency"]
            record.predicted_denomination = prediction["denomination"]
            record.normalized_ground_truth_country = correctness[
                "normalized_ground_truth_country"
            ]
            record.normalized_predicted_country = correctness[
                "normalized_predicted_country"
            ]
            record.normalized_ground_truth_currency = correctness[
                "normalized_ground_truth_currency"
            ]
            record.normalized_predicted_currency = correctness[
                "normalized_predicted_currency"
            ]
            record.normalized_ground_truth_denomination = correctness[
                "normalized_ground_truth_denomination"
            ]
            record.normalized_predicted_denomination = correctness[
                "normalized_predicted_denomination"
            ]
            record.country_correct = country_correct
            record.currency_correct = currency_correct
            record.denomination_correct = denomination_correct
            record.correct_count = correct_count
            record.score_pct = correctness["field_score_pct"]
            record.exact_match = correctness["exact_match"]
            record.field_correct_count = correct_count
            record.field_total = correctness["field_total"]
            record.field_score_pct = correctness["field_score_pct"]
            record.valid_agent_count = valid_agent_count
            record.agent_total = 3
            record.agent_vote_pct = round(valid_agent_count / 3 * 100, 2)
            record.completed_agent_count = completed_agent_count
            record.valid_vote_count = valid_vote_count
            record.max_matching_votes = max_matching_votes
            record.required_votes = required_votes
            record.consensus_reached = consensus_reached
            record.vote_groups = vote_groups
            record.winner_key = winner_key
            record.pipeline_status = normalized_pipeline_status
            record.has_warning = has_warning
            record.has_error = has_error
            record.issue_severity = (primary_error or {}).get("severity")
            record.issue_stage = (primary_error or {}).get("stage")
            record.issue_type = (primary_error or {}).get("error_type")
            record.issue_message = (primary_error or {}).get("error_message")
            record.ag0_status = ag0["status"]
            record.ag1_status = ag1["status"]
            record.ag2_status = ag2["status"]
            record.ag3_status = ag3["status"]
            record.ag4_status = ag4["status"]
            record.ag0_error_type = (ag0.get("error") or {}).get("error_type")
            record.ag0_error_message = (ag0.get("error") or {}).get("error_message")
            record.ag1_error_type = (ag1.get("error") or {}).get("error_type")
            record.ag1_error_message = (ag1.get("error") or {}).get("error_message")
            record.ag2_error_type = (ag2.get("error") or {}).get("error_type")
            record.ag2_error_message = (ag2.get("error") or {}).get("error_message")
            record.ag3_error_type = (ag3.get("error") or {}).get("error_type")
            record.ag3_error_message = (ag3.get("error") or {}).get("error_message")
            record.ag4_error_type = (ag4.get("error") or {}).get("error_type")
            record.ag4_error_message = (ag4.get("error") or {}).get("error_message")
            record.agent_errors = agent_errors
            record.status = pipeline_status
            record.error_stage = (primary_error or {}).get("stage")
            record.error_type = (primary_error or {}).get("error_type")
            record.error_message = (primary_error or {}).get("error_message")
            record.provider = (primary_error or {}).get("provider")
            record.http_status = (primary_error or {}).get("http_status")
            record.retry_after = (primary_error or {}).get("retry_after")
            record.raw_excerpt = (primary_error or {}).get("raw_excerpt")
        except Exception as exc:
            error_message = str(exc)[:1000]
            error_type = _normalize_error_type(
                error_message,
                exc.__class__.__name__,
            )
            record.status = "technical_error"
            record.ag0_status = (
                "error" if record.ag0_status == "running" else record.ag0_status
            )
            record.ag1_status = (
                "not_completed"
                if record.ag1_status in {"waiting", "running"}
                else record.ag1_status
            )
            record.ag2_status = (
                "not_completed"
                if record.ag2_status in {"waiting", "running"}
                else record.ag2_status
            )
            record.ag3_status = (
                "not_completed"
                if record.ag3_status in {"waiting", "running"}
                else record.ag3_status
            )
            record.ag4_status = "not_completed"
            record.error_stage = "pipeline"
            record.error_type = error_type
            record.error_message = error_message
            record.field_correct_count = 0
            record.field_total = 3
            record.field_score_pct = 0.0
            record.valid_agent_count = 0
            record.agent_total = 3
            record.agent_vote_pct = 0.0
            record.pipeline_status = "failed"
            record.has_warning = False
            record.has_error = True
            record.issue_severity = "error"
            record.issue_stage = "pipeline"
            record.issue_type = error_type
            record.issue_message = error_message
            record.provider = None
            record.http_status = _extract_http_status(error_message)
            record.retry_after = _extract_retry_after(error_message)
            record.raw_excerpt = _safe_excerpt(error_message)
        finally:
            finished_at = now_utc()
            record.duration_ms = int(
                (finished_at - started_at).total_seconds() * 1000
            )
            record.finished_at = finished_at
            record.updated_at = finished_at
            await record.save()
        return _fatal_batch_error_type(record.agent_errors) or record.error_type

    @staticmethod
    def build_query(
        dataset_id: Optional[str] = None,
        image_id: Optional[str] = None,
        status: Optional[str] = None,
        experiment_id: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {}
        if dataset_id:
            query["dataset_id"] = dataset_id.strip()
        if image_id:
            query["image_id"] = image_id.strip()
        if status:
            normalized_status = status.strip().casefold()
            if normalized_status == "stale":
                query["status"] = {"$in": ["queued", "running"]}
                query["updated_at"] = {
                    "$lte": now_utc() - timedelta(minutes=STALE_RUN_MINUTES)
                }
            elif normalized_status == "completed":
                query["status"] = {"$in": ["Completed", "completed"]}
            elif normalized_status == "completed_with_warning":
                query["pipeline_status"] = "completed_with_warning"
            elif normalized_status == "partial":
                query["$or"] = [
                    {"status": {"$in": ["Partial", "partial", "completed_partial"]}},
                    {"pipeline_status": "completed_partial"},
                ]
            elif normalized_status == "failed":
                query["$or"] = [
                    {
                        "status": {
                            "$in": [
                                "Failed",
                                "failed",
                                "technical_error",
                                "agent_error",
                                "consensus_failed",
                            ]
                        }
                    },
                    {"pipeline_status": "failed"},
                ]
            else:
                query["status"] = status.strip()
        if experiment_id:
            query["experiment_id"] = experiment_id.strip()
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            query["created_at"] = date_query
        return query

    @staticmethod
    async def list_runs(
        *,
        dataset_id: Optional[str] = None,
        image_id: Optional[str] = None,
        status: Optional[str] = None,
        experiment_id: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, Any]:
        query = ExperimentService.build_query(
            dataset_id=dataset_id,
            image_id=image_id,
            status=status,
            experiment_id=experiment_id,
            date_from=date_from,
            date_to=date_to,
        )
        cursor = ExperimentRun.find(query)
        total = await cursor.count()
        records = await (
            ExperimentRun.find(query)
            .sort("-created_at")
            .skip(offset)
            .limit(limit)
            .to_list()
        )
        return {
            "items": [serialize_experiment_run(record) for record in records],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @staticmethod
    async def export_runs(
        *,
        dataset_id: Optional[str] = None,
        image_id: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> BytesIO:
        query = ExperimentService.build_query(
            dataset_id=dataset_id,
            image_id=image_id,
            date_from=date_from,
            date_to=date_to,
        )
        records = await ExperimentRun.find(query).sort("created_at").to_list()
        rows = [serialize_experiment_run(record) for record in records]
        return _build_workbook(rows)


RUN_HEADERS = [
    "experiment_id",
    "dataset_id",
    "image_id",
    "run_no",
    "repeat_count",
    "admin_id",
    "ground_truth_country",
    "ground_truth_currency",
    "ground_truth_denomination",
    "predicted_country",
    "predicted_currency",
    "predicted_denomination",
    "normalized_ground_truth_country",
    "normalized_predicted_country",
    "normalized_ground_truth_currency",
    "normalized_predicted_currency",
    "normalized_ground_truth_denomination",
    "normalized_predicted_denomination",
    "country_correct",
    "currency_correct",
    "denomination_correct",
    "correct_count",
    "score_pct",
    "field_correct_count",
    "field_total",
    "field_score_pct",
    "exact_match",
    "valid_agent_count",
    "agent_total",
    "agent_vote_pct",
    "completed_agent_count",
    "valid_vote_count",
    "max_matching_votes",
    "required_votes",
    "consensus_reached",
    "ag1_model",
    "ag2_model",
    "ag3_provider",
    "ag4_model",
    "pipeline_status",
    "has_warning",
    "has_error",
    "issue_severity",
    "issue_stage",
    "issue_type",
    "issue_message",
    "ag0_status",
    "ag1_status",
    "ag2_status",
    "ag3_status",
    "ag4_status",
    "ag0_error_type",
    "ag0_error_message",
    "ag1_error_type",
    "ag1_error_message",
    "ag2_error_type",
    "ag2_error_message",
    "ag3_error_type",
    "ag3_error_message",
    "ag4_error_type",
    "ag4_error_message",
    "status",
    "error_stage",
    "error_type",

    "error_message",
    "consensus_pattern",
    "ag0_crop_used",
    "ag2_final_model",
    "ag3_provider_used",
    "ag3_groq_formatter_used",
    "ag4_conflict_rerun_triggered",

    "provider",
    "http_status",
    "retry_after",
    "raw_excerpt",
    "duration_ms",
    "delay_between_runs",
    "stop_on_rate_limit",
    "stop_on_provider_error",
    "force_rerun",

    "ag0_crop_used",
    "ag0_original_fallback_used",
    "fallback_reason",
    "image_used_by_ag1",
    "image_used_by_ag2",
    "image_used_by_ag3",
    "crop_quality_issues",
    "ag2_model_chain_used",
    "ag2_model_attempts",
    "ag2_final_model",
    "ag2_fallback_reason",
    "ag3_provider_chain_enabled",
    "ag3_primary_provider",
    "ag3_fallback_provider",
    "ag3_provider_used",
    "ag3_provider_trace",
    "ag3_primary_status",
    "ag3_fallback_status",
    "ag3_fallback_triggered",
    "ag3_fallback_reason",
    "ag3_selenium_skipped_reason",
    "ag3_groq_formatter_enabled",
    "ag3_groq_formatter_used",
    "ag3_groq_model_used",
    "ag3_groq_trace",
    "ag3_evidence_count",
    "ag3_validation_errors",
    "ag3_not_counted_in_consensus_reason",
    "consensus_pattern",
    "matched_count",
    "completed_agent_count",
    "valid_vote_count",
    "max_matching_votes",
    "required_votes",
    "consensus_reached",
    "winner_key",
    "resolved_by",
    "ag4_conflict_rerun_triggered",
    "ag4_conflict_rerun_attempts",
    "ag4_conflict_rerun_max_attempts",
    "ag4_conflict_rerun_original_pattern",
    "ag4_conflict_rerun_final_pattern",
    "ag4_conflict_rerun_resolved",
    "ag4_conflict_rerun_image_source",
    "file_name",

    "vision_resize_enabled",
    "vision_resize_max_side",
    "vision_resize_applied_mode",
    "vision_resize_no_square_for_banknote",
    
    "ag1_resize_applied",
    "ag1_original_size",
    "ag1_resized_size",
    "ag1_original_bytes",
    "ag1_resized_bytes",
    "ag1_resize_ratio",
    "ag1_aspect_ratio_original",
    "ag1_aspect_ratio_resized",
    "ag1_aspect_ratio_delta",
    "ag1_resize_error",
    
    "ag2_resize_applied",
    "ag2_original_size",
    "ag2_resized_size",
    "ag2_original_bytes",
    "ag2_resized_bytes",
    "ag2_resize_ratio",
    "ag2_aspect_ratio_original",
    "ag2_aspect_ratio_resized",
    "ag2_aspect_ratio_delta",
    "ag2_resize_error",
    
    "ag3_resize_applied",
    "ag3_original_size",
    "ag3_resized_size",
    "ag3_original_bytes",
    "ag3_resized_bytes",
    "ag3_resize_ratio",
    "ag3_aspect_ratio_original",
    "ag3_aspect_ratio_resized",
    "ag3_aspect_ratio_delta",
    "ag3_resize_error",

    "angle",
    "resize_debug",
    "models_used",
    "created_at",
]

ERROR_HEADERS = [
    "dataset_id",
    "image_id",
    "run_no",
    "agent_key",
    "status",
    "pipeline_status",
    "severity",
    "issue_stage",
    "issue_type",
    "issue_message",
    "error_stage",
    "error_type",

    "error_message",
    "consensus_pattern",
    "ag0_crop_used",
    "ag2_final_model",
    "ag3_provider_used",
    "ag3_groq_formatter_used",
    "ag4_conflict_rerun_triggered",

    "provider",
    "http_status",
    "retry_after",
    "duration_ms",

    "ag0_crop_used",
    "ag0_original_fallback_used",
    "fallback_reason",
    "image_used_by_ag1",
    "image_used_by_ag2",
    "image_used_by_ag3",
    "crop_quality_issues",
    "ag2_model_chain_used",
    "ag2_model_attempts",
    "ag2_final_model",
    "ag2_fallback_reason",
    "ag3_provider_chain_enabled",
    "ag3_primary_provider",
    "ag3_fallback_provider",
    "ag3_provider_used",
    "ag3_provider_trace",
    "ag3_primary_status",
    "ag3_fallback_status",
    "ag3_fallback_triggered",
    "ag3_fallback_reason",
    "ag3_selenium_skipped_reason",
    "ag3_groq_formatter_enabled",
    "ag3_groq_formatter_used",
    "ag3_groq_model_used",
    "ag3_groq_trace",
    "ag3_evidence_count",
    "ag3_validation_errors",
    "ag3_not_counted_in_consensus_reason",
    "consensus_pattern",
    "matched_count",
    "completed_agent_count",
    "valid_vote_count",
    "max_matching_votes",
    "required_votes",
    "consensus_reached",
    "winner_key",
    "resolved_by",
    "ag4_conflict_rerun_triggered",
    "ag4_conflict_rerun_attempts",
    "ag4_conflict_rerun_max_attempts",
    "ag4_conflict_rerun_original_pattern",
    "ag4_conflict_rerun_final_pattern",
    "ag4_conflict_rerun_resolved",
    "ag4_conflict_rerun_image_source",
    "file_name",

    "vision_resize_enabled",
    "vision_resize_max_side",
    "vision_resize_applied_mode",
    "vision_resize_no_square_for_banknote",
    
    "ag1_resize_applied",
    "ag1_original_size",
    "ag1_resized_size",
    "ag1_original_bytes",
    "ag1_resized_bytes",
    "ag1_resize_ratio",
    "ag1_aspect_ratio_original",
    "ag1_aspect_ratio_resized",
    "ag1_aspect_ratio_delta",
    "ag1_resize_error",
    
    "ag2_resize_applied",
    "ag2_original_size",
    "ag2_resized_size",
    "ag2_original_bytes",
    "ag2_resized_bytes",
    "ag2_resize_ratio",
    "ag2_aspect_ratio_original",
    "ag2_aspect_ratio_resized",
    "ag2_aspect_ratio_delta",
    "ag2_resize_error",
    
    "ag3_resize_applied",
    "ag3_original_size",
    "ag3_resized_size",
    "ag3_original_bytes",
    "ag3_resized_bytes",
    "ag3_resize_ratio",
    "ag3_aspect_ratio_original",
    "ag3_aspect_ratio_resized",
    "ag3_aspect_ratio_delta",
    "ag3_resize_error",

    "angle",
    "resize_debug",
    "models_used",
    "created_at",
]


def _summary_rows(
    rows: List[Dict[str, Any]],
    key_fields: List[str],
) -> List[Dict[str, Any]]:
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row.get(field) for field in key_fields)].append(row)

    summaries = []
    for key, items in sorted(groups.items(), key=lambda item: str(item[0])):
        run_count = len(items)
        summaries.append(
            {
                **dict(zip(key_fields, key)),
                "run_count": run_count,
                "exact_match_count": sum(bool(item.get("exact_match")) for item in items),
                "exact_match_rate_pct": round(
                    sum(bool(item.get("exact_match")) for item in items)
                    / max(run_count, 1)
                    * 100,
                    2,
                ),
                "avg_score_pct": round(
                    sum(
                        float(
                            item.get("field_score_pct")
                            if item.get("field_score_pct") is not None
                            else item.get("score_pct") or 0
                        )
                        for item in items
                    )
                    / max(run_count, 1),
                    2,
                ),
                "country_accuracy_pct": round(
                    sum(bool(item.get("country_correct")) for item in items)
                    / max(run_count, 1)
                    * 100,
                    2,
                ),
                "currency_accuracy_pct": round(
                    sum(bool(item.get("currency_correct")) for item in items)
                    / max(run_count, 1)
                    * 100,
                    2,
                ),
                "denomination_accuracy_pct": round(
                    sum(bool(item.get("denomination_correct")) for item in items)
                    / max(run_count, 1)
                    * 100,
                    2,
                ),

                "issue_count": sum(bool(item.get("has_error") or item.get("has_warning") or item.get("issue_type")) for item in items),
                "ag0_fallback_count": sum(bool(item.get("ag0_original_fallback_used")) for item in items),
                "ag2_fallback_count": sum(bool(item.get("ag2_fallback_reason")) for item in items),
                "ag3_fallback_count": sum(bool(item.get("ag3_fallback_triggered")) for item in items),
                "ag3_groq_used_count": sum(bool(item.get("ag3_groq_formatter_used")) for item in items),
                "ag4_rerun_triggered_count": sum(bool(item.get("ag4_conflict_rerun_triggered")) for item in items),
                "ag4_rerun_resolved_count": sum(bool(item.get("ag4_conflict_rerun_resolved")) for item in items),
            }
        )
    return summaries


def _column_name(index: int) -> str:
    value = index
    result = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _cell_xml(reference: str, value: Any, header: bool = False) -> str:
    style = ' s="1"' if header else ""
    if value is None:
        return f'<c r="{reference}"{style} t="inlineStr"><is><t></t></is></c>'
    if isinstance(value, bool):
        return f'<c r="{reference}"{style} t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{reference}"{style}><v>{value}</v></c>'
    if isinstance(value, datetime):
        value = value.isoformat()
    text = escape(str(value))
    return (
        f'<c r="{reference}"{style} t="inlineStr">'
        f"<is><t>{text}</t></is></c>"
    )


def _sheet_xml(headers: List[str], rows: List[Dict[str, Any]]) -> str:
    xml_rows = []
    header_cells = [
        _cell_xml(f"{_column_name(index)}1", header, header=True)
        for index, header in enumerate(headers, start=1)
    ]
    xml_rows.append(f'<row r="1">{"".join(header_cells)}</row>')

    for row_index, row in enumerate(rows, start=2):
        cells = [
            _cell_xml(
                f"{_column_name(column_index)}{row_index}",
                row.get(header),
            )
            for column_index, header in enumerate(headers, start=1)
        ]
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    last_column = _column_name(max(len(headers), 1))
    last_row = max(len(rows) + 1, 1)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:{last_column}{last_row}"/>'
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        "</sheetView></sheetViews>"
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        '<autoFilter ref="A1:'
        f'{last_column}{last_row}"/>'
        "</worksheet>"
    )



def _build_workbook(rows: List[Dict[str, Any]]) -> BytesIO:
    angle_rows = _summary_rows(rows, ["dataset_id", "angle", "ag1_model", "ag2_model"])
    image_rows = _summary_rows(rows, ["dataset_id", "image_id", "file_name", "angle"])
    dataset_rows = _summary_rows(rows, ["dataset_id"])

    error_rows = []
    for row in rows:
        agent_errors = row.get("agent_errors") or {}
        if isinstance(agent_errors, dict) and agent_errors:
            for agent_key, issue in agent_errors.items():
                if not isinstance(issue, dict):
                    continue
                stage = issue.get("stage") or str(agent_key).upper()
                message = issue.get("error_message")
                error_rows.append(
                    {
                        **row,
                        "agent_key": agent_key,
                        "severity": issue.get("severity"),
                        "issue_stage": stage,
                        "issue_type": issue.get("error_type"),
                        "issue_message": message,
                        "error_stage": stage,
                        "error_type": issue.get("error_type"),
                        "error_message": message,
                        "provider": issue.get("provider"),
                        "http_status": issue.get("http_status"),
                        "retry_after": issue.get("retry_after"),
                        "duration_ms": issue.get("duration_ms") or row.get("duration_ms"),
                    }
                )
            continue

        if (
            not row.get("exact_match")
            or row.get("status") != "Completed"
            or row.get("issue_type")
        ):

            error_rows.append(
                {
                    **row,
                    "agent_key": None,
                    "severity": row.get("issue_severity"),
                }
            )


    angle_headers = [
        "dataset_id",
    
    "vision_resize_enabled",
    "vision_resize_max_side",
    "vision_resize_applied_mode",
    "vision_resize_no_square_for_banknote",
    
    "ag1_resize_applied",
    "ag1_original_size",
    "ag1_resized_size",
    "ag1_original_bytes",
    "ag1_resized_bytes",
    "ag1_resize_ratio",
    "ag1_aspect_ratio_original",
    "ag1_aspect_ratio_resized",
    "ag1_aspect_ratio_delta",
    "ag1_resize_error",
    
    "ag2_resize_applied",
    "ag2_original_size",
    "ag2_resized_size",
    "ag2_original_bytes",
    "ag2_resized_bytes",
    "ag2_resize_ratio",
    "ag2_aspect_ratio_original",
    "ag2_aspect_ratio_resized",
    "ag2_aspect_ratio_delta",
    "ag2_resize_error",
    
    "ag3_resize_applied",
    "ag3_original_size",
    "ag3_resized_size",
    "ag3_original_bytes",
    "ag3_resized_bytes",
    "ag3_resize_ratio",
    "ag3_aspect_ratio_original",
    "ag3_aspect_ratio_resized",
    "ag3_aspect_ratio_delta",
    "ag3_resize_error",

    "angle",
        "ag1_model",
        "ag2_model",
        "run_count",
        "exact_match_count",
        "exact_match_rate_pct",
        "avg_score_pct",
        "country_accuracy_pct",
        "currency_accuracy_pct",
        "denomination_accuracy_pct",
        "issue_count",
        "ag0_fallback_count",
        "ag2_fallback_count",
        "ag3_fallback_count",
        "ag3_groq_used_count",
        "ag4_rerun_triggered_count",
        "ag4_rerun_resolved_count",
    ]
    image_headers = [
        "dataset_id",
        "image_id",
        "file_name",
    
    "vision_resize_enabled",
    "vision_resize_max_side",
    "vision_resize_applied_mode",
    "vision_resize_no_square_for_banknote",
    
    "ag1_resize_applied",
    "ag1_original_size",
    "ag1_resized_size",
    "ag1_original_bytes",
    "ag1_resized_bytes",
    "ag1_resize_ratio",
    "ag1_aspect_ratio_original",
    "ag1_aspect_ratio_resized",
    "ag1_aspect_ratio_delta",
    "ag1_resize_error",
    
    "ag2_resize_applied",
    "ag2_original_size",
    "ag2_resized_size",
    "ag2_original_bytes",
    "ag2_resized_bytes",
    "ag2_resize_ratio",
    "ag2_aspect_ratio_original",
    "ag2_aspect_ratio_resized",
    "ag2_aspect_ratio_delta",
    "ag2_resize_error",
    
    "ag3_resize_applied",
    "ag3_original_size",
    "ag3_resized_size",
    "ag3_original_bytes",
    "ag3_resized_bytes",
    "ag3_resize_ratio",
    "ag3_aspect_ratio_original",
    "ag3_aspect_ratio_resized",
    "ag3_aspect_ratio_delta",
    "ag3_resize_error",

    "angle",
    "resize_debug",
    "models_used",
        "run_count",
        "exact_match_count",
        "exact_match_rate_pct",
        "avg_score_pct",
        "denomination_accuracy_pct",
        "issue_count",
        "ag0_fallback_count",
        "ag2_fallback_count",
        "ag3_groq_used_count",
        "ag4_rerun_triggered_count",
        "ag4_rerun_resolved_count",
    ]
    dataset_headers = [
        "dataset_id",
        "run_count",
        "exact_match_count",
        "exact_match_rate_pct",
        "avg_score_pct",
        "country_accuracy_pct",
        "currency_accuracy_pct",
        "denomination_accuracy_pct",
        "issue_count",
        "ag0_fallback_count",
        "ag2_fallback_count",
        "ag3_fallback_count",
        "ag3_groq_used_count",
        "ag4_rerun_triggered_count",
        "ag4_rerun_resolved_count",
    ]
    sheets = [
        ("experiment_runs", RUN_HEADERS, rows),
        ("summary_by_angle", angle_headers, angle_rows),
        ("summary_by_image", image_headers, image_rows),
        ("summary_by_dataset", dataset_headers, dataset_rows),
        ("errors", ERROR_HEADERS, error_rows),
    ]

    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for index in range(1, len(sheets) + 1)
            )
            + "</Types>",
        )
        workbook.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        workbook.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            + "".join(
                f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
                for index, (name, _, _) in enumerate(sheets, start=1)
            )
            + "</sheets></workbook>",
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
                for index in range(1, len(sheets) + 1)
            )
            + f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            + "</Relationships>",
        )
        workbook.writestr(
            "xl/styles.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2"><font/><font><b/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border/></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="2">'
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            "</cellXfs></styleSheet>",
        )
        for index, (_, headers, sheet_rows) in enumerate(sheets, start=1):
            workbook.writestr(
                f"xl/worksheets/sheet{index}.xml",
                _sheet_xml(headers, sheet_rows),
            )

    output.seek(0)
    return output
