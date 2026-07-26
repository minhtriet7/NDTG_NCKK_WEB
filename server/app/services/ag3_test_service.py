import time
import json
import asyncio
import traceback
from typing import Optional, Dict, Any
from app.core.config import settings

def extract_articles_from_parsed(parsed_result: dict, provider: str) -> dict:
    evidence = parsed_result.get("evidence", [])
    if not isinstance(evidence, list):
        evidence = []

    items = []
    for i, ev in enumerate(evidence):
        items.append({
            "rank": i + 1,
            "provider": provider,
            "source_type": ev.get("source_type", "unknown"),
            "title": ev.get("title", ""),
            "snippet": ev.get("snippet", ""),
            "url": ev.get("link") or ev.get("url", ""),
            "domain": ev.get("domain", ""),
            "page_text_excerpt": ev.get("page_text_excerpt", ""),
            "raw_position": ev.get("position", 0),
            "is_independent_source": ev.get("is_independent_source", False),
            "is_social_or_video": ev.get("is_social_media", False),
            "matched_country": ev.get("country", ""),
            "matched_currency": ev.get("currency", ""),
            "matched_denomination": ev.get("denomination", ""),
            "support_class": ev.get("support_class", "unknown"),
            "support_reason": ev.get("noise_reason", "")
        })

    return {
        "count": len(items),
        "items": items
    }

def extract_groq_from_debug_log(debug_log: dict) -> dict:
    groq = debug_log.get("groq_evidence_reader", {})
    if not groq:
        return {
            "enabled": False,
            "called": False,
            "used": False,
            "skipped_reason": "Not found in debug_log"
        }
    return groq

