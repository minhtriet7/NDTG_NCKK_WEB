from typing import List, Optional, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ============================================================
    # APP
    # ============================================================
    PROJECT_NAME: str = "Banknote Recognition API"
    ENV: str = "development"

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
    # AGENT 3 CONFIG DEFAULTS
    # ============================================================
    AGENT3_PRIMARY_PROVIDER: str = "serpapi"
    AGENT3_PROVIDER: str = "serpapi"
    AGENT3_FALLBACK_PROVIDER: str = "selenium"
    AGENT3_FALLBACK_ENABLED: bool = False
    AGENT3_SERPAPI_TIMEOUT_SECONDS: int = 20
    AGENT3_SERPAPI_MAX_RETRIES: int = 1
    AGENT3_SELENIUM_ENABLED: bool = False
    AGENT3_SELENIUM_HEADLESS: bool = True
    AGENT3_SELENIUM_TIMEOUT_SECONDS: int = 35
    AGENT3_SELENIUM_MAX_RETRIES: int = 0
    AGENT3_FORMATTER_TIMEOUT_SECONDS: int = 10
    AGENT3_FORMATTER_MAX_RETRIES: int = 1
    AGENT3_V2_ENABLED: bool = False

    # ============================================================
    # SEP PAY / VIETQR PAYMENT
    # ============================================================
    SEPAY_API_KEY: Optional[str] = None
    SEPAY_API_TOKEN: Optional[str] = None
    SEPAY_ACCOUNT_NUMBER: Optional[str] = None
    SEPAY_BANK_BRAND: Optional[str] = None

    BANK_ACCOUNT_NUMBER: Optional[str] = None
    BANK_ID: Optional[str] = None
    ACCOUNT_NAME: Optional[str] = None
    NAME_WEB: str = "BANKNOTEAI"

    # ============================================================
    # VNPAY PAYMENT
    # ============================================================
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
