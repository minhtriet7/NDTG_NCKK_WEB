import re
import unicodedata
from typing import Any, Dict, Optional

# Mapping to English country names
COUNTRY_MAPPING = {
    # Vietnam
    "việt nam": "Vietnam",
    "viet nam": "Vietnam",
    "vietnam": "Vietnam",
    "vn": "Vietnam",
    # Thailand
    "thái lan": "Thailand",
    "thai lan": "Thailand",
    "thailand": "Thailand",
    # Cambodia
    "campuchia": "Cambodia",
    "cambodia": "Cambodia",
    "khmer": "Cambodia",
    # Laos
    "lào": "Laos",
    "laos": "Laos",
    "lao": "Laos",
    # Myanmar
    "myanmar": "Myanmar",
    "burma": "Myanmar",
    "miến điện": "Myanmar",
    "mien dien": "Myanmar",
    # Malaysia
    "malaysia": "Malaysia",
    # Singapore
    "singapore": "Singapore",
    # Indonesia
    "indonesia": "Indonesia",
    # ── Major world currencies ────────────────────────────────────────────────
    # United States
    "hoa kỳ": "United States",
    "hoa ky": "United States",
    "mỹ": "United States",
    "my": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "usa": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "us": "United States",
    "america": "United States",
    "american": "United States",
    # Japan
    "nhật bản": "Japan",
    "nhat ban": "Japan",
    "nhật": "Japan",
    "japan": "Japan",
    # China
    "trung quốc": "China",
    "trung quoc": "China",
    "china": "China",
    "prc": "China",
    "people's republic of china": "China",
    # South Korea
    "hàn quốc": "South Korea",
    "han quoc": "South Korea",
    "south korea": "South Korea",
    "korea": "South Korea",
    "republic of korea": "South Korea",
    # United Kingdom
    "anh": "United Kingdom",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "great britain": "United Kingdom",
    "britain": "United Kingdom",
    "england": "United Kingdom",
    # European Union / Euro zone (generic)
    "europe": "Euro Zone",
    "chau au": "Euro Zone",
    "chÃ¢u Ã¢u": "Euro Zone",
    "chÃ¢u Ã‚u": "Euro Zone",
    "lien minh chau au": "Euro Zone",
    "liÃªn minh chÃ¢u Ã¢u": "Euro Zone",
    "liÃªn minh chÃ¢u Ã‚u": "Euro Zone",
    "khu vuc euro": "Euro Zone",
    "euro zone": "Euro Zone",
    "eurozone": "Euro Zone",
    "european union": "Euro Zone",
    "eu": "Euro Zone",
    # Euro-area member countries. These stay countries globally; they are
    # collapsed to Euro Zone only when currency_code is EUR.
    "austria": "Austria",
    "belgium": "Belgium",
    "bulgaria": "Bulgaria",
    "croatia": "Croatia",
    "cyprus": "Cyprus",
    "estonia": "Estonia",
    "finland": "Finland",
    "france": "France",
    "germany": "Germany",
    "deutschland": "Germany",
    "greece": "Greece",
    "ireland": "Ireland",
    "italy": "Italy",
    "latvia": "Latvia",
    "lithuania": "Lithuania",
    "luxembourg": "Luxembourg",
    "malta": "Malta",
    "netherlands": "Netherlands",
    "portugal": "Portugal",
    "slovakia": "Slovakia",
    "slovenia": "Slovenia",
    "spain": "Spain",
    # Australia
    "úc": "Australia",
    "uc": "Australia",
    "australia": "Australia",
    # Canada
    "canada": "Canada",
    "canadian": "Canada",
    # Switzerland
    "thụy sĩ": "Switzerland",
    "thuy si": "Switzerland",
    "switzerland": "Switzerland",
    # Hong Kong
    "hong kong": "Hong Kong",
    "hồng kông": "Hong Kong",
    "hong kong sar": "Hong Kong",
    # India
    "ấn độ": "India",
    "an do": "India",
    "india": "India",
    # Philippines
    "philippines": "Philippines",
    "philippine": "Philippines",
    "pilipinas": "Philippines",
    # Russia
    "nga": "Russia",
    "russia": "Russia",
    "russian federation": "Russia",
}

# Country to Currency mapping for inference
COUNTRY_TO_CURRENCY = {
    "Vietnam": "VND",
    "Thailand": "THB",
    "Cambodia": "KHR",
    "Laos": "LAK",
    "Myanmar": "MMK",
    "Malaysia": "MYR",
    "Singapore": "SGD",
    "Indonesia": "IDR"
}

