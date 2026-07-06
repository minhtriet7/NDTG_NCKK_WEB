import json
import requests
import asyncio
import html
import ipaddress
import inspect
import re
import time
import unicodedata
from typing import Optional, List, Dict, Any, Callable, Awaitable
from urllib.parse import urlparse

from app.core.config import settings
from app.agents.agent_2_llm import (
    JSON_TEMPLATE,
    get_gemini_client,
    clean_json,
    MODEL_LLM_MAIN,
)
from app.agents.base_agent import BaseAgent
from app.services.agent3_formatter_router import run_agent3_formatter
from app.services.groq_evidence_reader_service import (
    read_evidence_with_groq,
    reconcile_ag3_evidence,
    should_call_groq_evidence_reader,
    GROQ_AVAILABLE as GROQ_EVIDENCE_READER_AVAILABLE,
)
from app.utils.currency_normalizer import normalize_agent_vote
from google.genai import types # 🌟 THÊM IMPORT NÀY ĐỂ ÉP KIỂU JSON


CURRENCY_ALIASES = {
    "VND": [
        "vnd", "vnđ", "₫", "vietnamese dong", "viet nam dong",
        "đồng việt nam", "việt nam đồng",
        "dong", "dong banknote", "vietnamese dong banknote",
        "viet nam dong banknote",
    ],
    "USD": [
        "usd", "us dollar", "u.s. dollar", "$",
        "đôla mỹ", "đô la mỹ",
    ],
    "EUR": ["eur", "euro", "euros", "€"],
    "JPY": ["jpy", "yen", "yên", "¥"],
    "CNY": ["cny", "yuan", "renminbi", "rmb"],
    "KRW": ["krw", "won", "₩"],
    "THB": ["thb", "baht", "฿"],
    "MYR": ["myr", "ringgit"],
    "SGD": ["sgd", "singapore dollar"],
    "IDR": ["idr", "rupiah"],
    "PHP": ["php", "peso", "philippine peso"],
    "KHR": ["khr", "riel"],
    "LAK": ["lak", "kip"],
    "MMK": ["mmk", "kyat"],
    "GBP": ["gbp", "pound", "pounds", "pound sterling", "sterling", "£"],
    "AUD": ["aud", "australian dollar"]
}

COUNTRY_ALIASES = {
    "Vietnam": ["vietnam", "viet nam", "việt nam"],
    "United States": [
        "united states", "united states of america", "usa", "u.s.", "us",
        "american", "hoa kỳ", "mỹ", "benjamin franklin", "đôla", "đô la",
        "đôla mỹ", "đô la mỹ", "one dollar", "one dollar bill",
    ],
    "Japan": ["japan", "nhật bản", "yen", "yên", "jpy", "¥"],
    "China": ["china", "trung quốc", "yuan", "renminbi"],
    "South Korea": ["korea", "south korea", "hàn quốc", "won", "krw", "₩"],
    "Thailand": ["thailand", "thái lan", "baht", "฿"],
    "Myanmar": ["myanmar", "burma", "kyat"],
    "Cambodia": ["cambodia", "campuchia", "riel"],
    "Laos": ["laos", "lào", "kip"],
    "Malaysia": ["malaysia", "ringgit"],
    "Singapore": ["singapore", "singapore dollar"],
    "Indonesia": ["indonesia", "rupiah"],
    "Philippines": ["philippines", "philippine peso"],
    "European Union": ["european union", "eurozone", "euro", "euros", "eur", "€"],
    "United Kingdom": ["united kingdom", "uk", "british", "pound", "pounds", "sterling", "gbp", "£"],
}

UNKNOWN_IDENTITY = "Không xác định"
AGENT3_DEFAULT_BUDGET_SECONDS = 32.0
PAGE_TEXT_MAX_URLS = 2
PAGE_TEXT_TIMEOUT_SECONDS = 2.5
PAGE_TEXT_EXCERPT_MAX_CHARS = 2200
PAGE_TEXT_FETCH_BYTES_LIMIT = 200000
PAGE_TEXT_MIN_BUDGET_SECONDS = 5.0
FORMATTER_MIN_BUDGET_SECONDS = 3.0
FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS = 2.5
RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS = 10.0
CANDIDATE_VERIFICATION_BUDGET_SECONDS = RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
CANDIDATE_SEARCH_QUERY_LIMIT = 2
CANDIDATE_SEARCH_RESULTS_PER_QUERY = 5
SERPAPI_RATE_LIMIT_MARKERS = (
    "429",
    "run out of searches",
    "quota",
    "rate limit",
    "rate_limit",
    "too many requests",
)


class SerpApiProviderError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        error_type: str = "provider_error",
        status_code: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code


def _serpapi_no_cache_enabled() -> bool:
    return bool(getattr(settings, "AGENT3_SERPAPI_NO_CACHE", False))


def _classify_serpapi_error(
    error: Any,
    *,
    status_code: Optional[int] = None,
) -> str:
    explicit_type = str(getattr(error, "error_type", "") or "").strip().lower()
    if explicit_type in {"rate_limit", "provider_quota_exhausted"}:
        return explicit_type
    message = str(error or "").casefold()
    if status_code == 429 or any(marker in message for marker in SERPAPI_RATE_LIMIT_MARKERS):
        return "rate_limit"
    return "provider_error"

# Conservative allow-list: prices, years and catalog IDs must not become votes.
ALLOWED_DENOMINATIONS = {
    "VND": {100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000},
    "USD": {1, 2, 5, 10, 20, 50, 100},
    "EUR": {5, 10, 20, 50, 100, 200, 500},
    "IDR": {1000, 2000, 5000, 10000, 20000, 50000, 75000, 100000},
    "JPY": {1000, 2000, 5000, 10000},
    "CNY": {1, 5, 10, 20, 50, 100},
    "KRW": {1000, 5000, 10000, 50000},
    "THB": {20, 50, 100, 500, 1000},
    "MYR": {1, 5, 10, 20, 50, 100},
    "SGD": {2, 5, 10, 50, 100, 1000, 10000},
    "PHP": {20, 50, 100, 200, 500, 1000},
    "KHR": {50, 100, 500, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 50000, 100000},
    "LAK": {500, 1000, 2000, 5000, 10000, 20000, 50000, 100000},
    "MMK": {50, 100, 200, 500, 1000, 5000, 10000, 20000},
    "GBP": {5, 10, 20, 50},
    "AUD": {5, 10, 20, 50, 100},
    "BND": {1, 5, 10, 50, 100, 500, 1000, 10000},
}

COUNTRY_EXPECTED_CURRENCIES = {
    "vietnam": {"VND"},
    "viet nam": {"VND"},
    "united states": {"USD"},
    "united states of america": {"USD"},
    "usa": {"USD"},
    "timor-leste": {"USD"},
    "ecuador": {"USD"},
    "japan": {"JPY"},
    "china": {"CNY"},
    "south korea": {"KRW"},
    "thailand": {"THB"},
    "myanmar": {"MMK"},
    "cambodia": {"KHR"},
    "laos": {"LAK"},
    "malaysia": {"MYR"},
    "singapore": {"SGD"},
    "indonesia": {"IDR"},
    "philippines": {"PHP"},
    "australia": {"AUD"},
    "united kingdom": {"GBP"},
    "european union": {"EUR"},
}

# Defaults are only used after evidence has banknote context and no conflict.
CURRENCY_DEFAULT_COUNTRY = {
    "USD": "united states",
    "VND": "vietnam",
    "EUR": "european union",
    "JPY": "japan",
    "CNY": "china",
    "KRW": "south korea",
    "THB": "thailand",
    "MMK": "myanmar",
    "KHR": "cambodia",
    "LAK": "laos",
    "MYR": "malaysia",
    "SGD": "singapore",
    "IDR": "indonesia",
    "PHP": "philippines",
    "AUD": "australia",
    "GBP": "united kingdom",
}

POSITIVE_BANKNOTE_KEYWORDS = [
    "banknote", "note", "bill", "dollar bill", "dollar note", "currency note", "paper money",
    "polymer note", "denomination", "face value", "one hundred dollars", "one dollar",
    "tờ", "tờ tiền", "tiền giấy", "mệnh giá", "đồng", "đồng tiền",
    "đôla", "đô la",
    "tiền polymer", "tiền cotton", "tiền lưu niệm", "yen banknote", "euro banknote", 
    "baht note", "riel note", "kip note", "kyat note", "peso note", "rupiah note", 
    "ringgit note", "won note", "yuan note"
]

NEGATIVE_EXCHANGE_KEYWORDS = [
    "exchange rate", "currency converter", "tỷ giá", "quy đổi", "hôm nay", "giá bán", "mua bán",
    "price", "auction", "shop", "ebay", "collector price", "converted to", "sold for",
    "marketplace", "collector", "birthday note", "catalog", "catalogue", "mã catalog", "vnd equivalent",
    "bằng bao nhiêu tiền việt nam", "bang bao nhieu tien viet nam",
    "xuống mức thấp", "xuong muc thap", "record low", "fell to", "drops to",
    "chi tiêu", "chi tieu", "spending", "daily budget", "một ngày chi tiêu",
    "tiktok",
    "tiền giả", "tien gia", "counterfeit", "fake money", "fake banknote",
    "quỹ đen", "quy den", "chiêu biến tờ", "chieu bien to", "biến tờ", "bien to",
    "tiền thật lấy", "tien that lay", "tiền bị rách", "tien bi rach",
]

CURRENCY_QUERY_NAMES = {
    "VND": "Vietnamese dong",
    "USD": "US dollar",
    "EUR": "euro",
    "JPY": "yen",
    "CNY": "yuan",
    "KRW": "won",
    "THB": "baht",
    "MYR": "ringgit",
    "SGD": "Singapore dollar",
    "IDR": "rupiah",
    "PHP": "Philippine peso",
    "KHR": "riel",
    "LAK": "kip",
    "MMK": "kyat",
    "GBP": "pound sterling",
    "AUD": "Australian dollar",
    "BND": "Brunei dollar",
}


def _evidence_identity_text(item: Dict[str, Any]) -> str:
    return " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "text", "page_text_excerpt")
    )


def _evidence_text(item: Dict[str, Any]) -> str:
    return " ".join(
        (_evidence_identity_text(item), str(item.get("source") or ""))
    )


def _contains_term(text: str, term: str) -> bool:
    """Match an alias as a token/phrase, never inside an unrelated word."""
    normalized_text = str(text or "").lower()
    normalized_term = str(term or "").strip().lower()
    if not normalized_term:
        return False
    if not any(char.isalnum() for char in normalized_term):
        return normalized_term in normalized_text
    return re.search(
        rf"(?<!\w){re.escape(normalized_term)}(?!\w)",
        normalized_text,
        flags=re.IGNORECASE,
    ) is not None


def _has_open_foreign_dollar_context(text: str) -> bool:
    lower = str(text or "").lower()
    explicit_us = any(
        _contains_term(lower, marker)
        for marker in (
            "usd", "us dollar", "u.s. dollar", "united states",
            "usa", "u.s.", "đôla mỹ", "đô la mỹ",
        )
    )
    if explicit_us:
        return False
    open_country = re.search(
        r"(?:\btiền\s+)?[A-Za-zÀ-ỹ][\wÀ-ỹ'’-]{1,30}"
        r"\s+(?:and|và|&)\s+[A-Za-zÀ-ỹ][\wÀ-ỹ'’-]{1,30}"
        r"(?=\s*(?:\.{2,}|[-,:;|–—])?\s*\d)",
        str(text or ""),
        flags=re.IGNORECASE,
    )
    return bool(
        open_country
        or any(
            marker in lower
            for marker in (
                "singapore", "australian", "canadian", "hong kong",
                "new zealand", "cad", "hkd", "aud", "sgd",
            )
        )
    )


def _ensure_deadline(deadline: Optional[float]) -> float:
    return deadline or (time.monotonic() + AGENT3_DEFAULT_BUDGET_SECONDS)


def _remaining_budget(deadline: float) -> float:
    return max(0.0, deadline - time.monotonic())


def _stage_timeout(deadline: float, cap_seconds: float, reserve_seconds: float = 0.5) -> float:
    remaining = _remaining_budget(deadline) - reserve_seconds
    if remaining <= 0:
        raise TimeoutError("Agent 3 deadline exhausted.")
    return max(0.1, min(float(cap_seconds), remaining))


def _record_stage_trace(
    stage_trace: List[Dict[str, Any]],
    debug_log: Optional[Dict[str, Any]],
    *,
    stage: str,
    started_at: float,
    deadline: float,
    status: str = "completed",
) -> None:
    entry = {
        "stage": stage,
        "status": status,
        "elapsed_ms": int(max(0.0, time.monotonic() - started_at) * 1000),
        "remaining_ms": int(_remaining_budget(deadline) * 1000),
    }
    stage_trace.append(entry)
    if debug_log is not None:
        debug_log.setdefault("stage_trace", []).append(dict(entry))


def _deadline_result_json(
    *,
    timeout_stage: str,
    deadline: float,
    run_started_at: float,
    evidence: Optional[List[Dict[str, Any]]] = None,
    raw_lens_text: str = "",
    stage_trace: Optional[List[Dict[str, Any]]] = None,
    debug_log: Optional[Dict[str, Any]] = None,
) -> str:
    preserved_evidence = list(evidence or [])[:5]
    trace_entries = list(stage_trace or [])
    evidence_preserved = bool(preserved_evidence)
    elapsed_ms = int(max(0.0, time.monotonic() - run_started_at) * 1000)
    remaining_ms = int(_remaining_budget(deadline) * 1000)
    deadline_seconds = max(0.0, deadline - run_started_at)
    status = "Partial" if evidence_preserved else "Failed"
    message = f"Agent 3 deadline exhausted at stage: {timeout_stage}."
    payload = {
        "quoc_gia": UNKNOWN_IDENTITY,
        "ma_tien_te": UNKNOWN_IDENTITY,
        "menh_gia": UNKNOWN_IDENTITY,
        "mat_tien": UNKNOWN_IDENTITY,
        "nam_phat_hanh": UNKNOWN_IDENTITY,
        "chat_lieu": UNKNOWN_IDENTITY,
        "mo_ta": message,
        "quan_diem": message,
        "phuong_phap": "Google Lens SerpApi deadline fallback",
        "do_tin_cay": 0.0,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": status,
        "provider": "serpapi",
        "error_type": "technical_error",
        "technical_error": True,
        "not_counted_in_consensus": True,
        "evidence": preserved_evidence,
        "raw_text": raw_lens_text,
    }
    validator_started = time.monotonic()
    validated = validate_agent3_identity(payload, evidence=preserved_evidence)
    _record_stage_trace(
        trace_entries,
        debug_log,
        stage="validator_promotion",
        started_at=validator_started,
        deadline=deadline,
        status="deadline_fallback",
    )
    validated.update(
        {
            "status": status,
            "error_type": "technical_error",
            "technical_error": True,
            "not_counted_in_consensus": True,
            "timeout_stage": timeout_stage,
            "deadline_seconds": round(deadline_seconds, 3),
            "elapsed_ms": elapsed_ms,
            "remaining_ms_at_stage": remaining_ms,
            "evidence_preserved": evidence_preserved,
            "top5_evidence_count": len(preserved_evidence),
            "stage_trace": trace_entries,
            "raw_text": raw_lens_text,
            "evidence": preserved_evidence,
        }
    )
    promotion_trace = dict(validated.get("promotion_trace") or {})
    promotion_trace.update(
        {
            "promoted": False,
            "reason": "deadline_budget_exhausted",
            "timeout_stage": timeout_stage,
            "deadline_seconds": round(deadline_seconds, 3),
            "elapsed_ms": elapsed_ms,
            "remaining_ms_at_stage": remaining_ms,
            "evidence_preserved": evidence_preserved,
        }
    )
    validated["promotion_trace"] = promotion_trace
    provider_trace = dict(validated.get("provider_trace") or {})
    provider_trace.update(
        {
            "timeout_stage": timeout_stage,
            "elapsed_ms": elapsed_ms,
            "fallback_attempted": False,
            "fallback_reason": "deadline_budget_low",
        }
    )
    validated["provider_trace"] = provider_trace
    if timeout_stage in {"before_formatter", "formatter"}:
        validated.update(
            {
                "formatter_provider": "none",
                "formatter_output_status": status,
                "formatter_fallback": True,
                "groq_called": False,
                "groq_skipped_reason": "deadline_budget_low",
            }
        )
    if debug_log is not None:
        debug_log["deadline_trace"] = {
            "timeout_stage": timeout_stage,
            "deadline_seconds": round(deadline_seconds, 3),
            "elapsed_ms": elapsed_ms,
            "remaining_ms_at_stage": remaining_ms,
            "evidence_preserved": evidence_preserved,
        }
    return json.dumps([validated], ensure_ascii=False)


