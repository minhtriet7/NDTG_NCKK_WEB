import re
import unicodedata
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

from app.agents.agent_3_lens import ALLOWED_DENOMINATIONS


COUNTRY_CURRENCY = {
    "đôla mỹ": ("United States", "USD"),
    "đô la mỹ": ("United States", "USD"),
    "đôla": ("United States", "USD"),
    "đô la": ("United States", "USD"),
    "one dollar": ("United States", "USD"),
    "one dollar bill": ("United States", "USD"),
    "us dollar": ("United States", "USD"),
    "u.s. dollar": ("United States", "USD"),
    "dollar": ("United States", "USD"),
    "dollars": ("United States", "USD"),
    "$": ("United States", "USD"),
    "vietnam": ("Việt Nam", "VND"),
    "viet nam": ("Việt Nam", "VND"),
    "việt nam": ("Việt Nam", "VND"),
    "vn": ("Việt Nam", "VND"),
    "vnd": ("Việt Nam", "VND"),
    "đồng": ("Việt Nam", "VND"),
    "dong": ("Việt Nam", "VND"),
    "₫": ("Việt Nam", "VND"),

    "thailand": ("Thái Lan", "THB"),
    "thai": ("Thái Lan", "THB"),
    "thái lan": ("Thái Lan", "THB"),
    "baht": ("Thái Lan", "THB"),
    "thb": ("Thái Lan", "THB"),
    "฿": ("Thái Lan", "THB"),

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
    "burma": ("Myanmar", "MMK"),
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
    "united states": ("United States", "USD"),
    "united states of america": ("United States", "USD"),
    "american": ("United States", "USD"),
    "usa": ("United States", "USD"),
    "u.s.": ("United States", "USD"),
    "us": ("United States", "USD"),
    "european union": ("European Union", "EUR"),
    "eurozone": ("European Union", "EUR"),
    "euro": ("European Union", "EUR"),
    "euros": ("European Union", "EUR"),
    "eur": ("European Union", "EUR"),
    "€": ("European Union", "EUR"),
    "japan": ("Japan", "JPY"),
    "jpy": ("Japan", "JPY"),
    "yen": ("Japan", "JPY"),
    "yên": ("Japan", "JPY"),
    "¥": ("Japan", "JPY"),
    "united kingdom": ("United Kingdom", "GBP"),
    "uk": ("United Kingdom", "GBP"),
    "british": ("United Kingdom", "GBP"),
    "gbp": ("United Kingdom", "GBP"),
    "pound": ("United Kingdom", "GBP"),
    "pounds": ("United Kingdom", "GBP"),
    "sterling": ("United Kingdom", "GBP"),
    "£": ("United Kingdom", "GBP"),
    "south korea": ("South Korea", "KRW"),
    "korea": ("South Korea", "KRW"),
    "krw": ("South Korea", "KRW"),
    "won": ("South Korea", "KRW"),
    "₩": ("South Korea", "KRW"),
}

CURRENCY_ALIASES = {
    "vnđ": "VND",
    "₫": "VND",
    "đ": "VND",
    "đồng": "VND",
    "dong": "VND",
    "vnd": "VND",
    "baht": "THB",
    "bahts": "THB",
    "thb": "THB",
    "฿": "THB",
    "kip": "LAK",
    "kips": "LAK",
    "lak": "LAK",
    "riel": "KHR",
    "riels": "KHR",
    "khr": "KHR",
    "kyat": "MMK",
    "kyats": "MMK",
    "mmk": "MMK",
    "ringgit": "MYR",
    "ringgits": "MYR",
    "myr": "MYR",
    "singapore dollar": "SGD",
    "sgd": "SGD",
    "peso": "PHP",
    "php": "PHP",
    "bnd": "BND",
    "usd": "USD",
    "us dollar": "USD",
    "u.s. dollar": "USD",
    "đôla mỹ": "USD",
    "đô la mỹ": "USD",
    "eur": "EUR",
    "euro": "EUR",
    "euros": "EUR",
    "€": "EUR",
    "jpy": "JPY",
    "yen": "JPY",
    "yên": "JPY",
    "¥": "JPY",
    "gbp": "GBP",
    "pound": "GBP",
    "pounds": "GBP",
    "pound sterling": "GBP",
    "sterling": "GBP",
    "£": "GBP",
    "krw": "KRW",
    "won": "KRW",
    "₩": "KRW",
}

BANKNOTE_KEYWORDS = [
    "banknote",
    "banknotes",
    "bill",
    "currency note",
    "paper money",
    "polymer note",
    "denomination",
    "face value",
    "money",
    "note",
    "tờ",
    "tờ tiền",
    "tiền giấy",
    "mệnh giá",
    "đồng tiền",
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
    "tỷ giá",
    "ty gia",
    "usd hôm nay",
    "usd hom nay",
    "converted to",
    "vnd equivalent",
    "bằng bao nhiêu tiền việt nam",
    "bang bao nhieu tien viet nam",
    "xuống mức thấp",
    "xuong muc thap",
    "record low",
    "fell to",
    "drops to",
    "chi tiêu",
    "chi tieu",
    "spending",
    "daily budget",
    "tiktok",
    "youtube",
    "youtu.be",
    "forex",
    "converter",
    "shop",
    "buy",
    "sell",
    "sold for",
    "auction",
    "marketplace",
    "collector",
    "collector price",
    "birthday note",
    "price",
    "catalogue",
    "mã catalog",
    "ma catalog",
    "tiền giả",
    "tien gia",
    "counterfeit",
    "fake money",
    "fake banknote",
    "quỹ đen",
    "quy den",
    "chiêu biến tờ",
    "chieu bien to",
    "biến tờ",
    "bien to",
    "tiền thật lấy",
    "tien that lay",
    "tiền bị rách",
    "tien bi rach",
]

