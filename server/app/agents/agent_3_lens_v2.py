import asyncio
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import requests

from app.agents.base_agent import BaseAgent
from app.agents.agent_3_lens import (
    AGENT3_DEFAULT_BUDGET_SECONDS,
    validate_agent3_identity,
)
from app.core.config import settings
from app.services.admin_service import AdminService
from app.services.chrome_driver import ChromeDriver
from app.services.evidence_ranker_service import (
    build_banknote_result_from_evidence,
    rank_lens_evidence,
)
from app.services.lens_parser_service import extract_lens_evidence_from_driver
from app.utils.link_validator import filter_alive_links


MAX_CHROME_CONCURRENCY = 2
SEMAPHORE_TIMEOUT = 20
_CHROME_SEMAPHORE = None
_CHROME_SEMAPHORE_LOOP = None


def _remaining_budget(deadline: float) -> float:
    return max(0.0, deadline - time.monotonic())


def _bounded_timeout(deadline: float, cap_seconds: float, reserve_seconds: float = 0.25) -> float:
    remaining = _remaining_budget(deadline) - reserve_seconds
    if remaining <= 0:
        raise TimeoutError("Agent 3 Selenium deadline exhausted.")
    return max(0.1, min(float(cap_seconds), remaining))

def _get_semaphore() -> asyncio.Semaphore:
    global _CHROME_SEMAPHORE, _CHROME_SEMAPHORE_LOOP
    loop = asyncio.get_running_loop()
    if _CHROME_SEMAPHORE is None or _CHROME_SEMAPHORE_LOOP is not loop:
        _CHROME_SEMAPHORE = asyncio.Semaphore(MAX_CHROME_CONCURRENCY)
        _CHROME_SEMAPHORE_LOOP = loop
    return _CHROME_SEMAPHORE


