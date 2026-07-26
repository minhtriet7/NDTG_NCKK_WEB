from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from datetime import datetime


class ConvertRequest(BaseModel):
    from_currency: str
    to_currency: str = "VND"
    amount: float = Field(..., ge=0)


class ConvertResponse(BaseModel):
    from_currency: str
    to_currency: str = "VND"

    amount: float
    original_amount: Optional[float] = None

    exchange_rate: float
    converted_amount: float

    provider: Optional[str] = None
    source: Optional[str] = None
    is_stale: bool = False
    last_updated: Optional[datetime] = None
    rate: Optional[float] = None
    inverse_rate: Optional[float] = None
    rates_version: Optional[str] = None

    message: str = "Success"


class CurrencyRateResponse(BaseModel):
    id: str

    target_currency: str
    currency_name: Optional[str] = None

    rate_to_vnd: float
    market_rate_to_vnd: Optional[float] = None
    manual_rate_to_vnd: Optional[float] = None
    manual_override: bool = False

    source: str = "manual"
    provider: Optional[str] = None

    is_active: bool = True
    is_stale: bool = False

    last_updated: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CurrencyRatesPublicResponse(BaseModel):
    base: str = "VND"
    provider: Optional[str] = None
    source: Optional[str] = None
    is_stale: bool = False
    last_updated: Optional[datetime] = None
    rates_version: Optional[str] = None

    rates: Dict[str, float]
    items: List[CurrencyRateResponse]


class CurrencyRateAdminCreate(BaseModel):
    target_currency: str
    currency_name: Optional[str] = None

    rate_to_vnd: float = Field(default=0, ge=0)
    market_rate_to_vnd: Optional[float] = Field(default=None, ge=0)
    manual_rate_to_vnd: Optional[float] = Field(default=None, ge=0)
    manual_override: bool = False

    source: str = "manual"
    provider: Optional[str] = None

    is_active: bool = True
    is_stale: bool = False


class CurrencyRateAdminUpdate(BaseModel):
    currency_name: Optional[str] = None

    rate_to_vnd: Optional[float] = Field(default=None, ge=0)
    market_rate_to_vnd: Optional[float] = Field(default=None, ge=0)
    manual_rate_to_vnd: Optional[float] = Field(default=None, ge=0)
    manual_override: Optional[bool] = None

    source: Optional[str] = None
    provider: Optional[str] = None

    is_active: Optional[bool] = None
    is_stale: Optional[bool] = None


class CurrencyRateSyncLogResponse(BaseModel):
    id: str
    provider: str
    status: str
    message: str

    fetched_count: int = 0
    updated_currencies: List[str] = Field(default_factory=list)
    missing_currencies: List[str] = Field(default_factory=list)

    started_at: datetime
    finished_at: datetime
    error_detail: Optional[str] = None


class CountryCurrencyMapResponse(BaseModel):
    country_code: str
    country_name_en: str
    country_name_vi: str
    normalized_name_en: Optional[str] = None
    normalized_name_vi: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    primary_currency: str
    supported_currencies: List[str] = Field(default_factory=list)
    active: bool = True
    currency_name_en: Optional[str] = None
    currency_name_vi: Optional[str] = None
    rate_to_vnd: float = 0
    source: Optional[str] = None
    provider: Optional[str] = None
    last_updated: Optional[datetime] = None
    is_stale: bool = False
    manual_override: bool = False
    rates_version: Optional[str] = None
