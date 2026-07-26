import json
import time
import asyncio
from typing import Dict, Any, Optional

from app.core.config import settings
from app.agents.agent_3_lens import (
    Agent3Lens,
    parse_lens_evidence_without_llm,
    validate_agent3_identity,
)
from app.services.groq_evidence_reader_service import (
    read_evidence_with_groq,
    reconcile_ag3_evidence,
    GROQ_AVAILABLE,
)
from app.services.evidence_ranker_service import rank_lens_evidence
from app.utils.currency_normalizer import normalize_agent_vote

def _mask_secret(val: Optional[str]) -> str:
    if not val:
        return "not_set"
    v = str(val).strip()
    if len(v) <= 4:
        return "****"
    return f"****{v[-4:]}"

def _safe_raw(data: Any, return_raw: bool) -> Any:
    if return_raw:
        return data

    if isinstance(data, dict):
        return {
            "truncated": True,
            "keys": list(data.keys()),
            "msg": "Use return_raw_response=true to see full payload"
        }
    if isinstance(data, list):
        return {
            "truncated": True,
            "length": len(data),
            "msg": "Use return_raw_response=true to see full list"
        }
    return str(data)[:200] + "..." if len(str(data)) > 200 else data

async def run_ag3_test(options: Dict[str, Any], image_bytes: Optional[bytes] = None) -> Dict[str, Any]:
    """
    Main orchestration for the AG3 test page.
    Isolates the AG3 pipeline. Does NOT run AG1/AG2/AG4.
    """
    mode = str(options.get("mode") or "full_ag3").strip().lower()
    provider_req = str(options.get("provider") or "auto").strip().lower()
    return_raw = bool(options.get("return_raw_response", False))

    # Initialize response structure
    res = {
        "ok": True,
        "mode": mode,
        "provider_requested": provider_req,
        "provider_used": None,
        "run_id": f"ag3test_{int(time.time())}",
        "flow_trace": [],
        "config_debug": {
            "serpapi_key_loaded": bool(settings.SERPAPI_KEY),
            "serpapi_key_last4": _mask_secret(settings.SERPAPI_KEY),
            "groq_key_loaded": bool(settings.GROQ_API_KEY),
            "groq_key_last4": _mask_secret(settings.GROQ_API_KEY),
            "selenium_enabled_env": getattr(settings, "AGENT3_SELENIUM_ENABLED", False),
            "fallback_enabled": getattr(settings, "AGENT3_FALLBACK_ENABLED", False),
            "groq_evidence_reader_enabled_env": getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_ENABLED", False),
            "vision_resize_enabled": getattr(settings, "VISION_RESIZE_ENABLED", False),
            "vision_resize_max_side": getattr(settings, "VISION_RESIZE_MAX_SIDE", 512),
        },
        "image_debug": {
            "used_original_image": bool(options.get("use_original_image", False)),
            "image_bytes_size": len(image_bytes) if image_bytes else 0,
            "upload_provider": "none",
            "image_url_available": False,
            "image_url_domain": None,
            "image_url_error": None
        },
        "serpapi_debug": {
            "enabled": True, "attempted": False, "engine": "google_lens",
            "http_status": None, "error_type": None, "error_message": None,
            "quota_or_rate_limit": False, "raw_response_keys": [],
            "visual_matches_count": 0, "organic_results_count": 0, "image_results_count": 0,
            "evidence_count": 0
        },
        "selenium_debug": {
            "enabled": bool(options.get("enable_selenium", getattr(settings, "AGENT3_SELENIUM_ENABLED", False))),
            "attempted": False, "headless": getattr(settings, "AGENT3_SELENIUM_HEADLESS", True),
            "timeout_seconds": getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", 35),
            "skipped_reason": "selenium_disabled" if not bool(options.get("enable_selenium", getattr(settings, "AGENT3_SELENIUM_ENABLED", False))) else None,
            "error_type": None, "error_message": None,
            "evidence_count": 0, "screenshot_path": None
        },
        "evidence_harvest": {
            "count": 0, "top_n": int(options.get("top_n_evidence", 5)),
            "items": []
        },
        "deterministic_parser": {
            "status": "Failed",
            "identity": None,
            "support_count": 0, "exact_amount_support_count": 0, "independent_source_count": 0,
            "conflict_count": 0, "noise_count": 0,
            "reason": "not_run", "promoted": False
        },
        "groq_evidence_reader": {
            "enabled": bool(options.get("enable_groq_evidence_reader", getattr(settings, "AGENT3_GROQ_EVIDENCE_READER_ENABLED", False))),
            "mode": str(options.get("groq_evidence_reader_mode", "when_weak")),
            "called": False, "used": False, "skipped_reason": "not_run",
            "status": "skipped"
        },
        "reconciliation": {
            "agreement_level": "none", "eligible_for_validation": False,
            "reconciled_identity": None, "reason": "not_run"
        },
        "validator": {
            "attempted": False, "passed": False, "status": "Failed",
            "not_counted_in_consensus": True, "validation_errors": []
        },
        "ag3_final": {
            "status": "Partial", "provider": "none", "search_provider": "none",
            "quoc_gia": "KhÃ´ng xÃ¡c Ä‘á»‹nh", "ma_tien_te": "KhÃ´ng xÃ¡c Ä‘á»‹nh", "menh_gia": "KhÃ´ng xÃ¡c Ä‘á»‹nh",
            "not_counted_in_consensus": True, "validation_errors": []
        },
        "timing_ms": {},
        "raw": {"serpapi": None, "selenium": None, "groq": None}
    }

    t_start_total = time.monotonic()

    def add_trace(step, status, started_at, input_sum=None, output_sum=None, reason=None, err_type=None, err_msg=None):
        dur = int((time.monotonic() - started_at) * 1000)
        res["flow_trace"].append({
            "step": step, "status": status, "duration_ms": dur,
            "input_summary": input_sum or {}, "output_summary": output_sum or {},
            "reason": reason, "error_type": err_type, "error_message": err_msg
        })
        res["timing_ms"][step] = dur

    agent = Agent3Lens()

    # ---------------------------------------------------------
    # STEP: Image Prepare & Upload
    # ---------------------------------------------------------
    t_prepare = time.monotonic()
    image_url = None
    if image_bytes and mode in ("full_ag3", "serpapi_only", "lens_only", "evidence_only"):
        if not options.get("use_original_image", False):
            try:
                import cv2
                import numpy as np
                np_arr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if img is not None:
                    res["image_debug"]["original_width"] = img.shape[1]
                    res["image_debug"]["original_height"] = img.shape[0]
                    max_side = int(options.get("image_max_side") or 512)
                    h, w = img.shape[:2]
                    if max(h, w) > max_side:
                        scale = max_side / float(max(h, w))
                        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                        is_success, buffer = cv2.imencode(".jpg", img, [int(getattr(settings, "VISION_RESIZE_JPEG_QUALITY", 85))])
                        if is_success:
                            image_bytes = buffer.tobytes()
                    res["image_debug"]["processed_width"] = img.shape[1]
                    res["image_debug"]["processed_height"] = img.shape[0]
            except Exception as e:
                add_trace("image_prepare", "failed", t_prepare, err_type="resize_error", err_msg=str(e))
                return res

        add_trace("image_prepare", "completed", t_prepare, {"bytes": len(image_bytes)})

        t_upload = time.monotonic()
        try:
            image_url = await agent.upload_to_imgbb(image_bytes)
            if image_url:
                res["image_debug"]["image_url_available"] = True
                res["image_debug"]["image_url_domain"] = image_url.split("/")[2] if "//" in image_url else "unknown"
                add_trace("image_upload", "completed", t_upload, {"size": len(image_bytes)}, {"url_domain": res["image_debug"]["image_url_domain"]})
            else:
                res["image_debug"]["image_url_error"] = "Upload returned None"
                add_trace("image_upload", "failed", t_upload, reason="no_url_returned")
        except Exception as e:
            res["image_debug"]["image_url_error"] = str(e)
            add_trace("image_upload", "failed", t_upload, err_type="upload_exception", err_msg=str(e))

    # ---------------------------------------------------------
    # STEP: Provider Search (SerpAPI / Selenium)
    # ---------------------------------------------------------
    raw_evidence = []

    if mode in ("full_ag3", "serpapi_only", "lens_only", "evidence_only"):
        if provider_req in ("auto", "serpapi") and mode != "selenium_only":
            t_serp = time.monotonic()
            res["serpapi_debug"]["attempted"] = True
            if not image_url:
                add_trace("serpapi_lens", "failed", t_serp, reason="no_image_url")
            else:
                try:
                    import requests
                    api_key = settings.SERPAPI_KEY
                    if not api_key:
                        raise ValueError("Missing SERPAPI_KEY")

                    params = {
                        "engine": "google_lens",
                        "url": image_url,
                        "api_key": api_key,
                        "hl": "vi",
                        "country": "vn"
                    }
                    if options.get("no_cache", False):
                        params["no_cache"] = "true"

                    serp_res = await asyncio.to_thread(requests.get, "https://serpapi.com/search", params=params, timeout=20)
                    res["serpapi_debug"]["http_status"] = serp_res.status_code

                    if serp_res.status_code == 200:
                        data = serp_res.json()
                        res["raw"]["serpapi"] = _safe_raw(data, return_raw)
                        res["serpapi_debug"]["raw_response_keys"] = list(data.keys())

                        v_matches = data.get("visual_matches", [])
                        res["serpapi_debug"]["visual_matches_count"] = len(v_matches)

                        compact_data = agent._compact_serpapi_result(data)

                        raw_evidence = []
                        for item in compact_data.get("visual_matches") or []:
                            raw_evidence.append({
                                "bucket": "visual_match",
                                "title": item.get("title", ""),
                                "snippet": item.get("snippet", ""),
                                "url": item.get("link", ""),
                                "source": item.get("source", ""),
                            })

                        res["serpapi_debug"]["evidence_count"] = len(raw_evidence)
                        res["provider_used"] = "serpapi"
                        add_trace("serpapi_lens", "completed", t_serp, output_sum={"evidence_count": len(raw_evidence)})
                    else:
                        res["serpapi_debug"]["error_type"] = "http_error"
                        res["serpapi_debug"]["error_message"] = serp_res.text[:200]
                        add_trace("serpapi_lens", "failed", t_serp, err_type="http_error", err_msg=str(serp_res.status_code))
                except Exception as e:
                    res["serpapi_debug"]["error_type"] = "exception"
                    res["serpapi_debug"]["error_message"] = str(e)
                    add_trace("serpapi_lens", "failed", t_serp, err_type="exception", err_msg=str(e))

        # Fallback to selenium if needed and allowed
        if not raw_evidence and provider_req in ("auto", "selenium") and mode != "serpapi_only":
            if res["selenium_debug"]["enabled"]:
                t_sel = time.monotonic()
                res["selenium_debug"]["attempted"] = True
                res["selenium_debug"]["skipped_reason"] = None
                try:
                    res["selenium_debug"]["error_message"] = "Selenium is mocked in ag3_test_service to prevent driver zombies."
                    res["selenium_debug"]["error_type"] = "mocked_out"
                    add_trace("selenium_lens", "failed", t_sel, err_type="mocked_out", err_msg="Selenium mocked")
                except Exception as e:
                    add_trace("selenium_lens", "failed", t_sel, err_type="exception", err_msg=str(e))
            else:
                add_trace("selenium_lens", "skipped", time.monotonic(), reason="selenium_disabled")

    # ---------------------------------------------------------
    # STEP: Candidate Mode Logic
    # ---------------------------------------------------------
    if mode == "candidate_only":
        t_cand = time.monotonic()
        cand = {
            "country": str(options.get("candidate_country", "")),
            "currency_code": str(options.get("candidate_currency", "")),
            "denomination": str(options.get("candidate_denomination", "")),
            "currency_name": str(options.get("candidate_currency_name", ""))
        }

        try:
            from app.agents.agent_3_lens import build_candidate_verification_queries
            queries = build_candidate_verification_queries(cand)
            res["evidence_harvest"]["candidate_queries"] = queries
            add_trace("candidate_search", "completed", t_cand, output_sum={"queries": queries})
        except Exception as e:
            add_trace("candidate_search", "failed", t_cand, err_type="exception", err_msg=str(e))

    # ---------------------------------------------------------
    # STEP: Evidence Harvest
    # ---------------------------------------------------------
    ranked_evidence = []
    if mode in ("full_ag3", "lens_only", "evidence_only") and raw_evidence:
        t_harv = time.monotonic()
        ranked_evidence = rank_lens_evidence(raw_evidence, context="")
        top_n = int(options.get("top_n_evidence", 5))
        top_evidence = ranked_evidence[:top_n]

        res["evidence_harvest"]["count"] = len(top_evidence)
        res["evidence_harvest"]["items"] = top_evidence
        add_trace("evidence_harvest", "completed", t_harv, output_sum={"count": len(top_evidence)})
    else:
        top_evidence = []
        if mode not in ("serpapi_only", "selenium_only", "groq_reader_only", "candidate_only"):
            add_trace("evidence_harvest", "skipped", time.monotonic(), reason="no_raw_evidence")

    # ---------------------------------------------------------
    # STEP: Deterministic Parser
    # ---------------------------------------------------------
    det_result = {}
    if mode in ("full_ag3", "evidence_only") and top_evidence:
        t_det = time.monotonic()
        det_result = parse_lens_evidence_without_llm(top_evidence, raw_lens_text="")

        # Fill debug info
        res["deterministic_parser"]["status"] = det_result.get("status", "Failed")
        res["deterministic_parser"]["promoted"] = (str(det_result.get("status", "")).lower() == "completed" and not det_result.get("not_counted_in_consensus"))

        trace = det_result.get("promotion_trace", {})
        res["deterministic_parser"]["identity"] = trace.get("selected_identity")
        res["deterministic_parser"]["support_count"] = trace.get("support_count", 0)
        res["deterministic_parser"]["exact_amount_support_count"] = trace.get("exact_amount_support_count", 0)
        res["deterministic_parser"]["independent_source_count"] = trace.get("independent_source_count", 0)
        res["deterministic_parser"]["conflict_count"] = trace.get("independent_conflicting_amount_support", 0)
        res["deterministic_parser"]["conflicting_denominations"] = trace.get("conflicting_denominations", [])
        res["deterministic_parser"]["supporting_domains"] = list(trace.get("supporting_domains", []))
        res["deterministic_parser"]["reason"] = trace.get("reason", "unknown")
        res["deterministic_parser"]["promotion_path"] = trace.get("promotion_path")

        add_trace("deterministic_parser", "completed", t_det, output_sum={"promoted": res["deterministic_parser"]["promoted"], "reason": res["deterministic_parser"]["reason"]})

    # ---------------------------------------------------------
    # STEP: Groq Evidence Reader
    # ---------------------------------------------------------
    groq_result = None
    if mode in ("full_ag3", "groq_reader_only"):
        t_groq = time.monotonic()
        evidence_to_read = top_evidence

        if mode == "groq_reader_only" and options.get("manual_evidence_json"):
            try:
                evidence_to_read = json.loads(options["manual_evidence_json"])
            except Exception:
                pass

        if res["groq_evidence_reader"]["enabled"] and evidence_to_read:
            res["groq_evidence_reader"]["called"] = True
            try:
                groq_result = await read_evidence_with_groq(
                    evidence_to_read,
                    candidate_identity=det_result.get("promotion_trace", {}).get("selected_identity"),
                    timeout_seconds=float(options.get("timeout_seconds", 5.0)),
                    top_n=int(options.get("top_n_evidence", 5))
                )
                res["groq_evidence_reader"].update(groq_result)
                res["raw"]["groq"] = _safe_raw(groq_result, return_raw)
                add_trace("groq_evidence_reader", "completed", t_groq, output_sum={"status": groq_result.get("status")})
            except Exception as e:
                res["groq_evidence_reader"]["error_type"] = "exception"
                res["groq_evidence_reader"]["error_message"] = str(e)
                res["groq_evidence_reader"]["status"] = "failed"
                add_trace("groq_evidence_reader", "failed", t_groq, err_type="exception", err_msg=str(e))
        else:
            res["groq_evidence_reader"]["skipped_reason"] = "disabled_or_no_evidence"
            add_trace("groq_evidence_reader", "skipped", t_groq, reason="disabled_or_no_evidence")

    # ---------------------------------------------------------
    # STEP: Reconciliation
    # ---------------------------------------------------------
    recon_result = None
    if mode == "full_ag3":
        t_recon = time.monotonic()
        if top_evidence:
            recon_result = reconcile_ag3_evidence(
                det_result.get("promotion_trace", {}).get("selected_identity"),
                groq_result,
                top_evidence
            )
            res["reconciliation"].update(recon_result)
            add_trace("reconciliation", "completed", t_recon, output_sum={"agreement": recon_result.get("agreement_level")})
        else:
            add_trace("reconciliation", "skipped", t_recon, reason="no_evidence")

    # ---------------------------------------------------------
    # STEP: Validator & Final
    # ---------------------------------------------------------
    if mode == "full_ag3":
        t_val = time.monotonic()
        if not recon_result or not recon_result.get("eligible_for_validation"):
            final_obj = dict(det_result) if det_result else {}
            final_obj["not_counted_in_consensus"] = True
            final_obj["status"] = "Partial"
            final_obj["reconciliation_reason"] = (recon_result or {}).get("reason", "no_reconciliation")
            res["validator"]["skipped_reason"] = "not_eligible"
            add_trace("validator", "skipped", t_val, reason="not_eligible")
        else:
            res["validator"]["attempted"] = True
            validated = validate_agent3_identity(det_result, top_evidence)
            final_obj = validated
            res["validator"]["status"] = validated.get("status")
            res["validator"]["passed"] = (str(validated.get("status")).lower() == "completed" and not validated.get("not_counted_in_consensus"))
            res["validator"]["not_counted_in_consensus"] = bool(validated.get("not_counted_in_consensus"))
            res["validator"]["validation_errors"] = validated.get("validation_errors", [])
            add_trace("validator", "completed", t_val, output_sum={"passed": res["validator"]["passed"]})

        res["ag3_final"] = {
            "status": final_obj.get("status", "Partial"),
            "provider": res["provider_used"] or "none",
            "search_provider": res["provider_used"] or "none",
            "formatter_provider": "deterministic",
            "quoc_gia": final_obj.get("quoc_gia") or final_obj.get("country", "KhÃ´ng xÃ¡c Ä‘á»‹nh"),
            "ma_tien_te": final_obj.get("ma_tien_te") or final_obj.get("currency_code", "KhÃ´ng xÃ¡c Ä‘á»‹nh"),
            "menh_gia": final_obj.get("menh_gia") or final_obj.get("denomination", "KhÃ´ng xÃ¡c Ä‘á»‹nh"),
            "do_tin_cay": final_obj.get("do_tin_cay", 0.0),
            "evidence_verified": not final_obj.get("not_counted_in_consensus", True),
            "not_counted_in_consensus": final_obj.get("not_counted_in_consensus", True),
            "validation_errors": final_obj.get("validation_errors", [])
        }

    res["timing_ms"]["total"] = int((time.monotonic() - t_start_total) * 1000)
    return res