async def run_ag3_test(options: dict, image_bytes: bytes) -> dict:
    mode = str(options.get("mode") or "full_ag3").strip().lower()
    provider_req = str(options.get("provider_requested") or options.get("provider") or "auto").strip().lower()

    res = {
        "ok": True,
        "mode": mode,
        "provider_requested": provider_req,
        "provider_used": None,
        "run_id": f"ag3test_{int(time.time())}",
        "form_debug": options.get("_form_debug", {}),
        "image_debug": {
            "image_bytes_size": len(image_bytes) if image_bytes else 0
        },
        "config_debug": {
            "serpapi_key_loaded": bool(settings.SERPAPI_KEY),
            "groq_key_loaded": bool(getattr(settings, "GROQ_API_KEY", None)),
        },
    }

    if not image_bytes:
        res["ok"] = False
        res["error_type"] = "missing_image"
        res["error_message"] = "image_bytes is empty"
        return res

    try:
        from app.agents.agent_3_selector import _run_by_provider, run_agent3_lens, _safe_parse_agent3_result

        async def execute_provider(prov: str, isolated: bool = True):
            debug_log = {}
            t0 = time.monotonic()

            import asyncio
            import traceback
            import selenium.common.exceptions as sel_exc

            try:
                if isolated:
                    # Compute explicit deadline for selenium to bypass the 32s AGENT3_DEFAULT_BUDGET_SECONDS
                    if prov == "selenium":
                        selenium_total = float(
                            getattr(settings, "AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS", 90) or 90
                        )
                        explicit_deadline = time.monotonic() + selenium_total
                    else:
                        explicit_deadline = None  # Let selector use its default
                    raw_result = await _run_by_provider(
                        provider=prov,
                        image_bytes=image_bytes,
                        context="AG3 isolated test",
                        debug_log=debug_log,
                        deadline=explicit_deadline,
                        force_enable_selenium=options.get("enable_selenium", False),
                        disable_selenium_proxy=options.get("disable_selenium_proxy", mode == "selenium_only")
                    )
                else:
                    raw_result = await run_agent3_lens(
                        image_bytes=image_bytes,
                        context="AG3 full test",
                        debug_log=debug_log,
                        experiment_mode=False
                    )
            except (asyncio.TimeoutError, TimeoutError, sel_exc.TimeoutException) as e:
                latency = int((time.monotonic() - t0) * 1000)
                is_proxy_enabled = not options.get("disable_selenium_proxy", mode == "selenium_only")
                return {
                    "ok": False,
                    "mode": mode,
                    "provider_used": prov,
                    "status": "Failed",
                    "error_type": f"{prov}_timeout",
                    "error_message": f"{prov.capitalize()} provider timed out before returning visual results",
                    "exception_class": e.__class__.__name__,
                    "latency_ms": latency,
                    f"{prov}_debug": {
                        "attempted": True,
                        "proxy_enabled": is_proxy_enabled,
                        "failure_stage": "selector_or_provider_timeout"
                    },
                    "articles": {"count": 0, "items": []},
                    "evidence_harvest": {"count": 0, "items": []},
                    "validator": [f"{prov}_timeout"]
                }
            except (PermissionError, sel_exc.WebDriverException) as e:
                latency = int((time.monotonic() - t0) * 1000)
                is_proxy_enabled = not options.get("disable_selenium_proxy", mode == "selenium_only")
                error_type = f"{prov}_exception"
                if isinstance(e, PermissionError):
                    error_type = "google_lens_403"
                elif isinstance(e, sel_exc.WebDriverException):
                    error_type = "selenium_driver_error"
                return {
                    "ok": False,
                    "mode": mode,
                    "provider_used": prov,
                    "status": "Failed",
                    "error_type": error_type,
                    "error_message": str(e),
                    "exception_class": e.__class__.__name__,
                    "latency_ms": latency,
                    f"{prov}_debug": {
                        "attempted": True,
                        "proxy_enabled": is_proxy_enabled,
                        "failure_stage": "provider_crashed"
                    },
                    "articles": {"count": 0, "items": []},
                    "evidence_harvest": {"count": 0, "items": []},
                    "validator": [error_type]
                }
                
            latency = int((time.monotonic() - t0) * 1000)
            parsed = _safe_parse_agent3_result(raw_result)

            articles = extract_articles_from_parsed(parsed, prov)
            evidence = parsed.get("evidence", [])
            if not isinstance(evidence, list): evidence = []

            # Manually run Groq for isolated tests if requested
            if isolated and options.get("enable_groq_reader"):
                from app.services.groq_formatter_service import format_lens_evidence
                from app.agents.agent_3_lens import validate_agent3_identity
                try:
                    dl = time.monotonic() + 30
                    groq_result = await format_lens_evidence(evidence, dl)
                    if groq_result.get("ag3_groq_formatter_available") is not False:
                        validated = validate_agent3_identity(groq_result, evidence=evidence)
                        parsed.update(validated)
                        # Fix status mapping based on missing critical fields
                        status = str(validated.get("status") or "").strip().lower()
                        country = str(validated.get("quoc_gia") or "").strip().lower()
                        currency = str(validated.get("ma_tien_te") or "").strip().lower()
                        denomination = str(validated.get("menh_gia") or "").strip().lower()
                        missing_critical = (not country or country in {"không xác định", "unknown", "none"} or
                                            not currency or currency in {"không xác định", "unknown", "none"} or
                                            not denomination or denomination in {"không xác định", "unknown", "none"})
                        
                        if status == "completed" and not missing_critical:
                            parsed["status"] = "Completed"
                        else:
                            parsed["status"] = "Partial"

                        parsed["validation_errors"] = validated.get("validation_errors", [])
                        debug_log["groq_evidence_reader"] = groq_result
                    else:
                        debug_log["groq_evidence_reader"] = {"skipped_reason": groq_result.get("ag3_groq_skipped_reason")}
                except Exception as e:
                    debug_log["groq_evidence_reader"] = {"error_message": str(e), "called": True}

            promotion_trace = {
                "support_signal_count": parsed.get("support_signal_count", 0),
                "independent_source_count": parsed.get("independent_source_count", 0),
                "exact_amount_support_count": parsed.get("exact_amount_support_count", 0),
                "page_text_checked_count": parsed.get("page_text_checked_count", 0),
                "page_text_support_count": parsed.get("page_text_support_count", 0),
                "noise_filtered_evidence": parsed.get("noise_filtered_evidence", 0),
                "reason": parsed.get("reason", "")
            }
            disable_proxy = options.get("disable_selenium_proxy", mode == "selenium_only")
            env_proxy_enabled = str(getattr(settings, "AGENT3_SELENIUM_PROXY_ENABLED", "true")).lower() == "true"
            is_proxy_enabled = not disable_proxy and env_proxy_enabled

            # Additional debug context as requested
            if prov == "selenium":
                debug_log["config_debug"] = {
                    "selenium_enabled_env": True,
                    "selenium_requested_by_ui": options.get("enable_selenium", False),
                    "selenium_effective_enabled": options.get("enable_selenium", False),
                    "selenium_disabled_reason": None if options.get("enable_selenium", False) else "Disabled by UI",
                    "headless": True,
                    "timeout_seconds": getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", 60)
                }
                debug_log["selenium_debug"] = {
                    "attempted": True if options.get("enable_selenium", False) else False,
                    "disabled_reason": None if options.get("enable_selenium", False) else "Disabled by UI",
                    "attempts": getattr(settings, "AGENT3_SELENIUM_ATTEMPTS", 2),
                    "chrome_slot_acquired": True if options.get("enable_selenium", False) else False,
                    "proxy_enabled": is_proxy_enabled,
                    "proxy_used": "Dynamic" if is_proxy_enabled else None,
                    "failure_stage": parsed.get("failure_stage") or (
                        "google_lens_search_403" if parsed.get("google_lens_403")
                        else ("deadline_exceeded" if parsed.get("error_type") == "deadline_exceeded"
                        else ("google_lens_page_ready" if "did not become ready" in str(parsed.get("error_message", ""))
                        else None))
                    ),
                    "deadline_seconds": parsed.get("deadline_seconds", getattr(settings, "AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS", 90)),
                    "elapsed_ms": parsed.get("elapsed_ms"),
                    "google_lens_403": parsed.get("google_lens_403", False),
                    "final_url": parsed.get("final_url"),
                    "page_title": parsed.get("page_title"),
                    "page_text_sample": parsed.get("page_text_sample"),
                    "screenshot_path": parsed.get("screenshot_path"),
                    "html_path": parsed.get("html_path"),
                    "page_ready_timeout_seconds": getattr(settings, "AGENT3_SELENIUM_PAGE_READY_TIMEOUT_SECONDS", 45),
                    "evidence_count": len(evidence),
                    "error_type": parsed.get("error_type"),
                    "error_message": parsed.get("error_message")
                }

                if "selenium_debug" in parsed and isinstance(parsed["selenium_debug"], dict):
                    debug_log["selenium_debug"].update(parsed["selenium_debug"])

            is_ok = parsed.get("status") != "Failed" and parsed.get("status") != "Disabled"
            if parsed.get("error_type") is not None or parsed.get("error_message") is not None:
                is_ok = False

            return {
                "ok": is_ok,
                "provider_used": prov,
                "status": parsed.get("status", "Completed" if is_ok else "Failed"),
                "error_type": parsed.get("error_type", None),
                "error_message": parsed.get("error_message", None),
                "latency_ms": latency,
                "debug_log": debug_log,
                "selenium_debug": debug_log.get("selenium_debug"),
                "provider_result": {
                    "raw_result": raw_result,
                    "parsed_result": parsed
                },
                "agent_result_raw": raw_result,
                "parsed_result": parsed,
                "articles": {"count": len(articles.get("items", [])), "items": articles.get("items", [])},
                "evidence_harvest": {
                    "count": len(evidence),
                    "items": evidence
                },
                "deterministic_parser": parsed,
                "promotion_trace": promotion_trace,
                "groq_evidence_reader": extract_groq_from_debug_log(debug_log),
                "validator": parsed.get("validation_errors", []),
                "ag3_final": parsed,
                "summary": {
                    "status": parsed.get("status"),
                    "country": parsed.get("country") or parsed.get("quoc_gia"),
                    "currency": parsed.get("currency") or parsed.get("ma_tien_te"),
                    "denomination": parsed.get("denomination") or parsed.get("menh_gia"),
                    "evidence_count": len(evidence),
                    "article_count": articles["count"],
                    "evidence_verified": parsed.get("evidence_verified", False),
                    "independent_source_count": parsed.get("independent_source_count", 0),
                    "exact_amount_support_count": parsed.get("exact_amount_support_count", 0)
                }
            }
        
        if mode == "serpapi_only":
            res["provider_used"] = "serpapi"
            branch = await execute_provider("serpapi")
            res.update(branch)

        elif mode == "selenium_only":
            res["provider_used"] = "selenium"
            branch = await execute_provider("selenium")
            res.update(branch)

        elif mode == "full_ag3":
            res["provider_used"] = provider_req
            branch = await execute_provider(provider_req, isolated=False)
            res.update(branch)

        elif mode == "compare_serpapi_selenium":
            res["branches"] = {}
            try:
                res["branches"]["serpapi"] = await execute_provider("serpapi")
            except Exception as e:
                res["branches"]["serpapi"] = {
                    "ok": False,
                    "provider_used": "serpapi",
                    "status": "Failed",
                    "error_type": "serpapi_exception",
                    "error_message": str(e),
                    "exception_class": e.__class__.__name__,
                    "traceback_sample": traceback.format_exc()[-1000:],
                    "latency_ms": 10,
                    "articles": {"count": 0, "items": []},
                    "evidence_harvest": {"count": 0, "items": []},
                    "summary": {"status": "Failed"}
                }
                
            try:
                res["branches"]["selenium"] = await execute_provider("selenium")
            except Exception as e:
                res["branches"]["selenium"] = {
                    "ok": False,
                    "provider_used": "selenium",
                    "status": "Failed",
                    "error_type": "selenium_exception",
                    "error_message": str(e),
                    "exception_class": e.__class__.__name__,
                    "traceback_sample": traceback.format_exc()[-1000:],
                    "latency_ms": 10,
                    "articles": {"count": 0, "items": []},
                    "evidence_harvest": {"count": 0, "items": []},
                    "summary": {"status": "Failed"}
                }

            res["comparison"] = _compute_compare_winner(res["branches"])

        else:
            res["ok"] = False
            res["error_type"] = "invalid_mode"
            res["error_message"] = f"Unsupported mode: {mode}"

    except Exception as e:
        res["ok"] = False
        res["error_type"] = "ag3_test_exception"
        res["error_message"] = str(e)
        res["exception_class"] = e.__class__.__name__
        res["traceback_sample"] = traceback.format_exc()[-4000:]

    return res

