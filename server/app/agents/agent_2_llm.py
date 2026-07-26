import json
import re
import asyncio
from io import BytesIO
from typing import Any, Dict, List, Tuple, Optional

from PIL import Image
from google import genai
from google.genai import types

from app.core.config import settings


# ============================================================
# Agent 2 — Gemini MLLM Agent
# Nhiệm vụ:
# - Nhận ảnh tiền giấy đã xử lý
# - Gửi ảnh + prompt đến Gemini
# - Bắt Gemini trả JSON
# - Validate JSON
# - Nếu sai format / thiếu field / lỗi quota thì retry hoặc fallback model
# ============================================================


# =========================
# Gemini Client
# =========================

_gemini_client = None

def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError(
                "GOOGLE_API_KEY chưa được cấu hình. Hãy thêm vào file .env."
            )
        _gemini_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _gemini_client


# =========================
# Model Config
# =========================

MODEL_LLM_MAIN = "gemini-2.5-flash"

FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]

UNVERIFIED_ENV_ADMIN_GEMINI_MODELS = frozenset({
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
})
AG2_UNVERIFIED_MODEL_CHAIN_WARNING = "env_admin_chain_contains_unverified_models"

MAX_ATTEMPTS_PER_MODEL = 2


# =========================
# Supported Currency Map
# =========================

SEA_CURRENCY_MAP = {
    # Đông Nam Á
    "Việt Nam": "VND",
    "Viet Nam": "VND",
    "Vietnam": "VND",
    "Thái Lan": "THB",
    "Thai Lan": "THB",
    "Thailand": "THB",
    "Lào": "LAK",
    "Lao": "LAK",
    "Laos": "LAK",
    "Campuchia": "KHR",
    "Cambodia": "KHR",
    "Myanmar": "MMK",
    "Miến Điện": "MMK",
    "Malaysia": "MYR",
    "Singapore": "SGD",
    "Indonesia": "IDR",
    "Philippines": "PHP",
    "Phi-líp-pin": "PHP",
    "Brunei": "BND",
    "Timor-Leste": "USD",
    "Đông Timor": "USD",
    
    # Ngoại tệ phổ biến
    "Hoa Kỳ": "USD",
    "Mỹ": "USD",
    "United States": "USD",
    "Châu Âu": "EUR",
    "Nhật Bản": "JPY",
    "Trung Quốc": "CNY",
    "Hàn Quốc": "KRW",
}


VALID_COUNTRIES = set(SEA_CURRENCY_MAP.keys())

VALID_CURRENCIES = {
    "VND", "THB", "LAK", "KHR", "MMK",
    "MYR", "SGD", "IDR", "PHP", "BND", "USD",
    "EUR", "JPY", "CNY", "KRW"
}


INVALID_VALUES = {
    "",
    "unknown",
    "không xác định",
    "khong xac dinh",
    "n/a",
    "na",
    "none",
    "null",
    "lỗi",
    "loi",
    "error",
    "failed",
}



# =========================
# JSON Template
# Giữ format tiếng Việt để tương thích với Agent 1, Agent 3, Aggregator
# =========================

JSON_TEMPLATE = """
[
  {
    "quoc_gia": "Tên quốc gia, ví dụ: Việt Nam, Hoa Kỳ",
    "ma_tien_te": "Mã tiền tệ 3 chữ cái, ví dụ: VND, USD, EUR",
    "menh_gia": "CHỈ ghi SỐ THUẦN của mệnh giá, ví dụ: 500, 1000, 50000. TUYỆT ĐỐI KHÔNG ghi thêm chữ.",
    "mat_tien": "Mặt trước / Mặt sau / Không xác định",
    "nam_phat_hanh": "Năm phát hành nếu nhìn thấy, nếu không thì ghi Không xác định",
    "chat_lieu": "Polymer / Cotton / Giấy / Không xác định",
    "mo_ta": "Mô tả ngắn gọn đặc điểm chính của tờ tiền",
    "quan_diem": "Lý giải vì sao chọn kết quả này, dựa trên chữ, số, chân dung, biểu tượng, màu sắc",
    "phuong_phap": "LLM Gemini",
    "do_tin_cay": 0.0,
    "van_ban_nhin_thay": [],
    "dac_diem_chinh": [],
    "status": "Completed"
  }
]
"""


REQUIRED_FIELDS = [
    "quoc_gia",
    "ma_tien_te",
    "menh_gia",
    "mat_tien",
    "nam_phat_hanh",
    "chat_lieu",
    "mo_ta",
    "quan_diem",
    "phuong_phap",
]


OPTIONAL_FIELDS_WITH_DEFAULTS = {
    "do_tin_cay": 0.0,
    "van_ban_nhin_thay": [],
    "dac_diem_chinh": [],
    "status": "Completed",
}


# ============================================================
# Utility Functions
# ============================================================

def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_lower(value: Any) -> str:
    return _normalize_text(value).lower()


def _is_invalid_value(value: Any) -> bool:
    return _normalize_lower(value) in INVALID_VALUES


def _strip_markdown_json(text: str) -> str:
    """
    Tách JSON nếu Gemini trả về dạng:
    ```json
    [...]
    ```
    hoặc:
    ```
    [...]
    ```
    """
    if not text:
        return ""

    text = text.strip()

    if "```json" in text:
        return text.split("```json", 1)[1].split("```", 1)[0].strip()

    if "```" in text:
        return text.split("```", 1)[1].split("```", 1)[0].strip()

    return text