def _has_direct_banknote_amount_context(context: str, raw_amount: str) -> bool:
    try:
        amount_pattern = _amount_pattern(int(raw_amount))
    except (TypeError, ValueError):
        amount_pattern = re.escape(str(raw_amount or "").strip())
    if not amount_pattern:
        return False
    banknote_words = (
        r"(?:banknote|banknotes|bill|note|currency\s+note|paper\s+money|"
        r"polymer\s+note|denomination|face\s+value|tiền\s+giấy|"
        r"tờ\s+tiền|tờ|mệnh\s+giá|đồng\s+tiền)"
    )
    currency_words = (
        r"(?:vnd|usd|eur|jpy|gbp|krw|thb|idr|dollar|dollars|euro|euros|"
        r"yen|yên|pound|pounds|sterling|won|baht|dong|đồng|rupiah)?"
    )
    symbols = r"[$€¥£₩฿₫]?"
    return bool(
        re.search(
            rf"{symbols}\s*{amount_pattern}\s*{currency_words}\s*{banknote_words}",
            context,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{banknote_words}\s*(?:of|mệnh\s+giá|:)?\s*{symbols}\s*{amount_pattern}\s*{currency_words}",
            context,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{currency_words}\s*{amount_pattern}\s*{banknote_words}",
            context,
            flags=re.IGNORECASE,
        )
    )


def _compact_text(value: Any, max_chars: int = PAGE_TEXT_EXCERPT_MAX_CHARS) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _select_identity_country(
    text: str,
    currency: Optional[str] = None,
    amount: Optional[int] = None,
) -> Optional[str]:
    lower = str(text or "").lower()
    foreign_dollar_context = _has_open_foreign_dollar_context(text)
    anchors: List[int] = []
    if amount:
        amount_position = lower.find(str(amount))
        if amount_position >= 0:
            anchors.append(amount_position)
    if currency:
        for alias in CURRENCY_ALIASES.get(currency, (currency.lower(),)):
            alias_position = lower.find(str(alias).lower())
            if alias_position >= 0 and _contains_term(lower, alias):
                anchors.append(alias_position)
    for keyword in POSITIVE_BANKNOTE_KEYWORDS:
        keyword_position = lower.find(keyword.lower())
        if keyword_position >= 0 and _contains_term(lower, keyword):
            anchors.append(keyword_position)

    country_matches = []
    preferred_country = CURRENCY_DEFAULT_COUNTRY.get(currency or "", "")
    for country_name, aliases in COUNTRY_ALIASES.items():
        if country_name == "United States" and foreign_dollar_context:
            aliases = [
                alias
                for alias in aliases
                if alias not in {"đôla", "đô la", "one dollar", "one dollar bill"}
            ]
        positions = [
            lower.find(alias.lower())
            for alias in aliases
            if _contains_term(lower, alias)
        ]
        positions = [position for position in positions if position >= 0]
        if positions:
            position = min(positions)
            distance = min((abs(position - anchor) for anchor in anchors), default=position)
            country_matches.append(
                (
                    country_name.lower() != preferred_country,
                    distance,
                    position,
                    country_name,
                )
            )
    return min(country_matches)[3] if country_matches else None


def _page_text_identity_terms(text: str) -> List[str]:
    terms: List[str] = []
    amount, currency = _extract_amount_currency(text)
    if currency:
        terms.append(f"currency:{currency}")
    if amount:
        terms.append(f"amount:{amount}")
    lower = str(text or "").lower()
    country = _select_identity_country(lower, currency=currency, amount=amount)
    if country:
        terms.append(f"country:{country}")
    for keyword in POSITIVE_BANKNOTE_KEYWORDS:
        if _contains_term(lower, keyword):
            terms.append(f"banknote_context:{keyword}")
            break
    return list(dict.fromkeys(terms))


def _is_obviously_unsafe_page_url(url: str) -> bool:
    try:
        parsed = urlparse(str(url or "").strip())
    except Exception:
        return True
    if parsed.scheme.lower() not in {"http", "https"}:
        return True
    if not parsed.hostname or parsed.username or parsed.password:
        return True
    hostname = parsed.hostname.strip().lower().rstrip(".")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        return True
    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None
    if literal_ip is not None and not literal_ip.is_global:
        return True
    path = (parsed.path or "").lower()
    blocked_extensions = (
        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip",
        ".rar", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    )
    return path.endswith(blocked_extensions)


def _page_text_skip_reason(item: Dict[str, Any]) -> Optional[str]:
    url = str(item.get("url") or item.get("link") or "").strip()
    if not url:
        return "no_url"
    if _is_obviously_unsafe_page_url(url):
        return "unsafe_url"

    title = str(item.get("title") or item.get("text") or "")
    snippet = str(item.get("snippet") or "")
    source = str(item.get("source") or item.get("domain") or "")
    identity_text = " ".join((title, snippet)).lower()
    context_text = " ".join((title, snippet, source)).lower()

    exchange_markers = (
        "exchange rate", "currency converter", "tỷ giá", "ty gia",
        "converted to", "quy đổi", "quy doi", "vnd equivalent",
        "bằng bao nhiêu tiền việt nam", "bang bao nhieu tien viet nam",
        "xuống mức thấp", "xuong muc thap", "record low", "fell to", "drops to",
    )
    if any(marker in context_text for marker in exchange_markers):
        return "noise_exchange_or_conversion"

    catalog_markers = ("catalog", "catalogue", "mã catalog", "ma catalog", "p-")
    if any(marker in context_text for marker in catalog_markers):
        return "noise_catalog"

    year_only = re.search(r"\b(?:issued|issue date|year|năm|phát hành)\s*(?:năm\s*)?(18|19|20)\d{2}\b", context_text)
    if year_only and not any(_contains_term(identity_text, kw) for kw in POSITIVE_BANKNOTE_KEYWORDS):
        return "noise_year_only"

    weak_markers = (
        "shop", "auction", "marketplace", "collector price", "sold for",
        "price", "ebay", "amazon", "shopee", "lazada",
    )
    if any(marker in context_text for marker in weak_markers):
        amount, currency = _extract_amount_currency(identity_text)
        direct_identity = bool(
            amount
            and currency
            and _has_direct_banknote_amount_context(identity_text, amount)
        )
        if not direct_identity:
            return "weak_source_without_direct_identity"

    return None


def _extract_page_text_excerpt_from_html(
    html_text: str,
    max_chars: int = PAGE_TEXT_EXCERPT_MAX_CHARS,
) -> str:
    text = str(html_text or "")[:PAGE_TEXT_FETCH_BYTES_LIMIT]
    text = re.sub(r"(?is)<(script|style|noscript|svg|canvas|iframe).*?</\1>", " ", text)
    chunks: List[str] = []

    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
    if title_match:
        chunks.append(title_match.group(1))

    meta_match = re.search(
        r"(?is)<meta[^>]+(?:name|property)=['\"](?:description|og:description)['\"][^>]+content=['\"]([^'\"]+)['\"]",
        text,
    ) or re.search(
        r"(?is)<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:name|property)=['\"](?:description|og:description)['\"]",
        text,
    )
    if meta_match:
        chunks.append(meta_match.group(1))

    for tag in ("h1", "h2", "p"):
        limit = 3 if tag == "p" else 4
        for match in re.finditer(rf"(?is)<{tag}[^>]*>(.*?)</{tag}>", text):
            chunk = re.sub(r"(?is)<[^>]+>", " ", match.group(1))
            chunk = _compact_text(chunk, 500)
            if chunk:
                chunks.append(chunk)
            if len([value for value in chunks if value]) >= limit + 2:
                break

    if not chunks:
        chunks.append(re.sub(r"(?is)<[^>]+>", " ", text))

    return _compact_text(" ".join(chunks), max_chars)


async def _default_fetch_page_text_excerpt(url: str, timeout_seconds: float) -> str:
    from app.utils.link_validator import _is_safe_public_http_url

    if not await _is_safe_public_http_url(url):
        return ""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml;q=0.9",
    }

    def _get() -> Any:
        return requests.get(
            url,
            headers=headers,
            timeout=max(0.1, float(timeout_seconds)),
            allow_redirects=False,
        )

    response = await asyncio.to_thread(_get)
    if response.status_code >= 400:
        return ""
    content_type = str(response.headers.get("content-type") or "").lower()
    if content_type and "html" not in content_type and "text/plain" not in content_type:
        return ""
    return _extract_page_text_excerpt_from_html(response.text)


async def enrich_lens_evidence_with_page_text(
    evidence: List[Dict[str, Any]],
    *,
    deadline: Optional[float] = None,
    max_urls: int = PAGE_TEXT_MAX_URLS,
    timeout_seconds: float = PAGE_TEXT_TIMEOUT_SECONDS,
    min_budget_seconds: float = PAGE_TEXT_MIN_BUDGET_SECONDS,
    fetcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
) -> List[Dict[str, Any]]:
    enriched: List[Dict[str, Any]] = []
    successful_fetch_count = 0
    fetcher = fetcher or _default_fetch_page_text_excerpt

    for item in evidence or []:
        current = dict(item)
        current.setdefault("link_checked", bool(current.get("link_alive")))
        current["page_text_checked"] = "skipped"
        current["page_text_skip_reason"] = None
        current["page_text_excerpt_chars"] = 0
        current["page_text_identity_terms"] = []

        if (
            deadline is not None
            and _remaining_budget(deadline) < min_budget_seconds
        ):
            current["page_text_skip_reason"] = "deadline_budget_low"
            enriched.append(current)
            continue

        skip_reason = _page_text_skip_reason(current)
        if skip_reason:
            current["page_text_skip_reason"] = skip_reason
            enriched.append(current)
            continue
        if successful_fetch_count >= max_urls:
            current["page_text_skip_reason"] = "top_n_limit"
            enriched.append(current)
            continue

        try:
            per_url_timeout = max(0.1, float(timeout_seconds))
            if deadline is not None:
                per_url_timeout = min(per_url_timeout, _stage_timeout(deadline, per_url_timeout, reserve_seconds=0.25))
            fetched = fetcher(str(current.get("url") or current.get("link") or ""), per_url_timeout)
            if inspect.isawaitable(fetched):
                fetched = await fetched
            if isinstance(fetched, dict):
                excerpt = fetched.get("page_text_excerpt") or fetched.get("text") or ""
            else:
                excerpt = str(fetched or "")
            excerpt = _compact_text(excerpt)
            if excerpt:
                current["page_text_excerpt"] = excerpt
                current["page_text_checked"] = True
                current["page_text_excerpt_chars"] = len(excerpt)
                current["page_text_identity_terms"] = _page_text_identity_terms(excerpt)
                successful_fetch_count += 1
            else:
                current["page_text_checked"] = False
                current["page_text_skip_reason"] = "empty_or_non_html"
        except Exception as exc:
            current["page_text_checked"] = False
            current["page_text_skip_reason"] = exc.__class__.__name__
        enriched.append(current)

    return enriched


def _is_unknown_identity(value: Any) -> bool:
    return str(value or "").strip().lower() in {
        "",
        "unknown",
        "không xác định",
        "khong xac dinh",
        "none",
        "null",
        "n/a",
        "na",
        "lỗi",
        "loi",
        "error",
    }


def _currency_from_denomination(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    excluded = {
        "UNC", "PMG", "GEM", "NEW", "THE", "AND", "OLD",
        "NAM", "BIN", "TON", "COT", "SER", "PCS",
    }
    if re.fullmatch(r"[A-Za-z]{3}", text):
        code = text.upper()
        return None if code in excluded else code
    for match in re.finditer(
        r"\b(?i:currency)\s*:\s*(?P<label>[A-Z]{3})\b"
        r"|(?P<amount>\d{1,3}(?:[.,\s]\d{3})*|\d{1,7})\s+(?P<after>[A-Z]{3})\b"
        r"|\b(?P<before>[A-Z]{3})\s+(?P<following>\d{1,3}(?:[.,\s]\d{3})*|\d{1,7})"
        r"|\b(?P<context>[A-Z]{3})\s+(?i:banknote|note|currency)\b",
        text,
    ):
        code = (
            match.group("label")
            or match.group("after")
            or match.group("before")
            or match.group("context")
        ).upper()
        amount_text = match.group("amount") or match.group("following")
        amount = _parse_amount_token(amount_text) if amount_text else None
        if code in excluded or (amount is not None and 1800 <= amount <= 2100):
            continue
        return code
    return None


def _has_explicit_vietnam_dong_context(text: str) -> bool:
    lower = str(text or "").lower()
    if any(_contains_term(lower, marker) for marker in ("vnd", "vnđ", "₫")):
        return True
    if re.search(
        r"\b(?:đồng\s+việt\s+nam|việt\s+nam\s+đồng|vietnamese\s+dong)\b",
        lower,
    ):
        return True
    if re.search(
        r"\b(?:đồng|dong)\s+(?:kip|usd|dollar|euro|yen|baht|won|riel|kyat)\b",
        lower,
    ):
        return False
    return bool(
        re.search(r"(?<!\d)\d[\d.,\s]*\s+(?:đồng|dong)\b", lower)
        and any(marker in lower for marker in ("việt nam", "viet nam", "vietnam"))
    )


def _normalize_currency_code(value: Any) -> Optional[str]:
    direct = _currency_from_denomination(value)
    if direct:
        return direct

    text = str(value or "").strip().lower()
    for code, aliases in CURRENCY_ALIASES.items():
        if any(_contains_term(text, alias) for alias in aliases):
            return code
    return None


def _parse_amount_token(raw_value: Any) -> Optional[int]:
    text = str(raw_value or "").strip()
    short_match = re.search(r"(?<!\w)(\d{1,3})\s*[kK](?!\w)", text)
    if short_match:
        return int(short_match.group(1)) * 1000

    match = re.search(
        r"(?<!\d)(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)*)(?!\d)",
        text,
    )
    if not match:
        return None

    token = re.sub(r"\s+", "", match.group(1))
    decimal_match = re.fullmatch(r"(\d+)[.,]00", token)
    if decimal_match:
        return int(decimal_match.group(1))

    parts = re.split(r"[.,]", token)
    if len(parts) > 1:
        if not all(len(part) == 3 for part in parts[1:]):
            return None
        token = "".join(parts)

    try:
        return int(token)
    except (TypeError, ValueError):
        return None


def _identity_text_amounts(item: Dict[str, Any], currency: Optional[str]) -> List[int]:
    """Extract denomination candidates only from title/snippet identity text."""
    text = " ".join(
        (
            str(item.get("title") or ""),
            str(item.get("snippet") or ""),
            str(item.get("page_text_excerpt") or ""),
        )
    )
    text = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", text, flags=re.IGNORECASE)
    pattern = re.compile(
        r"(?<!\w)(?P<short>\d{1,3})\s*[kK](?!\w)"
        r"|(?<!\d)(?P<number>\d{1,3}(?:[.,\s]\d{2,3}){1,3}|\d{1,7})(?!\d)"
    )
    amounts: List[int] = []
    matches = list(pattern.finditer(text))
    for match_index, match in enumerate(matches):
        raw = match.group(0)
        amount = _parse_amount_token(raw)
        if not is_valid_agent3_denomination(amount, currency):
            continue

        local_context = text[max(0, match.start() - 64):match.end() + 64].lower()
        has_prior_non_year_amount = any(
            prior is not None and not 1800 <= prior <= 2100
            for prior in (
                _parse_amount_token(previous.group(0))
                for previous in matches[:match_index]
            )
        )
        looks_like_year = (
            amount is not None
            and 1800 <= amount <= 2100
            and (
                any(
                    marker in local_context
                    for marker in ("year", "issued", "issue date", "năm", "phát hành")
                )
                or has_prior_non_year_amount
                or re.search(
                    rf"(?<!\d){re.escape(raw)}(?!\d)\s*(?:unc|series|edition)",
                    local_context,
                )
            )
        )
        looks_like_price = any(
            marker in local_context
            for marker in (
                "price", "shop", "buy", "sell", "sold for", "auction",
                "ebay", "marketplace", "collector", "collector price",
                "birthday note", "giá bán",
            )
        )
        looks_like_exchange = any(
            marker in local_context
            for marker in (
                "exchange rate", "tỷ giá", "ty gia", "converted to",
                "currency converter", "forex", "quy đổi", "quy doi",
                "usd hôm nay", "usd hom nay", "vnd equivalent",
                "bằng bao nhiêu tiền việt nam", "bang bao nhieu tien viet nam",
                "xuống mức thấp", "xuong muc thap", "record low", "fell to", "drops to",
                "chi tiêu", "chi tieu", "spending", "daily budget", "một ngày chi tiêu",
            )
        )
        looks_like_catalog = any(
            marker in local_context
            for marker in ("catalog", "catalogue", "mã catalog", "ma catalog")
        )
        if looks_like_year or looks_like_price or looks_like_exchange or looks_like_catalog:
            continue
        if amount not in amounts:
            amounts.append(amount)
    return amounts


def is_valid_agent3_denomination(amount: Optional[int], currency: Optional[str]) -> bool:
    if amount is None or not currency:
        return False
    code = str(currency).upper()
    allowed = ALLOWED_DENOMINATIONS.get(code)
    if allowed is not None:
        return amount in allowed
    return bool(re.fullmatch(r"[A-Z]{3}", code) and 0 < amount <= 10_000_000)


def _normalize_country_key(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    aliases = {
        "viet nam": "vietnam",
        "vn": "vietnam",
        "hoa ky": "united states",
        "my": "united states",
        "usa": "united states",
        "united states of america": "united states",
        "uk": "united kingdom",
        "britain": "united kingdom",
        "great britain": "united kingdom",
        "eurozone": "european union",
        "eu": "european union",
        "timor leste": "timor-leste",
    }
    return aliases.get(text, text)


def _country_currency_consistent(country: Any, currency: Optional[str]) -> bool:
    expected = COUNTRY_EXPECTED_CURRENCIES.get(_normalize_country_key(country))
    return not expected or str(currency or "").upper() in expected


TRUSTED_EVIDENCE_HINTS = (
    "wikipedia",
    ".gov",
    "government",
    "central bank",
    "centralbank",
    "state bank",
    "statebank",
    "ngân hàng",
    "ministry",
    "reuters",
    "bloomberg",
    "bbc",
    "vnexpress",
    "tuoitre",
    "thanhnien",
)

WEAK_EVIDENCE_HINTS = (
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "ebay.",
    "amazon.",
    "shopee.",
    "lazada.",
    "marketplace",
    "auction",
    "dau gia",
    "đấu giá",
    "shop",
    "sold for",
    "collector",
    "collector price",
    "birthday note",
    "serial đẹp",
    "seri đẹp",
)

EVIDENCE_BUCKET_ALIASES = {
    "exact_matches": "exact_match",
    "visual_matches": "visual_match",
    "knowledge": "knowledge_graph",
    "page_text": "text_result",
    "reverse_image_search": "visual_match",
}

COUNTRY_SIGNAL_ALIASES = {
    "vietnam": ("vietnam", "viet nam", "việt nam", "tiền việt", "tien viet",
               "dong", "dong banknote", "vietnamese dong"),
    "united states": (
        "united states", "usa", "u.s.", "hoa kỳ", "hoa ky", "mỹ",
        "american", "đôla", "đô la", "đôla mỹ", "đô la mỹ", "one dollar",
        "one dollar bill",
    ),
    "indonesia": ("indonesia", "rupiah"),
    "japan": ("japan", "nhật bản", "yen", "yên", "jpy", "¥"),
    "china": ("china", "trung quốc", "yuan", "renminbi"),
    "south korea": ("south korea", "korea", "hàn quốc", "won", "krw", "₩"),
    "thailand": ("thailand", "thái lan", "baht", "฿"),
    "united kingdom": ("united kingdom", "uk", "british", "pound", "pounds", "sterling", "gbp", "£"),
    "european union": ("european union", "eurozone", "euro", "euros", "eur", "€"),
    "myanmar": ("myanmar", "burma", "kyat"),
    "cambodia": ("cambodia", "campuchia", "riel"),
    "laos": ("laos", "lào", "kip"),
}


def normalize_lens_evidence(
    evidence: Optional[List[Dict[str, Any]]],
    provider: str = "unknown",
) -> List[Dict[str, Any]]:
    """Normalize SerpAPI and Selenium evidence into one JSON-safe schema."""
    normalized_items: List[Dict[str, Any]] = []
    default_provider = str(provider or "unknown").strip().lower() or "unknown"

    for index, raw_item in enumerate(evidence or [], start=1):
        if not isinstance(raw_item, dict):
            continue

        raw = dict(raw_item)
        original_raw = raw.get("raw") if isinstance(raw.get("raw"), dict) else raw
        item_provider = str(raw.get("provider") or default_provider).strip().lower()
        url = str(raw.get("url") or raw.get("link") or "").strip()
        try:
            domain = str(raw.get("domain") or urlparse(url).netloc or "").lower()
        except Exception:
            domain = str(raw.get("domain") or "").lower()
        domain = domain.split("@")[-1].split(":")[0].removeprefix("www.")

        bucket = str(raw.get("bucket") or raw.get("type") or "text_result").strip().lower()
        bucket = EVIDENCE_BUCKET_ALIASES.get(bucket, bucket)
        if bucket not in {"visual_match", "knowledge_graph", "exact_match", "text_result"}:
            bucket = "text_result"

        try:
            rank = int(raw.get("rank") or raw.get("position") or index)
        except (TypeError, ValueError):
            rank = index
        try:
            score = float(raw.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0

        raw_amounts = raw.get("detected_amounts") or []
        if not isinstance(raw_amounts, (list, tuple, set)):
            raw_amounts = [raw_amounts]

        rank_reasons = raw.get("rank_reasons") or []
        if not isinstance(rank_reasons, list):
            rank_reasons = [str(rank_reasons)]

        title = str(raw.get("title") or raw.get("text") or "").strip()
        snippet = str(raw.get("snippet") or raw.get("description") or "").strip()
        source = str(raw.get("source") or raw.get("source_name") or domain or "").strip()
        page_text_excerpt = _compact_text(raw.get("page_text_excerpt"))

        normalized_items.append(
            {
                "provider": item_provider,
                "bucket": bucket,
                "rank": rank,
                "title": title,
                "snippet": snippet,
                "url": url,
                "source": source,
                "domain": domain,
                "score": round(max(0.0, score), 4),
                "rank_reasons": [str(reason) for reason in rank_reasons],
                "detected_country": raw.get("detected_country"),
                "detected_currency": raw.get("detected_currency"),
                "detected_amounts": list(raw_amounts),
                "link_checked": bool(raw.get("link_checked")),
                "link_alive": raw.get("link_alive"),
                "page_text_checked": raw.get("page_text_checked", "skipped"),
                "page_text_skip_reason": raw.get("page_text_skip_reason"),
                "page_text_excerpt": page_text_excerpt,
                "page_text_excerpt_chars": len(page_text_excerpt),
                "page_text_identity_terms": list(raw.get("page_text_identity_terms") or []),
                "query": str(raw.get("query") or "").strip(),
                "evidence_type": str(raw.get("evidence_type") or "lens").strip(),
                "is_candidate_assisted": bool(raw.get("is_candidate_assisted")),
                "raw": original_raw,
            }
        )

    normalized_items.sort(key=lambda item: (item["rank"], -item["score"]))
    return normalized_items


def _is_trusted_evidence(item: Dict[str, Any]) -> bool:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "source", "domain", "url")
    ).lower()
    return any(hint in text for hint in TRUSTED_EVIDENCE_HINTS)


def _is_weak_evidence(item: Dict[str, Any]) -> bool:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "source", "domain", "url")
    ).lower()
    return any(hint in text for hint in WEAK_EVIDENCE_HINTS)


