import re
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
    "thb": "THB",
    "฿": "THB",
    "kip": "LAK",
    "lak": "LAK",
    "riel": "KHR",
    "khr": "KHR",
    "kyat": "MMK",
    "mmk": "MMK",
    "ringgit": "MYR",
    "myr": "MYR",
    "singapore dollar": "SGD",
    "sgd": "SGD",
    "rupiah": "IDR",
    "idr": "IDR",
    "peso": "PHP",
    "php": "PHP",
    "bnd": "BND",
    "usd": "USD",
    "us dollar": "USD",
    "u.s. dollar": "USD",
    "đôla mỹ": "USD",
    "đô la mỹ": "USD",
    "đôla": "USD",
    "đô la": "USD",
    "dollar": "USD",
    "dollars": "USD",
    "$": "USD",
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
    "catalog",
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
    "denomination",
    "face value",
    "note",
    "tờ",
    "tờ tiền",
    "tiền giấy",
    "mệnh giá",
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
    return bool(
        not has_other_currency_after_dong
        and re.search(r"(?<!\d)\d[\d.,\s]*\s+(?:đồng|dong)\b", lower)
        and any(marker in lower for marker in ("việt nam", "viet nam", "vietnam"))
    )


def _has_banknote_context(context: str) -> bool:
    return any(
        _contains_term(context, keyword)
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


def _infer_country_from_currency(currency: Optional[str], context: str) -> Tuple[str, Optional[str]]:
    if not currency:
        return "Không xác định", None
    if not _has_banknote_context(context) or _has_negative_money_context(context):
        return "Không xác định", None
    return CURRENCY_DEFAULT_COUNTRY.get(currency, "Không xác định"), currency


def _clean_number(value: str) -> Optional[int]:
    token = str(value or "").strip().replace(" ", "")
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


def _extract_amounts(text: str, currency: Optional[str] = None) -> List[int]:
    text = re.sub(r"(?<!\w)one\s+dollar(?!\w)", "1 dollar", text, flags=re.IGNORECASE)
    found = []

    pattern = r"\b\d{1,3}(?:[.,]\d{2,3}){1,3}\b|\b\d{1,7}\b"
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
        looks_like_year = (
            1800 <= n <= 2100
            and (
                (
                    not direct_context
                    and any(marker in local_context for marker in ("year", "issued", "issue date", "năm", "phát hành"))
                )
                or has_prior_non_year_amount
                or re.search(
                    rf"(?<!\d){re.escape(raw)}(?!\d)\s*(?:unc|series|edition)",
                    local_context,
                )
            )
        )
        looks_like_price = not direct_context and any(
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
        looks_like_catalog_id = bool(re.search(r"(?:p[.-]|sp)$", number_prefix))
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
        elif not any(n in allowed for allowed in ALLOWED_DENOMINATIONS.values()):
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
        "us dollar", "u.s. dollar",
    ):
        if (
            preferred_currency in {None, "USD"}
            and _contains_term(lower, key)
        ):
            return "United States", "USD"

    if preferred_currency in {None, "USD"} and not foreign_dollar_context and any(
        _contains_term(lower, key)
        for key in ("đôla", "đô la", "dollar", "dollars", "$")
    ):
        return "United States", "USD"

    if preferred_currency:
        for key, (country, currency) in COUNTRY_CURRENCY.items():
            if currency == preferred_currency and _contains_term(lower, key):
                return country, currency
        return "Không xác định", None

    for key, (country, currency) in COUNTRY_CURRENCY.items():
        if currency == "USD" and foreign_dollar_context and key in {
            "đôla", "đô la", "dollar", "dollars", "$",
        }:
            continue
        if currency == "VND" and key in {"đồng", "dong"} and not explicit_vnd_context:
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

    # Amount identity is intentionally limited to title/snippet. Numeric URL
    # slugs such as ar807268 or post111190 are metadata, not denominations.
    currency = currency or expected_currency
    amounts = _extract_amounts(identity_text, currency=currency)
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


def rank_lens_evidence(evidence: List[Dict[str, Any]], context: str = "") -> List[Dict[str, Any]]:
    ranked = [_score_item(item, context=context) for item in evidence]
    ranked.sort(key=lambda item: item.get("score", 0.0), reverse=True)
    for index, item in enumerate(ranked, start=1):
        item["rank"] = index
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