# TRUSTED_SOURCES: used for scoring only (legacy keyword matching on source field).
# Do NOT add domain names here solely to make test fixtures pass.
# The authoritative trust classification is handled by classify_source() which
# uses its own trusted_domains set with explicit policy justification.
TRUSTED_SOURCES = [
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

CURRENCY_DEFAULT_COUNTRY = {
    "USD": "United States",
    "VND": "Việt Nam",
    "EUR": "European Union",
    "JPY": "Japan",
    "GBP": "United Kingdom",
    "KRW": "South Korea",
    "THB": "Thái Lan",
    "MMK": "Myanmar",
    "KHR": "Campuchia",
    "LAK": "Lào",
    "MYR": "Malaysia",
    "SGD": "Singapore",
    "IDR": "Indonesia",
    "PHP": "Philippines",
    "BND": "Brunei",
}

BANKNOTE_CONTEXT_KEYWORDS = [
    "banknote",
    "banknotes",
    "bill",
    "currency note",
    "paper money",
    "polymer note",
    "central bank",
    "denomination",
    "face value",
    "note",
    "tờ tiền",
    "tiền giấy",
    "đồng tiền",
]


def _identity_text(item: Dict[str, Any]) -> str:
    """Text allowed to contribute country/currency/denomination identity."""
    return (
        f"{item.get('title', '')} {item.get('snippet', '')} "
        f"{item.get('page_text_excerpt', '')}"
    ).lower()


def _context_text(item: Dict[str, Any]) -> str:
    """Human-readable context; URL identifiers must never become identity."""
    return (
        f"{item.get('title', '')} {item.get('snippet', '')} "
        f"{item.get('page_text_excerpt', '')} {item.get('source', '')}"
    ).lower()


def _contains_term(text: str, term: str) -> bool:
    normalized_term = str(term or "").strip().lower()
    if not normalized_term:
        return False
    if not any(char.isalnum() for char in normalized_term):
        return normalized_term in str(text or "").lower()
    return re.search(
        rf"(?<!\w){re.escape(normalized_term)}(?!\w)",
        str(text or "").lower(),
        flags=re.IGNORECASE,
    ) is not None


def _extract_iso_currency_code(text: str) -> Optional[str]:
    original = str(text or "")
    excluded = {
        "UNC", "PMG", "GEM", "NEW", "THE", "AND", "OLD",
        "NAM", "BIN", "TON", "COT", "SER", "PCS",
        # Grading/condition/note type codes that must never become currency codes
        "EPQ", "GMT", "UTC", "NMT", "FRN",
    }
    patterns = (
        r"\b(?i:currency)\s*:\s*(?P<label>[A-Z]{3})\b",
        r"(?<!\d)(?P<amount>\d{1,3}(?:[.,\s]\d{3})*|\d{1,7})\s+(?P<after>[A-Z]{3})(?!\w)",
        r"(?<!\w)(?P<before>[A-Z]{3})\s+(?P<following>\d{1,3}(?:[.,\s]\d{3})*|\d{1,7})(?!\d)",
        r"(?<!\w)(?P<context>[A-Z]{3})\s+(?i:banknote|note|currency)\b",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, original):
            groups = match.groupdict()
            code = next(
                (
                    groups[name]
                    for name in ("label", "after", "before", "context")
                    if groups.get(name)
                ),
                "",
            ).upper()
            if code in excluded:
                continue
            amount_text = groups.get("amount") or groups.get("following")
            if amount_text:
                amount = _clean_number(amount_text)
                if amount is None or 1800 <= amount <= 2100:
                    continue
            return code
    return None


def _extract_open_country_phrase(text: str) -> Optional[str]:
    match = re.search(
        r"(?:\btiền\s+)?"
        r"(?P<country>[A-Za-zÀ-ỹ][\wÀ-ỹ'’-]{1,30}"
        r"\s+(?:and|và|&)\s+[A-Za-zÀ-ỹ][\wÀ-ỹ'’-]{1,30})"
        r"(?=\s*(?:\.{2,}|[-,:;|–—])?\s*\d)",
        str(text or ""),
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    words = match.group("country").split()
    return " ".join(
        word.casefold() if word.casefold() in {"and", "và", "&"} else word.capitalize()
        for word in words
    )


def _has_explicit_us_context(text: str) -> bool:
    lower = str(text or "").lower()
    return any(
        _contains_term(lower, marker)
        for marker in (
            "usd", "us dollar", "u.s. dollar", "united states",
            "usa", "u.s.", "đôla mỹ", "đô la mỹ",
        )
    )


def _has_foreign_dollar_context(text: str) -> bool:
    lower = str(text or "").lower()
    if _has_explicit_us_context(lower):
        return False
    return bool(
        _extract_open_country_phrase(text)
        or any(
            marker in lower
            for marker in (
                "singapore", "australian", "canadian", "hong kong",
                "new zealand", "cad", "hkd", "aud", "sgd",
            )
        )
    )


def _has_explicit_vnd_context(text: str) -> bool:
    lower = str(text or "").lower()
    if any(_contains_term(lower, marker) for marker in ("vnd", "vnđ", "₫")):
        return True
    if re.search(r"\b(?:đồng\s+việt\s+nam|việt\s+nam\s+đồng|vietnamese\s+dong)\b", lower):
        return True
    has_other_currency_after_dong = re.search(
        r"\b(?:đồng|dong)\s+(?:kip|usd|dollar|euro|yen|baht|won|riel|kyat)\b",
        lower,
    )
    if has_other_currency_after_dong:
        return False
    if re.search(r"(?<!\d)\d[\d.,\s]*\s*(?:đồng|dong|nghìn\s+đồng|ngàn\s+đồng|k)\b", lower):
        if any(marker in lower for marker in ("việt nam", "viet nam", "vietnam", "polymer", "mệnh giá", "bát quý", "báo", "seri", ".vn")):
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


def _has_banknote_context(context: str, item: Optional[Dict[str, Any]] = None) -> bool:
    ctx_str = str(context or "").lower()
    if item and isinstance(item, dict):
        url_or_dom = str(item.get("url") or item.get("link") or item.get("domain") or item.get("canonical_domain") or "").lower()
        canon_dom = get_canonical_domain(url_or_dom)
        if canon_dom == "numista.com" or "numista" in canon_dom:
            if any(k in ctx_str for k in ("issuer", "value", "catalogue", "note", "composition", "500")) or "/catalogue/" in url_or_dom:
                return True

    if _has_explicit_banknote_phrase(ctx_str):
        return True

    negative_finance = any(
        kw in ctx_str
        for kw in ("tiền lãi", "lãi suất", "khoản vay", "tiền vay", "gửi tiết kiệm", "lãi hàng tháng", "chi tiêu hàng ngày")
    )
    has_explicit_banknote_word = any(
        _contains_term(ctx_str, keyword)
        for keyword in ("banknote", "banknotes", "bill", "tờ tiền", "tiền giấy", "polymer note", "face value", "currency note")
    )
    if negative_finance and not has_explicit_banknote_word:
        return False

    return any(
        _contains_term(ctx_str, keyword)
        for keyword in BANKNOTE_CONTEXT_KEYWORDS
    )


def _has_negative_money_context(context: str) -> bool:
    return any(keyword in str(context or "").lower() for keyword in NEGATIVE_KEYWORDS)


def _amount_pattern(amount: Any) -> str:
    try:
        digits = str(int(amount))
    except (TypeError, ValueError):
        return re.escape(str(amount or "").strip())
    groups = []
    while digits:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    return r"[.,\s]?".join(re.escape(group) for group in groups)


def _has_direct_banknote_amount_context(context: str, raw_amount: Any) -> bool:
    amount_pattern = _amount_pattern(raw_amount)
    if not amount_pattern:
        return False
    banknote_words = (
        r"(?:banknote|banknotes|bill|note|currency\s+note|paper\s+money|"
        r"polymer\s+note|denomination|face\s+value|tiền\s+giấy|"
        r"tờ\s+tiền|tờ|mệnh\s+giá|đồng\s+tiền)"
    )
    currency_words = (
        r"(?:vnd|usd|eur|jpy|gbp|krw|thb|idr|mmk|khr|lak|myr|cny|cad|aud|nzd|"
        r"dollar|dollars|euro|euros|yen|yên|pound|pounds|sterling|won|baht|"
        r"dong|đồng|rupiah|kyat|kyats|riel|riels|kip|kips|ringgit|ringgits|peso|pesos)?"
    )
    symbols = r"[$€¥£₩฿₫]?"
    descriptors = r"(?:[\w-]+\s+){0,6}"
    return bool(
        re.search(
            rf"{symbols}\s*{amount_pattern}\s*{currency_words}\s*{descriptors}{banknote_words}",
            context,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{banknote_words}\s*(?:of|mệnh\s+giá|:)?\s*{descriptors}{symbols}\s*{amount_pattern}\s*{currency_words}",
            context,
            flags=re.IGNORECASE,
        )
        or re.search(
            rf"{currency_words}\s*{amount_pattern}\s*{descriptors}{banknote_words}",
            context,
            flags=re.IGNORECASE,
        )
    )


def _infer_country_from_currency(currency: Optional[str], context: str) -> Tuple[str, Optional[str]]:
    if not currency:
        return "Không xác định", None
    if not _has_banknote_context(context) or _has_negative_money_context(context):
        return "Không xác định", None

    code = currency.upper()
    lower = str(context or "").lower()

    if code == "USD":
        has_us_country_evidence = any(
            _contains_term(lower, kw)
            for kw in (
                "united states", "usa", "u.s.", "us dollar", "u.s. dollar",
                "đôla mỹ", "đô la mỹ", "federal reserve", "american",
                "$1", "one dollar", "1 dollar", "$1 banknote", "$1 bill",
            )
        )
        if not has_us_country_evidence:
            return "Không xác định", "USD"

    if code == "EUR":
        has_eur_country_evidence = any(
            _contains_term(lower, kw)
            for kw in (
                "european union", "eurozone", "euro zone", "bce", "ecb",
                "banque de france", "bundesbank",
            )
        )
        if not has_eur_country_evidence:
            return "Không xác định", "EUR"

    return CURRENCY_DEFAULT_COUNTRY.get(code, "Không xác định"), code


def _clean_number(value: str) -> Optional[int]:
    token = str(value or "").strip().replace("\u00A0", "").replace("\u202F", "").replace(" ", "")
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


def _fold_amount_marker_text(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").casefold())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return text.replace("đ", "d").replace("Đ", "d")


def _has_price_sale_amount_context(text: str, start: int, end: int) -> bool:
    prefix = _fold_amount_marker_text(text[max(0, start - 64):start])
    suffix = _fold_amount_marker_text(text[end:min(len(text), end + 32)])
    window = _fold_amount_marker_text(text[max(0, start - 80):min(len(text), end + 80)])

    if re.search(
        r"(?:price|gia\s+ban|gia\s+chi|gia\s+tu|gia\s+tri|gia|tri\s+gia|dinh\s+gia|"
        r"worth|valued\s+at|valuation|sold\s+for|paid|payment|purchase\s+price|"
        r"selling\s+price|buy|sell|mua|nguoi\s+mua|co\s+nguoi\s+mua|ban|rao\s+ban|"
        r"auction|sale|for\s+sale|discount|cost|tra)\s*(?:is|la|:|voi)?\s*$",
        prefix,
    ):
        return True

    if not re.match(r"\s*(?:cu|trieu|million)\b", suffix):
        return False
    return any(
        marker in window
        for marker in (
            "price", "gia", "gia ban", "gia tri", "tri gia", "dinh gia",
            "worth", "valuation", "sold for", "paid", "payment",
            "buy", "sell", "mua", "nguoi mua", "co nguoi mua",
            "ban", "rao ban", "auction", "sale", "for sale", "cost", "tra",
        )
    )


def _extract_amounts(text: str, currency: Optional[str] = None) -> List[int]:
    text = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", text, flags=re.IGNORECASE)
    found = []

    # Shorthand Vietnamese banknote denomination extraction (e.g. 100k, 100 nghìn, 100 ngàn)
    shorthand_matches = list(re.finditer(r"\b(?P<num>\d{1,4})\s*(?P<unit>k|nghìn|nghin|ngàn|ngan)\b", text, flags=re.IGNORECASE))
    for m in shorthand_matches:
        try:
            n_val = int(m.group("num")) * 1000
            local_context = text[max(0, m.start() - 48):m.end() + 48].lower()
            if re.search(r"\b(?:seri|serial|series|so seri|serial dep|seri dep)\b", local_context):
                continue
            if _has_price_sale_amount_context(text, m.start(), m.end()):
                continue
            if n_val in (1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000):
                if n_val not in found:
                    found.append(n_val)
        except (TypeError, ValueError):
            pass

    pattern = r"\b\d{1,3}(?:[\u00A0\u202F ]\d{3})+(?!\d)|\b\d{1,3}(?:[.,]\d{2,3})+(?!\d)|\b\d{1,7}\b"
    matches = list(re.finditer(pattern, text))
    for match_index, match in enumerate(matches):
        raw = match.group(0)
        n = _clean_number(raw)
        if n is None:
            continue

        local_context = text[max(0, match.start() - 48):match.end() + 48].lower()
        direct_context = _has_direct_banknote_amount_context(local_context, n)
        number_prefix = text[max(0, match.start() - 4):match.start()].lower()
        number_suffix = text[match.end():match.end() + 24].lower()
        if re.match(r"^\s*k(?!\w)", number_suffix, flags=re.IGNORECASE) or number_suffix.lstrip().startswith(("nghìn", "ngàn")):
            continue

        looks_like_percent = bool(
            number_suffix.lstrip().startswith("%")
            or re.match(r"\s*(?:percent|percentage|phan\s+tram)\b", number_suffix)
        )
        has_prior_non_year_amount = any(
            prior is not None and not 1800 <= prior <= 2100
            for prior in (
                _clean_number(previous.group(0))
                for previous in matches[:match_index]
            )
        )
        is_symbol_or_currency_bound = bool(
            re.search(rf"[$€£¥₩฿₫]\s*{re.escape(raw)}\b", text)
            or re.search(rf"\b{re.escape(raw)}\s*(?:usd|vnd|vnđ|eur|jpy|gbp|cny|thb|idr|khr|lak|mmk|myr|sgd|aud|cad|dong|đồng|dollars?)\b", text, re.IGNORECASE)
            or re.search(rf"\b(?:usd|vnd|vnđ|eur|jpy|gbp|cny|thb|idr|khr|lak|mmk|myr|sgd|aud|cad|dong|đồng|dollars?)\s*{re.escape(raw)}\b", text, re.IGNORECASE)
        )
        looks_like_year = (
            1800 <= n <= 2100
            and not is_symbol_or_currency_bound
            and (
                (
                    not direct_context
                    and any(marker in local_context for marker in ("year", "issued", "issue date", "năm", "phát hành"))
                )
                or has_prior_non_year_amount
                or re.search(
                    rf"(?<!\d){re.escape(raw)}(?!\d)\s*(?:star|unc|series|edition|frn|federal reserve note)",
                    local_context,
                )
                or re.search(
                    rf"(?:series|star)\s*{re.escape(raw)}\b",
                    local_context,
                )
            )
        )
        looks_like_price = _has_price_sale_amount_context(text, match.start(), match.end()) or (
            not direct_context
            and any(
                marker in local_context
                for marker in (
                    "price", "shop", "buy", "sell", "sold for", "auction",
                    "ebay", "marketplace", "collector", "collector price",
                    "birthday note", "giá bán",
                )
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
        looks_like_catalog = not direct_context and any(
            marker in local_context
            for marker in ("catalog", "catalogue", "mã catalog", "ma catalog")
        )
        looks_like_catalog_id = bool(re.search(r"(?:p[.-]|sp|#|\bno\.?|\bnum\.?|\blot\s*#?)\s*$", number_prefix, re.IGNORECASE))
        looks_like_quantity = bool(
            re.match(r"\s*(?:pieces?|pcs|brick|bundle|lots?|quantity|qty)\b", number_suffix)
        )
        looks_like_serial = bool(
            not direct_context
            and re.search(r"\b(?:seri|serial|series|so seri|serial dep|seri dep)\b", local_context)
        )
        looks_like_grade = bool(
            not direct_context
            and (
                re.search(rf"(?:pmg|pcgs|grade)\s*{re.escape(raw)}\b", local_context)
                or re.search(rf"\b{re.escape(raw)}\s*(?:epq|unc|au|ef|vf|xf)\b", local_context)
            )
        )
        if (
            looks_like_percent
            or looks_like_year
            or looks_like_price
            or looks_like_exchange
            or looks_like_catalog
            or looks_like_catalog_id
            or looks_like_quantity
            or looks_like_serial
            or looks_like_grade
        ):
            continue

        if currency:
            allowed = ALLOWED_DENOMINATIONS.get(currency)
            if allowed is not None and n not in allowed:
                continue
            if allowed is None and not (
                re.fullmatch(r"[A-Z]{3}", str(currency).upper())
                and 0 < n <= 10_000_000
            ):
                continue
            # Even with known currency, very small numbers (≤10) are highly ambiguous
            # (ordinal, count, index) and must have direct banknote phrasing to be accepted.
            if n <= 10 and not direct_context and not is_symbol_or_currency_bound:
                continue
        else:
            if not any(n in allowed for allowed in ALLOWED_DENOMINATIONS.values()):
                continue
            # Without any currency context, ambiguous small numbers (not exclusively
            # large VND denominations) must have direct banknote phrasing to be accepted.
            # This prevents ordinal/count words like "2 lần", "thứ 18", "năm 2020"
            # from being misidentified as denomination.
            vnd_only_values = ALLOWED_DENOMINATIONS.get("VND", set()) - set().union(
                *(v for k, v in ALLOWED_DENOMINATIONS.items() if k != "VND")
            )
            if n not in vnd_only_values and not direct_context and not is_symbol_or_currency_bound:
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
    foreign_dollar_context = _has_foreign_dollar_context(text)
    explicit_vnd_context = _has_explicit_vnd_context(text)

    if explicit_vnd_context:
        return "VND"

    iso_code = _extract_iso_currency_code(text)
    if iso_code:
        return iso_code

    for alias in (
        "usd", "us dollar", "u.s. dollar", "đôla mỹ", "đô la mỹ",
    ):
        if _contains_term(lower, alias):
            return "USD"

    if not foreign_dollar_context and any(
        _contains_term(lower, alias)
        for alias in ("dollar", "dollars", "đôla", "đô la", "$")
    ):
        return "USD"

    for alias, code in CURRENCY_ALIASES.items():
        if code == "USD" and foreign_dollar_context and alias in {
            "dollar", "dollars", "đôla", "đô la", "$",
        }:
            continue
        if code == "VND" and alias in {"đồng", "dong", "đ"} and not explicit_vnd_context:
            continue
        if _contains_term(lower, alias):
            return code

    return None


def _extract_country_currency(
    text: str,
    preferred_currency: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    lower = text.lower()
    preferred_currency = str(preferred_currency or "").upper() or None
    open_country = _extract_open_country_phrase(text)
    foreign_dollar_context = _has_foreign_dollar_context(text)
    explicit_vnd_context = _has_explicit_vnd_context(text)

    if open_country:
        return open_country, preferred_currency

    for key in (
        "đôla mỹ", "đô la mỹ", "one dollar", "one dollar bill",
        "us dollar", "u.s. dollar", "united states", "usa",
    ):
        if (
            preferred_currency in {None, "USD"}
            and _contains_term(lower, key)
        ):
            return "United States", "USD"

    if preferred_currency:
        for key, (country, currency) in COUNTRY_CURRENCY.items():
            if key in {"usd", "dollar", "dollars", "đôla", "đô la", "$", "us"}:
                continue
            if currency == preferred_currency and _contains_term(lower, key):
                return country, currency
        return "Không xác định", preferred_currency

    for key, (country, currency) in COUNTRY_CURRENCY.items():
        if currency == "USD" and key in {
            "usd", "đôla", "đô la", "dollar", "dollars", "$",
        }:
            continue
        if key in {"đồng", "dong"} and not explicit_vnd_context:
            continue
        if _contains_term(lower, key):
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
    identity_text = _identity_text(item)
    text = _context_text(item)
    primary_identity_text = (
        f"{item.get('title', '')} {item.get('snippet', '')}"
    )
    page_identity_text = str(item.get("page_text_excerpt") or "")
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

    currency = (
        _extract_currency(primary_identity_text)
        or _extract_currency(page_identity_text)
    )
    if currency:
        score += 2.5
        reasons.append(f"currency:{currency}")

    country, expected_currency = _extract_country_currency(
        primary_identity_text,
        preferred_currency=currency,
    )
    if country == "Không xác định":
        country, expected_currency = _extract_country_currency(
            page_identity_text,
            preferred_currency=currency,
        )
    if country == "Không xác định" and not currency:
        country, expected_currency = _extract_country_currency(primary_identity_text)
    if country == "Không xác định" and not currency:
        country, expected_currency = _extract_country_currency(page_identity_text)
    if country == "Không xác định":
        country, expected_currency = _infer_country_from_currency(
            currency or expected_currency,
            identity_text,
        )
    if country != "Không xác định":
        score += 2.0
        reasons.append(f"country:{country}")

    # Amount identity classification
    currency = currency or expected_currency
    raw_title = str(item.get("title") or "")
    raw_snippet = str(item.get("snippet") or "")
    
    title_amounts = _extract_amounts(raw_title, currency=currency)
    snippet_amounts = _extract_amounts(raw_snippet, currency=currency)
    all_amounts = _extract_amounts(text, currency=currency)
    
    primary_denomination = None
    denomination_ambiguous = False
    denomination_conflict_reason = None
    
    # Filter out empty or None from lists
    title_amounts = list(dict.fromkeys(a for a in title_amounts if a is not None))
    snippet_amounts = list(dict.fromkeys(a for a in snippet_amounts if a is not None))
    all_amounts = list(dict.fromkeys(a for a in all_amounts if a is not None))
    
    if len(title_amounts) == 1:
        primary_denomination = title_amounts[0]
    elif len(title_amounts) > 1:
        denomination_ambiguous = True
        denomination_conflict_reason = "multiple_denominations_in_title"
    elif len(title_amounts) == 0:
        if len(snippet_amounts) == 1:
            primary_denomination = snippet_amounts[0]
        elif len(snippet_amounts) > 1:
            denomination_ambiguous = True
            denomination_conflict_reason = "multiple_denominations_in_snippet"

    item["primary_denomination"] = primary_denomination
    item["mentioned_denominations"] = all_amounts
    item["denomination_ambiguous"] = denomination_ambiguous
    item["denomination_conflict_reason"] = denomination_conflict_reason

    amounts = title_amounts or snippet_amounts
    if amounts:
        score += 1.8
        reasons.append(f"amount:{amounts[0]}")
        if any(_has_direct_banknote_amount_context(identity_text, amount) for amount in amounts):
            score += 0.5
            reasons.append("direct_banknote_amount_context")
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


def canonicalize_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        return ""
    raw = raw.split("#")[0]

    parsed = urllib.parse.urlparse(raw)
    scheme = (parsed.scheme or "https").lower()
    netloc = (parsed.netloc or "").lower()

    if ":" in netloc:
        host, port = netloc.split(":", 1)
        if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
            netloc = host

    for prefix in ("www.", "m.", "mobile."):
        if netloc.startswith(prefix):
            netloc = netloc[len(prefix):]
            break

    path = parsed.path or ""
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]

    tracking_params = {
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "fbclid", "gclid", "spm", "ref", "_hsenc", "_hsmi", "mc_cid", "mc_eid",
        "igshid", "cmpid", "mkevt", "mkcid", "mkrid", "campid", "toolid", "customid",
    }

    query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=False)
    filtered_query = [
        (k, v) for k, v in query_params
        if k.lower() not in tracking_params and not k.lower().startswith("utm_")
    ]

    filtered_query.sort(key=lambda x: (x[0], x[1]))
    new_query = urllib.parse.urlencode(filtered_query) if filtered_query else ""

    result = f"{scheme}://{netloc}{path}"
    if new_query:
        result += f"?{new_query}"

    return result


# Minimal known-SLD table for ccTLDs that have a mandatory second-level label
# (e.g. .co.uk, .com.au, .co.jp).  We do NOT hardcode any specific domain name
# here — only the second-level pattern that belongs to the public registry itself.
# Extend this list if new ccTLDs are encountered; do NOT add registrable-domain
# names (like "ebay.co.uk" or "bbc.co.uk").
_KNOWN_SECOND_LEVEL_TLDS: frozenset = frozenset({
    # United Kingdom
    "co.uk", "org.uk", "me.uk", "net.uk", "ltd.uk", "plc.uk", "gov.uk", "ac.uk",
    # Australia
    "com.au", "net.au", "org.au", "gov.au", "edu.au", "id.au",
    # Japan
    "co.jp", "ne.jp", "or.jp", "go.jp", "ac.jp", "ed.jp",
    # New Zealand
    "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
    # South Africa
    "co.za", "org.za", "gov.za",
    # Brazil
    "com.br", "net.br", "org.br", "gov.br",
    # China
    "com.cn", "net.cn", "org.cn", "gov.cn",
    # India
    "co.in", "net.in", "org.in", "gov.in",
    # Vietnam (single-segment TLD already, but list for completeness)
    "com.vn", "net.vn", "org.vn", "gov.vn",
    # Korea
    "co.kr", "or.kr", "go.kr", "ne.kr",
    # Singapore
    "com.sg", "net.sg", "org.sg", "gov.sg", "edu.sg",
    # Malaysia
    "com.my", "net.my", "org.my", "gov.my",
    # Indonesia
    "co.id", "net.id", "or.id", "go.id", "ac.id",
    # Philippines
    "com.ph", "net.ph", "org.ph", "gov.ph",
    # Thailand
    "co.th", "net.th", "or.th", "go.th", "ac.th",
    # Hong Kong
    "com.hk", "net.hk", "org.hk", "gov.hk",
    # Taiwan
    "com.tw", "net.tw", "org.tw", "gov.tw",
    # Argentina
    "com.ar", "net.ar", "org.ar", "gov.ar",
    # Mexico
    "com.mx", "net.mx", "org.mx", "gob.mx",
    # Spain (also has .es but some use .com.es)
    "com.es",
})


def get_canonical_domain(url_or_domain: str) -> str:
    """Return the registrable domain (eTLD+1) without subdomain.

    Uses a minimal known-SLD table for multi-level ccTLDs (e.g. .co.uk,
    .com.au) so that news.example.co.uk -> example.co.uk.
    For unrecognised TLDs we fall back to the last two labels, which is
    correct for simple TLDs like .com, .vn, .org, .net.
    We do NOT hardcode any specific registrable domain name; only the
    public-registry second-level patterns are in _KNOWN_SECOND_LEVEL_TLDS.
    """
    raw = str(url_or_domain or "").strip().lower()
    if not raw:
        return "unknown"
    if "://" in raw:
        raw = raw.split("://", 1)[1]
    # Strip path, query, fragment, port
    raw = raw.split("/")[0].split("?")[0].split("#")[0].split(":")[0]

    if not raw:
        return "unknown"

    labels = raw.split(".")
    # Need at least 2 labels to form a domain
    if len(labels) < 2:
        return raw or "unknown"

    # Check if the last two labels form a known second-level TLD
    # e.g. labels = ["news", "example", "co", "uk"]  ->  sld2 = "co.uk"
    if len(labels) >= 3:
        sld2 = ".".join(labels[-2:])
        if sld2 in _KNOWN_SECOND_LEVEL_TLDS:
            # registrable = labels[-3] + "." + sld2
            return ".".join(labels[-3:])

    # Fallback: last two labels (works for .com, .vn, .org, etc.)
    return ".".join(labels[-2:])


def classify_source(item: Dict[str, Any]) -> Dict[str, Any]:
    url = str(item.get("url") or item.get("link") or "").strip()
    domain_input = str(item.get("canonical_domain") or item.get("domain") or item.get("source") or "").strip()
    title = str(item.get("title") or "").strip()
    snippet = str(item.get("snippet") or "").strip()
    text = f"{domain_input} {title} {snippet} {url}".strip()
    lower_text = text.lower()

    canon_url = canonicalize_url(url) if url else ""
    canon_domain = str(item.get("canonical_domain") or "").strip().lower()
    if not canon_domain:
        canon_domain = get_canonical_domain(url) if url else get_canonical_domain(domain_input)

    annotated = str(item.get("source_trust_level") or "").upper().strip()
    annotated_class = str(item.get("source_class") or "").upper().strip()
    is_commercial_keyword = any(
        kw in lower_text for kw in (
            "stock photo", "stock image", "royalty-free", "giá bán", "gia ban",
            "sold for", "price", "auction", "buy now", "listing", "for sale",
            "đấu giá", "dau gia", "chợ", "cuahang", "cửa hàng"
        )
    )
    if annotated == "NEUTRAL" and is_commercial_keyword:
        annotated = "WEAK_COMMERCIAL"

    known = {
        "TRUSTED",
        "STRONG_NEUTRAL",
        "ESTABLISHED_CATALOG",
        "NEUTRAL",
        "WEAK_COMMERCIAL",
        "NOISE",
        "SOCIAL",
        "UNREADABLE",
        "UNKNOWN",
    }
    if annotated in known or annotated_class in known:
        source_class = annotated_class if annotated_class in known else annotated
        source_trust_level = source_class
        if source_class in {"STRONG_NEUTRAL", "ESTABLISHED_CATALOG"}:
            source_trust_level = "NEUTRAL"
        elif source_class == "UNKNOWN":
            source_trust_level = "UNKNOWN"
        is_commercial = (source_trust_level == "WEAK_COMMERCIAL")
        is_social = (source_trust_level == "SOCIAL")
        is_noise = (source_trust_level in ("NOISE", "UNREADABLE"))
        is_accessible = not is_noise
        return {
            "source_trust_level": source_trust_level,
            "source_class": source_class,
            "is_independent": True,
            "is_commercial": is_commercial,
            "is_social": is_social,
            "is_noise": is_noise,
            "is_accessible": is_accessible,
            "canonical_domain": canon_domain,
            "canonical_url": canon_url,
        }

    is_conversion = any(
        kw in lower_text
        for kw in (
            "sang vnd", "sang đồng việt nam", "sang vnđ", "đổi sang",
            "exchange rate", "tỷ giá", "ty gia", "converter", "forex", "1 cad =", "5000 cad",
        )
    )

    is_social_login = any(
        kw in lower_text
        for kw in (
            "log in or sign up to view", "see posts, photos and more on facebook",
            "create an account or log in to instagram",
        )
    ) or (title.strip().lower() in ("instagram", "facebook", "login", "log in") and len(snippet.strip()) < 10)

    is_empty_or_unreadable = not text or len(text) < 5 or is_social_login

    is_social_domain = any(
        sd in canon_domain
        for sd in ("facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com", "pinterest.com")
    )

    government_markers = (".gov.", ".gouv.", ".gob.", ".go.")
    is_government_domain = (
        canon_domain.endswith(".gov")
        or canon_domain.endswith(".gov.vn")
        or canon_domain.endswith(".gov.sg")
        or canon_domain.endswith(".gov.uk")
        or any(marker in canon_domain for marker in government_markers)
    )
    central_bank_domains = {
        "centralbank.gov", "sbv.gov.vn", "mas.gov.sg",
    }
    government_news_domains = {
        "nhandan.vn", "vietnamplus.vn", "chinhphu.vn", "baochinhphu.vn",
    }
    established_news_domains = {
        "dantri.com.vn", "vnexpress.net", "tuoitre.vn", "thanhnien.vn",
        "vietnamnet.vn", "laodong.vn", "cafef.vn", "reuters.com", "apnews.com",
        "bbc.com", "cnn.com",
    }
    established_catalog_domains = {
        "banknoteworld.com", "colnect.com", "pmgnotes.com", "banknote.ws",
        "numista.com", "art-hanoi.com", "worldbanknotescoins.com",
        "banknoteindex.com",
    }
    trusted_catalog_domains = {
        "banknoteworld.com", "colnect.com", "pmgnotes.com", "banknote.ws",
        "numista.com",
    }
    catalog_text_markers = (
        "banknote catalog", "banknote catalogue", "paper money catalog",
        "paper money catalogue", "world banknotes", "polymer banknote",
        "pick number", "pmg", "colnect", "numista",
    )
    is_central_bank_domain = canon_domain in central_bank_domains or any(canon_domain.endswith("." + td) for td in central_bank_domains)
    is_government_news_domain = canon_domain in government_news_domains or any(canon_domain.endswith("." + td) for td in government_news_domains)
    is_established_news_domain = canon_domain in established_news_domains or any(canon_domain.endswith("." + td) for td in established_news_domains)
    is_established_catalog_domain = canon_domain in established_catalog_domains or any(canon_domain.endswith("." + td) for td in established_catalog_domains)
    is_trusted_catalog_domain = canon_domain in trusted_catalog_domains or any(canon_domain.endswith("." + td) for td in trusted_catalog_domains)
    is_established_catalog_text = (
        any(marker in lower_text for marker in catalog_text_markers)
        and any(marker in lower_text for marker in ("banknote", "banknotes", "paper money", "polymer", "note"))
    )
    is_trusted_domain = is_government_domain or is_central_bank_domain

    is_commercial_domain = any(
        cd in canon_domain
        for cd in ("ebay.com", "shopee.vn", "lazada.vn", "quatangsuutam", "seridep", "shop", "store", "marketplace")
    ) or (not is_trusted_domain and any(
        kw in lower_text for kw in (
            "giá bán", "gia ban", "sold for", "price", "auction", "buy now",
            "listing", "for sale", "đấu giá", "dau gia", "chợ", "cuahang", "cửa hàng",
            "sưu tầm", "suu tam", "seridep", "thất quý", "that quy"
        )
    ))

    if is_conversion:
        source_trust_level = "NOISE"
        source_class = "NOISE"
        is_noise = True
        is_social = is_social_domain
        is_commercial = False
        is_accessible = True
    elif is_empty_or_unreadable:
        source_trust_level = "UNREADABLE" if not is_social_domain else "SOCIAL"
        source_class = source_trust_level
        is_noise = True
        is_social = is_social_domain
        is_commercial = False
        is_accessible = False
    elif is_social_domain:
        source_trust_level = "SOCIAL"
        source_class = "SOCIAL"
        is_noise = False
        is_social = True
        is_commercial = False
        is_accessible = True
    elif is_commercial_domain:
        source_trust_level = "WEAK_COMMERCIAL"
        source_class = "WEAK_COMMERCIAL"
        is_noise = False
        is_social = False
        is_commercial = True
        is_accessible = True
    elif is_trusted_catalog_domain:
        source_trust_level = "TRUSTED"
        source_class = "ESTABLISHED_CATALOG"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True
    elif is_trusted_domain:
        source_trust_level = "TRUSTED"
        source_class = "TRUSTED"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True
    elif is_government_news_domain:
        source_trust_level = "NEUTRAL"
        source_class = "STRONG_NEUTRAL"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True
    elif is_established_catalog_domain or is_established_catalog_text:
        source_trust_level = "NEUTRAL"
        source_class = "ESTABLISHED_CATALOG"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True
    elif is_established_news_domain:
        source_trust_level = "NEUTRAL"
        source_class = "NEUTRAL"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True
    else:
        source_trust_level = "NEUTRAL"
        source_class = "NEUTRAL"
        is_noise = False
        is_social = False
        is_commercial = False
        is_accessible = True

    return {
        "source_trust_level": source_trust_level,
        "source_class": source_class,
        "is_independent": True,
        "is_commercial": is_commercial,
        "is_social": is_social,
        "is_noise": is_noise,
        "is_accessible": is_accessible,
        "canonical_domain": canon_domain,
        "canonical_url": canon_url,
    }


def classify_content_identity_quality(text_or_item: Any) -> str:
    if isinstance(text_or_item, dict):
        title = str(text_or_item.get("title") or "")
        snippet = str(text_or_item.get("snippet") or "")
        page_text = " ".join(
            str(text_or_item.get(key) or "")
            for key in (
                "page_text_excerpt",
                "web_page_text_excerpt",
                "page_text",
                "web_page_text",
            )
        ).strip()
        primary_text = f"{title} {snippet}".strip()
        text = f"{primary_text} {page_text}".strip()
    else:
        page_text = ""
        primary_text = ""
        text = str(text_or_item or "").strip()

    lower = text.lower()
    if not text or len(text) < 5 or lower in ("instagram", "facebook", "login"):
        return "UNREADABLE"

    if any(
        kw in lower
        for kw in (
            "sang vnd", "sang đồng việt nam", "tỷ giá", "ty gia", "exchange rate",
            "1 cad =", "5000 cad", "forex", "converter",
        )
    ):
        return "NOISE"

    country, currency = _extract_country_currency(text)
    amounts = _extract_amounts(text, currency)
    has_banknote = _has_banknote_context(text)

    has_country = bool(country and country != "Không xác định")
    has_currency = currency is not None
    has_amount = len(amounts) > 0

    if has_country and has_currency and has_amount and has_banknote:
        if page_text:
            primary_country, primary_currency = _extract_country_currency(primary_text)
            primary_amounts = _extract_amounts(primary_text, primary_currency)
            primary_has_complete = bool(
                primary_country
                and primary_country != "Không xác định"
                and primary_currency is not None
                and primary_amounts
                and _has_banknote_context(primary_text)
            )
            if not primary_has_complete:
                return "PAGE_TEXT_COMPLETE"
        return "COMPLETE_EXACT"
    elif (has_currency or has_amount or has_country) and has_banknote:
        return "PARTIAL_IDENTITY"
    elif has_banknote:
        return "CONTEXT_ONLY"
    else:
        return "NOISE"


def deduplicate_and_count_evidence(ranked_evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
    raw_count = len(ranked_evidence)

    initial_lens_result_count = sum(1 for item in ranked_evidence if item.get("evidence_type") != "candidate_verification")
    targeted_search_result_count = sum(1 for item in ranked_evidence if item.get("evidence_type") == "candidate_verification")
    total_raw_evidence_count = initial_lens_result_count + targeted_search_result_count

    seen_urls = set()
    unique_url_items = []
    duplicate_url_count = 0

    for item in ranked_evidence:
        url = item.get("canonical_url") or canonicalize_url(item.get("url") or item.get("link") or "")
        if not url or url in seen_urls:
            duplicate_url_count += 1
            item["is_duplicate_url"] = True
        else:
            seen_urls.add(url)
            item["is_duplicate_url"] = False
            unique_url_items.append(item)

    domain_groups = {}
    duplicate_domain_count = 0

    for item in unique_url_items:
        domain = item.get("canonical_domain") or get_canonical_domain(item.get("url") or item.get("source") or "")
        if domain not in domain_groups:
            domain_groups[domain] = []
            item["domain_first"] = True
        else:
            duplicate_domain_count += 1
            item["domain_first"] = False
        domain_groups[domain].append(item)

    # Identity-only tokens that are too generic to prove copy-paste.
    # If two texts differ only in these tokens they share the same *identity*
    # but are NOT mirrors of each other.
    _IDENTITY_ONLY_TOKENS: frozenset = frozenset({
        "vietnam", "viet", "nam", "dong", "vnd", "vnđ",
        "myanmar", "kyat", "kyats", "mmk",
        "thailand", "baht", "thb",
        "cambodia", "riel", "khr",
        "laos", "kip", "lak",
        "malaysia", "ringgit", "myr",
        "singapore", "sgd",
        "indonesia", "rupiah", "idr",
        "philippines", "peso", "php",
        "banknote", "note", "bill", "currency",
        "central", "bank", "paper", "money",
        "500", "1000", "2000", "5000", "10000", "20000", "50000", "100000",
        "200", "100", "50", "20", "10", "5", "1",
        "unc", "2020", "2019", "2018", "2017", "2016", "2015", "1991",
    })

    domain_first_items = [it for it in unique_url_items if it.get("domain_first")]
    mirror_content_count = 0
    # Each entry: (tokens_set, group_id, canonical_domain)
    seen_fingerprints: List[tuple] = []
    mirror_group_counter = 0

    # Mirror detection requires:
    # - total token count >= 8 (short titles like "Vietnam 5000 Dong note" have <8 tokens)
    # - at least MIN_DISTINCTIVE_OVERLAP tokens that are NOT in _IDENTITY_ONLY_TOKENS
    #   (so two items sharing only country/currency/denomination are NOT mirrors)
    # - Jaccard similarity >= 0.85
    _MIN_TOTAL_TOKENS = 8
    _MIN_DISTINCTIVE_OVERLAP = 5

    for item in domain_first_items:
        title = item.get("title") or ""
        snippet = item.get("snippet") or ""
        text = f"{title} {snippet}".strip().lower()
        tokens = set(re.findall(r"\w+", text))
        distinctive = tokens - _IDENTITY_ONLY_TOKENS

        is_mirror = False
        mirror_similarity = 0.0
        mirror_group_id = None
        mirror_reason = ""

        if len(tokens) >= _MIN_TOTAL_TOKENS:
            for (prev_tokens, prev_group_id, prev_domain) in seen_fingerprints:
                union = tokens.union(prev_tokens)
                intersection = tokens.intersection(prev_tokens)
                jaccard = len(intersection) / len(union) if union else 0.0
                prev_distinctive = prev_tokens - _IDENTITY_ONLY_TOKENS
                distinctive_overlap = distinctive.intersection(prev_distinctive)

                if jaccard >= 0.85 and len(distinctive_overlap) >= _MIN_DISTINCTIVE_OVERLAP:
                    is_mirror = True
                    mirror_similarity = round(jaccard, 4)
                    mirror_group_id = prev_group_id
                    mirror_reason = (
                        f"jaccard={mirror_similarity:.2f}, "
                        f"distinctive_overlap={len(distinctive_overlap)}, "
                        f"same_as_domain={prev_domain}"
                    )
                    break

        if is_mirror:
            mirror_content_count += 1
            item["is_mirror"] = True
            item["mirror_similarity"] = mirror_similarity
            item["mirror_group_id"] = mirror_group_id
            item["mirror_reason"] = mirror_reason
        else:
            item["is_mirror"] = False
            item["mirror_similarity"] = None
            item["mirror_group_id"] = None
            item["mirror_reason"] = None
            if len(tokens) >= _MIN_TOTAL_TOKENS:
                mirror_group_counter += 1
                seen_fingerprints.append((tokens, mirror_group_counter, item.get("canonical_domain", "")))

    usable_evidence_count = 0
    independent_source_count = 0
    trusted_source_count = 0
    neutral_source_count = 0
    weak_commercial_source_count = 0
    social_source_count = 0
    noise_source_count = 0
    unreadable_source_count = 0
    complete_exact_support_count = 0
    partial_identity_count = 0

    for item in ranked_evidence:
        s_trust = item.get("source_trust_level") or classify_source(item)["source_trust_level"]
        quality = item.get("content_identity_quality") or classify_content_identity_quality(item)

        if s_trust == "TRUSTED":
            trusted_source_count += 1
        elif s_trust == "NEUTRAL":
            neutral_source_count += 1
        elif s_trust == "WEAK_COMMERCIAL":
            weak_commercial_source_count += 1
        elif s_trust == "SOCIAL":
            social_source_count += 1
        elif s_trust == "NOISE":
            noise_source_count += 1
        elif s_trust == "UNREADABLE":
            unreadable_source_count += 1

        if item.get("is_accessible", True) and s_trust != "NOISE":
            usable_evidence_count += 1

        if quality == "COMPLETE_EXACT" and s_trust != "NOISE":
            complete_exact_support_count += 1
        elif quality == "PARTIAL_IDENTITY":
            partial_identity_count += 1

        if (
            not item.get("is_duplicate_url")
            and item.get("domain_first")
            and not item.get("is_mirror")
            and s_trust in ("TRUSTED", "NEUTRAL", "WEAK_COMMERCIAL")
        ):
            independent_source_count += 1
            item["is_independent"] = True
        else:
            item["is_independent"] = False

    return {
        "raw_evidence_count": raw_count,
        "initial_lens_result_count": initial_lens_result_count,
        "targeted_search_result_count": targeted_search_result_count,
        "total_raw_evidence_count": total_raw_evidence_count,
        "usable_evidence_count": usable_evidence_count,
        "unique_url_count": len(seen_urls),
        "unique_domain_count": len(domain_groups),
        "independent_source_count": independent_source_count,
        "trusted_source_count": trusted_source_count,
        "neutral_source_count": neutral_source_count,
        "weak_commercial_source_count": weak_commercial_source_count,
        "social_source_count": social_source_count,
        "noise_source_count": noise_source_count,
        "unreadable_source_count": unreadable_source_count,
        "duplicate_url_count": duplicate_url_count,
        "duplicate_domain_count": duplicate_domain_count,
        "mirror_content_count": mirror_content_count,
        "complete_exact_support_count": complete_exact_support_count,
        "partial_identity_count": partial_identity_count,
    }


def rank_lens_evidence(evidence: List[Dict[str, Any]], context: str = "") -> List[Dict[str, Any]]:
    ranked = [_score_item(item, context=context) for item in evidence]
    ranked.sort(key=lambda item: item.get("score", 0.0), reverse=True)
    for index, item in enumerate(ranked, start=1):
        item["rank"] = index
        s_class = classify_source(item)
        item.update(s_class)
        item["content_identity_quality"] = classify_content_identity_quality(item)
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
        "ma_tien_te": currency or "Không xác định",
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
