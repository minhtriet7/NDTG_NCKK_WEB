import json
from typing import Any, Dict, Optional

from app.agents.agent_3_lens import run_agent3_lens as run_agent3_lens_v1
from app.agents.agent_3_lens_v2 import run_agent3_lens_v2
from app.core.config import settings
from app.services.admin_service import AdminService


DEBUG_AGENT3_SELECTOR = True


def _log(message: str, data: Any = None) -> None:
    if not DEBUG_AGENT3_SELECTOR:
        return

    prefix = "[Agent3Selector]"

    if data is None:
        print(f"{prefix} {message}", flush=True)
        return

    try:
        print(
            f"{prefix} {message}: {json.dumps(data, ensure_ascii=False, default=str)[:3000]}",
            flush=True,
        )
    except Exception:
        print(f"{prefix} {message}: {data}", flush=True)


def _agent3_response(
    status: str,
    message: str,
    method: str = "Agent 3 Selector",
    provider: str = "disabled",
    confidence: float = 0.0,
    technical_error: bool = False,
) -> str:
    payload = {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": message,
        "quan_diem": message,
        "phuong_phap": method,
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": status,
        "provider": provider,
    }

    if technical_error:
        payload["error_type"] = "technical_error"
        payload["technical_error"] = True

    return json.dumps([payload], ensure_ascii=False)


def _normalize_provider(value: Any) -> str:
    provider = str(value or "serpapi").strip().lower()

    aliases = {
        "v1": "serpapi",
        "serp": "serpapi",
        "serp_api": "serpapi",
        "google_lens_serpapi": "serpapi",
        "v2": "selenium",
        "selenium_lens": "selenium",
        "google_lens_selenium": "selenium",
        "off": "disabled",
        "false": "disabled",
        "none": "disabled",
    }

    return aliases.get(provider, provider)


def _setting_value(name: str, default: Any = None) -> Any:
    explicit_fields = getattr(settings, "model_fields_set", set())
    if name not in explicit_fields:
        return default

    value = getattr(settings, name, default)
    if isinstance(value, str) and value.strip() == "":
        return default
    return value


def _resolve_provider(config: Any) -> str:
    provider = (
        _setting_value("AGENT3_PRIMARY_PROVIDER")
        or _setting_value("AGENT3_PROVIDER")
        or getattr(config, "lens_provider", None)
        or getattr(config, "agent3_provider", None)
        or "serpapi"
    )
    return _normalize_provider(provider)


def _resolve_fallback_provider(config: Any, provider: str) -> str:
    raw_fallback = (
        _setting_value("AGENT3_FALLBACK_PROVIDER")
        or getattr(config, "lens_fallback_provider", None)
        or getattr(config, "agent3_fallback_provider", None)
    )

    fallback_provider = _normalize_provider(raw_fallback)
    if not fallback_provider or fallback_provider == provider:
        fallback_provider = "selenium" if provider == "serpapi" else "serpapi"

    return fallback_provider


def _resolve_fallback_enabled(config: Any) -> bool:
    if _setting_value("AGENT3_FALLBACK_ENABLED", None) is not None:
        return bool(getattr(settings, "AGENT3_FALLBACK_ENABLED"))

    return bool(
        getattr(config, "lens_fallback_enabled", False)
        or getattr(config, "agent3_fallback_enabled", False)
    )


def _is_selenium_enabled(config: Any) -> bool:
    if _setting_value("AGENT3_SELENIUM_ENABLED", None) is not None:
        return bool(getattr(settings, "AGENT3_SELENIUM_ENABLED"))

    return bool(getattr(config, "agent3_v2_enabled", False))


def _safe_parse_agent3_result(raw_result: Any) -> Dict[str, Any]:
    try:
        if isinstance(raw_result, dict):
            return raw_result

        parsed = json.loads(raw_result)

        if isinstance(parsed, list):
            return parsed[0] if parsed else {}

        if isinstance(parsed, dict):
            return parsed

        return {}
    except Exception:
        return {}


def _is_invalid_text(value: Any) -> bool:
    text = str(value or "").strip().lower()

    return text in {
        "",
        "không xác định",
        "khong xac dinh",
        "unknown",
        "none",
        "null",
        "n/a",
        "na",
        "failed",
        "error",
    }


