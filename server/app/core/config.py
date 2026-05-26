from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Banknote Recognition API"
    ENV: str = "development"

    # Database
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "banknote_system"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Frontend / CORS
    FRONTEND_URL: str = "http://localhost:5173"
    ALLOW_ORIGINS: Union[str, List[str]] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Google API / Gemini
    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Google Auth OAuth2
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None

    # Image Search / Upload
    IMGBB_API_KEY: Optional[str] = None
    SERPAPI_KEY: Optional[str] = None

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # SePay / VietQR Payment
    SEPAY_API_KEY: Optional[str] = None
    SEPAY_API_TOKEN: Optional[str] = None
    SEPAY_ACCOUNT_NUMBER: Optional[str] = None
    SEPAY_BANK_BRAND: Optional[str] = None

    BANK_ACCOUNT_NUMBER: Optional[str] = None
    BANK_ID: Optional[str] = None
    ACCOUNT_NAME: Optional[str] = None
    NAME_WEB: str = "BANKNOTEAI"

    # Currency Provider
    CURRENCY_PROVIDER_NAME: Optional[str] = None
    CURRENCY_PROVIDER_API_KEY: Optional[str] = None
    CURRENCY_STALE_AFTER_HOURS: int = 24

    # Agent 1 ML/DL
    AGENT1_YOLO_MODEL_PATH: str = "ml_models/yolo/best.pt"
    AGENT1_RES_MODEL_PATH: str = "ml_models/res/banknote_efficientnet_b0_best.pth"
    AGENT1_RES_CLASSES_PATH: str = "ml_models/res/classes.txt"

    AGENT1_YOLO_CONF: float = 0.25
    AGENT1_YOLO_IMGSZ: int = 640
    AGENT1_RES_IMGSZ: int = 224

    @field_validator("ALLOW_ORIGINS", mode="before")
    @classmethod
    def parse_allow_origins(cls, value):
        if isinstance(value, list):
            return value

        if isinstance(value, str):
            value = value.strip()

            if value.startswith("[") and value.endswith("]"):
                import json

                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return parsed
                except json.JSONDecodeError:
                    pass

            return [item.strip() for item in value.split(",") if item.strip()]

        return value

    @property
    def effective_gemini_api_key(self) -> Optional[str]:
        return self.GEMINI_API_KEY or self.GOOGLE_API_KEY

    @property
    def effective_sepay_api_key(self) -> Optional[str]:
        return self.SEPAY_API_KEY or self.SEPAY_API_TOKEN

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()