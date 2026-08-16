import json
import requests
import asyncio
import html
import ipaddress
import inspect
import re
import time
import unicodedata
from typing import Optional, List, Dict, Any, Callable, Awaitable, Tuple, Union
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
from app.utils.currency_normalizer import normalize_agent_vote, normalize_currency_identity, normalize_currency_no_infer, normalize_country
from google.genai import types # 🌟 THÊM IMPORT NÀY ĐỂ ÉP KIỂU JSON


CURRENCY_ALIASES = {
    "VND": [
        "vnd", "vnđ", "₫", "vietnamese dong", "viet nam dong",
        "đồng việt nam", "việt nam đồng", "đồng", "dong", "k", "nghìn", "ngàn",
        "dong banknote", "vietnamese dong banknote",
        "viet nam dong banknote",
    ],
    "USD": [
        "usd", "us dollar", "u.s. dollar", "đôla mỹ", "đô la mỹ",
    ],
    "EUR": ["eur", "euro", "euros", "€"],
    "JPY": ["jpy", "yen", "yên", "¥", "￥"],
    "CNY": ["cny", "yuan", "yuans", "renminbi", "rmb"],
    "KRW": ["krw", "won", "wons", "₩"],
    "THB": ["thb", "baht", "bahts", "฿"],
    "MYR": ["myr", "ringgit", "ringgits"],
    "SGD": ["sgd", "singapore dollar", "singapore dollars"],
    "IDR": ["idr", "rupiah", "rupiahs"],
    "PHP": ["php", "peso", "pesos", "philippine peso", "philippine pesos"],
    "KHR": ["khr", "riel", "riels"],
    "LAK": ["lak", "kip", "kips"],
    "MMK": ["mmk", "kyat", "kyats"],
    "GBP": ["gbp", "pound", "pounds", "pound sterling", "sterling", "£"],
    "AUD": ["aud", "australian dollar", "australian dollars"],
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
INITIAL_LENS_RESULT_LIMIT = 10
TARGETED_LENS_RESULT_LIMIT = 10
AG3_MIN_SELECTED_SOURCES = 3
AG3_MAX_SELECTED_SOURCES = 5
AG3_MIN_EXACT_SUPPORT = 3
PAGE_TEXT_MAX_URLS = 2
import os
PAGE_TEXT_TIMEOUT_SECONDS = float(os.getenv("AG3_TEST_PAGE_TEXT_TIMEOUT_SECONDS", 2.5))
PAGE_TEXT_EXCERPT_MAX_CHARS = 2200
PAGE_TEXT_FETCH_BYTES_LIMIT = 200000
PAGE_TEXT_MIN_BUDGET_SECONDS = 5.0
FORMATTER_MIN_BUDGET_SECONDS = 3.0
AG3_POST_UPLOAD_MIN_BUDGET_SECONDS = 12.0
AG3_UPLOAD_MIN_ATTEMPT_SECONDS = 1.0
AG3_UPLOAD_MAX_ATTEMPT_SECONDS = 16.0
AG3_UPLOAD_RETRY_SLEEP_SECONDS = 0.25
FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS = float(
    getattr(settings, "AGENT3_FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS", 10.0)
    or 10.0
)
RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS = float(
    getattr(settings, "AGENT3_RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS", 10.0)
    or 10.0
)
CANDIDATE_VERIFICATION_BUDGET_SECONDS = RESCUE_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS
CANDIDATE_SEARCH_QUERY_LIMIT = 2
CANDIDATE_SEARCH_RESULTS_PER_QUERY = 10
SERPAPI_RATE_LIMIT_MARKERS = (
    "429",
    "run out of searches",
    "quota",
    "rate limit",
    "rate_limit",
    "too many requests",
)
FORMATTER_PROVIDER_VALUES = {"groq", "deterministic", "gemini", "none"}


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
    if explicit_type in {
        "provider_timeout",
        "provider_connection_error",
        "provider_rate_limited",
        "provider_server_error",
        "provider_auth_error",
        "provider_bad_request",
        "provider_malformed_response",
        "provider_no_result",
    }:
        return explicit_type
    if explicit_type in {"rate_limit", "provider_quota_exhausted"}:
        return "provider_rate_limited"
    if explicit_type == "timeout":
        return "provider_timeout"
    if _is_timeout_exception(error):
        return "provider_timeout"
    if _is_transient_network_exception(error):
        return "provider_connection_error"
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
    message = str(error or "").casefold()
    if status_code == 429 or any(marker in message for marker in SERPAPI_RATE_LIMIT_MARKERS):
        return "provider_rate_limited"
    if any(token in message for token in ("timeout", "timed out")):
        return "provider_timeout"
    if any(token in message for token in ("connection", "network", "dns", "proxy", "ssl")):
        return "provider_connection_error"
    if any(token in message for token in ("invalid json", "malformed", "không trả json", "not valid json")):
        return "provider_malformed_response"
    if any(token in message for token in ("unauthorized", "forbidden", "auth", "api key", "serpapi_key", "missing key")):
        return "provider_auth_error"
    if any(token in message for token in ("bad request", "invalid request", "invalid parameter", "http 400")):
        return "provider_bad_request"
    if any(token in message for token in ("http 500", "http 502", "http 503", "http 504", "server error")):
        return "provider_server_error"
    return "provider_error"


def _normalize_serpapi_formatter_provider_json(result_json: str) -> str:
    try:
        parsed = json.loads(result_json)
    except Exception:
        return result_json

    items = parsed if isinstance(parsed, list) else [parsed]
    for item in items:
        if not isinstance(item, dict):
            continue
        reported_provider = str(item.get("provider") or "").strip().lower()
        if reported_provider in FORMATTER_PROVIDER_VALUES:
            item.setdefault("formatter_provider", reported_provider)
            item["provider"] = "serpapi"
        elif not reported_provider:
            item["provider"] = "serpapi"
        provider_trace = item.get("provider_trace")
        if isinstance(provider_trace, dict) and item.get("formatter_provider"):
            provider_trace["formatter_provider"] = item.get("formatter_provider")

    return json.dumps(parsed, ensure_ascii=False)

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
    "euro zone": {"EUR"},
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
    "exchange rate", "currency converter", "tỷ giá", "quy đổi", "hôm nay", "giá bán",
    "converted to", "vnd equivalent",
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

    def _token_match(haystack: str, needle: str) -> bool:
        if not any(char.isalnum() for char in needle):
            return needle in haystack
        return re.search(
            rf"(?<!\w){re.escape(needle)}(?!\w)",
            haystack,
            flags=re.IGNORECASE,
        ) is not None

    if _token_match(normalized_text, normalized_term):
        return True

    folded_text = _fold_text_for_markers(normalized_text)
    folded_term = _fold_text_for_markers(normalized_term)
    return bool(folded_term and _token_match(folded_text, folded_term))


def _fold_text_for_markers(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "d")
    return text


def _contains_any_marker(text: str, markers: tuple[str, ...]) -> bool:
    folded = _fold_text_for_markers(text)
    for marker in markers:
        folded_marker = _fold_text_for_markers(marker)
        if folded_marker == "%" and "%" in folded:
            return True
        if _contains_term(folded, folded_marker):
            return True
    return False


def _has_year_number_marker(text: str) -> bool:
    folded = _fold_text_for_markers(text)
    return bool(
        _contains_any_marker(text, YEAR_NUMBER_MARKERS)
        or re.search(r"(?<!viet\s)\bnam\b", folded)
    )


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


class ImgBBUploadError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        root_error_type: str,
        retryable: bool = False,
        status_code: Optional[int] = None,
        retry_attempted: bool = False,
    ) -> None:
        super().__init__(message)
        self.root_error_type = root_error_type
        self.retryable = bool(retryable)
        self.status_code = status_code
        self.retry_attempted = bool(retry_attempted)


def _is_valid_public_image_url(url: Optional[str]) -> bool:
    value = str(url or "").strip()
    if not value:
        return False
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    if parsed.scheme.lower() not in {"http", "https"}:
        return False
    if parsed.username or parsed.password:
        return False
    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not host:
        return False
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        return False
    try:
        ip_value = ipaddress.ip_address(host)
        if not ip_value.is_global:
            return False
    except ValueError:
        pass

    path = (parsed.path or "").lower()
    image_extensions = (
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
        ".tif",
        ".tiff",
    )
    if path.endswith(image_extensions):
        return True
    if "res.cloudinary.com" in host and "/image/upload/" in path:
        return True
    if host in {"i.ibb.co", "ibb.co"}:
        return True
    return False


def _upload_attempt_timeout(deadline: float) -> float:
    available = _remaining_budget(deadline) - AG3_POST_UPLOAD_MIN_BUDGET_SECONDS
    if available < AG3_UPLOAD_MIN_ATTEMPT_SECONDS:
        raise TimeoutError("Agent 3 upload skipped because retrieval budget would be exhausted.")
    return min(AG3_UPLOAD_MAX_ATTEMPT_SECONDS, available)


def _is_timeout_exception(exc: Exception) -> bool:
    requests_exceptions = getattr(requests, "exceptions", None)
    timeout_cls = getattr(requests_exceptions, "Timeout", None)
    if timeout_cls is not None and isinstance(exc, timeout_cls):
        return True
    return isinstance(exc, TimeoutError) or "timeout" in exc.__class__.__name__.casefold()


def _is_transient_network_exception(exc: Exception) -> bool:
    if _is_timeout_exception(exc):
        return True
    requests_exceptions = getattr(requests, "exceptions", None)
    transient_names = (
        "ConnectionError",
        "ConnectTimeout",
        "ReadTimeout",
        "ProxyError",
        "SSLError",
    )
    for name in transient_names:
        cls = getattr(requests_exceptions, name, None)
        if cls is not None and isinstance(exc, cls):
            return True
    return any(token in exc.__class__.__name__.casefold() for token in ("connection", "network", "proxy", "ssl"))


def _technical_failure_result_json(
    *,
    timeout_stage: str,
    provider_stage: str,
    root_error_type: str,
    message: str,
    deadline: float,
    run_started_at: float,
    stage_trace: Optional[List[Dict[str, Any]]] = None,
    debug_log: Optional[Dict[str, Any]] = None,
    evidence: Optional[List[Dict[str, Any]]] = None,
    raw_lens_text: str = "",
    retry_attempted: bool = False,
    search_performed: bool = False,
) -> str:
    preserved_evidence = list(evidence or [])[:10]
    evidence_preserved = bool(preserved_evidence)
    elapsed_ms = int(max(0.0, time.monotonic() - run_started_at) * 1000)
    remaining_ms = int(_remaining_budget(deadline) * 1000)
    safe_message = str(message or "Agent 3 technical failure.")[:300]
    payload = {
        "quoc_gia": UNKNOWN_IDENTITY,
        "ma_tien_te": UNKNOWN_IDENTITY,
        "menh_gia": UNKNOWN_IDENTITY,
        "mat_tien": UNKNOWN_IDENTITY,
        "nam_phat_hanh": UNKNOWN_IDENTITY,
        "chat_lieu": UNKNOWN_IDENTITY,
        "mo_ta": safe_message,
        "quan_diem": safe_message,
        "phuong_phap": "Google Lens SerpApi technical failure",
        "do_tin_cay": 0.0,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Failed",
        "provider": "serpapi",
        "error_type": "technical_error",
        "technical_error": True,
        "not_counted_in_consensus": True,
        "evidence": preserved_evidence,
        "raw_text": raw_lens_text,
    }
    validated = validate_agent3_identity(payload, evidence=preserved_evidence)
    technical_fields = {
        "status": "Failed",
        "error_type": "technical_error",
        "technical_error": True,
        "not_counted_in_consensus": True,
        "timeout_stage": timeout_stage,
        "provider_stage": provider_stage,
        "root_error_type": root_error_type,
        "elapsed_ms": elapsed_ms,
        "remaining_ms": remaining_ms,
        "remaining_ms_at_stage": remaining_ms,
        "retry_attempted": bool(retry_attempted),
        "evidence_preserved": evidence_preserved,
        "search_performed": bool(search_performed),
        "raw_lens_result_count": len(preserved_evidence),
        "mo_ta": safe_message,
        "quan_diem": safe_message,
        "validation_errors": [f"technical_failure:{root_error_type}"],
        "stage_trace": list(stage_trace or []),
        "evidence": preserved_evidence,
        "raw_text": raw_lens_text,
    }
    validated.update(technical_fields)

    summary = dict(validated.get("ag3_verification_summary") or {})
    summary.update(
        {
            "raw_lens_result_count": len(preserved_evidence),
            "initial_lens_result_count": len(preserved_evidence) if search_performed else 0,
            "targeted_search_result_count": 0,
            "total_raw_evidence_count": len(preserved_evidence),
            "raw_articles": preserved_evidence,
            "candidate_sources": [],
            "candidate_source_count": 0,
            "selected_voting_sources": [],
            "selected_voting_set": [],
            "selected_voting_set_size": 0,
            "selected_source_count": 0,
            "selected_sources": [],
            "selection_reason": "not_evaluated_due_to_technical_failure",
            "promotion_reason": "not_evaluated_due_to_technical_failure",
            "vote_eligible": False,
            "vote_created": False,
            "search_performed": bool(search_performed),
            "technical_error": True,
            "timeout_stage": timeout_stage,
            "provider_stage": provider_stage,
            "root_error_type": root_error_type,
            "retry_attempted": bool(retry_attempted),
            "evidence_preserved": evidence_preserved,
        }
    )

    validated["reason"] = f"technical_failure:{root_error_type}"
    validated["status_reason"] = f"technical_failure:{root_error_type}"
    validated["not_eligible_reason"] = f"technical_failure:{root_error_type}"

    validated.update(summary)
    validated.update(technical_fields)
    validated["ag3_verification_summary"] = summary

    promotion_trace = dict(validated.get("promotion_trace") or {})
    promotion_trace.update(
        {
            "promoted": False,
            "reason": root_error_type,
            "timeout_stage": timeout_stage,
            "provider_stage": provider_stage,
            "root_error_type": root_error_type,
            "retry_attempted": bool(retry_attempted),
            "evidence_preserved": evidence_preserved,
            "ag3_verification_summary": summary,
        }
    )
    validated["promotion_trace"] = promotion_trace

    provider_trace = dict(validated.get("provider_trace") or {})
    provider_trace.update(
        {
            "primary_provider": "serpapi",
            "selected_provider": None if not search_performed else "serpapi",
            "provider_stage": provider_stage,
            "timeout_stage": timeout_stage,
            "root_error_type": root_error_type,
            "elapsed_ms": elapsed_ms,
            "remaining_ms": remaining_ms,
            "retry_attempted": bool(retry_attempted),
            "search_performed": bool(search_performed),
        }
    )
    validated["provider_trace"] = provider_trace

    if debug_log is not None:
        debug_log["technical_failure_trace"] = {
            "timeout_stage": timeout_stage,
            "provider_stage": provider_stage,
            "root_error_type": root_error_type,
            "elapsed_ms": elapsed_ms,
            "remaining_ms": remaining_ms,
            "retry_attempted": bool(retry_attempted),
            "evidence_preserved": evidence_preserved,
            "search_performed": bool(search_performed),
        }
    return json.dumps([validated], ensure_ascii=False)


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
    preserved_evidence = list(evidence or [])[:10]
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

    is_valid_vote = bool(validated.get("vote_created")) and bool(validated.get("vote_eligible")) and not bool(validated.get("not_counted_in_consensus"))

    update_dict = {
        "timeout_stage": timeout_stage,
        "deadline_seconds": round(deadline_seconds, 3),
        "elapsed_ms": elapsed_ms,
        "remaining_ms_at_stage": remaining_ms,
        "evidence_preserved": evidence_preserved,
        "top5_evidence_count": len(preserved_evidence),
        "stage_trace": trace_entries,
        "raw_text": raw_lens_text,
        "evidence": preserved_evidence,
        "technical_error": True,
    }

    if not is_valid_vote:
        update_dict.update({
            "status": status,
            "error_type": "technical_error",
            "not_counted_in_consensus": True,
        })

    validated.update(update_dict)

    promotion_trace = dict(validated.get("promotion_trace") or {})
    promo_update = {
        "timeout_stage": timeout_stage,
        "deadline_seconds": round(deadline_seconds, 3),
        "elapsed_ms": elapsed_ms,
        "remaining_ms_at_stage": remaining_ms,
        "evidence_preserved": evidence_preserved,
    }

    if not is_valid_vote:
        promo_update.update({
            "promoted": False,
            "reason": "deadline_budget_exhausted",
        })

    promotion_trace.update(promo_update)
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


def _has_authoritative_det_vote(det_result: Optional[Dict[str, Any]]) -> bool:
    """Return True if the deterministic parse result already has a valid, complete AG3 vote.

    This is used to protect an already-valid vote from being erased by a late
    formatter/Groq deadline that occurs after the vote was deterministically proven.

    The required criteria mirror the fields AG4 reads from the final AG3 result:
      - vote_created == True
      - vote_eligible == True
      - majority_achieved >= 3 (from promotion_trace)
      - selected_source_count >= 3
      - vote_identity has country + currency + amount
    """
    if not isinstance(det_result, dict):
        return False
    summary = det_result.get("ag3_verification_summary") or {}
    promotion_trace = det_result.get("promotion_trace") or {}
    # Check top-level + summary vote flags
    vote_created = (
        det_result.get("vote_created") is True
        or summary.get("vote_created") is True
        or promotion_trace.get("vote_created") is True
    )
    vote_eligible = (
        det_result.get("vote_eligible") is True
        or summary.get("vote_eligible") is True
        or promotion_trace.get("vote_eligible") is True
    )
    if not (vote_created and vote_eligible):
        return False
    # Minimum majority achieved
    majority_achieved = (
        promotion_trace.get("majority_achieved")
        or promotion_trace.get("majority_count")
        or summary.get("majority_achieved")
        or summary.get("support_count")
        or 0
    )
    if not isinstance(majority_achieved, (int, float)) or majority_achieved < 3:
        return False
    # Minimum selected source count
    selected_count = (
        promotion_trace.get("selected_voting_source_count")
        or promotion_trace.get("selected_source_count")
        or summary.get("selected_voting_source_count")
        or summary.get("selected_source_count")
        or 0
    )
    if not isinstance(selected_count, (int, float)) or selected_count < 3:
        return False
    # Valid identity
    vote_identity = (
        promotion_trace.get("vote_identity")
        or promotion_trace.get("winning_identity")
        or summary.get("vote_identity")
        or summary.get("winning_identity")
        or {}
    )
    if not isinstance(vote_identity, dict):
        return False
    country = vote_identity.get("country")
    currency = vote_identity.get("currency")
    amount = vote_identity.get("amount")
    return bool(country and currency and amount is not None)


def _det_result_as_final_json(
    det_result: Dict[str, Any],
    *,
    timeout_stage: str,
    stage_trace: Optional[List[Dict[str, Any]]] = None,
    debug_log: Optional[Dict[str, Any]] = None,
) -> str:
    """Return the authoritative det_result as final AG3 output, annotating
    that a late optional stage timed out but the vote itself is preserved."""
    result = dict(det_result)
    result["late_deadline_stage"] = timeout_stage
    result["late_deadline_note"] = (
        f"Optional stage '{timeout_stage}' was skipped due to deadline/budget, "
        "but the deterministic vote was already created and is preserved."
    )
    # Ensure downstream flags are correct
    result["vote_created"] = True
    result["vote_eligible"] = True
    result["technical_error"] = False
    result["not_counted_in_consensus"] = False
    result.setdefault("search_performed", True)
    if stage_trace:
        result["stage_trace"] = list(stage_trace)
    if debug_log is not None:
        debug_log["late_deadline_vote_preserved"] = {
            "timeout_stage": timeout_stage,
            "vote_preserved": True,
        }
    return json.dumps([result], ensure_ascii=False)


def _has_direct_banknote_amount_context(context: str, raw_amount: str) -> bool:
    # Normalize written-out English denominations before numeric matching.
    _WRITTEN_AMOUNTS = {
        "five hundred": 500, "one thousand": 1000, "two thousand": 2000,
        "five thousand": 5000, "ten thousand": 10000,
        "one": 1, "two": 2, "five": 5, "ten": 10, "twenty": 20,
        "fifty": 50, "hundred": 100,
    }
    context_normalized = context
    for word, val in _WRITTEN_AMOUNTS.items():
        context_normalized = re.sub(
            rf"\b{re.escape(word)}-?(dollar|\u0111\u00f4|euro|yen|pound|baht|won|rupiah|dong|kip|kyat|riel|ringgit|peso)?\b",
            lambda m, v=val: f"{v}" + (f"-{m.group(1)}" if m.group(1) else ""),
            context_normalized,
            flags=re.IGNORECASE,
        )
    try:
        amount_pattern = _amount_pattern(int(raw_amount))
    except (TypeError, ValueError):
        amount_pattern = re.escape(str(raw_amount or "").strip())
    if not amount_pattern:
        return False
    banknote_words = (
        r"(?:banknote|banknotes|bill|note|currency\s+note|paper\s+money|"
        r"polymer\s+note|denomination|face\s+value|tiền\s+giấy|"
        r"tờ\s+tiền|tờ|mệnh\s+giá)"
        # NOTE: "đồng tiền" removed—it means "currency/coin" in general,
        # causing false positives like "Top 10 đồng tiền". Use "tờ tiền" instead.
    )
    currency_words = (
        r"(?:vnd|usd|eur|jpy|gbp|krw|thb|idr|dollar|dollars|euro|euros|"
        r"yen|yên|pound|pounds|sterling|won|baht|dong|đồng|rupiah)?"
    )
    symbols = r"[$€¥£₩฿₫]?"
    descriptors = r"(?:[a-z-]+\s+){0,2}"
    return bool(
        re.search(
            rf"{symbols}\s*{amount_pattern}\s*{currency_words}\s*{descriptors}{banknote_words}",
            context_normalized,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{banknote_words}\s*(?:of|mệnh\s+giá|:)?\s*{descriptors}{symbols}\s*{amount_pattern}\s*{currency_words}",
            context_normalized,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{currency_words}\s*{amount_pattern}\s*{descriptors}{banknote_words}",
            context_normalized,
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


def _source_detected_amount_values(item: Dict[str, Any]) -> List[int]:
    raw_amounts = item.get("detected_amounts")
    if raw_amounts is None:
        return []
    if isinstance(raw_amounts, (list, tuple, set)):
        candidates = list(raw_amounts)
    else:
        candidates = [raw_amounts]
    values: List[int] = []
    for raw in candidates:
        amount = _parse_amount_token(raw)
        if amount is not None and amount > 0 and amount not in values:
            values.append(amount)
    return values


def _confirmed_page_text_identity_from_terms(terms: List[Any]) -> Dict[str, Any]:
    countries: List[str] = []
    currencies: List[str] = []
    amounts: List[int] = []
    for term in terms or []:
        raw = str(term or "").strip()
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        key = key.strip().casefold()
        value = value.strip()
        if not value:
            continue
        if key == "country" and not _is_unknown_identity(value):
            countries.append(normalize_country(value) or value)
        elif key == "currency":
            currency = _normalize_currency_code(value)
            if currency:
                currencies.append(currency)
        elif key == "amount":
            amount = _parse_amount_token(value)
            if amount is not None and amount > 0:
                amounts.append(amount)

    identity: Dict[str, Any] = {}
    unique_currencies = list(dict.fromkeys(currencies))
    unique_amounts = list(dict.fromkeys(amounts))
    if len(unique_currencies) == 1:
        identity["currency"] = unique_currencies[0]
    if len(unique_amounts) == 1:
        identity["amount"] = unique_amounts[0]

    country_by_key: Dict[str, str] = {}
    for country in countries:
        key = _normalize_country_key(country, identity.get("currency"))
        if not _is_unknown_identity(key):
            country_by_key.setdefault(key, country)
    if len(country_by_key) == 1:
        identity["country"] = next(iter(country_by_key.values()))

    return identity


def _page_text_identity_is_compatible(
    source_identity: Dict[str, Any],
    page_identity: Dict[str, Any],
) -> bool:
    page_country = page_identity.get("country")
    page_currency = page_identity.get("currency")
    page_amount = page_identity.get("amount")
    if (
        _is_unknown_identity(page_country)
        or _is_unknown_identity(page_currency)
        or page_amount is None
    ):
        return False
    if not is_valid_agent3_denomination(page_amount, page_currency):
        return False
    if not _country_currency_consistent(page_country, page_currency):
        return False

    source_country = source_identity.get("detected_country")
    if not _is_unknown_identity(source_country):
        if _normalize_country_key(source_country, page_currency) != _normalize_country_key(page_country, page_currency):
            return False

    source_currency = _normalize_currency_code(source_identity.get("detected_currency"))
    if not _is_unknown_identity(source_currency) and source_currency != page_currency:
        return False

    source_amounts = _source_detected_amount_values(source_identity)
    if source_amounts and (len(source_amounts) != 1 or source_amounts[0] != page_amount):
        return False

    return True


def _restore_unconfirmed_page_text_identity(
    item: Dict[str, Any],
    source_identity: Dict[str, Any],
) -> None:
    restored = False
    source_country = source_identity.get("detected_country")
    source_currency = source_identity.get("detected_currency")
    source_amounts = _source_detected_amount_values(source_identity)

    if _is_unknown_identity(source_country) and not _is_unknown_identity(item.get("detected_country")):
        item["detected_country"] = source_country or UNKNOWN_IDENTITY
        restored = True
    if _is_unknown_identity(_normalize_currency_code(source_currency)) and not _is_unknown_identity(_normalize_currency_code(item.get("detected_currency"))):
        item["detected_currency"] = source_currency
        restored = True
    if not source_amounts and _source_detected_amount_values(item):
        item["detected_amounts"] = []
        restored = True

    if restored:
        if source_identity.get("content_identity_quality") is not None:
            item["content_identity_quality"] = source_identity.get("content_identity_quality")
        elif str(item.get("content_identity_quality") or "").upper() == "PAGE_TEXT_COMPLETE":
            item["content_identity_quality"] = "PARTIAL_IDENTITY"
        item["complete_identity"] = bool(source_identity.get("complete_identity"))
        if not source_identity.get("complete_identity_support"):
            item.pop("complete_identity_support", None)


def _reconcile_page_text_identity(item: Dict[str, Any]) -> bool:
    terms = list(item.get("page_text_identity_terms") or [])
    if not terms:
        return False

    source_identity = item.get("_ag3_pre_page_identity")
    if not isinstance(source_identity, dict):
        source_identity = item

    page_identity = _confirmed_page_text_identity_from_terms(terms)
    
    has_banknote_context = any("banknote" in str(term).lower() for term in terms)
    is_complete_strong_page = bool(
        has_banknote_context
        and page_identity.get("country") and not _is_unknown_identity(page_identity.get("country"))
        and page_identity.get("currency") and not _is_unknown_identity(page_identity.get("currency"))
        and page_identity.get("amount") is not None
    )

    is_compatible = _page_text_identity_is_compatible(source_identity, page_identity)
    
    if not is_compatible and not is_complete_strong_page:
        if source_identity is not item:
            _restore_unconfirmed_page_text_identity(item, source_identity)
        return False

    source_had_missing_field = (
        _is_unknown_identity(source_identity.get("detected_country"))
        or _is_unknown_identity(_normalize_currency_code(source_identity.get("detected_currency")))
        or not _source_detected_amount_values(source_identity)
    )
    changed = False
    
    if is_complete_strong_page or _is_unknown_identity(item.get("detected_country")):
        if item.get("detected_country") != page_identity.get("country"):
            item["detected_country"] = page_identity["country"]
            changed = True
            
    if is_complete_strong_page or _is_unknown_identity(_normalize_currency_code(item.get("detected_currency"))):
        if _normalize_currency_code(item.get("detected_currency")) != page_identity.get("currency"):
            item["detected_currency"] = page_identity["currency"]
            changed = True
            
    if is_complete_strong_page or not _source_detected_amount_values(item):
        if not _source_detected_amount_values(item) or item.get("detected_amounts") != [page_identity.get("amount")]:
            item["detected_amounts"] = [page_identity["amount"]]
            changed = True

    if (changed or source_had_missing_field) and (is_compatible or is_complete_strong_page):
        item["content_identity_quality"] = "PAGE_TEXT_COMPLETE"
        item["complete_identity_support"] = True
        item["complete_identity"] = True
    return changed


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

    if hostname in {"wikipedia.org", "wikimedia.org"} or hostname.endswith(".wikipedia.org") or hostname.endswith(".wikimedia.org"):
        if path.startswith("/wiki/file:") or path.startswith("/wiki/tập_tin:"):
            return False

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
        "istock", "stock photo", "stock image", "shutterstock",
        "getty", "alamy", "dreamstime", "123rf", "adobe stock",
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
) -> Tuple[str, Optional[str]]:
    text = str(html_text or "")[:PAGE_TEXT_FETCH_BYTES_LIMIT]
    if not text.strip():
        return "", "empty_or_non_html"

    lower = text.lower()
    if any(m in lower for m in ("type=\"password\"", "type='password'", "<form action=\"/login\"", "<form action='/login'")) or (
        ("login" in lower or "sign in" in lower or "sso" in lower) and ("enter your password" in lower or "log in to your account" in lower)
    ):
        return "", "unreadable_source"

    text_clean = re.sub(r"(?is)<(script|style|noscript|svg|canvas|iframe).*?</\1>", " ", text)
    chunks: List[str] = []

    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text_clean)
    if title_match:
        chunks.append(title_match.group(1))

    meta_match = re.search(
        r"(?is)<meta[^>]+(?:name|property)=['\"](?:description|og:description)['\"][^>]+content=['\"]([^'\"]+)['\"]",
        text_clean,
    ) or re.search(
        r"(?is)<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:name|property)=['\"](?:description|og:description)['\"]",
        text_clean,
    )
    if meta_match:
        chunks.append(meta_match.group(1))

    for tag in ("h1", "h2", "p"):
        limit = 3 if tag == "p" else 4
        for match in re.finditer(rf"(?is)<{tag}[^>]*>(.*?)</{tag}>", text_clean):
            chunk = re.sub(r"(?is)<[^>]+>", " ", match.group(1))
            chunk = _compact_text(chunk, 500)
            if chunk:
                chunks.append(chunk)
            if len([value for value in chunks if value]) >= limit + 2:
                break

    if not chunks:
        chunks.append(re.sub(r"(?is)<[^>]+>", " ", text_clean))

    final_excerpt = _compact_text(" ".join(chunks), max_chars)
    if not final_excerpt.strip():
        return "", "empty_or_non_html"

    return final_excerpt, None


async def _is_url_safe_and_public(url: str) -> bool:
    if _is_obviously_unsafe_page_url(url):
        return False
    try:
        import app.utils.link_validator as lv
        fn = getattr(lv, "_is_safe_public_http_url", None)
        if fn is not None:
            return await fn(url)
    except Exception:
        pass
    return not _is_obviously_unsafe_page_url(url)


async def _default_fetch_page_text_excerpt(url: str, timeout_seconds: float) -> Union[str, Dict[str, Any]]:
    from urllib.parse import urljoin

    current_url = url
    max_redirects = 3
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml;q=0.9",
    }

    for attempt in range(max_redirects + 1):
        if not await _is_url_safe_and_public(current_url):
            return {
                "status": "failed",
                "page_text_excerpt": "",
                "page_text_checked": False,
                "page_text_skip_reason": "unsafe_url",
            }

        def _get(target_url: str) -> Any:
            return requests.get(
                target_url,
                headers=headers,
                timeout=max(0.1, float(timeout_seconds)),
                allow_redirects=False,
            )

        try:
            response = await asyncio.to_thread(_get, current_url)
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    return {
                        "status": "failed",
                        "page_text_excerpt": "",
                        "page_text_checked": False,
                        "page_text_skip_reason": "redirect_missing_location",
                    }
                current_url = urljoin(current_url, location)
                continue
            elif response.status_code >= 400:
                return {
                    "status": "failed",
                    "page_text_excerpt": "",
                    "page_text_checked": False,
                    "page_text_skip_reason": f"http_{response.status_code}",
                }
            else:
                content_type = str(response.headers.get("content-type") or "").lower()
                if content_type and "html" not in content_type and "text/plain" not in content_type:
                    return {
                        "status": "failed",
                        "page_text_excerpt": "",
                        "page_text_checked": False,
                        "page_text_skip_reason": "empty_or_non_html",
                    }
                excerpt, err_reason = _extract_page_text_excerpt_from_html(response.text)
                if err_reason:
                    return {
                        "status": "failed",
                        "page_text_excerpt": "",
                        "page_text_checked": False,
                        "page_text_skip_reason": err_reason,
                    }
                return {
                    "status": "success",
                    "page_text_excerpt": excerpt,
                    "page_text_checked": True,
                    "page_text_skip_reason": None,
                }
        except Exception as exc:
            return {
                "status": "failed",
                "page_text_excerpt": "",
                "page_text_checked": False,
                "page_text_skip_reason": exc.__class__.__name__,
            }

    return {
        "status": "failed",
        "page_text_excerpt": "",
        "page_text_checked": False,
        "page_text_skip_reason": "too_many_redirects",
    }


PAGE_FETCH_CACHE: Dict[str, Dict[str, Any]] = {}
PAGE_FETCH_FAILURE_CACHE: Dict[str, Dict[str, Any]] = {}
PAGE_FETCH_CACHE_MAX_ENTRIES = 500


def clear_page_fetch_cache():
    PAGE_FETCH_CACHE.clear()
    PAGE_FETCH_FAILURE_CACHE.clear()


