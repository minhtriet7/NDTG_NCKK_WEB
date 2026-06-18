import asyncio
import json
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import requests

from app.agents.base_agent import BaseAgent
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

    async def run(self, image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
        sem = _get_semaphore()

        if sem.locked():
            print(f"[{self.agent_name}] Đang chờ cấp phát Chrome (đang full {MAX_CHROME_CONCURRENCY} slot)...")

        try:
            await asyncio.wait_for(sem.acquire(), timeout=SEMAPHORE_TIMEOUT)
        except asyncio.TimeoutError:
            print(f"[{self.agent_name}] Quá tải, không lấy được slot Chrome sau {SEMAPHORE_TIMEOUT}s.")
            return self._error_response(
                f"Hệ thống quá tải, không thể cấp phát Chrome cho Selenium trong {SEMAPHORE_TIMEOUT}s."
            )

        try:
            print(f"[{self.agent_name}] Đã cấp phát slot Chrome thành công.")
            return await asyncio.to_thread(self._run_sync, image_bytes, context)
        except Exception as exc:
            error_type = exc.__class__.__name__
            error_message = str(exc)[:200].replace("\n", " ")
            print(f"[{self.agent_name}] Lỗi type={error_type} message={error_message}")
            return self._error_response(f"Agent 3 v2 Selenium lỗi: {error_type}: {error_message}")
        finally:
            sem.release()
            print(f"[{self.agent_name}] Đã giải phóng slot Chrome.")

    def _run_sync(self, image_bytes: bytes, context: str = "") -> str:
        config = self._get_config_sync()

        if not bool(getattr(config, "enable_agent_3", True)):
            return self._disabled_response("Agent 3 đang bị tắt theo cấu hình admin.")

        if not bool(getattr(config, "lens_enabled", True)):
            return self._disabled_response("Google Lens đang bị tắt theo cấu hình admin.")

        if not bool(getattr(config, "agent3_v2_enabled", True)):
            return self._disabled_response("Agent 3 v2 Selenium đang bị tắt theo cấu hình admin.")

        if not bool(getattr(settings, "AGENT3_SELENIUM_ENABLED", False)):
            return self._disabled_response("Agent 3 Selenium đang bị tắt theo cấu hình env.")

        image_url = self._upload_to_imgbb(image_bytes)

        if not image_url:
            return self._error_response(
                "Không upload được ảnh lên ImgBB nên Agent 3 v2 không có public image_url để gửi Google Lens."
            )

        max_results = int(getattr(config, "max_results", 5) or 5)
        max_visual_matches = int(getattr(config, "max_visual_matches", 10) or 10)
        max_exact_matches = int(getattr(config, "max_exact_matches", 5) or 5)
        timeout_seconds = int(
            getattr(settings, "AGENT3_SELENIUM_TIMEOUT_SECONDS", None)
            or getattr(config, "request_timeout_seconds", 35)
            or 35
        )

        lens_url = self._build_lens_url(
            image_url=image_url,
            language_code=str(getattr(config, "language_code", "vi") or "vi"),
            country_code=str(getattr(config, "country_code", "vn") or "vn"),
        )

        evidence: List[Dict[str, Any]] = []
        max_retries = max(1, int(getattr(settings, "AGENT3_SELENIUM_MAX_RETRIES", 0) or 0) + 1)

        for attempt in range(max_retries):
            chrome_service = ChromeDriver()
            driver = None
            try:
                print(f"[{self.agent_name}] Selenium Attempt {attempt + 1}/{max_retries} ...")
                driver = chrome_service.get_driver()

                driver.get(lens_url)
                self._wait_for_lens_page(driver, timeout_seconds=timeout_seconds)

                evidence = extract_lens_evidence_from_driver(
                    driver=driver,
                    max_visual_matches=max_visual_matches,
                    max_exact_matches=max_exact_matches,
                    max_text_results=max_results,
                )

                if evidence:
                    evidence = asyncio.run(filter_alive_links(evidence))
                    print(f"[{self.agent_name}] Attempt {attempt + 1} Succeeded! Found {len(evidence)} evidence(s) (alive).")
                    break
                else:
                    print(f"[{self.agent_name}] Attempt {attempt + 1} Failed: No evidence found (Proxy might be dead or blocked).")
            except Exception as e:
                print(f"[{self.agent_name}] Attempt {attempt + 1} Error: {e}")
            finally:
                if chrome_service:
                    chrome_service.cleanup(driver)

        if not evidence:
            return self._partial_response(
                message=(
                    "Google Lens Selenium đã chạy nhưng không trích xuất được evidence hữu ích. "
                    "Có thể Google đổi giao diện, trang chưa tải đủ, hoặc bị chặn."
                ),
                raw_evidence=[],
                image_url=image_url,
            )

        ranked = rank_lens_evidence(evidence, context=context)

        result = build_banknote_result_from_evidence(
            ranked_evidence=ranked,
            method="Google Lens Selenium v2",
            image_url=image_url,
            max_evidence=max_results,
        )

        return json.dumps([result], ensure_ascii=False)

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

    def _upload_to_imgbb(self, image_bytes: bytes) -> Optional[str]:
        api_key = getattr(settings, "IMGBB_API_KEY", None)

        if not api_key:
            return None

        upload_url = "https://api.imgbb.com/1/upload"

        try:
            response = requests.post(
                upload_url,
                data={"key": api_key},
                files={"image": ("banknote.jpg", image_bytes, "image/jpeg")},
                timeout=10,
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

    def _wait_for_lens_page(self, driver, timeout_seconds: int = 35) -> None:
        start = time.time()
        last_source_len = 0
        stable_count = 0

        while time.time() - start < timeout_seconds:
            try:
                body_text = driver.execute_script("return document.body.innerText || document.body.textContent;") or ""
                body_text = body_text.lower()
                source_len = len(driver.page_source or "")

                if any(token in body_text for token in ["visual matches", "kết quả", "hình ảnh", "matches", "search"]):
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

    def _disabled_response(self, message: str) -> str:
        return json.dumps(
            [
                {
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
            ],
            ensure_ascii=False,
        )

    def _partial_response(self, message: str, raw_evidence: List[Dict[str, Any]], image_url: str = "") -> str:
        return json.dumps(
            [
                {
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
                    "image_url": image_url,
                    "evidence": raw_evidence,
                }
            ],
            ensure_ascii=False,
        )

    def _error_response(self, message: str) -> str:
        return json.dumps(
            [
                {
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
                    "error_type": "technical_error",
                    "technical_error": True,
                }
            ],
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


async def run_agent3_lens_v2(image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
    agent = Agent3LensV2()
    return await agent.run(image_bytes, context=context, debug_log=debug_log)