class Agent3LensV2(BaseAgent):
    """
    Agent 3 v2 — Google Lens bằng Selenium + proxy.

    Flow thật:
    1. Nhận image_bytes.
    2. Upload ảnh lên ImgBB để có public image_url.
    3. Mở Google Lens qua URL uploadbyurl.
    4. Dùng Selenium đọc kết quả visual/text matches.
    5. Parse evidence.
    6. Rank evidence liên quan tiền giấy.
    7. Build JSON cùng schema với Agent 1/2/Aggregator.

    Không xử lý captcha. Nếu Google chặn hoặc không trả kết quả thì trả Partial/Failed
    để selector có thể fallback sang SerpApi v1.
    """

    def __init__(self):
        super().__init__(agent_name="Agent 3 v2 (Google Lens Selenium)")

    async def run(
        self,
        image_bytes: bytes,
        context: str = "",
        debug_log: Optional[Dict] = None,
        deadline: Optional[float] = None,
        disable_selenium_proxy: bool = False,
        **kwargs,
    ) -> str:
        deadline = deadline or (time.monotonic() + AGENT3_DEFAULT_BUDGET_SECONDS)
        sem = _get_semaphore()

        if sem.locked():
            print(f"[{self.agent_name}] Đang chờ cấp phát Chrome (đang full {MAX_CHROME_CONCURRENCY} slot)...")

        try:
            semaphore_timeout = _bounded_timeout(deadline, SEMAPHORE_TIMEOUT)
            await asyncio.wait_for(sem.acquire(), timeout=semaphore_timeout)
        except (asyncio.TimeoutError, TimeoutError):
            print(f"[{self.agent_name}] Quá tải hoặc hết deadline khi chờ Chrome.")
            return self._error_response(
                "Hệ thống quá tải hoặc Agent 3 đã hết deadline khi chờ Chrome."
            )

        try:
            print(f"[{self.agent_name}] Đã cấp phát slot Chrome thành công.")
            # Use selenium-specific timeout (not the global 32s AG3 budget)
            selenium_budget = float(
                getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", 60)
                or 60
            )
            test_deadline_seconds = float(
                getattr(settings, "AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS", 90)
                or 90
            )
            # For isolated test calls, allow the extended deadline
            if deadline and (deadline - time.monotonic()) > selenium_budget:
                execution_timeout = deadline - time.monotonic()
            else:
                execution_timeout = max(selenium_budget, test_deadline_seconds)

            # Make sure inner thread terminates BEFORE the outer timeout
            sync_deadline = time.monotonic() + execution_timeout - 5.0

            result = await asyncio.wait_for(
                asyncio.to_thread(self._run_sync, image_bytes, context, sync_deadline, disable_selenium_proxy),
                timeout=execution_timeout,
            )
            if debug_log is not None:
                debug_log["deadline_remaining_seconds"] = round(_remaining_budget(sync_deadline), 3)
            return result
        except (asyncio.TimeoutError, TimeoutError) as e:
            return self._error_response(
                f"Agent 3 Selenium vượt quá deadline {execution_timeout:.0f}s và đã dừng chờ kết quả.",
                error_code="deadline_exceeded",
                failure_stage="deadline_exceeded",
                deadline_seconds=execution_timeout,
            )
        except Exception as exc:
            import traceback
            error_type = exc.__class__.__name__
            error_message = str(exc)[:200].replace("\n", " ")
            tb_str = traceback.format_exc()
            print(f"[{self.agent_name}] Lỗi type={error_type} message={error_message}")
            print(f"Traceback:\n{tb_str}")
            return self._error_response(f"Agent 3 v2 Selenium lỗi: {error_type}: {error_message}", traceback_sample=tb_str)
        finally:
            sem.release()
            print(f"[{self.agent_name}] Đã giải phóng slot Chrome.")

    def _run_sync(
        self,
        image_bytes: bytes,
        context: str = "",
        deadline: Optional[float] = None,
        disable_selenium_proxy: bool = False,
    ) -> str:
        # Use selenium-specific budget, not AGENT3_DEFAULT_BUDGET_SECONDS (32s)
        _selenium_budget = float(getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", 60) or 60)
        _test_budget = float(getattr(settings, "AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS", 90) or 90)
        _effective_budget = max(_selenium_budget, _test_budget)
        deadline = deadline or (time.monotonic() + _effective_budget)
        config = self._get_config_sync()

        upload_timeout = _bounded_timeout(deadline, 10.0)
        image_url = self._upload_to_imgbb(image_bytes, timeout_seconds=upload_timeout)

        if not image_url:
            return self._error_response(
                "Không upload được ảnh lên ImgBB nên Agent 3 v2 không có public image_url để gửi Google Lens."
            )

        max_results = int(getattr(config, "max_results", 5) or 5)
        max_visual_matches = int(getattr(config, "max_visual_matches", 10) or 10)
        max_exact_matches = int(getattr(config, "max_exact_matches", 5) or 5)
        timeout_seconds = int(
            getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", None)
            or getattr(config, "request_timeout_seconds", 60)
            or 60
        )
        page_ready_timeout = int(getattr(settings, "AGENT3_SELENIUM_PAGE_READY_TIMEOUT_SECONDS", 45))

        lens_urls = [
            self._build_lens_url(
                image_url=image_url,
                language_code=str(getattr(config, "language_code", "vi") or "vi"),
                country_code=str(getattr(config, "country_code", "vn") or "vn"),
            ),
            self._build_searchbyimage_url(
                image_url=image_url,
                language_code=str(getattr(config, "language_code", "vi") or "vi"),
                country_code=str(getattr(config, "country_code", "vn") or "vn"),
            )
        ]

        evidence: List[Dict[str, Any]] = []
        last_provider_error: Optional[Exception] = None
        max_retries = max(1, int(getattr(settings, "AGENT3_SELENIUM_ATTEMPTS", 3) or 3))

        debug_kwargs = {}

        import selenium.common.exceptions as sel_exc

        strategies = [
            ("google_home_lens_interactive", "https://www.google.com"),
            ("lens_uploadbyurl_direct", lens_urls[0]),
            ("google_searchbyimage_direct", lens_urls[1] if len(lens_urls) > 1 else lens_urls[0]),
        ]
        strategies_attempted = []
        strategy_used = None

        print(f"[{self.agent_name}] Will attempt URLs: 1={lens_urls[0]} | 2={lens_urls[1] if len(lens_urls) > 1 else 'none'}")

        for attempt in range(max_retries):
            if _remaining_budget(deadline) <= 0.25:
                return self._error_response(
                    "Agent 3 Selenium hết deadline trước khi hoàn tất Lens.",
                    error_code="deadline_exceeded",
                    **debug_kwargs
                )
            chrome_service = ChromeDriver(disable_proxy=disable_selenium_proxy)
            driver = None
            strat_name, strat_url = strategies[attempt % len(strategies)]
            strategies_attempted.append(strat_name)
            strategy_used = strat_name
            try:
                print(f"[{self.agent_name}] Selenium Attempt {attempt + 1}/{max_retries} ...")
                driver = chrome_service.get_driver()

                proxy_enabled = not chrome_service.disable_proxy
                proxy_used = chrome_service.selected_proxy
                user_agent = chrome_service.selected_user_agent
                window_size = chrome_service.selected_window_size

                def dump_debug_info_wrapper(stage):
                    d = self._dump_debug_info(driver, run_id=f"attempt_{attempt+1}", stage=stage)
                    d.update({
                        "strategy_used": strategy_used,
                        "strategies_attempted": strategies_attempted.copy(),
                        "proxy_enabled": proxy_enabled,
                        "proxy_used": proxy_used,
                        "user_agent": user_agent,
                        "window_size": window_size,
                        "result_card_count": len(evidence) if "evidence" in locals() and evidence else 0,
                        "external_link_count": len(evidence) if "evidence" in locals() and evidence else 0,
                    })
                    return d

                print(f"[{self.agent_name}] Attempt {attempt + 1}: Strategy={strat_name} Navigating to URL={strat_url}")
                try:
                    driver.set_page_load_timeout(max(5.0, _remaining_budget(deadline) - 2.0))
                except Exception:
                    pass
                driver.get(strat_url)

                if strat_name == "google_home_lens_interactive":
                    self._run_interactive_lens_flow(driver, image_url, deadline)

                try:
                    after_get_url = driver.current_url
                    page_title = driver.title
                except Exception:
                    after_get_url = "unknown"
                    page_title = "unknown"
                print(f"[{self.agent_name}] Attempt {attempt + 1}: current_url={after_get_url}")
                print(f"[{self.agent_name}] Attempt {attempt + 1}: page_title={page_title}")

                wait_timeout = _bounded_timeout(deadline, page_ready_timeout)
                self._wait_for_lens_page(driver, timeout_seconds=wait_timeout)

                evidence = extract_lens_evidence_from_driver(
                    driver=driver,
                    max_visual_matches=max_visual_matches,
                    max_exact_matches=max_exact_matches,
                    max_text_results=max_results,
                )

                if evidence:
                    link_timeout = _bounded_timeout(deadline, 5.0)
                    evidence = asyncio.run(
                        asyncio.wait_for(
                            filter_alive_links(evidence),
                            timeout=link_timeout,
                        )
                    )
                    print(f"[{self.agent_name}] Attempt {attempt + 1} Succeeded! Found {len(evidence)} evidence(s).")
                    break
                else:
                    print(f"[{self.agent_name}] Attempt {attempt + 1} Failed: No evidence found.")
                    last_provider_error = Exception("Selenium opened Google Lens but found no visual result cards")
                    debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="no_evidence")
            except PermissionError as e:
                last_provider_error = e
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="permission_error")
                debug_kwargs["google_lens_403"] = True
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: 403 PermissionError: {e}")
                break
            except RuntimeError as e:
                last_provider_error = e
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage=str(e))
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: RuntimeError: {e}")
            except sel_exc.TimeoutException as e:
                last_provider_error = Exception(f"Google Lens page did not become ready within {wait_timeout}s")
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="timeout_exception")
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: TimeoutException: {last_provider_error}")
            except (asyncio.TimeoutError, TimeoutError) as e:
                last_provider_error = Exception(f"Google Lens page or extraction timed out within {wait_timeout}s")
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="timeout_error")
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: TimeoutError: {last_provider_error}")
            except sel_exc.WebDriverException as e:
                msg = str(e).split("\n")[0]
                if "ERR_PROXY" in msg or "ERR_TUNNEL" in msg or "ERR_TIMED_OUT" in msg or "ERR_CONNECTION_CLOSED" in msg or "ERR_SOCKS" in msg:
                    last_provider_error = Exception(f"proxy_blocked_by_google: {msg}")
                else:
                    last_provider_error = Exception(f"Chrome WebDriver error: {msg}")
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="webdriver_error")
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: WebDriverException: {last_provider_error}")
            except Exception as e:
                last_provider_error = Exception(str(e) or repr(e))
                debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="unknown_error")
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: {last_provider_error}")
            finally:
                if chrome_service and driver:
                    try:
                        if "selenium_debug" not in debug_kwargs:
                            debug_kwargs["selenium_debug"] = dump_debug_info_wrapper(stage="before_cleanup")
                    except Exception:
                        pass
                    chrome_service.cleanup(driver)

        if _remaining_budget(deadline) <= 0.25:
            if debug_kwargs.get("google_lens_403"):
                return self._error_response(
                    "Google Lens returned 403 permission error",
                    error_code="google_lens_403",
                    failure_stage="google_lens_search_403",
                    evidence=[],
                    articles=[],
                    status="Failed",
                    not_counted_in_consensus=True,
                    **debug_kwargs
                )

            elapsed_ms = int((time.monotonic() - (deadline - _effective_budget)) * 1000)
            return self._error_response(
                f"Agent 3 Selenium hết deadline sau {elapsed_ms}ms. Không lấy được kết quả.",
                error_code="deadline_exceeded",
                failure_stage="deadline_exceeded",
                deadline_seconds=_effective_budget,
                elapsed_ms=elapsed_ms,
                **debug_kwargs
            )

        if not evidence and last_provider_error is not None:
            error_code = "provider_error"
            err_str = str(last_provider_error)
            if "timed out" in err_str.lower() or "did not become ready" in err_str.lower():
                error_code = "selenium_lens_page_timeout"
            elif "webdriver" in err_str.lower():
                error_code = "selenium_driver_error"
            elif "403 permission error" in err_str.lower():
                error_code = "google_lens_403"
            elif "google_captcha_or_unusual_traffic" in err_str:
                error_code = "google_captcha_or_unusual_traffic"
            elif "google_consent_page" in err_str:
                error_code = "google_consent_page"
            elif "google_sign_in" in err_str:
                error_code = "google_signin_required"
            elif "proxy_blocked_by_google" in err_str:
                error_code = "proxy_blocked_by_google"
            elif "no visual result cards" in err_str.lower() or "selenium_no_visual_results" in err_str:
                error_code = "selenium_no_visual_results"

            if error_code == "selenium_no_visual_results":
                return self._error_response(
                    f"{err_str}",
                    error_code=error_code,
                    evidence=[],
                    articles=[],
                    status="Failed",
                    **debug_kwargs
                )

            if error_code == "google_lens_403":
                return self._error_response(
                    "Google Lens returned 403 permission error",
                    error_code=error_code,
                    failure_stage="google_lens_search_403",
                    evidence=[],
                    articles=[],
                    status="Failed",
                    not_counted_in_consensus=True,
                    **debug_kwargs
                )

            return self._error_response(
                f"{err_str}",
                error_code=error_code,
                **debug_kwargs
            )

        if not evidence:
            return self._error_response(
                message="Selenium opened Google Lens but found no visual result cards",
                error_code="selenium_no_visual_results",
                **debug_kwargs
            )

        ranked = rank_lens_evidence(evidence, context=context)

        result = build_banknote_result_from_evidence(
            ranked_evidence=ranked,
            method="Google Lens Selenium v2",
            image_url=image_url,
            max_evidence=max_results,
        )
        validated = validate_agent3_identity(result, evidence=ranked[:max_results])
        return json.dumps([validated], ensure_ascii=False)

    def _get_config_sync(self):
        """
        Agent chạy trong thread sync. Cần đọc async AdminService bằng event loop riêng.
        Nếu có lỗi DB config thì tạo object rỗng lấy default từ settings/env.
        """
        try:
            return asyncio.run(AdminService.get_system_config())
        except RuntimeError:
            # Trường hợp đang có loop ở thread hiện tại: fallback object env.
            return _EnvFallbackConfig()
        except Exception:
            return _EnvFallbackConfig()

    def _upload_to_imgbb(
        self,
        image_bytes: bytes,
        timeout_seconds: float = 10.0,
    ) -> Optional[str]:
        api_key = getattr(settings, "IMGBB_API_KEY", None)

        if not api_key:
            return None

        upload_url = "https://api.imgbb.com/1/upload"

        try:
            response = requests.post(
                upload_url,
                data={"key": api_key},
                files={"image": ("banknote.jpg", image_bytes, "image/jpeg")},
                timeout=max(0.1, float(timeout_seconds)),
            )
            data = response.json()

            if response.status_code >= 400:
                return None

            return (
                data.get("data", {}).get("url")
                or data.get("data", {}).get("display_url")
                or data.get("data", {}).get("image", {}).get("url")
            )
        except Exception:
            return None

    def _build_lens_url(self, image_url: str, language_code: str = "vi", country_code: str = "vn") -> str:
        """
        Google Lens có endpoint uploadbyurl. Đây ổn định hơn việc click icon Lens trên trang Google.
        """
        encoded_url = quote_plus(image_url)
        hl = quote_plus(language_code or "vi")
        country = quote_plus(country_code or "vn")
        return f"https://lens.google.com/uploadbyurl?url={encoded_url}&hl={hl}&gl={country}"

    def _build_searchbyimage_url(self, image_url: str, language_code: str = "vi", country_code: str = "vn") -> str:
        encoded_url = quote_plus(image_url)
        hl = quote_plus(language_code or "vi")
        country = quote_plus(country_code or "vn")
        return f"https://www.google.com/searchbyimage?image_url={encoded_url}&hl={hl}&gl={country}"

    def _dump_debug_info(self, driver, run_id: str = "", stage: str = "") -> dict:
        import uuid
        import os
        if not run_id:
            run_id = str(uuid.uuid4())[:8]
        html_path = f"tmp/ag3_selenium_debug_{run_id}.html"
        png_path = f"tmp/ag3_selenium_debug_{run_id}.png"
        debug_dump_error = None

        os.makedirs("tmp", exist_ok=True)
        try:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(driver.page_source)
        except Exception as e:
            html_path = None
            debug_dump_error = f"HTML dump failed: {e}"

        try:
            driver.save_screenshot(png_path)
        except Exception as e:
            png_path = None
            if not debug_dump_error:
                debug_dump_error = f"PNG dump failed: {e}"

        try:
            final_url = driver.current_url
        except Exception:
            final_url = None

        try:
            page_title = driver.title
        except Exception:
            page_title = None

        try:
            page_text_sample = driver.execute_script("return document.body.innerText || document.body.textContent;")
            if page_text_sample:
                page_text_sample = page_text_sample[:1000]
        except Exception:
            page_text_sample = None

        return {
            "final_url": final_url,
            "page_title": page_title,
            "page_text_sample": page_text_sample,
            "screenshot_path": png_path,
            "html_path": html_path,
            "debug_dump_error": debug_dump_error,
            "failure_stage": stage
        }


    def _run_interactive_lens_flow(self, driver, image_url: str, deadline: float) -> None:
        import time
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys
        time.sleep(1.0)
        lens_selectors = [
            ("css selector", "div[aria-label='Tìm kiếm bằng hình ảnh']"),
            ("css selector", "div[aria-label='Search by image']"),
            ("css selector", "div[jsname='R5m1W']"),
            ("xpath", "//div[@aria-label='Tìm kiếm bằng hình ảnh']"),
            ("xpath", "//div[@aria-label='Search by image']"),
        ]
        lens_btn = None
        for by, sel in lens_selectors:
            try:
                el = driver.find_element(by, sel)
                if el.is_displayed():
                    lens_btn = el
                    break
            except Exception:
                continue
        if not lens_btn:
            raise Exception("interactive_lens_button_not_found")

        lens_btn.click()
        time.sleep(1.5)

        input_selectors = [
            ("css selector", "input[placeholder*='liên kết']"),
            ("css selector", "input[placeholder*='link']"),
            ("css selector", "input.cB9M7"),
            ("xpath", "//input[contains(@placeholder, 'link') or contains(@placeholder, 'liên kết')]"),
        ]
        url_input = None
        for by, sel in input_selectors:
            try:
                el = driver.find_element(by, sel)
                if el.is_displayed():
                    url_input = el
                    break
            except Exception:
                continue

        if not url_input:
            raise Exception("interactive_url_input_not_found")

        url_input.send_keys(image_url)
        url_input.send_keys(Keys.RETURN)
        time.sleep(1.0)

    def _wait_for_lens_page(self, driver, timeout_seconds: int = 35) -> None:
        start = time.time()
        last_source_len = 0
        stable_count = 0

        while time.time() - start < timeout_seconds:
            try:
                body_text = driver.execute_script("return document.body.innerText || document.body.textContent;") or ""
                body_text = body_text.lower()
                source_len = len(driver.page_source or "")

                # Check for Google 403
                if "403. that" in body_text or "does not have permission" in body_text or "from this server" in body_text or "error 403" in body_text or "forbidden" in body_text or "error 403" in (driver.title or "").lower() or "forbidden" in (driver.title or "").lower():
                    raise PermissionError("Google Lens returned 403 permission error")

                if "unusual traffic" in body_text or "bất thường" in body_text or "captcha" in body_text:
                    raise RuntimeError("google_captcha_or_unusual_traffic")

                if "before you continue to google" in body_text or "đồng ý" in body_text or "chấp nhận" in body_text or "consent" in (driver.current_url or ""):
                    raise RuntimeError("google_consent_page")

                if "sign in" in body_text and "accounts.google.com" in (driver.current_url or ""):
                    raise RuntimeError("google_sign_in")

                if "no results" in body_text or "không tìm thấy" in body_text:
                    # Let it pass so extraction can run and return no evidence
                    pass

                if any(token in body_text for token in ["visual matches", "kết quả", "hình ảnh", "matches", "search", "tìm kiếm"]):
                    if source_len == last_source_len:
                        stable_count += 1
                    else:
                        stable_count = 0

                    last_source_len = source_len

                    if stable_count >= 2:
                        return

                if source_len > 50000:
                    return

            except Exception:
                pass

            time.sleep(1.0)

        raise TimeoutError(
            f"Google Lens page did not become ready within {timeout_seconds:.1f}s."
        )

    def _disabled_response(self, message: str) -> str:
        payload = {
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": message,
            "quan_diem": message,
            "phuong_phap": "Google Lens Selenium v2",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Disabled",
            "provider": "selenium",
        }
        return json.dumps(
            [validate_agent3_identity(payload, evidence=[])],
            ensure_ascii=False,
        )

    def _partial_response(self, message: str, raw_evidence: List[Dict[str, Any]], image_url: str = "") -> str:
        payload = {
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": message,
            "quan_diem": message,
            "phuong_phap": "Google Lens Selenium v2",
            "do_tin_cay": 0.15,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Partial",
            "provider": "selenium",
            "error_type": "no_source",
            "image_url": image_url,
            "evidence": raw_evidence,
        }
        return json.dumps(
            [validate_agent3_identity(payload, evidence=raw_evidence)],
            ensure_ascii=False,
        )

    def _error_response(
        self,
        message: str,
        error_code: str = "technical_error",
        **kwargs
    ) -> str:
        payload = {
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": "Agent 3 v2 không tạo được kết quả hợp lệ.",
            "quan_diem": message,
            "phuong_phap": "Google Lens Selenium v2",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed",
            "provider": "selenium",
            "error_type": error_code,
            "error_code": error_code,
            "error_message": message,
            "technical_error": True,
        }
        payload.update(kwargs)
        return json.dumps(
            [validate_agent3_identity(payload, evidence=[])],
            ensure_ascii=False,
        )


class _EnvFallbackConfig:
    enable_agent_3 = True
    lens_enabled = True
    agent3_v2_enabled = False

    lens_provider = "serpapi"
    lens_fallback_enabled = False
    lens_fallback_provider = "selenium"

    language_code = "vi"
    country_code = "vn"
    max_results = 5
    max_visual_matches = 10
    max_exact_matches = 5
    request_timeout_seconds = 35


async def run_agent3_lens_v2(
    image_bytes: bytes,
    context: str = "",
    debug_log: Optional[Dict] = None,
    deadline: Optional[float] = None,
    **kwargs,
) -> str:
    kwargs.pop("force_enable", None)
    kwargs.pop("force_enable_selenium", None)

    agent = Agent3LensV2()
    return await agent.run(
        image_bytes,
        context=context,
        debug_log=debug_log,
        deadline=deadline,
        **kwargs
    )