def _extract_json_substring(text: str) -> str:
    """
    Nếu model lỡ trả thêm chữ ngoài JSON, cố gắng lấy đoạn JSON chính.
    Ưu tiên list JSON: [...]
    Nếu không có thì lấy object: {...}
    """
    text = _strip_markdown_json(text)

    if not text:
        return ""

    # Nếu đã là JSON thuần
    if text.startswith("[") or text.startswith("{"):
        return text

    # Cố gắng tìm list JSON
    list_start = text.find("[")
    list_end = text.rfind("]")
    if list_start != -1 and list_end != -1 and list_end > list_start:
        return text[list_start:list_end + 1].strip()

    # Cố gắng tìm object JSON
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        return text[obj_start:obj_end + 1].strip()

    return text


def _extract_first_json_value(text: str) -> str:
    """Extract the first decodable JSON object/array from model prose."""
    cleaned = _strip_markdown_json(text)
    decoder = json.JSONDecoder()
    for index, char in enumerate(cleaned):
        if char not in "[{":
            continue
        try:
            _, end = decoder.raw_decode(cleaned[index:])
            return cleaned[index:index + end]
        except json.JSONDecodeError:
            continue
    return cleaned


def clean_json(text: str, *, robust: bool = False) -> str:
    """
    Hàm này được Agent 3 import, nên vẫn giữ tên cũ.
    Mục tiêu:
    - Làm sạch markdown
    - Parse thử JSON
    - Nếu object thì bọc thành list
    - Nếu lỗi thì trả JSON error đúng format list
    """
    if not text:
        return json.dumps([{
            "quoc_gia": "Lỗi",
            "ma_tien_te": "Lỗi",
            "menh_gia": "Lỗi",
            "mat_tien": "Lỗi",
            "nam_phat_hanh": "Lỗi",
            "chat_lieu": "Lỗi",
            "mo_ta": "AI trả về rỗng",
            "quan_diem": (
                "parse_error: Không nhận được nội dung phản hồi từ mô hình."
                if robust
                else "Không nhận được nội dung phản hồi từ mô hình."
            ),
            "phuong_phap": "LLM Gemini",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed"
        }], ensure_ascii=False)

    candidate = (
        _extract_first_json_value(text)
        if robust
        else _extract_json_substring(text)
    )

    try:
        parsed = json.loads(candidate)

        if robust and isinstance(parsed, dict) and "results" in parsed:
            parsed = parsed.get("results")

        if isinstance(parsed, dict):
            parsed = [parsed]

        if not isinstance(parsed, list):
            raise ValueError("JSON root phải là list hoặc object")

        return json.dumps(parsed, ensure_ascii=False)

    except Exception:
        return json.dumps([{
            "quoc_gia": "Lỗi",
            "ma_tien_te": "Lỗi",
            "menh_gia": "Lỗi",
            "mat_tien": "Lỗi",
            "nam_phat_hanh": "Lỗi",
            "chat_lieu": "Lỗi",
            "mo_ta": "AI trả về sai định dạng JSON",
            "quan_diem": (
                f"parse_error: Nội dung thô không parse được thành JSON hợp lệ: {text[:300]}"
                if robust
                else f"Nội dung thô không parse được thành JSON hợp lệ: {text[:300]}"
            ),
            "phuong_phap": "LLM Gemini",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed"
        }], ensure_ascii=False)


def _parse_json_list(
    json_text: str,
    *,
    robust: bool = False,
) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    try:
        candidate = (
            _extract_first_json_value(json_text)
            if robust
            else json_text
        )
        data = json.loads(candidate)
    except Exception as e:
        return None, f"Không parse được JSON: {e}"

    if robust and isinstance(data, dict) and "results" in data:
        data = data.get("results")

    if isinstance(data, dict):
        data = [data]

    if not isinstance(data, list):
        return None, "JSON root phải là list"

    if len(data) == 0:
        return None, "JSON list rỗng"

    if not isinstance(data[0], dict):
        return None, "Phần tử đầu tiên trong JSON list phải là object"

    return data, "OK"


def _extract_currency_from_denomination(denomination: Any) -> Optional[str]:
    text = _normalize_text(denomination)
    upper = text.upper()

    match = re.search(
        r"(?:\d[\d.,\s]*\s+)([A-Z]{3})\b|\b([A-Z]{3})(?=\s+\d)",
        upper,
    )
    if match:
        code = match.group(1) or match.group(2)
        if code not in {"AND", "THE", "ONE", "NEW", "OLD", "UNC", "GEM"}:
            return code

    safe_aliases = (
        (r"\b(?:vnđ|vnd)\b|₫", "VND"),
        (r"\b(?:baht|thb)\b|฿", "THB"),
        (r"\b(?:kip|lak)\b|₭", "LAK"),
        (r"\b(?:riel|khr)\b|៛", "KHR"),
        (r"\b(?:kyat|mmk)\b", "MMK"),
        (r"\b(?:ringgit|myr)\b", "MYR"),
        (r"\b(?:rupiah|idr)\b", "IDR"),
        (r"\b(?:peso|php)\b", "PHP"),
        (r"\b(?:us\s+dollars?|u\.s\.\s+dollars?|usd)\b|\$", "USD"),
    )
    for pattern, code in safe_aliases:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return code

    return None


