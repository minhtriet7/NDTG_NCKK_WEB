import json
import base64
import os
import asyncio
from typing import Any, Dict, Optional, Tuple

from openai import AsyncOpenAI
import openai

from app.core.config import settings
from app.agents.agent_2_llm import JSON_TEMPLATE, validate_agent2_result, build_agent2_prompt

_openai_client = None
PRODUCTION_OPENAI_MODEL = "gpt-4o"
TEMPERATURE_RESTRICTED_MODEL_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def build_openai_params(
    model_name: str,
    temperature: Optional[float],
) -> Dict[str, Any]:
    """Build optional request parameters without changing production defaults."""
    normalized_model = str(model_name or "").strip().casefold()
    if temperature is None or normalized_model.startswith(
        TEMPERATURE_RESTRICTED_MODEL_PREFIXES
    ):
        return {}
    return {"temperature": temperature}


def _clean_api_key(value: Optional[str]) -> Optional[str]:
    key = str(value or "").strip()
    return key or None


def _build_openai_key_trace(api_key: Optional[str], source: str) -> Dict[str, Any]:
    return {
        "credential_configured": bool(api_key),
        "credential_source": source,
    }


def resolve_openai_api_key() -> Tuple[Optional[str], Dict[str, Any]]:
    settings_key = _clean_api_key(getattr(settings, "OPENAI_API_KEY", None))
    if settings_key:
        return settings_key, _build_openai_key_trace(settings_key, "settings")

    env_key = _clean_api_key(os.getenv("OPENAI_API_KEY"))
    if env_key:
        return env_key, _build_openai_key_trace(env_key, "os.environ")

    return None, _build_openai_key_trace(None, "missing")


def _record_openai_key_trace(
    trace: Dict[str, Any],
    debug_log: Optional[Dict],
    model_trace: Optional[Dict[str, Any]],
) -> None:
    if debug_log is not None:
        debug_log.update(trace)
    if model_trace is not None:
        model_trace.update(trace)


def get_openai_client(api_key: Optional[str] = None):
    global _openai_client
    if api_key is None:
        api_key, _trace = resolve_openai_api_key()
    if _openai_client is None:
        if not api_key:
            return None
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client

def _build_error_json(
    message: str,
    *,
    error_type: str = "technical_error",
    mo_ta: Optional[str] = None,
) -> str:
    return json.dumps([
        {
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": mo_ta or message,
            "quan_diem": message,
            "phuong_phap": "LLM OpenAI",
            "provider": "openai",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed",
            "error_type": error_type,
            "technical_error": True,
            "not_counted_in_consensus": True,
        }
    ], ensure_ascii=False)

def _image_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")

async def _call_openai(
    base64_image: str,
    prompt: str,
    *,
    model_name: str = PRODUCTION_OPENAI_MODEL,
    image_detail: Optional[str] = None,
    max_output_tokens: Optional[int] = None,
    temperature: Optional[float] = 0.0,
) -> str:
    client = get_openai_client()
    if not client:
        raise ValueError("OpenAI client not initialized")
    image_url = {
        "url": f"data:image/jpeg;base64,{base64_image}"
    }
    if image_detail:
        image_url["detail"] = image_detail

    request_kwargs = {
        "model": model_name,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": image_url,
                    }
                ]
            }
        ],
    }
    request_kwargs.update(build_openai_params(model_name, temperature))
    if max_output_tokens is not None:
        request_kwargs["max_completion_tokens"] = max_output_tokens

    response = await client.chat.completions.create(**request_kwargs)
    return response.choices[0].message.content


def _is_model_compatibility_error(exc: Exception) -> bool:
    message = str(exc).casefold()
    return any(
        marker in message
        for marker in (
            "model_not_found",
            "model not found",
            "does not exist",
            "unsupported model",
            "unsupported parameter",
            "not supported",
        )
    )


