import json
from collections import Counter
from typing import Any, Dict, List

from app.utils.currency_normalizer import normalize_agent_vote


# Thông điệp terminal khi hết lượt retry mà vẫn không đồng thuận.
NEEDS_BETTER_IMAGE_MESSAGE = (
    "Không đủ đồng thuận giữa các AI agent sau nhiều lần thử. "
    "Vui lòng chụp lại tờ tiền ở góc rõ hơn, đủ sáng, "
    "không bị lóa, và thấy toàn bộ tờ tiền."
)


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
    - Only finalize when at least 2 valid agents agree on vote_key.
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
        if not agent_data:
            continue

        status = str(agent_data.get("status") or "").strip().lower()
        if status == "failed":
            continue

        norm_vote = normalize_agent_vote(agent_data)
        norm_vote["agent_key"] = agent_key
        
        # Chỉ lấy các vote có ít nhất country hoặc denomination hợp lệ
        if norm_vote["vote_key"] is not None or norm_vote["country"] is not None:
            valid_votes.append(norm_vote)

    if not valid_votes:
        return {
            "require_rerun": False,
            "method": "majority_vote",
            "status": "Failed",
            "matched_agents": 0,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_country": None,
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "country": "Không xác định",
            "final_agent": None,
            "valid_votes": [],
            "quan_diem_trong_tai": "Không có Agent nào trả về kết quả hợp lệ. Cần quét lại hoặc kiểm tra thủ công.",
        }

    # Đếm vote country
    country_counter = Counter([v["country"] for v in valid_votes if v["country"]])
    final_country = country_counter.most_common(1)[0][0] if country_counter else "Không xác định"
    country_matched_count = country_counter.most_common(1)[0][1] if country_counter else 0

    # Đếm vote denomination
    key_counter = Counter([v["vote_key"] for v in valid_votes if v["vote_key"]])
    winner_key, matched_count = key_counter.most_common(1)[0] if key_counter else (None, 0)

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
        # Ưu tiên lấy Agent 2 (llm_api) để có JSON đầy đủ (mô tả, quan điểm, năm, chất liệu, v.v)
        final_vote = next(
            (v for v in winning_votes if v["agent_key"] == "llm_api"),
            winning_votes[0]
        )

        winner_data = _clone_agent(final_vote["agent_data"])
        winner_data["menh_gia"] = final_denomination
        winner_data["final_denomination"] = final_denomination
        winner_data["quoc_gia"] = winner_country
        winner_data["country"] = winner_country
        winner_data["final_country"] = winner_country
        winner_data["currency_code"] = winner_currency
        winner_data["ma_tien_te"] = winner_currency
        
        winner_data["require_rerun"] = False
        winner_data["method"] = "majority_vote"
        winner_data["status"] = "Completed"
        winner_data["matched_agents"] = matched_count
        winner_data["so_luong_dong_thuan"] = matched_count
        winner_data["final_agent"] = final_vote["agent_key"]
        winner_data["valid_votes"] = valid_votes
        winner_data["quan_diem_trong_tai"] = (
            f"Đạt đồng thuận ({matched_count}/3). "
            f"Quyết định chọn: {final_denomination} ({winner_country})."
        )
        return winner_data

    # Không đạt đồng thuận denomination
    resolved_country = final_country if country_matched_count >= 2 else "Không xác định"
    
    if is_final_attempt:
        return {
            "require_rerun": False,
            "method": "majority_vote",
            "status": "needs_better_image",
            "matched_agents": 0,
            "so_luong_dong_thuan": 0,
            "final_denomination": None,
            "final_country": resolved_country,
            "quoc_gia": resolved_country,
            "ma_tien_te": "Không xác định",
            "country": resolved_country,
            "final_agent": None,
            "valid_votes": valid_votes,
            "quan_diem_trong_tai": NEEDS_BETTER_IMAGE_MESSAGE + f" (Các Agent trả về: {vote_values_str})",
        }

    return {
        "require_rerun": True,
        "method": "majority_vote",
        "status": "Conflict",
        "matched_agents": 0,
        "so_luong_dong_thuan": 0,
        "final_denomination": None,
        "final_country": resolved_country,
        "quoc_gia": resolved_country,
        "ma_tien_te": "Không xác định",
        "country": resolved_country,
        "final_agent": None,
        "valid_votes": valid_votes,
        "quan_diem_trong_tai": (
            f"Mâu thuẫn kết quả giữa các Agent hợp lệ ({vote_values_str}). "
            "Không đủ đồng thuận để chốt kết quả. Cần phân tích lại."
        ),
    }