def _normalize_upper_ascii(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _normalize_explicit_currency(value: Any) -> Optional[str]:
    """Normalize an explicit currency field without inferring from country."""
    if _is_invalid_value(value):
        return None

    text = _normalize_text(value)
    if text.lower() in {"vnđ", "₫", "đ", "đồng", "dong"}:
        return "VND"

    normalized = text.upper()
    if re.fullmatch(r"[A-Z]{3}", normalized):
        return normalized

    return None


_ENGLISH_NUMBER_VALUES = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}


def _extract_denomination_amount(value: Any) -> Optional[int]:
    text = _normalize_text(value)
    numeric_match = re.search(
        r"(?<!\d)(\d{1,3}(?:[.,\s]\d{3})+|\d+)(?!\d)",
        text,
    )
    if numeric_match:
        token = re.sub(r"[.,\s]", "", numeric_match.group(1))
        try:
            amount = int(token)
            return amount if amount > 0 else None
        except ValueError:
            return None

    words = re.findall(r"[a-z]+", text.casefold())
    total = 0
    current = 0
    found = False
    for word in words:
        if word in _ENGLISH_NUMBER_VALUES:
            current += _ENGLISH_NUMBER_VALUES[word]
            found = True
        elif word == "hundred":
            current = max(1, current) * 100
            found = True
        elif word == "thousand":
            total += max(1, current) * 1000
            current = 0
            found = True
        elif found:
            break
    amount = total + current
    return amount if found and amount > 0 else None


def _normalize_denomination(
    value: Any,
    country: Any = None,
    explicit_currency: Optional[str] = None,
) -> str:
    """
    Chuẩn hóa mệnh giá:
    - "500.000 VNĐ" -> "500000 VND"
    - "10000 đồng" -> "10000 VND"
    - "20 baht" -> "20 THB"
    """
    if value is None:
        return "Không xác định"

    text = str(value).strip()

    if _is_invalid_value(text):
        return "Không xác định"

    amount = _extract_denomination_amount(text)
    if amount is None:
        return text

    currency = explicit_currency or _extract_currency_from_denomination(text)
    if currency:
        return f"{amount} {currency}"

    # Nếu không thấy currency, suy luận từ quốc gia nếu có
    country_text = _normalize_text(country)
    expected_currency = SEA_CURRENCY_MAP.get(country_text)

    if expected_currency:
        return f"{amount} {expected_currency}"

    return str(amount)


def _canonical_country(country: Any) -> str:
    """
    Chuẩn hóa tên quốc gia về dạng tiếng Việt ưu tiên.
    """
    text = _normalize_text(country)

    mapping = {
        "vietnam": "Việt Nam",
        "viet nam": "Việt Nam",
        "việt nam": "Việt Nam",

        "thailand": "Thái Lan",
        "thai lan": "Thái Lan",
        "thái lan": "Thái Lan",

        "laos": "Lào",
        "lao": "Lào",
        "lào": "Lào",

        "cambodia": "Campuchia",
        "campuchia": "Campuchia",

        "myanmar": "Myanmar",
        "miến điện": "Myanmar",
        "mien dien": "Myanmar",

        "malaysia": "Malaysia",

        "singapore": "Singapore",

        "indonesia": "Indonesia",

        "philippines": "Philippines",
        "phi-líp-pin": "Philippines",

        "brunei": "Brunei",

        "timor-leste": "Timor-Leste",
        "đông timor": "Timor-Leste",
        "dong timor": "Timor-Leste",
        
        "hoa kỳ": "Hoa Kỳ",
        "mỹ": "Hoa Kỳ",
        "usa": "Hoa Kỳ",
        "united states": "Hoa Kỳ",
        
        "châu âu": "Châu Âu",
        "eu": "Châu Âu",
        
        "nhật bản": "Nhật Bản",
        "nhật": "Nhật Bản",
        "japan": "Nhật Bản",
        
        "trung quốc": "Trung Quốc",
        "china": "Trung Quốc",
        
        "hàn quốc": "Hàn Quốc",
        "korea": "Hàn Quốc",
        "south korea": "Hàn Quốc",
    }

    key = text.lower()
    return mapping.get(key, text)


def _expected_currency_for_country(country: Any) -> Optional[str]:
    canonical = _canonical_country(country)
    return SEA_CURRENCY_MAP.get(canonical)


def _is_safe_country_name(country: Any) -> bool:
    text = _normalize_text(country)
    if _is_invalid_value(text) or not (2 <= len(text) <= 80):
        return False
    if not any(char.isalpha() for char in text):
        return False
    return not any(char in text for char in "{}[]<>\\")


def _ensure_default_fields(item: Dict[str, Any]) -> Dict[str, Any]:
    for field, default_value in OPTIONAL_FIELDS_WITH_DEFAULTS.items():
        if field not in item:
            item[field] = default_value

    if not isinstance(item.get("van_ban_nhin_thay"), list):
        item["van_ban_nhin_thay"] = []

    if not isinstance(item.get("dac_diem_chinh"), list):
        item["dac_diem_chinh"] = []

    try:
        item["do_tin_cay"] = float(item.get("do_tin_cay", 0.0))
    except Exception:
        item["do_tin_cay"] = 0.0

    item["do_tin_cay"] = max(0.0, min(1.0, item["do_tin_cay"]))

    if not item.get("status"):
        item["status"] = "Completed"

    return item