# F-2 FIX: Whitelist của các quốc gia có ánh xạ currency 1-1 unambiguous.
# KHÔNG bao gồm các quốc gia có nhiều loại tiền, hoặc dùng chung currency,
# hoặc denomination hay bị nhầm (USD/dollar là ví dụ: nhiều nước dùng).
# Chỉ thêm vào đây khi chắc chắn 100% country → currency là unambiguous.
SAFE_COUNTRY_CURRENCY_INFER = {
    # Southeast Asia
    "Vietnam": "VND",
    "Thailand": "THB",
    "Cambodia": "KHR",
    "Laos": "LAK",
    "Myanmar": "MMK",
    "Malaysia": "MYR",
    "Singapore": "SGD",
    "Indonesia": "IDR",
    # East Asia
    "Japan": "JPY",
    "South Korea": "KRW",
    "China": "CNY",
    # Others with unambiguous single currency
    "Switzerland": "CHF",
    "Hong Kong": "HKD",
    "India": "INR",
    "Philippines": "PHP",
    "Russia": "RUB",
    "Australia": "AUD",
    "Canada": "CAD",
    "Euro Zone": "EUR",
}

CURRENCY_MAPPING = {
    # Myanmar
    "kyat": "MMK",
    "kyats": "MMK",
    "ကျပ်": "MMK",
    "mmk": "MMK",
    # Thailand
    "baht": "THB",
    "thai baht": "THB",
    "฿": "THB",
    "thb": "THB",
    # Cambodia
    "riel": "KHR",
    "khmer riel": "KHR",
    "៛": "KHR",
    "khr": "KHR",
    # Laos
    "kip": "LAK",
    "lao kip": "LAK",
    "₭": "LAK",
    "lak": "LAK",
    # Indonesia
    "rupiah": "IDR",
    "indonesian rupiah": "IDR",
    "rp": "IDR",
    "idr": "IDR",
    # Malaysia
    "ringgit": "MYR",
    "malaysian ringgit": "MYR",
    "rm": "MYR",
    "myr": "MYR",
    # Singapore
    "singapore dollar": "SGD",
    "s$": "SGD",
    "sgd": "SGD",
    # Euro
    "euro": "EUR",
    "euros": "EUR",
    "eur": "EUR",
    "â‚¬": "EUR",
    "€": "EUR",
    # Vietnam
    "dong": "VND",
    "đồng": "VND",
    "vietnamese dong": "VND",
    "₫": "VND",
    "vnd": "VND"
}

def normalize_country(raw_country: Any) -> Optional[str]:
    if not raw_country:
        return None
    text = str(raw_country).strip().lower()
    mapped = COUNTRY_MAPPING.get(text)
    if mapped:
        return mapped
    folded = _fold_identity_text(raw_country)
    mapped = COUNTRY_MAPPING.get(folded)
    return mapped if mapped else str(raw_country).strip().title()


def _fold_identity_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


EURO_AREA_CANONICAL_COUNTRIES = frozenset({
    "Euro Zone",
    "Austria",
    "Belgium",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Estonia",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Ireland",
    "Italy",
    "Latvia",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Netherlands",
    "Portugal",
    "Slovakia",
    "Slovenia",
    "Spain",
})

EURO_AREA_COUNTRY_KEYS = frozenset(
    _fold_identity_text(country) for country in EURO_AREA_CANONICAL_COUNTRIES
)


def canonical_country_for_currency(
    country: Optional[str],
    currency_code: Optional[str],
) -> Optional[str]:
    """Return the country/region used only for currency identity votes.

    A country such as Germany remains Germany in raw/normalized agent data. It
    becomes Euro Zone only when the normalized currency is EUR, preventing a
    dangerous global Germany -> EU alias.
    """
    if not country:
        return country
    if str(currency_code or "").strip().upper() == "EUR":
        folded = _fold_identity_text(country)
        if folded in EURO_AREA_COUNTRY_KEYS or folded in {"eurozone", "euro zone", "khu vuc euro", "europe", "european union", "european union member states", "eu"}:
            return "Euro Zone"
    return country


def normalize_currency_identity(
    country: Any,
    currency_code: Any,
    denomination: Any,
) -> Dict[str, Any]:
    normalized_country = normalize_country(country)
    normalized_currency = normalize_currency_no_infer(currency_code)
    if normalized_currency is None and currency_code:
        candidate = str(currency_code).strip().upper()
        if re.fullmatch(r"[A-Z]{3}", candidate):
            normalized_currency = candidate
    normalized_amount = extract_amount(denomination)
    canonical_country = canonical_country_for_currency(
        normalized_country,
        normalized_currency,
    )
    vote_key = None
    if canonical_country and normalized_currency and normalized_amount is not None:
        vote_key = (
            str(canonical_country).strip().lower(),
            str(normalized_currency).strip().upper(),
            str(normalized_amount).strip(),
        )
    return {
        "raw_country": country,
        "reported_country": normalized_country,
        "canonical_country": canonical_country,
        "currency_code": normalized_currency,
        "denomination": normalized_amount,
        "vote_key": vote_key,
    }

