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
    "ma_tien_te": "Mã tiền tệ, ví dụ: VND, USD, EUR",
    "menh_gia": "Số + mã tiền tệ, ví dụ: 500000 VND, 1 USD",
    "mat_tien": "Mặt trước / Mặt sau / Không xác định",
    "nam_phat_hanh": "Năm phát hành nếu nhìn thấy, nếu không thì ghi Không xác định",
    "chat_lieu": "Polymer / Cotton / Giấy / Không xác định",
    "mo_ta": "Mô tả ngắn gọn đặc điểm chính của tờ tiền",
    "quan_diem": "Lý giải vì sao chọn kết quả này, dựa trên chữ, số, chân dung, biểu tượng, màu sắc hoặc hoa văn nhìn thấy",
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


def clean_json(text: str) -> str:
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
            "quan_diem": "Không nhận được nội dung phản hồi từ mô hình.",
            "phuong_phap": "LLM Gemini",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed"
        }], ensure_ascii=False)

    candidate = _extract_json_substring(text)

    try:
        parsed = json.loads(candidate)

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
            "quan_diem": f"Nội dung thô không parse được thành JSON hợp lệ: {text[:300]}",
            "phuong_phap": "LLM Gemini",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed"
        }], ensure_ascii=False)


def _parse_json_list(json_text: str) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    try:
        data = json.loads(json_text)
    except Exception as e:
        return None, f"Không parse được JSON: {e}"

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
    text = _normalize_upper_ascii(denomination)

    match = re.search(r"\b(VND|THB|LAK|KHR|MMK|MYR|SGD|IDR|PHP|BND|USD|EUR|JPY|CNY|KRW)\b", text)
    if match:
        return match.group(1)

    return None