def validate_agent2_result(
    json_text: str,
    *,
    robust: bool = False,
) -> Tuple[bool, str, Optional[str]]:
    """
    Validate sâu kết quả Agent 2.
    Trả về:
    - valid: True/False
    - message: lý do
    - normalized_json_text: JSON đã chuẩn hóa nếu valid
    """
    data, message = _parse_json_list(json_text, robust=robust)
    if data is None:
        return False, message, None

    item = data[0]

    for field in REQUIRED_FIELDS:
        if field not in item:
            return False, f"Thiếu field bắt buộc: {field}", None

    for field in REQUIRED_FIELDS:
        if item.get(field) is None:
            item[field] = "Không xác định"

    item = _ensure_default_fields(item)

    # Không chấp nhận response lỗi
    if _normalize_lower(item.get("status")) == "failed":
        return False, "Model trả status Failed", None

    # Chuẩn hóa quốc gia
    country = _canonical_country(item.get("quoc_gia"))
    item["quoc_gia"] = country

    if not _is_safe_country_name(country):
        return False, "Không xác định được quốc gia", None

    expected_currency = _expected_currency_for_country(country)

    raw_denomination = item.get("menh_gia")
    if _is_invalid_value(raw_denomination):
        return False, "Không xác định được mệnh giá", None

    raw_explicit_currency = item.get("ma_tien_te")
    explicit_currency = _normalize_explicit_currency(raw_explicit_currency)
    explicit_currency_is_unknown = _is_invalid_value(raw_explicit_currency)

    if not explicit_currency_is_unknown and explicit_currency is None:
        return False, f"Mã tiền tệ không hợp lệ trong ma_tien_te: {raw_explicit_currency}", None

    amount = _extract_denomination_amount(raw_denomination)
    if amount is None:
        return False, "amount_parse_error: Mệnh giá không có số hợp lệ", None

    currency_in_raw_denom = _extract_currency_from_denomination(raw_denomination)
    if explicit_currency and currency_in_raw_denom and explicit_currency != currency_in_raw_denom:
        return False, (
            "Mâu thuẫn ma_tien_te và menh_gia: "
            f"ma_tien_te={explicit_currency}, menh_gia={currency_in_raw_denom}"
        ), None

    resolved_currency = explicit_currency or currency_in_raw_denom or expected_currency
    if resolved_currency is None:
        return False, "currency_missing_or_ambiguous", None

    if expected_currency and resolved_currency != expected_currency:
        return False, (
            f"Mâu thuẫn quốc gia và tiền tệ: {country} phải là "
            f"{expected_currency}, nhưng model trả {resolved_currency}"
        ), None

    item["menh_gia"] = f"{amount}"
    item["ma_tien_te"] = resolved_currency

    # Chuẩn hóa mặt tiền
    side = _normalize_lower(item.get("mat_tien"))

    if side in ["front", "mặt trước", "mat truoc"]:
        item["mat_tien"] = "Mặt trước"
    elif side in ["back", "mặt sau", "mat sau"]:
        item["mat_tien"] = "Mặt sau"
    else:
        item["mat_tien"] = "Không xác định"

    # Chuẩn hóa chất liệu
    material = _normalize_lower(item.get("chat_lieu"))
    if "polymer" in material:
        item["chat_lieu"] = "Polymer"
    elif "cotton" in material:
        item["chat_lieu"] = "Cotton"
    elif "giấy" in material or "giay" in material or "paper" in material:
        item["chat_lieu"] = "Giấy"
    elif _is_invalid_value(material):
        item["chat_lieu"] = "Không xác định"

    # Năm phát hành: không bắt buộc phải có
    year_text = _normalize_text(item.get("nam_phat_hanh"))
    year_match = re.search(r"\b(18|19|20)\d{2}\b", year_text)

    if year_match:
        item["nam_phat_hanh"] = year_match.group(0)
    elif _is_invalid_value(year_text):
        item["nam_phat_hanh"] = "Không xác định"

    # Phương pháp
    if not item.get("phuong_phap") or _is_invalid_value(item.get("phuong_phap")):
        item["phuong_phap"] = "LLM Gemini"

    if not item.get("mo_ta") or _is_invalid_value(item.get("mo_ta")):
        item["mo_ta"] = "Không có mô tả rõ ràng từ mô hình."

    if not item.get("quan_diem") or _is_invalid_value(item.get("quan_diem")):
        item["quan_diem"] = "Mô hình không cung cấp lập luận chi tiết."

    normalized = json.dumps([item], ensure_ascii=False)
    return True, "OK", normalized