def _clamp_fetch_config(
    max_concurrency: Optional[int] = None,
    max_urls: Optional[int] = None,
    max_urls_per_domain: Optional[int] = None,
    per_url_timeout_seconds: Optional[float] = None,
    total_timeout_seconds: Optional[float] = None,
    cache_ttl_seconds: Optional[float] = None,
    failure_cache_ttl_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    from app.core.config import settings

    def_mc = getattr(settings, "AGENT3_PAGE_FETCH_MAX_CONCURRENCY", 3)
    def_mu = getattr(settings, "AGENT3_PAGE_TEXT_MAX_URLS", None)
    if def_mu is None:
        def_mu = getattr(settings, "AGENT3_PAGE_FETCH_MAX_URLS", 10)
    def_mud = getattr(settings, "AGENT3_PAGE_FETCH_MAX_URLS_PER_DOMAIN", 2)
    def_per = getattr(settings, "AGENT3_PAGE_FETCH_PER_URL_TIMEOUT_SECONDS", 2.5)
    def_tot = getattr(settings, "AGENT3_PAGE_FETCH_TOTAL_TIMEOUT_SECONDS", 5.0)
    def_ttl = getattr(settings, "AGENT3_PAGE_FETCH_CACHE_TTL_SECONDS", 300.0)
    def_fttl = getattr(settings, "AGENT3_PAGE_FETCH_FAILURE_CACHE_TTL_SECONDS", 60.0)

    mc = max(1, min(10, int(max_concurrency if max_concurrency is not None else def_mc)))
    mu = max(1, min(20, int(max_urls if max_urls is not None else def_mu)))
    mud = max(1, min(5, int(max_urls_per_domain if max_urls_per_domain is not None else def_mud)))
    tot = max(0.5, min(30.0, float(total_timeout_seconds if total_timeout_seconds is not None else def_tot)))
    per = max(0.1, min(tot, float(per_url_timeout_seconds if per_url_timeout_seconds is not None else def_per)))
    ttl = max(10.0, min(3600.0, float(cache_ttl_seconds if cache_ttl_seconds is not None else def_ttl)))
    fttl = max(5.0, min(600.0, float(failure_cache_ttl_seconds if failure_cache_ttl_seconds is not None else def_fttl)))

    return {
        "max_concurrency": mc,
        "max_urls": mu,
        "max_urls_per_domain": mud,
        "per_url_timeout_seconds": per,
        "total_timeout_seconds": tot,
        "cache_ttl_seconds": ttl,
        "failure_cache_ttl_seconds": fttl,
    }


def _calculate_fetch_priority(item: Dict[str, Any]) -> Tuple[float, List[str], bool, Optional[str]]:
    from app.services.evidence_ranker_service import canonicalize_url, get_canonical_domain, classify_source

    url = str(item.get("url") or item.get("link") or "").strip()
    if not url:
        return 0.0, ["no_url"], False, "no_url"

    try:
        parsed = urlparse(url)
        scheme = (parsed.scheme or "").lower()
        if scheme not in {"http", "https"}:
            return 0.0, ["invalid_scheme"], False, "invalid_scheme"
        if not parsed.hostname or parsed.username or parsed.password:
            return 0.0, ["unsafe_url"], False, "unsafe_url"
        hostname = parsed.hostname.strip().lower().rstrip(".")
        if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
            return 0.0, ["unsafe_url"], False, "unsafe_url"
        try:
            literal_ip = ipaddress.ip_address(hostname)
            if not literal_ip.is_global:
                return 0.0, ["unsafe_url"], False, "unsafe_url"
        except ValueError:
            pass
    except Exception:
        return 0.0, ["invalid_scheme"], False, "invalid_scheme"

    if _is_obviously_unsafe_page_url(url):
        return 0.0, ["unsafe_url"], False, "unsafe_url"

    skip_reason = _page_text_skip_reason(item)
    if skip_reason:
        return 0.0, [skip_reason], False, skip_reason

    s_class = classify_source(item)
    s_trust = str(item.get("source_trust_level") or s_class["source_trust_level"]).upper().strip()
    if s_trust == "NOISE":
        return 0.0, ["noise_source"], False, "noise_source"
    if s_trust == "SOCIAL":
        return 0.0, ["social_media_source"], False, "social_media_source"
    if s_trust == "UNREADABLE":
        return 0.0, ["unreadable_source"], False, "unreadable_source"

    priority = 0.0
    reasons: List[str] = []

    country = item.get("detected_country")
    currency = item.get("detected_currency")
    amounts = item.get("detected_amounts")

    if country is None or currency is None or amounts is None:
        title = str(item.get("title") or "")
        snippet = str(item.get("snippet") or "")
        text = f"{title} {snippet}".strip()
        if currency is None:
            from app.services.evidence_ranker_service import _extract_currency
            currency = _extract_currency(text)
        if country is None:
            from app.services.evidence_ranker_service import _extract_country_currency
            country, _c = _extract_country_currency(text, preferred_currency=currency)
        if amounts is None:
            from app.services.evidence_ranker_service import _extract_amounts
            amounts = _extract_amounts(text, currency=currency)

    has_country = not _is_unknown_identity(country)
    has_currency = not _is_unknown_identity(currency)
    has_exact_amount = (isinstance(amounts, list) and len(amounts) == 1)

    rank_reasons = [str(r).lower() for r in item.get("rank_reasons", [])]
    has_banknote_context = any("banknote" in r or "currency" in r or "amount" in r for r in rank_reasons)

    quality = item.get("content_identity_quality")

    if has_country and has_currency and has_exact_amount:
        if s_trust == "WEAK_COMMERCIAL":
            priority += 20.0
            reasons.append("weak_commercial_complete_exact")
        elif quality == "PARTIAL_IDENTITY" or not item.get("direct_title_match"):
            priority += 100.0
            reasons.append("complete_identity_needs_page_corroboration")
        else:
            priority += 70.0
            reasons.append("trusted_neutral_complete_exact")
    elif s_trust in ("TRUSTED", "NEUTRAL") and (has_exact_amount or (has_country and has_currency)):
        priority += 80.0
        reasons.append("trusted_neutral_partial_identity")
    elif s_trust == "WEAK_COMMERCIAL":
        priority += 15.0
        reasons.append("weak_commercial_partial")
    elif has_exact_amount and has_currency and not has_country:
        priority += 60.0
        reasons.append("amount_currency_missing_country")
    elif has_country and has_exact_amount and not has_currency:
        priority += 40.0
        reasons.append("country_amount_missing_currency")
    elif has_exact_amount or has_country or has_currency:
        priority += 30.0
        reasons.append("partial_identity_signals")
    else:
        priority += 10.0
        reasons.append("general_context_only")

    if item.get("is_mirror"):
        priority -= 15.0
        reasons.append("mirror_item")

    return max(0.0, priority), reasons, True, None


def _get_page_fetch_cache(canon_url: str) -> Optional[Tuple[Dict[str, Any], str]]:
    now = time.time()
    if canon_url in PAGE_FETCH_CACHE:
        entry = PAGE_FETCH_CACHE[canon_url]
        if now - entry["timestamp"] < entry["ttl"]:
            return entry["data"], "success_cache_hit"
        del PAGE_FETCH_CACHE[canon_url]

    if canon_url in PAGE_FETCH_FAILURE_CACHE:
        entry = PAGE_FETCH_FAILURE_CACHE[canon_url]
        if now - entry["timestamp"] < entry["ttl"]:
            return entry["data"], "failure_cache_hit"
        del PAGE_FETCH_FAILURE_CACHE[canon_url]

    return None


def _set_page_fetch_cache(canon_url: str, data: Dict[str, Any], is_success: bool, ttl: float):
    if data.get("status") in ("cancelled", "total_timeout_cancelled") or data.get("page_text_skip_reason") == "total_timeout_cancelled":
        return

    now = time.time()
    entry = {
        "timestamp": now,
        "ttl": ttl,
        "data": data,
    }
    target_cache = PAGE_FETCH_CACHE if is_success else PAGE_FETCH_FAILURE_CACHE
    target_cache[canon_url] = entry

    if len(target_cache) > PAGE_FETCH_CACHE_MAX_ENTRIES:
        expired = [k for k, v in target_cache.items() if now - v["timestamp"] >= v["ttl"]]
        for k in expired:
            del target_cache[k]
        if len(target_cache) > PAGE_FETCH_CACHE_MAX_ENTRIES:
            first_key = next(iter(target_cache))
            del target_cache[first_key]


async def enrich_lens_evidence_with_page_text(
    evidence: List[Dict[str, Any]],
    *,
    deadline: Optional[float] = None,
    max_urls: Optional[int] = None,
    max_concurrency: Optional[int] = None,
    max_urls_per_domain: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
    total_timeout_seconds: Optional[float] = None,
    min_budget_seconds: float = PAGE_TEXT_MIN_BUDGET_SECONDS,
    fetcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    enabled: bool = True,
    return_trace: bool = False,
) -> Union[List[Dict[str, Any]], Tuple[List[Dict[str, Any]], Dict[str, Any]]]:
    from app.services.evidence_ranker_service import canonicalize_url, get_canonical_domain

    start_time = time.time()
    cfg = _clamp_fetch_config(
        max_concurrency=max_concurrency,
        max_urls=max_urls,
        max_urls_per_domain=max_urls_per_domain,
        per_url_timeout_seconds=timeout_seconds,
        total_timeout_seconds=total_timeout_seconds,
    )

    fetcher = fetcher or _default_fetch_page_text_excerpt

    # Trace Metrics Counters
    network_fetch_count = 0
    completed_count = 0
    success_count = 0
    timeout_count = 0
    error_count = 0
    cancelled_count = 0
    cache_hit_count = 0
    cache_miss_count = 0
    success_cache_hit_count = 0
    failure_cache_hit_count = 0
    deduplicated_count = 0
    total_timeout_reached = False
    pending_cancelled_cleanly = True

    from app.core.config import settings
    page_fetch_globally_enabled = getattr(settings, "AGENT3_PAGE_FETCH_ENABLED", True)

    if not enabled or not page_fetch_globally_enabled:
        out = []
        skipped_meta = []
        for item in evidence or []:
            c = dict(item)
            c["page_text_checked"] = "skipped"
            c["page_text_skip_reason"] = "page_fetch_disabled"
            c["fetch_selected"] = False
            out.append(c)
            skipped_meta.append({
                "canonical_url": c.get("url") or "",
                "skip_reason": "page_fetch_disabled",
            })
        trace = {
            "status": "disabled",
            "requested_url_count": len(evidence or []),
            "selected_url_count": 0,
            "skipped_url_count": len(skipped_meta),
            "deduplicated_url_count": 0,
            "network_fetch_count": 0,
            "completed_count": 0,
            "success_count": 0,
            "timeout_count": 0,
            "error_count": 0,
            "cancelled_count": 0,
            "cache_hit_count": 0,
            "cache_miss_count": 0,
            "success_cache_hit_count": 0,
            "failure_cache_hit_count": 0,
            "total_elapsed_ms": round((time.time() - start_time) * 1000, 2),
            "total_timeout_reached": False,
            "pending_cancelled_cleanly": True,
            "per_domain_selected_counts": {},
            "selected_urls": [],
            "skipped_urls": skipped_meta,
            "fetch_results": [],
        }
        if out:
            out[0]["page_fetch_trace"] = trace
        return (out, trace) if return_trace else out

    total_timeout = cfg["total_timeout_seconds"]
    if deadline is not None:
        total_timeout = min(total_timeout, max(0.1, _remaining_budget(deadline)))

    if deadline is not None and _remaining_budget(deadline) < min_budget_seconds:
        out = []
        skipped_meta = []
        for item in evidence or []:
            c = dict(item)
            c["page_text_checked"] = "skipped"
            c["page_text_skip_reason"] = "deadline_budget_low"
            c["fetch_selected"] = False
            out.append(c)
            skipped_meta.append({
                "canonical_url": c.get("url") or "",
                "skip_reason": "deadline_budget_low",
            })
        trace = {
            "status": "timeout",
            "requested_url_count": len(evidence or []),
            "selected_url_count": 0,
            "skipped_url_count": len(skipped_meta),
            "deduplicated_url_count": 0,
            "network_fetch_count": 0,
            "completed_count": 0,
            "success_count": 0,
            "timeout_count": 0,
            "error_count": 0,
            "cancelled_count": 0,
            "cache_hit_count": 0,
            "cache_miss_count": 0,
            "success_cache_hit_count": 0,
            "failure_cache_hit_count": 0,
            "total_elapsed_ms": round((time.time() - start_time) * 1000, 2),
            "total_timeout_reached": True,
            "pending_cancelled_cleanly": True,
            "per_domain_selected_counts": {},
            "selected_urls": [],
            "skipped_urls": skipped_meta,
            "fetch_results": [],
        }
        if out:
            out[0]["page_fetch_trace"] = trace
        return (out, trace) if return_trace else out

    # Step 1: Pre-process each item and compute priority
    items_prepared: List[Dict[str, Any]] = []
    canonical_groups: Dict[str, List[int]] = {}

    for idx, raw_item in enumerate(evidence or []):
        current = dict(raw_item)
        current["_ag3_pre_page_identity"] = {
            "detected_country": current.get("detected_country"),
            "detected_currency": current.get("detected_currency"),
            "detected_amounts": list(current.get("detected_amounts") or [])
            if isinstance(current.get("detected_amounts"), (list, tuple, set))
            else current.get("detected_amounts"),
            "content_identity_quality": current.get("content_identity_quality"),
            "complete_identity": current.get("complete_identity"),
            "complete_identity_support": current.get("complete_identity_support"),
        }
        current.setdefault("link_checked", bool(current.get("link_alive")))
        current["page_text_checked"] = "skipped"
        current["page_text_skip_reason"] = None
        current["page_text_excerpt_chars"] = 0
        current["page_text_identity_terms"] = []

        raw_url = str(current.get("url") or current.get("link") or "").strip()
        canon_url = canonicalize_url(raw_url) if raw_url else raw_url
        if not canon_url:
            canon_url = raw_url
        canon_domain = get_canonical_domain(raw_url) if raw_url else ""
        current["canonical_url"] = canon_url
        current["canonical_domain"] = canon_domain

        priority, priority_reasons, eligible, skip_reason = _calculate_fetch_priority(current)
        current["fetch_priority"] = priority
        current["fetch_priority_reasons"] = priority_reasons
        current["fetch_selected"] = eligible
        current["fetch_skip_reason"] = skip_reason
        current["page_text_skip_reason"] = skip_reason

        items_prepared.append(current)

        if canon_url:
            if canon_url in canonical_groups:
                deduplicated_count += 1
            canonical_groups.setdefault(canon_url, []).append(idx)

    # Step 2: Deduplicate & select candidate URLs to fetch based on priority & domain limits
    candidate_canon_urls: List[str] = []
    canonical_url_priority: Dict[str, float] = {}

    for canon_url, idx_list in canonical_groups.items():
        highest_prio = max(items_prepared[i]["fetch_priority"] for i in idx_list)
        canonical_url_priority[canon_url] = highest_prio

    # Sort canonical URLs by priority descending
    sorted_canon_urls = sorted(
        canonical_groups.keys(),
        key=lambda u: canonical_url_priority[u],
        reverse=True,
    )

    domain_url_counts: Dict[str, int] = {}
    selected_urls_meta: List[Dict[str, Any]] = []
    skipped_urls_meta: List[Dict[str, Any]] = []

    for canon_url in sorted_canon_urls:
        first_idx = canonical_groups[canon_url][0]
        item = items_prepared[first_idx]

        if not item["fetch_selected"]:
            for i in canonical_groups[canon_url]:
                skipped_urls_meta.append({
                    "canonical_url": canon_url,
                    "canonical_domain": item["canonical_domain"],
                    "skip_reason": items_prepared[i]["page_text_skip_reason"] or "insufficient_identity_priority",
                })
            continue

        domain = item["canonical_domain"]
        domain_count = domain_url_counts.get(domain, 0)
        if domain_count >= cfg["max_urls_per_domain"]:
            for i in canonical_groups[canon_url]:
                items_prepared[i]["fetch_selected"] = False
                items_prepared[i]["fetch_skip_reason"] = "domain_limit"
                items_prepared[i]["page_text_skip_reason"] = "domain_limit"
                skipped_urls_meta.append({
                    "canonical_url": canon_url,
                    "canonical_domain": domain,
                    "skip_reason": "domain_limit",
                })
            continue

        domain_url_counts[domain] = domain_count + 1
        candidate_canon_urls.append(canon_url)
        selected_urls_meta.append({
            "canonical_url": canon_url,
            "canonical_domain": domain,
            "fetch_priority": item["fetch_priority"],
            "fetch_priority_reasons": item["fetch_priority_reasons"],
        })

    # Step 3: Sequential or Controlled Concurrency Fetching to stop when max_urls successful fetches reached
    sem = asyncio.Semaphore(cfg["max_concurrency"])
    canon_results: Dict[str, Dict[str, Any]] = {}
    fetch_results_meta: List[Dict[str, Any]] = []
    successful_fetch_count = 0

    async def _fetch_single(c_url: str) -> Dict[str, Any]:
        nonlocal network_fetch_count, cache_hit_count, cache_miss_count, success_cache_hit_count, failure_cache_hit_count
        nonlocal success_count, error_count, timeout_count, cancelled_count, completed_count

        cache_lookup = _get_page_fetch_cache(c_url)
        if cache_lookup is not None:
            cached_data, cache_kind = cache_lookup
            cache_hit_count += 1
            if cache_kind == "success_cache_hit":
                success_cache_hit_count += 1
            else:
                failure_cache_hit_count += 1

            cached_copy = dict(cached_data)
            cached_copy["from_cache"] = True
            cached_copy["cache_status"] = "hit"
            return cached_copy

        cache_miss_count += 1
        rep_idx = canonical_groups[c_url][0]
        rep_item = items_prepared[rep_idx]
        target_url = str(rep_item.get("url") or rep_item.get("link") or "")
        per_url_timeout = cfg["per_url_timeout_seconds"]

        fetch_start = time.time()
        network_fetch_count += 1

        async with sem:
            try:
                fetched = fetcher(target_url, per_url_timeout)
                if inspect.isawaitable(fetched):
                    fetched = await asyncio.wait_for(fetched, timeout=per_url_timeout)

                elapsed_ms = round((time.time() - fetch_start) * 1000, 2)

                if isinstance(fetched, dict):
                    excerpt = fetched.get("page_text_excerpt") or fetched.get("text") or ""
                    status_raw = fetched.get("status")
                    custom_skip = fetched.get("page_text_skip_reason")
                else:
                    raw_str = str(fetched or "")
                    excerpt, custom_skip = _extract_page_text_excerpt_from_html(raw_str)
                    status_raw = None

                excerpt = _compact_text(excerpt)
                if excerpt:
                    completed_count += 1
                    success_count += 1
                    res = {
                        "status": "success",
                        "page_text_excerpt": excerpt,
                        "page_text_checked": True,
                        "page_text_skip_reason": None,
                        "page_text_excerpt_chars": len(excerpt),
                        "page_text_identity_terms": _page_text_identity_terms(excerpt),
                        "elapsed_ms": elapsed_ms,
                        "from_cache": False,
                        "cache_status": "miss",
                        "error_type": None,
                        "error_message_safe": None,
                        "fetch_attempt_count": 1,
                    }
                    _set_page_fetch_cache(c_url, res, is_success=True, ttl=cfg["cache_ttl_seconds"])
                    return res
                else:
                    completed_count += 1
                    skip_reason_final = custom_skip or "empty_or_non_html"
                    if skip_reason_final in ("unreadable_source", "unreadable"):
                        status_final = "unreadable"
                        error_count += 1
                    else:
                        status_final = "empty"
                    res = {
                        "status": status_final,
                        "page_text_excerpt": "",
                        "page_text_checked": False,
                        "page_text_skip_reason": skip_reason_final,
                        "page_text_excerpt_chars": 0,
                        "page_text_identity_terms": [],
                        "elapsed_ms": elapsed_ms,
                        "from_cache": False,
                        "cache_status": "miss",
                        "error_type": skip_reason_final,
                        "error_message_safe": None,
                        "fetch_attempt_count": 1,
                    }
                    _set_page_fetch_cache(c_url, res, is_success=False, ttl=cfg["failure_cache_ttl_seconds"])
                    return res
            except (asyncio.TimeoutError, TimeoutError):
                elapsed_ms = round((time.time() - fetch_start) * 1000, 2)
                timeout_count += 1
                res = {
                    "status": "timeout",
                    "page_text_excerpt": "",
                    "page_text_checked": False,
                    "page_text_skip_reason": "per_url_timeout",
                    "page_text_excerpt_chars": 0,
                    "page_text_identity_terms": [],
                    "elapsed_ms": elapsed_ms,
                    "from_cache": False,
                    "cache_status": "miss",
                    "error_type": "TimeoutError",
                    "error_message_safe": "Per-URL timeout exceeded",
                    "fetch_attempt_count": 1,
                }
                _set_page_fetch_cache(c_url, res, is_success=False, ttl=cfg["failure_cache_ttl_seconds"])
                return res
            except Exception as exc:
                elapsed_ms = round((time.time() - fetch_start) * 1000, 2)
                error_count += 1
                res = {
                    "status": "error",
                    "page_text_excerpt": "",
                    "page_text_checked": False,
                    "page_text_skip_reason": exc.__class__.__name__,
                    "page_text_excerpt_chars": 0,
                    "page_text_identity_terms": [],
                    "elapsed_ms": elapsed_ms,
                    "from_cache": False,
                    "cache_status": "miss",
                    "error_type": exc.__class__.__name__,
                    "error_message_safe": str(exc)[:200],
                    "fetch_attempt_count": 1,
                }
                _set_page_fetch_cache(c_url, res, is_success=False, ttl=cfg["failure_cache_ttl_seconds"])
                return res

    # Run tasks up to max_urls successful fetches
    i = 0
    tasks_in_flight: Dict[str, asyncio.Task] = {}

    while i < len(candidate_canon_urls) or tasks_in_flight:
        elapsed = time.time() - start_time
        if elapsed >= total_timeout:
            total_timeout_reached = True
            for c_url, task in list(tasks_in_flight.items()):
                if not task.done():
                    task.cancel()
                    cancelled_count += 1
                canon_results[c_url] = {
                    "status": "cancelled",
                    "page_text_excerpt": "",
                    "page_text_checked": False,
                    "page_text_skip_reason": "total_timeout_cancelled",
                    "page_text_excerpt_chars": 0,
                    "page_text_identity_terms": [],
                    "elapsed_ms": round(elapsed * 1000, 2),
                    "from_cache": False,
                    "cache_status": "miss",
                    "error_type": "total_timeout_cancelled",
                    "error_message_safe": "Cancelled due to total timeout",
                    "fetch_attempt_count": 1,
                }
            if tasks_in_flight:
                await asyncio.gather(*tasks_in_flight.values(), return_exceptions=True)
            tasks_in_flight.clear()
            break

        # Spawn new tasks up to max_concurrency if successful_fetch_count < max_urls
        while (
            i < len(candidate_canon_urls)
            and len(tasks_in_flight) < cfg["max_concurrency"]
            and successful_fetch_count + len(tasks_in_flight) < cfg["max_urls"]
        ):
            c_url = candidate_canon_urls[i]
            i += 1
            tasks_in_flight[c_url] = asyncio.create_task(_fetch_single(c_url))

        if not tasks_in_flight:
            break

        # Wait for at least one task to complete
        done, _ = await asyncio.wait(
            tasks_in_flight.values(),
            return_when=asyncio.FIRST_COMPLETED,
            timeout=max(0.1, total_timeout - elapsed),
        )

        for c_url, task in list(tasks_in_flight.items()):
            if task in done:
                del tasks_in_flight[c_url]
                try:
                    res = task.result()
                except Exception as exc:
                    res = {
                        "status": "error",
                        "page_text_excerpt": "",
                        "page_text_checked": False,
                        "page_text_skip_reason": exc.__class__.__name__,
                        "page_text_excerpt_chars": 0,
                        "page_text_identity_terms": [],
                        "elapsed_ms": 0.0,
                        "from_cache": False,
                        "cache_status": "miss",
                        "error_type": exc.__class__.__name__,
                        "error_message_safe": str(exc)[:200],
                        "fetch_attempt_count": 1,
                    }
                canon_results[c_url] = res
                fetch_results_meta.append({
                    "canonical_url": c_url,
                    "status": res["status"],
                    "elapsed_ms": res.get("elapsed_ms", 0.0),
                    "from_cache": res.get("from_cache", False),
                    "cache_status": res.get("cache_status", "miss"),
                    "page_text_chars": res.get("page_text_excerpt_chars", 0),
                    "error_type": res.get("error_type"),
                    "error_message_safe": res.get("error_message_safe"),
                    "fetch_attempt_count": res.get("fetch_attempt_count", 1),
                })
                if res.get("page_text_checked"):
                    successful_fetch_count += 1

    # Any remaining un-fetched candidate URLs beyond max_urls get top_n_limit / global_limit
    for j in range(i, len(candidate_canon_urls)):
        c_url = candidate_canon_urls[j]
        if c_url not in canon_results:
            for idx in canonical_groups[c_url]:
                items_prepared[idx]["fetch_selected"] = False
                items_prepared[idx]["fetch_skip_reason"] = "global_limit"
                items_prepared[idx]["page_text_skip_reason"] = "top_n_limit"
                skipped_urls_meta.append({
                    "canonical_url": c_url,
                    "canonical_domain": items_prepared[idx]["canonical_domain"],
                    "skip_reason": "global_limit",
                })

    # Step 4: Broadcast results back to all items with matching canonical URLs
    for item in items_prepared:
        c_url = item.get("canonical_url", "")
        if c_url in canon_results:
            res = canon_results[c_url]
            if res.get("page_text_checked"):
                item["page_text_excerpt"] = res["page_text_excerpt"]
                item["page_text_checked"] = True
                item["page_text_skip_reason"] = None
                item["page_text_excerpt_chars"] = res["page_text_excerpt_chars"]
                item["page_text_identity_terms"] = res["page_text_identity_terms"]

                # Merge same-source page identity only when it matches existing source fields.
                _reconcile_page_text_identity(item)
            else:
                item["page_text_checked"] = False
                item["page_text_skip_reason"] = res.get("page_text_skip_reason") or "fetch_failed"

    trace_status = "completed"
    if total_timeout_reached:
        trace_status = "timeout"
    elif not candidate_canon_urls:
        trace_status = "empty"

    page_fetch_trace = {
        "status": trace_status,
        "requested_url_count": len(evidence or []),
        "selected_url_count": len(candidate_canon_urls),
        "skipped_url_count": len(skipped_urls_meta),
        "deduplicated_url_count": deduplicated_count,
        "network_fetch_count": network_fetch_count,
        "completed_count": completed_count,
        "success_count": success_count,
        "timeout_count": timeout_count,
        "error_count": error_count,
        "cancelled_count": cancelled_count,
        "cache_hit_count": cache_hit_count,
        "cache_miss_count": cache_miss_count,
        "success_cache_hit_count": success_cache_hit_count,
        "failure_cache_hit_count": failure_cache_hit_count,
        "total_elapsed_ms": round((time.time() - start_time) * 1000, 2),
        "total_timeout_reached": total_timeout_reached,
        "pending_cancelled_cleanly": pending_cancelled_cleanly,
        "per_domain_selected_counts": domain_url_counts,
        "selected_urls": selected_urls_meta,
        "skipped_urls": skipped_urls_meta,
        "fetch_results": fetch_results_meta,
    }

    if items_prepared:
        items_prepared[0]["page_fetch_trace"] = page_fetch_trace

    if return_trace:
        return items_prepared, page_fetch_trace

    return items_prepared


def enrich_lens_evidence_with_page_text_sync(
    evidence: List[Dict[str, Any]],
    **kwargs: Any,
) -> Union[List[Dict[str, Any]], Tuple[List[Dict[str, Any]], Dict[str, Any]]]:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: asyncio.run(enrich_lens_evidence_with_page_text(evidence, **kwargs)))
            return future.result()
    else:
        return asyncio.run(enrich_lens_evidence_with_page_text(evidence, **kwargs))


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
        # Grading/condition/note type codes that must never become currency codes
        "EPQ", "GMT", "UTC", "NMT", "FRN",
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
    folded = _fold_text_for_markers(text)
    if re.search(r"(?<!\w)(?:mot|one)\s+(?:nghin|ngan|thousand)(?!\w)", folded):
        return 1000

    short_match = re.search(r"(?<!\w)(\d{1,3})\s*(?:k|nghìn|nghin|ngàn|ngan)\b", text, flags=re.IGNORECASE)
    if short_match:
        return int(short_match.group(1)) * 1000

    match = re.search(
        r"(?<!\d)(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)*)(?!\d)",
        text,
    )
    if not match:
        return None

    token = re.sub(r"\s+", "", match.group(1))
    if re.fullmatch(r"\d+[.,]\d{1,2}", token):
        try:
            return int(float(token.replace(",", ".")))
        except (TypeError, ValueError):
            return None

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


def _has_explicit_denomination_context(context: str, amount: int) -> bool:
    if _has_direct_banknote_amount_context(context, amount):
        return True
    folded = _fold_text_for_markers(context)
    amount_pattern = _amount_pattern(amount)
    if not amount_pattern:
        return False
    explicit_patterns = (
        rf"(?:denomination|face value|menh gia)\s*(?:is|la|:)?\s*{amount_pattern}",
        rf"{amount_pattern}\s*(?:vnd|dong|usd|dollar|eur|euro|lak|kip|khr|riel)?\s*(?:denomination|face value|menh gia)",
        rf"(?:this exact banknote|exact banknote|banknote is|note is)\s*(?:worth|is|la|:)?\s*{amount_pattern}",
    )
    return any(re.search(pattern, folded, flags=re.IGNORECASE) for pattern in explicit_patterns)


def _identity_text_for_amounts(item: Dict[str, Any]) -> str:
    return " ".join(
        (
            str(item.get("title") or ""),
            str(item.get("snippet") or ""),
            str(item.get("page_text_excerpt") or ""),
        )
    )


def _parse_word_amount_val(text: str) -> Optional[int]:
    folded = _fold_text_for_markers(text)
    if "nghin" in folded or "ngan" in folded or "thousand" in folded:
        if re.search(r"\b(nam|five)\b", folded):
            if "muoi" in folded or "fifty" in folded:
                return 50000
            elif "tram" in folded or "hundred" in folded:
                return 500000
            return 5000
        elif re.search(r"\b(hai|two)\b", folded):
            if "muoi" in folded or "twenty" in folded:
                return 20000
            elif "tram" in folded or "hundred" in folded:
                return 200000
            return 2000
        elif re.search(r"\b(mot|one)\b", folded):
            if "tram" in folded or "hundred" in folded:
                return 100000
            return 1000
        elif re.search(r"\b(muoi|ten)\b", folded):
            return 10000
    return None


def _has_explicit_denomination_prefix(folded_prefix: str) -> bool:
    return bool(re.search(r"(?:menh\s+gia|denomination|face\s+value)\s*(?:is|la|:)?\s*$", folded_prefix))


def _has_currency_unit_context(folded_prefix: str, folded_suffix: str, folded_window: str) -> bool:
    suffix_clean = folded_suffix.lstrip()
    if re.match(r"^(?:vnd|vnđ|₫|dong|đồng|usd|eur|€|jpy|¥|gbp|£|thb|฿|khr|lak|mmk|kyats?|riels?|kips?|bahts?|pesos?|rubles?|yuans?|wons?|₩|ringgits?|rupiahs?|dollars?|dola|dôla|đôla|sgd|singapore\s+dollars?)\b", suffix_clean):
        return True
    if re.match(r"^\$", suffix_clean) and not re.match(r"^\$\s*\d", suffix_clean):
        return True
    prefix_clean = folded_prefix.rstrip()
    if re.search(r"(?:vnd|vnđ|₫|usd|\$|eur|€|jpy|¥|gbp|£|thb|฿|khr|lak|mmk|won|₩|dollars?|dola|dôla|đôla|sgd|singapore\s+dollars?)\s*$", prefix_clean):
        return True
    return False


def _has_price_sale_amount_context(folded_prefix: str, folded_suffix: str, folded_window: str) -> bool:
    price_prefix = bool(
        re.search(
            r"(?:price|gia\s+ban|gia\s+chi|gia\s+tu|gia\s+tri|gia|tri\s+gia|dinh\s+gia|"
            r"worth|valued\s+at|valuation|sold\s+for|paid|payment|purchase\s+price|"
            r"selling\s+price|buy|sell|mua|nguoi\s+mua|co\s+nguoi\s+mua|ban|rao\s+ban|"
            r"auction|sale|for\s+sale|discount|cost|tra)\s*(?:is|la|:|voi)?\s*$",
            folded_prefix,
        )
    )
    if price_prefix:
        return True

    price_unit_suffix = bool(re.match(r"\s*(?:cu|trieu|million)\b", folded_suffix))
    if not price_unit_suffix:
        return False
    return any(
        _contains_term(folded_window, marker)
        for marker in (
            "price", "gia", "gia ban", "gia tri", "tri gia", "dinh gia",
            "worth", "valuation", "sold for", "paid", "payment",
            "buy", "sell", "mua", "nguoi mua", "co nguoi mua",
            "ban", "rao ban", "auction", "sale", "for sale", "cost", "tra",
        )
    )


def _build_span_result(raw: str, amount: Optional[int], category: str, is_denomination: bool, confidence: float, reason: str, start: int, end: int) -> Dict[str, Any]:
    return {
        "raw": raw,
        "amount": amount,
        "category": category,
        "is_denomination": is_denomination,
        "confidence": confidence,
        "reason": reason,
        "start": start,
        "end": end,
    }


