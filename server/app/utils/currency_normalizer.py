import re
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
    "indonesia": "Indonesia"
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
    return COUNTRY_MAPPING.get(text, text.title())

def normalize_currency(raw_text: Any, country_hint: Optional[str] = None) -> Optional[str]:
    if not raw_text:
        return COUNTRY_TO_CURRENCY.get(country_hint) if country_hint else None
        
    text = str(raw_text).strip().lower()
    
    # 1. Exact match in mapping
    for key, iso_code in CURRENCY_MAPPING.items():
        # Match standalone words or specific symbols
        if key == text or f" {key}" in f" {text}" or f"{key} " in f"{text} " or (key in ["฿", "៛", "₭", "₫", "rp", "rm", "s$"] and key in text):
            return iso_code
            
    # 2. Try regex for ISO codes
    match = re.search(r"\b(vnd|thb|khr|lak|mmk|myr|sgd|idr|php|usd|eur|jpy|cny|krw)\b", text)
    if match:
        return match.group(1).upper()
        
    # 3. Infer from country
    if country_hint:
        return COUNTRY_TO_CURRENCY.get(country_hint)
        
    return None

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

def normalize_agent_vote(agent_result: Dict[str, Any]) -> Dict[str, Any]:
    raw_country = agent_result.get("quoc_gia") or agent_result.get("country")
    raw_denom = agent_result.get("menh_gia") or agent_result.get("denomination") or agent_result.get("result")
    
    country = normalize_country(raw_country)
    amount = extract_amount(raw_denom)
    currency_code = normalize_currency(raw_denom, country_hint=country)
    
    # Check invalid states
    invalid_values = {"lỗi", "loi", "error", "failed", "fail", "n/a", "na", "unknown", "không xác định", "khong xac dinh", "none", "null"}
    
    # If denomination is fundamentally invalid
    if raw_denom and str(raw_denom).strip().lower() in invalid_values:
        amount = None
        currency_code = None
        
    if raw_country and str(raw_country).strip().lower() in invalid_values:
        country = None
        
    vote_key = None
    if country and currency_code and amount is not None:
        c_str = str(country).strip().lower()
        curr_str = str(currency_code).strip().lower()
        amt_str = str(amount).strip().lower()
        vote_key = (c_str, curr_str, amt_str)
        
    return {
        "country": country,
        "currency_code": currency_code,
        "amount": amount,
        "vote_key": vote_key,
        "raw_country": raw_country,
        "raw_denomination": raw_denom,
        "agent_data": agent_result
    }