def _evidence_noise_reason(item: Dict[str, Any]) -> Optional[str]:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "source", "domain", "url")
    ).casefold()
    for marker in NEGATIVE_EXCHANGE_KEYWORDS:
        if marker in text:
            return f"noise:{marker}"
    return None


def _identity_text_signals(
    item: Dict[str, Any],
    country: Any,
    currency: str,
    amount: int,
) -> Dict[str, Any]:
    title = str(item.get("title") or "")
    combined = " ".join(
        (
            title,
            str(item.get("snippet") or ""),
            str(item.get("page_text_excerpt") or ""),
        )
    ).lower()
    title_lower = title.lower()
    combined = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", combined)
    title_lower = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", title_lower)

    amount_regex = rf"(?<!\d){_amount_pattern(amount)}(?!\d)"
    amount_terms = []
    if re.search(amount_regex, combined):
        amount_terms.append(str(amount))
    if amount >= 1000 and amount % 1000 == 0:
        short_amount = amount // 1000
        if re.search(rf"(?<!\w){short_amount}\s*k(?!\w)", combined, flags=re.IGNORECASE):
            amount_terms.append(f"{short_amount}k")

    currency_terms = []
    for alias in CURRENCY_ALIASES.get(currency, [currency.lower()]):
        if _contains_term(combined, alias):
            currency_terms.append(alias)
            break
    country_key = _normalize_country_key(country)
    for alias in COUNTRY_SIGNAL_ALIASES.get(country_key, (country_key,)):
        if alias and _contains_term(combined, alias):
            currency_terms.append(alias)
            break
    if (
        currency == "VND"
        and country_key == "vietnam"
        and re.search(rf"{amount_regex}\s+đồng\b", combined, flags=re.IGNORECASE)
    ):
        currency_terms.append("amount+đồng@vietnam")

    money_terms = []
    for keyword in POSITIVE_BANKNOTE_KEYWORDS:
        if _contains_term(combined, keyword):
            money_terms.append(keyword)
            break

    amount_signal = bool(amount_terms)
    currency_country_signal = bool(currency_terms)
    if (
        not money_terms
        and amount_signal
        and currency_country_signal
        and _contains_term(combined, "tiền")
    ):
        money_terms.append("tiền")
    direct_banknote_context = _has_direct_banknote_amount_context(combined, amount)
    money_context_signal = bool(money_terms) or direct_banknote_context
    title_amount_signal = re.search(amount_regex, title_lower) is not None

    return {
        "amount_signal": amount_signal,
        "currency_country_signal": currency_country_signal,
        "money_context_signal": money_context_signal,
        "direct_banknote_context": direct_banknote_context,
        "direct_match": amount_signal and currency_country_signal and money_context_signal,
        "direct_title_match": title_amount_signal and currency_country_signal and money_context_signal,
        "matched_terms": list(dict.fromkeys(amount_terms + currency_terms + money_terms)),
    }


def _structured_evidence_candidate(
    item: Dict[str, Any],
) -> tuple[Optional[Dict[str, Any]], List[str]]:
    errors: List[str] = []
    country = item.get("detected_country")
    currency = _normalize_currency_code(item.get("detected_currency"))

    if _is_unknown_identity(country):
        errors.append("country_missing")
    if _is_unknown_identity(currency):
        errors.append("currency_missing")

    valid_amounts = _identity_text_amounts(item, currency)

    if len(valid_amounts) != 1:
        errors.append("amount_not_allowed")

    if errors:
        return None, errors

    if not _country_currency_consistent(country, currency):
        return None, ["conflicting_evidence"]

    try:
        score = float(item.get("score") or 0.0)
    except (TypeError, ValueError):
        score = 0.0

    amount = valid_amounts[0]
    signals = _identity_text_signals(item, country, currency, amount)
    weak_source = _is_weak_evidence(item)
    trusted_source = _is_trusted_evidence(item)
    return {
        "country": str(country).strip(),
        "country_key": _normalize_country_key(country),
        "currency": currency,
        "amount": amount,
        "score": score,
        "trusted": trusted_source,
        "weak_source": weak_source,
        "source_acceptable": not weak_source and (
            trusted_source or signals["direct_title_match"]
        ),
        "signals": signals,
        "source_key": (
            str(item.get("domain") or "").lower()
            or str(item.get("source") or "").strip().lower()
        ),
        "evidence": item,
    }, []


def _evidence_support_for_identity(
    item: Dict[str, Any],
    country: Any,
    currency: str,
    amount: int,
) -> Dict[str, Any]:
    signals = _identity_text_signals(item, country, currency, amount)
    title_snippet_item = {
        "title": str(item.get("title") or ""),
        "snippet": str(item.get("snippet") or ""),
        "page_text_excerpt": "",
    }
    title_snippet_signals = _identity_text_signals(
        title_snippet_item,
        country,
        currency,
        amount,
    )
    combined = " ".join(
        (
            str(item.get("title") or ""),
            str(item.get("snippet") or ""),
            str(item.get("page_text_excerpt") or ""),
        )
    ).lower()
    page_text_excerpt = str(item.get("page_text_excerpt") or "")
    page_text_item = {
        "title": "",
        "snippet": page_text_excerpt,
        "page_text_excerpt": "",
    }
    page_text_signals = _identity_text_signals(page_text_item, country, currency, amount)
    rank_reasons = [str(reason).strip() for reason in item.get("rank_reasons") or []]
    normalized_reasons = [reason.casefold() for reason in rank_reasons]

    target_country_key = _normalize_country_key(country)
    detected_country = item.get("detected_country")
    detected_currency = _normalize_currency_code(item.get("detected_currency"))
    country_match = (
        not _is_unknown_identity(detected_country)
        and _normalize_country_key(detected_country) == target_country_key
    ) or any(
        reason.startswith("country:")
        and _normalize_country_key(reason.split(":", 1)[1]) == target_country_key
        for reason in rank_reasons
    )
    currency_match = detected_currency == currency or any(
        reason == f"currency:{currency}".casefold()
        for reason in normalized_reasons
    )

    for alias in COUNTRY_SIGNAL_ALIASES.get(target_country_key, (target_country_key,)):
        if alias and _contains_term(combined, alias):
            country_match = True
            break
    for alias in CURRENCY_ALIASES.get(currency, [currency.lower()]):
        if _contains_term(combined, alias):
            currency_match = True
            break

    metadata_matches_identity = (
        (_is_unknown_identity(detected_country) or country_match)
        and (not detected_currency or currency_match)
    )
    detected_amounts = (
        set(_identity_text_amounts(item, currency))
        if metadata_matches_identity
        else set()
    )
    title_snippet_amounts = (
        set(_identity_text_amounts(title_snippet_item, currency))
        if metadata_matches_identity
        else set()
    )
    page_text_amounts = (
        set(_identity_text_amounts(page_text_item, currency))
        if page_text_excerpt and metadata_matches_identity
        else set()
    )
    weak_source = _is_weak_evidence(item)
    direct_title_or_snippet_support = bool(
        amount in title_snippet_amounts
        and title_snippet_signals["direct_match"]
        and not weak_source
    )
    # Weak-source exact support: social/video domain with clear banknote identity in title.
    # Contributes to signal counts but alone is NOT sufficient for promotion.
    weak_exact_support = bool(
        weak_source
        and amount in title_snippet_amounts
        and title_snippet_signals["direct_match"]
    )
    page_text_support = bool(
        amount in page_text_amounts
        and page_text_signals["direct_match"]
        and not weak_source
    )
    amount_match = amount in detected_amounts or signals["amount_signal"]
    visual_context = (
        str(item.get("bucket") or "").casefold()
        in {"visual_match", "exact_match", "knowledge_graph"}
        or "visual_match" in normalized_reasons
    )
    money_context = signals["money_context_signal"] or visual_context
    supports = (
        (amount_match and (country_match or currency_match or money_context))
        or (country_match and currency_match)
        or ((country_match or currency_match) and money_context)
    )
    evidence_key = str(item.get("url") or "").strip().lower() or "|".join(
        (
            str(item.get("domain") or item.get("source") or "").strip().lower(),
            str(item.get("title") or "").strip().lower(),
            str(item.get("rank") or ""),
        )
    )
    independent_key = (
        str(item.get("domain") or "").strip().lower()
        or str(item.get("source") or "").strip().lower()
        or evidence_key
    )
    return {
        "supports": bool(supports),
        "evidence_key": evidence_key,
        "independent_key": independent_key,
        "source": str(item.get("source") or item.get("domain") or "").strip(),
        "rank": item.get("rank"),
        "weak_source": weak_source,
        "signals": signals,
        "exact_amount_support": bool(
            direct_title_or_snippet_support or page_text_support
        ),
        "direct_title_or_snippet_support": direct_title_or_snippet_support,
        "weak_exact_support": weak_exact_support,
        "page_text_support": page_text_support,
        "conflicting_amounts": sorted(
            value for value in detected_amounts if value != amount and not weak_source
        ),
        "score": float(item.get("score") or 0.0),
    }