def build_agent2_prompt(context: str = "", model_name: str = "") -> str:
    prompt = f"""
Bạn là Chuyên gia Giám định Tiền giấy.

Nhiệm vụ của bạn là phân tích ảnh tiền giấy được cung cấp và nhận diện chính xác thông tin của tờ tiền.

Quy tắc bắt buộc:
- CHỈ dựa vào nội dung hình ảnh. TUYỆT ĐỐI KHÔNG dùng filename, metadata, thư mục, hay thứ tự ảnh để đoán.
- TUYỆT ĐỐI trả JSON strict. KHÔNG dùng markdown. KHÔNG thêm chữ giải thích bên ngoài JSON.
- Cố gắng điền đủ 3 trường: quoc_gia, ma_tien_te, menh_gia.
- Mệnh giá (menh_gia) PHẢI LÀ SỐ THUẦN (ví dụ: 500, 1000, 50000).
- NẾU THẤY RÕ số mệnh giá, TUYỆT ĐỐI KHÔNG BỎ TRỐNG menh_gia.
- NẾU THẤY số mệnh giá nhưng chưa chắc quốc gia/tiền tệ, VẪN ĐIỀN menh_gia và giảm độ tin cậy.
- NẾU THẤY script, chân dung, biểu tượng, công trình rõ ràng, ĐƯỢC PHÉP suy luận quốc gia/tiền tệ với độ tin cậy phù hợp.
- NẾU KHÔNG ĐỦ bằng chứng, status có thể là "Uncertain", nhưng KHÔNG ĐƯỢC bỏ trống menh_gia nếu có số nhìn rõ.
- TUYỆT ĐỐI KHÔNG bịa chữ không nhìn thấy, không dịch chữ nếu không đọc rõ, không đoán theo ảnh khác.
- Field "do_tin_cay" là số từ 0.0 đến 1.0.
- Field "phuong_phap" ghi: "LLM Gemini - {model_name or 'Gemini'}".

Cấu trúc JSON bắt buộc:
{JSON_TEMPLATE}
"""

    if context:
        prompt += f"""

Thông tin tranh biện hoặc kết quả vòng trước:
{context}

Hãy dùng thông tin này để kiểm tra lại, nhưng quyết định cuối cùng vẫn phải dựa trên ảnh.
Nếu thông tin vòng trước mâu thuẫn với ảnh, hãy ưu tiên ảnh.
"""

    return prompt.strip()


def _build_error_response(
    error_message: str,
    status: str = "Failed",
    error_type: str = "technical_error",
    technical_error: bool = False,
    attempted_models: Optional[List[Dict[str, Any]]] = None,
    fallback_used: bool = False,
    model_chain_used: Optional[List[str]] = None,
    model_chain_source: Optional[str] = None,
    model_chain_source_detail: Optional[str] = None,
    model_chain_warning: Optional[str] = None,
) -> str:
    payload = {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": "Agent 2 không tạo được kết quả hợp lệ.",
        "quan_diem": error_message,
        "phuong_phap": "LLM Gemini",
        "do_tin_cay": 0.0,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": status,
        "error_type": error_type,
    }
    if technical_error:
        payload["technical_error"] = True
    if attempted_models is not None:
        payload["ag2_model_attempts"] = attempted_models
    if model_chain_used is not None:
        payload["ag2_model_chain_used"] = model_chain_used
    if model_chain_source is not None:
        payload["ag2_model_chain_source"] = model_chain_source
    if model_chain_source_detail is not None:
        payload["ag2_model_chain_source_detail"] = model_chain_source_detail
    if model_chain_warning is not None:
        payload["ag2_model_chain_warning"] = model_chain_warning
    payload["fallback_used"] = fallback_used
    payload["ag2_final_model"] = None
    return json.dumps([payload], ensure_ascii=False)


async def _call_gemini_once(
    model_name: str,
    prompt: str,
    image: Image.Image,
    temperature: float = 0.1,
    max_output_tokens: Optional[int] = None,
) -> str:
    """
    Gọi Gemini một lần.
    Có dùng response_mime_type='application/json'.
    Nếu SDK không hỗ trợ config này, fallback sang gọi thường.
    """

    try:
        response = get_gemini_client().models.generate_content(
            model=model_name,
            contents=[prompt, image],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            ),
        )
        return response.text or ""

    except TypeError:
        # Phòng trường hợp version google-genai cũ không hỗ trợ config
        response = get_gemini_client().models.generate_content(
            model=model_name,
            contents=[prompt, image],
        )
        return response.text or ""


# ============================================================
# Main Agent Function
# ============================================================

def _settings_field_source(*field_names: str) -> str:
    fields_set = (
        getattr(settings, "model_fields_set", None)
        or getattr(settings, "__fields_set__", set())
        or set()
    )
    return "env/admin" if any(name in fields_set for name in field_names) else "default"