def classify_numeric_span(
    text: str,
    match: Optional[Any] = None,
    amount: Optional[int] = None,
    match_type: str = "number",
) -> List[Dict[str, Any]]:
    """
    Classify numeric spans in text into:
    - denomination
    - year
    - serial
    - percentage
    - price
    - conversion
    - quantity
    - model
    - unknown
    """
    original_text = str(text or "")
    if not original_text.strip():
        return []

    # 1. Word-form amounts
    word_pattern = re.compile(
        r"(?<!\w)(?P<word>(?:năm|nam|hai|một|mot|ba|bốn|bon|sáu|sau|bảy|bay|tám|tam|chín|chin|mười|muoi|hai\s+mươi|nam\s+muoi|mot\s+tram|năm\s+trăm|hai\s+trăm|five|two|one|three|four|six|seven|eight|nine|ten|twenty|fifty|one\s+hundred)\s+(?:nghìn|ngàn|nghin|ngan|thousand))\b",
        flags=re.IGNORECASE,
    )
    word_matches = list(word_pattern.finditer(original_text))

    # 2. Number tokens
    number_pattern = re.compile(
        r"(?<!\w)(?P<short>\d{1,3})\s*(?:k|nghìn|nghin|ngàn|ngan)\b"
        r"|(?<!\d)(?P<number>\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)*)(?!\d)",
        flags=re.IGNORECASE,
    )
    number_matches = list(number_pattern.finditer(original_text))

    all_matches = []
    for wm in word_matches:
        val = _parse_word_amount_val(wm.group("word"))
        if val:
            all_matches.append((wm.start(), wm.end(), wm, val, "word"))

    for nm in number_matches:
        val = _parse_amount_token(nm.group(0))
        if val is not None:
            if not any(wm.start() <= nm.start() < wm.end() for wm in word_matches):
                m_type = "word" if nm.group("short") else "number"
                all_matches.append((nm.start(), nm.end(), nm, val, m_type))

    all_matches.sort(key=lambda x: x[0])
    raw_matches_list = [item[2] for item in all_matches]

    spans: List[Dict[str, Any]] = []
    for index, (start, end, m, val, m_type) in enumerate(all_matches):
        span_info = _classify_single_span_details(original_text, m, val, raw_matches_list, index, match_type=m_type)
        spans.append(span_info)

    if match is not None:
        for s in spans:
            if s["start"] == match.start() and s["end"] == match.end():
                return [s]
        amount_val = amount if amount is not None else _parse_amount_token(match.group(0))
        return [_classify_single_span_details(original_text, match, amount_val, [match], 0, match_type=match_type)]

    return spans


def _classify_single_span_details(
    text: str,
    match: Any,
    amount: Optional[int],
    matches: List[Any],
    match_index: int,
    match_type: str = "number",
) -> Dict[str, Any]:
    raw_token = match.group(0)
    start = match.start()
    end = match.end()

    prefix = text[max(0, start - 50):start]
    if any(sep in prefix for sep in (".", ";", "\n")):
        prefix = re.split(r"[.;\n]", prefix)[-1]
    suffix = text[end:min(len(text), end + 50)]
    if any(sep in suffix for sep in (".", ";", "\n")):
        suffix = re.split(r"[.;\n]", suffix)[0]
    local_window = text[max(0, start - 80):min(len(text), end + 80)]

    folded_prefix = _fold_text_for_markers(prefix)
    folded_suffix = _fold_text_for_markers(suffix)
    folded_window = _fold_text_for_markers(local_window)

    if re.search(r"[\ufffd\u25fd\u25fe]$", prefix):
        return _build_span_result(raw_token, amount, "unknown", False, 0.5, "corrupted_symbol_prefix", start, end)

    # --- 1. Phone number or Model code ---
    digits_only = re.sub(r"\D", "", raw_token)
    has_phone_prefix = any(_contains_term(folded_prefix, p) for p in ("sdt", "sđt", "dt", "phone", "tel", "zalo", "lh", "lien he", "contact"))
    has_model_prefix = (
        any(_contains_term(folded_prefix, p) for p in ("model", "ma", "mã", "ref", "sku", "part", "item no", "code", "bo loc", "bộ lọc", "pmg", "grade", "epq"))
        or bool(re.search(r"(?:#|\bno\.?|\bnum\.?|\blot\s*#?)\s*$", folded_prefix, re.IGNORECASE))
    )

    if (len(digits_only) >= 9 and (digits_only.startswith("0") or digits_only.startswith("84") or has_phone_prefix)) or has_model_prefix:
        return _build_span_result(raw_token, amount, "model", False, 0.95, "model_or_phone_number", start, end)

    # --- 2. Percentage ---
    if suffix.lstrip().startswith("%") or re.match(r"\s*(?:percent|percentage|phan\s+tram)\b", folded_suffix):
        return _build_span_result(raw_token, amount, "percentage", False, 0.98, "percentage_suffix", start, end)

    # --- 3. Serial Number ---
    has_letter_prefix = bool(re.search(r"\b[A-Za-z]{1,4}\s*#?\s*$", prefix)) and len(digits_only) >= 5
    has_serial_prefix = bool(re.search(r"(?:serial|seri|so\s+seri|serial\s+no|seri\s+no|s/n|sn|serial\s+#|seri\s+dep)\s*(?:no\.?|number|#|:)?\s*$", folded_prefix))

    if (has_letter_prefix or has_serial_prefix) and not _has_explicit_denomination_prefix(folded_prefix) and not _has_currency_unit_context(folded_prefix, folded_suffix, folded_window):
        return _build_span_result(raw_token, amount, "serial", False, 0.95, "serial_number_pattern", start, end)

    # --- 4. Year / Year Range ---
    looks_like_year_range = bool(re.search(r"\b(1[7-9]\d\d|20\d\d)\s*[-/–—]\s*(1[7-9]\d\d|20\d\d)\b", local_window))
    has_year_marker = _has_year_number_marker(local_window)
    has_series_year = bool(
        re.search(r"(?:series|seri|star)\s*$", folded_prefix)
        or re.search(r"^\s*(?:star|series|frn|federal reserve note|unc|edition)\b", folded_suffix)
        or re.search(r"\b(?:series|seri|star)\s*(1[7-9]\d\d|20\d\d)\b", folded_window)
        or re.search(r"\b(1[7-9]\d\d|20\d\d)\s*(?:star|series|frn|federal reserve note|unc|edition)\b", folded_window)
    )

    if amount is not None and 1700 <= amount <= 2100:
        is_currency_bound = _has_explicit_denomination_prefix(folded_prefix) or _has_currency_unit_context(folded_prefix, folded_suffix, folded_window)
        if not is_currency_bound and (looks_like_year_range or has_year_marker or has_series_year or not _has_price_sale_amount_context(folded_prefix, folded_suffix, folded_window)):
            return _build_span_result(raw_token, amount, "year", False, 0.95, "year_marker_or_range", start, end)

    # --- 5. Quantity ---
    has_quantity_suffix = bool(re.match(r"\s*(?:sold|da\s+ban|pcs?|pieces?|bundle|brick|lots?|quantity|qty|bo|cuon|tap)\b", folded_suffix))
    has_quantity_prefix = bool(re.search(r"(?:quantity|qty|lot\s+of|bundle\s+of|lot|bo)\s*(?:of|:)?\s*$", folded_prefix))

    if (has_quantity_suffix or has_quantity_prefix) and not _has_explicit_denomination_prefix(folded_prefix):
        return _build_span_result(raw_token, amount, "quantity", False, 0.95, "quantity_marker", start, end)

    # --- 6. Currency Conversion / Exchange Rate ---
    has_conversion_keyword = any(_contains_term(folded_window, kw) for kw in ("sang", "doi sang", "to", "out of", "into", "exchange rate", "ty gia", "quy doi", "converter", "conversion", "rate", "="))
    has_conversion_pattern = bool(
        re.search(r"\d+[\d.,\s]*\s+[A-Z]{3}\s+(?:sang|to|doi\s+sang|out\s+of|=)\s+[A-Z]{3}", folded_window, re.IGNORECASE)
        or re.search(r"\d+[\d.,\s]*\s+[A-Z]{3}\s*=\s*\d+[\d.,\s]*\s+[A-Z]{3}", folded_window, re.IGNORECASE)
        or (has_conversion_keyword and not _has_explicit_denomination_prefix(folded_prefix) and any(kw in folded_window for kw in ("sang", "doi sang", "exchange rate", "ty gia", "quy doi")))
    )

    if has_conversion_pattern and not _has_explicit_denomination_prefix(folded_prefix):
        return _build_span_result(raw_token, amount, "conversion", False, 0.95, "conversion_exchange_rate", start, end)

    # --- 7. Commercial Price / Sale Price ---
    has_price_prefix = bool(re.search(r"(?:price|gia\s+ban|gia|sold\s+for|buy|sell|auction|sale|for\s+sale|discount|gia\s+chi|gia\s+tu|us\s+\$|usd\s+\$)\s*(?:is|la|:)?\s*$", folded_prefix))
    has_banknote_suffix = bool(re.match(r"\s*(?:banknote|notes?|bills?|paper\s+money|tờ\s+tiền|mệnh\s+giá|frn|federal\s+reserve\s+note)\b", folded_suffix))
    is_float_price = (bool(re.search(r"^\s*\$\s*\d+(?:\.\d{1,2})?$", raw_token)) or (prefix.rstrip().endswith("$") and not _has_explicit_denomination_prefix(folded_prefix))) and not has_banknote_suffix
    has_price_sale_context = _has_price_sale_amount_context(folded_prefix, folded_suffix, folded_window)

    if (has_price_prefix or has_price_sale_context or is_float_price) and not _has_explicit_denomination_prefix(folded_prefix):
        return _build_span_result(raw_token, amount, "price", False, 0.95, "commercial_price_prefix", start, end)

    # --- 8. Denomination ---
    has_explicit_denom_prefix = _has_explicit_denomination_prefix(folded_prefix)
    has_currency_unit = _has_currency_unit_context(folded_prefix, folded_suffix, folded_window)
    has_banknote_context = any(_contains_term(folded_window, kw) for kw in ("banknote", "banknotes", "note", "notes", "bill", "bills", "paper money", "tien giay", "to tien", "menh gia", "face value", "frn", "federal reserve note", "to", "tờ", "dong", "đồng"))

    if (has_explicit_denom_prefix or has_currency_unit or match_type == "word" or (has_banknote_context and amount is not None and amount > 0)):
        conf = 0.95 if (has_explicit_denom_prefix or match_type == "word") else 0.85
        return _build_span_result(raw_token, amount, "denomination", True, conf, "valid_denomination_context", start, end)

    # --- 9. Unknown ---
    return _build_span_result(raw_token, amount, "unknown", False, 0.5, "lacks_banknote_context", start, end)


def _ignored_amount_reason_for_match(
    text: str,
    match: Any,
    amount: int,
    matches: List[Any],
    match_index: int,
    match_type: str = "number",
) -> Optional[str]:
    spans = classify_numeric_span(text, match=match, amount=amount, match_type=match_type)
    if spans:
        span = spans[0]
        if not span["is_denomination"]:
            cat = span["category"]
            if cat == "percentage":
                return "ignored_percentage_number"
            elif cat == "year":
                return "ignored_year_number"
            elif cat == "serial":
                return "ignored_serial_number"
            elif cat == "model":
                return "ignored_grade_number"
            elif cat == "quantity":
                return "ignored_listing_quantity"
            elif cat in ("price", "conversion"):
                return "weak_shop_conflict_ignored"
            return f"ignored_{cat}_number"
    return None


def _identity_text_amounts_with_ignored(
    item: Dict[str, Any],
    currency: Optional[str],
) -> tuple[List[int], List[Dict[str, Any]]]:
    """Extract denomination candidates only from identity text, with ignored-number trace."""
    text = _identity_text_for_amounts(item)
    text = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", text, flags=re.IGNORECASE)
    pattern = re.compile(
        r"(?<!\w)(?P<short>\d{1,3})\s*(?P<unit>k|nghìn|nghin|ngàn|ngan)\b"
        r"|(?<!\d)(?P<number>\d{1,3}(?:[.,\s]\d{2,3}){1,3}|\d{1,7})(?!\d)",
        flags=re.IGNORECASE,
    )
    amounts: List[int] = []
    ignored: List[Dict[str, Any]] = []
    matches = list(pattern.finditer(text))
    for match_index, match in enumerate(matches):
        raw = match.group(0)
        amount = _parse_amount_token(raw)
        if not is_valid_agent3_denomination(amount, currency):
            continue

        match_type = "word" if match.group("short") else "number"
        reason = _ignored_amount_reason_for_match(text, match, amount, matches, match_index, match_type=match_type)
        if reason:
            ignored.append(
                {
                    "amount": amount,
                    "raw": raw,
                    "reason": reason,
                    "context": _compact_text(text[max(0, match.start() - 48):match.end() + 48], 160),
                }
            )
            continue
        if amount not in amounts:
            amounts.append(amount)

    folded_text = _fold_text_for_markers(text)
    for phrase_match in re.finditer(
        r"(?<!\w)(?:mot|one)\s+(?:nghin|ngan|thousand)(?!\w)",
        folded_text,
        flags=re.IGNORECASE,
    ):
        amount = 1000
        if not is_valid_agent3_denomination(amount, currency):
            continue
        local_context = text[
            max(0, phrase_match.start() - 72):phrase_match.end() + 72
        ]
        folded_context = _fold_text_for_markers(local_context)
        has_currency_or_banknote_context = (
            _has_explicit_denomination_context(local_context, amount)
            or any(
                _contains_term(folded_context, marker)
                for marker in (
                    "vnd", "dong", "banknote", "note", "bill",
                    "currency", "paper money", "tien giay", "to tien",
                    "menh gia",
                )
            )
        )
        if has_currency_or_banknote_context and amount not in amounts:
            amounts.append(amount)
    amounts = _drop_non_catalog_amounts_when_catalog_amount_exists(amounts, currency)
    multi_context_amounts = _multi_denomination_context_amounts(text, currency)
    if len(multi_context_amounts) >= 2:
        amounts = multi_context_amounts
    return amounts, ignored


def _identity_text_amounts(item: Dict[str, Any], currency: Optional[str]) -> List[int]:
    amounts, _ignored = _identity_text_amounts_with_ignored(item, currency)
    return amounts


def _legacy_identity_text_amounts(item: Dict[str, Any], currency: Optional[str]) -> List[int]:
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


DENOMINATION_LIST_MARKERS = (
    "available denominations",
    "banknote denominations",
    "banknote family",
    "banknote series",
    "banknote set",
    "banknotes include",
    "catalog",
    "catalogue",
    "complete set",
    "currency series",
    "denomination list",
    "denominations",
    "issued denominations",
    "series of notes",
)

DENOMINATION_LIST_SOURCE_MARKERS = (
    "banknoteworld",
    "catalog",
    "catalogue",
    "colnect",
    "numista",
    "worldbanknotes",
)


def _raw_valid_denomination_mentions(text: str, currency: Optional[str]) -> List[int]:
    pattern = re.compile(
        r"(?<!\w)(?P<short>\d{1,3})\s*[kK](?!\w)"
        r"|(?<!\d)(?P<number>\d{1,3}(?:[.,\s]\d{2,3}){1,3}|\d{1,7})"
        r"(?:\s*(?P<scale>thousand|nghin|ngan))?(?!\w)",
        flags=re.IGNORECASE,
    )
    amounts: List[int] = []
    for match in pattern.finditer(text or ""):
        if match.group("short"):
            amount = int(match.group("short")) * 1000
        else:
            amount = _parse_amount_token(match.group("number") or "")
            if amount is not None and match.group("scale"):
                amount *= 1000
        if is_valid_agent3_denomination(amount, currency) and amount not in amounts:
            amounts.append(amount)
    return amounts


def _drop_non_catalog_amounts_when_catalog_amount_exists(
    amounts: List[Any],
    currency: Optional[str],
) -> List[Any]:
    allowed = ALLOWED_DENOMINATIONS.get(str(currency or "").upper())
    if not allowed:
        return amounts

    parsed_pairs = [(raw, _parse_amount_token(raw)) for raw in amounts or []]
    has_catalog_amount = any(amount in allowed for _raw, amount in parsed_pairs)
    if not has_catalog_amount:
        return amounts

    cleaned: List[Any] = []
    for raw, amount in parsed_pairs:
        if amount is not None and amount not in allowed:
            continue
        cleaned.append(amount if amount is not None else raw)
    return cleaned


def _multi_denomination_context_amounts(
    text: str,
    currency: Optional[str],
) -> List[int]:
    original_text = str(text or "")
    if not original_text.strip():
        return []

    allowed = ALLOWED_DENOMINATIONS.get(str(currency or "").upper())
    number_pattern = re.compile(
        r"(?<!\d)(?P<number>\d{1,3}(?:[.,\s]\d{3})+|\d{1,7})(?!\d)",
        flags=re.IGNORECASE,
    )
    matches: List[Dict[str, Any]] = []
    amounts: List[int] = []
    for match in number_pattern.finditer(original_text):
        amount = _parse_amount_token(match.group("number"))
        if amount is None or amount <= 0:
            continue
        if allowed is not None:
            if amount not in allowed:
                continue
        elif not is_valid_agent3_denomination(amount, currency):
            continue
        matches.append({"amount": amount, "start": match.start(), "end": match.end()})
        if amount not in amounts:
            amounts.append(amount)

    if len(amounts) < 2:
        return []

    folded_text = _fold_text_for_markers(original_text)
    has_plural_multi_marker = bool(
        re.search(
            r"\b(?:cac|nhieu|multiple|several|distinct|different)\s+"
            r"(?:menh\s+gia|denominations?)\b",
            folded_text,
            flags=re.IGNORECASE,
        )
        or re.search(
            r"\bdenominations\b",
            folded_text,
            flags=re.IGNORECASE,
        )
    )

    sorted_matches = sorted(matches, key=lambda item: item["start"])
    for left, right in zip(sorted_matches, sorted_matches[1:]):
        if left["amount"] == right["amount"]:
            continue
        before = _fold_text_for_markers(original_text[max(0, left["start"] - 48):left["start"]])
        between = _fold_text_for_markers(original_text[left["end"]:right["start"]])
        explicit_range_start = bool(re.search(r"(?:\btu\b|\bfrom\b|\bbetween\b)\s*$", before))
        range_connector = bool(
            re.search(r"\b(?:den|toi|to|through|thru|and)\b", between)
            or re.fullmatch(r"\s*[-/\u2013\u2014]\s*", between)
        )
        list_connector = bool(re.search(r"\b(?:va|and|or|hoac)\b|[,;/]", between))
        if range_connector and (explicit_range_start or re.search(r"\b(?:den|toi|to|through|thru)\b", between)):
            return amounts
        if list_connector and has_plural_multi_marker:
            return amounts

    direct_context_count = 0
    for match in sorted_matches:
        prefix = _fold_text_for_markers(original_text[max(0, match["start"] - 56):match["start"]])
        suffix = _fold_text_for_markers(original_text[match["end"]:min(len(original_text), match["end"] + 56)])
        has_prefix_context = bool(
            re.search(
                r"(?:menh\s+gia|denomination|face\s+value|"
                r"tien\s+giay|to\s+tien|banknotes?|notes?|bills?)"
                r"(?:\s+tien|\s+menh\s+gia)?\s*(?:is|la|:)?\s*$",
                prefix,
                flags=re.IGNORECASE,
            )
        )
        has_suffix_context = bool(
            re.match(
                r"\s*(?:vnd|dong|usd|dollars?|eur|euros?)?\s*"
                r"(?:banknotes?|notes?|bills?|tien\s+giay|to\s+tien)\b",
                suffix,
                flags=re.IGNORECASE,
            )
        )
        if has_prefix_context or has_suffix_context:
            direct_context_count += 1

    return amounts if direct_context_count >= 2 else []


def _denomination_list_context_reason(
    item: Dict[str, Any],
    currency: Optional[str],
) -> Optional[str]:
    identity_text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "page_text_excerpt")
    ).casefold()
    source_text = " ".join(
        str(item.get(key) or "")
        for key in ("source", "domain", "url")
    ).casefold()
    if len(_raw_valid_denomination_mentions(identity_text, currency)) < 3:
        return None

    has_list_marker = any(marker in identity_text for marker in DENOMINATION_LIST_MARKERS)
    has_catalog_source = any(marker in source_text for marker in DENOMINATION_LIST_SOURCE_MARKERS)
    if has_list_marker:
        return "catalog_denomination_list" if has_catalog_source else "denomination_family_list"
    return None


def is_valid_agent3_denomination(amount: Optional[int], currency: Optional[str] = None) -> bool:
    if amount is None or amount <= 0:
        return False
    if currency:
        code = str(currency).upper()
        if not re.fullmatch(r"[A-Z]{3}", code):
            return False
    return amount <= 100_000_000


def is_denomination_catalog_match(amount: Optional[int], currency: Optional[str] = None) -> bool:
    if amount is None or amount <= 0:
        return False
    if not currency:
        return True
    code = str(currency).upper()
    allowed = ALLOWED_DENOMINATIONS.get(code)
    if allowed is None:
        return True
    return amount in allowed


def _normalize_country_key(value: Any, currency: Optional[str] = None) -> str:
    identity = normalize_currency_identity(value, currency, None)
    normalized = identity.get("canonical_country") or identity.get("reported_country")
    text = unicodedata.normalize("NFD", str(normalized or value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    aliases = {
        "timor leste": "timor-leste",
        "european union": "euro zone",
        "europe": "euro zone",
        "eurozone": "euro zone",
        "eu": "euro zone",
    }
    return aliases.get(text, text)


def _country_currency_consistent(country: Any, currency: Optional[str]) -> bool:
    expected = COUNTRY_EXPECTED_CURRENCIES.get(_normalize_country_key(country, currency))
    return not expected or str(currency or "").upper() in expected


def _canonical_vote_key_from_parts(
    country: Any,
    currency: Any,
    amount: Any,
) -> Optional[tuple]:
    identity = normalize_currency_identity(country, currency, amount)
    vote_key = identity.get("vote_key")
    return tuple(vote_key) if vote_key else None


def _identity_conflict_fields(
    left_key: Optional[tuple],
    right_key: Optional[tuple],
) -> List[str]:
    if not left_key or not right_key:
        return ["incomplete_identity"]
    fields = []
    for index, name in enumerate(("country", "currency", "denomination")):
        if left_key[index] != right_key[index]:
            fields.append(name)
    return fields


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
    "facebook",
    "instagram.com",
    "instagram",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "ebay.",
    "ebay",
    "amazon.",
    "shopee.",
    "shopee",
    "lazada.",
    "lazada",
    "marketplace",
    "auction",
    "dau gia",
    "đấu giá",
    "shop",
    "cart",
    "add to cart",
    "sale",
    "for sale",
    "contact",
    "call",
    "seridep",
    "sold for",
    "collector",
    "collector price",
    "birthday note",
    "serial dep",
    "seri dep",
    "so seri",
    "li xi",
    "lixi",
    "serial đẹp",
    "seri đẹp",
    "istock",
    "stock photo",
    "stock image",
    "shutterstock",
    "getty",
    "alamy",
    "dreamstime",
    "123rf",
    "adobe stock",
)

PERCENT_NUMBER_MARKERS = ("%", "percent", "percentage", "phan tram")
YEAR_NUMBER_MARKERS = ("year", "issued", "issue date", "phat hanh", "new")
SERIAL_NUMBER_MARKERS = ("serial", "seri", "so seri", "serial dep", "seri dep", "seridep")
GRADE_NUMBER_MARKERS = ("pmg", "pcgs", "epq", "unc", "au", "ef", "vf", "xf", "grade", "condition")
LISTING_QUANTITY_MARKERS = (
    "pcs", "pc", "pieces", "piece", "bundle", "brick", "lot", "quantity", "qty",
)
COMMERCIAL_NUMBER_MARKERS = (
    "price", "shop", "buy", "sell", "sold for", "auction", "ebay", "marketplace",
    "collector", "collector price", "birthday note", "gia ban", "sale", "for sale",
    "contact", "call", "cart", "lien he",
)
TRUE_DENOMINATION_MARKERS = (
    "denomination", "face value", "menh gia", "this exact banknote",
    "exact banknote", "banknote is", "note is",
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
    "euro zone": (
        "european union", "euro zone", "eurozone", "europe", "chau au",
        "lien minh chau au", "euro", "euros", "eur", "€",
    ),
    "myanmar": ("myanmar", "burma", "kyat"),
    "cambodia": ("cambodia", "campuchia", "riel"),
    "laos": ("laos", "lào", "kip"),
}


def normalize_lens_evidence(
    evidence: Optional[List[Dict[str, Any]]],
    provider: str = "unknown",
) -> List[Dict[str, Any]]:
    from app.services.evidence_ranker_service import get_canonical_domain
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
            score = float(raw_item.get("score") if raw_item.get("score") is not None else (raw.get("score") or 0.0))
        except (TypeError, ValueError):
            score = 0.0

        title = str(raw.get("title") or raw.get("text") or "").strip()
        snippet = str(raw.get("snippet") or raw.get("description") or "").strip()
        source = str(raw.get("source") or raw.get("source_name") or domain or "").strip()
        page_text_excerpt = _compact_text(raw.get("page_text_excerpt"))

        rank_reasons = raw_item.get("rank_reasons") or raw.get("rank_reasons") or []
        if not isinstance(rank_reasons, list):
            rank_reasons = [str(rank_reasons)]

        identity_text = " ".join((title, snippet, page_text_excerpt))
        explicit_banknote_context = (
            _has_explicit_banknote_phrase(identity_text)
            or _has_explicit_banknote_url_path(raw)
        )
        can_infer_unknown_identity = bool(page_text_excerpt or raw.get("page_text_identity_terms"))
        detected_curr = _normalize_currency_code(raw.get("detected_currency"))
        if _is_unknown_identity(detected_curr) and (
            "detected_currency" not in raw or can_infer_unknown_identity
        ):
            detected_curr = _normalize_currency_code(identity_text)

        detected_coun = raw.get("detected_country")
        if _is_unknown_identity(detected_coun) and (
            "detected_country" not in raw or can_infer_unknown_identity
        ):
            from app.services.evidence_ranker_service import _extract_country_currency
            detected_coun, _c = _extract_country_currency(identity_text, preferred_currency=detected_curr)

        if "detected_amounts" in raw and raw["detected_amounts"] is not None:
            raw_amounts = list(raw["detected_amounts"]) if isinstance(raw["detected_amounts"], (list, tuple, set)) else [raw["detected_amounts"]]
        else:
            temp_item = {"title": title, "snippet": snippet, "page_text_excerpt": page_text_excerpt}
            raw_amounts, _ignored = _identity_text_amounts_with_ignored(temp_item, detected_curr)
        raw_amounts = _drop_non_catalog_amounts_when_catalog_amount_exists(list(raw_amounts), detected_curr)
        multi_context_amounts = _multi_denomination_context_amounts(identity_text, detected_curr)
        if len(multi_context_amounts) >= 2:
            raw_amounts = multi_context_amounts
        metadata_context_item = {
            "title": title,
            "snippet": snippet,
            "page_text_excerpt": page_text_excerpt,
            "detected_country": detected_coun,
            "detected_currency": detected_curr,
            "detected_amounts": list(raw_amounts),
            "rank_reasons": rank_reasons,
        }
        metadata_banknote_context = _has_metadata_banknote_context(metadata_context_item)

        normalized_items.append(
            {
                "evidence_origin": raw.get("evidence_origin", "lens_visual_match"),
                "is_candidate_assisted": raw.get("is_candidate_assisted", False),
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
                "detected_country": detected_coun,
                "detected_currency": detected_curr,
                "detected_amounts": list(raw_amounts),
                "link_checked": bool(raw.get("link_checked")),
                "link_alive": raw.get("link_alive"),
                "page_text_checked": raw.get("page_text_checked", "skipped"),
                "page_fetch_status": raw.get("page_fetch_status"),
                "fetch_status": raw.get("fetch_status"),
                "page_text_skip_reason": raw.get("page_text_skip_reason"),
                "page_text_excerpt": page_text_excerpt,
                "page_text_excerpt_chars": len(page_text_excerpt),
                "page_text_identity_terms": list(raw.get("page_text_identity_terms") or []),
                "content_identity_quality": raw.get("content_identity_quality"),
                "has_banknote_context": (
                    True
                    if explicit_banknote_context or metadata_banknote_context
                    else raw.get("has_banknote_context")
                    if raw.get("has_banknote_context") is not None
                    else raw.get("banknote_context")
                    if raw.get("banknote_context") is not None
                    else explicit_banknote_context
                ),
                "query": str(raw.get("query") or "").strip(),
                "evidence_type": str(raw.get("evidence_type") or "lens").strip(),
                "is_candidate_assisted": bool(raw.get("is_candidate_assisted")),
                "qualified_source": raw.get("qualified_source"),
                # --- Prompt 2 source classification & dedupe annotations ---
                # Preserved as-is so verify_lens_evidence_identity can use them
                # without re-running classify_source or deduplicate_and_count_evidence.
                "source_trust_level": raw.get("source_trust_level"),        # TRUSTED/NEUTRAL/WEAK_COMMERCIAL/NOISE/...
                "source_class": raw.get("source_class"),
                "is_mirror": raw.get("is_mirror"),                          # bool from Prompt 2 dedupe
                "is_duplicate_url": raw.get("is_duplicate_url"),            # bool from Prompt 2 dedupe
                "domain_first": raw.get("domain_first"),                    # bool: first URL for this canonical domain
                "is_independent": raw.get("is_independent"),                # bool from Prompt 2 dedupe
                "canonical_domain": (
                    raw.get("canonical_domain")
                    or get_canonical_domain(url or source or domain)
                    or domain
                    or source
                ),
                "canonical_url": (
                    raw.get("canonical_url")
                    or url
                ),
                "mirror_group_id": raw.get("mirror_group_id"),              # int from Prompt 2 dedupe
                "mirror_reason": raw.get("mirror_reason"),                  # str from Prompt 2 dedupe
                "mirror_similarity": raw.get("mirror_similarity"),          # float from Prompt 2 dedupe
                # --------------------------------------------------------
                "_ag3_pre_page_identity": raw.get("_ag3_pre_page_identity"),
                "raw": original_raw,
            }

        )
        _reconcile_page_text_identity(normalized_items[-1])

    normalized_items.sort(key=lambda item: (item["rank"], -item["score"]))
    return normalized_items


def _is_trusted_evidence(item: Dict[str, Any]) -> bool:
    annotated = str(item.get("source_trust_level") or "").upper().strip()
    if annotated == "TRUSTED":
        return True
    if annotated in {"STRONG_NEUTRAL", "ESTABLISHED_CATALOG", "NEUTRAL", "WEAK_COMMERCIAL", "NOISE", "SOCIAL", "UNREADABLE", "UNKNOWN"}:
        return False
    # Unannotated fallback: check domain, source, url ONLY (never title)
    domain_source = " ".join(
        str(item.get(key) or "")
        for key in ("domain", "source", "url")
    ).lower()
    return any(hint in domain_source for hint in TRUSTED_EVIDENCE_HINTS)



def _is_weak_evidence(item: Dict[str, Any]) -> bool:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "page_text_excerpt", "source", "domain", "url")
    ).lower()
    folded = _fold_text_for_markers(text)
    return any(hint in text or hint in folded for hint in WEAK_EVIDENCE_HINTS)


def _evidence_noise_reason(item: Dict[str, Any]) -> Optional[str]:
    text = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "source", "domain", "url")
    ).casefold()
    for marker in NEGATIVE_EXCHANGE_KEYWORDS:
        if _contains_term(text, marker):
            return f"noise:{marker}"
    return None


def _content_identity_quality_is_noise(item: Dict[str, Any]) -> bool:
    if str(item.get("content_identity_quality") or "").upper().strip() != "NOISE":
        return False
    return not (
        _has_metadata_banknote_context(item)
        and _item_has_simple_usable_identity(item)
    )


def _metadata_identity_field_count(item: Dict[str, Any]) -> int:
    country_known = not _is_unknown_identity(item.get("detected_country"))
    currency_known = not _is_unknown_identity(_normalize_currency_code(item.get("detected_currency")))
    amounts = item.get("detected_amounts")
    denomination_known = isinstance(amounts, list) and len(amounts) == 1
    if denomination_known:
        try:
            denomination_known = int(amounts[0]) > 0
        except (TypeError, ValueError):
            denomination_known = False
    return int(country_known) + int(currency_known) + int(denomination_known)


def _has_metadata_banknote_context(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    if _evidence_noise_reason(item) or _is_non_banknote_numismatic_object(item):
        return False

    identity_text = _evidence_identity_text(item)
    currency = _normalize_currency_code(item.get("detected_currency")) or _normalize_currency_code(identity_text)
    amounts, _ignored = _identity_text_amounts_with_ignored(
        {"title": item.get("title"), "snippet": item.get("snippet"), "page_text_excerpt": ""},
        currency,
    )
    if len(amounts) != 1:
        return False

    direct_context = _has_direct_banknote_amount_context(identity_text, amounts[0])
    title_or_snippet = " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet")
    ).casefold()
    metadata_signal = any(
        _contains_term(title_or_snippet, marker)
        for marker in (
            "file", "tap tin", ".jpg", ".jpeg", ".png", "catalog", "catalogue",
            "unc", "p-", "tien co", "tien xua",
        )
    )
    issue_year_signal = bool(
        _item_has_simple_exact_identity(item)
        and re.search(r"\b(?:1[7-9]\d\d|20\d\d)\b", title_or_snippet)
    )
    return bool(direct_context or metadata_signal or issue_year_signal)