def normalize_currency(raw_text: Any, country_hint: Optional[str] = None) -> Optional[str]:
    """Legacy function – kept for backward compat. Country-hint infer still active here.
    Do NOT call this from normalize_agent_vote; use normalize_currency_no_infer instead.
    """
    if not raw_text:
        return COUNTRY_TO_CURRENCY.get(country_hint) if country_hint else None

    text = str(raw_text).strip().lower()

    # 1. Exact match in mapping
    for key, iso_code in CURRENCY_MAPPING.items():
        # Match standalone words or specific symbols
        if (
            key == text
            or f" {key}" in f" {text}"
            or f"{key} " in f"{text} "
            or (key in ["฿", "៛", "₭", "₫", "rp", "rm", "s$"] and key in text)
        ):
            return iso_code

    # 2. Try regex for ISO codes
    match = re.search(
        r"\b(vnd|thb|khr|lak|mmk|myr|sgd|idr|php|usd|eur|jpy|cny|krw)\b", text
    )
    if match:
        return match.group(1).upper()

    # 3. Infer from country (only in legacy path)
    if country_hint:
        return COUNTRY_TO_CURRENCY.get(country_hint)

    return None


def normalize_currency_no_infer(raw_text: Any) -> Optional[str]:
    """Parse currency code from raw text ONLY – no country-hint inference.
    Safe to use in vote normalization so IDR/USD/EUR never become VND via country guess.
    Returns None when currency cannot be determined from text alone.
    """
    if not raw_text:
        return None

    text = str(raw_text).strip().lower()

    # 1. Exact / word-boundary match in CURRENCY_MAPPING
    for key, iso_code in CURRENCY_MAPPING.items():
        if (
            key == text
            or f" {key}" in f" {text}"
            or f"{key} " in f"{text} "
            or (key in ["฿", "៛", "₭", "₫", "rp", "rm", "s$"] and key in text)
        ):
            return iso_code

    # 2. ISO code via regex (broad list to catch USD, EUR, etc.)
    match = re.search(
        r"\b(vnd|thb|khr|lak|mmk|myr|sgd|idr|php|usd|eur|jpy|cny|krw|gbp|aud|cad|chf|hkd|twd|brl|inr|rub|try|mxn|zar|sek|nok|dkk|pln)\b",
        text,
    )
    if match:
        return match.group(1).upper()

    return None


# Regex để phát hiện các currency keyword đối nghịch trong text denomination.
# Dùng để guard: nếu denomination có currency keyword rõ (dù khác country),
# KHÔNG được override bằng country-infer.
_CONFLICTING_CURRENCY_PATTERN = re.compile(
    r"\b(vnd|thb|khr|lak|mmk|myr|sgd|idr|php|usd|eur|jpy|cny|krw|gbp|aud|cad|chf|hkd|"
    r"twd|brl|inr|rub|try|mxn|zar|sek|nok|dkk|pln|"
    r"dong|đồng|baht|riel|kip|rupiah|kyat|ringgit|peso|yuan|yen|won|franc|pound|"
    r"dollar|dollars|euro|euros|rp|rm|s\$|฿|៛|₭|₫|\$|€|£|¥)\b",
    re.IGNORECASE,
)


def infer_currency_from_country_safe(
    country: Optional[str],
    raw_denom: Any,
) -> Optional[str]:
    """F-2 FIX: Infer currency from country ONLY when ALL guards pass.

    Guards (ALL must be true):
    1. country is not None and is in SAFE_COUNTRY_CURRENCY_INFER whitelist.
    2. raw_denom is a bare number (digits, commas, dots only — no currency keyword).
    3. raw_denom does NOT contain any conflicting currency keyword.
    4. Denomination parses to a positive amount.

    Returns None if any guard fails → safe to call unconditionally.
    """
    if not country or not raw_denom:
        return None

    # Guard 1: country must be in unambiguous whitelist (normalized English name)
    inferred = SAFE_COUNTRY_CURRENCY_INFER.get(country)
    if not inferred:
        return None

    denom_str = str(raw_denom).strip()

    # Guard 2 + 3: must be bare number with no currency conflict in text
    if _CONFLICTING_CURRENCY_PATTERN.search(denom_str):
        return None

    # Bare-number check: strip digits, commas, dots, spaces → if anything left, not bare
    cleaned = re.sub(r"[\d,. ]+", "", denom_str).strip()
    if cleaned:
        # Non-numeric content remains → not a bare number → do NOT infer
        return None

    # Guard 4: amount must be parseable and positive
    digits_only = re.sub(r"[,.]", "", denom_str)
    try:
        amount = int(digits_only)
        if amount <= 0:
            return None
    except (ValueError, TypeError):
        return None

    return inferred


