import re
from typing import Any, Dict, List, Optional, Tuple


COUNTRY_CURRENCY = {
    "vietnam": ("Việt Nam", "VND"),
    "viet nam": ("Việt Nam", "VND"),
    "việt nam": ("Việt Nam", "VND"),
    "vn": ("Việt Nam", "VND"),
    "vnd": ("Việt Nam", "VND"),
    "đồng": ("Việt Nam", "VND"),
    "dong": ("Việt Nam", "VND"),

    "thailand": ("Thái Lan", "THB"),
    "thai": ("Thái Lan", "THB"),
    "thái lan": ("Thái Lan", "THB"),
    "baht": ("Thái Lan", "THB"),
    "thb": ("Thái Lan", "THB"),

    "laos": ("Lào", "LAK"),
    "lao": ("Lào", "LAK"),
    "lào": ("Lào", "LAK"),
    "kip": ("Lào", "LAK"),
    "lak": ("Lào", "LAK"),

    "cambodia": ("Campuchia", "KHR"),
    "campuchia": ("Campuchia", "KHR"),
    "riel": ("Campuchia", "KHR"),
    "khr": ("Campuchia", "KHR"),

    "myanmar": ("Myanmar", "MMK"),
    "kyat": ("Myanmar", "MMK"),
    "mmk": ("Myanmar", "MMK"),

    "malaysia": ("Malaysia", "MYR"),
    "ringgit": ("Malaysia", "MYR"),
    "myr": ("Malaysia", "MYR"),

    "singapore": ("Singapore", "SGD"),
    "sgd": ("Singapore", "SGD"),

    "indonesia": ("Indonesia", "IDR"),
    "rupiah": ("Indonesia", "IDR"),
    "idr": ("Indonesia", "IDR"),

    "philippines": ("Philippines", "PHP"),
    "philippine": ("Philippines", "PHP"),
    "peso": ("Philippines", "PHP"),
    "php": ("Philippines", "PHP"),

    "brunei": ("Brunei", "BND"),
    "bnd": ("Brunei", "BND"),

    "timor": ("Timor-Leste", "USD"),
    "timor-leste": ("Timor-Leste", "USD"),
    "usd": ("Timor-Leste", "USD"),
}

CURRENCY_ALIASES = {
    "vnđ": "VND",
    "đồng": "VND",
    "dong": "VND",
    "vnd": "VND",
    "baht": "THB",
    "thb": "THB",
    "kip": "LAK",
    "lak": "LAK",
    "riel": "KHR",
    "khr": "KHR",
    "kyat": "MMK",
    "mmk": "MMK",
    "ringgit": "MYR",
    "myr": "MYR",
    "sgd": "SGD",
    "rupiah": "IDR",
    "idr": "IDR",
    "peso": "PHP",
    "php": "PHP",
    "bnd": "BND",
    "usd": "USD",
}

BANKNOTE_KEYWORDS = [
    "banknote",
    "banknotes",
    "currency",
    "paper money",
    "money",
    "note",
    "tiền giấy",
    "mệnh giá",
    "tiền",
    "đồng",
    "baht",
    "riel",
    "kip",
    "kyat",
    "ringgit",
    "rupiah",
    "peso",
]

NEGATIVE_KEYWORDS = [
    "wallet",
    "toy",
    "poster",
    "vector",
    "template",
    "clipart",
    "coin",
    "exchange rate",
    "forex",
    "converter",
    "shop",
    "buy",
    "sell",
    "auction",
]

TRUSTED_SOURCES = [
    "wikipedia.org",
    "banknoteworld",
    "numista",
    "centralbank",
    "central-bank",
    "mas.gov.sg",
    "bot.or.th",
    "sbv.gov.vn",
    "nbc.gov.kh",
    "bsp.gov.ph",
    "bnm.gov.my",
    "bi.go.id",
]


def _text(item: Dict[str, Any]) -> str:
    return f"{item.get('title', '')} {item.get('snippet', '')} {item.get('source', '')} {item.get('url', '')}".lower()


def _clean_number(value: str) -> Optional[int]:
    try:
        return int(value.replace(".", "").replace(",", "").replace(" ", ""))
    except Exception:
        return None


def _extract_amounts(text: str) -> List[int]:
    found = []

    # Bắt số mệnh giá kiểu 500,000 / 500.000 / 500000 / 1,000
    for raw in re.findall(r"\b\d{1,3}(?:[.,]\d{3}){1,3}\b|\b\d{2,7}\b", text):
        n = _clean_number(raw)
        if n is None:
            continue

        # Loại bớt năm
        if 1800 <= n <= 2100:
            continue

        if n > 0:
            found.append(n)

    # unique preserving order
    output = []
    for n in found:
        if n not in output:
            output.append(n)

    return output


def _extract_currency(text: str) -> Optional[str]:
    lower = text.lower()

    for alias, code in CURRENCY_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", lower) or alias in lower:
            return code

    return None


def _extract_country_currency(text: str) -> Tuple[str, Optional[str]]:
    lower = text.lower()

    for key, (country, currency) in COUNTRY_CURRENCY.items():
        if key in lower:
            return country, currency

    return "Không xác định", None


def _guess_material(country: str, denomination: str) -> str:
    text = f"{country} {denomination}".lower()

    if "việt nam" in text or "vnd" in text:
        nums = re.findall(r"\d+", denomination)
        if nums and int(nums[0]) >= 10000:
            return "Polymer"

    if any(k in text for k in ["singapore", "sgd", "malaysia", "myr"]):
        return "Polymer / Giấy"

    return "Không xác định"