def _is_temperature_compatibility_error(exc: Exception) -> bool:
    message = str(exc).casefold()
    return "temperature" in message and any(
        marker in message
        for marker in (
            "unsupported value",
            "unsupported_value",
            "unsupported parameter",
            "does not support",
            "only the default",
        )
    )

async def run_agent1_openai(
    image_bytes: bytes,
    debug_log: Optional[Dict] = None,
    *,
    model_name: Optional[str] = None,
    fallback_model: Optional[str] = None,
    image_detail: Optional[str] = None,
    max_output_tokens: Optional[int] = None,
    temperature: Optional[float] = 0.0,
    model_trace: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Agent 1 dùng OpenAI GPT-4o Vision để nhận diện tiền giấy.
    Trả về chuỗi JSON chuẩn.
    """
    _api_key, openai_key_trace = resolve_openai_api_key()
    _record_openai_key_trace(openai_key_trace, debug_log, model_trace)
    if not _api_key:
        return _build_error_json(
            "OpenAI API key is missing or disabled.",
            error_type="missing_api_key",
            mo_ta="OpenAI provider is not configured.",
        )
    client = get_openai_client(_api_key)
    if not client:
        return _build_error_json(
            "OpenAI API key is missing or disabled.",
            error_type="missing_api_key",
            mo_ta="OpenAI provider is not configured.",
        )

    try:
        base64_img = _image_to_base64(image_bytes)
    except Exception as e:
        return _build_error_json("Không thể xử lý ảnh đầu vào cho OpenAI.")

    # Tái sử dụng prompt của Agent 2 nhưng thêm yêu cầu bọc trong object "results" nếu cần cho JSON object format
    base_prompt = build_agent2_prompt()
    prompt = base_prompt + "\n\nQUAN TRỌNG: Bạn BẮT BUỘC phải trả về một JSON Object chứa một mảng với key là 'results' chứa cấu trúc như sau:\n" + JSON_TEMPLATE
    selected_model = model_name or PRODUCTION_OPENAI_MODEL
    fallback_candidates = [
        candidate
        for candidate in (selected_model, fallback_model)
        if candidate
    ]
    model_candidates = list(dict.fromkeys(fallback_candidates))

    if debug_log is not None:
        debug_log["prompt"] = prompt
        debug_log["model"] = selected_model
    if model_trace is not None:
        model_trace["requested_model"] = selected_model
        model_trace["model"] = selected_model
        model_trace["fallback_model"] = fallback_model

    try:
        raw_response = None
        for index, candidate_model in enumerate(model_candidates):
            if model_trace is not None:
                model_trace["model"] = candidate_model
                model_trace["fallback_used"] = index > 0
                model_trace["temperature_requested"] = temperature
                model_trace["temperature_omitted"] = not bool(
                    build_openai_params(candidate_model, temperature)
                )
            try:
                try:
                    raw_response = await _call_openai(
                        base64_img,
                        prompt,
                        model_name=candidate_model,
                        image_detail=image_detail,
                        max_output_tokens=max_output_tokens,
                        temperature=temperature,
                    )
                except Exception as exc:
                    if not _is_temperature_compatibility_error(exc):
                        raise
                    if model_trace is not None:
                        model_trace["temperature_omitted"] = True
                        model_trace["temperature_retry"] = True
                    raw_response = await _call_openai(
                        base64_img,
                        prompt,
                        model_name=candidate_model,
                        image_detail=image_detail,
                        max_output_tokens=max_output_tokens,
                        temperature=None,
                    )
                break
            except Exception as exc:
                has_fallback = index + 1 < len(model_candidates)
                if not has_fallback or not _is_model_compatibility_error(exc):
                    raise

        if raw_response is None:
            raise RuntimeError("OpenAI did not return a response.")
        
        if debug_log is not None:
            debug_log["raw_response"] = raw_response
            debug_log["model"] = (
                model_trace.get("model")
                if model_trace is not None
                else selected_model
            )
            
        # Parse JSON vì OpenAI trả về {"results": [...]}
        try:
            parsed = json.loads(raw_response)
            if "results" in parsed:
                json_text = json.dumps(parsed["results"])
            else:
                json_text = raw_response
        except Exception:
            json_text = raw_response
            
        is_valid, msg, normalized = validate_agent2_result(
            json_text,
            robust=model_name is not None,
        )

        needs_retry = False
        parsed_dict = None
        if is_valid and normalized:
            try:
                parsed_arr = json.loads(normalized)
                if parsed_arr and isinstance(parsed_arr, list):
                    parsed_dict = parsed_arr[0]
            except: pass

            if parsed_dict:
                from app.agents.agent_2_llm import _is_invalid_value
                status = parsed_dict.get("status", "")
                menh_gia = parsed_dict.get("menh_gia", "")
                quoc_gia = parsed_dict.get("quoc_gia", "")

                is_missing_denomination = _is_invalid_value(menh_gia) or "không xác định" in str(menh_gia).lower()
                is_missing_country = _is_invalid_value(quoc_gia) or "không xác định" in str(quoc_gia).lower()
                is_uncertain = "uncertain" in status.lower() or "partial" in status.lower()

                if is_missing_denomination or is_missing_country or is_uncertain:
                    needs_retry = True

        if is_valid and normalized and not needs_retry:
            try:
                data = json.loads(normalized)
                data[0]["phuong_phap"] = "LLM OpenAI"
                data[0]["status"] = "Completed"
                return json.dumps(data, ensure_ascii=False)
            except Exception:
                return normalized

        # Retry once if needed
        if needs_retry or not is_valid:
            print(f"[Agent 1 OpenAI] Retry do {'thiếu trường (quốc gia/mệnh giá)' if needs_retry else 'JSON không hợp lệ'}...")
            try:
                retry_response = await _call_openai(
                    base64_img,
                    prompt + "\n\nCHÚ Ý: Lần trước bạn đã trả về thiếu mệnh giá/quốc gia hoặc sai format JSON. Hãy quan sát HÌNH ẢNH thật kĩ, TÌM SỐ MỆNH GIÁ THUẦN TÚY và CHỈ trả về đúng định dạng JSON.",
                    model_name=candidate_model,
                    image_detail=image_detail,
                    max_output_tokens=max_output_tokens,
                    temperature=temperature,
                )
                try:
                    retry_parsed = json.loads(retry_response)
                    if "results" in retry_parsed:
                        retry_json = json.dumps(retry_parsed["results"])
                    else:
                        retry_json = retry_response
                except:
                    retry_json = retry_response

                r_valid, r_msg, r_norm = validate_agent2_result(retry_json, robust=True)
                if r_valid and r_norm:
                    try:
                        data = json.loads(r_norm)
                        data[0]["phuong_phap"] = "LLM OpenAI"
                        if "uncertain" not in data[0].get("status", "").lower():
                            data[0]["status"] = "Completed"
                        return json.dumps(data, ensure_ascii=False)
                    except Exception:
                        return r_norm
            except Exception as e_retry:
                print(f"[Agent 1 OpenAI] Retry thất bại: {e_retry}")
        
        # Nếu retry vẫn lỗi hoặc thiếu, trả về kết quả hợp lệ tốt nhất hiện tại (nếu có)
        if is_valid and normalized:
            try:
                data = json.loads(normalized)
                data[0]["phuong_phap"] = "LLM OpenAI"
                return json.dumps(data, ensure_ascii=False)
            except Exception:
                return normalized

        return _build_error_json("OpenAI returned an invalid recognition payload.")

    except openai.AuthenticationError:
        return _build_error_json(
            "OpenAI authentication failed.",
            error_type="provider_auth_error",
            mo_ta="OpenAI provider authentication failed.",
        )
    except Exception as e:
        return _build_error_json("OpenAI provider request failed.")