def _resolve_gemini_model_chain(is_experiment_request: bool) -> Tuple[List[str], str, str]:
    enabled = getattr(settings, "AG2_GEMINI_CHAIN_ENABLED", False)
    apply_prod = getattr(settings, "AG2_GEMINI_CHAIN_APPLY_PRODUCTION", True)
    apply_exp = getattr(settings, "AG2_GEMINI_CHAIN_APPLY_EXPERIMENT", True)
    max_models = getattr(settings, "AG2_GEMINI_CHAIN_MAX_MODELS", 4)
    model_chain_str = getattr(settings, "AG2_GEMINI_MODEL_CHAIN", "")

    use_chain = False
    if enabled:
        if is_experiment_request and apply_exp:
            use_chain = True
        elif not is_experiment_request and apply_prod:
            use_chain = True

    chain = []
    if use_chain and model_chain_str:
        parts = [p.strip() for p in model_chain_str.split(",") if p.strip()]
        for p in parts:
            if p not in chain:
                chain.append(p)
        chain = chain[:max_models]

    if chain:
        return (
            chain,
            _settings_field_source("AG2_GEMINI_MODEL_CHAIN"),
            "AG2_GEMINI_MODEL_CHAIN",
        )

    # Fallback logic cũ
    old_chain = []
    if is_experiment_request:
        exp_model = getattr(settings, "GEMINI_EXPERIMENT_MODEL", None)
        if exp_model:
            old_chain.append(exp_model)
        fallback = getattr(settings, "GEMINI_EXPERIMENT_FALLBACK_MODEL", None)
        if fallback and fallback not in old_chain:
            old_chain.append(fallback)
    else:
        primary = getattr(settings, "AG2_GEMINI_PRIMARY_MODEL", None) or getattr(settings, "GEMINI_MODEL", None)
        fallback_str = getattr(settings, "AG2_GEMINI_FALLBACK_MODELS", None) or getattr(settings, "GEMINI_FALLBACK_MODEL", None)

        if primary:
            old_chain.append(primary)
        if fallback_str:
            fallbacks = [p.strip() for p in fallback_str.split(",") if p.strip()]
            for f in fallbacks:
                if f not in old_chain:
                    old_chain.append(f)

    if not old_chain:
        old_chain = list(FALLBACK_MODELS)
        return old_chain, "default", "FALLBACK_MODELS"

    legacy_fields = (
        "GEMINI_EXPERIMENT_MODEL",
        "GEMINI_EXPERIMENT_FALLBACK_MODEL",
    ) if is_experiment_request else (
        "AG2_GEMINI_PRIMARY_MODEL",
        "GEMINI_MODEL",
        "AG2_GEMINI_FALLBACK_MODELS",
        "GEMINI_FALLBACK_MODEL",
    )
    return old_chain, _settings_field_source(*legacy_fields), "legacy_model_config"


def _ag2_model_chain_warning(
    model_chain: List[str],
    model_chain_source: Optional[str],
) -> Optional[str]:
    if str(model_chain_source or "").strip().casefold() != "env/admin":
        return None
    normalized_chain = {
        str(model or "").strip().casefold()
        for model in model_chain or []
    }
    if normalized_chain.intersection(UNVERIFIED_ENV_ADMIN_GEMINI_MODELS):
        return AG2_UNVERIFIED_MODEL_CHAIN_WARNING
    return None


def _build_gemini_model_chain(is_experiment_request: bool) -> List[str]:
    chain, _source, _detail = _resolve_gemini_model_chain(is_experiment_request)
    return chain



