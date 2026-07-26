import json
from collections import Counter
from typing import Any, Dict, List, Optional

from app.utils.currency_normalizer import normalize_agent_vote


# Thông điệp terminal khi hết lượt retry mà vẫn không đồng thuận.
NEEDS_BETTER_IMAGE_MESSAGE = (
    "Không đủ đồng thuận giữa các AI agent sau nhiều lần thử. "
    "Vui lòng chụp lại tờ tiền ở góc rõ hơn, đủ sáng, "
    "không bị lóa, và thấy toàn bộ tờ tiền."
)

TECHNICAL_OR_CONFLICTING_EVIDENCE_MESSAGE = (
    "Không đủ đồng thuận do tác tử kỹ thuật bị lỗi hoặc bằng chứng mâu thuẫn. "
    "Vui lòng kiểm tra thủ công hoặc thử lại."
)

# Status values that disqualify a vote for ALL agents.
# Agents returning any of these statuses are excluded from the consensus pool.
NON_VOTING_STATUSES: frozenset = frozenset({
    "failed",
    "partial",
    "disabled",
    "error",
    "technical_error",
    "technical error",
    "no_source",
    "no source",
    "unknown",
    "none",
    "null",
    "not_found",
    "not found",
    "needs_better_image",
    "not_banknote_or_unclear",
})

TRANSIENT_ERROR_KEYWORDS = [
    "timeout",
    "timed out",
    "read timed out",
    "connection",
    "network",
    "quota",
    "rate limit",
    "resource_exhausted",
    "503",
    "unavailable",
    "api error",
    "provider unavailable",
    "serpapi",
    "gemini",
    "openai",
]

FIXED_PROVIDER_CONFIG_ERROR_TYPES: frozenset = frozenset({
    "missing_api_key",
    "provider_config_missing",
})

AG3_WEAK_NONVOTING_ERROR_TYPES: frozenset = frozenset({
    "amount_not_allowed",
    "candidate_lens_identity_conflict",
    "conflicting_denominations_in_lens_evidence",
    "conflicting_evidence",
    "identity_incomplete",
    "insufficient_direct_title_or_snippet_support",
    "insufficient_evidence",
    "insufficient_independent_evidence",
    "insufficient_support_signals",
    "mixed_denomination_lens_evidence",
    "near_top_conflicting_denomination",
    "no_lens_evidence",
    "no_source",
    "no_strong_evidence",
    "noise_only",
    "page_text_support_required_for_two_sources",
    "weak_source_only",
    "weak_single_lens_evidence",
})

TRANSIENT_PROVIDER_ERROR_TYPES: frozenset = frozenset({
    "network_error",
    "provider_quota_exhausted",
    "provider_unavailable",
    "quota_or_rate_limit",
    "rate_limit",
    "technical_error",
    "timeout",
})

REQUIRED_CONSENSUS_VOTES = 2

def is_transient_agent_error(agent_data: dict) -> bool:
    text = " ".join([
        str(agent_data.get("status", "")),
        str(agent_data.get("mo_ta", "")),
        str(agent_data.get("quan_diem", "")),
        str(agent_data.get("error", "")),
        str(agent_data.get("phuong_phap", "")),
    ]).lower()

    return any(keyword in text for keyword in TRANSIENT_ERROR_KEYWORDS)


def _agent_error_type(agent_data: Any) -> str:
    if not isinstance(agent_data, dict):
        return ""
    return str(agent_data.get("error_type") or "").strip().casefold()


def _agent_status(agent_data: Any) -> str:
    if not isinstance(agent_data, dict):
        return ""
    return str(agent_data.get("status") or "").strip().casefold()


def _has_fixed_provider_config_error(agent_data: Any) -> bool:
    if not isinstance(agent_data, dict):
        return False
    return _agent_error_type(agent_data) in FIXED_PROVIDER_CONFIG_ERROR_TYPES


def _has_transient_provider_error(agent_data: Any) -> bool:
    if not isinstance(agent_data, dict):
        return False
    error_type = _agent_error_type(agent_data)
    if error_type in FIXED_PROVIDER_CONFIG_ERROR_TYPES:
        return False
    if error_type in TRANSIENT_PROVIDER_ERROR_TYPES:
        return True
    if bool(agent_data.get("technical_error")) and error_type not in AG3_WEAK_NONVOTING_ERROR_TYPES:
        return True
    return _agent_status(agent_data) in {"agent_error", "technical_error"}


