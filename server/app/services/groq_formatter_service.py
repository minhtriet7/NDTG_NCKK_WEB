import asyncio
import json
import time
from typing import Any, Dict, List, Optional


try:
    from groq import AsyncGroq
    GROQ_AVAILABLE = True
    GROQ_IMPORT_ERROR = None
except ImportError as e:
    AsyncGroq = None
    GROQ_AVAILABLE = False
    GROQ_IMPORT_ERROR = str(e)


from app.core.config import settings


class GroqFormatterError(Exception):
    """Base error for the text-only Groq formatter."""


class NoEvidence(GroqFormatterError):
    pass


class MissingKey(GroqFormatterError):
    pass


class RateLimit(GroqFormatterError):
    pass


class AuthError(GroqFormatterError):
    pass


class Timeout(GroqFormatterError):
    pass


class BadJson(GroqFormatterError):
    pass


class ProviderUnavailable(GroqFormatterError):
    pass


_groq_client: Optional[AsyncGroq] = None
_groq_client_key: Optional[str] = None


def get_groq_client() -> Optional[AsyncGroq]:
    """Lazily create the client and never initialize it without a key."""
    global _groq_client, _groq_client_key


    if not GROQ_AVAILABLE:
        return None
        
    api_key = str(settings.GROQ_API_KEY or "").strip()

    if not api_key:
        return None

    if _groq_client is None or _groq_client_key != api_key:
        _groq_client = AsyncGroq(api_key=api_key)
        _groq_client_key = api_key

    return _groq_client


def _compact_text(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit]