def _item_has_simple_usable_identity(item: Dict[str, Any]) -> bool:
    return _metadata_identity_field_count(item) >= 2


def _item_has_simple_exact_identity(item: Dict[str, Any]) -> bool:
    return _metadata_identity_field_count(item) == 3


def _item_effective_trust_level(item: Dict[str, Any]) -> str:
    """Return the effective trust level for an evidence item.

    Priority order:
    1. Explicit Prompt 2 annotation via 'source_trust_level' field.
       Recognised values: TRUSTED, NEUTRAL, WEAK_COMMERCIAL, NOISE,
       SOCIAL, UNREADABLE (case-insensitive).
    2. Keyword-based heuristic fallback (for pre-Prompt-2 / unannotated items):
       - _is_trusted_evidence  → TRUSTED
       - _is_weak_evidence     → WEAK_COMMERCIAL
       - else                  → NEUTRAL

    The fallback ensures backward-compatibility with test fixtures that do not
    yet carry source_trust_level annotations from Prompt 2 classify_source.
    """
    annotated = str(item.get("source_trust_level") or item.get("source_class") or "").upper().strip()
    if annotated in {"STRONG_NEUTRAL", "ESTABLISHED_CATALOG"}:
        return "NEUTRAL"
    if annotated == "UNKNOWN":
        return "UNKNOWN"
    known = {"TRUSTED", "NEUTRAL", "WEAK_COMMERCIAL", "NOISE", "SOCIAL", "UNREADABLE"}
    if annotated in known:
        return annotated
    # Fallback for unannotated (pre-Prompt-2) items
    if _is_trusted_evidence(item):
        return "TRUSTED"
    if _is_weak_evidence(item):
        return "WEAK_COMMERCIAL"
    return "NEUTRAL"


def _item_supports_complete_identity(
    item: Dict[str, Any],
    selected_identity: Dict[str, Any],
) -> bool:
    """Determine whether an evidence item supports the full complete identity."""
    if not isinstance(item, dict) or not isinstance(selected_identity, dict):
        return False
    country = selected_identity.get("country")
    currency = str(selected_identity.get("currency") or "").strip().upper()
    try:
        amount = int(selected_identity.get("amount"))
    except (TypeError, ValueError):
        return False

    if item.get("content_identity_quality") == "PARTIAL_IDENTITY":
        return False

    trust = _item_effective_trust_level(item)
    if trust in ("NOISE", "SOCIAL", "UNREADABLE"):
        return False

    support = _evidence_support_for_identity(item, country, currency, amount)
    return bool(
        support["supports"]
        and support.get("country_match")
        and support.get("currency_match")
        and support["exact_amount_support"]
    )



def _amount_signal_terms(text: str, amount: int) -> List[str]:
    amount_regex = rf"(?<!\d){_amount_pattern(amount)}(?!\d)"
    terms: List[str] = []
    if re.search(amount_regex, text or "", flags=re.IGNORECASE):
        terms.append(str(amount))
    if amount >= 1000 and amount % 1000 == 0:
        short_amount = amount // 1000
        if re.search(
            rf"(?<!\w){short_amount}\s*(?:k|nghìn|ngàn)(?!\w)",
            text or "",
            flags=re.IGNORECASE,
        ):
            terms.append(f"{short_amount}k")
    if amount == 1000 and re.search(
        r"(?<!\w)(?:mot|one)\s+(?:nghin|ngan|thousand)(?!\w)",
        _fold_text_for_markers(text),
        flags=re.IGNORECASE,
    ):
        terms.append("mot nghin")
    return list(dict.fromkeys(terms))


def _canonical_source_key(item: Dict[str, Any]) -> str:
    raw_domain = str(item.get("domain") or "").strip().lower()
    raw_url = str(item.get("url") or item.get("link") or "").strip()
    if not raw_domain and raw_url:
        try:
            raw_domain = urlparse(raw_url).netloc.lower()
        except Exception:
            raw_domain = ""
    domain = raw_domain.split("@")[-1].split(":")[0].strip(".")
    for prefix in ("www.", "m.", "mobile."):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    if domain:
        labels = [label for label in domain.split(".") if label]
        if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in {
            "ac", "co", "com", "edu", "gov", "net", "org",
        }:
            return ".".join(labels[-3:])
        if len(labels) >= 2:
            return ".".join(labels[-2:])
        return domain
    source = _fold_text_for_markers(item.get("source") or "").strip()
    return source or raw_url.casefold()


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
    amount_terms = _amount_signal_terms(combined, amount)

    currency_terms = []
    for alias in CURRENCY_ALIASES.get(currency, [currency.lower()]):
        if _contains_term(combined, alias):
            currency_terms.append(alias)
            break
    if (
        currency == "USD"
        and not currency_terms
        and not _has_open_foreign_dollar_context(combined)
        and any(_contains_term(combined, term) for term in ("dollar", "dollars"))
    ):
        currency_terms.append("dollar")
    country_key = _normalize_country_key(country, currency)
    for alias in COUNTRY_SIGNAL_ALIASES.get(country_key, (country_key,)):
        if alias and _contains_term(combined, alias):
            currency_terms.append(alias)
            break
    if not currency_terms and item.get("detected_country"):
        if _normalize_country_key(item.get("detected_country"), currency) == country_key:
            currency_terms.append(f"detected:{item.get('detected_country')}")
    if (
        currency == "VND"
        and country_key == "vietnam"
        and re.search(rf"{amount_regex}\s+đồng\b", combined, flags=re.IGNORECASE)
    ):
        currency_terms.append("amount+đồng@vietnam")

    money_terms = []
    from app.services.evidence_ranker_service import BANKNOTE_KEYWORDS
    for keyword in BANKNOTE_KEYWORDS:
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
    title_amount_signal = bool(_amount_signal_terms(title_lower, amount))

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
    text = _evidence_identity_text(item)
    can_infer_unknown_identity = bool(item.get("page_text_excerpt") or item.get("page_text_identity_terms"))
    currency = _normalize_currency_code(item.get("detected_currency"))
    if _is_unknown_identity(currency) and (
        "detected_currency" not in item or can_infer_unknown_identity
    ):
        currency = _normalize_currency_code(text)
    country = item.get("detected_country")
    if _is_unknown_identity(country) and (
        "detected_country" not in item or can_infer_unknown_identity
    ):
        from app.services.evidence_ranker_service import _extract_country_currency
        country, _c = _extract_country_currency(text, preferred_currency=currency)

    if _is_unknown_identity(country):
        errors.append("country_missing")
    if _is_unknown_identity(currency):
        errors.append("currency_missing")

    if "detected_amounts" in item and isinstance(item.get("detected_amounts"), list):
        valid_amounts = item["detected_amounts"]
    else:
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
        "evidence_origin": item.get("evidence_origin", "lens_visual_match"),
        "is_candidate_assisted": item.get("is_candidate_assisted", False),
        "country": str(country).strip(),
        "country_key": _normalize_country_key(country, currency),
        "currency": currency,
        "amount": amount,
        "score": score,
        "trusted": trusted_source,
        "weak_source": weak_source,
        "source_acceptable": not weak_source and (
            trusted_source or signals["direct_title_match"]
        ),
        "signals": signals,
        "source_key": _canonical_source_key(item),
        "evidence": item,
    }, []