def _is_ag3_weak_nonvoting(agent_data: Any) -> bool:
    if not isinstance(agent_data, dict):
        return False
    error_type = _agent_error_type(agent_data)
    status = _agent_status(agent_data)
    if error_type in TRANSIENT_PROVIDER_ERROR_TYPES:
        return False
    if error_type in AG3_WEAK_NONVOTING_ERROR_TYPES:
        return True
    return bool(agent_data.get("not_counted_in_consensus")) and status in NON_VOTING_STATUSES


def should_early_stop_fixed_provider_config_single_valid_vote(
    final_consensus: Dict[str, Any],
    agents: Dict[str, Any],
) -> bool:
    """Return True when another retry cannot change a fixed config failure."""
    if not isinstance(final_consensus, dict) or not isinstance(agents, dict):
        return False
    if final_consensus.get("consensus_pattern") != "1-valid-only":
        return False
    valid_votes = final_consensus.get("valid_votes") or []
    if len(valid_votes) != 1:
        return False
    if not any(_has_fixed_provider_config_error(agent) for agent in agents.values()):
        return False
    if any(_has_transient_provider_error(agent) for agent in agents.values()):
        return False
    return _is_ag3_weak_nonvoting(
        agents.get("visual_search") or agents.get("ag3") or agents.get("agent3")
    )

def classify_consensus_pattern(agents: Dict[str, Any], valid_votes: List[Dict[str, Any]], matched_count: int) -> str:
    if matched_count >= 2:
        return f"{matched_count}/3"

    vote_keys = [
        tuple(v.get("vote_key"))
        for v in valid_votes
        if v.get("vote_key") is not None
    ]

    unique_vote_keys = set(vote_keys)

    if not valid_votes:
        transient_count = sum(
            1 for data in agents.values()
            if data and is_transient_agent_error(data)
        )

        if transient_count >= 1:
            return "transient_error"

        return "not_banknote_or_unclear"

    if len(vote_keys) == 1:
        return "1-valid-only"

    if len(unique_vote_keys) >= 2:
        return "-".join("1" for _ in vote_keys)

    return "conflict"


def _safe_parse(data_str: Any) -> Dict[str, Any]:
    try:
        if isinstance(data_str, dict):
            return data_str

        parsed = json.loads(data_str)

        if isinstance(parsed, list):
            return parsed[0] if parsed else {}

        if isinstance(parsed, dict):
            return parsed

        return {}
    except Exception:
        return {}


def _clone_agent(agent: Dict[str, Any]) -> Dict[str, Any]:
    return dict(agent) if isinstance(agent, dict) else {}