def _normalize_upper_ascii(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _normalize_denomination(value: Any, country: Any = None) -> str:
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

    lower = text.lower()

    replacements = {
        "vnđ": "vnd",
        "đồng": "vnd",
        "dong": "vnd",
        "đ": "vnd",
        "baht": "thb",
        "riel": "khr",
        "kip": "lak",
        "kyat": "mmk",
        "ringgit": "myr",
        "rupiah": "idr",
        "peso": "php",
        "dollar": "usd",
        "đô la": "usd",
    }

    for k, v in replacements.items():
        lower = lower.replace(k, v)

    number_match = re.search(r"[\d,.]+", lower)
    if not number_match:
        return text

    number_raw = number_match.group(0)
    number_clean = number_raw.replace(".", "").replace(",", "")

    try:
        number_int = int(number_clean)
    except Exception:
        return text

    currency_match = re.search(
        r"\b(vnd|thb|lak|khr|mmk|myr|sgd|idr|php|bnd|usd|eur|jpy|cny|krw)\b",
        lower
    )

    if currency_match:
        return f"{number_int} {currency_match.group(1).upper()}"

    # Nếu không thấy currency, suy luận từ quốc gia nếu có
    country_text = _normalize_text(country)
    expected_currency = SEA_CURRENCY_MAP.get(country_text)

    if expected_currency:
        return f"{number_int} {expected_currency}"

    return str(number_int)


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


def validate_agent2_result(json_text: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validate sâu kết quả Agent 2.
    Trả về:
    - valid: True/False
    - message: lý do
    - normalized_json_text: JSON đã chuẩn hóa nếu valid
    """
    data, message = _parse_json_list(json_text)
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

    if _is_invalid_value(country):
        return False, "Không xác định được quốc gia", None

    # Kiểm tra quốc gia có trong danh sách hỗ trợ không
    expected_currency = _expected_currency_for_country(country)
    if expected_currency is None and country != "Khác":
        return False, f"Quốc gia chưa được hỗ trợ: {country}", None

    # Chuẩn hóa mệnh giá
    item["menh_gia"] = _normalize_denomination(item.get("menh_gia"), country=country)

    if _is_invalid_value(item["menh_gia"]) or item["menh_gia"] == "Không xác định":
        return False, "Không xác định được mệnh giá", None

    # Kiểm tra currency trong mệnh giá
    currency_in_denom = _extract_currency_from_denomination(item["menh_gia"])

    if currency_in_denom is None:
        # Nếu mệnh giá chỉ có số, thêm currency từ quốc gia
        number_match = re.search(r"\d+", item["menh_gia"])
        if number_match and expected_currency:
            item["menh_gia"] = f"{number_match.group(0)} {expected_currency}"
        else:
            return False, "Mệnh giá không có số hợp lệ", None
    else:
        if expected_currency and currency_in_denom != expected_currency:
            return False, (
                f"Mâu thuẫn quốc gia và tiền tệ: {country} phải là "
                f"{expected_currency}, nhưng model trả {currency_in_denom}"
            ), None

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

Phạm vi nhận diện ưu tiên bao gồm các quốc gia Đông Nam Á và ngoại tệ phổ biến:
- Việt Nam: VND
- Thái Lan: THB
- Lào: LAK
- Campuchia: KHR
- Myanmar: MMK
- Malaysia: MYR
- Singapore: SGD
- Indonesia: IDR
- Philippines: PHP
- Brunei: BND
- Timor-Leste: USD
- Hoa Kỳ: USD
- Châu Âu: EUR
- Nhật Bản: JPY
- Trung Quốc: CNY
- Hàn Quốc: KRW

Bạn cần phân tích:
1. Quốc gia phát hành.
2. Mệnh giá và đơn vị tiền tệ.
3. Mặt trước hoặc mặt sau của tờ tiền.
4. Năm phát hành nếu có nhìn thấy trên ảnh.
5. Chất liệu nếu có thể suy luận: Polymer, Cotton, Giấy hoặc Không xác định.
6. Văn bản nhìn thấy trên ảnh.
7. Đặc điểm chính: màu sắc, chân dung, công trình, quốc huy, hoa văn, số mệnh giá.
8. Lý do chọn kết quả.

Quy tắc bắt buộc:
- Nếu tờ tiền nằm ngoài danh sách hỗ trợ, bắt buộc trả về quoc_gia là "Khác" và ghi rõ quốc gia thật vào mo_ta. Không tự ý gán ghép sai.
- Chỉ trả về JSON hợp lệ, không viết giải thích bên ngoài JSON.
- Không dùng markdown.
- Không bịa thông tin nếu ảnh không đủ rõ.
- Nếu không chắc chắn, ghi "Không xác định".
- Field "menh_gia" phải có dạng: "Số + mã tiền tệ", ví dụ "500000 VND", "100 THB", "1 USD".
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


def _build_error_response(error_message: str, status: str = "Failed") -> str:
    return json.dumps([{
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
        "status": status
    }], ensure_ascii=False)


async def _call_gemini_once(
    model_name: str,
    prompt: str,
    image: Image.Image,
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
                temperature=0.1,
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

async def run_agent2_llm(image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
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

    for model_name in FALLBACK_MODELS:
        print(f"[Agent 2 LLM] Đang thử model: {model_name}")

        for attempt in range(1, MAX_ATTEMPTS_PER_MODEL + 1):
            print(f"[Agent 2 LLM] Model {model_name}, attempt {attempt}/{MAX_ATTEMPTS_PER_MODEL}")

            prompt = build_agent2_prompt(context=context, model_name=model_name)

            # Nếu attempt thứ 2, nhấn mạnh lại lỗi format
            if attempt > 1:
                prompt += """

LƯU Ý QUAN TRỌNG:
Lần trước kết quả không hợp lệ.
Hãy trả về ĐÚNG JSON theo template.
Không thêm chữ bên ngoài JSON.
Không thiếu field.
"""

            try:
                raw_text = await asyncio.to_thread(
                    _sync_call_gemini_wrapper,
                    model_name,
                    prompt,
                    safe_img,
                )

                if debug_log is not None:
                    debug_log["prompt_sent"] = prompt
                    debug_log["raw_response"] = raw_text

                cleaned = clean_json(raw_text)
                valid, message, normalized_json = validate_agent2_result(cleaned)

                if valid and normalized_json:
                    print(f"[Agent 2 LLM] Nhận JSON hợp lệ từ {model_name}")

                    # Gắn đúng model vào phuong_phap
                    try:
                        parsed = json.loads(normalized_json)
                        parsed[0]["phuong_phap"] = f"LLM Gemini - {model_name}"
                        parsed[0]["status"] = "Completed"
                        return json.dumps(parsed, ensure_ascii=False)
                    except Exception:
                        return normalized_json

                last_invalid_json = cleaned
                last_error = message
                print(f"[Agent 2 LLM] JSON không hợp lệ từ {model_name}: {message}")

                # Nếu JSON sai thì retry cùng model
                await asyncio.sleep(1)

            except Exception as e:
                error_msg = str(e)
                last_error = error_msg

                print(f"[Agent 2 LLM] Lỗi với model {model_name}: {error_msg}")

                # Hết quota thì chuyển model ngay
                if (
                    "429" in error_msg
                    or "RESOURCE_EXHAUSTED" in error_msg
                    or "quota" in error_msg.lower()
                ):
                    print(f"[Agent 2 LLM] {model_name} hết quota, chuyển sang model dự phòng.")
                    break

                # Lỗi server thì đợi rồi retry
                if (
                    "503" in error_msg
                    or "UNAVAILABLE" in error_msg
                    or "overloaded" in error_msg.lower()
                    or "timeout" in error_msg.lower()
                ):
                    await asyncio.sleep(2)
                    continue

                # Lỗi khác: thử model tiếp theo
                break

    print("[Agent 2 LLM] Thất bại sau khi thử toàn bộ model Gemini.")

    detail = "Tất cả model Gemini đều lỗi hoặc trả JSON sai cấu trúc."
    if last_error:
        detail += f" Lỗi cuối: {last_error}"
    if last_invalid_json:
        detail += f" JSON cuối nhận được: {last_invalid_json[:500]}"

    return _build_error_response(detail)


def _sync_call_gemini_wrapper(model_name: str, prompt: str, image: Image.Image) -> str:
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
                temperature=0.1,
            ),
        )
        return response.text or ""

    except TypeError:
        response = get_gemini_client().models.generate_content(
            model=model_name,
            contents=[prompt, image],
        )
        return response.text or ""