def _evidence_support_for_identity(
    item: Dict[str, Any],
    country: Any,
    currency: str,
    amount: int,
) -> Dict[str, Any]:
    signals = _identity_text_signals(item, country, currency, amount)
    title_snippet_item = dict(item)
    title_snippet_item["page_text_excerpt"] = ""
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
    denomination_list_reason = _denomination_list_context_reason(item, currency)

    target_country_key = _normalize_country_key(country, currency)
    detected_country = item.get("detected_country")
    detected_currency = _normalize_currency_code(item.get("detected_currency"))
    country_match = (
        not _is_unknown_identity(detected_country)
        and _normalize_country_key(detected_country, currency) == target_country_key
    ) or any(
        reason.startswith("country:")
        and _normalize_country_key(reason.split(":", 1)[1], currency) == target_country_key
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
    if "detected_amounts" in item and isinstance(item.get("detected_amounts"), list):
        detected_amount_list = item["detected_amounts"]
        ignored_amounts = []
    else:
        detected_amount_list, ignored_amounts = (
            _identity_text_amounts_with_ignored(item, currency)
            if metadata_matches_identity
            else ([], [])
        )
    title_snippet_amount_list, _ignored_title_amounts = (
        _identity_text_amounts_with_ignored(title_snippet_item, currency)
        if metadata_matches_identity
        else ([], [])
    )
    page_text_amount_list, _ignored_page_text_amounts = (
        _identity_text_amounts_with_ignored(page_text_item, currency)
        if page_text_excerpt and metadata_matches_identity
        else ([], [])
    )
    detected_amounts = set(detected_amount_list)
    title_snippet_amounts = set(title_snippet_amount_list)
    page_text_amounts = set(page_text_amount_list)
    weak_source = _is_weak_evidence(item)
    complete_page_text_terms = _has_complete_page_text_identity_terms(
        list(item.get("page_text_identity_terms") or []),
        country=country,
        currency=currency,
        amount=amount,
    )
    if complete_page_text_terms:
        denomination_list_reason = None
    direct_title_or_snippet_support = bool(
        amount in title_snippet_amounts
        and title_snippet_signals["direct_match"]
        and not denomination_list_reason
    )
    # Weak-source exact support: social/video domain with clear banknote identity in title.
    # Contributes to signal counts but alone is NOT sufficient for promotion.
    weak_exact_support = bool(
        weak_source
        and amount in title_snippet_amounts
        and title_snippet_signals["direct_match"]
        and not denomination_list_reason
    )
    weak_page_text_support = bool(
        weak_source
        and ((amount in page_text_amounts and page_text_signals["direct_match"]) or complete_page_text_terms)
        and not denomination_list_reason
    )
    page_text_support = bool(
        ((amount in page_text_amounts and page_text_signals["direct_match"]) or complete_page_text_terms)
        and not denomination_list_reason
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
    if denomination_list_reason:
        supports = False
    evidence_key = str(item.get("url") or "").strip().lower() or "|".join(
        (
            str(item.get("domain") or item.get("source") or "").strip().lower(),
            str(item.get("title") or "").strip().lower(),
            str(item.get("rank") or ""),
        )
    )
    independent_key = _canonical_source_key(item) or evidence_key
    conflicting_amounts: List[int] = []
    conflict_ignored_amounts: List[Dict[str, Any]] = list(ignored_amounts)
    if not denomination_list_reason:
        for value in sorted(detected_amounts):
            if value == amount:
                continue
            if weak_source and not _has_explicit_denomination_context(
                _identity_text_for_amounts(item),
                value,
            ):
                conflict_ignored_amounts.append(
                    {
                        "amount": value,
                        "raw": str(value),
                        "reason": "weak_shop_conflict_ignored",
                        "context": _compact_text(_identity_text_for_amounts(item), 160),
                    }
                )
                continue
            conflicting_amounts.append(value)

    return {
        "supports": bool(supports),
        "evidence_key": evidence_key,
        "independent_key": independent_key,
        "source": str(item.get("source") or item.get("domain") or "").strip(),
        "rank": item.get("rank"),
        "weak_source": weak_source,
        "trusted_source": _is_trusted_evidence(item),
        "country_match": bool(country_match),
        "currency_match": bool(currency_match),
        "signals": signals,
        "exact_amount_support": bool(
            direct_title_or_snippet_support or page_text_support
        ),

        "direct_title_or_snippet_support": direct_title_or_snippet_support,
        "weak_exact_support": weak_exact_support,
        "weak_page_text_support": weak_page_text_support,
        "page_text_support": page_text_support,
        "page_text_identity_terms": list(item.get("page_text_identity_terms") or []),
        "conflicting_amounts": conflicting_amounts,
        "ignored_amounts": conflict_ignored_amounts,
        "denomination_list_reason": denomination_list_reason,
        "score": float(item.get("score") or 0.0),
    }


def _has_complete_page_text_identity_terms(
    terms: List[Any],
    *,
    country: Any,
    currency: str,
    amount: int,
) -> bool:
    normalized_terms = {str(term or "").strip().casefold() for term in terms}
    country_key = _normalize_country_key(country, currency)
    has_country = any(
        term.startswith("country:")
        and _normalize_country_key(term.split(":", 1)[1], currency) == country_key
        for term in normalized_terms
    )
    return bool(
        has_country
        and f"currency:{str(currency or '').upper()}".casefold() in normalized_terms
        and f"amount:{amount}".casefold() in normalized_terms
        and any(term.startswith("banknote_context:") for term in normalized_terms)
    )


def _has_exact_title_snippet_money_phrase(ev_item: Dict[str, Any]) -> bool:
    """Return True when title or snippet contains a direct money phrase that:
    1. Has exactly one primary denomination matching detected_amounts.
    2. Has a currency signal (word or symbol adjacent to the amount).
    3. Has a banknote context word (banknote, bill, tờ tiền, mệnh giá, etc.).

    This is the relaxed eligibility path: page fetch success is NOT required
    when title/snippet already provide an exact identity.
    """
    amounts = ev_item.get("detected_amounts") or []
    if not isinstance(amounts, list) or len(amounts) != 1:
        return False
    amount = amounts[0]
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return False

    title = str(ev_item.get("title") or "").strip()
    snippet = str(ev_item.get("snippet") or "").strip()
    # Priority: title first, then title+snippet together.
    for text in (title, f"{title} {snippet}"):
        res = _has_direct_banknote_amount_context(text, str(amount))
        if res:
            return True
    return False


def verify_lens_evidence_identity(
    evidence: List[Dict[str, Any]],
    provider: str = "unknown",
) -> tuple[Optional[Dict[str, Any]], Dict[str, Any], List[str]]:
    """Verify identity using the same conservative rules for every AG3 provider.

    Noise filtering priority (Prompt 2 integration):
    - If an item has source_trust_level annotated by Prompt 2 classify_source,
      we use THAT as ground truth.
    - source_trust_level == 'NOISE' → noise (filtered out of consensus).
    - source_trust_level in {'TRUSTED','NEUTRAL','WEAK_COMMERCIAL'} → NOT noise,
      even if the keyword-based _evidence_noise_reason would have flagged it.
    - Items without source_trust_level fall back to _evidence_noise_reason.
    """
    def _item_effective_trust_level(item: Dict[str, Any]) -> str:
        if not isinstance(item, dict):
            return "UNREADABLE"
        trust = str(item.get("source_trust_level") or item.get("source_class") or "").upper().strip()
        text = f"{item.get('source', '')} {item.get('title', '')} {item.get('snippet', '')} {item.get('url', '')}".lower()
        if any(kw in text for kw in ("stock photo", "stock image", "royalty-free", "shop listing", "auction", "giá bán", "gia ban")):
            return "WEAK_COMMERCIAL"
        if trust in {"STRONG_NEUTRAL", "ESTABLISHED_CATALOG"}:
            return "NEUTRAL"
        if trust:
            return trust
        from app.services.evidence_ranker_service import classify_source
        res = classify_source(item)
        return str(res.get("source_trust_level") or "").upper().strip()

    def _item_is_noise(item: Dict[str, Any]) -> bool:
        """Return True only if this item is genuinely noise for verifier purposes."""
        if _content_identity_quality_is_noise(item):
            return True
        if _is_non_banknote_numismatic_object(item):
            return True
        noise_reason = _evidence_noise_reason(item)
        if noise_reason:
            return True
        trust = _item_effective_trust_level(item)
        if trust in ("NOISE", "UNREADABLE", "SOCIAL"):
            return True
        if trust in ("TRUSTED", "NEUTRAL", "WEAK_COMMERCIAL"):
            return False
        return False

    def _item_noise_reason(item: Dict[str, Any]) -> str:
        """Return a human-readable noise reason or empty string."""
        if _content_identity_quality_is_noise(item):
            return "content_identity_quality:NOISE"
        trust = str(item.get("source_trust_level") or "").upper()
        if trust == "NOISE":
            return f"source_trust_level:NOISE"
        if _is_non_banknote_numismatic_object(item):
            return "non_banknote_numismatic_object"
        if trust in ("TRUSTED", "NEUTRAL", "WEAK_COMMERCIAL"):
            return ""
        return _evidence_noise_reason(item) or ""

    normalized_evidence = normalize_lens_evidence(evidence, provider=provider)
    noise_evidence = [
        (item, _item_noise_reason(item))
        for item in normalized_evidence
        if _item_is_noise(item)
    ]
    consensus_evidence = [
        item for item in normalized_evidence if not _item_is_noise(item)
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
        "strong_independent_source_count": 0,
        "trusted_source_count": 0,
        "trusted_exact_count": 0,
        "strong_exact_count": 0,
        "weak_exact_count": 0,
        "weak_page_text_count": 0,
        "weak_independent_source_count": 0,
        "direct_title_or_snippet_support_count": 0,
        "page_text_checked_count": page_text_checked_count,
        "page_text_support_count": 0,
        "page_text_used_for_identity": False,
        "independent_conflicting_amount_support_count": 0,
        "top_score": 0.0,
        "selected_voting_set_size": 0,
        "selected_source_count": 0,
        "vote_eligible": False,
        "vote_created": False,
        "conflicting_denominations": [],
        "top5_evidence_count": len(normalized_evidence),
        "noise_filtered_count": len(noise_evidence),
        "denomination_list_filtered_count": 0,
        "denomination_list_filtered_evidence": [],
        "ignored_amounts": [],
        "ignored_amount_reasons": {},
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
        if any(_item_effective_trust_level(item) in ("WEAK_COMMERCIAL", "SOCIAL") for item in normalized_evidence):
            base_trace["reason"] = "weak_commercial_source_not_counted"
            return None, base_trace, ["weak_commercial_source_not_counted"]
        base_trace["reason"] = "noise_only"
        return None, base_trace, ["noise_only"]

    # Rule 10 — usable source pool: ALL non-NOISE banknote-context independent domains,
    # including partials (country+currency without denomination).
    usable_domains: set = set()
    usable_items: List[Dict[str, Any]] = []
    for item in consensus_evidence:
        s_trust = str(item.get("source_trust_level") or "").upper().strip()
        if s_trust in ("NOISE", "SOCIAL", "UNREADABLE"):
            continue
        dom = str(item.get("canonical_domain") or item.get("domain") or "").strip().lower()
        if not dom or dom in ("", "unknown", "none", "null"):
            continue
        if not item.get("banknote_context") and not _item_has_banknote_context(item):
            continue
        if not _item_has_simple_usable_identity(item):
            continue
        if dom not in usable_domains:
            usable_domains.add(dom)
            usable_items.append(item)

    total_usable_independent_sources = len(usable_domains)
    base_trace["total_usable_independent_sources"] = total_usable_independent_sources
    base_trace["usable_source_count"] = total_usable_independent_sources

    # EXACTLY 5 best independent usable sources
    selected_voting_items = usable_items[:5]
    selected_voting_source_count = len(selected_voting_items)
    selected_domains = [
        str(item.get("canonical_domain") or item.get("domain") or "").strip().lower()
        for item in selected_voting_items
    ]
    selected_independent_domain_count = len(set(selected_domains))

    base_trace["selected_voting_source_count"] = selected_voting_source_count
    base_trace["selected_domains"] = selected_domains
    base_trace["selected_independent_domain_count"] = selected_independent_domain_count
    base_trace["selected_voting_sources"] = [item.get("url") or item.get("link") or "" for item in selected_voting_items]

    raw_candidates: List[Dict[str, Any]] = []
    candidate_errors = set()

    for item in selected_voting_items:
        candidate, errors = _structured_evidence_candidate(item)
        candidate_errors.update(errors)
        if candidate:
            raw_candidates.append(candidate)

    # Deduplicate by canonical domain (source_key), keeping the one with highest score
    candidates_by_domain: Dict[str, Dict[str, Any]] = {}
    for cand in raw_candidates:
        domain = cand["source_key"]
        if domain not in candidates_by_domain or cand["score"] > candidates_by_domain[domain]["score"]:
            candidates_by_domain[domain] = cand

    candidates: List[Dict[str, Any]] = list(candidates_by_domain.values())
    total_qualified_independent_sources = len(candidates)
    base_trace["qualified_source_count"] = total_qualified_independent_sources

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
        strong_independent_support_sources = set()
        trusted_independent_support_sources = set()
        denomination_list_filtered_records: Dict[str, Dict[str, Any]] = {}
        strong_exact_records: Dict[str, Dict[str, Any]] = {}
        trusted_exact_records: Dict[str, Dict[str, Any]] = {}
        # Separate tracking for weak-source exact signals. They are evidence,
        # but policy must not let one weak source carry a vote alone.
        weak_exact_records: Dict[str, Dict[str, Any]] = {}
        weak_page_text_records: Dict[str, Dict[str, Any]] = {}
        weak_independent_sources = set()
        ignored_amount_records: Dict[str, Dict[str, Any]] = {}
        seen_domains_in_group = set()
        for item in selected_voting_items:
            support = _evidence_support_for_identity(
                item,
                group["records"][0]["country"],
                group["records"][0]["currency"],
                group["records"][0]["amount"],
            )
            trust_level = _item_effective_trust_level(item)
            is_valid_source = trust_level not in ("NOISE", "SOCIAL", "UNREADABLE")
            has_complete_exact_support = bool(
                support["exact_amount_support"]
                and support.get("country_match")
                and support.get("currency_match")
                and (
                    item.get("content_identity_quality") != "PARTIAL_IDENTITY"
                    or support.get("direct_title_or_snippet_support")
                    or support.get("page_text_support")
                )
                and is_valid_source
            )
            canon_domain = item.get("canonical_domain") or support["independent_key"]
            is_mirror_item = bool(item.get("is_mirror"))
            is_dup_url = bool(item.get("is_duplicate_url"))
            domain_first_item = item.get("domain_first", None)

            if domain_first_item is not None:
                is_first_domain = bool(domain_first_item)
            else:
                is_first_domain = canon_domain not in seen_domains_in_group
                if is_first_domain and canon_domain:
                    seen_domains_in_group.add(canon_domain)

            counts_as_independent = (
                has_complete_exact_support
                and not is_mirror_item
                and not is_dup_url
                and is_first_domain
            )

            if support["supports"] and support["evidence_key"]:
                if support["evidence_key"] not in support_records:
                    support_records[support["evidence_key"]] = support
                    if id(item) not in record_evidence_ids:
                        auxiliary_support_count += 1
            if support["exact_amount_support"] and support["evidence_key"]:
                exact_amount_support_records.setdefault(support["evidence_key"], support)
                if counts_as_independent and canon_domain:
                    independent_support_sources.add(canon_domain)
                if trust_level in ("TRUSTED", "NEUTRAL"):
                    strong_exact_records.setdefault(support["evidence_key"], support)
                    if counts_as_independent and canon_domain:
                        strong_independent_support_sources.add(canon_domain)
                if trust_level == "TRUSTED" or support.get("trusted_source"):
                    trusted_exact_records.setdefault(support["evidence_key"], support)
                    if counts_as_independent and canon_domain:
                        trusted_independent_support_sources.add(canon_domain)

            if support["direct_title_or_snippet_support"] and support["evidence_key"]:
                direct_title_support_records.setdefault(support["evidence_key"], support)
                support_signal_records.setdefault(
                    f"title:{support['evidence_key']}",
                    support,
                )
            if (
                support.get("weak_exact_support") or support.get("weak_page_text_support")
            ) and support["evidence_key"]:
                weak_exact_records.setdefault(support["evidence_key"], support)
                if support.get("weak_page_text_support"):
                    weak_page_text_records.setdefault(support["evidence_key"], support)
                if support["independent_key"]:
                    weak_independent_sources.add(support["independent_key"])
            if support["page_text_support"] and support["evidence_key"]:
                page_text_support_records.setdefault(support["evidence_key"], support)
                support_signal_records.setdefault(
                    f"page:{support['evidence_key']}",
                    support,
                )
            for conflicting_amount in support["conflicting_amounts"]:
                by_source = conflict_records.setdefault(conflicting_amount, {})
                source_key = support["independent_key"]
                current = by_source.get(source_key)
                if current is None or support["score"] > current["score"]:
                    by_source[source_key] = support
            if support.get("denomination_list_reason") and support["evidence_key"]:
                denomination_list_filtered_records.setdefault(
                    support["evidence_key"],
                    support,
                )
            for ignored in support.get("ignored_amounts") or []:
                ignored_key = "|".join(
                    (
                        support["evidence_key"],
                        str(ignored.get("amount")),
                        str(ignored.get("reason")),
                        str(ignored.get("raw")),
                    )
                )
                ignored_amount_records.setdefault(ignored_key, ignored)

        group["support_records"] = support_records
        group["support_count"] = len(support_records) or min(len(group["records"]), 1)
        group["context_support_count"] = group["support_count"]
        group["exact_amount_support_count"] = len(exact_amount_support_records)
        group["support_signal_count"] = len(support_signal_records)
        group["strong_exact_count"] = len(strong_exact_records)
        group["trusted_exact_count"] = len(trusted_exact_records)
        group["weak_exact_count"] = len(weak_exact_records)
        group["weak_page_text_count"] = len(weak_page_text_records)
        group["weak_independent_source_count"] = len(
            {s for s in weak_independent_sources if s}
        )
        group["independent_source_count"] = len(
            {source for source in independent_support_sources if source}
        )
        group["strong_independent_source_count"] = len(
            {source for source in strong_independent_support_sources if source}
        )
        group["trusted_independent_source_count"] = len(
            {source for source in trusted_independent_support_sources if source}
        )
        group["direct_title_or_snippet_support_count"] = len(
            direct_title_support_records
        )
        group["page_text_support_count"] = len(page_text_support_records)
        group["page_text_used_for_identity"] = bool(page_text_support_records)
        group["page_text_identity_terms"] = list(dict.fromkeys(
            term
            for support in page_text_support_records.values()
            for term in support.get("page_text_identity_terms", [])
        ))
        group["denomination_list_filtered_count"] = len(denomination_list_filtered_records)
        group["ignored_amounts"] = list(ignored_amount_records.values())
        ignored_reasons: Dict[str, int] = {}
        for ignored in group["ignored_amounts"]:
            reason = str(ignored.get("reason") or "unknown")
            ignored_reasons[reason] = ignored_reasons.get(reason, 0) + 1
        group["ignored_amount_reasons"] = ignored_reasons
        group["denomination_list_filtered_evidence"] = [
            {
                "rank": support.get("rank"),
                "source": support.get("source"),
                "reason": support.get("denomination_list_reason"),
            }
            for support in denomination_list_filtered_records.values()
        ]
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
        group["top_trusted_direct_score"] = max(
            (
                support["score"]
                for support in trusted_exact_records.values()
                if support["signals"]["direct_match"]
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
    from app.services.evidence_ranker_service import deduplicate_and_count_evidence
    dedupe_stats = deduplicate_and_count_evidence(consensus_evidence)
    base_trace["raw_evidence_count"] = dedupe_stats["raw_evidence_count"]

    initial_lens_result_count = dedupe_stats.get("initial_lens_result_count", 0)
    targeted_search_result_count = dedupe_stats.get("targeted_search_result_count", 0)
    total_raw_evidence_count = dedupe_stats.get("total_raw_evidence_count", 0)

    base_trace["initial_lens_result_count"] = initial_lens_result_count
    base_trace["targeted_search_result_count"] = targeted_search_result_count
    base_trace["total_raw_evidence_count"] = total_raw_evidence_count

    supporting_evidence_count = top_candidate_group["support_count"]
    duplicate_evidence_count = dedupe_stats.get("duplicate_url_count", 0) + dedupe_stats.get("duplicate_domain_count", 0)
    excluded_evidence_count = dedupe_stats.get("noise_source_count", 0) + dedupe_stats.get("unreadable_source_count", 0)
    partial_evidence_count = dedupe_stats.get("partial_identity_count", 0)
    conflicting_evidence_count = total_raw_evidence_count - (supporting_evidence_count + partial_evidence_count + excluded_evidence_count + duplicate_evidence_count)
    if conflicting_evidence_count < 0:
        conflicting_evidence_count = 0

    base_trace["supporting_evidence_count"] = supporting_evidence_count
    base_trace["conflicting_evidence_count"] = conflicting_evidence_count
    base_trace["partial_evidence_count"] = partial_evidence_count
    base_trace["excluded_evidence_count"] = excluded_evidence_count
    base_trace["duplicate_evidence_count"] = duplicate_evidence_count

    base_trace["usable_evidence_count"] = dedupe_stats["usable_evidence_count"]
    base_trace["unique_url_count"] = dedupe_stats["unique_url_count"]
    base_trace["unique_domain_count"] = dedupe_stats["unique_domain_count"]
    base_trace["mirror_content_count"] = dedupe_stats["mirror_content_count"]
    base_trace["duplicate_url_count"] = dedupe_stats["duplicate_url_count"]
    base_trace["duplicate_domain_count"] = dedupe_stats["duplicate_domain_count"]
    base_trace["support_count"] = top_candidate_group["support_count"]
    base_trace["context_support_count"] = top_candidate_group["context_support_count"]
    base_trace["exact_amount_support_count"] = top_candidate_group["exact_amount_support_count"]
    base_trace["support_signal_count"] = top_candidate_group["support_signal_count"]
    base_trace["independent_source_count"] = top_candidate_group["independent_source_count"]
    base_trace["strong_independent_source_count"] = top_candidate_group[
        "strong_independent_source_count"
    ]
    base_trace["trusted_source_count"] = top_candidate_group["trusted_count"]
    base_trace["trusted_exact_count"] = top_candidate_group["trusted_exact_count"]
    base_trace["strong_exact_count"] = top_candidate_group["strong_exact_count"]
    base_trace["weak_exact_count"] = top_candidate_group.get("weak_exact_count", 0)
    base_trace["weak_page_text_count"] = top_candidate_group.get("weak_page_text_count", 0)
    base_trace["weak_independent_source_count"] = top_candidate_group.get(
        "weak_independent_source_count", 0
    )
    base_trace["direct_title_or_snippet_support_count"] = top_candidate_group[
        "direct_title_or_snippet_support_count"
    ]
    base_trace["page_text_support_count"] = top_candidate_group["page_text_support_count"]
    base_trace["page_text_used_for_identity"] = top_candidate_group["page_text_used_for_identity"]
    base_trace["page_text_identity_terms"] = top_candidate_group.get("page_text_identity_terms") or []
    base_trace["independent_conflicting_amount_support_count"] = top_candidate_group[
        "independent_conflicting_amount_support_count"
    ]
    base_trace["denomination_list_filtered_count"] = top_candidate_group[
        "denomination_list_filtered_count"
    ]
    base_trace["denomination_list_filtered_evidence"] = top_candidate_group[
        "denomination_list_filtered_evidence"
    ]
    base_trace["ignored_amounts"] = top_candidate_group.get("ignored_amounts") or []
    base_trace["ignored_amount_reasons"] = top_candidate_group.get("ignored_amount_reasons") or {}
    base_trace["top_score"] = top_candidate_group["max_score"]
    base_trace["checks"].update(
        {
            "identity_complete": True,
            "amount_allowed": True,
            "direct_title_or_snippet_match": bool(
                top_candidate_group["direct_title_or_snippet_support_count"] >= 1
            ),
            "source_trusted": bool(top_candidate_group["trusted_count"]),
            "multiple_evidence_agreement": bool(
                top_candidate_group["support_signal_count"] >= 3
                and top_candidate_group["independent_source_count"] >= 2
                and top_candidate_group["direct_title_or_snippet_support_count"] >= 2
                and top_candidate_group["exact_amount_support_count"] >= 2
                and top_candidate_group["independent_conflicting_amount_support_count"] == 0
                and (
                    top_candidate_group["independent_source_count"] > 2
                    or top_candidate_group["page_text_support_count"] >= 1
                )
            ),
            "conflict_check_passed": True,
        }
    )

    cross_identity_conflicts = []
    for other_key, other_group in ranked_groups[1:]:
        different_country_or_currency = other_key[:2] != top_candidate_key[:2]
        other_has_direct_identity = (
            other_group["exact_amount_support_count"] >= 1
            and other_group["direct_title_or_snippet_support_count"] >= 1
        )
        scores_are_close = abs(
            top_candidate_group["max_score"] - other_group["max_score"]
        ) <= 1.5
        both_have_repeated_support = (
            len(top_candidate_group["records"]) >= 2
            and len(other_group["records"]) >= 2
        )
        if (
            different_country_or_currency
            and other_has_direct_identity
            and (scores_are_close or both_have_repeated_support)
        ):
            cross_identity_conflicts.append((other_key, other_group))

    if cross_identity_conflicts:
        base_trace["reason"] = "conflicting_evidence"
        base_trace["checks"]["conflict_check_passed"] = False
        base_trace["conflicting_identities"] = [
            {
                "country_key": key[0],
                "currency": key[1],
                "amount": key[2],
                "support_count": group["exact_amount_support_count"],
                "top_score": group["max_score"],
            }
            for key, group in cross_identity_conflicts
        ]
        return None, base_trace, ["conflicting_evidence"]

    true_explicit_conflicts = []
    ignored_conflicts = []
    candidate_support_count = top_candidate_group.get("exact_amount_support_count", 0)

    for conflict in top_candidate_group.get("conflicting_denominations", []):
        if conflict["support_count"] < 1:
            continue

        is_minor_noise = False
        if conflict["support_count"] == 1:
            candidate_dominant = candidate_support_count >= 3
            winning_margin = candidate_support_count - conflict["support_count"]
            is_low_rank = all(r > 3 for r in conflict.get("evidence_ranks", [])) if conflict.get("evidence_ranks") else False
            is_low_score = conflict.get("max_score", 0.0) < 7.0
            if (candidate_dominant and winning_margin >= 2) or is_low_rank or is_low_score:
                is_minor_noise = True

        if is_minor_noise:
            ignored_conflicts.append({
                "amount": conflict["amount"],
                "raw": str(conflict["amount"]),
                "reason": "minor_noise_ignored",
                "context": f"Candidate support {candidate_support_count}, conflict max score {conflict.get('max_score', 0.0)}",
            })
        else:
            true_explicit_conflicts.append(conflict)

    if ignored_conflicts:
        if "ignored_amounts" not in top_candidate_group:
            top_candidate_group["ignored_amounts"] = []
        top_candidate_group["ignored_amounts"].extend(ignored_conflicts)
        base_trace["ignored_amounts"] = top_candidate_group["ignored_amounts"]

    if true_explicit_conflicts:
        base_trace["conflicting_denominations"] = true_explicit_conflicts
        max_conflict_support = max(
            (conflict.get("support_count", 0) for conflict in true_explicit_conflicts),
            default=0,
        )
        majority_can_record_conflict = bool(
            total_qualified_independent_sources >= 5
            and top_candidate_group.get("independent_source_count", 0) >= 3
            and candidate_support_count >= 3
            and candidate_support_count > max_conflict_support
        )
        near_top_conflict = any(
            conflict["support_count"] >= 2
            and top_candidate_group["max_score"] - conflict.get("max_score", 0.0) <= 2.0
            for conflict in true_explicit_conflicts
        )
        significant_mixed_evidence = any(
            conflict["support_count"] >= 2
            and conflict.get("max_score", 0.0) >= 7.0
            for conflict in true_explicit_conflicts
        )
        reason = (
            "near_top_conflicting_denomination"
            if near_top_conflict
            else (
                "mixed_denomination_lens_evidence"
                if significant_mixed_evidence
                else "conflicting_denominations_in_lens_evidence"
            )
        )
        cross_identity_amount_conflict = any(
            int(conflict.get("amount") or 0) in (item.get("detected_amounts") or [])
            and (
                (
                    _normalize_currency_code(item.get("detected_currency"))
                    and _normalize_currency_code(item.get("detected_currency")) != top_candidate_key[1]
                )
                or (
                    not _is_unknown_identity(item.get("detected_country"))
                    and _normalize_country_key(item.get("detected_country"), item.get("detected_currency")) != top_candidate_key[0]
                )
            )
            for conflict in true_explicit_conflicts
            for item in normalized_evidence
        )
        if cross_identity_amount_conflict:
            reason = "conflicting_evidence"
        base_trace["reason"] = reason
        if majority_can_record_conflict:
            base_trace["trusted_conflict"] = any(
                any(
                    str(item.get("source_class") or item.get("source_trust_level") or "").upper().strip()
                    in {"TRUSTED", "STRONG_NEUTRAL"}
                    for item in normalized_evidence
                    if amount in (item.get("detected_amounts") or [])
                )
                for amount in [conflict.get("amount") for conflict in true_explicit_conflicts]
            )
            base_trace["checks"]["conflict_check_passed"] = "recorded_but_majority_retained"
            base_trace.setdefault("recorded_conflict_reasons", []).append(reason)
        else:
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
        competing_blocking_clusters = [
            (other_key, other_group) for other_key, other_group in same_currency_conflicts
            if other_group["independent_source_count"] >= 2
            or (top_candidate_group["independent_source_count"] - other_group["independent_source_count"] < 2)
        ]
        if competing_blocking_clusters:
            near_top_conflict = any(
                top_candidate_group["max_score"] - other_group["max_score"] <= 2.0
                for _key, other_group in competing_blocking_clusters
            )
            significant_mixed_evidence = any(
                other_group["max_score"] >= 7.0
                for _key, other_group in competing_blocking_clusters
            )
            if near_top_conflict or significant_mixed_evidence:
                reason = (
                    "near_top_conflicting_denomination"
                    if near_top_conflict
                    else "mixed_denomination_lens_evidence"
                )
                base_trace["reason"] = reason
                majority_can_record_conflict = bool(
                    total_qualified_independent_sources >= 5
                    and top_candidate_group.get("independent_source_count", 0) >= 3
                    and top_candidate_group.get("exact_amount_support_count", 0) > max(
                        other_group.get("exact_amount_support_count", 0)
                        for _key, other_group in competing_blocking_clusters
                    )
                )
                if majority_can_record_conflict:
                    base_trace["trusted_conflict"] = True
                    base_trace["checks"]["conflict_check_passed"] = "recorded_but_majority_retained"
                    base_trace.setdefault("recorded_conflict_reasons", []).append(reason)
                else:
                    base_trace["checks"]["conflict_check_passed"] = False
                    return None, base_trace, [reason]

    qualified = []
    for key, group in groups.items():
        has_blocking_conflict = any(
            g["independent_source_count"] >= 2 or (group["independent_source_count"] - g["independent_source_count"] < 2)
            for k, g in groups.items()
            if k != key and k[:2] == key[:2] and k[2] != key[2]
        )
        no_conflict = not has_blocking_conflict
        complete_page_text_terms = _has_complete_page_text_identity_terms(
            group.get("page_text_identity_terms") or [],
            country=group["records"][0]["country"],
            currency=group["records"][0]["currency"],
            amount=group["records"][0]["amount"],
        )
        has_non_weak_anchor = (
            group["strong_exact_count"] >= 1
            or group["trusted_exact_count"] >= 1
            or group["strong_independent_source_count"] >= 1
        )
        single_trusted_direct = (
            group["trusted_exact_count"] >= 1
            and group["direct_title_or_snippet_support_count"] >= 1
            and group.get("top_trusted_direct_score", 0.0) >= 8.0
            and no_conflict
        )
        two_independent_direct_exact = (
            group["independent_source_count"] >= 2
            and group["direct_title_or_snippet_support_count"] >= 2
            and group["exact_amount_support_count"] >= 2
            and has_non_weak_anchor
            and no_conflict
            and any(
                _item_effective_trust_level(record["evidence"])
                in ("TRUSTED", "NEUTRAL")
                for record in group["records"]
            )
        )
        multiple_agreement = (
            group["support_signal_count"] >= 3
            and group["independent_source_count"] >= 2
            and group["direct_title_or_snippet_support_count"] >= 2
            and group["exact_amount_support_count"] >= 2
            and has_non_weak_anchor
            and no_conflict
            and (
                group["independent_source_count"] > 2
                or group["page_text_support_count"] >= 1
            )
            and any(
                _item_effective_trust_level(record["evidence"])
                in ("TRUSTED", "NEUTRAL")
                for record in group["records"]
            )
        )
        trusted_direct_exact = group["strong_exact_count"] + group["trusted_exact_count"]
        has_trusted_anchor = (
            trusted_direct_exact >= 1
            or group["page_text_support_count"] >= 1
            or group.get("trusted_count", 0) >= 1
        )
        weak_multi_source = False

        competing_domain_counts = [
            g["independent_source_count"] for k, g in groups.items() if k != key
        ]
        max_competing_domains = max(competing_domain_counts) if competing_domain_counts else 0
        winning_margin = group["independent_source_count"] - max_competing_domains
        group["max_competing_domain_count"] = max_competing_domains
        group["winning_margin"] = winning_margin

        two_thirds_majority = bool(
            total_qualified_independent_sources >= 3
            and group["independent_source_count"] >= 2
            and group["independent_source_count"] / total_qualified_independent_sources >= 2.0 / 3.0
            and no_conflict
            and complete_page_text_terms
        )

        three_fifths_majority = bool(
            total_qualified_independent_sources >= 5
            and group["independent_source_count"] >= 3
            and group["independent_source_count"] / total_qualified_independent_sources >= 3.0 / 5.0
            and (no_conflict or winning_margin >= 1)
            and complete_page_text_terms
        )

        three_of_five_complete_identity = bool(
            group["independent_source_count"] >= 3
            and group["exact_amount_support_count"] >= 3
            and max_competing_domains >= 1
            and (winning_margin >= 1 or max_competing_domains < 2)
            and any(
                _item_effective_trust_level(record["evidence"]) in ("TRUSTED", "NEUTRAL")
                for record in group["records"]
            )
        )

        page_text_identity_support = (
            not multiple_agreement
            and not weak_multi_source
            and group["max_score"] >= 9.0
            and group["support_signal_count"] >= 2
            and group["independent_source_count"] >= 2
            and group["direct_title_or_snippet_support_count"] >= 1
            and group["exact_amount_support_count"] >= 1
            and group["page_text_support_count"] >= 1
            and no_conflict
            and complete_page_text_terms
            and (has_non_weak_anchor or group["independent_source_count"] >= 2)
            and any(
                _item_effective_trust_level(record["evidence"])
                in ("TRUSTED", "NEUTRAL")
                and bool(record["evidence"].get("page_text_excerpt"))
                for record in group["records"]
            )
        )
        if (
            single_trusted_direct
            or two_independent_direct_exact
            or two_thirds_majority
            or three_fifths_majority
            or page_text_identity_support
            or multiple_agreement
            or weak_multi_source
            or three_of_five_complete_identity
        ):
            group["multiple_agreement"] = (
                two_independent_direct_exact
                or multiple_agreement
                or weak_multi_source
                or page_text_identity_support
                or three_of_five_complete_identity
                or two_thirds_majority
                or three_fifths_majority
            )
            group["single_trusted_direct"] = single_trusted_direct
            group["two_independent_direct_exact"] = two_independent_direct_exact
            group["weak_multi_source"] = weak_multi_source
            group["page_text_identity_support"] = page_text_identity_support
            group["three_of_five_complete_identity"] = three_of_five_complete_identity
            group["two_thirds_majority"] = two_thirds_majority
            group["three_fifths_majority"] = three_fifths_majority
            group["auxiliary_agreement"] = (
                (multiple_agreement or weak_multi_source)
                and group["auxiliary_support_count"] >= 1
            )
            if single_trusted_direct:
                group["promotion_path"] = "trusted_direct_exact"
            elif three_fifths_majority:
                group["promotion_path"] = "qualified_three_of_five"
            elif three_of_five_complete_identity:
                group["promotion_path"] = "three_of_five_complete_identity"
            elif two_independent_direct_exact:
                group["promotion_path"] = "two_independent_direct_exact"
            elif two_thirds_majority:
                group["promotion_path"] = "qualified_two_of_three"
            elif page_text_identity_support:
                group["promotion_path"] = "page_text_identity_support"
            elif weak_multi_source:
                group["promotion_path"] = "weak_multi_source"
            else:
                group["promotion_path"] = "strict_multi_agreement"
            qualified.append((key, group))

    candidate_clusters_list = []
    for grp_key, grp_val in ranked_groups:
        candidate_clusters_list.append({
            "cluster_key": f"{grp_key[0]}/{grp_key[1]}/{grp_key[2]}",
            "country": grp_key[0],
            "currency": grp_key[1],
            "amount": grp_key[2],
            "support_count": len(grp_val.get("records") or []),
            "independent_domain_count": grp_val.get("independent_source_count", 0),
            "domains": list(grp_val.get("independent_sources") or []),
            "max_score": grp_val.get("max_score", 0.0),
            "trusted_count": grp_val.get("trusted_count", 0),
            "neutral_count": grp_val.get("neutral_count", 0),
            "weak_commercial_count": grp_val.get("weak_commercial_count", 0),
        })
    base_trace["candidate_clusters"] = candidate_clusters_list
    if qualified:
        base_trace["winning_cluster"] = candidate_clusters_list[0]

    if not qualified:
        base_trace["selected_identity"] = None
        base_trace["selected_evidence"] = None
        if top_candidate_group["independent_conflicting_amount_support_count"] > 0:
            reason = "conflicting_denominations_in_lens_evidence"
            base_trace["checks"]["conflict_check_passed"] = False
        elif (
            top_candidate_group.get("page_text_support_count", 0) >= 1
            and top_candidate_group.get("independent_source_count", 0) < 2
        ):
            reason = "page_text_not_corroborated"
        elif all(record["weak_source"] for record in candidates):
            reason = (
                "single_untrusted_page_text_source"
                if top_candidate_group.get("weak_page_text_count", 0) > 0
                and top_candidate_group.get("weak_independent_source_count", 0) <= 1
                else "weak_commercial_source_not_counted"
            )

        elif (
            top_candidate_group["independent_source_count"] >= 2
            and top_candidate_group["exact_amount_support_count"] >= 2
            and top_candidate_group["direct_title_or_snippet_support_count"] >= 2
            and all(
                _item_effective_trust_level(record["evidence"]) == "WEAK_COMMERCIAL"
                for record in top_candidate_group["records"]
            )
        ):
            reason = "weak_commercial_only"

        elif top_candidate_group["support_signal_count"] < 3:
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
    base_trace["strong_independent_source_count"] = top_group[
        "strong_independent_source_count"
    ]
    base_trace["trusted_source_count"] = top_group["trusted_count"]
    base_trace["trusted_exact_count"] = top_group["trusted_exact_count"]
    base_trace["strong_exact_count"] = top_group["strong_exact_count"]
    base_trace["weak_exact_count"] = top_group.get("weak_exact_count", 0)
    base_trace["weak_page_text_count"] = top_group.get("weak_page_text_count", 0)
    base_trace["weak_independent_source_count"] = top_group.get(
        "weak_independent_source_count", 0
    )
    base_trace["direct_title_or_snippet_support_count"] = top_group[
        "direct_title_or_snippet_support_count"
    ]
    base_trace["page_text_support_count"] = top_group["page_text_support_count"]
    base_trace["page_text_used_for_identity"] = top_group["page_text_used_for_identity"]
    base_trace["page_text_identity_terms"] = top_group.get("page_text_identity_terms") or []
    base_trace["independent_conflicting_amount_support_count"] = top_group[
        "independent_conflicting_amount_support_count"
    ]
    base_trace["ignored_amounts"] = top_group.get("ignored_amounts") or []
    base_trace["ignored_amount_reasons"] = top_group.get("ignored_amount_reasons") or {}

    for other_key, other_group in qualified[1:]:
        scores_are_close = abs(top_group["max_score"] - other_group["max_score"]) <= 1.5
        both_have_repeated_support = (
            len(top_group["records"]) >= 2 and len(other_group["records"]) >= 2
        )
        if other_key != top_key and (scores_are_close or both_have_repeated_support):
            majority_can_record_conflict = bool(
                total_qualified_independent_sources >= 5
                and top_group.get("independent_source_count", 0) >= 3
                and top_group.get("exact_amount_support_count", 0) > other_group.get("exact_amount_support_count", 0)
            )
            if majority_can_record_conflict:
                base_trace["trusted_conflict"] = True
                base_trace["checks"]["conflict_check_passed"] = "recorded_but_majority_retained"
                base_trace.setdefault("recorded_conflict_reasons", []).append("conflicting_evidence")
                continue
            base_trace["reason"] = "conflicting_evidence"
            base_trace["checks"]["conflict_check_passed"] = False
            return None, base_trace, ["conflicting_evidence"]

    if top_group.get("page_text_identity_support"):
        best = max(
            top_group["records"],
            key=lambda record: (
                int(not record["weak_source"]),
                int(record["signals"]["direct_match"]),
                record["score"],
                int(record["trusted"]),
            ),
        )
    else:
        best = max(
            top_group["records"],
            key=lambda record: (record["score"], int(record["trusted"])),
        )
    support_count = top_group["support_count"]
    if top_group.get("single_trusted_direct") or top_group.get("page_text_identity_support") or top_group.get("three_fifths_majority") or top_group.get("two_thirds_majority") or top_group.get("three_of_five_complete_identity") or top_group.get("two_independent_direct_exact"):
        if top_group.get("single_trusted_direct"):
            reason = "trusted_direct_exact"
        elif top_group.get("page_text_identity_support"):
            reason = "page_text_identity_support"
        elif top_group.get("three_fifths_majority"):
            reason = "qualified_three_of_five"
        elif top_group.get("three_of_five_complete_identity") and top_group.get("ignored_amounts"):
            reason = "three_of_five_complete_identity"
        elif top_group.get("three_of_five_complete_identity"):
            reason = "three_of_five_complete_identity"
        elif top_group.get("two_independent_direct_exact"):
            reason = "two_independent_direct_exact"
        elif top_group.get("two_thirds_majority"):
            reason = "qualified_two_of_three"
        else:
            reason = "two_independent_direct_exact"
        promotion_path = reason
        confidence = min(
            0.95,
            max(0.65, 0.65 + min(best["score"], 10.0) / 50.0 + min(support_count - 1, 2) * 0.03),
        )
        if top_group.get("auxiliary_agreement"):
            confidence = min(confidence, 0.85)
        if top_group.get("three_of_five_complete_identity"):
            dom_cnt = top_group["independent_source_count"]
            all_weak = all(
                _item_effective_trust_level(record["evidence"]) == "WEAK_COMMERCIAL"
                for record in top_group["records"]
            )
            if all_weak:
                confidence = 0.80
            elif dom_cnt >= 5:
                confidence = 0.95
            elif dom_cnt == 4:
                confidence = 0.90
            else:
                confidence = max(confidence, 0.80)
            base_trace["confidence_basis"] = "three_of_five_complete_identity"
            base_trace["supporting_domain_count"] = dom_cnt
            base_trace["supporting_evidence_count"] = support_count
            base_trace["competing_domain_count"] = top_group.get("independent_conflicting_amount_support_count", 0)
            base_trace["winning_margin"] = top_group.get("winning_margin", dom_cnt)
    else:
        confidence = min(
            0.95,
            max(0.65, 0.65 + min(best["score"], 10.0) / 50.0 + min(support_count - 1, 2) * 0.03),
        )
        if top_group.get("auxiliary_agreement"):
            confidence = min(confidence, 0.85)
        reason = "two_independent_direct_exact"
        promotion_path = reason


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
            "promotion_path": promotion_path,
            "weak_exact_count": top_group.get("weak_exact_count", 0),

            "weak_page_text_count": top_group.get("weak_page_text_count", 0),
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
                    top_group["direct_title_or_snippet_support_count"] >= 1
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
            "strong_independent_source_count": top_group[
                "strong_independent_source_count"
            ],
            "trusted_source_count": top_group["trusted_count"],
            "trusted_exact_count": top_group["trusted_exact_count"],
            "strong_exact_count": top_group["strong_exact_count"],
            "direct_title_or_snippet_support_count": top_group[
                "direct_title_or_snippet_support_count"
            ],
            "page_text_support_count": top_group["page_text_support_count"],
            "page_text_used_for_identity": top_group["page_text_used_for_identity"],
            "page_text_identity_terms": top_group.get("page_text_identity_terms") or [],
            "independent_conflicting_amount_support_count": top_group[
                "independent_conflicting_amount_support_count"
            ],
            "ignored_amounts": top_group.get("ignored_amounts") or [],
            "ignored_amount_reasons": top_group.get("ignored_amount_reasons") or {},
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
        "strong_independent_source_count": top_group[
            "strong_independent_source_count"
        ],
        "trusted_source_count": top_group["trusted_count"],
        "trusted_exact_count": top_group["trusted_exact_count"],
        "strong_exact_count": top_group["strong_exact_count"],
        "direct_title_or_snippet_support_count": top_group[
            "direct_title_or_snippet_support_count"
        ],
        "page_text_support_count": top_group["page_text_support_count"],
        "page_text_used_for_identity": top_group["page_text_used_for_identity"],
        "page_text_identity_terms": top_group.get("page_text_identity_terms") or [],
        "independent_conflicting_amount_support_count": top_group[
            "independent_conflicting_amount_support_count"
        ],
        "ignored_amounts": top_group.get("ignored_amounts") or [],
        "ignored_amount_reasons": top_group.get("ignored_amount_reasons") or {},
        "top_score": best["score"],
        "trusted_source": bool(best["trusted"]),
        "reason": reason,
        "selected_evidence": selected_evidence,
    }
    # Rule 10: EXACTLY 5 independent usable sources, >=3 must agree on exact identity.
    _selected_source_count = base_trace.get("selected_voting_source_count", 0)
    _selected_domain_count = base_trace.get("selected_independent_domain_count", 0)

    # Check the top exact group's support (within the 5 selected items).
    # We use exact_amount_support_count as the majority_count metric.
    _majority_count = top_group.get("exact_amount_support_count", 0)

    base_trace["majority_count"] = _majority_count
    base_trace["majority_required"] = 3
    base_trace["vote_eligible"] = False
    base_trace["vote_created"] = False

    identity_valid = bool(
        best.get("country") and best.get("currency") and best.get("amount") is not None
    )

    if (
        _selected_source_count == 5
        and _selected_domain_count == 5
        and _majority_count >= 3
        and identity_valid
    ):
        base_trace["vote_eligible"] = True
        base_trace["vote_created"] = True

    base_trace["vote_identity"] = {
        "country": best["country"],
        "currency": best["currency"],
        "amount": best["amount"],
    } if base_trace["vote_created"] else {}

    base_trace["majority_achieved"] = _majority_count
    base_trace["selected_voting_set_size"] = _selected_source_count

    if base_trace["vote_created"]:
        base_trace["winning_identity"] = base_trace["vote_identity"]
    base_trace["selected_source_count"] = base_trace["selected_voting_set_size"]
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

    target_key = (_normalize_country_key(country, currency), str(currency).upper(), amount)
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
    groq_extractions: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Normalize V1/V2 output and prevent unsupported Lens votes."""
    normalized = dict(item or {})
    status = str(normalized.get("status") or "").strip().lower()
    provider = str(normalized.get("provider") or "unknown").strip().lower() or "unknown"
    technical_failure = bool(normalized.get("technical_error")) or status in {"failed", "error", "technical_error"}
    raw_evidence_input = evidence if evidence is not None else normalized.get("evidence") or []
    initial_evidence_input: List[Dict[str, Any]] = []
    targeted_evidence_input: List[Dict[str, Any]] = []
    for raw_item in raw_evidence_input or []:
        if not isinstance(raw_item, dict):
            continue
        is_targeted = bool(raw_item.get("is_candidate_assisted")) or str(
            raw_item.get("evidence_type") or raw_item.get("mode") or ""
        ).strip().lower() in {
            "candidate_verification",
            "targeted_candidate_verification",
            "targeted_search",
        }
        if is_targeted:
            if len(targeted_evidence_input) < TARGETED_LENS_RESULT_LIMIT:
                targeted_evidence_input.append(raw_item)
        elif len(initial_evidence_input) < INITIAL_LENS_RESULT_LIMIT:
            initial_evidence_input.append(raw_item)
    limited_evidence_input = initial_evidence_input + targeted_evidence_input
    normalized_evidence = normalize_lens_evidence(
        limited_evidence_input,
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
    normalized["trace"] = promotion_trace
    normalized["vote_eligible"] = bool(promotion_trace.get("vote_eligible"))
    normalized["vote_created"] = bool(promotion_trace.get("vote_created"))

    verification_reason = str(promotion_trace.get("reason") or "")
    confidence_cap_reasons = {
        "weak_single_lens_evidence",
        "mixed_denomination_lens_evidence",
        "near_top_conflicting_denomination",
        "conflicting_denominations_in_lens_evidence",
        "insufficient_support_signals",
        "insufficient_independent_evidence",
        "insufficient_direct_title_or_snippet_support",
        "page_text_support_required_for_two_sources",
        "single_untrusted_page_text_source",
        "weak_commercial_source_not_counted",
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
    initial_key = _canonical_vote_key_from_parts(country, currency, amount)
    verified_key = (
        _canonical_vote_key_from_parts(
            verified_identity.get("country"),
            verified_identity.get("currency"),
            verified_identity.get("amount"),
        )
        if verified_identity
        else None
    )
    if verified_identity:
        promotion_trace["initial_canonical_vote_key"] = list(initial_key) if initial_key else None
        promotion_trace["verified_canonical_vote_key"] = list(verified_key) if verified_key else None
        promotion_trace["canonical_identity_match"] = (
            initial_key == verified_key
            if initial_key and verified_key
            else None
        )
        if initial_key and verified_key and initial_key != verified_key:
            promotion_trace["conflict_fields"] = _identity_conflict_fields(
                initial_key,
                verified_key,
            )
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
        if accepted_identity["reason"] == "page_text_identity_support":
            confidence = min(confidence, 0.80)
        if accepted_identity["reason"] in {
            "promoted_from_lens_evidence",
            "two_independent_direct_exact",
        }:
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
    if amount is None:
        validation_errors.append("amount_not_allowed")
    elif not is_valid_agent3_denomination(amount, currency):
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
        and amount is not None
        and currency is not None
        and country is not None
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
    else:
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
    if identity_complete and accepted_identity:
        normalized["quoc_gia"] = str(country).strip()
        normalized["menh_gia"] = f"{amount} {currency}"
        normalized["ma_tien_te"] = currency or UNKNOWN_IDENTITY
        normalized["currency_code"] = currency or UNKNOWN_IDENTITY
        normalized["status"] = "Completed"
        normalized["not_counted_in_consensus"] = False
        normalized["validation_errors"] = []
        normalized["mo_ta"] = (
            "Google Lens confirmed the banknote identity from ranked structured evidence."
        )
        normalized["quan_diem"] = (
            f"AG3 selected {country} / {currency} / {amount} from its own Lens evidence cluster."
        )
        normalized.pop("error_type", None)
        normalized.pop("technical_error", None)
    conflict_error_reasons = {
        "conflicting_denominations_in_lens_evidence",
        "mixed_denomination_lens_evidence",
        "near_top_conflicting_denomination",
        "conflicting_evidence",
        "initial_identity_conflict",
        "candidate_lens_identity_conflict",
    }
    if "no_source_evidence" in verification_errors:
        normalized.setdefault("error_type", "no_source")
    elif verification_reason in conflict_error_reasons or any(
        reason in verification_errors for reason in conflict_error_reasons
    ):
        normalized["error_type"] = "conflicting_evidence"
    else:
        normalized.setdefault("error_type", "insufficient_evidence")


    # Calculate Backend Response Contract metrics & item dispositions
    raw_lens_result_count = len(normalized_evidence)

    exclusion_reason_counts: Dict[str, int] = {}
    eligible_items = []
    usable_items: List[Dict[str, Any]] = []  # banknote-context items not hard-excluded (may be PARTIAL)

    p_amount = accepted_identity.get("amount") if (identity_complete and accepted_identity) else None
    p_currency = accepted_identity.get("currency") if (identity_complete and accepted_identity) else None

    for ev_item in normalized_evidence:
        s_trust = str(ev_item.get("source_trust_level") or "").upper().strip()
        s_class = str(ev_item.get("source_class") or "").upper().strip()
        if not s_trust or s_trust in {"NONE", "NULL"} or not s_class or s_class in {"NONE", "NULL"}:
            from app.services.evidence_ranker_service import classify_source
            classification = classify_source(ev_item)
            if not s_trust or s_trust in {"NONE", "NULL"}:
                s_trust = str(classification.get("source_trust_level") or "UNKNOWN").upper().strip()
            if not s_class or s_class in {"NONE", "NULL"}:
                s_class = str(classification.get("source_class") or s_trust or "UNKNOWN").upper().strip()
            if not ev_item.get("canonical_domain") or str(ev_item.get("canonical_domain")).lower() in {"", "unknown"}:
                ev_item["canonical_domain"] = classification.get("canonical_domain") or ev_item.get("canonical_domain")
            if not ev_item.get("canonical_url"):
                ev_item["canonical_url"] = classification.get("canonical_url") or ev_item.get("canonical_url")
        if not s_trust or s_trust in {"NONE", "NULL"}:
            s_trust = "UNKNOWN"
        if not s_class or s_class in {"NONE", "NULL"}:
            s_class = s_trust or "UNKNOWN"

        if groq_extractions:
            d = str(ev_item.get("canonical_domain") or ev_item.get("domain") or "").strip().lower()
            if d and d in groq_extractions:
                gx = groq_extractions[d]
                if gx.get("banknote_relevant"):
                    if gx.get("country"): ev_item["detected_country"] = gx["country"]
                    if gx.get("currency"): ev_item["detected_currency"] = gx["currency"]
                    if gx.get("denomination"): ev_item["detected_amounts"] = [gx["denomination"]]
                else:
                    ev_item["detected_country"] = None
                    ev_item["detected_currency"] = None
                    ev_item["detected_amounts"] = []
        is_dup = ev_item.get("is_duplicate_url") is True
        is_mir = ev_item.get("is_mirror") is True or ev_item.get("domain_first") is False
        noise_r = _evidence_noise_reason(ev_item)
        has_banknote = _item_has_banknote_context(ev_item)

        # Structured per-item diagnostics
        ev_item["raw_title"] = str(ev_item.get("title") or "")
        ev_item["raw_snippet"] = str(ev_item.get("snippet") or "")
        ev_item["raw_url"] = str(ev_item.get("url") or ev_item.get("link") or "")
        ev_item["raw_domain"] = str(ev_item.get("domain") or "")
        ev_item["canonical_domain"] = str(ev_item.get("canonical_domain") or ev_item.get("domain") or "unknown")
        ev_item["raw_lens_score"] = ev_item.get("score") or ev_item.get("raw_lens_score")
        ev_item["raw_rank"] = ev_item.get("raw_rank") or ev_item.get("rank") or ev_item.get("position")
        page_excerpt = _compact_text(
            ev_item.get("page_text_excerpt") or ev_item.get("web_page_text_excerpt") or ""
        )
        if page_excerpt:
            ev_item["page_text_excerpt"] = page_excerpt
            ev_item["web_page_text_excerpt"] = page_excerpt
        page_terms = ev_item.get("page_text_identity_terms") or []
        has_page_evidence = bool(page_excerpt or page_terms)
        raw_fetch_status = str(ev_item.get("fetch_status") or ev_item.get("page_fetch_status") or "").strip().lower()
        raw_page_checked = ev_item.get("page_text_checked")
        if has_page_evidence and raw_fetch_status in {"", "not_attempted", "skipped", "none", "null"}:
            ev_item["fetch_attempted"] = True
            ev_item["fetch_status"] = "success"
            ev_item["page_fetch_status"] = "success"
            ev_item["page_text_checked"] = True
        elif raw_fetch_status in {"failed", "failure", "timeout"} or raw_page_checked in {"failed", "timeout"}:
            ev_item["fetch_attempted"] = True
            ev_item["fetch_status"] = "timeout" if raw_fetch_status == "timeout" or raw_page_checked == "timeout" else "failed"
            ev_item["page_fetch_status"] = ev_item["fetch_status"]
            ev_item["page_text_checked"] = False
        elif raw_page_checked is True or raw_fetch_status in {"success", "fetched", "checked"}:
            ev_item["fetch_attempted"] = True
            ev_item["fetch_status"] = "success"
            ev_item["page_fetch_status"] = "success"
            ev_item["page_text_checked"] = True
        else:
            ev_item["fetch_attempted"] = False
            ev_item["fetch_status"] = "not_attempted"
            ev_item["page_fetch_status"] = "not_attempted"
            ev_item["page_text_checked"] = False
        ev_item["source_trust_level"] = s_trust
        ev_item["source_class"] = s_class
        ev_item["banknote_context"] = has_banknote
        ev_item["has_banknote_context"] = has_banknote
        ev_item["extracted_country"] = ev_item.get("detected_country")
        ev_item["extracted_currency"] = ev_item.get("detected_currency")
        ev_item["extracted_denomination"] = ev_item.get("detected_amounts")
        ev_item["complete_identity"] = _is_complete_identity_item(ev_item)
        # Use identity_text (title/snippet/page_text_excerpt only) for object_type — not source/domain brand names.
        # If the item has banknote context (has_banknote=True), it is always a banknote regardless of brand name.
        identity_text_l = _evidence_identity_text(ev_item).lower()
        _title_snippet_l = " ".join([
            str(ev_item.get("title") or ""),
            str(ev_item.get("snippet") or ""),
        ]).lower()
        _has_explicit_banknote_kw = any(
            kw in _title_snippet_l
            for kw in ("banknote", "currency note", "paper money", "note", "bill")
        )
        if has_banknote or _has_explicit_banknote_kw:
            ev_item["object_type"] = "banknote"
        elif _is_non_banknote_numismatic_object(ev_item):
            # Only classify as coin when title/snippet/page_text explicitly describe a coin/medal,
            # not because the brand/source/domain name contains 'coin'.
            ev_item["object_type"] = "coin"
        elif "medal" in identity_text_l:
            ev_item["object_type"] = "medal"
        else:
            ev_item["object_type"] = "unknown"
        ev_item["independent_domain"] = bool(ev_item.get("domain_first") is not False and not is_dup and not is_mir)
        ev_item["selected_for_ag3_internal_vote"] = False
        canonical_domain_ok = str(ev_item.get("canonical_domain") or "").strip().lower() not in {"", "unknown", "none", "null"}
        content_quality = str(ev_item.get("content_identity_quality") or "").upper().strip()
        content_quality_noise = _content_identity_quality_is_noise(ev_item)
        if content_quality == "NOISE" and not content_quality_noise:
            content_quality = "COMPLETE_EXACT" if _item_has_simple_exact_identity(ev_item) else "PARTIAL_IDENTITY"
            ev_item["content_identity_quality"] = content_quality
        structured_content_enough = bool(
            (ev_item.get("complete_identity") or _item_has_simple_exact_identity(ev_item))
            and content_quality != "PARTIAL_IDENTITY"
            and not content_quality_noise
        )
        has_verifiable_content = bool(
            has_page_evidence
            or structured_content_enough
        )
        qualified_source = bool(
            has_banknote
            and canonical_domain_ok
            and s_trust not in {"NOISE", "SOCIAL", "UNREADABLE"}
            and not content_quality_noise
            and ev_item.get("object_type") == "banknote"
            and not is_dup
            and not is_mir
            and _item_has_simple_usable_identity(ev_item)
        )
        ev_item["qualified_source"] = qualified_source
        ev_item["exact_identity_source"] = (
            "title" if _has_direct_banknote_amount_context(str(ev_item.get("title") or ""), str((ev_item.get("detected_amounts") or [None])[0] or ""))
            else "page_text" if has_page_evidence
            else "metadata"
        )


        if s_trust in ("SOCIAL", "UNREADABLE") or ev_item.get("page_text_skip_reason") == "social_media_source":
            exclusion_reason_counts["social_source"] = exclusion_reason_counts.get("social_source", 0) + 1
            ev_item["evidence_disposition"] = "excluded"
            ev_item["evidence_reason"] = "social_source"
            ev_item["excluded_reason"] = "source_below_trust_threshold"
            ev_item["eligible"] = False
            ev_item["badge"] = "Social source"
        elif content_quality_noise:
            exclusion_reason_counts["noise"] = exclusion_reason_counts.get("noise", 0) + 1
            ev_item["evidence_disposition"] = "excluded"
            ev_item["evidence_reason"] = "content_identity_noise"
            ev_item["excluded_reason"] = "content_identity_quality_noise"
            ev_item["eligible"] = False
            ev_item["badge"] = "Noise"
        elif _is_non_banknote_numismatic_object(ev_item):
            exclusion_reason_counts["non_banknote_numismatic_object"] = exclusion_reason_counts.get("non_banknote_numismatic_object", 0) + 1
            ev_item["evidence_disposition"] = "excluded"
            ev_item["evidence_reason"] = "non_banknote_numismatic_object"
            ev_item["excluded_reason"] = "non_banknote_numismatic_object"
            ev_item["eligible"] = False
            ev_item["badge"] = "Non-banknote object"
        elif is_dup or is_mir:
            exclusion_reason_counts["duplicate_domain"] = exclusion_reason_counts.get("duplicate_domain", 0) + 1
            ev_item["evidence_disposition"] = "duplicate"
            ev_item["evidence_reason"] = "duplicate_domain" if is_dup else "mirror_duplicate"
            ev_item["excluded_reason"] = "duplicate_canonical_domain"
            ev_item["eligible"] = False
            ev_item["badge"] = "Duplicate domain"
        elif noise_r or s_trust == "NOISE":
            exclusion_reason_counts["noise"] = exclusion_reason_counts.get("noise", 0) + 1
            ev_item["evidence_disposition"] = "excluded"
            ev_item["evidence_reason"] = "unrelated_noise"
            ev_item["excluded_reason"] = "unrelated_finance_page" if "lãi" in str(ev_item.get("snippet") or "").lower() else "unreadable_page"
            ev_item["eligible"] = False
            ev_item["badge"] = "Noise"
        elif not has_banknote:
            exclusion_reason_counts["not_banknote_context"] = exclusion_reason_counts.get("not_banknote_context", 0) + 1
            ev_item["evidence_disposition"] = "excluded"
            ev_item["evidence_reason"] = "invalid_banknote_context"
            ev_item["excluded_reason"] = "invalid_banknote_context"
            ev_item["eligible"] = False
            ev_item["badge"] = "Not banknote context"
        elif not qualified_source:
            # Not a fully-qualified source but still usable if it has banknote context and a canonical domain.
            # A PARTIAL source (missing complete identity but with clear banknote context) may occupy
            # one of the 5 voting-set slots. It contributes 0 to the 3/5 majority because the
            # cluster_map loop skips items with missing country/currency/amount.
            ev_item["evidence_disposition"] = "partial"
            if not ev_item.get("complete_identity"):
                ev_item["evidence_reason"] = "missing_complete_identity"
            elif not has_verifiable_content:
                ev_item["evidence_reason"] = "weak_source_or_skipped_page_text"
            elif not canonical_domain_ok:
                ev_item["evidence_reason"] = "missing_canonical_domain"
            else:
                ev_item["evidence_reason"] = "supporting_but_insufficient"
            if canonical_domain_ok and has_banknote and s_trust not in {"NOISE", "SOCIAL", "UNREADABLE"} and ev_item.get("object_type") == "banknote" and not is_dup and not is_mir and _item_has_simple_usable_identity(ev_item):
                # Usable-partial: may enter the 5-source slot, but does NOT vote in majority cluster
                ev_item["eligible"] = True
                usable_items.append(ev_item)
            else:
                ev_item["eligible"] = False
                ev_item["badge"] = "Partial (unverified)"
        else:
            eligible_items.append(ev_item)
            usable_items.append(ev_item)
            ev_item["eligible"] = True
            it_amounts = ev_item.get("detected_amounts") or []
            it_curr = ev_item.get("detected_currency")
            if identity_complete and accepted_identity and p_amount in it_amounts and (not it_curr or _normalize_currency_code(it_curr) == p_currency):
                ev_item["evidence_disposition"] = "supporting"
                ev_item["evidence_reason"] = "winning_complete_identity"
                ev_item["badge"] = "Supporting"
            elif identity_complete and accepted_identity and it_amounts and any(a != p_amount for a in it_amounts):
                ev_item["evidence_disposition"] = "conflicting"
                ev_item["evidence_reason"] = "conflicting_denomination"
                ev_item["badge"] = "Conflicting denomination"
            elif _is_complete_identity_item(ev_item):
                ev_item["evidence_disposition"] = "partial"
                ev_item["evidence_reason"] = "supporting_but_insufficient"
                ev_item["badge"] = "Supporting but insufficient"
            else:
                ev_item["evidence_disposition"] = "partial"
                ev_item["evidence_reason"] = "missing_complete_identity"
                ev_item["badge"] = "Partial identity"

        final_disposition = ev_item.get("evidence_disposition") or "partial"
        if final_disposition not in {"supporting", "conflicting", "partial", "excluded", "duplicate"}:
            final_disposition = "excluded"
        ev_item["evidence_disposition"] = final_disposition
        ev_item["final_disposition"] = final_disposition
        ev_item["final_reason"] = ev_item.get("evidence_reason") or ev_item.get("excluded_reason") or "unspecified"

    source_class_priority = {
        "TRUSTED": 7,
        "STRONG_NEUTRAL": 6,
        "ESTABLISHED_CATALOG": 5,
        "NEUTRAL": 4,
        "WEAK_COMMERCIAL": 3,
        "UNKNOWN": 2,
        "UNREADABLE": 1,
        "SOCIAL": 0,
        "NOISE": 0,
    }

    def _quality_key(ev_item: Dict[str, Any]) -> tuple:
        source_class = str(
            ev_item.get("source_class") or ev_item.get("source_trust_level") or "UNKNOWN"
        ).upper().strip()
        fetch_ok = str(
            ev_item.get("page_fetch_status") or ev_item.get("fetch_status") or ""
        ).strip().lower() in {"success", "fetched", "checked"}
        try:
            lens_score = float(ev_item.get("raw_lens_score") or ev_item.get("score") or 0.0)
        except (TypeError, ValueError):
            lens_score = 0.0
        try:
            rank_value = int(ev_item.get("raw_rank") or ev_item.get("rank") or 9999)
        except (TypeError, ValueError):
            rank_value = 9999
        content_quality = str(ev_item.get("content_identity_quality") or "").upper().strip()
        direct_quality = bool(
            ev_item.get("complete_identity") is True
            and content_quality != "PARTIAL_IDENTITY"
        )
        return (
            int(ev_item.get("complete_identity") is True),
            int(ev_item.get("object_type") == "banknote"),
            int(fetch_ok or bool(ev_item.get("page_text_excerpt") or ev_item.get("page_text_identity_terms"))),
            int(direct_quality),
            source_class_priority.get(source_class, 2),
            lens_score,
            -rank_value,
        )

    # qualified_items_before_dedupe tracks complete/qualified-source items for legacy diagnostics.
    qualified_items_before_dedupe = [
        item for item in normalized_evidence if item.get("qualified_source") is True
    ]
    # usable_items_before_dedupe is wider: includes PARTIAL sources (banknote context, not
    # hard-excluded) that may occupy one of the 5 voting-set slots even without complete identity.
    usable_items_before_dedupe = list(usable_items)  # already collected during the per-item loop

    # Domain-dedup on the USABLE pool (pick best representative per canonical domain)
    usable_representatives_by_domain: Dict[str, Dict[str, Any]] = {}
    for ev_item in usable_items_before_dedupe:
        canonical_domain = str(
            ev_item.get("canonical_domain") or ev_item.get("domain") or ""
        ).strip().lower()
        if not canonical_domain or canonical_domain in {"unknown", "none", "null"}:
            continue
        current = usable_representatives_by_domain.get(canonical_domain)
        if current is None or _quality_key(ev_item) > _quality_key(current):
            usable_representatives_by_domain[canonical_domain] = ev_item

    usable_representative_ids = {id(item) for item in usable_representatives_by_domain.values()}
    for ev_item in usable_items_before_dedupe:
        if id(ev_item) not in usable_representative_ids:
            # Superseded by a better representative for the same domain — mark duplicate.
            ev_item["eligible"] = False
            ev_item["evidence_disposition"] = "duplicate"
            ev_item["final_disposition"] = "duplicate"
            ev_item["evidence_reason"] = "duplicate_canonical_domain"
            ev_item["final_reason"] = "duplicate_canonical_domain"
            ev_item["badge"] = "Duplicate domain"

    usable_reps = list(usable_representatives_by_domain.values())

    _country_counter: Dict[str, int] = {}
    for _ei in usable_reps:
        _c = _normalize_country_key(_ei.get("detected_country"), _ei.get("detected_currency"))
        if not _is_unknown_identity(_c):
            _country_counter[_c] = _country_counter.get(_c, 0) + 1

    _dominant_country = None
    if _country_counter:
        _max_count = max(_country_counter.values())
        _top_countries = [c for c, count in _country_counter.items() if count == _max_count]
        if len(_top_countries) == 1:
            _dominant_country = _top_countries[0]

    _in_voting = []
    _excluded_wrong = []
    for _ei in usable_reps:
        if not _dominant_country:
            _in_voting.append(_ei)
            continue

        _c = _normalize_country_key(_ei.get("detected_country"), _ei.get("detected_currency"))

        is_clear_contradiction = False
        if not _is_unknown_identity(_c) and _c != _dominant_country:
            is_clear_contradiction = True

        if is_clear_contradiction:
            _excluded_wrong.append(_ei)
        else:
            _in_voting.append(_ei)

    def _phase2_sort_key(ev_item: Dict[str, Any]) -> tuple:
        is_complete = ev_item.get("complete_identity") is True
        try:
            rank_value = int(ev_item.get("raw_rank") or ev_item.get("rank") or 9999)
        except (TypeError, ValueError):
            rank_value = 9999
        return (
            int(is_complete),
            -rank_value,
        )

    eligible_items = sorted(_in_voting, key=_phase2_sort_key, reverse=True)

    for _ei in _excluded_wrong:
        _ei["evidence_disposition"] = "excluded"
        _ei["final_disposition"] = "excluded"
        _ei["evidence_reason"] = "wrong_country_for_voting_set"
        _ei["final_reason"] = "wrong_country_for_voting_set"
        _ei["excluded_reason"] = "wrong_country_for_voting_set"
        _ei["eligible"] = False
        _ei["badge"] = "Wrong country"

    for ev_item in eligible_items:
        ev_item["eligible"] = True
        ev_item["selected_for_ag3_internal_vote"] = False
        ev_item["selected_rank"] = None
        ev_item["evidence_disposition"] = "partial"
        ev_item["final_disposition"] = "partial"
        ev_item["evidence_reason"] = "qualified_not_selected"
        ev_item["final_reason"] = "qualified_not_selected"
        ev_item["badge"] = "Qualified"

    candidate_voting_items = eligible_items[:AG3_MAX_SELECTED_SOURCES]

    actual_usable_count = len(eligible_items)
    if actual_usable_count >= AG3_MIN_SELECTED_SOURCES:
        selected_voting_items = eligible_items[:AG3_MAX_SELECTED_SOURCES]
        selected_source_count = len(selected_voting_items)
    else:
        selected_voting_items = []
        selected_source_count = actual_usable_count

    selected_domains = [
        str(item.get("canonical_domain") or item.get("domain") or "").strip().lower()
        for item in selected_voting_items
    ]
    selected_domain_count = len({domain for domain in selected_domains if domain})



    cluster_map: Dict[tuple, Dict[str, Any]] = {}
    for ev_item in candidate_voting_items:
        amounts = ev_item.get("detected_amounts") or []
        amount_value = amounts[0] if isinstance(amounts, list) and len(amounts) == 1 else None
        currency_value = _normalize_currency_code(ev_item.get("detected_currency"))
        country_value = ev_item.get("detected_country")
        if (
            amount_value is None
            or _is_unknown_identity(country_value)
            or _is_unknown_identity(currency_value)
            or ev_item.get("object_type") != "banknote"
        ):
            continue
        cluster_key = (
            _normalize_country_key(country_value, currency_value),
            currency_value,
            int(amount_value),
        )
        cluster = cluster_map.setdefault(
            cluster_key,
            {
                "country": _normalize_country_key(country_value, currency_value),
                "currency": currency_value,
                "amount": int(amount_value),
                "sources": [],
                "domains": [],
            },
        )
        cluster["sources"].append(ev_item)
        domain = str(ev_item.get("canonical_domain") or ev_item.get("domain") or "").strip().lower()
        if domain and domain not in cluster["domains"]:
            cluster["domains"].append(domain)

    candidate_clusters_ranked = sorted(
        cluster_map.items(),
        key=lambda entry: (len(entry[1]["sources"]), len(entry[1]["domains"])),
        reverse=True,
    )
    selected_clusters = candidate_clusters_ranked if selected_voting_items else []
    majority_achieved = len(selected_clusters[0][1]["sources"]) if selected_clusters else 0
    tied_majority = bool(
        len(selected_clusters) > 1
        and len(selected_clusters[0][1]["sources"]) == len(selected_clusters[1][1]["sources"])
    )
    strict_vote_eligible = bool(
        selected_source_count >= AG3_MIN_SELECTED_SOURCES
        and selected_domain_count == selected_source_count
        and majority_achieved is not None
        and majority_achieved >= AG3_MIN_EXACT_SUPPORT
        and not tied_majority
    )
    selection_reason = "qualified_three_of_five" if strict_vote_eligible else "no_three_of_five_majority"
    if selected_source_count < AG3_MIN_SELECTED_SOURCES:
        selection_reason = "insufficient_minimum_usable_independent_sources"
    elif selected_domain_count < selected_source_count:
        selection_reason = "duplicate_domain_in_selected_set"

    winning_identity: Dict[str, Any] = {}
    accepted_identity: Optional[Dict[str, Any]] = None
    verified_identity: Optional[Dict[str, Any]] = None
    candidate_identity: Dict[str, Any] = {}
    if candidate_clusters_ranked:
        top_c = candidate_clusters_ranked[0][1]
        top_src = top_c["sources"][0] if top_c.get("sources") else {}
        candidate_identity = {
            "country": top_src.get("detected_country") or top_c.get("country"),
            "currency": top_c.get("currency"),
            "amount": top_c.get("amount"),
            "independent_domain_count": len(top_c.get("domains") or []),
            "support_count": len(top_c.get("sources") or []),
        }
    if strict_vote_eligible:
        winning_key, winning_cluster = selected_clusters[0]
        winning_identity = {
            "country": winning_cluster["sources"][0].get("detected_country") or winning_key[0],
            "currency": winning_key[1],
            "amount": winning_key[2],
        }
        accepted_identity = {
            **winning_identity,
            "confidence": max(confidence if confidence_valid else 0.0, 0.80),
            "support_count": majority_achieved,
            "context_support_count": majority_achieved,
            "exact_amount_support_count": majority_achieved,
            "support_signal_count": majority_achieved,
            "independent_source_count": majority_achieved,
            "strong_independent_source_count": majority_achieved,
            "trusted_source_count": 0,
            "trusted_exact_count": 0,
            "strong_exact_count": majority_achieved,
            "direct_title_or_snippet_support_count": majority_achieved,
            "page_text_support_count": sum(
                1 for item in winning_cluster["sources"] if item.get("page_text_excerpt") or item.get("page_text_identity_terms")
            ),
            "page_text_used_for_identity": any(
                item.get("page_text_excerpt") or item.get("page_text_identity_terms")
                for item in winning_cluster["sources"]
            ),
            "ignored_amounts": [],
            "ignored_amount_reasons": {},
            "top_score": max(
                float(item.get("raw_lens_score") or item.get("score") or 0.0)
                for item in winning_cluster["sources"]
            ),
            "trusted_source": False,
            "reason": "qualified_three_of_five",
            "selected_evidence": winning_cluster["sources"][0],
        }
        verified_identity = accepted_identity
        identity_complete = True
        country = winning_identity["country"]
        currency = winning_identity["currency"]
        amount = winning_identity["amount"]
        denomination = f"{amount} {currency}"
        confidence = accepted_identity["confidence"]
        confidence_valid = True
        validation_errors = []
        normalized["quoc_gia"] = str(country).strip()
        normalized["menh_gia"] = denomination
        normalized["ma_tien_te"] = currency
        normalized["currency_code"] = currency
        normalized["status"] = "Completed"
        normalized["not_counted_in_consensus"] = False
        normalized["validation_errors"] = []
        normalized["reason"] = "qualified_three_of_five"
        normalized["status_reason"] = "qualified_three_of_five"
        normalized["not_eligible_reason"] = None
        normalized["mo_ta"] = "Google Lens selected independent verified web sources."
        normalized["quan_diem"] = (
            f"AG3 created one vote from an internal source majority: {country} / {currency} / {amount}."
        )
        normalized.pop("error_type", None)
        normalized.pop("technical_error", None)
    else:
        identity_complete = False
        accepted_identity = None
        normalized["status"] = "Failed" if technical_failure else "Partial"
        normalized["quoc_gia"] = UNKNOWN_IDENTITY
        normalized["menh_gia"] = UNKNOWN_IDENTITY
        normalized["ma_tien_te"] = UNKNOWN_IDENTITY
        normalized["currency_code"] = UNKNOWN_IDENTITY
        normalized["not_counted_in_consensus"] = True
        normalized["reason"] = selection_reason
        normalized["status_reason"] = selection_reason
        normalized["not_eligible_reason"] = selection_reason
        validation_errors = list(dict.fromkeys([selection_reason, *validation_errors]))
        normalized["validation_errors"] = validation_errors
        if technical_failure:
            normalized.setdefault("technical_error", True)
            normalized["mo_ta"] = normalized.get("mo_ta") or "Google Lens provider returned a technical failure."
            normalized["quan_diem"] = normalized.get("quan_diem") or "AG3 did not create a vote because provider verification failed."
        else:
            usable_count = len(eligible_items)
            if usable_count < AG3_MIN_SELECTED_SOURCES:
                normalized["mo_ta"] = (
                    f"Google Lens found only {usable_count} usable independent sources; "
                    f"{AG3_MIN_SELECTED_SOURCES} are required before voting."
                )
                normalized["quan_diem"] = (
                    f"AG3 did not create a vote because only {usable_count} of the required "
                    f"{AG3_MIN_SELECTED_SOURCES} independent usable sources were found."
                )
            elif selected_source_count >= AG3_MIN_SELECTED_SOURCES and majority_achieved < AG3_MIN_EXACT_SUPPORT:
                normalized["mo_ta"] = (
                    f"Google Lens formed a {selected_source_count}-source voting set, but only {majority_achieved}/{selected_source_count} sources "
                    "agreed on the same country, currency, and denomination."
                )
                normalized["quan_diem"] = (
                    f"AG3 did not create a vote: a {selected_source_count}-source voting set was formed but only "
                    f"{majority_achieved}/{selected_source_count} sources confirmed the same identity (need {AG3_MIN_EXACT_SUPPORT})."
                )
            else:
                normalized["mo_ta"] = "Google Lens did not form a valid 3/5 source majority."
                normalized["quan_diem"] = (
                    "AG3 did not create a vote because the 5-source voting set did not reach a 3/5 majority "
                    "on the same country, currency, and denomination."
                )

    winning_key_tuple = (
        _normalize_country_key(winning_identity.get("country"), winning_identity.get("currency")),
        winning_identity.get("currency"),
        winning_identity.get("amount"),
    ) if strict_vote_eligible else None
    for selected_rank, ev_item in enumerate(selected_voting_items, start=1):
        ev_item["selected_for_ag3_internal_vote"] = True
        ev_item["selected_for_ag3_vote"] = True
        ev_item["selected_rank"] = selected_rank
        amounts = ev_item.get("detected_amounts") or []
        source_amount = amounts[0] if isinstance(amounts, list) and len(amounts) == 1 else None
        source_key = (
            _normalize_country_key(ev_item.get("detected_country"), ev_item.get("detected_currency")),
            _normalize_currency_code(ev_item.get("detected_currency")),
            int(source_amount) if source_amount is not None else None,
        )
        if strict_vote_eligible and source_key == winning_key_tuple:
            ev_item["evidence_disposition"] = "supporting"
            ev_item["final_disposition"] = "supporting"
            ev_item["evidence_reason"] = "selected_supports_three_of_five_majority"
            ev_item["final_reason"] = "selected_supports_three_of_five_majority"
            ev_item["badge"] = "Supporting"
        elif strict_vote_eligible:
            ev_item["evidence_disposition"] = "conflicting"
            ev_item["final_disposition"] = "conflicting"
            ev_item["evidence_reason"] = "selected_minor_cluster"
            ev_item["final_reason"] = "selected_minor_cluster"
            ev_item["badge"] = "Conflicting denomination"
        else:
            ev_item["evidence_disposition"] = "partial"
            ev_item["final_disposition"] = "partial"
            ev_item["evidence_reason"] = selection_reason
            ev_item["final_reason"] = selection_reason
            ev_item["badge"] = "Selected but no vote"

    eligible_evidence_count = len(eligible_items)
    eligible_domains = list(dict.fromkeys(
        str(item.get("canonical_domain") or item.get("domain") or "").strip().lower()
        for item in eligible_items
        if str(item.get("canonical_domain") or item.get("domain") or "").strip().lower() not in ("", "unknown")
    ))
    eligible_independent_domain_count = len(eligible_domains)

    supporting_evidence_ids = []
    supporting_domains = []
    conflicting_evidence_ids = []
    conflicting_domains = []

    for item in normalized_evidence:
        url_val = item.get("url") or item.get("canonical_url")
        dom_val = item.get("canonical_domain") or item.get("domain")
        disp = item.get("evidence_disposition")
        if disp == "supporting":
            if url_val and url_val not in supporting_evidence_ids:
                supporting_evidence_ids.append(url_val)
            if dom_val and dom_val not in supporting_domains:
                supporting_domains.append(dom_val)
        elif disp == "conflicting":
            if url_val and url_val not in conflicting_evidence_ids:
                conflicting_evidence_ids.append(url_val)
            if dom_val and dom_val not in conflicting_domains:
                conflicting_domains.append(dom_val)

    winning_cluster_evidence_count = len(supporting_evidence_ids)
    winning_cluster_independent_domain_count = len(supporting_domains)
    conflicting_evidence_count = len(conflicting_evidence_ids)
    conflicting_independent_domain_count = len(conflicting_domains)
    disposition_counts = {
        "supporting": 0,
        "conflicting": 0,
        "partial": 0,
        "excluded": 0,
        "duplicate": 0,
    }
    for item in normalized_evidence:
        disp = item.get("evidence_disposition")
        if disp not in disposition_counts:
            disp = "excluded"
            item["evidence_disposition"] = disp
            item["final_disposition"] = disp
        disposition_counts[disp] += 1

    supporting_evidence_count = disposition_counts["supporting"]
    conflicting_evidence_count = disposition_counts["conflicting"]
    winning_cluster_evidence_count = supporting_evidence_count
    partial_evidence_count = disposition_counts["partial"]
    excluded_evidence_count = disposition_counts["excluded"]
    duplicate_evidence_count = disposition_counts["duplicate"]
    total_disposed_evidence_count = sum(disposition_counts.values())
    count_invariant_ok = raw_lens_result_count == total_disposed_evidence_count
    promotion_reason = selection_reason
    vote_eligible = bool(strict_vote_eligible)
    selected_voting_set = [
        {
            "selected_rank": index,
            "domain": item.get("domain"),
            "canonical_domain": item.get("canonical_domain"),
            "identity": {
                "country": item.get("detected_country"),
                "currency": item.get("detected_currency"),
                "denomination": item.get("detected_amounts"),
            },
            "source_class": item.get("source_class"),
            "disposition": item.get("evidence_disposition"),
        }
        for index, item in enumerate(selected_voting_items, start=1)
    ]
    selected_voting_set_size = len(selected_voting_set)
    majority_required = AG3_MIN_EXACT_SUPPORT
    selected_supporting_count = majority_achieved if selected_voting_set_size else 0
    agreement_achieved = (
        f"{majority_achieved}/{selected_voting_set_size}"
        if selected_voting_set_size
        else None
    )
    targeted_search_result_count = sum(
        1 for item in normalized_evidence if item.get("is_candidate_assisted")
    )
    initial_lens_result_count = max(0, raw_lens_result_count - targeted_search_result_count)
    total_raw_evidence_count = initial_lens_result_count + targeted_search_result_count
    trusted_conflict = any(
        item.get("evidence_disposition") == "conflicting"
        and str(item.get("source_class") or item.get("source_trust_level") or "").upper().strip()
        in {"TRUSTED", "STRONG_NEUTRAL"}
        for item in normalized_evidence
    )
    strict_candidate_clusters = [
        {
            "cluster_key": f"{key[0]}/{key[1]}/{key[2]}",
            "country": key[0],
            "currency": key[1],
            "amount": key[2],
            "support_count": len(cluster["sources"]),
            "source_count": len(cluster["sources"]),
            "independent_domain_count": len(cluster["domains"]),
            "domains": list(cluster["domains"]),
            "result": "winner" if strict_vote_eligible and key == winning_key_tuple else "minority",
        }
        for key, cluster in candidate_clusters_ranked
    ]
    strict_winning_cluster = next(
        (cluster for cluster in strict_candidate_clusters if cluster.get("result") == "winner"),
        {},
    )
    selected_sources = [
        {
            "selected_rank": item.get("selected_rank"),
            "domain": item.get("domain"),
            "canonical_domain": item.get("canonical_domain"),
            "title": item.get("title"),
            "url": item.get("url"),
            "identity": {
                "country": item.get("detected_country"),
                "currency": item.get("detected_currency"),
                "denomination": item.get("detected_amounts"),
            },
            "verification_basis": "page_or_structured_complete_identity",
            "source_class": item.get("source_class"),
            "disposition": item.get("evidence_disposition"),
        }
        for item in selected_voting_items
    ]
    raw_articles = [dict(item) for item in normalized_evidence]
    candidate_sources = [dict(item) for item in eligible_items]
    selected_voting_sources = [dict(item) for item in selected_voting_items]

    def _evidence_invariant_key(ev_item: Dict[str, Any]) -> str:
        for key in ("evidence_id", "canonical_url", "url", "link", "raw_url"):
            value = str(ev_item.get(key) or "").strip().lower()
            if value:
                return f"{key}:{value}"
        domain = str(ev_item.get("canonical_domain") or ev_item.get("domain") or "").strip().lower()
        title = str(ev_item.get("title") or ev_item.get("raw_title") or "").strip().lower()
        return f"title_domain:{domain}|{title}"

    evidence_invariant_violations: List[str] = []
    raw_article_count = len(raw_articles)
    candidate_source_count = len(candidate_sources)
    raw_keys = {_evidence_invariant_key(item) for item in raw_articles}
    candidate_keys = {_evidence_invariant_key(item) for item in candidate_sources}
    selected_keys = {_evidence_invariant_key(item) for item in selected_voting_sources}
    selected_canonical_domains = [
        str(item.get("canonical_domain") or item.get("domain") or "").strip().lower()
        for item in selected_voting_sources
        if str(item.get("canonical_domain") or item.get("domain") or "").strip()
    ]
    if raw_article_count != len(raw_articles):
        evidence_invariant_violations.append("raw_article_count_mismatch")
    if candidate_source_count != len(candidate_sources):
        evidence_invariant_violations.append("candidate_source_count_mismatch")
    if selected_voting_sources and len(selected_voting_sources) != selected_source_count:
        evidence_invariant_violations.append("selected_source_count_mismatch")

    if len(selected_canonical_domains) != len(set(selected_canonical_domains)):
        evidence_invariant_violations.append("selected_domains_not_unique")
    if selected_keys and not selected_keys.issubset(candidate_keys):
        evidence_invariant_violations.append("selected_not_subset_of_candidate_sources")
    if candidate_keys and not candidate_keys.issubset(raw_keys):
        evidence_invariant_violations.append("candidate_not_subset_of_raw_articles")
    if raw_article_count < candidate_source_count:
        evidence_invariant_violations.append("raw_less_than_candidate")
    if candidate_source_count < selected_source_count:
        evidence_invariant_violations.append("candidate_less_than_selected")
    if any(
        str(item.get("evidence_disposition") or item.get("final_disposition") or "").strip().lower()
        in {"excluded", "duplicate"}
        or item.get("eligible") is False
        for item in selected_voting_sources
    ):
        evidence_invariant_violations.append("selected_contains_excluded_or_duplicate_source")

    evidence_invariant_ok = not evidence_invariant_violations
    if not evidence_invariant_ok:
        selected_voting_items = []
        selected_voting_sources = []
        selected_voting_set = []
        selected_voting_set_size = 0
        selected_source_count = 0
        selected_sources = []
        selected_domains = []
        selected_supporting_count = 0
        agreement_achieved = None
        majority_achieved = 0
        strict_vote_eligible = False
        vote_eligible = False
        winning_identity = {}
        selection_reason = "evidence_invariant_failed"
        promotion_reason = selection_reason
        validation_errors = list(dict.fromkeys([selection_reason, *validation_errors]))
        normalized["status"] = "Failed" if technical_failure else "Partial"
        normalized["not_counted_in_consensus"] = True
        normalized["validation_errors"] = validation_errors
        normalized["quoc_gia"] = UNKNOWN_IDENTITY
        normalized["menh_gia"] = UNKNOWN_IDENTITY
        normalized["ma_tien_te"] = UNKNOWN_IDENTITY
        normalized["currency_code"] = UNKNOWN_IDENTITY
    count_invariant_ok = bool(count_invariant_ok and evidence_invariant_ok)

    selected_formatter = str(normalized.get("phuong_phap") or normalized.get("formatter") or "Deterministic")
    if groq_extractions:
        groq_invoked = True
        evidence_count_sent = len(groq_extractions)
    else:
        groq_invoked = bool(
            normalized.get("groq_invoked")
            or normalized.get("groq_called")
            or normalized.get("ag3_groq_formatter_used")
            or "groq" in selected_formatter.casefold()
        )
        evidence_count_sent = len(selected_voting_items) if groq_invoked else 0
    formatter_completed = bool(normalized.get("formatter_completed") if "formatter_completed" in normalized else (identity_complete or accepted_identity))

    normalized["groq_invoked"] = groq_invoked
    normalized["groq_called"] = groq_invoked
    normalized["evidence_count_sent"] = evidence_count_sent

    formatter_decision_trace = {
        "selected_formatter": selected_formatter,
        "formatter_selected": selected_formatter,
        "formatter_invoked": bool(identity_complete or accepted_identity),
        "formatter_completed": formatter_completed,
        "formatter_skipped_reason": None if (identity_complete or accepted_identity) else "no_eligible_winning_cluster",
        "groq_invoked": groq_invoked,
        "groq_called": groq_invoked,
        "groq_completed": bool(groq_invoked and formatter_completed),
        "groq_skipped_reason": None if groq_invoked else "deterministic_formatter_selected",
        "groq_model": normalized.get("groq_model") if groq_invoked else None,
        "evidence_ids_or_urls": [
            item.get("url") or item.get("raw_url")
            for item in selected_voting_items
            if item.get("url") or item.get("raw_url")
        ],
        "evidence_count_sent": evidence_count_sent,
        "raw_candidate_count": raw_lens_result_count,
        "eligible_candidate_count": eligible_evidence_count,
        "eligible_independent_domain_count": eligible_independent_domain_count,
        "candidate_clusters": strict_candidate_clusters,
        "winning_cluster": strict_winning_cluster,
        "winning_identity": winning_identity if vote_eligible else {},
        "promotion_path": promotion_reason,
        "confidence_basis": str(promotion_trace.get("confidence_basis") or promotion_reason),
        "locked_identity_before_formatter": winning_identity if vote_eligible else {},
        "formatter_output_identity": {
            "country": normalized.get("quoc_gia") or normalized.get("country"),
            "currency": normalized.get("ma_tien_te") or normalized.get("currency_code"),
            "denomination": normalized.get("menh_gia") or normalized.get("denomination"),
        },
        "formatter_changed_locked_identity": False,
        "final_ag3_status": normalized.get("status"),
        "vote_eligible": vote_eligible,
        "not_eligible_reason": None if vote_eligible else promotion_reason,
    }

    ag3_verification_summary = {
        "trace_schema_version": "ag3-evidence-v2",
        "raw_lens_result_count": raw_lens_result_count,
        "initial_lens_result_count": initial_lens_result_count,
        "targeted_search_result_count": targeted_search_result_count,
        "total_raw_evidence_count": total_raw_evidence_count,
        "qualified_item_count_before_dedupe": len(qualified_items_before_dedupe),
        "raw_articles": raw_articles,
        "raw_article_count": raw_article_count,
        "candidate_sources": candidate_sources,
        "candidate_source_count": candidate_source_count,
        # usable_source_count = total banknote-context eligible sources from old verify path
        "usable_source_count": promotion_trace.get("usable_source_count", eligible_independent_domain_count),
        "selected_voting_sources": selected_voting_sources,
        "required_selected_source_count": AG3_MIN_SELECTED_SOURCES,
        "maximum_selected_source_count": AG3_MAX_SELECTED_SOURCES,
        "eligible_evidence_count": eligible_evidence_count,
        "qualified_evidence_count": eligible_evidence_count,
        "qualified_source_count": eligible_evidence_count,
        "qualified_independent_domain_count": eligible_independent_domain_count,
        "eligible_independent_domain_count": eligible_independent_domain_count,
        "supporting_evidence_count": supporting_evidence_count,
        "winning_cluster_evidence_count": winning_cluster_evidence_count,
        "winning_cluster_independent_domain_count": winning_cluster_independent_domain_count,
        "conflicting_evidence_count": conflicting_evidence_count,
        "conflicting_independent_domain_count": conflicting_independent_domain_count,
        "partial_evidence_count": partial_evidence_count,
        "duplicate_evidence_count": duplicate_evidence_count,
        "disposition_counts": disposition_counts,
        "count_invariant_ok": count_invariant_ok,
        "evidence_invariant_ok": evidence_invariant_ok,
        "evidence_invariant_violations": evidence_invariant_violations,
        "supporting_evidence_ids": supporting_evidence_ids,
        "supporting_domains": supporting_domains,
        "conflicting_evidence_ids": conflicting_evidence_ids,
        "conflicting_domains": conflicting_domains,
        "excluded_evidence_count": excluded_evidence_count,
        "exclusion_reason_counts": exclusion_reason_counts,
        "selected_voting_set": selected_voting_set,
        "selected_voting_set_size": selected_voting_set_size,
        "selected_source_count": selected_source_count,
        "selected_sources": selected_sources,
        "selected_domains": selected_domains,
        "selection_reason": selection_reason,
        "majority_required": majority_required,
        "majority_achieved": majority_achieved,
        "agreement_achieved": agreement_achieved,
        "agreement_pattern": agreement_achieved,
        "selected_supporting_count": selected_supporting_count,
        "trusted_conflict": trusted_conflict,
        "candidate_clusters": strict_candidate_clusters,
        "winning_cluster": strict_winning_cluster,
        "winning_identity": winning_identity if vote_eligible else {},
        "candidate_identity": candidate_identity or {},
        "vote_identity": winning_identity if vote_eligible else {},
        "promotion_reason": promotion_reason,
        "reason": promotion_reason,
        "confidence_basis": str(promotion_trace.get("confidence_basis") or promotion_reason),
        "vote_eligible": vote_eligible,
        "vote_created": bool(vote_eligible and winning_identity),
        "ag3_formatter_decision_trace": formatter_decision_trace,
    }

    normalized.update(ag3_verification_summary)
    normalized["ag3_verification_summary"] = ag3_verification_summary
    promotion_trace.update(ag3_verification_summary)
    promotion_trace["ag3_verification_summary"] = ag3_verification_summary

    if "no_source_evidence" in validation_errors:
        normalized.setdefault("error_type", "no_source")
    elif verification_reason in conflict_error_reasons or any(
        reason in validation_errors for reason in conflict_error_reasons
    ):
        normalized["error_type"] = "conflicting_evidence"
    else:
        normalized.setdefault("error_type", "insufficient_evidence")
    return normalized


def _extract_amount_currency(text: str) -> tuple[Optional[int], Optional[str]]:
    original_text = str(text or "")
    if not original_text.strip():
        return None, None

    currency = _normalize_currency_code(original_text)

    spans = classify_numeric_span(original_text)
    denomination_spans = [s for s in spans if s["is_denomination"] and s["amount"] is not None]

    if denomination_spans:
        if len(_multi_denomination_context_amounts(original_text, currency)) >= 2:
            return None, currency
        best_span = next(
            (s for s in denomination_spans if _has_explicit_denomination_prefix(_fold_text_for_markers(original_text[max(0, s['start']-40):s['start']]))),
            denomination_spans[0],
        )
        return best_span["amount"], currency

    return None, currency


def parse_lens_evidence_without_llm(
    evidence_items: List[Dict[str, Any]],
    raw_lens_text: str = "",
    groq_extractions: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Deterministic fallback parser for Google Lens evidence.
    It avoids calling any LLM when the formatter is unavailable.
    """
    evidence_items = [item for item in evidence_items or [] if isinstance(item, dict)]
    banknote_visible_text: List[str] = []

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
        "van_ban_nhin_thay": banknote_visible_text,
        "banknote_visible_text": banknote_visible_text,
        "dac_diem_chinh": features,
        "status": status,
        "provider": "serpapi",
        "raw_text": raw_lens_text,
        "evidence": evidence_items[:10],
        "formatter_fallback": True,
    }
    return validate_agent3_identity(result, evidence=evidence_items[:10], groq_extractions=groq_extractions)


def build_agreed_vision_candidate(
    agent1_result: Any = None,
    agent2_result: Any = None,
    *,
    allow_single_valid: bool = False,
    agent3_result: Optional[Dict[str, Any]] = None,
    evidence: Optional[List[Dict[str, Any]]] = None,
) -> tuple[Optional[Dict[str, Any]], str]:
    """AG3 INDEPENDENCE PHASE 5.

    agent1_result and agent2_result content is NEVER READ or USED. Only `is not None`
    is checked to record received status.

    If AG3 evidence is available, builds internal candidate from AG3 evidence clusters.
    Returns (candidate, "ag3_internal_evidence_cluster") or (None, "no_ag3_internal_candidate").
    """
    _ag1_received = agent1_result is not None
    _ag2_received = agent2_result is not None

    evidence_list = evidence
    if evidence_list is None and isinstance(agent3_result, dict):
        evidence_list = list(agent3_result.get("evidence") or [])

    if evidence_list:
        candidate, reason, _ids = build_ag3_internal_candidate(evidence_list)
        if candidate:
            return candidate, "ag3_internal_evidence_cluster"

    return None, "no_ag3_internal_candidate"


def resolve_candidate_verification_mode(
    agent1_result: Any = None,
    agent2_result: Any = None,
    *,
    agent3_result: Optional[Dict[str, Any]] = None,
    evidence: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """AG3 INDEPENDENCE PHASE 5 mode resolver.

    Derived strictly from AG3 state:
    - Provider failure -> "skip_provider_failure"
    - AG3 Completed -> "skip_already_completed"
    - Competing AG3 internal candidates -> "run_internal_disambiguation"
    - 1 AG3 internal candidate -> "run_internal_candidate_verification"
    - 0 AG3 candidate -> "skip_no_internal_candidate"
    """
    _ag1_received = agent1_result is not None
    _ag2_received = agent2_result is not None

    if isinstance(agent3_result, dict):
        status = str(agent3_result.get("status") or "").strip().casefold()
        error_type = str(
            agent3_result.get("error_type")
            or dict(agent3_result.get("provider_trace") or {}).get("primary_error_type")
            or ""
        ).strip().casefold()
        if (
            status == "failed"
            or bool(agent3_result.get("technical_error"))
            or error_type in (
                "rate_limit",
                "provider_quota_exhausted",
                "provider_rate_limited",
                "provider_timeout",
                "provider_connection_error",
                "provider_server_error",
                "provider_auth_error",
                "provider_bad_request",
                "provider_malformed_response",
                "missing_api_key",
                "provider_error",
                "timeout",
            )
        ):
            return "skip_provider_failure"

        if status == "completed" and not bool(agent3_result.get("not_counted_in_consensus")):
            return "skip_already_completed"

    evidence_list = evidence
    if evidence_list is None and isinstance(agent3_result, dict):
        evidence_list = list(agent3_result.get("evidence") or [])

    candidates = _get_all_ag3_internal_candidates(evidence_list or [])
    if len(candidates) >= 2:
        return "run_internal_disambiguation"
    elif len(candidates) == 1:
        return "run_internal_candidate_verification"
    else:
        return "skip_no_internal_candidate"


def build_candidate_verification_queries(
    candidate: Dict[str, Any],
    competing_candidates: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """Generate bounded, general banknote queries from candidate(s)."""
    if not candidate:
        return []

    queries: List[str] = []

    def _single_candidate_queries(c: Dict[str, Any]) -> List[str]:
        q_list = []
        amt = c.get("amount")
        curr = c.get("currency")
        cntry = c.get("country")
        is_complete = c.get("identity_complete", True)

        if not is_complete:
            if amt and curr and not cntry:
                q_list.append(f"banknote {amt} {curr} issuing country catalog")
            elif amt and cntry and not curr:
                q_list.append(f"banknote {amt} {cntry} currency code")
            elif amt:
                q_list.append(f"banknote {amt} currency specification")
            return q_list

        try:
            amount_int = int(amt)
        except (TypeError, ValueError):
            return []
        if amount_int <= 0:
            return []

        curr_str = str(curr or "").strip().upper()
        country_str = _compact_text(cntry, 80)
        material = _compact_text(c.get("material"), 40)
        currency_name = CURRENCY_QUERY_NAMES.get(curr_str, curr_str)
        formatted_amount = f"{amount_int:,}".replace(",", ".")

        if curr_str == "VND":
            q_list.extend([
                " ".join(part for part in ("tờ", formatted_amount, "đồng", material) if part),
                " ".join(part for part in (formatted_amount, "đồng", material, "Việt Nam") if part),
                " ".join(part for part in ("Ngân hàng Nhà nước Việt Nam", formatted_amount, "đồng", material) if part),
            ])

        q_list.extend([
            f"{amount_int} {curr_str} banknote",
            " ".join(part for part in (country_str, str(amount_int), curr_str, "banknote") if part),
            f"{amount_int} {currency_name} note",
        ])

        visible_text = " ".join(c.get("visible_text") or [])
        if visible_text:
            q_list.append(
                " ".join(part for part in (country_str, str(amount_int), curr_str, visible_text, "banknote") if part)
            )
        return q_list

    if competing_candidates:
        queries.extend(_single_candidate_queries(candidate)[:2])
        for comp in competing_candidates:
            queries.extend(_single_candidate_queries(comp)[:2])
            c1_denom = candidate.get("denomination") or f"{candidate.get('amount')} {candidate.get('currency')}"
            c2_denom = comp.get("denomination") or f"{comp.get('amount')} {comp.get('currency')}"
            if c1_denom and c2_denom and c1_denom != c2_denom:
                queries.append(f"banknote {c1_denom} vs {c2_denom} difference")
    else:
        queries.extend(_single_candidate_queries(candidate))

    unique_queries = []
    seen = set()
    for query in queries:
        compact = _compact_text(query, 180)
        key = compact.casefold()
        if compact and key not in seen:
            seen.add(key)
            unique_queries.append(compact)
    return unique_queries[:10]


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
    if not isinstance(payload, dict):
        raise RuntimeError("Candidate verification search returned a non-object JSON response.")
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


async def _run_targeted_text_search(query: str, timeout_seconds: float) -> list[dict]:
    """Pure SerpAPI text search helper for targeted evidence enrichment."""
    if not settings.SERPAPI_KEY:
        return []
    def _search():
        import requests
        from app.core.config import settings as app_settings
        return requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google",
                "q": query,
                "api_key": app_settings.SERPAPI_KEY,
                "hl": "vi",
                "num": 8,
                "no_cache": str(_serpapi_no_cache_enabled()).lower(),
            },
            timeout=max(0.1, float(timeout_seconds)),
        )
    try:
        response = await asyncio.to_thread(_search)
        payload = response.json()
        output = []
        for item in list(payload.get("organic_results") or [])[:8]:
            if not isinstance(item, dict):
                continue
            output.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "source": item.get("source") or item.get("displayed_link") or "",
                "url": item.get("link", ""),
                "evidence_origin": "targeted_text_search",
                "is_candidate_assisted": True,
            })
        return output
    except Exception as e:
        print(f"Targeted text search error: {e}")
        return []


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
    query_limit = CANDIDATE_SEARCH_QUERY_LIMIT
    search_timeout_cap = 3.0
    search_reserve_seconds = 1.0
    page_min_budget = 1.0 if fast_mode else PAGE_TEXT_MIN_BUDGET_SECONDS
    page_timeout = 1.5 if fast_mode else PAGE_TEXT_TIMEOUT_SECONDS
    page_max_urls = 2 if fast_mode else PAGE_TEXT_MAX_URLS

    for query in queries[:query_limit]:
        try:
            timeout_seconds = _stage_timeout(
                deadline,
                search_timeout_cap,
                reserve_seconds=search_reserve_seconds,
            )
            response = searcher(query, timeout_seconds)
            if inspect.isawaitable(response):
                response = await asyncio.wait_for(response, timeout=timeout_seconds)
        except (asyncio.TimeoutError, TimeoutError):
            if not collected:
                raise
            break
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
        if len(collected) >= CANDIDATE_SEARCH_RESULTS_PER_QUERY:
            break

    ranked = rank_lens_evidence(collected, context="")
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
        return rank_lens_evidence(page_skipped, context="")[:10]

    try:
        enriched = await enrich_lens_evidence_with_page_text(
            page_eligible,
            deadline=deadline,
            max_urls=page_max_urls,
            timeout_seconds=page_timeout,
            min_budget_seconds=page_min_budget,
            fetcher=page_fetcher,
        )
    except (asyncio.TimeoutError, TimeoutError):
        return rank_lens_evidence(ranked + page_skipped, context="")[:10]
    return rank_lens_evidence(enriched + page_skipped, context="")[:10]


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
        "conflicting_denominations_in_lens_evidence",
        "conflicting_evidence",
        "initial_identity_conflict",
        "candidate_lens_identity_conflict",
    }
    checks = trace.get("checks")
    checks_dict = checks if isinstance(checks, dict) else {}
    if reason in strong_conflicts or checks_dict.get("conflict_check_passed") is False:
        return False, "strong_lens_conflict"
    if status == "completed" and not bool(agent3_result.get("not_counted_in_consensus")):
        return False, "lens_support_not_weak"
    if error_type in {"rate_limit", "provider_quota_exhausted", "provider_rate_limited"}:
        return False, "provider_quota_exhausted"
    if error_type in {
        "provider_timeout",
        "provider_connection_error",
        "provider_server_error",
        "provider_auth_error",
        "provider_bad_request",
        "provider_malformed_response",
    }:
        return False, "lens_technical_error"
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
        "single_untrusted_page_text_source",
        "weak_commercial_source_not_counted",
        "noise_only",
    }:
        return True, reason
    evidence_count = len(agent3_result.get("evidence") or [])
    support_count = int(trace.get("support_signal_count") or 0)
    if evidence_count > 0 and support_count < 3:
        return True, "insufficient_support_signals"
    return False, "lens_result_not_eligible"


