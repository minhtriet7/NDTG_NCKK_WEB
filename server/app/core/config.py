from typing import List, Optional, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    # =========================================================
    # IMAGE RESIZE POLICY — USER FLOW & EXPERIMENT FLOW
    # =========================================================
    # Policy: resize theo cạnh dài (long-side), giữ aspect ratio.
    # KHÔNG bao giờ ép vuông 512x512. KHÔNG upscale ảnh nhỏ.
    #
    # --- User Production Flow ---
    # Resize cho luồng user chính (sync + async task, không experiment).
    # Default False (tắt) — bật khi đã kiểm tra ảnh hưởng accuracy.
    USER_RECOGNITION_RESIZE_ENABLED: bool = False

    # --- Experiment Flow ---
    # Resize cho luồng experiment (experiment_service, debug controller).
    # Default follows user policy — nếu muốn override thì set True/False riêng.
    # None = follow USER_RECOGNITION_RESIZE_ENABLED (no separate override).
    EXPERIMENT_RESIZE_ENABLED: bool = False
    # Khi True, experiment dùng cùng policy với user flow (recommended để đo accuracy thật).
    EXPERIMENT_RESIZE_FOLLOWS_USER: bool = True

    # --- Per-Agent Max Long Side ---
    # AG1 (OpenAI) + AG2 (Gemini) — text + OCR — cạnh dài tối đa 1280px
    AGENT_IMAGE_MAX_LONG_SIDE: int = 1280
    AGENT_IMAGE_JPEG_QUALITY: int = 85
    # AG3 (Lens/SerpAPI) — visual matching — cạnh dài tối đa 1600px
    AGENT3_IMAGE_MAX_LONG_SIDE: int = 1600
    AGENT3_IMAGE_JPEG_QUALITY: int = 88
    # Không upscale ảnh nhỏ hơn target — luôn True
    AGENT_IMAGE_NO_UPSCALE: bool = True

    # --- Legacy Backward-Compat (chỉ đọc, không dùng trong resize logic mới) ---
    # VISION_RESIZE_ENABLED: được giữ như alias — nếu True sẽ activate USER_RECOGNITION_RESIZE_ENABLED.
    # Nghĩa là: nếu legacy .env set VISION_RESIZE_ENABLED=true thì pipeline điều chỉnh automatically.
    # Nhưng KHÔNG dùng VISION_RESIZE_MAX_SIDE để resize — luôn dùng AGENT_IMAGE_MAX_LONG_SIDE.
    VISION_RESIZE_ENABLED: bool = False   # legacy alias, code mới đọc USER_RECOGNITION_RESIZE_ENABLED
    VISION_RESIZE_MAX_SIDE: int = 1280    # legacy, KHAI BÁO THÔI — không dùng trong resize logic
    VISION_RESIZE_KEEP_ASPECT_RATIO: bool = True
    VISION_RESIZE_APPLY_PRODUCTION: bool = True
    VISION_RESIZE_APPLY_EXPERIMENT: bool = True
    VISION_RESIZE_APPLY_TO_AG1: bool = True
    VISION_RESIZE_APPLY_TO_AG2: bool = True
    VISION_RESIZE_APPLY_TO_AG3: bool = True
    VISION_RESIZE_SAVE_DEBUG: bool = True
    VISION_RESIZE_JPEG_QUALITY: int = 85

    # ============================================================
    # APP
    # ============================================================
    PROJECT_NAME: str = "Banknote Recognition API"
    ENV: str = "development"
    ENABLE_EXPERIMENT_API: bool = True
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_EXPERIMENT_MODEL: str = "gpt-4o"
    OPENAI_EXPERIMENT_FALLBACK_MODEL: str = "gpt-4o"
    GEMINI_EXPERIMENT_MODEL: str = "gemini-2.5-flash"
    GEMINI_EXPERIMENT_FALLBACK_MODEL: str = "gemini-2.5-flash"
    GEMINI_EXPERIMENT_PRO_MODEL: str = ""
    EXPERIMENT_IMAGE_DETAIL: str = "auto"
    EXPERIMENT_MAX_OUTPUT_TOKENS: int = 500
    EXPERIMENT_TEMPERATURE: float = 0.0
    EXPERIMENT_AG3_POLICY: str = "always"
    EXPERIMENT_AG0_ALLOW_ORIGINAL_FALLBACK: bool = False
    EXPERIMENT_AG0_NO_HARD_STOP: bool = False
    EXPERIMENT_AGENT_IMAGE_FALLBACK_ORIGINAL: bool = False

    # ============================================================
    # DATABASE
    # ============================================================
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "banknote_system"

    # ============================================================
    # SECURITY
    # ============================================================
    SECRET_KEY: str = "CHANGE_ME_DEV_SECRET_KEY"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ============================================================
    # FRONTEND / CORS
    # ============================================================
    FRONTEND_URL: str = "http://localhost:5173"
    ALLOW_ORIGINS: Union[str, List[str]] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("ALLOW_ORIGINS", mode="before")
    @classmethod
    def parse_allow_origins(cls, value):
        if value is None:
            return []

        if isinstance(value, list):
            return value

        if isinstance(value, str):
            value = value.strip()

            if not value:
                return []

            if value == "*":
                return ["*"]

            return [item.strip() for item in value.split(",") if item.strip()]

        return value

    # ============================================================
    # GOOGLE API / GEMINI
    # ============================================================
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ============================================================
    # GOOGLE AUTH OAUTH2
    # ============================================================
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None

    # ============================================================
    # IMAGE SEARCH / UPLOAD
    # ============================================================
    IMGBB_API_KEY: Optional[str] = None
    SERPAPI_KEY: Optional[str] = None

    # ============================================================
    # CLOUDINARY
    # ============================================================
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # ============================================================
    # CHROME / SELENIUM
    # ============================================================
    CHROME_HEADLESS: bool = True
    CHROME_BINARY_PATH: Optional[str] = None
    CHROMEDRIVER_PATH: Optional[str] = None
    PAGE_LOAD_TIMEOUT: int = 45

    # ============================================================
    # AGENT 1 ML/DL
    # ============================================================
    AGENT1_YOLO_MODEL_PATH: str = "ml_models/yolo/best.pt"
    AGENT1_RES_MODEL_PATH: str = "ml_models/res/banknote_resnet50_stable_best.pth"
    AGENT1_RES_CLASSES_PATH: str = "ml_models/res/classes.txt"
    AGENT1_YOLO_CONF: float = 0.25
    AGENT1_YOLO_IMGSZ: int = 640
    AGENT1_RES_IMGSZ: int = 224

    # ============================================================
    # AGENT 2 LLM
    # ============================================================
    AG2_GEMINI_PRIMARY_MODEL: Optional[str] = None
    AG2_GEMINI_FALLBACK_MODELS: Optional[str] = None
    AG2_GEMINI_MAX_ATTEMPTS_PER_MODEL: int = 2

    # AGENT 4 (AGGREGATOR)
    # ============================================================
    AG4_ACCEPT_TWO_STRONG_VOTES: bool = True
    # AG2 Gemini Chain
    AG2_GEMINI_CHAIN_ENABLED: bool = True
    AG2_GEMINI_CHAIN_APPLY_PRODUCTION: bool = True
    AG2_GEMINI_CHAIN_APPLY_EXPERIMENT: bool = True
    AG2_GEMINI_CHAIN_MAX_MODELS: int = 4
    AG2_GEMINI_MODEL_CHAIN: str = "gemini-2.5-flash,gemini-2.5-flash-lite"

    # AG4 Conflict Rerun
    AG4_CONFLICT_RERUN_ENABLED: bool = False
    AG4_CONFLICT_RERUN_APPLY_PRODUCTION: bool = False
    AG4_CONFLICT_RERUN_APPLY_EXPERIMENT: bool = True
    AG4_CONFLICT_RERUN_MAX_ATTEMPTS: int = 2
    AG4_CONFLICT_RERUN_USE_ORIGINAL_IMAGE: bool = True
    AG4_CONFLICT_RERUN_INCLUDE_AG1: bool = True
    AG4_CONFLICT_RERUN_INCLUDE_AG2: bool = True
    AG4_CONFLICT_RERUN_INCLUDE_AG3: bool = True
    AG4_CONFLICT_RERUN_ONLY_ON_PATTERN: str = "1-1-1"

    # ============================================================
    # AGENT 3 CONFIG DEFAULTS
    # ============================================================
    AGENT3_PRIMARY_PROVIDER: str = "serpapi"
    AGENT3_PROVIDER: str = "serpapi"
    AGENT3_FALLBACK_PROVIDER: str = "selenium"
    AGENT3_FALLBACK_ENABLED: bool = False
    AGENT3_SERPAPI_ONLY_MODE: bool = True
    AGENT3_SERPAPI_TIMEOUT_SECONDS: int = 20
    AGENT3_SERPAPI_MAX_RETRIES: int = 1
    AGENT3_SERPAPI_NO_CACHE: bool = False
    AGENT3_SELENIUM_ENABLED: bool = False
    AGENT3_SELENIUM_HEADLESS: bool = True
    AGENT3_SELENIUM_TIMEOUT_SECONDS: int = 60
    AGENT3_SELENIUM_ATTEMPTS: int = 2
    AGENT3_SELENIUM_PAGE_READY_TIMEOUT_SECONDS: int = 45
    AGENT3_SELENIUM_PROXY_ENABLED: bool = True
    AGENT3_SELENIUM_MAX_RETRIES: int = 0
    AGENT3_FORMATTER_TIMEOUT_SECONDS: int = 10
    AGENT3_FORMATTER_MAX_RETRIES: int = 1
    AGENT3_V2_ENABLED: bool = False
    # Test-only: extended deadline for Selenium in /admin/ag3-test
    AG3_TEST_SELENIUM_TOTAL_DEADLINE_SECONDS: int = 90

    # ============================================================
    # GROQ - AGENT 3 TEXT-ONLY FORMATTER (NOT WIRED TO PIPELINE YET)
    # ============================================================
    GROQ_API_KEY: Optional[str] = None
    AGENT3_GROQ_FORMATTER_ENABLED: bool = False
    AGENT3_GROQ_FORMATTER_APPLY_PRODUCTION: bool = False
    AGENT3_GROQ_FORMATTER_APPLY_EXPERIMENT: bool = True
    AGENT3_FORMATTER_PROVIDER: str = "groq"
    AGENT3_GROQ_MODEL: str = "auto"
    AGENT3_GROQ_MODEL_CHAIN: str = ""
    AGENT3_GROQ_FALLBACK_MODEL: str = "llama-3.3-70b-versatile"
    AGENT3_GROQ_FALLBACK_ENABLED: bool = True
    AGENT3_GROQ_TIMEOUT_SECONDS: float = 8.0
    AGENT3_GROQ_PRIMARY_MAX_RETRIES: int = 1
    AGENT3_GROQ_FALLBACK_MAX_RETRIES: int = 1
    AGENT3_GROQ_MAX_OUTPUT_TOKENS: int = 500
    AGENT3_GROQ_TEMPERATURE: float = 0.0
    AGENT3_FORMATTER_MAX_EVIDENCE: int = 5

    # ============================================================
    # GROQ - AGENT 3 EVIDENCE READER (reads text evidence, NOT images)
    # ============================================================
    # Enable/disable the Evidence Reader layer entirely.
    AGENT3_GROQ_EVIDENCE_READER_ENABLED: bool = False
    # always = always call when evidence_count > 0
    # when_weak = only call when deterministic parser has low confidence or conflict
    # never = skip entirely (deterministic only)
    AGENT3_GROQ_EVIDENCE_READER_MODE: str = "when_weak"
    AGENT3_GROQ_EVIDENCE_READER_TIMEOUT_SECONDS: float = 5.0
    AGENT3_GROQ_EVIDENCE_READER_TOP_N: int = 5
    AGENT3_GROQ_EVIDENCE_READER_MAX_OUTPUT_TOKENS: int = 800


    # ============================================================
    # DEPRECATED SEPAY SETTINGS (webhook/payment method disabled)
    # Kept temporarily for backward-compatible configuration loading only.
    # ============================================================
    SEPAY_API_KEY: Optional[str] = None
    SEPAY_API_TOKEN: Optional[str] = None
    SEPAY_ACCOUNT_NUMBER: Optional[str] = None
    SEPAY_BANK_BRAND: Optional[str] = None

    # ACTIVE VIETQR / MANUAL BANK TRANSFER SETTINGS
    BANK_ACCOUNT_NUMBER: Optional[str] = None
    BANK_ID: Optional[str] = None
    ACCOUNT_NAME: Optional[str] = None
    NAME_WEB: str = "BANKNOTEAI"

    # ============================================================
    # VNPAY PAYMENT
    # ============================================================
    VNPAY_ENABLED: bool = False
    VNPAY_TMN_CODE: Optional[str] = None
    VNPAY_HASH_SECRET: Optional[str] = None
    VNPAY_PAYMENT_URL: str = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    VNPAY_RETURN_URL: str = "http://localhost:5173/vnpay-return"
    VNPAY_IPN_URL: str = "http://localhost:8000/api/v1/payment/vnpay/ipn"

    # Legacy aliases kept so existing deployments continue to load safely.
    VNP_TMNCODE: Optional[str] = None
    VNP_HASHSECRET: Optional[str] = None
    VNP_URL: str = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    VNP_RETURNURL: str = "http://localhost:5173/vnpay-return"

    # ============================================================
    # EMAIL / SMTP
    # ============================================================
    EMAIL_NOTIFICATIONS_ENABLED: bool = False

    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_FROM_NAME: str = "BanknoteAI"

    # ============================================================
    # CURRENCY PROVIDER
    # ============================================================
    CURRENCY_PROVIDER_NAME: Optional[str] = None
    CURRENCY_PROVIDER_API_KEY: Optional[str] = None
    CURRENCY_STALE_AFTER_HOURS: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def __init__(self, **values):
        super().__init__(**values)
        if self.FRONTEND_URL:
            if isinstance(self.ALLOW_ORIGINS, list):
                if self.FRONTEND_URL not in self.ALLOW_ORIGINS:
                    self.ALLOW_ORIGINS.append(self.FRONTEND_URL)
            elif isinstance(self.ALLOW_ORIGINS, str):
                if self.FRONTEND_URL != self.ALLOW_ORIGINS:
                    self.ALLOW_ORIGINS = [self.ALLOW_ORIGINS, self.FRONTEND_URL]


settings = Settings()
