from beanie import Document
from pydantic import Field
from datetime import datetime, timezone
from typing import List, Optional


class ExchangeRate(Document):
    from_currency: str
    to_currency: str = "VND"
    rate: float
    source: str = "External API"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "exchange_rates"


class CurrencyConversion(Document):
    user_id: Optional[str] = None
    source_type: str
    recognition_result_id: Optional[str] = None

    from_currency: str
    to_currency: str = "VND"

    amount: float
    exchange_rate: float
    converted_amount: float

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "currency_conversions"


class CurrencyRate(Document):
    target_currency: str
    currency_name: Optional[str] = None

    rate_to_vnd: float = 0.0
    market_rate_to_vnd: Optional[float] = None
    manual_rate_to_vnd: Optional[float] = None
    manual_override: bool = False

    source: str = "manual"  # base, seed, manual, market_api
    provider: Optional[str] = None

    is_active: bool = True
    is_stale: bool = False

    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "currency_rates"


class CurrencyRateSyncLog(Document):
    provider: str
    status: str  # success, failed
    message: str

    fetched_count: int = 0
    updated_currencies: List[str] = Field(default_factory=list)
    missing_currencies: List[str] = Field(default_factory=list)

    started_at: datetime
    finished_at: datetime
    error_detail: Optional[str] = None

    class Settings:
        name = "currency_sync_logs"


class CountryCurrencyMap(Document):
    country_code: str
    country_name_en: str
    country_name_vi: str
    normalized_name_en: Optional[str] = None
    normalized_name_vi: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    primary_currency: str
    supported_currencies: List[str] = Field(default_factory=list)
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "country_currency_mappings"
        indexes = ["country_code", "primary_currency", "active"]