def _is_weak_agent3_result(raw_result: str) -> bool:
    """
    True nghĩa là kết quả Agent 3 quá yếu, nên fallback nếu được bật.
    Ví dụ:
    - status Failed/Error
    - status Partial mà evidence rỗng
    - country và denomination đều Không xác định
    """
    data = _safe_parse_agent3_result(raw_result)

    if not data:
        return True

    status = str(data.get("status") or "").strip().lower()
    evidence = data.get("evidence") or []
    denomination = data.get("menh_gia") or data.get("denomination")
    country = data.get("quoc_gia") or data.get("country")
    confidence = float(data.get("do_tin_cay") or data.get("confidence") or 0.0)

    if status in {"failed", "fail", "error"}:
        return True

    if status in {"disabled"}:
        return True

    if status == "partial" and not evidence:
        return True

    # Nếu SerpApi trả "Không xác định" và confidence cực thấp, đừng coi là weak
    # để gọi Selenium, vì Selenium cũng sẽ tốn nhiều thời gian vô ích.
    # Nhận luôn Failed/Partial.
    if confidence <= 0.1 and _is_invalid_text(denomination):
        return False

    if _is_invalid_text(denomination) and _is_invalid_text(country):
        return True

    return False


def _summarize_result(raw_result: str) -> Dict[str, Any]:
    data = _safe_parse_agent3_result(raw_result)

    return {
        "status": data.get("status"),
        "provider": data.get("provider"),
        "country": data.get("quoc_gia") or data.get("country"),
        "denomination": data.get("menh_gia") or data.get("denomination"),
        "confidence": data.get("do_tin_cay") or data.get("confidence"),
        "method": data.get("phuong_phap"),
        "evidence_count": len(data.get("evidence") or []),
        "description": str(data.get("mo_ta") or "")[:300],
    }