def verify_lens_evidence_identity(
    evidence: List[Dict[str, Any]],
    provider: str = "unknown",
) -> tuple[Optional[Dict[str, Any]], Dict[str, Any], List[str]]:
    """Verify identity using the same conservative rules for every AG3 provider."""
    normalized_evidence = normalize_lens_evidence(evidence, provider=provider)[:5]
    noise_evidence = [
        (item, _evidence_noise_reason(item))
        for item in normalized_evidence
        if _evidence_noise_reason(item)
    ]
    consensus_evidence = [
        item for item in normalized_evidence if not _evidence_noise_reason(item)
    ]
    page_text_checked_count = sum(
        1 for item in normalized_evidence if item.get("page_text_checked") is True
    )
    base_trace: Dict[str, Any] = {
        "promoted": False,
        "method": "evidence_verification",
        "provider": str(provider or "unknown").lower(),
        "reason": "no_strong_evidence",
        "selected_identity": None,
        "selected_evidence": None,
        "checks": {
            "identity_complete": "not_evaluated",
            "amount_allowed": "not_evaluated",
            "direct_title_or_snippet_match": "not_evaluated",
            "source_trusted": "not_evaluated",
            "multiple_evidence_agreement": "not_evaluated",
            "conflict_check_passed": "not_evaluated",
            "page_text_checked": bool(page_text_checked_count),
        },
        "matched_terms": [],
        "verification_source": "title_snippet_metadata",
        "support_count": 0,
        "context_support_count": 0,
        "exact_amount_support_count": 0,
        "support_signal_count": 0,
        "independent_source_count": 0,
        "direct_title_or_snippet_support_count": 0,
        "page_text_checked_count": page_text_checked_count,
        "page_text_support_count": 0,
        "page_text_used_for_identity": False,
        "independent_conflicting_amount_support_count": 0,
        "top_score": 0.0,
        "conflicting_denominations": [],
        "top5_evidence_count": len(normalized_evidence),
        "noise_filtered_count": len(noise_evidence),
        "noise_filtered_evidence": [
            {
                "rank": item.get("rank"),
                "title": str(item.get("title") or "")[:160],
                "reason": reason,
            }
            for item, reason in noise_evidence
        ],
    }
    if not normalized_evidence:
        return None, base_trace, ["no_strong_evidence"]

    if not consensus_evidence:
        base_trace["reason"] = "noise_only"
        return None, base_trace, ["noise_only"]

    candidates: List[Dict[str, Any]] = []
    candidate_errors = set()
    for item in consensus_evidence:
        candidate, errors = _structured_evidence_candidate(item)
        candidate_errors.update(errors)
        if candidate:
            candidates.append(candidate)

    if not candidates:
        errors = sorted(candidate_errors or {"no_strong_evidence"})
        if "amount_not_allowed" in errors:
            base_trace["reason"] = "amount_not_allowed"
        elif "currency_missing" in errors or "country_missing" in errors:
            base_trace["reason"] = "identity_incomplete"
        return None, base_trace, errors

    groups: Dict[tuple, Dict[str, Any]] = {}
    for candidate in candidates:
        key = (
            candidate["country_key"],
            candidate["currency"],
            candidate["amount"],
        )
        group = groups.setdefault(
            key,
            {
                "records": [],
                "max_score": 0.0,
                "trusted_count": 0,
                "independent_sources": set(),
            },
        )
        group["records"].append(candidate)
        group["max_score"] = max(group["max_score"], candidate["score"])
        group["trusted_count"] += int(candidate["trusted"])
        if (
            candidate["score"] >= 7.0
            and candidate["signals"]["direct_match"]
            and not candidate["weak_source"]
            and candidate["source_key"]
        ):
            group["independent_sources"].add(candidate["source_key"])

    for group in groups.values():
        record_evidence_ids = {id(record["evidence"]) for record in group["records"]}
        support_records: Dict[str, Dict[str, Any]] = {}
        exact_amount_support_records: Dict[str, Dict[str, Any]] = {}
        page_text_support_records: Dict[str, Dict[str, Any]] = {}
        conflict_records: Dict[int, Dict[str, Dict[str, Any]]] = {}
        auxiliary_support_count = 0
        direct_title_support_records: Dict[str, Dict[str, Any]] = {}
        support_signal_records: Dict[str, Dict[str, Any]] = {}
        independent_support_sources = set()
        # RC3: separate tracking for weak-source exact signals
        weak_exact_records: Dict[str, Dict[str, Any]] = {}
        weak_independent_sources = set()
        for item in consensus_evidence:
            support = _evidence_support_for_identity(
                item,
                group["records"][0]["country"],
                group["records"][0]["currency"],
                group["records"][0]["amount"],
            )
            if support["supports"] and support["evidence_key"]:
                if support["evidence_key"] not in support_records:
                    support_records[support["evidence_key"]] = support
                    if id(item) not in record_evidence_ids:
                        auxiliary_support_count += 1
            if support["exact_amount_support"] and support["evidence_key"]:
                exact_amount_support_records.setdefault(support["evidence_key"], support)
            if support["direct_title_or_snippet_support"] and support["evidence_key"]:
                direct_title_support_records.setdefault(support["evidence_key"], support)
                support_signal_records.setdefault(
                    f"title:{support['evidence_key']}",
                    support,
                )
                independent_support_sources.add(support["independent_key"])
            # RC3: weak-source exact matches (YouTube/social with banknote identity)
            # contribute to independent source count and signal count separately.
            elif support.get("weak_exact_support") and support["evidence_key"]:
                weak_exact_records.setdefault(support["evidence_key"], support)
                support_signal_records.setdefault(
                    f"weak:{support['evidence_key']}",
                    support,
                )
                weak_independent_sources.add(support["independent_key"])
            if support["page_text_support"] and support["evidence_key"]:
                page_text_support_records.setdefault(support["evidence_key"], support)
                support_signal_records.setdefault(
                    f"page:{support['evidence_key']}",
                    support,
                )
                independent_support_sources.add(support["independent_key"])
            for conflicting_amount in support["conflicting_amounts"]:
                by_source = conflict_records.setdefault(conflicting_amount, {})
                source_key = support["independent_key"]
                current = by_source.get(source_key)
                if current is None or support["score"] > current["score"]:
                    by_source[source_key] = support

        group["support_records"] = support_records
        group["support_count"] = len(support_records) or min(len(group["records"]), 1)
        group["context_support_count"] = group["support_count"]
        group["exact_amount_support_count"] = len(exact_amount_support_records)
        group["support_signal_count"] = len(support_signal_records)
        group["weak_exact_count"] = len(weak_exact_records)
        group["weak_independent_source_count"] = len(
            {s for s in weak_independent_sources if s}
        )
        # independent_source_count = trusted direct sources + weak-exact sources
        # (weak sources only count if they have clear banknote identity in title)
        group["independent_source_count"] = len(
            {source for source in independent_support_sources if source}
        ) + len({s for s in weak_independent_sources if s})
        group["direct_title_or_snippet_support_count"] = len(
            direct_title_support_records
        )
        group["page_text_support_count"] = len(page_text_support_records)
        group["page_text_used_for_identity"] = bool(page_text_support_records)
        group["non_weak_support_count"] = sum(
            not support["weak_source"] for support in support_records.values()
        )
        group["auxiliary_support_count"] = auxiliary_support_count
        group["conflicting_denominations"] = [
            {
                "amount": conflicting_amount,
                "currency": group["records"][0]["currency"],
                "support_count": len(by_source),
                "sources": sorted(
                    {record["source"] for record in by_source.values() if record["source"]}
                ),
                "evidence_ranks": sorted(
                    {
                        int(record["rank"])
                        for record in by_source.values()
                        if str(record.get("rank") or "").isdigit()
                    }
                ),
                "reason": "independent_conflicting_amount",
                "max_score": max(
                    (record["score"] for record in by_source.values()),
                    default=0.0,
                ),
            }
            for conflicting_amount, by_source in sorted(conflict_records.items())
        ]
        group["independent_conflicting_amount_support_count"] = max(
            (
                conflict["support_count"]
                for conflict in group["conflicting_denominations"]
            ),
            default=0,
        )
        group["top_direct_score"] = max(
            (
                support["score"]
                for support in exact_amount_support_records.values()
                if support["signals"]["direct_match"] and not support["weak_source"]
            ),
            default=0.0,
        )

    ranked_groups = sorted(
        groups.items(),
        key=lambda entry: (
            int(
                entry[1]["support_signal_count"] >= 3
                and entry[1]["independent_source_count"] >= 2
                and entry[1]["direct_title_or_snippet_support_count"] >= 2
            ),
            entry[1]["support_signal_count"],
            entry[1]["independent_source_count"],
            entry[1]["direct_title_or_snippet_support_count"],
            entry[1]["exact_amount_support_count"],
            entry[1]["max_score"],
            entry[1]["trusted_count"],
        ),
        reverse=True,
    )
    top_candidate_key, top_candidate_group = ranked_groups[0]
    base_trace["support_count"] = top_candidate_group["support_count"]
    base_trace["context_support_count"] = top_candidate_group["context_support_count"]
    base_trace["exact_amount_support_count"] = top_candidate_group["exact_amount_support_count"]
    base_trace["support_signal_count"] = top_candidate_group["support_signal_count"]
    base_trace["independent_source_count"] = top_candidate_group["independent_source_count"]
    base_trace["direct_title_or_snippet_support_count"] = top_candidate_group[
        "direct_title_or_snippet_support_count"
    ]
    base_trace["page_text_support_count"] = top_candidate_group["page_text_support_count"]
    base_trace["page_text_used_for_identity"] = top_candidate_group["page_text_used_for_identity"]
    base_trace["independent_conflicting_amount_support_count"] = top_candidate_group[
        "independent_conflicting_amount_support_count"
    ]
    base_trace["top_score"] = top_candidate_group["max_score"]
    base_trace["checks"].update(
        {
            "identity_complete": True,
            "amount_allowed": True,
            "direct_title_or_snippet_match": bool(
                top_candidate_group["direct_title_or_snippet_support_count"] >= 2
            ),
            "source_trusted": bool(top_candidate_group["trusted_count"]),
            "multiple_evidence_agreement": bool(
                top_candidate_group["support_signal_count"] >= 3
                and top_candidate_group["independent_source_count"] >= 2
                and top_candidate_group["direct_title_or_snippet_support_count"] >= 2
                and (
                    top_candidate_group["independent_source_count"] > 2
                    or top_candidate_group["page_text_support_count"] >= 1
                )
            ),
            "conflict_check_passed": True,
        }
    )

    true_explicit_conflicts = [
        conflict
        for conflict in top_candidate_group["conflicting_denominations"]
        if conflict["support_count"] >= 2
    ]
    if true_explicit_conflicts:
        base_trace["conflicting_denominations"] = true_explicit_conflicts
        near_top_conflict = any(
            top_candidate_group["max_score"] - conflict["max_score"] <= 2.0
            for conflict in true_explicit_conflicts
        )
        reason = (
            "near_top_conflicting_denomination"
            if near_top_conflict
            else "mixed_denomination_lens_evidence"
        )
        base_trace["reason"] = reason
        base_trace["checks"]["conflict_check_passed"] = False
        return None, base_trace, [reason]

    same_currency_conflicts = []
    for other_key, other_group in ranked_groups[1:]:
        same_country_currency = other_key[:2] == top_candidate_key[:2]
        different_amount = other_key[2] != top_candidate_key[2]
        independently_supported = (
            other_group["exact_amount_support_count"] >= 2
            and other_group["direct_title_or_snippet_support_count"] >= 2
            and other_group["independent_source_count"] >= 2
        )
        if same_country_currency and different_amount and independently_supported:
            same_currency_conflicts.append((other_key, other_group))

    if same_currency_conflicts:
        base_trace["conflicting_denominations"] = [
            {
                "amount": key[2],
                "currency": key[1],
                "support_count": group["exact_amount_support_count"],
                "sources": sorted(
                    {
                        record["source_key"]
                        for record in group["records"]
                        if record["source_key"]
                    }
                ),
                "evidence_ranks": sorted(
                    {
                        int(record["evidence"].get("rank"))
                        for record in group["records"]
                        if str(record["evidence"].get("rank") or "").isdigit()
                    }
                ),
                "reason": "independent_conflicting_amount",
            }
            for key, group in same_currency_conflicts
        ]
        base_trace["independent_conflicting_amount_support_count"] = max(
            group["exact_amount_support_count"]
            for _key, group in same_currency_conflicts
        )
        near_top_conflict = any(
            top_candidate_group["max_score"] - other_group["max_score"] <= 2.0
            for _key, other_group in same_currency_conflicts
        )
        significant_mixed_evidence = any(
            other_group["max_score"] >= 7.0
            for _key, other_group in same_currency_conflicts
        )
        if near_top_conflict or significant_mixed_evidence:
            reason = (
                "near_top_conflicting_denomination"
                if near_top_conflict
                else "mixed_denomination_lens_evidence"
            )
            base_trace["reason"] = reason
            base_trace["checks"]["conflict_check_passed"] = False
            return None, base_trace, [reason]

    qualified = []
    for key, group in groups.items():
        # Original strict path: requires 3+ signal sources and 2+ independent trusted exact matches.
        multiple_agreement = (
            group["support_signal_count"] >= 3
            and group["independent_source_count"] >= 2
            and group["direct_title_or_snippet_support_count"] >= 2
            and group["exact_amount_support_count"] >= 2
            and group["independent_conflicting_amount_support_count"] < 2
            and (
                group["independent_source_count"] > 2
                or group["page_text_support_count"] >= 1
            )
        )
        # RC4: Relaxed path — handles YouTube+Wikipedia or similar weak+trusted combos.
        # Requires:
        #   - 2+ independent domains (trusted OR weak-exact combined)
        #   - Total exact signals (trusted direct + weak exact) >= 2
        #   - At least 1 trusted/non-weak exact source OR page_text confirmed
        #   - No dominant conflicting denomination (< 2 independent conflicting sources)
        total_exact_signals = (
            group["exact_amount_support_count"]
            + group.get("weak_exact_count", 0)
        )
        trusted_direct_exact = group["exact_amount_support_count"]  # non-weak sources
        has_trusted_anchor = (
            trusted_direct_exact >= 1
            or group["page_text_support_count"] >= 1
            or group.get("trusted_count", 0) >= 1
        )
        weak_multi_source = (
            not multiple_agreement
            and group["independent_source_count"] >= 2
            and total_exact_signals >= 2
            and has_trusted_anchor
            and group["independent_conflicting_amount_support_count"] < 2
        )
        if multiple_agreement or weak_multi_source:
            group["multiple_agreement"] = multiple_agreement or weak_multi_source
            group["weak_multi_source"] = weak_multi_source
            group["auxiliary_agreement"] = (
                (multiple_agreement or weak_multi_source)
                and group["auxiliary_support_count"] >= 1
            )
            if weak_multi_source:
                # Tag for transparency in trace
                group["promotion_path"] = "weak_multi_source"
            else:
                group["promotion_path"] = "strict_multi_agreement"
            qualified.append((key, group))

    if not qualified:
        if top_candidate_group["support_signal_count"] < 3:
            reason = "insufficient_support_signals"
        elif top_candidate_group["independent_source_count"] < 2:
            reason = "insufficient_independent_evidence"
        elif top_candidate_group["direct_title_or_snippet_support_count"] < 2:
            reason = "insufficient_direct_title_or_snippet_support"
        elif (
            top_candidate_group["independent_source_count"] == 2
            and top_candidate_group["page_text_support_count"] < 1
        ):
            reason = "page_text_support_required_for_two_sources"
        elif all(record["weak_source"] for record in candidates):
            reason = "weak_source_only"
        elif top_candidate_group["support_count"] <= 1:
            reason = "weak_single_lens_evidence"
        elif not any(record["signals"]["direct_match"] for record in candidates):
            reason = "direct_match_failed"
        elif len(candidates) >= 2 and any(record["score"] >= 7.0 for record in candidates):
            reason = "insufficient_independent_evidence"
        else:
            reason = "no_strong_evidence"
        base_trace["reason"] = reason
        return None, base_trace, [reason]

    qualified.sort(
        key=lambda entry: (
            entry[1]["support_signal_count"],
            entry[1]["independent_source_count"],
            entry[1]["direct_title_or_snippet_support_count"],
            entry[1]["exact_amount_support_count"],
            entry[1]["max_score"],
            entry[1]["trusted_count"],
        ),
        reverse=True,
    )
    top_key, top_group = qualified[0]
    base_trace["support_count"] = top_group["support_count"]
    base_trace["context_support_count"] = top_group["context_support_count"]
    base_trace["exact_amount_support_count"] = top_group["exact_amount_support_count"]
    base_trace["support_signal_count"] = top_group["support_signal_count"]
    base_trace["independent_source_count"] = top_group["independent_source_count"]
    base_trace["direct_title_or_snippet_support_count"] = top_group[
        "direct_title_or_snippet_support_count"
    ]
    base_trace["page_text_support_count"] = top_group["page_text_support_count"]
    base_trace["page_text_used_for_identity"] = top_group["page_text_used_for_identity"]
    base_trace["independent_conflicting_amount_support_count"] = top_group[
        "independent_conflicting_amount_support_count"
    ]

    for other_key, other_group in qualified[1:]:
        scores_are_close = abs(top_group["max_score"] - other_group["max_score"]) <= 1.5
        both_have_repeated_support = (
            len(top_group["records"]) >= 2 and len(other_group["records"]) >= 2
        )
        if other_key != top_key and (scores_are_close or both_have_repeated_support):
            base_trace["reason"] = "conflicting_evidence"
            base_trace["checks"]["conflict_check_passed"] = False
            return None, base_trace, ["conflicting_evidence"]

    best = max(
        top_group["records"],
        key=lambda record: (record["score"], int(record["trusted"])),
    )
    support_count = top_group["support_count"]
    confidence = min(
        0.95,
        max(0.65, 0.65 + min(best["score"], 10.0) / 50.0 + min(support_count - 1, 2) * 0.03),
    )
    if top_group.get("auxiliary_agreement"):
        confidence = min(confidence, 0.85)

    if top_group.get("weak_multi_source"):
        reason = "promoted_weak_multi_source_evidence"
    elif top_group.get("auxiliary_agreement"):
        reason = "promoted_from_lens_evidence"
    else:
        reason = "multiple_independent_evidence_agreement"

    selected_item = best["evidence"]
    selected_evidence = {
        key: selected_item.get(key)
        for key in (
            "provider", "bucket", "rank", "title", "source", "url", "domain",
            "score", "link_checked", "page_text_checked",
            "page_text_skip_reason", "page_text_excerpt_chars",
            "page_text_identity_terms",
        )
    }
    base_trace.update(
        {
            "promoted": True,
            "provider": selected_item.get("provider") or str(provider or "unknown").lower(),
            "reason": reason,
            "promotion_path": top_group.get("promotion_path", "strict"),
            "weak_exact_count": top_group.get("weak_exact_count", 0),
            "weak_independent_source_count": top_group.get("weak_independent_source_count", 0),
            "selected_identity": {
                "country": best["country"],
                "currency": best["currency"],
                "amount": best["amount"],
            },
            "selected_evidence": selected_evidence,
            "checks": {
                "identity_complete": True,
                "amount_allowed": True,
                "direct_title_or_snippet_match": bool(
                    top_group["direct_title_or_snippet_support_count"] >= 2
                ),
                "source_trusted": bool(best["trusted"]),
                "multiple_evidence_agreement": bool(top_group.get("multiple_agreement")),
                "conflict_check_passed": True,
                "page_text_checked": bool(base_trace["page_text_checked_count"]),
                "page_text_used_for_identity": bool(top_group["page_text_used_for_identity"]),
            },
            "matched_terms": best["signals"]["matched_terms"],
            "context_support_count": top_group["context_support_count"],
            "exact_amount_support_count": top_group["exact_amount_support_count"],
            "support_signal_count": top_group["support_signal_count"],
            "independent_source_count": top_group["independent_source_count"],
            "direct_title_or_snippet_support_count": top_group[
                "direct_title_or_snippet_support_count"
            ],
            "page_text_support_count": top_group["page_text_support_count"],
            "page_text_used_for_identity": top_group["page_text_used_for_identity"],
            "independent_conflicting_amount_support_count": top_group[
                "independent_conflicting_amount_support_count"
            ],
        }
    )

    promotion = {
        "country": best["country"],
        "currency": best["currency"],
        "amount": best["amount"],
        "confidence": round(confidence, 4),
        "support_count": support_count,
        "context_support_count": top_group["context_support_count"],
        "exact_amount_support_count": top_group["exact_amount_support_count"],
        "support_signal_count": top_group["support_signal_count"],
        "independent_source_count": top_group["independent_source_count"],
        "direct_title_or_snippet_support_count": top_group[
            "direct_title_or_snippet_support_count"
        ],
        "page_text_support_count": top_group["page_text_support_count"],
        "page_text_used_for_identity": top_group["page_text_used_for_identity"],
        "independent_conflicting_amount_support_count": top_group[
            "independent_conflicting_amount_support_count"
        ],
        "top_score": best["score"],
        "trusted_source": bool(best["trusted"]),
        "reason": reason,
        "selected_evidence": selected_evidence,
    }
    return promotion, base_trace, []