def compact_top_evidence(evidence: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Keep at most five small, text-only Lens evidence records."""
    configured_limit = int(settings.AGENT3_FORMATTER_MAX_EVIDENCE or 5)
    max_items = max(1, min(configured_limit, 5))
    compact: List[Dict[str, str]] = []

    for raw_item in evidence or []:
        if not isinstance(raw_item, dict):
            continue

        item = {
            "title": _compact_text(raw_item.get("title"), 200),
            "snippet": _compact_text(
                raw_item.get("snippet") or raw_item.get("text"),
                600,
            ),
            "source": _compact_text(raw_item.get("source"), 120),
            "url": _compact_text(raw_item.get("url") or raw_item.get("link"), 500),
        }
        if not any(item.values()):
            continue

        compact.append(item)
        if len(compact) >= max_items:
            break

    return compact


def build_messages(compact_evidence: List[Dict[str, str]]) -> List[Dict[str, str]]:
    schema = {
        "quoc_gia": "Tên quốc gia hoặc Không xác định",
        "ma_tien_te": "Mã tiền tệ hoặc Không xác định",
        "menh_gia": "Ví dụ: 500000 VND hoặc Không xác định",
        "mat_tien": "Mặt trước / Mặt sau / Không xác định",
        "nam_phat_hanh": "Năm nếu thấy hoặc Không xác định",
        "chat_lieu": "Polymer / Cotton / Giấy / Không xác định",
        "mo_ta": "Mô tả ngắn",
        "quan_diem": "Lý do dựa trên evidence",
        "phuong_phap": "Google Lens + Groq Formatter",
        "do_tin_cay": 0.0,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Completed hoặc Partial",
        "provider": "groq",
        "not_counted_in_consensus": True,
    }
    system_prompt = (
        "Bạn là formatter text-only cho evidence Google Lens của hệ thống nhận diện "
        "tiền giấy. Chỉ trả một JSON object, không markdown và không thêm văn bản "
        "ngoài JSON. Chỉ kết luận từ evidence được cung cấp; không bịa quốc gia, "
        "tiền tệ hoặc mệnh giá. Không dùng giá bán, tỷ giá, auction price, shop "
        "price, collector price, năm phát hành hoặc mã catalog làm mệnh giá. Nếu "
        "country/currency/denomination chưa đủ rõ, trả status=Partial và "
        "not_counted_in_consensus=true. JSON chỉ là candidate; validator phía sau "
        "mới quyết định kết quả có được tính phiếu hay không. Schema bắt buộc: "
        + json.dumps(schema, ensure_ascii=False)
    )
    user_prompt = (
        "Hãy format tối đa các evidence compact sau thành đúng một JSON object: "
        + json.dumps(compact_evidence, ensure_ascii=False, separators=(",", ":"))
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _resolve_timeout(deadline: Optional[float]) -> float:
    configured = max(0.1, float(settings.AGENT3_GROQ_TIMEOUT_SECONDS or 8.0))
    if deadline is None:
        return configured

    remaining = float(deadline) - time.monotonic()
    if remaining <= 0:
        raise Timeout("Groq formatter deadline has expired.")
    return max(0.1, min(configured, remaining))


def _provider_error(exc: Exception) -> GroqFormatterError:
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)

    message = str(exc).casefold()
    if status_code in {401, 403} or any(
        marker in message for marker in ("authentication", "unauthorized", "forbidden")
    ):
        return AuthError("Groq authentication failed.")
    if status_code == 429 or any(
        marker in message for marker in ("rate limit", "rate_limit", "too many requests")
    ):
        return RateLimit("Groq rate limit reached.")
    if isinstance(status_code, int) and status_code >= 500:
        return ProviderUnavailable("Groq provider is unavailable.")
    if any(marker in message for marker in ("timeout", "timed out")):
        return Timeout("Groq formatter request timed out.")
    if any(
        marker in message
        for marker in ("connection", "unavailable", "service unavailable", "overloaded")
    ):
        return ProviderUnavailable("Groq provider is unavailable.")
    return ProviderUnavailable("Groq formatter request failed.")


def extract_json_object_or_first_list_item(raw_text: Any) -> Dict[str, Any]:
    text = str(raw_text or "").strip()
    if not text:
        raise BadJson("Groq formatter returned an empty response.")

    try:
        parsed = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise BadJson("Groq formatter returned invalid JSON.") from exc

    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], dict):
        return parsed[0]
    raise BadJson("Groq formatter JSON must be an object or a one-object list.")



def resolve_groq_models() -> List[str]:
    model_config = str(getattr(settings, "AGENT3_GROQ_MODEL", "auto") or "auto").strip().lower()
    chain_config = str(getattr(settings, "AGENT3_GROQ_MODEL_CHAIN", "") or "").strip()
    
    models = []
    if model_config == "auto" and chain_config:
        models = [m.strip() for m in chain_config.split(",") if m.strip()]
    
    if not models:
        base_model = getattr(settings, "AGENT3_GROQ_MODEL", "llama3-8b-8192")
        if base_model and base_model.lower() != "auto":
            models.append(str(base_model))
        else:
            models.append("llama3-8b-8192")
            
        fallback = getattr(settings, "AGENT3_GROQ_FALLBACK_MODEL", None)
        if fallback:
            models.append(str(fallback))
            
    # Deduplicate keeping order
    seen = set()
    dedup = []
    for m in models:
        if m not in seen:
            seen.add(m)
            dedup.append(m)
            
    return dedup


async def format_lens_evidence(
    evidence: str, deadline: float
) -> Dict[str, Any]:
    if not GROQ_AVAILABLE:
        return {
            "ag3_groq_formatter_used": False,
            "ag3_groq_formatter_available": False,
            "ag3_groq_skipped_reason": "groq_package_missing",
            "ag3_groq_error": GROQ_IMPORT_ERROR,
            "status": "Partial",
            "require_rerun": False
        }
    """Format compact evidence only; voting and validation happen elsewhere."""
    compact = compact_top_evidence(evidence)
    if not compact:
        raise NoEvidence("No compact Lens evidence is available.")

    client = get_groq_client()
    if client is None:
        raise MissingKey("GROQ_API_KEY is not configured.")

    timeout_seconds = _resolve_timeout(deadline)
    models = resolve_groq_models()
    fallback_enabled = getattr(settings, "AGENT3_GROQ_FALLBACK_ENABLED", True)
    
    last_exc = None
    
    for idx, model_name in enumerate(models):
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_name,
                    messages=build_messages(compact),
                    response_format={"type": "json_object"},
                    temperature=getattr(settings, "AGENT3_GROQ_TEMPERATURE", 0.0),
                    max_completion_tokens=getattr(settings, "AGENT3_GROQ_MAX_OUTPUT_TOKENS", 500),
                ),
                timeout=timeout_seconds,
            )
            
            try:
                raw_text = response.choices[0].message.content
            except (AttributeError, IndexError, TypeError) as exc:
                raise BadJson("Groq formatter response has no message content.") from exc

            result = extract_json_object_or_first_list_item(raw_text)
            result["ag3_groq_model_used"] = model_name
            return result
            
        except asyncio.TimeoutError as exc:
            last_exc = Timeout(f"Groq formatter exceeded its {timeout_seconds:.2f}s timeout.")
        except Exception as exc:
            last_exc = _provider_error(exc)
            
        if not fallback_enabled:
            break
            
    if last_exc:
        raise last_exc
        
    raise ProviderUnavailable("All Groq models failed.")



__all__ = [
    "AuthError",
    "BadJson",
    "GroqFormatterError",
    "MissingKey",
    "NoEvidence",
    "ProviderUnavailable",
    "RateLimit",
    "Timeout",
    "build_messages",
    "compact_top_evidence",
    "extract_json_object_or_first_list_item",
    "format_lens_evidence",
    "get_groq_client",
]