async def _run_by_provider(provider: str, image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
    provider = _normalize_provider(provider)

    _log("Running provider", {"provider": provider, "image_bytes": len(image_bytes)})

    if provider == "serpapi":
        result = await run_agent3_lens_v1(image_bytes, context=context, debug_log=debug_log)
        _log("Provider serpapi finished", _summarize_result(result))
        return result

    if provider == "selenium":
        result = await run_agent3_lens_v2(image_bytes, context=context, debug_log=debug_log)
        _log("Provider selenium finished", _summarize_result(result))
        return result

    if provider == "disabled":
        result = _agent3_response(
            status="Disabled",
            message="Agent 3 đang bị tắt theo cấu hình admin.",
            provider="disabled",
        )
        _log("Provider disabled", _summarize_result(result))
        return result

    result = _agent3_response(
        status="Failed",
        message=f"Agent 3 provider không hợp lệ: {provider}",
        provider=provider,
        technical_error=True,
    )
    _log("Invalid provider", _summarize_result(result))
    return result


async def run_agent3_lens(image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
    """
    Entry point thay thế cho app.agents.agent_3_lens.run_agent3_lens.
    RecognitionService chỉ cần import hàm này.
    """
    _log("Start Agent 3 selector")

    try:
        config = await AdminService.get_system_config()
    except Exception as exc:
        _log("Cannot read admin config, fallback to v1", {"error": str(exc)})

        try:
            result = await run_agent3_lens_v1(image_bytes, context=context, debug_log=debug_log)
            _log("Fallback v1 after config error finished", _summarize_result(result))
            return result
        except Exception as fallback_exc:
            _log(
                "Fallback v1 after config error failed",
                {"config_error": str(exc), "fallback_error": str(fallback_exc)},
            )
            return _agent3_response(
                status="Failed",
                message=f"Không đọc được cấu hình Agent 3 và fallback v1 cũng lỗi: {exc}",
                provider="unknown",
                technical_error=True,
            )

    enable_agent_3 = bool(getattr(config, "enable_agent_3", True))
    lens_enabled = bool(getattr(config, "lens_enabled", True))
    provider = _resolve_provider(config)
    fallback_enabled = _resolve_fallback_enabled(config)
    fallback_provider = _resolve_fallback_provider(config, provider)
    selenium_enabled = _is_selenium_enabled(config)

    _log(f"primary provider = {provider}")
    _log(f"fallback provider = {fallback_provider}")
    _log(f"fallback enabled = {fallback_enabled}")
    _log(f"selenium enabled = {selenium_enabled}")

    if not enable_agent_3 or not lens_enabled or provider == "disabled":
        _log("Agent 3 disabled by admin config")
        return _agent3_response(
            status="Disabled",
            message="Agent 3 đang bị tắt theo cấu hình admin.",
            provider="disabled",
        )

    if provider == "selenium" and not selenium_enabled:
        _log("Agent 3 v2 disabled by admin config")
        return _agent3_response(
            status="Disabled",
            message="Agent 3 Selenium đang bị tắt theo cấu hình.",
            provider="selenium",
        )

    try:
        primary_result = await _run_by_provider(provider, image_bytes, context=context, debug_log=debug_log)
        primary_summary = _summarize_result(primary_result)
        primary_is_weak = _is_weak_agent3_result(primary_result)

        _log(
            "Primary result evaluated",
            {
                "provider": provider,
                "is_weak": primary_is_weak,
                "summary": primary_summary,
            },
        )

        if (
            primary_is_weak
            and fallback_enabled
            and fallback_provider != provider
            and fallback_provider != "disabled"
            and (fallback_provider != "selenium" or selenium_enabled)
        ):
            _log(
                "fallback_used=True reason=primary_result_weak",
                {"from_provider": provider, "fallback_provider": fallback_provider},
            )
            _log(
                "Primary result weak, running fallback",
                {
                    "from_provider": provider,
                    "fallback_provider": fallback_provider,
                    "primary_summary": primary_summary,
                },
            )

            fallback_result = await _run_by_provider(
                fallback_provider,
                image_bytes,
                context=context,
                debug_log=debug_log,
            )

            fallback_summary = _summarize_result(fallback_result)
            _log("Fallback result finished", fallback_summary)

            try:
                parsed = json.loads(fallback_result)

                if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                    parsed[0]["fallback_from_provider"] = provider
                    parsed[0]["fallback_reason"] = "Primary Agent 3 result was weak or empty."
                    parsed[0]["primary_result_summary"] = primary_summary
                    return json.dumps(parsed, ensure_ascii=False)

                if isinstance(parsed, dict):
                    parsed["fallback_from_provider"] = provider
                    parsed["fallback_reason"] = "Primary Agent 3 result was weak or empty."
                    parsed["primary_result_summary"] = primary_summary
                    return json.dumps(parsed, ensure_ascii=False)

            except Exception as parse_exc:
                _log("Cannot attach fallback metadata", {"error": str(parse_exc)})
                return fallback_result

            return fallback_result

        _log(
            f"fallback_used=False reason={'primary_weak_but_fallback_disabled' if primary_is_weak else 'primary_result_accepted'}"
        )
        return primary_result

    except Exception as exc:
        error_type = exc.__class__.__name__
        error_message = str(exc)[:200].replace("\n", " ")
        _log(f"primary failed type={error_type} message={error_message}")

        if (
            fallback_enabled
            and fallback_provider != provider
            and fallback_provider != "disabled"
            and (fallback_provider != "selenium" or selenium_enabled)
        ):
            try:
                _log(
                    "fallback_used=True reason=primary_exception",
                    {"from_provider": provider, "fallback_provider": fallback_provider},
                )
                fallback_result = await _run_by_provider(
                    fallback_provider,
                    image_bytes,
                    context=context,
                    debug_log=debug_log,
                )

                fallback_summary = _summarize_result(fallback_result)
                _log(f"fallback success status={fallback_summary.get('status')}")

                try:
                    parsed = json.loads(fallback_result)

                    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                        parsed[0]["fallback_from_provider"] = provider
                        parsed[0]["fallback_error"] = str(exc)
                        return json.dumps(parsed, ensure_ascii=False)

                    if isinstance(parsed, dict):
                        parsed["fallback_from_provider"] = provider
                        parsed["fallback_error"] = str(exc)
                        return json.dumps(parsed, ensure_ascii=False)

                except Exception:
                    return fallback_result

                return fallback_result

            except Exception as fallback_exc:
                fb_error_type = fallback_exc.__class__.__name__
                fb_error_message = str(fallback_exc)[:200].replace("\n", " ")
                _log(f"fallback failed type={fb_error_type} message={fb_error_message}")

                return _agent3_response(
                    status="Failed",
                    message=(
                        f"Agent 3 provider '{provider}' lỗi: {error_type}: {error_message}. "
                        f"Fallback '{fallback_provider}' cũng lỗi: {fb_error_type}: {fb_error_message}."
                    ),
                    provider=provider,
                    technical_error=True,
                )

        _log(
            "fallback_used=False reason=primary_exception_no_enabled_fallback",
            {"provider": provider, "fallback_provider": fallback_provider},
        )
        return _agent3_response(
            status="Failed",
            message=f"Agent 3 provider '{provider}' lỗi: {error_type}: {error_message}",
            provider=provider,
            technical_error=True,
        )