def _promote_identity_from_evidence(
    evidence: List[Dict[str, Any]],
) -> tuple[Optional[Dict[str, Any]], List[str]]:
    """Backward-compatible wrapper used by older tests/helpers."""
    promotion, _trace, errors = verify_lens_evidence_identity(evidence)
    return promotion, errors


def _amount_pattern(amount: int) -> str:
    digits = str(amount)
    groups = []
    while digits:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    return r"[.,\s]?".join(re.escape(group) for group in groups)


def _evidence_supports_identity(
    evidence: List[Dict[str, Any]],
    country: Any,
    currency: str,
    amount: int,
) -> bool:
    if not evidence:
        return False

    target_key = (_normalize_country_key(country), str(currency).upper(), amount)
    for item in evidence:
        candidate, _ = _structured_evidence_candidate(item)
        if not candidate:
            continue
        candidate_key = (
            candidate["country_key"],
            candidate["currency"],
            candidate["amount"],
        )
        has_ranked_support = (
            candidate["score"] >= 4.0
            or len(item.get("rank_reasons") or []) >= 3
        )
        if candidate_key == target_key and has_ranked_support:
            return True

    evidence_text = " ".join(_evidence_text(item) for item in evidence).lower()
    amount_supported = re.search(
        rf"(?<!\d){_amount_pattern(amount)}(?!\d)",
        evidence_text,
    ) is not None
    currency_supported = any(
        _contains_term(evidence_text, alias)
        for alias in CURRENCY_ALIASES.get(currency, [currency.lower()])
    )

    country_text = str(country or "").strip().lower()
    country_supported = False
    for country_name, aliases in COUNTRY_ALIASES.items():
        if country_text == country_name.lower():
            country_supported = any(_contains_term(evidence_text, alias) for alias in aliases)
            break

    default_country = CURRENCY_DEFAULT_COUNTRY.get(currency)
    if not country_supported and default_country and country_text in {
        default_country,
        default_country.replace("-", " "),
    }:
        country_supported = True

    positive_context = any(keyword in evidence_text for keyword in POSITIVE_BANKNOTE_KEYWORDS)
    ranked_visual_context = any(
        str(item.get("bucket") or "").lower() in {"exact_match", "visual_match"}
        for item in evidence
    )
    negative_context = any(keyword in evidence_text for keyword in NEGATIVE_EXCHANGE_KEYWORDS)

    if negative_context and not positive_context:
        return False
    return (
        amount_supported
        and currency_supported
        and country_supported
        and (positive_context or ranked_visual_context)
    )


