import os
import random
from typing import List, Optional

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

from app.core.logger import get_logger
from app.core.config import settings


logger = get_logger(__name__)


class ChromeDriver:
    """
    ChromeDriver dùng cho Agent 3 Google Lens.

    Hỗ trợ proxy.data dạng:
    - 1.2.3.4:8000
    - HTTP|1.2.3.4:8000
    - http://1.2.3.4:8000
    - https://1.2.3.4:8000
    - socks5://1.2.3.4:1080

    Proxy có username/password dạng user:pass@host:port có thể không ổn định
    với Chrome option --proxy-server. Nên dùng proxy whitelist IP nếu có thể.
    """

    def __init__(self, proxy_file_path: Optional[str] = None):
        self.project_root = self._get_project_root()
        self.proxy_file_path = proxy_file_path or os.path.join(
            self.project_root,
            "proxy.data",
        )
        self.proxies = self._load_proxies()

    def _get_project_root(self) -> str:
        """
        File này thường nằm ở:
        server/app/utils/chrome_driver.py

        Đi ngược 3 cấp sẽ về thư mục server/.
        """
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..")
        )

    def _load_proxies(self) -> List[str]:
        loaded_proxies: List[str] = []

        if not os.path.exists(self.proxy_file_path):
            logger.warning(
                "Proxy file not found at %s. ChromeDriver will run without proxy.",
                self.proxy_file_path,
            )
            return loaded_proxies

        try:
            with open(self.proxy_file_path, "r", encoding="utf-8") as file:
                for line in file:
                    line = line.strip()

                    if not line or line.startswith("#"):
                        continue

                    proxy = self._normalize_proxy(line)

                    if proxy:
                        loaded_proxies.append(proxy)

        except Exception as exc:
            logger.warning(
                "Failed to load proxy file %s: %s",
                self.proxy_file_path,
                exc,
            )
            return []

        logger.info("Loaded %s proxies from proxy.data.", len(loaded_proxies))
        return loaded_proxies

    def _normalize_proxy(self, proxy_line: str) -> Optional[str]:
        proxy = proxy_line.strip()

        if not proxy:
            return None

        if "|" in proxy:
            proxy = proxy.split("|", 1)[1].strip()

        if not proxy:
            return None

        if proxy.startswith(("http://", "https://", "socks5://", "socks4://")):
            return proxy

        return f"http://{proxy}"

    def _pick_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None

        return random.choice(self.proxies)

    def _build_options(self) -> Options:
        chrome_options = Options()

        headless = getattr(settings, "CHROME_HEADLESS", True)

        if headless:
            chrome_options.add_argument("--headless=new")

        chrome_binary_path = getattr(settings, "CHROME_BINARY_PATH", None)

        if chrome_binary_path:
            chrome_options.binary_location = chrome_binary_path

        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")

        chrome_options.add_argument("--disable-notifications")
        chrome_options.add_argument("--disable-popup-blocking")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-background-networking")
        chrome_options.add_argument("--disable-sync")
        chrome_options.add_argument("--metrics-recording-only")
        chrome_options.add_argument("--mute-audio")

        chrome_options.add_argument("--disable-blink-features=AutomationControlled")

        chrome_options.add_experimental_option(
            "excludeSwitches",
            ["enable-logging", "enable-automation"],
        )
        chrome_options.add_experimental_option("useAutomationExtension", False)

        user_agent = getattr(
            settings,
            "CHROME_USER_AGENT",
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )

        chrome_options.add_argument(f"user-agent={user_agent}")

        selected_proxy = self._pick_proxy()

        if selected_proxy:
            logger.info("Agent 3 ChromeDriver is using proxy: %s", selected_proxy)
            chrome_options.add_argument(f"--proxy-server={selected_proxy}")
        else:
            logger.info("Agent 3 ChromeDriver is running without proxy.")

        return chrome_options

    def _build_service(self) -> Service:
        driver_path = getattr(settings, "CHROME_DRIVER_PATH", None)

        if driver_path and os.path.exists(driver_path):
            return Service(driver_path)

        return Service(ChromeDriverManager().install())

    def get_driver(self):
        chrome_options = self._build_options()
        service = self._build_service()

        try:
            driver = webdriver.Chrome(service=service, options=chrome_options)

            page_timeout = int(getattr(settings, "CHROME_PAGE_LOAD_TIMEOUT", 30))
            script_timeout = int(getattr(settings, "CHROME_SCRIPT_TIMEOUT", 30))

            driver.set_page_load_timeout(page_timeout)
            driver.set_script_timeout(script_timeout)

            try:
                driver.execute_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
                )
            except Exception:
                pass

            return driver

        except Exception as exc:
            logger.error("Failed to initialize ChromeDriver: %s", exc, exc_info=True)
            raise