def _safe_float(value: Any) -> Optional[float]:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _build_suggested_result_from_valid_vote(
    valid_votes: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if len(valid_votes) != 1:
        return None
    vote = valid_votes[0]
    agent_data = vote.get("agent_data") if isinstance(vote.get("agent_data"), dict) else {}
    return {
        "country": vote.get("country"),
        "currency_code": vote.get("currency_code"),
        "amount": vote.get("amount"),
        "agent_key": vote.get("agent_key"),
        "confidence": _safe_float(
            agent_data.get("do_tin_cay")
            if agent_data.get("do_tin_cay") is not None
            else agent_data.get("confidence")
        ),
    }


def _has_technical_or_conflicting_evidence(agents: Dict[str, Any]) -> bool:
    technical_error_types = {
        "missing_api_key",
        "provider_config_missing",
        "provider_auth_error",
        "technical_error",
        "provider_unavailable",
        "provider_quota_exhausted",
        "timeout",
    }
    conflict_error_types = {
        "conflicting_evidence",
        "conflicting_denominations_in_lens_evidence",
        "candidate_lens_identity_conflict",
    }
    for agent_data in agents.values():
        if not isinstance(agent_data, dict):
            continue
        status = str(agent_data.get("status") or "").strip().casefold()
        error_type = str(agent_data.get("error_type") or "").strip().casefold()
        reason_text = " ".join(
            str(agent_data.get(key) or "")
            for key in ("reason", "quan_diem", "mo_ta")
        ).casefold()
        if bool(agent_data.get("technical_error")):
            return True
        if status in {"technical_error", "agent_error"}:
            return True
        if error_type in technical_error_types or error_type in conflict_error_types:
            return True
        if "conflict" in reason_text or "mâu thuẫn" in reason_text or "mau thuan" in reason_text:
            return True
    return False


def _completed_agent_count(agents: Dict[str, Any]) -> int:
    return sum(
        1
        for agent_data in agents.values()
        if _agent_status(agent_data) in {"completed", "complete", "success", "succeeded"}
    )


def _build_vote_groups(valid_votes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[Any, Dict[str, Any]] = {}
    for vote in valid_votes:
        key = vote.get("vote_key")
        if key is None:
            continue
        group = groups.setdefault(
            tuple(key),
            {
                "vote_key": list(key),
                "count": 0,
                "agent_keys": [],
                "reported_countries": [],
                "canonical_country": vote.get("country"),
                "currency_code": vote.get("currency_code"),
                "denomination": vote.get("amount"),
            },
        )
        group["count"] += 1
        group["agent_keys"].append(vote.get("agent_key"))
        if vote.get("raw_country") is not None:
            group["reported_countries"].append(vote.get("raw_country"))
    return sorted(groups.values(), key=lambda item: item["count"], reverse=True)


async def run_aggregator(
    json_1: str,
    json_2: str,
    json_3: str,
) -> dict:
    """
    Rule-based majority vote.
    """
    agents = {
        "ml_dl": _safe_parse(json_1),
        "llm_api": _safe_parse(json_2),
        "visual_search": _safe_parse(json_3),
    }

    valid_votes: List[Dict[str, Any]] = []

    for agent_key, agent_data in agents.items():
        if not agent_data:
            continue

        # --- Gate 1: non-voting status (applies to ALL agents) ---
        status = str(agent_data.get("status") or "").strip().lower()
        if status in NON_VOTING_STATUSES:
            continue

        # --- Gate 2: not_counted_in_consensus flag ---
        if bool(agent_data.get("not_counted_in_consensus")):
            continue

        # --- Gate 3: visual_search gets additional error_type check ---
        if agent_key == "visual_search":
            error_type = str(agent_data.get("error_type") or "").strip().lower()
            if error_type in NON_VOTING_STATUSES:
                continue

        norm_vote = normalize_agent_vote(agent_data)
        norm_vote["agent_key"] = agent_key

        # --- Gate 4: require full vote_key (country + currency + amount) ---
        # Country-only or denomination-only votes are NOT counted in consensus.
        if norm_vote["vote_key"] is not None:
            valid_votes.append(norm_vote)


    # Đếm vote country
    country_counter = Counter([v["country"] for v in valid_votes if v["country"]])
    final_country = country_counter.most_common(1)[0][0] if country_counter else "Không xác định"
    country_matched_count = country_counter.most_common(1)[0][1] if country_counter else 0

    # Đếm vote denomination
    key_counter = Counter([v["vote_key"] for v in valid_votes if v["vote_key"]])
    winner_key, matched_count = key_counter.most_common(1)[0] if key_counter else (None, 0)
    vote_groups = _build_vote_groups(valid_votes)
    valid_vote_count = len(valid_votes)
    completed_agent_count = _completed_agent_count(agents)
    consensus_reached = matched_count >= REQUIRED_CONSENSUS_VOTES

    pattern = classify_consensus_pattern(agents, valid_votes, matched_count)

    # Format debug string
    raw_vote_info = []
    for v in valid_votes:
        raw_denom = v.get("raw_denomination") or "None"
        raw_country = v.get("raw_country") or "None"
        raw_vote_info.append(f"{v['agent_key']}: {raw_country} | {raw_denom}")
    vote_values_str = ", ".join(raw_vote_info)

    if matched_count >= 2 and winner_key is not None:
        winner_country, winner_currency, winner_amount = winner_key
        final_denomination = f"{winner_amount} {winner_currency}"

        # Lọc ra các vote thuộc phe thắng
        winning_votes = [v for v in valid_votes if v["vote_key"] == winner_key]
        # Ưu tiên lấy Agent 2 (llm_api) hoặc Agent 1 (openai_api) để có JSON đầy đủ
        final_vote = next(
            (v for v in winning_votes if v["agent_key"] in ("llm_api", "openai_api", "ml_dl")),
            winning_votes[0]
        )

        matched_agents_keys = [v["agent_key"] for v in winning_votes]
        consensus_reason = f"{matched_count}/3 agreement"

        winner_data = _clone_agent(final_vote["agent_data"])
        winner_data["menh_gia"] = final_denomination
        winner_data["final_denomination"] = final_denomination
        winner_data["quoc_gia"] = winner_country
        winner_data["country"] = winner_country
        winner_data["final_country"] = winner_country
        winner_data["currency_code"] = winner_currency
        winner_data["ma_tien_te"] = winner_currency

        winner_data["method"] = "majority_vote"
        winner_data["status"] = "Completed"
        winner_data["matched_agents"] = matched_count
        winner_data["max_matching_votes"] = matched_count
        winner_data["required_votes"] = REQUIRED_CONSENSUS_VOTES
        winner_data["valid_vote_count"] = valid_vote_count
        winner_data["completed_agent_count"] = completed_agent_count
        winner_data["consensus_reached"] = consensus_reached
        winner_data["so_luong_dong_thuan"] = matched_count
        winner_data["final_agent"] = final_vote["agent_key"]
        winner_data["matched_agents_keys"] = matched_agents_keys
        winner_data["valid_votes"] = valid_votes
        winner_data["vote_groups"] = vote_groups
        winner_data["consensus_pattern"] = pattern
        winner_data["winner_key"] = list(winner_key)
        winner_data["consensus_reason"] = consensus_reason
        winner_data["quan_diem_trong_tai"] = (
            f"Đạt đồng thuận ({matched_count}/3). "
            f"Quyết định chọn: {final_denomination} ({winner_country})."
        )
        return winner_data


    # Không đạt đồng thuận denomination
    resolved_country = final_country if country_matched_count >= 2 else "Không xác định"

    if pattern == "transient_error":
        return {
            "method": "majority_vote",
            "status": "technical_error",
            "matched_agents": 0,
            "max_matching_votes": matched_count,
            "required_votes": REQUIRED_CONSENSUS_VOTES,
            "valid_vote_count": valid_vote_count,
            "completed_agent_count": completed_agent_count,
            "consensus_reached": False,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_country": resolved_country,
            "quoc_gia": resolved_country,
            "ma_tien_te": "Không xác định",
            "country": resolved_country,
            "final_agent": None,
            "valid_votes": valid_votes,
            "vote_groups": vote_groups,
            "consensus_pattern": pattern,
            "winner_key": None,
            "consensus_reason": "technical_error",
            "quan_diem_trong_tai": "Các agent bị lỗi kỹ thuật (timeout/API error). Cần chạy lại.",
        }

    if pattern in ("0/3", "not_banknote_or_unclear", "zero_evidence"):
        return {
            "method": "majority_vote",
            "status": "needs_better_image",
            "matched_agents": 0,
            "max_matching_votes": matched_count,
            "required_votes": REQUIRED_CONSENSUS_VOTES,
            "valid_vote_count": valid_vote_count,
            "completed_agent_count": completed_agent_count,
            "consensus_reached": False,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_country": resolved_country,
            "quoc_gia": resolved_country,
            "ma_tien_te": "Không xác định",
            "country": resolved_country,
            "final_agent": None,
            "valid_votes": valid_votes,
            "vote_groups": vote_groups,
            "consensus_pattern": pattern,
            "winner_key": None,
            "consensus_reason": "no_reliable_evidence",
            "quan_diem_trong_tai": "Không có agent nào nhận diện được tiền giấy hợp lệ. Crop có thể là nền, vật thể lạ hoặc ảnh quá mờ.",
        }

    # 1-valid-only hoặc conflict/mâu thuẫn
    if len(valid_votes) == 1:
        insufficient_reason = "insufficient_valid_votes"
    elif len(valid_votes) >= 2:
        insufficient_reason = "insufficient_valid_votes"
    else:
        insufficient_reason = "no_reliable_evidence"

    suggested_result = _build_suggested_result_from_valid_vote(valid_votes)
    has_mixed_review_cause = (
        pattern == "1-valid-only"
        and suggested_result is not None
        and _has_technical_or_conflicting_evidence(agents)
    )
    if has_mixed_review_cause:
        insufficient_reason = "technical_or_conflicting_evidence"
        referee_message = TECHNICAL_OR_CONFLICTING_EVIDENCE_MESSAGE
    else:
        referee_message = (
            f"Mâu thuẫn kết quả giữa các Agent hợp lệ ({vote_values_str}). "
            "Không đủ đồng thuận để chốt kết quả. Cần phân tích lại."
        )

    result = {
        "method": "majority_vote",
        "status": "Conflict",
        "matched_agents": matched_count,
        "max_matching_votes": matched_count,
        "required_votes": REQUIRED_CONSENSUS_VOTES,
        "valid_vote_count": valid_vote_count,
        "completed_agent_count": completed_agent_count,
        "consensus_reached": False,
        "so_luong_dong_thuan": matched_count,
        "final_denomination": None,
        "final_country": resolved_country,
        "quoc_gia": resolved_country,
        "ma_tien_te": "Không xác định",
        "country": resolved_country,
        "final_agent": None,
        "valid_votes": valid_votes,
        "vote_groups": vote_groups,
        "consensus_pattern": pattern,
        "winner_key": list(winner_key) if winner_key else None,
        "consensus_reason": insufficient_reason,
        "quan_diem_trong_tai": referee_message,
        "referee_view": referee_message,
    }
    if suggested_result is not None:
        result["suggested_result_from_valid_agent"] = suggested_result
    return result