def validate_agent3_identity(
    item: Dict[str, Any],
    evidence: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Normalize V1/V2 output and prevent unsupported Lens votes."""
    normalized = dict(item or {})
    status = str(normalized.get("status") or "").strip().lower()
    provider = str(normalized.get("provider") or "unknown").strip().lower() or "unknown"
    normalized_evidence = normalize_lens_evidence(
        evidence if evidence is not None else normalized.get("evidence") or [],
        provider=provider,
    )
    normalized["evidence"] = normalized_evidence
    normalized["provider"] = provider

    country = normalized.get("quoc_gia") or normalized.get("country")
    denomination = normalized.get("menh_gia") or normalized.get("denomination")
    currency = _normalize_currency_code(
        normalized.get("ma_tien_te")
        or normalized.get("currency")
        or normalized.get("currency_code")
        or _currency_from_denomination(denomination)
    )
    amount = _parse_amount_token(denomination)
    confidence_raw = normalized.get("do_tin_cay", normalized.get("confidence"))
    try:
        confidence = float(confidence_raw)
        confidence_valid = 0.0 <= confidence <= 1.0
    except (TypeError, ValueError):
        confidence = 0.0
        confidence_valid = False

    verified_identity, promotion_trace, verification_errors = verify_lens_evidence_identity(
        normalized_evidence,
        provider=provider,
    )
    normalized["promotion_trace"] = promotion_trace

    verification_reason = str(promotion_trace.get("reason") or "")
    confidence_cap_reasons = {
        "weak_single_lens_evidence",
        "mixed_denomination_lens_evidence",
        "near_top_conflicting_denomination",
        "insufficient_support_signals",
        "insufficient_independent_evidence",
        "insufficient_direct_title_or_snippet_support",
        "page_text_support_required_for_two_sources",
    }
    if not verified_identity and verification_reason in confidence_cap_reasons:
        if confidence_valid:
            confidence = min(confidence, 0.70)
        normalized["reason"] = verification_reason
        normalized["verification_source"] = promotion_trace.get(
            "verification_source", "title_snippet_metadata"
        )

    initial_identity_complete = (
        not _is_unknown_identity(country)
        and not _is_unknown_identity(currency)
        and is_valid_agent3_denomination(amount, currency)
        and _country_currency_consistent(country, currency)
    )
    initial_key = (_normalize_country_key(country), currency, amount)
    verified_key = (
        _normalize_country_key(verified_identity.get("country")),
        verified_identity.get("currency"),
        verified_identity.get("amount"),
    ) if verified_identity else None
    accepted_identity: Optional[Dict[str, Any]] = None

    if status in {"", "partial", "unknown"} and verified_identity:
        if initial_identity_complete and initial_key != verified_key:
            promotion_trace["promoted"] = False
            promotion_trace["reason"] = "initial_identity_conflict"
            verification_errors = ["initial_identity_conflict"]
        else:
            accepted_identity = verified_identity
    elif status == "completed" and verified_identity:
        if initial_identity_complete and initial_key == verified_key:
            accepted_identity = verified_identity
        elif not initial_identity_complete:
            promotion_trace["promoted"] = False
            promotion_trace["reason"] = "initial_identity_invalid"
            verification_errors = ["initial_identity_invalid"]
        else:
            promotion_trace["promoted"] = False
            promotion_trace["reason"] = "initial_identity_conflict"
            verification_errors = ["initial_identity_conflict"]

    if accepted_identity:
        country = accepted_identity["country"]
        currency = accepted_identity["currency"]
        amount = accepted_identity["amount"]
        denomination = f"{amount} {currency}"
        confidence = max(
            confidence if confidence_valid else 0.0,
            accepted_identity["confidence"],
        )
        if accepted_identity["reason"] == "promoted_from_lens_evidence":
            confidence = min(confidence, 0.85)
        confidence_valid = True
        status = "completed"
        normalized["evidence_promoted"] = True
        normalized["evidence_verified"] = True
        normalized["evidence_promotion"] = {
            "reason": accepted_identity["reason"],
            "support_count": accepted_identity["support_count"],
            "top_score": accepted_identity["top_score"],
            "trusted_source": accepted_identity["trusted_source"],
        }

    non_voting_statuses = {
        "failed", "fail", "error", "disabled", "partial", "unknown",
        "technical_error", "technical error", "no_source", "no source",
    }
    validation_errors: List[str] = []
    if not accepted_identity and status not in {
        "failed", "fail", "error", "disabled", "technical_error", "technical error",
    }:
        validation_errors.extend(verification_errors)
    if status in non_voting_statuses:
        validation_errors.append(f"non_voting_status:{status or 'unknown'}")
    if _is_unknown_identity(country):
        validation_errors.append("country_missing")
    if _is_unknown_identity(currency):
        validation_errors.append("currency_missing")
    if not is_valid_agent3_denomination(amount, currency):
        validation_errors.append("denomination_not_allowed")
    if not confidence_valid or confidence < 0.55:
        validation_errors.append("confidence_too_low")
    if not _country_currency_consistent(country, currency):
        validation_errors.append("country_currency_mismatch")
    if not normalized_evidence:
        validation_errors.append("no_source_evidence")
    elif not accepted_identity and amount is not None and currency:
        validation_errors.append("identity_not_supported_by_evidence")

    validation_errors = list(dict.fromkeys(validation_errors))

    identity_complete = (
        status == "completed"
        and accepted_identity is not None
        and not validation_errors
    )

    normalized["ma_tien_te"] = currency or UNKNOWN_IDENTITY
    normalized["currency_code"] = currency or UNKNOWN_IDENTITY
    normalized["do_tin_cay"] = confidence

    if identity_complete:
        normalized["quoc_gia"] = str(country).strip()
        normalized["menh_gia"] = f"{amount} {currency}"
        normalized["status"] = "Completed"
        normalized["not_counted_in_consensus"] = False
        normalized["validation_errors"] = []
        if accepted_identity:
            normalized["mo_ta"] = (
                "Google Lens xác nhận danh tính tiền giấy từ evidence mạnh đã xếp hạng."
            )
            if accepted_identity["reason"] == "promoted_from_lens_evidence":
                normalized["quan_diem"] = (
                    f"AG3 inferred identity from Lens evidence: {country} / "
                    f"{currency} / {amount}, supported by "
                    f"{accepted_identity['support_count']} consistent evidence items."
                )
            else:
                normalized["quan_diem"] = (
                    f"Promoted from Lens evidence: {country}, {amount} {currency}; "
                    f"top_score={accepted_identity['top_score']:.2f}, "
                    f"support_count={accepted_identity['support_count']}."
                )
            normalized.pop("error_type", None)
            normalized.pop("technical_error", None)
        return normalized

    if status == "disabled":
        normalized["status"] = "Disabled"
    elif status in {"failed", "fail", "error", "technical_error", "technical error"}:
        normalized["status"] = "Failed"
    else:
        normalized["status"] = "Partial"
    normalized["quoc_gia"] = UNKNOWN_IDENTITY
    normalized["menh_gia"] = UNKNOWN_IDENTITY
    normalized["ma_tien_te"] = UNKNOWN_IDENTITY
    normalized["currency_code"] = UNKNOWN_IDENTITY
    if normalized["status"] in {"Failed", "Disabled"}:
        normalized.setdefault("mo_ta", "Agent 3 không tạo được kết quả hợp lệ.")
        normalized.setdefault("quan_diem", normalized.get("mo_ta"))
    else:
        normalized["mo_ta"] = "Có bằng chứng nhưng không đủ chắc để tính phiếu."
        normalized["quan_diem"] = (
            "Google Lens có dữ liệu tham khảo nhưng danh tính tiền giấy chưa được "
            "evidence xác nhận đầy đủ."
        )
    normalized["not_counted_in_consensus"] = True
    normalized["validation_errors"] = validation_errors
    if "no_source_evidence" in validation_errors:
        normalized.setdefault("error_type", "no_source")
    else:
        normalized.setdefault("error_type", "insufficient_evidence")
    return normalized


def _extract_amount_currency(text: str) -> tuple[Optional[int], Optional[str]]:
    original_text = str(text or "")
    text_lower = text.lower()
    text_lower = text_lower.replace("one hundred", "100")
    text_lower = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", text_lower)
    
    amount = None
    currency = None

    explicit_code = _currency_from_denomination(original_text)
    foreign_dollar_context = _has_open_foreign_dollar_context(original_text)
    explicit_usd_terms = (
        "usd", "us dollar", "u.s. dollar", "đôla mỹ", "đô la mỹ",
    )
    if _has_explicit_vietnam_dong_context(original_text):
        currency = "VND"
    elif explicit_code:
        currency = explicit_code
    elif any(_contains_term(text_lower, term) for term in explicit_usd_terms):
        currency = "USD"
    elif not foreign_dollar_context and any(
        _contains_term(text_lower, term)
        for term in ("dollar", "dollars", "đôla", "đô la", "$")
    ):
        currency = "USD"
    else:
        for code, aliases in CURRENCY_ALIASES.items():
            if any(_contains_term(text_lower, alias) for alias in aliases):
                currency = code
                break

    dollar_match = re.search(r'\$(\d+(?:[.,]\d+)*)', text_lower)
    if dollar_match:
        context = text_lower[
            max(0, dollar_match.start() - 48):dollar_match.end() + 48
        ]
        if any(keyword in context for keyword in NEGATIVE_EXCHANGE_KEYWORDS):
            dollar_match = None

    if dollar_match:
        parsed_amount = _parse_amount_token(dollar_match.group(1))
        if not foreign_dollar_context and is_valid_agent3_denomination(parsed_amount, "USD"):
            amount = parsed_amount
            currency = "USD"
            return amount, currency
        
    amount_matches = list(
        re.finditer(
            r'(?<!\d)(\d{1,3}\s*[kK](?!\w)|\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)*)(?!\d)',
            text_lower,
        )
    )
    if amount_matches:
        for amount_match in amount_matches:
            a_str = amount_match.group(1)
            val = _parse_amount_token(a_str)
            if val is not None:
                context = text_lower[
                    max(0, amount_match.start() - 48):amount_match.end() + 48
                ]
                looks_like_year = (
                    1900 <= val <= 2099
                    and any(
                        marker in context
                        for marker in ("year", "issued", "issue date", "năm", "phát hành")
                    )
                )
                looks_like_price = any(
                    keyword in context for keyword in NEGATIVE_EXCHANGE_KEYWORDS
                )
                has_money_context = (
                    currency is not None
                    or any(keyword in context for keyword in POSITIVE_BANKNOTE_KEYWORDS)
                )
                if looks_like_year or looks_like_price or not has_money_context:
                    continue
                allowed_for_detected_currency = (
                    is_valid_agent3_denomination(val, currency)
                    if currency
                    else any(val in allowed for allowed in ALLOWED_DENOMINATIONS.values())
                )
                if allowed_for_detected_currency:
                    amount = val
                    break
                    
    return amount, currency


def parse_lens_evidence_without_llm(
    evidence_items: List[Dict[str, Any]],
    raw_lens_text: str = "",
) -> Dict[str, Any]:
    """
    Deterministic fallback parser for Google Lens evidence.
    It avoids calling any LLM when the formatter is unavailable.
    """
    evidence_items = [item for item in evidence_items or [] if isinstance(item, dict)]
    
    visible_text = []
    for item in evidence_items[:5]:
        title = str(item.get("title") or item.get("text") or "").strip()
        if title and title not in visible_text:
            visible_text.append(title[:160])
            
    combined_identity_text = " ".join(
        _evidence_text(item) for item in evidence_items
    )
    combined_text = combined_identity_text.lower()
    
    has_positive = any(kw in combined_text for kw in POSITIVE_BANKNOTE_KEYWORDS)
    has_negative = any(kw in combined_text for kw in NEGATIVE_EXCHANGE_KEYWORDS)
    
    strong_positive = False
    for item in evidence_items:
        txt = _evidence_identity_text(item).lower()
        if re.search(r'\b\d+\s+u\.s\.\s+dollar\s+note\b', txt) or \
           re.search(r'\b\d+\s+vietnamese\s+dong\s+banknote\b', txt) or \
           re.search(r'tờ tiền\s+\d+\.?\d*\s+đồng', txt):
            strong_positive = True
            break
            
    amount = None
    currency = None
    for item in evidence_items:
        txt = _evidence_identity_text(item)
        a, c = _extract_amount_currency(txt)
        if a and not amount:
            amount = a
        if c and not currency:
            currency = c
        if amount and currency:
            break
            
    if not amount or not currency:
        a, c = _extract_amount_currency(combined_identity_text)
        amount = amount or a
        currency = currency or c

    country = _select_identity_country(
        combined_text,
        currency=currency,
        amount=amount,
    )
            
    score = 0.0
    if has_positive or strong_positive:
        score += 0.3
    if amount:
        score += 0.2
    if currency:
        score += 0.1
    if country:
        score += 0.1
    
    if has_negative and not strong_positive:
        score -= 0.4
        
    if not amount or not currency:
        score -= 0.3
        
    confidence = max(0.0, min(1.0, score + 0.1))
    
    is_completed = (
        amount
        and currency
        and country
        and confidence >= 0.65
        and (not has_negative or strong_positive)
    )
    status = "Completed" if is_completed else "Partial"
    
    features = []
    if country: features.append(f"country:{country}")
    if currency: features.append(f"currency:{currency}")
    if amount: features.append(f"amount:{amount}")
    features.append(f"evidence_count:{len(evidence_items)}")
    
    if is_completed:
        denomination = f"{amount} {currency}"
        description = (
            f"Google Lens evidence mentions {country or 'unknown'} / {currency} and amount {amount}. "
            "Result was parsed deterministically."
        )
    else:
        denomination = "Không xác định"
        description = (
            "Google Lens returned raw evidence, but deterministic parser could not "
            "identify denomination confidently due to insufficient context or exchange rate noises."
        )

    result = {
        "quoc_gia": country or "Không xác định",
        "ma_tien_te": currency or "Không xác định",
        "menh_gia": denomination,
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": description,
        "quan_diem": description,
        "phuong_phap": "Google Lens SerpApi parser fallback",
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": visible_text,
        "dac_diem_chinh": features,
        "status": status,
        "provider": "serpapi",
        "raw_text": raw_lens_text,
        "evidence": evidence_items[:5],
        "formatter_fallback": True,
    }
    return validate_agent3_identity(result, evidence=evidence_items[:5])


def build_agreed_vision_candidate(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    *,
    allow_single_valid: bool = False,
) -> tuple[Optional[Dict[str, Any]], str]:
    """Build a candidate from two matching votes or one valid rescue vote."""
    results = [agent1_result or {}, agent2_result or {}]
    normalized_votes = [normalize_agent_vote(item) for item in results]
    valid_indexes = [
        index
        for index, (item, vote) in enumerate(zip(results, normalized_votes))
        if (
            str(item.get("status") or "").strip().casefold() == "completed"
            and not bool(item.get("not_counted_in_consensus"))
            and vote.get("vote_key") is not None
        )
    ]
    if len(valid_indexes) == 2 and (
        normalized_votes[0].get("vote_key") != normalized_votes[1].get("vote_key")
    ):
        return None, "vision_agents_not_agreed"
    if not valid_indexes:
        return None, "vision_agents_not_agreed"
    if len(valid_indexes) == 1 and not allow_single_valid:
        return None, "only_one_vision_agent_valid"

    selected_index = valid_indexes[0]
    vote = normalized_votes[selected_index]
    vote_key = vote.get("vote_key")

    material = ""
    if len(valid_indexes) == 2:
        material_values = [
            str(item.get("chat_lieu") or item.get("material") or "").strip()
            for item in results
        ]
        if (
            material_values[0]
            and material_values[0].casefold() == material_values[1].casefold()
            and not _is_unknown_identity(material_values[0])
        ):
            material = material_values[0]

    agreed_visible_text: List[str] = []
    if len(valid_indexes) == 2:
        visible_lists = []
        for item in results:
            values = item.get("van_ban_nhin_thay") or item.get("visible_text") or []
            if not isinstance(values, (list, tuple)):
                values = [values]
            visible_lists.append([
                _compact_text(value, 80)
                for value in values
                if _compact_text(value, 80)
            ])
        second_visible = {value.casefold() for value in visible_lists[1]}
        agreed_visible_text = [
            value for value in visible_lists[0]
            if value.casefold() in second_visible
        ][:3]

    return {
        "country": vote.get("country"),
        "currency": vote.get("currency_code"),
        "amount": int(vote.get("amount")),
        "denomination": f"{int(vote.get('amount'))} {vote.get('currency_code')}",
        "material": material,
        "visible_text": agreed_visible_text,
        "vote_key": list(vote_key),
    }, (
        "vision_agents_agreed"
        if len(valid_indexes) == 2
        else "single_vision_candidate_for_rescue"
    )


def resolve_candidate_verification_mode(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
) -> str:
    """Select latency policy without running retrieval."""
    matched_candidate, matched_reason = build_agreed_vision_candidate(
        agent1_result,
        agent2_result,
    )
    if matched_candidate:
        return "fast_race_to_3"
    if matched_reason == "vision_agents_not_agreed":
        completed_count = sum(
            str(item.get("status") or "").strip().casefold() == "completed"
            and not bool(item.get("not_counted_in_consensus"))
            for item in (agent1_result or {}, agent2_result or {})
        )
        if completed_count == 2:
            return "skip"
    rescue_candidate, _reason = build_agreed_vision_candidate(
        agent1_result,
        agent2_result,
        allow_single_valid=True,
    )
    return "rescue_consensus" if rescue_candidate else "skip"


def build_candidate_verification_queries(candidate: Dict[str, Any]) -> List[str]:
    """Generate bounded, general banknote queries from an agreed candidate."""
    try:
        amount = int(candidate.get("amount"))
    except (TypeError, ValueError):
        return []
    currency = str(candidate.get("currency") or "").strip().upper()
    country = _compact_text(candidate.get("country"), 80)
    if amount <= 0 or not re.fullmatch(r"[A-Z]{3}", currency):
        return []

    material = _compact_text(candidate.get("material"), 40)
    currency_name = CURRENCY_QUERY_NAMES.get(currency, currency)
    formatted_amount = f"{amount:,}".replace(",", ".")
    queries: List[str] = []

    if currency == "VND":
        queries.extend([
            " ".join(part for part in ("tờ", formatted_amount, "đồng", material) if part),
            " ".join(part for part in (formatted_amount, "đồng", material, "Việt Nam") if part),
            " ".join(part for part in ("Ngân hàng Nhà nước Việt Nam", formatted_amount, "đồng", material) if part),
        ])

    queries.extend([
        f"{amount} {currency} banknote",
        " ".join(part for part in (country, str(amount), currency, "banknote") if part),
        f"{amount} {currency_name} note",
    ])

    visible_text = " ".join(candidate.get("visible_text") or [])
    if visible_text:
        queries.append(
            " ".join(part for part in (country, str(amount), currency, visible_text, "banknote") if part)
        )

    unique_queries = []
    seen = set()
    for query in queries:
        compact = _compact_text(query, 180)
        key = compact.casefold()
        if compact and key not in seen:
            seen.add(key)
            unique_queries.append(compact)
    return unique_queries[:5]


async def _default_candidate_web_search(
    query: str,
    timeout_seconds: float,
) -> List[Dict[str, Any]]:
    """Run one bounded SerpAPI organic search; tests inject a mock searcher."""
    if not settings.SERPAPI_KEY:
        return []

    def _search() -> Any:
        return requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google",
                "q": query,
                "api_key": settings.SERPAPI_KEY,
                "hl": "vi",
                "num": CANDIDATE_SEARCH_RESULTS_PER_QUERY,
                "no_cache": str(_serpapi_no_cache_enabled()).lower(),
            },
            timeout=max(0.1, float(timeout_seconds)),
        )

    response = await asyncio.to_thread(_search)
    try:
        payload = response.json()
    except Exception as exc:
        raise RuntimeError("Candidate verification search returned invalid JSON.") from exc
    if response.status_code != 200 or payload.get("error"):
        provider_message = str(payload.get("error") or "provider request failed")
        error_type = _classify_serpapi_error(
            provider_message,
            status_code=response.status_code,
        )
        raise SerpApiProviderError(
            f"Candidate verification SerpAPI {error_type}.",
            error_type=error_type,
            status_code=response.status_code,
        )

    output = []
    for item in list(payload.get("organic_results") or [])[:CANDIDATE_SEARCH_RESULTS_PER_QUERY]:
        if not isinstance(item, dict):
            continue
        output.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "source": item.get("source") or item.get("displayed_link") or "",
            "url": item.get("link", ""),
        })
    return output


async def retrieve_candidate_verification_evidence(
    candidate: Dict[str, Any],
    *,
    queries: Optional[List[str]] = None,
    searcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    page_fetcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    deadline: Optional[float] = None,
    mode: str = "rescue_consensus",
) -> List[Dict[str, Any]]:
    """Retrieve and enrich independent web evidence without trusting the candidate."""
    from app.services.evidence_ranker_service import rank_lens_evidence

    deadline = deadline or (time.monotonic() + CANDIDATE_VERIFICATION_BUDGET_SECONDS)
    searcher = searcher or _default_candidate_web_search
    queries = list(queries or build_candidate_verification_queries(candidate))
    collected: List[Dict[str, Any]] = []
    seen = set()
    fast_mode = mode == "fast_race_to_3"
    query_limit = 1 if fast_mode else CANDIDATE_SEARCH_QUERY_LIMIT
    search_timeout_cap = 1.25 if fast_mode else 3.0
    search_reserve_seconds = 0.9 if fast_mode else 1.0
    page_min_budget = 0.35 if fast_mode else PAGE_TEXT_MIN_BUDGET_SECONDS
    page_timeout = 0.75 if fast_mode else PAGE_TEXT_TIMEOUT_SECONDS
    page_max_urls = 1 if fast_mode else PAGE_TEXT_MAX_URLS

    for query in queries[:query_limit]:
        timeout_seconds = _stage_timeout(
            deadline,
            search_timeout_cap,
            reserve_seconds=search_reserve_seconds,
        )
        response = searcher(query, timeout_seconds)
        if inspect.isawaitable(response):
            response = await asyncio.wait_for(response, timeout=timeout_seconds)
        if isinstance(response, dict):
            response = response.get("organic_results") or response.get("results") or []
        for raw_item in response or []:
            if not isinstance(raw_item, dict):
                continue
            item = dict(raw_item)
            item["provider"] = item.get("provider") or "candidate_verification"
            item["query"] = query
            item["evidence_type"] = "candidate_verification"
            item["is_candidate_assisted"] = True
            key = (
                str(item.get("url") or item.get("link") or "").strip().casefold()
                or "|".join((
                    str(item.get("source") or "").strip().casefold(),
                    str(item.get("title") or "").strip().casefold(),
                ))
            )
            if key and key not in seen:
                seen.add(key)
                collected.append(item)
            if len(collected) >= CANDIDATE_SEARCH_RESULTS_PER_QUERY:
                break
        if len(collected) >= 2:
            break

    ranked = rank_lens_evidence(collected, context="")[:5]
    if not ranked or _remaining_budget(deadline) < page_min_budget:
        return ranked

    page_eligible = []
    page_skipped = []
    for item in ranked:
        if _evidence_noise_reason(item) or _is_weak_evidence(item):
            skipped = dict(item)
            skipped["page_text_checked"] = "skipped"
            skipped["page_text_skip_reason"] = "candidate_noise_or_weak_source"
            skipped["page_text_excerpt"] = ""
            skipped["page_text_excerpt_chars"] = 0
            skipped["page_text_identity_terms"] = []
            page_skipped.append(skipped)
        else:
            page_eligible.append(item)
    if not page_eligible:
        return rank_lens_evidence(page_skipped, context="")[:5]

    enriched = await enrich_lens_evidence_with_page_text(
        page_eligible,
        deadline=deadline,
        max_urls=page_max_urls,
        timeout_seconds=page_timeout,
        min_budget_seconds=page_min_budget,
        fetcher=page_fetcher,
    )
    return rank_lens_evidence(enriched + page_skipped, context="")[:5]


def _candidate_lens_weak(agent3_result: Dict[str, Any]) -> tuple[bool, str]:
    status = str(agent3_result.get("status") or "").strip().casefold()
    trace = dict(agent3_result.get("promotion_trace") or {})
    provider_trace = dict(agent3_result.get("provider_trace") or {})
    reason = str(trace.get("reason") or agent3_result.get("reason") or "")
    error_type = str(
        agent3_result.get("error_type")
        or provider_trace.get("primary_error_type")
        or ""
    ).strip().casefold()
    strong_conflicts = {
        "near_top_conflicting_denomination",
        "mixed_denomination_lens_evidence",
        "conflicting_evidence",
        "initial_identity_conflict",
    }
    if reason in strong_conflicts or trace.get("checks", {}).get("conflict_check_passed") is False:
        return False, "strong_lens_conflict"
    if status == "completed" and not bool(agent3_result.get("not_counted_in_consensus")):
        return False, "lens_support_not_weak"
    if error_type in {"rate_limit", "provider_quota_exhausted"}:
        return False, "provider_quota_exhausted"
    if bool(agent3_result.get("technical_error")):
        return False, "lens_technical_error"
    if status == "partial":
        return True, reason or "lens_partial"
    if reason in {
        "insufficient_support_signals",
        "insufficient_independent_evidence",
        "insufficient_direct_title_or_snippet_support",
        "page_text_support_required_for_two_sources",
        "weak_source_only",
        "weak_single_lens_evidence",
        "noise_only",
    }:
        return True, reason
    evidence_count = len(agent3_result.get("evidence") or [])
    support_count = int(trace.get("support_signal_count") or 0)
    if evidence_count > 0 and support_count < 3:
        return True, "insufficient_support_signals"
    return False, "lens_result_not_eligible"


def _attach_candidate_verification_trace(
    result: Dict[str, Any],
    *,
    attempted: bool,
    reason: str,
    candidate: Optional[Dict[str, Any]],
    queries: List[str],
    candidate_evidence_count: int = 0,
    candidate_trace: Optional[Dict[str, Any]] = None,
    used_for_vote: bool = False,
    lens_support_weak: bool = False,
    provider: str = "none",
    skipped_reason: Optional[str] = None,
    mode: str = "skip",
    timeout_seconds: float = 0.0,
) -> Dict[str, Any]:
    output = dict(result or {})
    candidate_trace = dict(candidate_trace or {})
    promotion_trace = dict(output.get("promotion_trace") or {})
    promotion_trace.update({
        "candidate_verification_attempted": bool(attempted),
        "candidate_verification_reason": reason,
        "candidate_identity": candidate,
        "candidate_queries": list(queries),
        "candidate_evidence_count": int(candidate_evidence_count),
        "candidate_verification_support_count": int(candidate_trace.get("support_count") or 0),
        "candidate_support_signal_count": int(candidate_trace.get("support_signal_count") or 0),
        "candidate_independent_source_count": int(candidate_trace.get("independent_source_count") or 0),
        "candidate_used_for_vote": bool(used_for_vote),
        "candidate_verification_mode": mode,
        "candidate_verification_timeout_seconds": round(float(timeout_seconds), 3),
    })
    output["promotion_trace"] = promotion_trace

    provider_trace = dict(output.get("provider_trace") or {})
    provider_trace.update({
        "lens_support_weak": bool(lens_support_weak),
        "candidate_verification_provider": provider,
        "candidate_verification_skipped_reason": skipped_reason,
    })
    output["provider_trace"] = provider_trace
    return output


async def run_candidate_assisted_verification(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    searcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    page_fetcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    deadline: Optional[float] = None,
    mode: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """Verify an agreed AG1/AG2 candidate with independent web evidence."""
    from app.services.evidence_ranker_service import rank_lens_evidence

    original = dict(agent3_result or {})
    mode = mode or resolve_candidate_verification_mode(
        agent1_result,
        agent2_result,
    )
    if timeout_seconds is None:
        timeout_seconds = (
            FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
            if mode == "fast_race_to_3"
            else RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
            if mode == "rescue_consensus"
            else 0.0
        )
    candidate, agreement_reason = build_agreed_vision_candidate(
        agent1_result,
        agent2_result,
        allow_single_valid=mode == "rescue_consensus",
    )
    if not candidate:
        return _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason=agreement_reason,
            candidate=None,
            queries=[],
            provider="none",
            skipped_reason=agreement_reason,
            mode="skip",
            timeout_seconds=0.0,
        )

    lens_weak, lens_reason = _candidate_lens_weak(original)
    queries = build_candidate_verification_queries(candidate)
    if not lens_weak:
        return _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason=lens_reason,
            candidate=candidate,
            queries=queries,
            provider="none",
            skipped_reason=lens_reason,
            mode=mode,
            timeout_seconds=timeout_seconds,
        )

    provider = "candidate_verification" if searcher is not None else "serpapi_web"
    if searcher is None and not settings.SERPAPI_KEY:
        return _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason="candidate_provider_unavailable",
            candidate=candidate,
            queries=queries,
            lens_support_weak=True,
            provider=provider,
            skipped_reason="missing_api_key",
            mode=mode,
            timeout_seconds=timeout_seconds,
        )

    deadline = deadline or (time.monotonic() + max(0.1, float(timeout_seconds)))
    try:
        candidate_evidence = await retrieve_candidate_verification_evidence(
            candidate,
            queries=queries,
            searcher=searcher,
            page_fetcher=page_fetcher,
            deadline=deadline,
            mode=mode,
        )
    except (asyncio.TimeoutError, TimeoutError):
        return build_candidate_verification_timeout_result(
            agent1_result,
            agent2_result,
            original,
            mode=mode,
            timeout_seconds=timeout_seconds,
        )
    except Exception as exc:
        return _attach_candidate_verification_trace(
            original,
            attempted=True,
            reason="candidate_provider_error",
            candidate=candidate,
            queries=queries,
            lens_support_weak=True,
            provider=provider,
            skipped_reason=exc.__class__.__name__,
            mode=mode,
            timeout_seconds=timeout_seconds,
        )

    _candidate_identity, candidate_trace, _candidate_errors = verify_lens_evidence_identity(
        candidate_evidence,
        provider=provider,
    )
    combined_evidence = rank_lens_evidence(
        list(original.get("evidence") or []) + candidate_evidence,
        context="",
    )[:5]
    candidate_payload = dict(original)
    candidate_payload["status"] = "Partial"
    candidate_payload["not_counted_in_consensus"] = True
    candidate_payload["evidence"] = combined_evidence
    validated = validate_agent3_identity(candidate_payload, evidence=combined_evidence)

    validated_vote = normalize_agent_vote(validated)
    candidate_vote_key = tuple(candidate.get("vote_key") or [])
    used_for_vote = bool(
        str(validated.get("status") or "").casefold() == "completed"
        and not bool(validated.get("not_counted_in_consensus"))
        and validated_vote.get("vote_key") == candidate_vote_key
    )
    if str(validated.get("status") or "").casefold() == "completed" and not used_for_vote:
        validated = dict(original)
        validated["evidence"] = combined_evidence

    if used_for_vote:
        reason = (
            "promoted_to_3_of_3"
            if mode == "fast_race_to_3"
            else "rescued_consensus"
        )
    else:
        reason = "insufficient_external_support"
    return _attach_candidate_verification_trace(
        validated,
        attempted=True,
        reason=reason,
        candidate=candidate,
        queries=queries,
        candidate_evidence_count=len(candidate_evidence),
        candidate_trace=candidate_trace,
        used_for_vote=used_for_vote,
        lens_support_weak=True,
        provider=provider,
        skipped_reason=None,
        mode=mode,
        timeout_seconds=timeout_seconds,
    )


def build_candidate_verification_timeout_result(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    mode: str,
    timeout_seconds: float,
) -> Dict[str, Any]:
    """Preserve AG3 and attach deterministic trace when the outer race expires."""
    candidate, _reason = build_agreed_vision_candidate(
        agent1_result,
        agent2_result,
        allow_single_valid=mode == "rescue_consensus",
    )
    queries = build_candidate_verification_queries(candidate or {})
    reason = "fast_timeout" if mode == "fast_race_to_3" else "rescue_timeout"
    return _attach_candidate_verification_trace(
        dict(agent3_result or {}),
        attempted=True,
        reason=reason,
        candidate=candidate,
        queries=queries,
        used_for_vote=False,
        lens_support_weak=True,
        provider="serpapi_web",
        skipped_reason=reason,
        mode=mode,
        timeout_seconds=timeout_seconds,
    )


class Agent3Lens(BaseAgent):
    def __init__(self):
        super().__init__(agent_name="Agent 3 (Google Lens SerpApi)")

    def upload_to_imgbb(
        self,
        image_bytes: bytes,
        timeout_seconds: float = 10.0,
    ) -> Optional[str]:
        try:
            if not settings.IMGBB_API_KEY:
                print(f"[{self.agent_name}] Thiếu IMGBB_API_KEY")
                return None

            upload_url = "https://api.imgbb.com/1/upload"
            res = requests.post(
                upload_url,
                data={"key": settings.IMGBB_API_KEY},
                files={"image": image_bytes},
                timeout=max(0.1, float(timeout_seconds)),
            )
            data = res.json()
            if "data" in data and "url" in data["data"]:
                return data["data"]["url"]

            print(f"[{self.agent_name}] Lỗi ImgBB Response: {data}")
            return None
        except Exception as e:
            print(f"[{self.agent_name}] Lỗi ImgBB Network: {e}")
            return None

    def _call_serpapi_google_lens(
        self,
        image_url: str,
        timeout_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not settings.SERPAPI_KEY:
            raise RuntimeError("Thiếu SERPAPI_KEY trong settings.")

        params = {
            "engine": "google_lens",
            "url": image_url,
            "api_key": settings.SERPAPI_KEY,
            "hl": "vi",
            "country": "vn",
            "type": "all",
            "no_cache": str(_serpapi_no_cache_enabled()).lower(),
        }

        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=max(
                0.1,
                float(
                    timeout_seconds
                    if timeout_seconds is not None
                    else getattr(settings, "AGENT3_SERPAPI_TIMEOUT_SECONDS", 20) or 20
                ),
            ),
        )

        try:
            data = response.json()
        except Exception:
            raise RuntimeError(f"SerpApi không trả JSON hợp lệ: {response.text[:500]}")

        if response.status_code != 200:
            provider_message = str(data.get("error") or data)
            error_type = _classify_serpapi_error(
                provider_message,
                status_code=response.status_code,
            )
            raise SerpApiProviderError(
                f"SerpApi HTTP {response.status_code}: {provider_message}",
                error_type=error_type,
                status_code=response.status_code,
            )
        if "error" in data:
            provider_message = str(data.get("error"))
            error_type = _classify_serpapi_error(provider_message)
            raise SerpApiProviderError(
                f"SerpApi error: {provider_message}",
                error_type=error_type,
            )

        return data

    def _compact_serpapi_result(self, data: Dict[str, Any]) -> Dict[str, Any]:
        compact = {
            "knowledge_graph": None,
            "text_results": [],
            "visual_matches": [],
            "exact_matches": [],
            "reverse_image_search": [],
        }

        kg = data.get("knowledge_graph")
        if isinstance(kg, dict):
            compact["knowledge_graph"] = {
                "title": kg.get("title"),
                "subtitle": kg.get("subtitle"),
                "description": kg.get("description"),
                "source": kg.get("source"),
                "link": kg.get("link"),
            }

        text_results = data.get("text_results") or data.get("text") or []
        if isinstance(text_results, list):
            for item in text_results[:10]:
                if isinstance(item, dict):
                    compact["text_results"].append({
                        "text": item.get("text") or item.get("title"),
                        "link": item.get("link"),
                    })

        visual_matches = data.get("visual_matches") or []
        if isinstance(visual_matches, list):
            for item in visual_matches[:12]:
                if isinstance(item, dict):
                    compact["visual_matches"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                        "snippet": item.get("snippet"),
                    })

        exact_matches = data.get("exact_matches") or []
        if isinstance(exact_matches, list):
            for item in exact_matches[:12]:
                if isinstance(item, dict):
                    compact["exact_matches"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                        "snippet": item.get("snippet"),
                    })

        image_sources = data.get("image_sources") or data.get("reverse_image_search") or []
        if isinstance(image_sources, list):
            for item in image_sources[:10]:
                if isinstance(item, dict):
                    compact["reverse_image_search"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                    })

        return compact

    def _has_useful_lens_data(self, compact: Dict[str, Any]) -> bool:
        if compact.get("knowledge_graph"):
            return True
        for key in ["text_results", "visual_matches", "exact_matches", "reverse_image_search"]:
            items = compact.get(key)
            if isinstance(items, list) and len(items) > 0:
                return True
        return False

    def build_visual_search_result(
        self,
        raw_lens_text: Optional[str] = None,
        formatted_result: Optional[dict] = None,
        error: Optional[Exception] = None,
        evidence: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        if formatted_result:
            validated = validate_agent3_identity(formatted_result, evidence=evidence)
            validated["raw_text"] = raw_lens_text
            return json.dumps([validated], ensure_ascii=False)

        if raw_lens_text:
            fallback_data = {
                "quoc_gia": "Không xác định",
                "ma_tien_te": "Không xác định",
                "menh_gia": "Không xác định",
                "mat_tien": "Không xác định",
                "nam_phat_hanh": "Không xác định",
                "chat_lieu": "Không xác định",
                "mo_ta": raw_lens_text[:500],
                "quan_diem": "Google Lens/SerpApi đã trả về dữ liệu thô, nhưng bước format bằng LLM không chốt được. Hệ thống giữ raw_text để hỗ trợ đối chiếu thủ công.",
                "phuong_phap": "Google Lens SerpApi raw fallback",
                "do_tin_cay": 0.25,
                "van_ban_nhin_thay": [],
                "dac_diem_chinh": [],
                "status": "Partial",
                "provider": "serpapi",
                "error_type": "no_source",
                "raw_text": raw_lens_text,
            }
            if evidence is not None:
                fallback_data["evidence"] = evidence
            validated = validate_agent3_identity(fallback_data, evidence=evidence or [])
            return json.dumps([validated], ensure_ascii=False)

        provider_error_type = _classify_serpapi_error(error)
        provider_message = (
            "SerpAPI quota or rate limit was exhausted; Agent 3 could not "
            "retrieve Lens evidence."
            if provider_error_type == "rate_limit"
            else (
                f"{self.agent_name} provider error: "
                f"{error.__class__.__name__ if error else 'unknown_error'}."
            )
        )
        failed_data = {
            "quoc_gia": "Lỗi",
            "ma_tien_te": "Lỗi",
            "menh_gia": "Lỗi",
            "mat_tien": "Lỗi",
            "nam_phat_hanh": "Lỗi",
            "chat_lieu": "Lỗi",
            "mo_ta": "Lỗi",
            "quan_diem": f"{self.agent_name} gặp sự cố: {error or 'Không lấy được dữ liệu Google Lens.'}",
            "phuong_phap": self.agent_name,
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed",
            "provider": "serpapi",
            "error_type": "technical_error",
            "technical_error": True,
        }
        failed_data.update(
            {
                "mo_ta": provider_message,
                "quan_diem": provider_message,
                "error_type": provider_error_type,
                "provider_trace": {
                    "primary_provider": "serpapi",
                    "primary_error_type": provider_error_type,
                    "serpapi_no_cache": _serpapi_no_cache_enabled(),
                },
            }
        )
        if evidence is not None:
            failed_data["evidence"] = evidence
        validated = validate_agent3_identity(failed_data, evidence=evidence or [])
        return json.dumps([validated], ensure_ascii=False)

    def parse_formatted_result(self, formatted_json_text: str, raw_lens_data: str, evidence: Optional[List[Dict[str, Any]]] = None) -> str:
        try:
            parsed = json.loads(formatted_json_text)
            item = parsed[0] if isinstance(parsed, list) and parsed else parsed

            if not isinstance(item, dict):
                return self.build_visual_search_result(raw_lens_text=raw_lens_data, evidence=evidence)

            item.setdefault("quoc_gia", "Không xác định")
            item.setdefault("ma_tien_te", "Không xác định")
            item.setdefault("menh_gia", "Không xác định")
            item.setdefault("mat_tien", "Không xác định")
            item.setdefault("nam_phat_hanh", "Không xác định")
            item.setdefault("chat_lieu", "Không xác định")
            item.setdefault("mo_ta", "Không có mô tả.")
            item.setdefault("quan_diem", "Không có lập luận.")
            item.setdefault("phuong_phap", "Google Lens SerpApi")
            item.setdefault("do_tin_cay", 0.5)
            item.setdefault("van_ban_nhin_thay", [])
            item.setdefault("dac_diem_chinh", [])
            item.setdefault("status", "Completed")
            item["raw_text"] = raw_lens_data
            item = validate_agent3_identity(item, evidence=evidence)
            return json.dumps([item], ensure_ascii=False)

        except Exception as e:
            print(f"[{self.agent_name}] Lỗi parse formatted Lens result: {e}")
            return self.build_visual_search_result(raw_lens_text=raw_lens_data, error=e, evidence=evidence)

    async def _format_lens_results_with_llm(
        self,
        compact_lens_data: Dict[str, Any],
        context: str = "",
        debug_log: Optional[Dict] = None,
        timeout_seconds: Optional[float] = None,
    ) -> str:
        raw_lens_data = json.dumps(compact_lens_data, ensure_ascii=False, indent=2)

        prompt_format = f"""
Bạn là Agent 3 trong hệ thống nhận diện tiền giấy.

Dữ liệu dưới đây là kết quả Google Lens lấy qua SerpApi:
{raw_lens_data}

Nhiệm vụ:
- Dựa trên tiêu đề, nguồn, link, snippet, exact matches, visual matches, knowledge graph nếu có.
- Suy luận xem ảnh là tờ tiền nào.
- Chỉ nhận định khi dữ liệu Lens thật sự liên quan đến tiền giấy.
- Nếu dữ liệu không đủ liên quan đến tiền giấy, trả "Không xác định".
- Không được bịa mệnh giá nếu Lens không có bằng chứng.
- Ưu tiên các nguồn có tiêu đề/link/snippet nhắc đến banknote, currency, VND, Vietnam, money, tiền, đồng, mệnh giá.
- Nếu có nhiều kết quả mâu thuẫn, nêu rõ trong "quan_diem".

Context từ vòng tranh biện trước nếu có:
{context}

Format bắt buộc:
{JSON_TEMPLATE}

Quy tắc:
- Chỉ trả JSON hợp lệ.
- Không markdown.
- Field "phuong_phap" ghi: "Google Lens SerpApi".
- Field "do_tin_cay" từ 0.0 đến 1.0.
"""
        if debug_log is not None:
            debug_log["prompt_sent"] = prompt_format
        # 🌟 CẬP NHẬT 1: Chuyển sang model lite để né Quota và phản hồi nhanh hơn
        # 🌟 CẬP NHẬT 2: Sử dụng GenerateContentConfig để ép trả về JSON cấu trúc sạch
        formatter_timeout = max(
            0.1,
            float(
                timeout_seconds
                if timeout_seconds is not None
                else getattr(settings, "AGENT3_FORMATTER_TIMEOUT_SECONDS", 10) or 10
            ),
        )

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    get_gemini_client().models.generate_content,
                    model="gemini-2.5-flash-lite",
                    contents=[prompt_format],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                ),
                timeout=formatter_timeout,
            )
        except asyncio.TimeoutError:
            raise RuntimeError(f"Gemini Lens format call timeout after {formatter_timeout}s.")

        raw_response = response.text or ""
        if debug_log is not None:
            debug_log["raw_response"] = raw_response

        return clean_json(raw_response)

    async def run(
        self,
        image_bytes: bytes,
        context: str = "",
        debug_log: Optional[Dict] = None,
        deadline: Optional[float] = None,
    ) -> str:
        run_started_at = time.monotonic()
        deadline = _ensure_deadline(deadline)
        stage_trace: List[Dict[str, Any]] = []
        current_stage = "preflight"
        evidence_snapshot: List[Dict[str, Any]] = []
        raw_lens_data = ""
        if not settings.IMGBB_API_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu IMGBB_API_KEY"))

        if not settings.SERPAPI_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu SERPAPI_KEY"))

        try:
            print(f"[{self.agent_name}] Upload ảnh lên ImgBB...")
            current_stage = "upload"
            upload_started = time.monotonic()
            upload_timeout = _stage_timeout(deadline, 10.0)
            image_url = await asyncio.wait_for(
                asyncio.to_thread(
                    self.upload_to_imgbb,
                    image_bytes,
                    upload_timeout,
                ),
                timeout=upload_timeout,
            )
            upload_ms = int((time.monotonic() - upload_started) * 1000)
            print(f"[Agent3Timing] upload_ms={upload_ms}")
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="upload",
                started_at=upload_started,
                deadline=deadline,
            )

            if not image_url:
                return self.build_visual_search_result(error=Exception("Upload ImgBB thất bại, không có image_url."))

            print(f"[{self.agent_name}] Gọi SerpApi Google Lens...")
            current_stage = "serpapi"
            serpapi_started = time.monotonic()
            serpapi_data = None
            serpapi_last_error = None
            serpapi_retries = max(0, int(getattr(settings, "AGENT3_SERPAPI_MAX_RETRIES", 1) or 0))
            serpapi_attempts = serpapi_retries + 1

            for serpapi_attempt in range(serpapi_attempts):
                try:
                    configured_timeout = float(
                        getattr(settings, "AGENT3_SERPAPI_TIMEOUT_SECONDS", 20) or 20
                    )
                    serpapi_timeout = _stage_timeout(deadline, configured_timeout)
                    serpapi_data = await asyncio.wait_for(
                        asyncio.to_thread(
                            self._call_serpapi_google_lens,
                            image_url,
                            serpapi_timeout,
                        ),
                        timeout=serpapi_timeout,
                    )
                    break
                except Exception as exc:
                    serpapi_last_error = exc
                    if _classify_serpapi_error(exc) == "rate_limit":
                        raise
                    if serpapi_attempt + 1 >= serpapi_attempts:
                        raise
                    sleep_seconds = min(0.5, _stage_timeout(deadline, 0.5, reserve_seconds=0.6))
                    await asyncio.sleep(sleep_seconds)

            serpapi_ms = int((time.monotonic() - serpapi_started) * 1000)
            print(f"[Agent3Timing] serpapi_ms={serpapi_ms}")
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="serpapi",
                started_at=serpapi_started,
                deadline=deadline,
            )
            compact_data = self._compact_serpapi_result(serpapi_data)

            if not self._has_useful_lens_data(compact_data):
                return self.build_visual_search_result(
                    raw_lens_text=json.dumps(compact_data, ensure_ascii=False),
                    evidence=[],
                )

            # Combine matches into a list of evidence
            raw_evidence = []
            knowledge_graph = compact_data.get("knowledge_graph")
            if isinstance(knowledge_graph, dict):
                raw_evidence.append({
                    "bucket": "knowledge_graph",
                    "title": knowledge_graph.get("title", ""),
                    "snippet": " ".join(
                        str(knowledge_graph.get(key) or "")
                        for key in ("subtitle", "description")
                    ).strip(),
                    "url": knowledge_graph.get("link", ""),
                    "source": knowledge_graph.get("source", ""),
                })
            for item in compact_data.get("exact_matches") or []:
                raw_evidence.append({
                    "bucket": "exact_match",
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                    "source": item.get("source", ""),
                })
            for item in compact_data.get("visual_matches") or []:
                raw_evidence.append({
                    "bucket": "visual_match",
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                    "source": item.get("source", ""),
                })
            for item in compact_data.get("text_results") or []:
                raw_evidence.append({
                    "bucket": "text_result",
                    "title": item.get("text") or item.get("title", ""),
                    "snippet": "",
                    "url": item.get("link", ""),
                    "source": "",
                })
            for item in compact_data.get("reverse_image_search") or []:
                raw_evidence.append({
                    "bucket": "reverse_image_search",
                    "title": item.get("title", ""),
                    "snippet": "",
                    "url": item.get("link", ""),
                    "source": item.get("source", ""),
                })
            evidence_snapshot = raw_evidence[:5]

            # Validate links asynchronously
            from app.utils.link_validator import filter_alive_links
            current_stage = "link_validation"
            link_started = time.monotonic()
            try:
                link_timeout = _stage_timeout(deadline, 5.0, reserve_seconds=0.75)
                alive_evidence = await asyncio.wait_for(
                    filter_alive_links(raw_evidence),
                    timeout=link_timeout,
                )
            except Exception as exc:
                print(f"[{self.agent_name}] Link validation skipped: {exc}")
                alive_evidence = raw_evidence
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="link_validation",
                started_at=link_started,
                deadline=deadline,
            )

            if not alive_evidence and raw_evidence:
                alive_evidence = raw_evidence

            # Reconstruct compact_data with alive links
            compact_data["exact_matches"] = [
                {
                    "title": item["title"],
                    "source": item["source"],
                    "link": item["url"],
                    "snippet": item["snippet"],
                }
                for item in alive_evidence if item["bucket"] == "exact_match"
            ]
            compact_data["visual_matches"] = [
                {
                    "title": item["title"],
                    "source": item["source"],
                    "link": item["url"],
                    "snippet": item["snippet"],
                }
                for item in alive_evidence if item["bucket"] == "visual_match"
            ]
            compact_data["text_results"] = [
                {
                    "text": item["title"],
                    "link": item["url"],
                }
                for item in alive_evidence if item["bucket"] == "text_result"
            ]

            # Rank alive evidence, enrich only the top eligible URLs with compact
            # page text, then re-rank so page excerpts can support identity.
            from app.services.evidence_ranker_service import rank_lens_evidence
            current_stage = "rank_evidence"
            rank_started = time.monotonic()
            pre_ranked_evidence = rank_lens_evidence(alive_evidence, context=context)
            evidence_snapshot = pre_ranked_evidence[:5]
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="rank_evidence",
                started_at=rank_started,
                deadline=deadline,
            )
            current_stage = "page_text"
            if _remaining_budget(deadline) <= 0.5:
                return _deadline_result_json(
                    timeout_stage="before_page_text",
                    deadline=deadline,
                    run_started_at=run_started_at,
                    evidence=pre_ranked_evidence[:5],
                    stage_trace=stage_trace,
                    debug_log=debug_log,
                )
            page_text_started = time.monotonic()
            page_text_budget_low = (
                _remaining_budget(deadline) < PAGE_TEXT_MIN_BUDGET_SECONDS
            )
            try:
                if page_text_budget_low:
                    enriched_top = await enrich_lens_evidence_with_page_text(
                        pre_ranked_evidence[:5],
                        deadline=deadline,
                        max_urls=PAGE_TEXT_MAX_URLS,
                        timeout_seconds=PAGE_TEXT_TIMEOUT_SECONDS,
                    )
                else:
                    page_text_timeout = _stage_timeout(
                        deadline,
                        5.0,
                        reserve_seconds=0.75,
                    )
                    enriched_top = await asyncio.wait_for(
                        enrich_lens_evidence_with_page_text(
                            pre_ranked_evidence[:5],
                            deadline=deadline,
                            max_urls=PAGE_TEXT_MAX_URLS,
                            timeout_seconds=PAGE_TEXT_TIMEOUT_SECONDS,
                        ),
                        timeout=page_text_timeout,
                    )
                ranked_evidence = rank_lens_evidence(
                    enriched_top + pre_ranked_evidence[5:],
                    context=context,
                )
            except (asyncio.TimeoutError, TimeoutError):
                _record_stage_trace(
                    stage_trace,
                    debug_log,
                    stage="page_text",
                    started_at=page_text_started,
                    deadline=deadline,
                    status="timeout",
                )
                return _deadline_result_json(
                    timeout_stage="page_text",
                    deadline=deadline,
                    run_started_at=run_started_at,
                    evidence=pre_ranked_evidence[:5],
                    stage_trace=stage_trace,
                    debug_log=debug_log,
                )
            except Exception as exc:
                print(f"[{self.agent_name}] Page text enrichment skipped: {exc}")
                ranked_evidence = pre_ranked_evidence
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="page_text",
                started_at=page_text_started,
                deadline=deadline,
                status=(
                    "skipped_budget_low"
                    if page_text_budget_low
                    else "completed"
                ),
            )
            top_evidence = ranked_evidence[:5]
            evidence_snapshot = top_evidence

            # ----------------------------------------------------------------
            # GROQ EVIDENCE READER LAYER
            # Reads text evidence only — no image bytes sent to Groq.
            # Classifies each evidence item as support/conflict/context_only/noise.
            # Results feed into reconciliation before formatter is called.
            # ----------------------------------------------------------------
            groq_reader_enabled = bool(
                getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_ENABLED", False)
            )
            groq_reader_mode = str(
                getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_MODE", "when_weak") or "when_weak"
            ).strip().lower()

            # Run deterministic parser first to know if we need Groq
            det_result = parse_lens_evidence_without_llm(
                top_evidence,
                raw_lens_text="",
            )
            det_promoted = str(det_result.get("status") or "").lower() == "completed" and not bool(
                det_result.get("not_counted_in_consensus")
            )
            det_promotion_trace = det_result.get("promotion_trace") or {}
            det_exact_count = int(det_promotion_trace.get("exact_amount_support_count") or 0)
            det_support_count = int(det_promotion_trace.get("support_count") or 0)
            det_has_conflict = bool(
                det_promotion_trace.get("conflicting_denominations")
                or not det_promotion_trace.get("checks", {}).get("conflict_check_passed", True)
            )

            groq_reader_result = None
            reconciliation = None

            if groq_reader_enabled and GROQ_EVIDENCE_READER_AVAILABLE:
                reader_call, reader_skip_reason = should_call_groq_evidence_reader(
                    mode=groq_reader_mode,
                    deterministic_promoted=det_promoted,
                    deterministic_support_count=det_support_count,
                    deterministic_exact_count=det_exact_count,
                    has_conflict=det_has_conflict,
                    evidence_count=len(top_evidence),
                )
                if reader_call and _remaining_budget(deadline) >= 3.0:
                    reader_timeout = min(
                        float(getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_TIMEOUT_SECONDS", 5.0) or 5.0),
                        max(1.0, _remaining_budget(deadline) - 2.0),
                    )
                    # Build candidate_identity from deterministic result for Groq context
                    det_candidate = None
                    if det_promoted:
                        selected = det_promotion_trace.get("selected_identity")
                        if selected:
                            det_candidate = {
                                "country": str(selected.get("country") or ""),
                                "currency_code": str(selected.get("currency") or ""),
                                "denomination": str(selected.get("amount") or ""),
                            }
                    try:
                        groq_reader_result = await asyncio.wait_for(
                            read_evidence_with_groq(
                                top_evidence,
                                candidate_identity=det_candidate,
                                timeout_seconds=reader_timeout,
                                top_n=int(getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_TOP_N", 5) or 5),
                            ),
                            timeout=reader_timeout + 0.5,
                        )
                    except (asyncio.TimeoutError, Exception) as reader_exc:
                        groq_reader_result = {
                            "groq_evidence_reader_used": False,
                            "groq_called": True,
                            "groq_skipped_reason": f"reader_exception:{type(reader_exc).__name__}",
                            "groq_error_type": "timeout" if isinstance(reader_exc, asyncio.TimeoutError) else "exception",
                            "status": "skipped",
                            "proposed_identity": None,
                            "evidence_classification": [],
                            "support_count": 0,
                            "conflict_count": 0,
                            "context_only_count": 0,
                            "noise_count": 0,
                            "independent_supporting_domains": [],
                            "final_reason": f"groq_reader_exception:{type(reader_exc).__name__}",
                        }

                    # Reconcile deterministic vs Groq
                    reconciliation = reconcile_ag3_evidence(
                        det_result.get("promotion_trace", {}).get("selected_identity"),
                        groq_reader_result,
                        top_evidence,
                    )
                    # Attach reconciliation to debug_log
                    if debug_log is not None:
                        debug_log["groq_evidence_reader"] = {
                            "enabled": groq_reader_enabled,
                            "mode": groq_reader_mode,
                            "called": reader_call,
                            "groq_evidence_reader_used": (groq_reader_result or {}).get("groq_evidence_reader_used"),
                            "groq_called": (groq_reader_result or {}).get("groq_called"),
                            "groq_skipped_reason": (groq_reader_result or {}).get("groq_skipped_reason"),
                            "groq_error_type": (groq_reader_result or {}).get("groq_error_type"),
                            "groq_status": (groq_reader_result or {}).get("status"),
                            "support_count": (groq_reader_result or {}).get("support_count", 0),
                            "conflict_count": (groq_reader_result or {}).get("conflict_count", 0),
                            "context_only_count": (groq_reader_result or {}).get("context_only_count", 0),
                            "noise_count": (groq_reader_result or {}).get("noise_count", 0),
                            "independent_supporting_domains": (groq_reader_result or {}).get("independent_supporting_domains", []),
                            "proposed_identity": (groq_reader_result or {}).get("proposed_identity"),
                            "final_reason": (groq_reader_result or {}).get("final_reason"),
                            "reconciliation_agreement_level": (reconciliation or {}).get("agreement_level"),
                            "reconciliation_reason": (reconciliation or {}).get("reason"),
                            "reconciliation_eligible": (reconciliation or {}).get("eligible_for_validation"),
                        }
                else:
                    if debug_log is not None:
                        debug_log["groq_evidence_reader"] = {
                            "enabled": groq_reader_enabled,
                            "mode": groq_reader_mode,
                            "called": False,
                            "groq_evidence_reader_used": False,
                            "groq_called": False,
                            "groq_skipped_reason": reader_skip_reason,
                        }
            else:
                if debug_log is not None:
                    debug_log["groq_evidence_reader"] = {
                        "enabled": groq_reader_enabled,
                        "mode": groq_reader_mode,
                        "called": False,
                        "groq_evidence_reader_used": False,
                        "groq_called": False,
                        "groq_skipped_reason": "evidence_reader_disabled" if not groq_reader_enabled else "groq_package_missing",
                    }

            # If reconciliation says conflict → return deterministic Partial immediately
            if reconciliation and not reconciliation.get("eligible_for_validation"):
                det_result_with_reconcile = dict(det_result)
                det_result_with_reconcile["not_counted_in_consensus"] = True
                det_result_with_reconcile["status"] = "Partial"
                recon_reason = reconciliation.get("reason") or "reconciliation_conflict"
                det_result_with_reconcile["reconciliation_reason"] = recon_reason
                det_result_with_reconcile["reconciliation_agreement_level"] = reconciliation.get("agreement_level")
                det_result_with_reconcile["groq_evidence_reader_used"] = bool(
                    groq_reader_result and groq_reader_result.get("groq_evidence_reader_used")
                )
                det_result_with_reconcile["groq_called"] = bool(
                    groq_reader_result and groq_reader_result.get("groq_called")
                )
                det_result_with_reconcile["groq_skipped_reason"] = (
                    groq_reader_result or {}
                ).get("groq_skipped_reason")
                return json.dumps([det_result_with_reconcile], ensure_ascii=False)

            formatter_evidence = [
                {
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet") or item.get("text", ""),
                    "source": item.get("source", ""),
                    "url": item.get("url") or item.get("link", ""),
                    "link_checked": item.get("link_checked", False),
                    "page_text_checked": item.get("page_text_checked", "skipped"),
                    "page_text_skip_reason": item.get("page_text_skip_reason"),
                    "page_text_excerpt": item.get("page_text_excerpt", ""),
                    "page_text_excerpt_chars": item.get("page_text_excerpt_chars", 0),
                    "page_text_identity_terms": item.get("page_text_identity_terms", []),
                }
                for item in top_evidence[:5]
            ]
            raw_lens_data = json.dumps(formatter_evidence, ensure_ascii=False)
            print(f"[{self.agent_name}] Đã có dữ liệu Lens, đang format bằng LLM...")

            if _remaining_budget(deadline) < FORMATTER_MIN_BUDGET_SECONDS:
                return _deadline_result_json(
                    timeout_stage="before_formatter",
                    deadline=deadline,
                    run_started_at=run_started_at,
                    evidence=top_evidence,
                    raw_lens_text=raw_lens_data,
                    stage_trace=stage_trace,
                    debug_log=debug_log,
                )

            formatter_provider = str(
                getattr(settings, "AGENT3_FORMATTER_PROVIDER", "gemini") or "gemini"
            ).strip().lower()
            if formatter_provider == "groq":
                current_stage = "formatter"
                formatter_started = time.monotonic()
                formatter_result = await run_agent3_formatter(
                    top_evidence,
                    raw_lens_data=raw_lens_data,
                    deadline=deadline,
                    context=context,
                    debug_log=debug_log,
                    deterministic_parser=parse_lens_evidence_without_llm,
                    validator=validate_agent3_identity,
                    parse_formatted_result=self.parse_formatted_result,
                )
                _record_stage_trace(
                    stage_trace,
                    debug_log,
                    stage="formatter",
                    started_at=formatter_started,
                    deadline=deadline,
                )
                return formatter_result

            if debug_log is not None:
                debug_log.setdefault("formatter_router", {}).update(
                    {
                        "formatter_provider": formatter_provider,
                        "groq_called": False,
                        "groq_skipped_reason": "provider_not_groq",
                    }
                )

            legacy_formatter_data = {"evidence": formatter_evidence}

            last_error = None
            formatter_retries = max(0, int(getattr(settings, "AGENT3_FORMATTER_MAX_RETRIES", 1) or 0))
            formatter_attempts = formatter_retries + 1
            for attempt in range(formatter_attempts):
                try:
                    current_stage = "formatter"
                    configured_formatter_timeout = float(
                        getattr(settings, "AGENT3_FORMATTER_TIMEOUT_SECONDS", 10) or 10
                    )
                    formatter_timeout = _stage_timeout(
                        deadline,
                        configured_formatter_timeout,
                        reserve_seconds=0.5,
                    )
                    formatter_started = time.monotonic()
                    formatted_text = await self._format_lens_results_with_llm(
                        legacy_formatter_data,
                        context=context,
                        debug_log=debug_log,
                        timeout_seconds=formatter_timeout,
                    )
                    formatter_ms = int((time.monotonic() - formatter_started) * 1000)
                    print(f"[Agent3Timing] formatter_ms={formatter_ms}")
                    print(f"[{self.agent_name}] Hoàn tất format Lens!")
                    _record_stage_trace(
                        stage_trace,
                        debug_log,
                        stage="formatter",
                        started_at=formatter_started,
                        deadline=deadline,
                    )
                    current_stage = "validator_promotion"
                    validator_started = time.monotonic()
                    formatted_result = self.parse_formatted_result(
                        formatted_text,
                        raw_lens_data,
                        evidence=top_evidence,
                    )
                    _record_stage_trace(
                        stage_trace,
                        debug_log,
                        stage="validator_promotion",
                        started_at=validator_started,
                        deadline=deadline,
                    )
                    return formatted_result
                except Exception as e:
                    last_error = e
                    error_text = str(e)
                    print(f"[{self.agent_name}] Lens formatter failed attempt {attempt + 1}/{formatter_attempts}: {error_text}")

                    if attempt + 1 < formatter_attempts and (
                        "503" in error_text
                        or "429" in error_text
                        or "RESOURCE_EXHAUSTED" in error_text
                        or "quota" in error_text.lower()
                        or "timeout" in error_text.lower()
                    ):
                        retry_budget = _remaining_budget(deadline) - 0.5
                        if retry_budget <= 0:
                            break
                        sleep_seconds = min(2.0, retry_budget)
                        await asyncio.sleep(sleep_seconds)
                        continue

                    break

            formatter_timed_out = bool(
                last_error and "timeout" in str(last_error).casefold()
            )
            if formatter_timed_out or _remaining_budget(deadline) <= 0:
                return _deadline_result_json(
                    timeout_stage="formatter",
                    deadline=deadline,
                    run_started_at=run_started_at,
                    evidence=top_evidence,
                    raw_lens_text=raw_lens_data,
                    stage_trace=stage_trace,
                    debug_log=debug_log,
                )

            parser_started = time.perf_counter()
            fallback_result = parse_lens_evidence_without_llm(
                top_evidence or alive_evidence or raw_evidence,
                raw_lens_text=raw_lens_data,
            )
            fallback_result["formatter_error"] = str(last_error)[:300] if last_error else None
            parser_fallback_ms = int((time.perf_counter() - parser_started) * 1000)
            print(f"[Agent3Timing] parser_fallback_ms={parser_fallback_ms}")
            return json.dumps([fallback_result], ensure_ascii=False)

        except (asyncio.TimeoutError, TimeoutError) as e:
            print(f"[{self.agent_name}] Deadline exceeded: {e}")
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage=current_stage,
                started_at=run_started_at,
                deadline=deadline,
                status="timeout",
            )
            return _deadline_result_json(
                timeout_stage=current_stage,
                deadline=deadline,
                run_started_at=run_started_at,
                evidence=evidence_snapshot,
                raw_lens_text=raw_lens_data,
                stage_trace=stage_trace,
                debug_log=debug_log,
            )
        except Exception as e:
            print(f"[{self.agent_name}] Lỗi tổng: {e}")
            return self.build_visual_search_result(error=e)


async def run_agent3_lens(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
) -> str:
    agent = Agent3Lens()
    return await agent.run(
        image_bytes,
        context,
        debug_log=debug_log,
        deadline=deadline,
    )
