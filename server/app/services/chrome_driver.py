import os
import random
import tempfile
import shutil
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
    ChromeDriver dùng cho Agent 3 Google Lens Selenium.

    Hỗ trợ proxy.data:
    - 1.2.3.4:8000
    - HTTP|1.2.3.4:8000
    - HTTPS|1.2.3.4:8000
    - SOCKS5|1.2.3.4:1080
    - http://1.2.3.4:8000
    - socks5://1.2.3.4:1080
    """

    def __init__(self, proxy_file_path: Optional[str] = None, disable_proxy: bool = False):
        self.project_root = self._get_project_root()
        self.proxy_file_path = proxy_file_path or os.path.join(
            self.project_root,
            "proxy.data",
        )

        env_proxy_enabled = str(getattr(settings, "AGENT3_SELENIUM_PROXY_ENABLED", "true")).lower() == "true"
        self.disable_proxy = disable_proxy or not env_proxy_enabled

        self.proxy_used_file_path = os.path.join(self.project_root, "proxy_used.data")
        self.proxies = [] if self.disable_proxy else self._load_proxies()
        self.used_proxies = [] if self.disable_proxy else self._load_used_proxies()
        self.user_data_dir: Optional[str] = None

        self.selected_proxy: Optional[str] = None
        self.selected_user_agent: Optional[str] = None
        self.selected_window_size: Optional[str] = None

    def _get_project_root(self) -> str:
        # server/app/services/chrome_driver.py -> server/
        return os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..")
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
            logger.warning("Failed to load proxy file %s: %s", self.proxy_file_path, exc)
            return []

        logger.info("Loaded %s proxies from proxy.data.", len(loaded_proxies))
        return loaded_proxies

    def _normalize_proxy(self, proxy_line: str) -> Optional[str]:
        proxy = proxy_line.strip()

        if not proxy:
            return None

        if "|" in proxy:
            typ, host = proxy.split("|", 1)
            typ = typ.strip().lower()
            host = host.strip()

            if not host:
                return None

            if typ in {"socks5", "socks4"}:
                return f"{typ}://{host}"

            return f"http://{host}"

        if proxy.startswith(("http://", "https://", "socks5://", "socks4://")):
            return proxy

        return f"http://{proxy}"

    def _load_used_proxies(self) -> List[str]:
        used = []
        if os.path.exists(self.proxy_used_file_path):
            try:
                with open(self.proxy_used_file_path, "r", encoding="utf-8") as f:
                    used = [line.strip() for line in f if line.strip()]
            except Exception:
                pass
        return used

    def _save_used_proxy(self, proxy: str) -> None:
        try:
            with open(self.proxy_used_file_path, "a", encoding="utf-8") as f:
                f.write(f"{proxy}\n")
        except Exception:
            pass

    def _reset_used_proxies(self) -> None:
        try:
            if os.path.exists(self.proxy_used_file_path):
                os.remove(self.proxy_used_file_path)
            self.used_proxies = []
        except Exception:
            pass

    def _pick_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None

        available = [p for p in self.proxies if p not in self.used_proxies]
        if not available:
            self._reset_used_proxies()
            available = self.proxies

        chosen = random.choice(available)
        self.used_proxies.append(chosen)
        self._save_used_proxy(chosen)
        return chosen

    def _build_options(self) -> Options:
        chrome_options = Options()

        headless = bool(getattr(settings, "CHROME_HEADLESS", True))

        if headless:
            chrome_options.add_argument("--headless=new")

        chrome_binary_path = (
            getattr(settings, "CHROME_BINARY_PATH", None)
            or getattr(settings, "CHROME_PATH", None)
        )

        if chrome_binary_path:
            chrome_options.binary_location = chrome_binary_path

        self.user_data_dir = tempfile.mkdtemp(prefix="agent3_chrome_")

        chrome_options.add_argument(f"--user-data-dir={self.user_data_dir}")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")

        window_sizes = ["1920,1080", "1366,768", "1440,900", "1536,864"]
        self.selected_window_size = random.choice(window_sizes)
        chrome_options.add_argument(f"--window-size={self.selected_window_size}")

        chrome_options.add_argument("--lang=vi-VN,vi,en-US,en")
        chrome_options.add_argument("--disable-notifications")
        chrome_options.add_argument("--disable-popup-blocking")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--mute-audio")
        chrome_options.add_argument("--ignore-certificate-errors")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")

        chrome_options.add_experimental_option(
            "excludeSwitches",
            ["enable-logging", "enable-automation"],
        )
        chrome_options.add_experimental_option("useAutomationExtension", False)

        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ]

        self.selected_user_agent = getattr(
            settings,
            "CHROME_USER_AGENT",
            random.choice(user_agents),
        )

        chrome_options.add_argument(f"--user-agent={self.selected_user_agent}")

        self.selected_proxy = self._pick_proxy()

        if self.selected_proxy:
            logger.info("Agent 3 ChromeDriver is using proxy: %s", self.selected_proxy)
            chrome_options.add_argument(f"--proxy-server={self.selected_proxy}")
        else:
            logger.info("Agent 3 ChromeDriver is running without proxy.")

        return chrome_options

    def _build_service(self) -> Service:
        driver_path = (
            getattr(settings, "CHROMEDRIVER_PATH", None)
            or getattr(settings, "CHROME_DRIVER_PATH", None)
        )

        if driver_path and os.path.exists(driver_path):
            return Service(driver_path)

        return Service(ChromeDriverManager().install())

    def get_driver(self):
        chrome_options = self._build_options()
        service = self._build_service()

        try:
            driver = webdriver.Chrome(service=service, options=chrome_options)

            page_timeout = int(
                getattr(settings, "PAGE_LOAD_TIMEOUT", None)
                or getattr(settings, "CHROME_PAGE_LOAD_TIMEOUT", 45)
            )
            script_timeout = int(getattr(settings, "CHROME_SCRIPT_TIMEOUT", 30))

            driver.set_page_load_timeout(page_timeout)
            driver.set_script_timeout(script_timeout)

            try:
                driver.execute_cdp_cmd(
                    "Page.addScriptToEvaluateOnNewDocument",
                    {
                        "source": """
                            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                            Object.defineProperty(navigator, 'languages', {get: () => ['vi-VN', 'vi', 'en-US', 'en']});
                            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                        """
                    },
                )
            except Exception:
                pass

            return driver

        except Exception as exc:
            logger.error("Failed to initialize ChromeDriver: %s", exc, exc_info=True)
            raise

    def cleanup(self, driver: Optional[webdriver.Chrome] = None) -> None:
        if driver:
            try:
                driver.quit()
            except Exception as e:
                logger.warning("Failed to quit ChromeDriver: %s", e)

        if self.user_data_dir and os.path.exists(self.user_data_dir):
            try:
                shutil.rmtree(self.user_data_dir, ignore_errors=True)
                self.user_data_dir = None
            except Exception as e:
                logger.warning("Failed to remove Chrome user data dir %s: %s", self.user_data_dir, e)