def _score_item(item: Dict[str, Any], context: str = "") -> Dict[str, Any]:
    text = _text(item)
    source = str(item.get("source", "")).lower()

    score = 0.0
    reasons = []

    if item.get("bucket") == "exact_match":
        score += 3.0
        reasons.append("exact_match")

    if item.get("bucket") == "visual_match":
        score += 2.0
        reasons.append("visual_match")

    for kw in BANKNOTE_KEYWORDS:
        if kw in text:
            score += 1.2
            reasons.append(f"keyword:{kw}")
            break

    currency = _extract_currency(text)
    if currency:
        score += 2.5
        reasons.append(f"currency:{currency}")

    country, expected_currency = _extract_country_currency(text)
    if country != "Không xác định":
        score += 2.0
        reasons.append(f"country:{country}")

    amounts = _extract_amounts(text)
    if amounts:
        score += 1.8
        reasons.append(f"amount:{amounts[0]}")

    if any(src in source for src in TRUSTED_SOURCES):
        score += 1.5
        reasons.append("trusted_source")

    for neg in NEGATIVE_KEYWORDS:
        if neg in text:
            score -= 2.0
            reasons.append(f"negative:{neg}")

    if context:
        context_lower = context.lower()
        for amount in amounts:
            if str(amount) in context_lower:
                score += 1.0
                reasons.append("context_amount_match")
                break

        if currency and currency.lower() in context_lower:
            score += 1.0
            reasons.append("context_currency_match")

    item = dict(item)
    item["score"] = round(max(0.0, score), 4)
    item["rank_reasons"] = reasons
    item["detected_country"] = country
    item["detected_currency"] = currency or expected_currency
    item["detected_amounts"] = amounts
    return item


def rank_lens_evidence(evidence: List[Dict[str, Any]], context: str = "") -> List[Dict[str, Any]]:
    ranked = [_score_item(item, context=context) for item in evidence]
    ranked.sort(key=lambda item: item.get("score", 0.0), reverse=True)
    return ranked


def _choose_final_candidate(ranked_evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
    votes: Dict[str, Dict[str, Any]] = {}

    for item in ranked_evidence:
        score = float(item.get("score", 0.0) or 0.0)

        country = item.get("detected_country") or "Không xác định"
        currency = item.get("detected_currency")
        amounts = item.get("detected_amounts") or []

        if country == "Không xác định" and not currency:
            continue

        if not amounts:
            key = f"{country}|unknown|{currency or ''}"
            votes.setdefault(
                key,
                {
                    "country": country,
                    "amount": None,
                    "currency": currency,
                    "score": 0.0,
                    "items": [],
                },
            )
            votes[key]["score"] += score * 0.4
            votes[key]["items"].append(item)
            continue

        for amount in amounts[:3]:
            key = f"{country}|{amount}|{currency or ''}"
            votes.setdefault(
                key,
                {
                    "country": country,
                    "amount": amount,
                    "currency": currency,
                    "score": 0.0,
                    "items": [],
                },
            )
            votes[key]["score"] += score
            votes[key]["items"].append(item)

    if not votes:
        return {
            "country": "Không xác định",
            "amount": None,
            "currency": None,
            "score": 0.0,
            "items": [],
        }

    return max(votes.values(), key=lambda item: item["score"])


def _confidence(total_score: float, evidence_count: int) -> float:
    if total_score <= 0:
        return 0.15

    # Cap vì Lens/Selenium là external evidence, không nên tự tin tuyệt đối.
    conf = 0.25 + min(0.6, total_score / 18.0)

    if evidence_count >= 3:
        conf += 0.05

    return round(min(0.88, max(0.15, conf)), 4)


def build_banknote_result_from_evidence(
    ranked_evidence: List[Dict[str, Any]],
    method: str = "Google Lens Selenium v2",
    image_url: str = "",
    max_evidence: int = 5,
) -> Dict[str, Any]:
    top = ranked_evidence[:max_evidence]
    candidate = _choose_final_candidate(top)

    country = candidate.get("country") or "Không xác định"
    amount = candidate.get("amount")
    currency = candidate.get("currency")

    if amount and currency:
        denomination = f"{amount} {currency}"
    elif amount:
        denomination = str(amount)
    else:
        denomination = "Không xác định"

    total_score = float(candidate.get("score", 0.0) or 0.0)
    matched_items = candidate.get("items") or []
    confidence = _confidence(total_score, len(matched_items))

    visible_text = []
    features = []

    for item in top:
        title = item.get("title")
        if title and title not in visible_text:
            visible_text.append(title[:160])

        for reason in item.get("rank_reasons", []):
            if reason not in features:
                features.append(reason)

    if country == "Không xác định" or denomination == "Không xác định":
        status = "Partial"
        description = (
            "Google Lens Selenium thu thập được evidence nhưng chưa đủ mạnh để xác định chắc quốc gia/mệnh giá."
        )
    else:
        status = "Completed" if confidence >= 0.45 else "Partial"
        description = (
            f"Google Lens Selenium tìm thấy evidence liên quan đến {country} {denomination}."
        )

    viewpoint = (
        f"Chọn kết quả dựa trên {len(top)} evidence đã rank. "
        f"Tổng điểm candidate: {total_score:.2f}. "
        f"Top evidence: "
        + "; ".join(
            [
                f"{item.get('title', '')[:80]} ({item.get('source', '')}, score={item.get('score', 0)})"
                for item in top[:3]
            ]
        )
    )

    return {
        "quoc_gia": country,
        "menh_gia": denomination,
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": _guess_material(country, denomination),
        "mo_ta": description,
        "quan_diem": viewpoint,
        "phuong_phap": method,
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": visible_text[:10],
        "dac_diem_chinh": features[:12],
        "status": status,
        "provider": "selenium",
        "image_url": image_url,
        "evidence": top,
        "total_evidence": len(ranked_evidence),
    }