async def run_agent2_llm(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    *,
    model_names: Optional[List[str]] = None,
    temperature: Optional[float] = None,
    max_output_tokens: Optional[int] = None,
    model_trace: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Agent 2 chính:
    - Nhận image_bytes
    - Thử từng model Gemini
    - Mỗi model thử MAX_ATTEMPTS_PER_MODEL lần
    - Chỉ return khi JSON hợp lệ
    - Nếu lỗi quota thì chuyển model
    - Nếu JSON sai thì retry
    """

    print("[Agent 2 LLM] Đang khởi tạo truy vấn...")

    if not settings.GOOGLE_API_KEY:
        return _build_error_response("Thiếu GOOGLE_API_KEY trong cấu hình hệ thống.")

    try:
        safe_img = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return _build_error_response(f"Lỗi đọc ảnh đầu vào: {str(e)}")

    last_error = ""
    last_invalid_json = ""

    # Identify if this was intended as an experiment run by checking the old params
    requested_models_init = list(model_names or FALLBACK_MODELS)
    is_experiment_request = bool(
        model_names
        and requested_models_init
        and requested_models_init[0] == getattr(settings, "GEMINI_EXPERIMENT_MODEL", None)
    )

    selected_models, model_chain_source, model_chain_source_detail = _resolve_gemini_model_chain(
        is_experiment_request
    )
    model_chain_warning = _ag2_model_chain_warning(selected_models, model_chain_source)

    primary_provider_error = ""
    resolved_temperature = 0.1 if temperature is None else temperature
    if model_trace is not None:
        model_trace["requested_model"] = selected_models[0] if selected_models else None
        model_trace["model"] = selected_models[0] if selected_models else None
        model_trace["model_chain_source"] = model_chain_source
        model_trace["model_chain_source_detail"] = model_chain_source_detail
        if model_chain_warning:
            model_trace["model_chain_warning"] = model_chain_warning

    # Logic retry/pro
    has_retried_pro = False
    pro_model = getattr(settings, "GEMINI_EXPERIMENT_PRO_MODEL", "")

    ag2_model_attempts = []

    max_attempts = getattr(settings, "AG2_GEMINI_MAX_ATTEMPTS_PER_MODEL", MAX_ATTEMPTS_PER_MODEL)

    for model_index, model_name in enumerate(selected_models):
        print(f"[Agent 2 LLM] Đang thử model: {model_name}")
        if model_trace is not None:
            model_trace["model"] = model_name
            model_trace["fallback_model"] = (
                selected_models[1] if len(selected_models) > 1 else None
            )
            model_trace["fallback_used"] = model_index > 0

        for attempt in range(1, max_attempts + 1):
            print(f"[Agent 2 LLM] Model {model_name}, attempt {attempt}/{max_attempts}")

            prompt = build_agent2_prompt(context=context, model_name=model_name)

            if attempt > 1:
                prompt += "\n\nLƯU Ý QUAN TRỌNG:\nLần trước kết quả thiếu trường bắt buộc (mệnh giá/quốc gia) hoặc JSON lỗi. Hãy đọc thật kỹ mệnh giá trên ảnh bằng SỐ THUẦN. Trả đúng JSON."

            try:
                raw_text = await asyncio.to_thread(
                    _sync_call_gemini_wrapper,
                    model_name,
                    prompt,
                    safe_img,
                    resolved_temperature,
                    max_output_tokens,
                )

                if debug_log is not None:
                    debug_log["prompt_sent"] = prompt
                    debug_log["raw_response"] = raw_text
                    debug_log["model"] = model_name

                cleaned = clean_json(raw_text, robust=is_experiment_request)
                valid, message, normalized_json = validate_agent2_result(
                    cleaned,
                    robust=is_experiment_request,
                )

                # Check if we should retry logic
                needs_retry = False
                parsed_dict = None
                if valid and normalized_json:
                    try:
                        parsed_arr = json.loads(normalized_json)
                        if parsed_arr and isinstance(parsed_arr, list):
                            parsed_dict = parsed_arr[0]
                    except: pass

                    if parsed_dict:
                        status = parsed_dict.get("status", "")
                        menh_gia = parsed_dict.get("menh_gia", "")
                        quoc_gia = parsed_dict.get("quoc_gia", "")

                        is_missing_denomination = _is_invalid_value(menh_gia) or "không xác định" in str(menh_gia).lower()
                        is_missing_country = _is_invalid_value(quoc_gia) or "không xác định" in str(quoc_gia).lower()
                        is_uncertain = "uncertain" in status.lower() or "partial" in status.lower()

                        if is_missing_denomination or is_missing_country or is_uncertain:
                            needs_retry = True

                if valid and normalized_json and not needs_retry:
                    print(f"[Agent 2 LLM] Nhận JSON hợp lệ từ {model_name}")
                    parsed = json.loads(normalized_json)
                    parsed[0]["phuong_phap"] = f"LLM Gemini - {model_name}"
                    parsed[0]["status"] = "Completed"
                    parsed[0]["ag2_model_chain_used"] = selected_models
                    parsed[0]["ag2_model_chain_source"] = model_chain_source
                    parsed[0]["ag2_model_chain_source_detail"] = model_chain_source_detail
                    if model_chain_warning:
                        parsed[0]["ag2_model_chain_warning"] = model_chain_warning
                    parsed[0]["ag2_model_attempts"] = ag2_model_attempts + [{"model": model_name, "status": "completed"}]
                    parsed[0]["ag2_final_model"] = model_name
                    parsed[0]["fallback_used"] = model_index > 0
                    return json.dumps(parsed, ensure_ascii=False)

                # If experiment_mode and pro_model available and not retried pro yet
                if is_experiment_request and needs_retry and pro_model and not has_retried_pro:
                    print(f"[Agent 2 LLM] Cần retry với Pro Model: {pro_model}")
                    has_retried_pro = True
                    try:
                        pro_raw = await asyncio.to_thread(
                            _sync_call_gemini_wrapper,
                            pro_model,
                            prompt + "\nChú ý: Lần trước model nhỏ hơn đã không tìm ra mệnh giá hoặc quốc gia. Hãy cố gắng phân tích thật kỹ SỐ và HÌNH ẢNH.",
                            safe_img,
                            resolved_temperature,
                            max_output_tokens,
                        )
                        pro_cleaned = clean_json(pro_raw, robust=True)
                        pro_valid, pro_msg, pro_norm = validate_agent2_result(pro_cleaned, robust=True)
                        if pro_valid and pro_norm:
                            parsed_pro = json.loads(pro_norm)
                            parsed_pro[0]["phuong_phap"] = f"LLM Gemini - {pro_model}"
                            if "uncertain" not in parsed_pro[0].get("status", "").lower():
                                parsed_pro[0]["status"] = "Completed"
                            parsed_pro[0]["ag2_model_chain_used"] = selected_models
                            parsed_pro[0]["ag2_model_chain_source"] = model_chain_source
                            parsed_pro[0]["ag2_model_chain_source_detail"] = model_chain_source_detail
                            if model_chain_warning:
                                parsed_pro[0]["ag2_model_chain_warning"] = model_chain_warning
                            parsed_pro[0]["ag2_model_attempts"] = ag2_model_attempts + [{"model": model_name, "status": "failed", "reason": "missing_fields"}, {"model": pro_model, "status": "completed"}]
                            parsed_pro[0]["ag2_final_model"] = pro_model
                            parsed_pro[0]["fallback_used"] = model_index > 0 or True
                            return json.dumps(parsed_pro, ensure_ascii=False)
                    except Exception as ex_pro:
                        print(f"[Agent 2 LLM] Lỗi với model {pro_model}: {str(ex_pro)}")

                # If we get here, valid but needs_retry is true AND we exhausted pro, or just invalid json
                if valid and normalized_json:
                    print(f"[Agent 2 LLM] Trả về JSON dù còn thiếu field (sau khi đã thử retry): {model_name}")
                    parsed = json.loads(normalized_json)
                    parsed[0]["phuong_phap"] = f"LLM Gemini - {model_name}"
                    parsed[0]["ag2_model_chain_used"] = selected_models
                    parsed[0]["ag2_model_chain_source"] = model_chain_source
                    parsed[0]["ag2_model_chain_source_detail"] = model_chain_source_detail
                    if model_chain_warning:
                        parsed[0]["ag2_model_chain_warning"] = model_chain_warning
                    parsed[0]["ag2_model_attempts"] = ag2_model_attempts + [{"model": model_name, "status": "completed_with_missing_fields"}]
                    parsed[0]["ag2_final_model"] = model_name
                    parsed[0]["fallback_used"] = model_index > 0
                    return json.dumps(parsed, ensure_ascii=False)

                last_invalid_json = cleaned
                last_error = message
                print(f"[Agent 2 LLM] JSON không hợp lệ từ {model_name}: {message}")

                # Nếu JSON sai thì retry cùng model
                if attempt == max_attempts:
                    ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": "invalid_json"})
                await asyncio.sleep(1)

            except Exception as e:
                error_msg = str(e)
                last_error = error_msg
                print(f"[Agent 2 LLM] Lỗi với model {model_name}: {error_msg}")

                reason_str = "error"
                # Hết quota thì chuyển model ngay
                if (
                    "429" in error_msg
                    or "RESOURCE_EXHAUSTED" in error_msg
                    or "quota" in error_msg.lower()
                    or "rate" in error_msg.lower()
                    or "limit" in error_msg.lower()
                ):
                    reason_str = "quota_or_rate_limit"
                    print(f"[Agent 2 LLM] {model_name} hết quota hoặc rate limit, chuyển sang model dự phòng.")
                    ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": reason_str})

                    if model_index > 0:
                        print(f"[Agent 2 LLM] Fallback model {model_name} cũng bị rate limit, dừng sớm để tránh loop vô ích.")
                        return _build_error_response(
                            "Hệ thống nhận diện đang quá tải do giới hạn lưu lượng (rate limit).",
                            status="Partial",
                            error_type="provider_quota_exhausted",
                            technical_error=True,
                            attempted_models=ag2_model_attempts,
                            fallback_used=True,
                            model_chain_used=selected_models,
                            model_chain_source=model_chain_source,
                            model_chain_source_detail=model_chain_source_detail,
                            model_chain_warning=model_chain_warning,
                        )
                    break

                if "not found" in error_msg.lower() or "does not exist" in error_msg.lower():
                    reason_str = "model_not_found"
                    ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": reason_str})
                    break

                # Lỗi server thì đợi rồi retry
                if (
                    "503" in error_msg
                    or "UNAVAILABLE" in error_msg
                    or "high demand" in error_msg.lower()
                    or "try again later" in error_msg.lower()
                    or "temporarily unavailable" in error_msg.lower()
                    or "overloaded" in error_msg.lower()
                    or "timeout" in error_msg.lower()
                ):
                    reason_str = "provider_unavailable"
                    if not primary_provider_error:
                        primary_provider_error = "high_demand"
                    if model_index + 1 < len(selected_models):
                        print(
                            f"[Agent 2 LLM] {model_name} unavailable, chuyển sang model dự phòng."
                        )
                        ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": reason_str})
                        break
                    if attempt == max_attempts:
                        ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": reason_str})
                    await asyncio.sleep(2)
                    continue

                # Lỗi khác: thử model tiếp theo
                ag2_model_attempts.append({"model": model_name, "status": "failed", "reason": reason_str})
                break
    print("[Agent 2 LLM] Thất bại sau khi thử toàn bộ model Gemini.")

    final_error_type = "technical_error"
    if any(a.get("reason") == "quota_or_rate_limit" for a in ag2_model_attempts):
        final_error_type = "provider_quota_exhausted"
    elif any(a.get("reason") == "provider_unavailable" for a in ag2_model_attempts):
        final_error_type = "provider_unavailable"

    fallback_was_used = len(selected_models) > 1 and len(ag2_model_attempts) > 1

    return _build_error_response(
        "AI provider đang quá tải hoặc hết quota. Vui lòng thử lại sau.",
        status="Partial",
        error_type=final_error_type,
        technical_error=True,
        attempted_models=ag2_model_attempts,
        fallback_used=fallback_was_used,
        model_chain_used=selected_models,
        model_chain_source=model_chain_source,
        model_chain_source_detail=model_chain_source_detail,
        model_chain_warning=model_chain_warning,
    )


def _sync_call_gemini_wrapper(
    model_name: str,
    prompt: str,
    image: Image.Image,
    temperature: float = 0.1,
    max_output_tokens: Optional[int] = None,
) -> str:
    """
    Wrapper sync để chạy trong asyncio.to_thread.
    Vì google genai generate_content là hàm sync.
    """
    try:
        response = get_gemini_client().models.generate_content(
            model=model_name,
            contents=[prompt, image],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            ),
        )
        return response.text or ""

    except TypeError:
        response = get_gemini_client().models.generate_content(
            model=model_name,
            contents=[prompt, image],
        )
        return response.text or ""