def _trace_int(trace: Dict[str, Any], key: str) -> int:
    try:
        return int(trace.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _lens_identity_extremely_strong(agent3_result: Dict[str, Any]) -> bool:
    trace = dict(agent3_result.get("promotion_trace") or {})
    checks = dict(trace.get("checks") or {})
    trusted_source_count = _trace_int(trace, "trusted_source_count")
    trusted_source = bool(checks.get("source_trusted")) or trusted_source_count >= 1
    return bool(
        _trace_int(trace, "direct_title_or_snippet_support_count") >= 3
        and _trace_int(trace, "independent_source_count") >= 3
        and _trace_int(trace, "exact_amount_support_count") >= 3
        and _trace_int(trace, "support_signal_count") >= 3
        and (
            _trace_int(trace, "page_text_support_count") >= 1
            or trusted_source
        )
        and _trace_int(trace, "independent_conflicting_amount_support_count") == 0
    )


def _candidate_vote_details(candidate: Dict[str, Any]) -> tuple[Dict[str, Any], Optional[tuple]]:
    payload = {
        "country": candidate.get("country"),
        "currency_code": candidate.get("currency") or candidate.get("currency_code"),
        "denomination": candidate.get("amount") or candidate.get("denomination"),
    }
    vote = normalize_agent_vote(payload)
    vote_key = vote.get("vote_key")
    if not vote_key and candidate.get("vote_key"):
        vote_key = tuple(candidate.get("vote_key") or [])
    vote_key = tuple(vote_key) if vote_key and len(tuple(vote_key)) == 3 else None
    return vote, vote_key


def _lens_vote_details(agent3_result: Dict[str, Any]) -> tuple[Dict[str, Any], Optional[tuple]]:
    trace = dict((agent3_result or {}).get("promotion_trace") or {})
    selected_identity = trace.get("selected_identity")
    if isinstance(selected_identity, dict):
        payload = {
            "country": selected_identity.get("country"),
            "currency_code": (
                selected_identity.get("currency")
                or selected_identity.get("currency_code")
            ),
            "denomination": (
                selected_identity.get("amount")
                or selected_identity.get("denomination")
            ),
        }
    else:
        payload = agent3_result or {}
    vote = normalize_agent_vote(payload)
    vote_key = vote.get("vote_key")
    vote_key = tuple(vote_key) if vote_key and len(tuple(vote_key)) == 3 else None
    return vote, vote_key


def _candidate_lens_identity_diagnostics(
    candidate: Dict[str, Any],
    agent3_result: Dict[str, Any],
) -> Dict[str, Any]:
    candidate_vote, candidate_key = _candidate_vote_details(candidate)
    lens_vote, lens_key = _lens_vote_details(agent3_result)
    canonical_match = bool(candidate_key and lens_key and candidate_key == lens_key)
    return {
        "canonical_identity_match": canonical_match,
        "conflict_fields": (
            []
            if canonical_match
            else _identity_conflict_fields(candidate_key, lens_key)
        ),
        "candidate_canonical_vote_key": list(candidate_key) if candidate_key else None,
        "lens_canonical_vote_key": list(lens_key) if lens_key else None,
        "candidate_canonical_identity": {
            "country": candidate_vote.get("canonical_country"),
            "currency": candidate_vote.get("currency_code"),
            "amount": candidate_vote.get("amount"),
        },
        "lens_canonical_identity": {
            "country": lens_vote.get("canonical_country"),
            "currency": lens_vote.get("currency_code"),
            "amount": lens_vote.get("amount"),
        },
    }


def _candidate_conflicts_with_lens(
    candidate: Dict[str, Any],
    agent3_result: Dict[str, Any],
) -> bool:
    diagnostics = _candidate_lens_identity_diagnostics(candidate, agent3_result)
    return bool(
        diagnostics["candidate_canonical_vote_key"]
        and diagnostics["lens_canonical_vote_key"]
        and not diagnostics["canonical_identity_match"]
    )


def _demote_lens_for_candidate_conflict(
    agent3_result: Dict[str, Any],
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """PHASE 5 NO-OP — AG3 INDEPENDENCE.

    AG3 must NOT be demoted because its identity conflicts with an external
    agent candidate.  This function is preserved for backward compatibility
    only and now returns the original AG3 result unchanged.

    Any previous logic that compared AG1/AG2 candidate identity against AG3
    and downgraded AG3 status has been removed by Phase 5.

    independence_trace records: demotion_basis = 'internal_ag3_evidence_only'.
    """
    # PHASE 5: Return the original AG3 result without modification.
    # No external agent candidate can demote AG3's deterministic verifier output.
    output = dict(agent3_result or {})
    trace = dict(output.get("promotion_trace") or {})
    trace["external_demotion_attempted"] = True
    trace["external_demotion_applied"] = False
    trace["external_demotion_suppressed_by"] = "ag3_independence_phase5"
    output["promotion_trace"] = trace
    return output


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


def _safe_score(item: Dict[str, Any]) -> float:
    try:
        return float(item.get("score") or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _safe_rank(item: Dict[str, Any]) -> int:
    r = item.get("rank")
    if r is not None and str(r).isdigit():
        return int(r)
    return 999


def _canonical_url_or_url(item: Dict[str, Any]) -> str:
    return str(item.get("canonical_url") or item.get("url") or "").strip().lower()


def _evidence_id_for_item(item: Dict[str, Any], idx: int) -> str:
    """Priority: evidence_id -> id -> canonical_url -> url -> source|title|rank deterministic."""
    for field in ("evidence_id", "id", "canonical_url"):
        val = item.get(field)
        if val and str(val).strip():
            return str(val).strip()
    raw_url = str(item.get("url") or "").strip()
    if raw_url:
        return raw_url
    return "|".join([
        str(item.get("source") or ""),
        str(item.get("title") or "")[:60],
        str(item.get("rank") or idx),
    ])


def _is_non_banknote_numismatic_object(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    reasons = item.get("rank_reasons") or []
    if any(
        str(r).lower().startswith("negative:coin")
        or str(r).lower().startswith("negative:medal")
        or str(r).lower().startswith("negative:token")
        or str(r).lower().startswith("negative:souvenir")
        for r in reasons
    ):
        return True
    text = " ".join([
        str(item.get("title") or ""),
        str(item.get("snippet") or ""),
        str(item.get("page_text_excerpt") or ""),
        str(item.get("page_text") or ""),
    ]).lower()
    if any(k in text for k in ("coin", "coins", "medal", "medals", "token", "tokens", "souvenir", "tiền xu", "đồng - vietnam - numista", "dong - vietnam - numista", "đồng - vietnam – numista")):
        if not any(b in text for b in ("banknote", "banknotes", "paper money", "tiền giấy", "cotton", "polymer note", "currency note", "note -")):
            return True
    return False


def _has_explicit_banknote_phrase(text: str) -> bool:
    if not text:
        return False
    lower = str(text).lower()

    # 1. Unconditional explicit banknote terms (excluding bare "mệnh giá")
    explicit_terms = (
        "banknote", "banknotes", "bank note", "currency note", "paper money",
        "tiền giấy", "tờ tiền", "federal reserve note", "polymer note",
    )
    if any(term in lower for term in explicit_terms):
        return True

    # 2. English bill / note with currency or amount context
    if re.search(r"(?:\$?\s*\d+|\d+\s*dollars?|\b\d+)\s*(?:-| )?bill\b", lower):
        return True
    if re.search(r"(?:\$?\s*\d+|\d+\s*dollars?)\s+note\b", lower):
        return True

    # 3. Vietnamese 'tờ' monetary construction (tờ + denomination/currency)
    pattern = (
        r"\btờ\s+(?:tiền\s+)?(?:mệnh\s+giá\s+|menh\s+gia\s+)?"
        r"(?:\d{1,3}(?:[.,\s]\d{3})*|\d+)\s*"
        r"(?:usd\b|đô\s*la\b|đô\b|dollars?\b|vnd\b|vnđ\b|đồng\b|dong\b|eur\b|euros?\b|jpy\b|yen\b|yên\b|cny\b|tệ\b|k\b|nghìn\b|ngàn\b|triệu\b|[$€£¥₫])"
    )
    if re.search(pattern, lower, flags=re.IGNORECASE):
        return True

    return False


def _has_explicit_banknote_url_path(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False

    for key in ("url", "link", "canonical_url", "raw_url"):
        raw_url = str(item.get(key) or "").strip()
        if not raw_url:
            continue
        try:
            path = urlparse(raw_url).path or raw_url
        except Exception:
            path = raw_url
        if re.search(r"(^|/)banknotes?(/|$)", path.lower()):
            return True
    return False


def _item_has_banknote_context(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False

    if _is_non_banknote_numismatic_object(item):
        return False

    text = " ".join(
        [
            str(item.get("title") or ""),
            str(item.get("snippet") or ""),
            str(item.get("page_text_excerpt") or ""),
            str(item.get("page_text") or ""),
        ]
    ).lower()

    if any("banknote_context" in str(term).lower() for term in (item.get("page_text_identity_terms") or [])):
        return True

    if _has_explicit_banknote_phrase(text):
        return True

    if _has_explicit_banknote_url_path(item):
        return True

    if (
        "has_banknote_context" in item
        and item["has_banknote_context"] is not None
    ):
        return item["has_banknote_context"] is True or _has_metadata_banknote_context(item)

    from app.services.evidence_ranker_service import _has_banknote_context
    return bool(_has_banknote_context(text, item=item))


def _candidate_sort_key(candidate: Dict[str, Any]) -> tuple:
    return (
        -len(candidate.get("candidate_evidence_ids") or []),
        str(candidate.get("canonical_country_key") or ""),
        str(candidate.get("currency") or ""),
        int(candidate.get("amount") or 0),
        ",".join(candidate.get("missing_fields") or []),
    )


def _is_complete_identity_item(item: Dict[str, Any]) -> bool:
    quality = str(item.get("content_identity_quality") or "").upper()
    if quality in {
        "COMPLETE_EXACT",
        "PAGE_TEXT_COMPLETE",
        "STRUCTURED_COMPLETE",
        "COMPLETE_IDENTITY",
    } or bool(item.get("complete_identity_support")):
        return True
    if quality == "NOISE" and not _content_identity_quality_is_noise(item):
        quality = ""
    if quality in ("PARTIAL_IDENTITY", "UNREADABLE", "NOISE", "CONTEXT_ONLY", "NONE"):
        return False
    # Fallback for unannotated/synthetic test evidence
    country = item.get("detected_country")
    currency = item.get("detected_currency")
    amounts = item.get("detected_amounts")
    if not _is_unknown_identity(country) and not _is_unknown_identity(currency):
        if isinstance(amounts, list) and len(amounts) == 1:
            try:
                if int(amounts[0]) > 0:
                    return True
            except (TypeError, ValueError):
                pass
    return False


def _is_partial_identity_item(item: Dict[str, Any]) -> bool:
    quality = str(item.get("content_identity_quality") or "").upper()
    if quality == "PARTIAL_IDENTITY" or bool(item.get("partial_identity_support")):
        return True
    if quality == "NOISE" and not _content_identity_quality_is_noise(item):
        quality = ""
    if quality in ("COMPLETE_EXACT", "UNREADABLE", "NOISE", "CONTEXT_ONLY", "NONE"):
        return False
    # Fallback for unannotated/synthetic test evidence
    country = item.get("detected_country")
    currency = item.get("detected_currency")
    amounts = item.get("detected_amounts")
    country_missing = _is_unknown_identity(country)
    currency_missing = _is_unknown_identity(currency)
    if country_missing != currency_missing:
        if isinstance(amounts, list) and len(amounts) == 1:
            try:
                if int(amounts[0]) > 0:
                    return True
            except (TypeError, ValueError):
                pass
    return False


def _collect_ag3_candidate_records(
    evidence: List[Dict[str, Any]],
    identity_mode: str = "complete",
) -> List[Dict[str, Any]]:
    from app.services.evidence_ranker_service import get_canonical_domain

    if not evidence:
        return []

    raw_records = []
    for idx, item in enumerate(evidence):
        if not isinstance(item, dict):
            continue
        s_trust = str(item.get("source_trust_level") or "").upper().strip()
        if s_trust in ("NOISE", "SOCIAL", "UNREADABLE"):
            continue
        if item.get("is_duplicate_url") is True or item.get("is_mirror") is True:
            continue

        url_val = item.get("url") or item.get("link") or ""
        canon_domain = item.get("canonical_domain") or item.get("domain") or get_canonical_domain(str(url_val))
        if not canon_domain or canon_domain.lower() in ("unknown", "") or "." not in canon_domain:
            continue

        if _evidence_noise_reason(item):
            continue

        if not _item_has_banknote_context(item):
            continue

        if _is_non_banknote_numismatic_object(item):
            continue

        if identity_mode == "complete":
            if not _is_complete_identity_item(item):
                continue
        elif identity_mode == "partial":
            if not _is_partial_identity_item(item):
                continue

        raw_records.append({
            "item": item,
            "canonical_domain": canon_domain,
            "country": item.get("detected_country"),
            "currency": item.get("detected_currency"),
            "amounts": item.get("detected_amounts"),
            "evidence_idx": idx,
            "source_trust_level": s_trust,
        })

    if not raw_records:
        return []

    # Per-domain grouping & Domain-First / Representative selection
    domain_groups: Dict[str, List[Dict[str, Any]]] = {}
    for rec in raw_records:
        domain_groups.setdefault(rec["canonical_domain"], []).append(rec)

    selected_records = []
    for domain, group_recs in domain_groups.items():
        has_annotation = any("domain_first" in r["item"] for r in group_recs)
        if has_annotation:
            domain_first_recs = [r for r in group_recs if r["item"].get("domain_first") is True]
            candidates_to_pick = domain_first_recs if domain_first_recs else group_recs
            best_rec = min(
                candidates_to_pick,
                key=lambda r: (
                    -_safe_score(r["item"]),
                    _safe_rank(r["item"]),
                    _canonical_url_or_url(r["item"]),
                ),
            )
            selected_records.append(best_rec)
        else:
            best_rec = min(
                group_recs,
                key=lambda r: (
                    -_safe_score(r["item"]),
                    _safe_rank(r["item"]),
                    _canonical_url_or_url(r["item"]),
                ),
            )
            selected_records.append(best_rec)

    return selected_records


def _get_all_ag3_internal_candidates(
    evidence: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Extract all valid AG3 candidate clusters having >= 2 independent domains."""
    records = _collect_ag3_candidate_records(evidence, identity_mode="complete")
    if not records:
        return []

    cluster_domains: Dict[tuple, set] = {}
    cluster_evidence_ids: Dict[tuple, List[str]] = {}
    cluster_info: Dict[tuple, Dict[str, Any]] = {}

    for rec in records:
        country = rec["country"]
        currency = rec["currency"]
        amounts = rec["amounts"]

        if _is_unknown_identity(country) or _is_unknown_identity(currency):
            continue
        if not isinstance(amounts, list) or len(amounts) != 1:
            continue
        amount = amounts[0]
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue

        canonical_currency = normalize_currency_no_infer(currency)
        if not canonical_currency:
            continue  # Cannot normalize currency ISO code -> skip complete candidate

        canon_country_key = _normalize_country_key(country, canonical_currency)
        display_country = normalize_country(country) or str(country).strip()

        key = (canon_country_key, canonical_currency, amount)
        ev_id = _evidence_id_for_item(rec["item"], rec.get("evidence_idx", 0))

        cluster_domains.setdefault(key, set()).add(rec["canonical_domain"])
        cluster_evidence_ids.setdefault(key, []).append(ev_id)
        if key not in cluster_info:
            cluster_info[key] = {
                "display_country": display_country,
                "canon_country_key": canon_country_key,
                "currency": canonical_currency,
                "amount": amount,
                "page_text_excerpts": [],
            }
        page_text = _compact_text(rec["item"].get("page_text_excerpt") or "", 80)
        if page_text:
            cluster_info[key]["page_text_excerpts"].append(page_text)

    candidates: List[Dict[str, Any]] = []
    for key, domains in cluster_domains.items():
        if len(domains) >= 2:
            info = cluster_info[key]
            ev_ids = cluster_evidence_ids[key]
            candidates.append({
                "country": info["display_country"],
                "canonical_country_key": info["canon_country_key"],
                "currency": info["currency"],
                "amount": info["amount"],
                "denomination": f"{info['amount']} {info['currency']}",
                "material": "",
                "visible_text": info["page_text_excerpts"][:2],
                "vote_key": [info["display_country"], info["currency"], info["amount"]],
                "candidate_basis": "ag3_lens_evidence_cluster",
                "candidate_evidence_ids": ev_ids,
                "candidate_domains": sorted(list(domains)),
                "independent_domain_count": len(domains),
                "identity_complete": True,
                "missing_fields": [],
                "external_agent_basis": False,
            })

    candidates.sort(key=_candidate_sort_key)
    return candidates


def _get_all_ag3_partial_candidates(
    evidence: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Extract valid partial AG3 candidate clusters having >= 2 independent domains."""
    records = _collect_ag3_candidate_records(evidence, identity_mode="partial")
    if not records:
        return []

    cluster_domains: Dict[tuple, set] = {}
    cluster_evidence_ids: Dict[tuple, List[str]] = {}
    cluster_info: Dict[tuple, Dict[str, Any]] = {}

    for rec in records:
        country = rec["country"]
        currency = rec["currency"]
        amounts = rec["amounts"]

        if not isinstance(amounts, list) or len(amounts) != 1:
            continue
        amount = amounts[0]
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue

        country_missing = _is_unknown_identity(country)
        currency_missing = _is_unknown_identity(currency)

        if country_missing and currency_missing:
            continue

        missing_fields = []
        if country_missing:
            missing_fields.append("country")
        if currency_missing:
            missing_fields.append("currency")

        # Lock partial candidate cluster key (no auto-infer)
        if country_missing:
            canon_currency = normalize_currency_no_infer(currency) or str(currency).strip().upper()
            key = ("missing_country", canon_currency, amount)
            display_country = None
            canon_country_key = None
        else:
            display_country = normalize_country(country) or str(country).strip()
            canon_country_key = _normalize_country_key(country, None)
            canon_currency = None
            key = (canon_country_key, "missing_currency", amount)

        ev_id = _evidence_id_for_item(rec["item"], rec.get("evidence_idx", 0))
        cluster_domains.setdefault(key, set()).add(rec["canonical_domain"])
        cluster_evidence_ids.setdefault(key, []).append(ev_id)
        if key not in cluster_info:
            cluster_info[key] = {
                "display_country": display_country,
                "canon_country_key": canon_country_key,
                "currency": canon_currency,
                "amount": amount,
                "missing_fields": missing_fields,
                "page_text_excerpts": [],
            }
        page_text = _compact_text(rec["item"].get("page_text_excerpt") or "", 80)
        if page_text:
            cluster_info[key]["page_text_excerpts"].append(page_text)

    candidates: List[Dict[str, Any]] = []
    for key, domains in cluster_domains.items():
        if len(domains) >= 2:
            info = cluster_info[key]
            ev_ids = cluster_evidence_ids[key]
            denom_curr = info["currency"] or "UNKNOWN"
            candidates.append({
                "country": info["display_country"],
                "canonical_country_key": info["canon_country_key"],
                "currency": info["currency"],
                "amount": info["amount"],
                "denomination": f"{info['amount']} {denom_curr}",
                "material": "",
                "visible_text": info["page_text_excerpts"][:2],
                "vote_key": [info["display_country"], info["currency"], info["amount"]],
                "candidate_basis": "ag3_lens_partial_cluster",
                "candidate_evidence_ids": ev_ids,
                "candidate_domains": sorted(list(domains)),
                "independent_domain_count": len(domains),
                "identity_complete": False,
                "missing_fields": info["missing_fields"],
                "external_agent_basis": False,
            })

    candidates.sort(key=_candidate_sort_key)
    return candidates


def select_ag3_internal_candidate(
    evidence: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Select primary internal candidate, competing candidates, mode, and evidence_ids."""
    completes = _get_all_ag3_internal_candidates(evidence or [])
    partials = _get_all_ag3_partial_candidates(evidence or [])

    if len(completes) >= 2:
        selected = completes[0]
        competing = completes[1:]
        mode = "run_internal_disambiguation"
        ev_ids = list(selected.get("candidate_evidence_ids") or [])
        return {
            "selected_candidate": selected,
            "competing_candidates": competing,
            "mode": mode,
            "evidence_ids": ev_ids,
        }
    elif len(completes) == 1:
        selected = completes[0]
        mode = "run_internal_candidate_verification"
        ev_ids = list(selected.get("candidate_evidence_ids") or [])
        return {
            "selected_candidate": selected,
            "competing_candidates": [],
            "mode": mode,
            "evidence_ids": ev_ids,
        }
    elif len(partials) >= 1:
        selected = partials[0]
        competing = partials[1:]
        mode = "run_internal_disambiguation"
        ev_ids = list(selected.get("candidate_evidence_ids") or [])
        return {
            "selected_candidate": selected,
            "competing_candidates": competing,
            "mode": mode,
            "evidence_ids": ev_ids,
        }
    else:
        return {
            "selected_candidate": None,
            "competing_candidates": [],
            "mode": "skip_no_internal_candidate",
            "evidence_ids": [],
        }


def build_ag3_internal_candidate(
    evidence: List[Dict[str, Any]],
) -> tuple[Optional[Dict[str, Any]], str, List[str]]:
    """Build a candidate identity strictly from AG3 Lens evidence clusters."""
    sel = select_ag3_internal_candidate(evidence or [])
    cand = sel["selected_candidate"]
    if cand:
        basis = cand.get("candidate_basis", "ag3_lens_evidence_cluster")
        return cand, basis, sel["evidence_ids"]
    if not evidence:
        return None, "no_ag3_evidence", []
    return None, "insufficient_independent_domains", []


async def run_candidate_assisted_verification(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    consensus_result: Optional[Any] = None,
    searcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    page_fetcher: Optional[Callable[[str, float], Awaitable[Any]]] = None,
    deadline: Optional[float] = None,
    mode: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """PHASE 5 INDEPENDENT: Run additional evidence verification seeded by
    AG3-internal evidence clusters only.
    """
    from app.services.evidence_ranker_service import rank_lens_evidence

    _ag1_received = agent1_result is not None
    _ag2_received = agent2_result is not None

    # Poison consensus check at boundary
    consensus_received = consensus_result is not None

    original = dict(agent3_result or {})

    def _make_independence_trace(
        candidate_basis: str = "none",
        candidate_evidence_ids: Optional[List[str]] = None,
        query_basis: str = "none",
        query_evidence_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        return {
            "external_agent_inputs_received": _ag1_received or _ag2_received,
            "external_agent_inputs_used": False,
            "ag1_result_received": _ag1_received,
            "ag1_result_used": False,
            "ag2_result_received": _ag2_received,
            "ag2_result_used": False,
            "consensus_result_received": consensus_received,
            "consensus_result_used": False,
            "candidate_basis": candidate_basis,
            "candidate_evidence_ids": candidate_evidence_ids or [],
            "query_basis": query_basis,
            "query_evidence_ids": query_evidence_ids or [],
            "promotion_basis": "deterministic_verifier_prompt3",
            "demotion_basis": "internal_ag3_evidence_only",
            "formatter_used": bool(original.get("ag3_groq_formatter_used")),
            "formatter_advisory_only": True,
            "deterministic_verifier_final": True,
            "independence_verified": True,
        }

    def _attach_independence(result: Dict[str, Any], itrace: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(result)
        result["independence_trace"] = itrace
        return result

    try:
        ts = float(timeout_seconds if timeout_seconds is not None else 15.0)
        if ts <= 0:
            ts = 15.0
        timeout_seconds = ts
    except (ValueError, TypeError):
        timeout_seconds = 15.0
    ag3_evidence = list(original.get("evidence") or [])
    selection = select_ag3_internal_candidate(ag3_evidence)
    candidate = selection["selected_candidate"]
    competing_candidates = selection["competing_candidates"]
    resolved_mode = selection["mode"]
    evidence_ids = selection["evidence_ids"]

    ag3_candidate_reason = candidate.get("candidate_basis", "ag3_lens_evidence_cluster") if candidate else "no_ag3_internal_candidate"

    itrace = _make_independence_trace(
        candidate_basis=ag3_candidate_reason,
        candidate_evidence_ids=evidence_ids,
        query_basis="ag3_lens_evidence" if candidate else "none",
        query_evidence_ids=evidence_ids if candidate else [],
    )

    lens_weak, lens_reason = _candidate_lens_weak(original)
    if not lens_weak:
        result = _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason=lens_reason,
            candidate=candidate,
            queries=[],
            provider="none",
            skipped_reason=lens_reason,
            mode=mode or resolved_mode,
            timeout_seconds=timeout_seconds,
        )
        return _attach_independence(result, itrace)

    if not candidate:
        result = _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason=ag3_candidate_reason,
            candidate=None,
            queries=[],
            provider="none",
            skipped_reason=ag3_candidate_reason,
            mode=mode or resolved_mode,
            timeout_seconds=timeout_seconds,
        )
        return _attach_independence(result, itrace)

    queries = build_candidate_verification_queries(candidate, competing_candidates=competing_candidates)

    provider = "candidate_verification" if searcher is not None else "serpapi_web"
    if searcher is None and not settings.SERPAPI_KEY:
        result = _attach_candidate_verification_trace(
            original,
            attempted=False,
            reason="candidate_provider_unavailable",
            candidate=candidate,
            queries=queries,
            lens_support_weak=True,
            provider=provider,
            skipped_reason="missing_api_key",
            mode=mode or resolved_mode,
            timeout_seconds=timeout_seconds,
        )
        return _attach_independence(result, itrace)

    deadline = deadline or (time.monotonic() + max(0.1, float(timeout_seconds)))
    try:
        candidate_evidence = await retrieve_candidate_verification_evidence(
            candidate,
            queries=queries,
            searcher=searcher,
            page_fetcher=page_fetcher,
            deadline=deadline,
            mode=mode or resolved_mode,
        )
    except (asyncio.TimeoutError, TimeoutError):
        result = _attach_candidate_verification_trace(
            dict(original),
            attempted=True,
            reason="candidate_timeout",
            candidate=candidate,
            queries=queries,
            used_for_vote=False,
            lens_support_weak=True,
            provider="serpapi_web",
            skipped_reason="timeout",
            mode="targeted_candidate_verification",
            timeout_seconds=timeout_seconds,
        )
        return _attach_independence(result, itrace)
    except Exception as exc:
        result = _attach_candidate_verification_trace(
            original,
            attempted=True,
            reason="candidate_provider_error",
            candidate=candidate,
            queries=queries,
            lens_support_weak=True,
            provider=provider,
            skipped_reason=exc.__class__.__name__,
            mode=mode or resolved_mode,
            timeout_seconds=timeout_seconds,
        )
        return _attach_independence(result, itrace)

    _candidate_identity, candidate_trace, _candidate_errors = verify_lens_evidence_identity(
        candidate_evidence,
        provider=provider,
    )
    combined_evidence = rank_lens_evidence(
        list(original.get("evidence") or []) + candidate_evidence,
        context="",
    )[:10]
    candidate_payload = dict(original)
    candidate_payload["status"] = "Partial"
    candidate_payload["not_counted_in_consensus"] = True
    candidate_payload["evidence"] = combined_evidence
    validated = validate_agent3_identity(candidate_payload, evidence=combined_evidence)

    validated_vote = normalize_agent_vote(validated)
    val_country_key = _normalize_country_key(
        validated_vote.get("country"),
        validated_vote.get("currency_code"),
    )
    candidate_country_key = _normalize_country_key(
        candidate.get("country"),
        candidate.get("currency"),
    )
    country_matches = bool(
        _is_unknown_identity(val_country_key)
        or _is_unknown_identity(candidate_country_key)
        or val_country_key == candidate_country_key
    )
    keys_match = bool(
        country_matches
        and str(validated_vote.get("currency_code") or "").upper() == str(candidate.get("currency") or "").upper()
        and int(validated_vote.get("amount") or -1) == int(candidate.get("amount") or -2)
    )
    used_for_vote = bool(
        str(validated.get("status") or "").casefold() == "completed"
        and not bool(validated.get("not_counted_in_consensus"))
        and keys_match
    )

    reason = "ag3_internal_evidence_corroborated" if used_for_vote else "insufficient_external_support"
    result = _attach_candidate_verification_trace(
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
        mode=mode or resolved_mode,
        timeout_seconds=timeout_seconds,
    )
    return _attach_independence(result, itrace)


def build_candidate_verification_timeout_result(
    agent1_result: Dict[str, Any],
    agent2_result: Dict[str, Any],
    agent3_result: Dict[str, Any],
    *,
    mode: str,
    timeout_seconds: float,
) -> Dict[str, Any]:
    """PHASE 5 INDEPENDENCE: Preserve AG3 result unchanged on timeout.

    agent1_result and agent2_result are accepted for backward compatibility
    but their content is NOT read, NOT used to build any candidate, and NOT
    used to modify the AG3 result in any way.
    """
    # PHASE 5: Ignore external agent results.
    _ = agent1_result  # deprecated/ignored
    _ = agent2_result  # deprecated/ignored
    # Derive candidate from AG3 evidence only
    ag3_evidence = list((agent3_result or {}).get("evidence") or [])
    candidate, _reason, _ids = build_ag3_internal_candidate(ag3_evidence)
    queries = build_candidate_verification_queries(candidate or {})
    reason = "candidate_timeout"

    try:
        ts = float(timeout_seconds)
        if ts <= 0:
            ts = 15.0
    except (ValueError, TypeError):
        ts = 15.0

    result = _attach_candidate_verification_trace(
        dict(agent3_result or {}),
        attempted=True,
        reason=reason,
        candidate=candidate,
        queries=queries,
        used_for_vote=False,
        lens_support_weak=True,
        provider="serpapi_web",
        skipped_reason=reason,
        mode="targeted_candidate_verification",
        timeout_seconds=ts,
    )
    result["independence_trace"] = {
        "external_agent_inputs_received": True,
        "external_agent_inputs_used": False,
        "ag1_result_received": agent1_result is not None,
        "ag1_result_used": False,
        "ag2_result_received": agent2_result is not None,
        "ag2_result_used": False,
        "consensus_result_received": False,
        "consensus_result_used": False,
        "candidate_basis": _reason,
        "candidate_evidence_ids": _ids,
        "deterministic_verifier_final": True,
        "independence_verified": True,
    }
    return result


class Agent3Lens(BaseAgent):
    def __init__(self):
        super().__init__(agent_name="Agent 3 (Google Lens SerpApi)")

    def upload_to_imgbb(
        self,
        image_bytes: bytes,
        timeout_seconds: float = 10.0,
    ) -> Optional[str]:
        return self._upload_to_imgbb_once(image_bytes, timeout_seconds)
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

    def _upload_to_imgbb_once(
        self,
        image_bytes: bytes,
        timeout_seconds: float,
    ) -> str:
        if not settings.IMGBB_API_KEY:
            raise ImgBBUploadError(
                "ImgBB API key is not configured.",
                root_error_type="provider_config_missing",
                retryable=False,
            )

        try:
            response = requests.post(
                "https://api.imgbb.com/1/upload",
                data={"key": settings.IMGBB_API_KEY},
                files={"image": image_bytes},
                timeout=max(0.1, float(timeout_seconds)),
            )
        except Exception as exc:
            if _is_timeout_exception(exc):
                raise ImgBBUploadError(
                    "ImgBB upload timed out.",
                    root_error_type="upload_timeout",
                    retryable=True,
                ) from exc
            if _is_transient_network_exception(exc):
                raise ImgBBUploadError(
                    "ImgBB upload failed with a transient network error.",
                    root_error_type="network_error",
                    retryable=True,
                ) from exc
            raise ImgBBUploadError(
                "ImgBB upload failed before a usable response.",
                root_error_type="upload_failed",
                retryable=False,
            ) from exc

        status_code = getattr(response, "status_code", None)
        if isinstance(status_code, int) and status_code >= 400:
            if status_code in {400, 401, 403}:
                root_error_type = "provider_auth_or_request_error"
                retryable = False
            elif status_code in {408, 429} or status_code >= 500:
                root_error_type = "network_error"
                retryable = True
            else:
                root_error_type = "upload_failed"
                retryable = False
            raise ImgBBUploadError(
                f"ImgBB upload failed with HTTP {status_code}.",
                root_error_type=root_error_type,
                retryable=retryable,
                status_code=status_code,
            )

        try:
            data = response.json()
        except Exception as exc:
            raise ImgBBUploadError(
                "ImgBB upload returned invalid JSON.",
                root_error_type="provider_bad_response",
                retryable=False,
                status_code=status_code,
            ) from exc

        raw_data_field = data.get("data") if isinstance(data, dict) else None
        image_url = raw_data_field.get("url") if isinstance(raw_data_field, dict) else None
        if _is_valid_public_image_url(image_url):
            return str(image_url).strip()

        raise ImgBBUploadError(
            "ImgBB upload did not return a public image URL.",
            root_error_type="provider_bad_response",
            retryable=False,
            status_code=status_code,
        )

    async def _upload_to_imgbb_with_retry(
        self,
        image_bytes: bytes,
        deadline: float,
    ) -> Tuple[str, Dict[str, Any]]:
        attempts = 0
        retry_attempted = False
        last_error: Optional[ImgBBUploadError] = None

        for attempt_index in range(2):
            attempts += 1
            try:
                upload_timeout = _upload_attempt_timeout(deadline)
                image_url = await asyncio.to_thread(
                    self.upload_to_imgbb,
                    image_bytes,
                    upload_timeout,
                )
                return image_url, {
                    "attempts": attempts,
                    "retry_attempted": retry_attempted,
                    "timeout_seconds_last_attempt": round(upload_timeout, 3),
                    "image_url_source": "imgbb_upload",
                }
            except ImgBBUploadError as exc:
                last_error = exc
                exc.retry_attempted = retry_attempted
                if not exc.retryable or attempt_index >= 1:
                    raise exc
                remaining_after_reserve = _remaining_budget(deadline) - AG3_POST_UPLOAD_MIN_BUDGET_SECONDS
                if remaining_after_reserve < AG3_UPLOAD_MIN_ATTEMPT_SECONDS:
                    raise exc
                retry_attempted = True
                exc.retry_attempted = True
                sleep_seconds = min(
                    AG3_UPLOAD_RETRY_SLEEP_SECONDS,
                    max(0.0, remaining_after_reserve - AG3_UPLOAD_MIN_ATTEMPT_SECONDS),
                )
                if sleep_seconds > 0:
                    await asyncio.sleep(sleep_seconds)
            except TimeoutError as exc:
                last_error = ImgBBUploadError(
                    "Agent 3 upload deadline exhausted before retrieval budget.",
                    root_error_type="upload_deadline_exhausted",
                    retryable=False,
                    retry_attempted=retry_attempted,
                )
                raise last_error from exc

        if last_error is not None:
            last_error.retry_attempted = retry_attempted
            raise last_error
        raise ImgBBUploadError(
            "ImgBB upload failed.",
            root_error_type="upload_failed",
            retryable=False,
            retry_attempted=retry_attempted,
        )

    def _call_serpapi_google_lens(
        self,
        image_url: str,
        timeout_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not settings.SERPAPI_KEY:
            raise SerpApiProviderError(
                "SerpAPI key is not configured.",
                error_type="provider_auth_error",
            )

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
        except Exception as exc:
            raise SerpApiProviderError(
                "SerpAPI returned a malformed JSON response.",
                error_type="provider_malformed_response",
                status_code=getattr(response, "status_code", None),
            ) from exc

        if not isinstance(data, dict):
            raise SerpApiProviderError(
                "SerpAPI returned a non-object JSON response.",
                error_type="provider_malformed_response",
                status_code=getattr(response, "status_code", None),
            )

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
        if not isinstance(data, dict):
            raise SerpApiProviderError(
                "SerpAPI returned an empty or non-dict response during normalization.",
                error_type="provider_malformed_response",
            )
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
                "error_type": "provider_no_result",
                "search_performed": True,
                "raw_lens_result_count": 0,
                "raw_text": raw_lens_text,
            }
            if evidence is not None:
                fallback_data["evidence"] = evidence
            validated = validate_agent3_identity(fallback_data, evidence=evidence or [])
            return json.dumps([validated], ensure_ascii=False)

        import sys, traceback
        sys.stderr.write(f"\n[BUILD_VIS_ERR] error={type(error)}: {error}\n")
        if error:
            traceback.print_exception(type(error), error, error.__traceback__)
        provider_error_type = _classify_serpapi_error(error)
        provider_message = (
            "SerpAPI quota or rate limit was exhausted; Agent 3 could not "
            "retrieve Lens evidence."
            if provider_error_type in {"rate_limit", "provider_rate_limited"}
            else (
                f"{self.agent_name} provider error: "
                f"{error.__class__.__name__ if error else 'unknown_error'}: "
                f"{str(error).replace(str(getattr(settings, 'SERPAPI_KEY', 'XXX')), '***') if error else 'no_details'}."
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
            "search_performed": False,
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
            reported_provider = str(item.get("provider") or "").strip().lower()
            if reported_provider in FORMATTER_PROVIDER_VALUES:
                item.setdefault("formatter_provider", reported_provider)
                item["provider"] = "serpapi"
            else:
                item.setdefault("provider", "serpapi")
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
        public_crop_url: Optional[str] = None,
    ) -> str:
        run_started_at = time.monotonic()
        deadline = _ensure_deadline(deadline)
        stage_trace: List[Dict[str, Any]] = []
        current_stage = "preflight"
        evidence_snapshot: List[Dict[str, Any]] = []
        raw_lens_data = ""
        det_result: Optional[Dict[str, Any]] = None
        if not _is_valid_public_image_url(public_crop_url) and not settings.IMGBB_API_KEY:
            return _technical_failure_result_json(
                timeout_stage="upload",
                provider_stage="upload",
                root_error_type="provider_config_missing",
                message="ImgBB API key is not configured and no valid public crop URL was provided.",
                deadline=deadline,
                run_started_at=run_started_at,
                stage_trace=stage_trace,
                debug_log=debug_log,
                evidence=[],
                raw_lens_text="",
                retry_attempted=False,
                search_performed=False,
            )
        if not settings.IMGBB_API_KEY and not _is_valid_public_image_url(public_crop_url):
            return self.build_visual_search_result(error=Exception("Thiếu IMGBB_API_KEY"))

        if not settings.SERPAPI_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu SERPAPI_KEY"))

        try:
            print(f"[{self.agent_name}] Uploading image to ImgBB...")
            current_stage = "upload"
            upload_started = time.monotonic()
            image_url = ""
            upload_meta: Dict[str, Any] = {
                "image_url_source": "imgbb_upload",
                "retry_attempted": False,
            }
            if _is_valid_public_image_url(public_crop_url):
                image_url = str(public_crop_url).strip()
                upload_meta.update(
                    {
                        "image_url_source": "public_crop_url",
                        "upload_skipped": True,
                        "attempts": 0,
                    }
                )
            else:
                try:
                    image_url, upload_meta = await self._upload_to_imgbb_with_retry(
                        image_bytes,
                        deadline,
                    )
                except ImgBBUploadError as exc:
                    _record_stage_trace(
                        stage_trace,
                        debug_log,
                        stage="upload",
                        started_at=upload_started,
                        deadline=deadline,
                        status="timeout" if exc.root_error_type == "upload_timeout" else "failed",
                    )
                    return _technical_failure_result_json(
                        timeout_stage="upload",
                        provider_stage="upload",
                        root_error_type=exc.root_error_type,
                        message=str(exc),
                        deadline=deadline,
                        run_started_at=run_started_at,
                        stage_trace=stage_trace,
                        debug_log=debug_log,
                        evidence=[],
                        raw_lens_text="",
                        retry_attempted=bool(exc.retry_attempted),
                        search_performed=False,
                    )
                except TimeoutError as exc:
                    _record_stage_trace(
                        stage_trace,
                        debug_log,
                        stage="upload",
                        started_at=upload_started,
                        deadline=deadline,
                        status="timeout",
                    )
                    return _technical_failure_result_json(
                        timeout_stage="upload",
                        provider_stage="upload",
                        root_error_type="upload_deadline_exhausted",
                        message=str(exc),
                        deadline=deadline,
                        run_started_at=run_started_at,
                        stage_trace=stage_trace,
                        debug_log=debug_log,
                        evidence=[],
                        raw_lens_text="",
                        retry_attempted=bool(upload_meta.get("retry_attempted")),
                        search_performed=False,
                    )
            upload_ms = int((time.monotonic() - upload_started) * 1000)
            print(f"[Agent3Timing] upload_ms={upload_ms}")
            _record_stage_trace(
                stage_trace,
                debug_log,
                stage="upload",
                started_at=upload_started,
                deadline=deadline,
                status=(
                    "skipped_public_crop_url"
                    if upload_meta.get("image_url_source") == "public_crop_url"
                    else "completed"
                ),
            )
            if debug_log is not None:
                debug_log["upload_trace"] = {
                    **upload_meta,
                    "elapsed_ms": upload_ms,
                    "remaining_ms": int(_remaining_budget(deadline) * 1000),
                }

            if not image_url:
                return self.build_visual_search_result(error=Exception("Upload ImgBB thất bại, không có image_url."))

            print(f"[{self.agent_name}] Calling SerpApi Google Lens...")
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
                    provider_error_type = _classify_serpapi_error(exc)
                    if provider_error_type in {
                        "rate_limit",
                        "provider_rate_limited",
                        "provider_auth_error",
                        "provider_bad_request",
                        "provider_malformed_response",
                    }:
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
            if not isinstance(compact_data, dict):
                raise SerpApiProviderError(
                    "Normalized compact_data is invalid.",
                    error_type="provider_malformed_response",
                )

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
            RAW_LENS_RESULT_LIMIT = INITIAL_LENS_RESULT_LIMIT
            evidence_snapshot = raw_evidence[:RAW_LENS_RESULT_LIMIT]

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
            evidence_snapshot = pre_ranked_evidence[:RAW_LENS_RESULT_LIMIT]
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
                    evidence=pre_ranked_evidence[:RAW_LENS_RESULT_LIMIT],
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
                        pre_ranked_evidence[:RAW_LENS_RESULT_LIMIT],
                        deadline=deadline,
                        max_urls=None,
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
                            pre_ranked_evidence[:RAW_LENS_RESULT_LIMIT],
                            deadline=deadline,
                            max_urls=None,
                            timeout_seconds=PAGE_TEXT_TIMEOUT_SECONDS,
                        ),
                        timeout=page_text_timeout,
                    )
                ranked_evidence = rank_lens_evidence(
                    enriched_top + pre_ranked_evidence[RAW_LENS_RESULT_LIMIT:],
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
                    evidence=pre_ranked_evidence[:RAW_LENS_RESULT_LIMIT],
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
            top_evidence = ranked_evidence[:RAW_LENS_RESULT_LIMIT]
            evidence_snapshot = top_evidence

            # ----------------------------------------------------------------
            # GROQ EVIDENCE READER LAYER
            # Reads text evidence only — no image bytes sent to Groq.
            # Classifies each evidence item as support/conflict/context_only/noise.
            # Results feed into reconciliation before formatter is called.
            # ----------------------------------------------------------------
            groq_reader_enabled = bool(
                getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_ENABLED", False)
            ) or getattr(self, "groq_reader_enabled", False)
            groq_reader_mode = str(
                getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_MODE", "when_weak") or "when_weak"
            ).strip().lower()

            # Targeted Evidence Enrichment Logic
            # First pass purely on Lens evidence
            det_result = parse_lens_evidence_without_llm(top_evidence, raw_lens_text="")
            det_promotion_trace = det_result.get("promotion_trace") or {}
            selected_identity = (
                det_promotion_trace.get("selected_identity")
                or det_promotion_trace.get("candidate_identity")
                or {}
            )
            if not selected_identity.get("country") or not selected_identity.get("amount"):
                clusters = det_promotion_trace.get("candidate_clusters") or []
                for c in clusters:
                    if c.get("independent_domain_count", 0) >= 2:
                        selected_identity = c
                        break

            exact_independent_count = int(
                selected_identity.get("independent_domain_count")
                or det_promotion_trace.get("independent_source_count")
                or 0
            )

            targeted_result_count = 0
            targeted_search_performed = False
            targeted_search_skip_reason = ""

            if exact_independent_count < 2:
                targeted_search_skip_reason = "insufficient_exact_domains"
            elif exact_independent_count >= 5:
                targeted_search_skip_reason = "sufficient_exact_domains"
            else:
                det_country = str(selected_identity.get("country") or det_result.get("quoc_gia") or "")
                det_currency = str(selected_identity.get("currency") or det_result.get("ma_tien_te") or "")
                raw_amt = selected_identity.get("amount")
                det_amount = int(raw_amt) if isinstance(raw_amt, (int, float)) and raw_amt > 0 else _parse_amount_token(str(raw_amt or det_result.get("menh_gia") or ""))

                if not (det_country and det_currency and det_amount):
                    targeted_search_skip_reason = "missing_identity_fields"
                else:
                    targeted_search_performed = True
                    query = f"{det_country} {det_amount} {det_currency} banknote"
                    print(f"[{self.agent_name}] Running targeted enrichment query")
                    search_timeout = _stage_timeout(deadline, 5.0, reserve_seconds=1.0)
                    targeted_sources = await _run_targeted_text_search(query, search_timeout)
                    targeted_result_count = len(targeted_sources)
                    if targeted_sources:
                        # Append and re-rank
                        merged_evidence = top_evidence + targeted_sources
                        # Dedupe by canonical url and domain happens natively in parse_lens_evidence_without_llm
                        # But we should re-rank them so good targeted sources bubble up
                        from app.services.evidence_ranker_service import rank_lens_evidence
                        merged_ranked = rank_lens_evidence(merged_evidence, context=context)
                        # We allow up to 15 items in the combined list before second pass
                        top_evidence = merged_ranked[:15]
                        evidence_snapshot = top_evidence

                        # Second idempotent pass
                        det_result = parse_lens_evidence_without_llm(top_evidence, raw_lens_text="")
                        det_promotion_trace = det_result.get("promotion_trace") or {}

            # Record counts for diagnostics
            det_result["lens_result_count"] = len([e for e in top_evidence if e.get("evidence_origin", "lens_visual_match") == "lens_visual_match"])
            det_result["targeted_search_performed"] = targeted_search_performed
            det_result["targeted_search_result_count"] = targeted_result_count
            det_result["targeted_search_skip_reason"] = targeted_search_skip_reason

            from urllib.parse import urlparse
            unique_domains = set()
            for e in top_evidence:
                domain = e.get("canonical_domain")
                if not domain or str(domain).lower() in ("unknown", "none", ""):
                    url = str(e.get("url") or e.get("link") or "")
                    if url:
                        try:
                            domain = urlparse(url).hostname
                        except Exception:
                            pass
                if domain:
                    unique_domains.add(str(domain).lower())

            det_result["merged_raw_unique_domain_count"] = len(unique_domains)
            det_result["exact_eligible_source_count"] = det_promotion_trace.get("support_count", 0)

            det_promoted = str(det_result.get("status") or "").lower() == "completed" and not bool(
                det_result.get("not_counted_in_consensus")
            )
            det_promotion_trace = det_result.get("promotion_trace") or {}
            det_exact_count = int(det_promotion_trace.get("exact_amount_support_count") or 0)
            det_support_count = int(det_promotion_trace.get("support_count") or 0)
            groq_reader_result = None
            groq_extractions = {}
            partial_sources = []

            if groq_reader_enabled and GROQ_EVIDENCE_READER_AVAILABLE:
                partial_sources = [
                    e for e in det_result.get("evidence", [])
                    if e.get("selected_for_ag3_internal_vote") is True
                    and str(e.get("evidence_disposition") or "").lower() == "partial"
                ]

                reader_call = (not det_promoted) and len(partial_sources) > 0

                if reader_call and _remaining_budget(deadline) >= 3.0:
                    reader_timeout = min(
                        float(getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_TIMEOUT_SECONDS", 5.0) or 5.0),
                        max(1.0, _remaining_budget(deadline) - 2.0),
                    )

                    det_candidate = None
                    selected = det_promotion_trace.get("winning_identity") or det_promotion_trace.get("locked_identity_before_formatter")
                    if not selected:
                        clusters = det_promotion_trace.get("candidate_clusters") or []
                        if clusters:
                            selected = clusters[0]
                    if selected:
                        det_candidate = {
                            "country": str(selected.get("country") or ""),
                            "currency_code": str(selected.get("currency") or ""),
                            "denomination": str(selected.get("amount") or ""),
                        }

                    try:
                        groq_reader_result = await asyncio.wait_for(
                            read_evidence_with_groq(
                                partial_sources,
                                candidate_identity=det_candidate,
                                timeout_seconds=reader_timeout,
                                top_n=len(partial_sources),
                            ),
                            timeout=reader_timeout + 0.5,
                        )
                    except (asyncio.TimeoutError, Exception) as reader_exc:
                        groq_reader_result = None
                        if debug_log is not None:
                            debug_log["groq_error"] = f"{type(reader_exc).__name__}"

                    if groq_reader_result and groq_reader_result.get("evidence_classification"):
                        candidate_for_groq = det_candidate if isinstance(det_candidate, dict) else {}
                        for clf in groq_reader_result["evidence_classification"]:
                            r = clf.get("rank")
                            matched_item = next((e for e in partial_sources if e.get("rank") == r or e.get("raw_rank") == r), None)
                            if matched_item:
                                d = str(matched_item.get("canonical_domain") or matched_item.get("domain") or "").strip().lower()
                                if d:
                                    status_clf = clf.get("classification")
                                    groq_extractions[d] = {
                                        "banknote_relevant": status_clf in ("support", "conflict"),
                                        "country": candidate_for_groq.get("country") if clf.get("supports_country") else None,
                                        "currency": candidate_for_groq.get("currency_code") if clf.get("supports_currency") else None,
                                        "denomination": candidate_for_groq.get("denomination") if clf.get("supports_denomination") else clf.get("conflicting_denomination")
                                    }

                        if groq_extractions:
                            det_result = parse_lens_evidence_without_llm(
                                top_evidence,
                                raw_lens_text="",
                                groq_extractions=groq_extractions
                            )
                            det_promoted = str(det_result.get("status") or "").lower() == "completed" and not bool(det_result.get("not_counted_in_consensus"))
                            det_promotion_trace = det_result.get("promotion_trace") or {}

            if debug_log is not None:
                debug_log["groq_evidence_reader"] = {
                    "enabled": groq_reader_enabled,
                    "called": len(groq_extractions) > 0,
                    "evidence_count_sent": len(partial_sources) if groq_extractions else 0,
                    "groq_extractions": groq_extractions,
                }


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
                for item in top_evidence[:10]
            ]
            raw_lens_data = json.dumps(formatter_evidence, ensure_ascii=False)
            print(f"[{self.agent_name}] Got Lens data, formatting with LLM...")

            if _remaining_budget(deadline) < FORMATTER_MIN_BUDGET_SECONDS:
                if _has_authoritative_det_vote(det_result):
                    return _det_result_as_final_json(
                        det_result,
                        timeout_stage="before_formatter",
                        stage_trace=stage_trace,
                        debug_log=debug_log,
                    )
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
                    groq_extractions=groq_extractions,
                )
                _record_stage_trace(
                    stage_trace,
                    debug_log,
                    stage="formatter",
                    started_at=formatter_started,
                    deadline=deadline,
                )
                return _normalize_serpapi_formatter_provider_json(formatter_result)

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
                if _has_authoritative_det_vote(det_result):
                    return _det_result_as_final_json(
                        det_result,
                        timeout_stage="formatter",
                        stage_trace=stage_trace,
                        debug_log=debug_log,
                    )
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
            if _has_authoritative_det_vote(det_result):
                return _det_result_as_final_json(
                    det_result,
                    timeout_stage=current_stage,
                    stage_trace=stage_trace,
                    debug_log=debug_log,
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
            import sys, traceback
            sys.stderr.write(f"\n[RUN_EXC] {type(e).__name__}: {e}\n")
            traceback.print_exc()
            print(f"[{self.agent_name}] Error: {e}")
            return self.build_visual_search_result(error=e)


async def run_agent3_lens(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
    public_crop_url: Optional[str] = None,
) -> str:
    agent = Agent3Lens()
    return await agent.run(
        image_bytes,
        context,
        debug_log=debug_log,
        deadline=deadline,
        public_crop_url=public_crop_url,
    )