def extract_amount(raw_text: Any) -> Optional[int]:
    if raw_text is None:
        return None
    text = str(raw_text).strip()
    
    # Find all digits, commas and dots
    match = re.search(r"[\d,.]+", text)
    if not match:
        return None
        
    number_str = match.group(0)
    # Remove commas and dots
    clean_number = number_str.replace(",", "").replace(".", "")
    if not clean_number:
        return None
        
    try:
        return int(clean_number)
    except ValueError:
        return None

# Values that indicate an agent did not return useful data
_INVALID_AGENT_VALUES = {
    "lỗi", "loi", "error", "failed", "fail",
    "n/a", "na", "unknown",
    "không xác định", "khong xac dinh",
    "none", "null", "not found", "not_found",
}


def normalize_agent_vote(agent_result: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise one agent result into a vote struct.

    Currency resolution priority (highest → lowest):
      1. Explicit currency fields: ``ma_tien_te``, ``currency``, ``currency_code``
         These are used as-is (uppercased) when valid, and do NOT trigger
         country-inference – so IDR stays IDR even if country is wrong.
      2. Parse currency keyword/ISO code from denomination text
         (e.g. "100000 IDR", "500 THB", "50 EUR").
      3. [F-2 FIX] Safe country-infer: ONLY when denomination is a bare number
         (no currency keyword in text), country is in SAFE_COUNTRY_CURRENCY_INFER
         whitelist, and no explicit currency conflict exists. This prevents
         vote_key=None for real banknotes where AI returns bare denomination
         (e.g. OpenAI returns '100000' for a 100.000 VND note with quoc_gia='Vietnam').

    VND is only assigned when the agent explicitly passes VND / dong / đồng / ₫,
    the denomination text contains those keywords, OR quoc_gia='Vietnam' with a
    bare number and no conflicting currency keyword.
    """
    raw_country = agent_result.get("quoc_gia") or agent_result.get("country")
    raw_denom = (
        agent_result.get("menh_gia")
        or agent_result.get("denomination")
        or agent_result.get("result")
    )

    # --- 1. Explicit currency fields (highest priority) ---
    raw_currency_explicit = (
        agent_result.get("ma_tien_te")
        or agent_result.get("currency")
        or agent_result.get("currency_code")
    )

    country = normalize_country(raw_country)
    amount = extract_amount(raw_denom)

    # --- Guard: invalid raw values ---
    if raw_denom and str(raw_denom).strip().lower() in _INVALID_AGENT_VALUES:
        amount = None
        raw_denom = None
    if raw_country and str(raw_country).strip().lower() in _INVALID_AGENT_VALUES:
        country = None

    # --- 2. Determine currency_code ---
    currency_code: Optional[str] = None

    if raw_currency_explicit:
        explicit_str = str(raw_currency_explicit).strip()
        if explicit_str.lower() not in _INVALID_AGENT_VALUES:
            # First try direct lookup in CURRENCY_MAPPING (handles word names like "rupiah")
            looked_up = normalize_currency_no_infer(explicit_str)
            currency_code = looked_up if looked_up else explicit_str.upper()

    if currency_code is None:
        # Fallback: parse from denomination text only
        currency_code = normalize_currency_no_infer(raw_denom)

    # --- 3. [F-2 FIX] Safe country-infer: bare number + unambiguous country whitelist ---
    # Only activates when (1) and (2) both yield None. All guards in
    # infer_currency_from_country_safe() must pass to prevent over-inference.
    if currency_code is None and country is not None and raw_denom is not None:
        currency_code = infer_currency_from_country_safe(country, raw_denom)
        if currency_code is not None:
            # Record that this currency was inferred (for debugging/audit)
            _inferred = True
        else:
            _inferred = False
    else:
        _inferred = False

    identity = normalize_currency_identity(country, currency_code, amount)
    canonical_country = identity["canonical_country"]
    vote_key = identity["vote_key"]

    return {
        "country": canonical_country,
        "reported_country": country,
        "canonical_country": canonical_country,
        "currency_code": currency_code,
        "amount": amount,
        "vote_key": vote_key,
        "raw_country": raw_country,
        "raw_denomination": raw_denom,
        "currency_inferred_from_country": _inferred,  # audit flag
        "agent_data": agent_result,
    }
