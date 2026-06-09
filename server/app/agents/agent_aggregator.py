import json
import re
from collections import Counter
from typing import Any, Dict, List, Optional


# Thông điệp terminal khi hết lượt retry mà vẫn không đồng thuận.
NEEDS_BETTER_IMAGE_MESSAGE = (
    "Không đủ đồng thuận giữa các AI agent sau nhiều lần thử. "
    "Vui lòng chụp lại tờ tiền ở góc rõ hơn, đủ sáng, "
    "không bị lóa, và thấy toàn bộ tờ tiền."
)


INVALID_VALUES = {
    "",
    "lỗi",
    "loi",
    "error",
    "failed",
    "fail",
    "n/a",
    "na",
    "unknown",
    "không xác định",
    "khong xac dinh",
    "none",
    "null",
}


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


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _is_invalid_value(value: Any) -> bool:
    text = _normalize_text(value)
    return text in INVALID_VALUES or "lỗi" == text or text.startswith("lỗi ")


def normalize_denomination(value: Any) -> Optional[str]:
    """
    Normalize denominations so "2000 VNĐ", "2.000 đồng", "2000 VND"
    become "2000 VND".
    """
    if value is None:
        return None

    original_text = str(value).strip()
    text = original_text.lower()

    if _is_invalid_value(text):
        return None

    text = text.replace("vnđ", "vnd")
    text = text.replace("đồng", "vnd")
    text = text.replace("dong", "vnd")
    text = text.replace("đ", "vnd")
    text = re.sub(r"\s+", " ", text)

    number_match = re.search(r"[\d,.]+", text)
    if not number_match:
        return None

    number = number_match.group(0).replace(",", "").replace(".", "")

    try:
        number_int = int(number)
    except ValueError:
        return None

    currency_match = re.search(
        r"\b(vnd|usd|thb|sgd|myr|idr|php|khr|lak|mmk|bnd|eur|jpy|cny)\b",
        text,
    )

    if currency_match:
        return f"{number_int} {currency_match.group(1).upper()}"

    if "việt nam" in text or "viet nam" in text:
        return f"{number_int} VND"

    # If no currency is found, keep the number only.
    return str(number_int)


def _extract_agent_denomination(agent: Dict[str, Any]) -> Any:
    return (
        agent.get("menh_gia")
        or agent.get("denomination")
        or agent.get("result")
    )


def _extract_agent_country(agent: Dict[str, Any]) -> Any:
    return (
        agent.get("quoc_gia")
        or agent.get("country")
    )


def _is_valid_agent_result(agent: Dict[str, Any]) -> bool:
    if not agent:
        return False

    status = _normalize_text(agent.get("status"))

    if status == "failed":
        return False

    raw_denomination = _extract_agent_denomination(agent)
    normalized = normalize_denomination(raw_denomination)

    if normalized is None:
        return False

    country = _extract_agent_country(agent)

    if _is_invalid_value(country):
        return False

    return True


def _clone_agent(agent: Dict[str, Any]) -> Dict[str, Any]:
    return dict(agent) if isinstance(agent, dict) else {}


async def run_aggregator(
    json_1: str,
    json_2: str,
    json_3: str,
    is_final_attempt: bool = False,
) -> dict:
    """
    Rule-based majority vote.

    Important:
    - Do not call Gemini here.
    - Do not select Agent 1 by default.
    - Only finalize when at least 2 valid agents agree.
    - is_final_attempt=True: nếu vẫn conflict → trả needs_better_image (terminal, no retry).
    - is_final_attempt=False: nếu conflict → trả require_rerun=True để caller retry.
    """
    agents = {
        "ml_dl": _safe_parse(json_1),
        "llm_api": _safe_parse(json_2),
        "visual_search": _safe_parse(json_3),
    }

    valid_votes: List[Dict[str, Any]] = []

    for agent_key, agent_data in agents.items():
        if not _is_valid_agent_result(agent_data):
            continue

        normalized_denomination = normalize_denomination(
            _extract_agent_denomination(agent_data)
        )

        valid_votes.append({
            "agent": agent_key,
            "denomination": normalized_denomination,
            "country": _extract_agent_country(agent_data),
            "raw": agent_data,
        })

    if not valid_votes:
        return {
            "require_rerun": False,
            "method": "majority_vote",
            "status": "Failed",
            "matched_agents": 0,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_agent": None,
            "valid_votes": [],
            "quan_diem_trong_tai": "Không có Agent nào trả về kết quả hợp lệ. Cần quét lại hoặc kiểm tra thủ công.",
        }

    counter = Counter([vote["denomination"] for vote in valid_votes])
    final_denomination, matched_count = counter.most_common(1)[0]

    if matched_count >= 2:
        final_vote = next(
            vote for vote in valid_votes
            if vote["denomination"] == final_denomination
        )

        winner_data = _clone_agent(final_vote["raw"])
        winner_data["menh_gia"] = final_denomination
        winner_data["require_rerun"] = False
        winner_data["method"] = "majority_vote"
        winner_data["status"] = "Completed"
        winner_data["matched_agents"] = matched_count
        winner_data["so_luong_dong_thuan"] = matched_count
        winner_data["final_denomination"] = final_denomination
        winner_data["final_agent"] = final_vote["agent"]
        winner_data["valid_votes"] = valid_votes
        winner_data["quan_diem_trong_tai"] = (
            f"Đạt đồng thuận ({matched_count}/3). "
            f"Quyết định chọn: {final_denomination}."
        )
        return winner_data

    vote_values = ", ".join([vote["denomination"] for vote in valid_votes])

    if is_final_attempt:
        # Hết lượt retry → trả terminal state, không retry thêm.
        return {
            "require_rerun": False,
            "method": "majority_vote",
            "status": "needs_better_image",
            "matched_agents": 0,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_agent": None,
            "valid_votes": valid_votes,
            "quan_diem_trong_tai": NEEDS_BETTER_IMAGE_MESSAGE,
        }

    return {
        "require_rerun": True,
        "method": "majority_vote",
        "status": "Conflict",
        "matched_agents": 1,
        "so_luong_dong_thuan": 1,
        "final_denomination": None,
        "final_agent": None,
        "valid_votes": valid_votes,
        "quan_diem_trong_tai": (
            f"Mâu thuẫn kết quả giữa các Agent hợp lệ ({vote_values}). "
            "Không đủ đồng thuận để chốt kết quả. Cần phân tích lại."
        ),
    }