def _compute_compare_winner(branches: dict) -> dict:
    s = branches.get("serpapi", {})
    se = branches.get("selenium", {})

    comp = {
        "winner": "none",
        "primary_provider": None,
        "fallback_provider": None,
        "reason": "",
        "serpapi_score": 0,
        "selenium_score": 0,
        "criteria": {},
        "failover_conditions": [
          "primary provider returns no evidence",
          "primary provider times out",
          "primary provider has validation_errors",
          "primary provider has conflict_count > support_count",
          "primary provider returns Partial/Failed"
        ]
    }

    if not s.get("ok") and not se.get("ok"):
        comp["reason"] = "Both failed"
        return comp

    s_sum = s.get("summary", {})
    se_sum = se.get("summary", {})

    def _voting_eligible(summ):
        return bool(summ.get("country") and summ.get("currency") and summ.get("denomination"))

    def _c(name, s_val, se_val):
        comp["criteria"][name] = f"SerpAPI={s_val} vs Selenium={se_val}"

    _c("status", s_sum.get("status"), se_sum.get("status"))
    _c("voting_eligible", _voting_eligible(s_sum), _voting_eligible(se_sum))
    _c("evidence_verified", s_sum.get("evidence_verified"), se_sum.get("evidence_verified"))
    _c("evidence_count", s_sum.get("evidence_count", 0), se_sum.get("evidence_count", 0))
    _c("article_count", s_sum.get("article_count", 0), se_sum.get("article_count", 0))
    _c("independent_source_count", s_sum.get("independent_source_count", 0), se_sum.get("independent_source_count", 0))
    _c("exact_amount_support_count", s_sum.get("exact_amount_support_count", 0), se_sum.get("exact_amount_support_count", 0))

    s_groq = s.get("groq_evidence_reader", {})
    se_groq = se.get("groq_evidence_reader", {})
    s_gsc = s_groq.get("support_count", 0)
    se_gsc = se_groq.get("support_count", 0)
    s_gcc = s_groq.get("conflict_count", 0)
    se_gcc = se_groq.get("conflict_count", 0)
    _c("groq_support_count", s_gsc, se_gsc)
    _c("groq_conflict_count", s_gcc, se_gcc)

    # Check status
    s_c = (s_sum.get("status") == "Completed")
    se_c = (se_sum.get("status") == "Completed")
    if s_c and not se_c: return _win(comp, "serpapi", "Status Completed wins")
    if se_c and not s_c: return _win(comp, "selenium", "Status Completed wins")

    # Check voting
    s_ve = _voting_eligible(s_sum)
    se_ve = _voting_eligible(se_sum)
    if s_ve and not se_ve: return _win(comp, "serpapi", "Voting eligible wins")
    if se_ve and not s_ve: return _win(comp, "selenium", "Voting eligible wins")

    # Check evidence verified
    s_ev = s_sum.get("evidence_verified", False)
    se_ev = se_sum.get("evidence_verified", False)
    if s_ev and not se_ev: return _win(comp, "serpapi", "evidence_verified=true wins")
    if se_ev and not s_ev: return _win(comp, "selenium", "evidence_verified=true wins")

    # Check counts
    s_isc = s_sum.get("independent_source_count", 0)
    se_isc = se_sum.get("independent_source_count", 0)
    if s_isc > se_isc: return _win(comp, "serpapi", f"Higher independent_source_count ({s_isc} > {se_isc})")
    if se_isc > s_isc: return _win(comp, "selenium", f"Higher independent_source_count ({se_isc} > {s_isc})")

    s_easc = s_sum.get("exact_amount_support_count", 0)
    se_easc = se_sum.get("exact_amount_support_count", 0)
    if s_easc > se_easc: return _win(comp, "serpapi", f"Higher exact_amount_support_count ({s_easc} > {se_easc})")
    if se_easc > s_easc: return _win(comp, "selenium", f"Higher exact_amount_support_count ({se_easc} > {s_easc})")

    if s_gsc > se_gsc: return _win(comp, "serpapi", f"Higher groq_support_count ({s_gsc} > {se_gsc})")
    if se_gsc > s_gsc: return _win(comp, "selenium", f"Higher groq_support_count ({se_gsc} > {s_gsc})")

    if s_gcc < se_gcc: return _win(comp, "serpapi", f"Lower groq_conflict_count ({s_gcc} < {se_gcc})")
    if se_gcc < s_gcc: return _win(comp, "selenium", f"Lower groq_conflict_count ({se_gcc} < {s_gcc})")

    s_ec = s_sum.get("evidence_count", 0)
    se_ec = se_sum.get("evidence_count", 0)
    if s_ec > se_ec: return _win(comp, "serpapi", f"Higher evidence_count ({s_ec} > {se_ec})")
    if se_ec > s_ec: return _win(comp, "selenium", f"Higher evidence_count ({se_ec} > {s_ec})")

    s_ac = s_sum.get("article_count", 0)
    se_ac = se_sum.get("article_count", 0)
    if s_ac > se_ac: return _win(comp, "serpapi", f"Higher article_count ({s_ac} > {se_ac})")
    if se_ac > s_ac: return _win(comp, "selenium", f"Higher article_count ({se_ac} > {s_ac})")


    # Latency
    s_lat = s.get("latency_ms", 999999)
    se_lat = se.get("latency_ms", 999999)
    _c("latency_ms", s_lat, se_lat)
    if s_lat < se_lat: return _win(comp, "serpapi", f"Lower latency ({s_lat}ms < {se_lat}ms)")
    if se_lat < s_lat: return _win(comp, "selenium", f"Lower latency ({se_lat}ms < {s_lat}ms)")

    comp["winner"] = "tie"
    comp["primary_provider"] = "serpapi"
    comp["fallback_provider"] = "selenium"
    comp["reason"] = "All metrics equal"
    return comp

def _win(comp: dict, winner: str, reason: str) -> dict:
    comp["winner"] = winner
    comp["reason"] = reason
    if winner == "serpapi":
        comp["serpapi_score"] = comp.get("serpapi_score", 0) + 1
        comp["primary_provider"] = "serpapi"
        comp["fallback_provider"] = "selenium"
    elif winner == "selenium":
        comp["selenium_score"] = comp.get("selenium_score", 0) + 1
        comp["primary_provider"] = "selenium"
        comp["fallback_provider"] = "serpapi"
    return comp
