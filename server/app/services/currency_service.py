from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import unicodedata

import httpx
from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core.config import settings
from app.models.currency_model import (
    CountryCurrencyMap,
    CurrencyRate,
    CurrencyRateSyncLog,
)
from app.schemas.currency_schema import ConvertRequest


DEFAULT_SUPPORTED_CURRENCIES = {
    "VND": "Vietnamese Dong",
    "USD": "United States Dollar",
    "THB": "Thai Baht",
    "MYR": "Malaysian Ringgit",
    "SGD": "Singapore Dollar",
    "IDR": "Indonesian Rupiah",
    "PHP": "Philippine Peso",
    "KHR": "Cambodian Riel",
    "LAK": "Lao Kip",
    "MMK": "Myanmar Kyat",
    "BND": "Brunei Dollar",
    "EUR": "Euro",
    "GBP": "British Pound Sterling",
    "JPY": "Japanese Yen",
    "CNY": "Chinese Yuan",
    "KRW": "South Korean Won",
    "AUD": "Australian Dollar",
    "CAD": "Canadian Dollar",
    "CHF": "Swiss Franc",
}

CURRENCY_DISPLAY_NAMES = {
    "VND": {"en": "Vietnamese Dong", "vi": "Việt Nam Đồng"},
    "USD": {"en": "US Dollar", "vi": "Đô la Mỹ"},
    "EUR": {"en": "Euro", "vi": "Euro"},
    "JPY": {"en": "Japanese Yen", "vi": "Yên Nhật"},
    "KRW": {"en": "South Korean Won", "vi": "Won Hàn Quốc"},
    "SGD": {"en": "Singapore Dollar", "vi": "Đô la Singapore"},
    "THB": {"en": "Thai Baht", "vi": "Baht Thái"},
    "CNY": {"en": "Chinese Yuan", "vi": "Nhân dân tệ"},
    "GBP": {"en": "British Pound Sterling", "vi": "Bảng Anh"},
    "AUD": {"en": "Australian Dollar", "vi": "Đô la Úc"},
    "CAD": {"en": "Canadian Dollar", "vi": "Đô la Canada"},
    "CHF": {"en": "Swiss Franc", "vi": "Franc Thụy Sĩ"},
    "MYR": {"en": "Malaysian Ringgit", "vi": "Ringgit Malaysia"},
    "IDR": {"en": "Indonesian Rupiah", "vi": "Rupiah Indonesia"},
    "PHP": {"en": "Philippine Peso", "vi": "Peso Philippines"},
    "KHR": {"en": "Cambodian Riel", "vi": "Riel Campuchia"},
    "LAK": {"en": "Lao Kip", "vi": "Kip Lào"},
    "MMK": {"en": "Myanmar Kyat", "vi": "Kyat Myanmar"},
    "BND": {"en": "Brunei Dollar", "vi": "Đô la Brunei"},
}

DEFAULT_COUNTRY_CURRENCY_MAPPINGS = [
    {
        "country_code": "VN",
        "country_name_en": "Vietnam",
        "country_name_vi": "Việt Nam",
        "aliases": ["Viet Nam", "Vietnam", "Viet Nam Dong", "Dong", "VND"],
        "primary_currency": "VND",
        "supported_currencies": ["VND"],
    },
    {
        "country_code": "US",
        "country_name_en": "United States",
        "country_name_vi": "Hoa Kỳ",
        "aliases": ["USA", "US", "America", "My", "Hoa Ky", "Đô la Mỹ", "Do la My", "US Dollar", "USD"],
        "primary_currency": "USD",
        "supported_currencies": ["USD"],
    },
    {
        "country_code": "JP",
        "country_name_en": "Japan",
        "country_name_vi": "Nhật Bản",
        "aliases": ["Nhat Ban", "Japanese Yen", "Yen Nhat", "Yên Nhật", "JPY"],
        "primary_currency": "JPY",
        "supported_currencies": ["JPY"],
    },
    {
        "country_code": "DE",
        "country_name_en": "Germany",
        "country_name_vi": "Đức",
        "aliases": ["Duc", "Deutschland", "Euro", "EUR"],
        "primary_currency": "EUR",
        "supported_currencies": ["EUR"],
    },
    {
        "country_code": "FR",
        "country_name_en": "France",
        "country_name_vi": "Pháp",
        "aliases": ["Phap", "French Republic", "Euro", "EUR"],
        "primary_currency": "EUR",
        "supported_currencies": ["EUR"],
    },
    {
        "country_code": "KR",
        "country_name_en": "South Korea",
        "country_name_vi": "Hàn Quốc",
        "aliases": ["Korea", "Han Quoc", "Won Han Quoc", "KRW"],
        "primary_currency": "KRW",
        "supported_currencies": ["KRW"],
    },
    {
        "country_code": "SG",
        "country_name_en": "Singapore",
        "country_name_vi": "Singapore",
        "aliases": ["Singapore Dollar", "Do la Singapore", "SGD"],
        "primary_currency": "SGD",
        "supported_currencies": ["SGD"],
    },
    {
        "country_code": "TH",
        "country_name_en": "Thailand",
        "country_name_vi": "Thái Lan",
        "aliases": ["Thai Lan", "Thai Baht", "Baht Thai", "THB"],
        "primary_currency": "THB",
        "supported_currencies": ["THB"],
    },
    {
        "country_code": "CN",
        "country_name_en": "China",
        "country_name_vi": "Trung Quốc",
        "aliases": ["Trung Quoc", "Chinese Yuan", "Nhan dan te", "Nhân dân tệ", "CNY"],
        "primary_currency": "CNY",
        "supported_currencies": ["CNY"],
    },
    {
        "country_code": "GB",
        "country_name_en": "United Kingdom",
        "country_name_vi": "Vương quốc Anh",
        "aliases": ["UK", "Great Britain", "Vuong quoc Anh", "Bang Anh", "British Pound", "GBP"],
        "primary_currency": "GBP",
        "supported_currencies": ["GBP"],
    },
    {
        "country_code": "AU",
        "country_name_en": "Australia",
        "country_name_vi": "Úc",
        "aliases": ["Uc", "Australian Dollar", "Do la Uc", "AUD"],
        "primary_currency": "AUD",
        "supported_currencies": ["AUD"],
    },
    {
        "country_code": "CA",
        "country_name_en": "Canada",
        "country_name_vi": "Canada",
        "aliases": ["Canadian Dollar", "Do la Canada", "CAD"],
        "primary_currency": "CAD",
        "supported_currencies": ["CAD"],
    },
    {
        "country_code": "CH",
        "country_name_en": "Switzerland",
        "country_name_vi": "Thụy Sĩ",
        "aliases": ["Thuy Si", "Swiss Franc", "Franc Thuy Si", "CHF"],
        "primary_currency": "CHF",
        "supported_currencies": ["CHF"],
    },
    {
        "country_code": "MY",
        "country_name_en": "Malaysia",
        "country_name_vi": "Malaysia",
        "aliases": ["Malaysian Ringgit", "Ringgit Malaysia", "MYR"],
        "primary_currency": "MYR",
        "supported_currencies": ["MYR"],
    },
    {
        "country_code": "ID",
        "country_name_en": "Indonesia",
        "country_name_vi": "Indonesia",
        "aliases": ["Indonesian Rupiah", "Rupiah Indonesia", "IDR"],
        "primary_currency": "IDR",
        "supported_currencies": ["IDR"],
    },
    {
        "country_code": "PH",
        "country_name_en": "Philippines",
        "country_name_vi": "Philippines",
        "aliases": ["Philippine Peso", "Peso Philippines", "PHP"],
        "primary_currency": "PHP",
        "supported_currencies": ["PHP"],
    },
    {
        "country_code": "KH",
        "country_name_en": "Cambodia",
        "country_name_vi": "Campuchia",
        "aliases": ["Cambodian Riel", "Riel Campuchia", "KHR"],
        "primary_currency": "KHR",
        "supported_currencies": ["KHR"],
    },
    {
        "country_code": "LA",
        "country_name_en": "Laos",
        "country_name_vi": "Lào",
        "aliases": ["Lao", "Lao Kip", "Kip Lao", "LAK"],
        "primary_currency": "LAK",
        "supported_currencies": ["LAK"],
    },
    {
        "country_code": "MM",
        "country_name_en": "Myanmar",
        "country_name_vi": "Myanmar",
        "aliases": ["Myanmar Kyat", "Kyat Myanmar", "MMK"],
        "primary_currency": "MMK",
        "supported_currencies": ["MMK"],
    },
    {
        "country_code": "BN",
        "country_name_en": "Brunei",
        "country_name_vi": "Brunei",
        "aliases": ["Brunei Dollar", "Do la Brunei", "BND"],
        "primary_currency": "BND",
        "supported_currencies": ["BND"],
    },
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def normalize_search_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    normalized = unicodedata.normalize("NFD", text)
    no_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return " ".join(no_marks.replace("đ", "d").split())


def get_currency_display_name(code: str, lang: str = "en") -> str:
    currency_code = str(code or "").upper()
    names = CURRENCY_DISPLAY_NAMES.get(currency_code, {})
    return names.get(lang) or names.get("en") or DEFAULT_SUPPORTED_CURRENCIES.get(currency_code, currency_code)


def normalize_mapping_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    country_code = str(data.get("country_code") or "").upper().strip()
    primary_currency = str(data.get("primary_currency") or "").upper().strip()
    supported = [
        str(code).upper().strip()
        for code in data.get("supported_currencies", [])
        if str(code or "").strip()
    ]

    if primary_currency and primary_currency not in supported:
        supported.insert(0, primary_currency)

    aliases = [
        str(alias).strip()
        for alias in data.get("aliases", [])
        if str(alias or "").strip()
    ]

    country_name_en = str(data.get("country_name_en") or "").strip()
    country_name_vi = str(data.get("country_name_vi") or "").strip()

    return {
        "country_code": country_code,
        "country_name_en": country_name_en,
        "country_name_vi": country_name_vi,
        "normalized_name_en": normalize_search_text(country_name_en),
        "normalized_name_vi": normalize_search_text(country_name_vi),
        "aliases": aliases,
        "primary_currency": primary_currency,
        "supported_currencies": supported,
        "active": bool(data.get("active", True)),
    }


def default_country_mapping_map() -> Dict[str, Dict[str, Any]]:
    return {
        item["country_code"]: normalize_mapping_payload(item)
        for item in DEFAULT_COUNTRY_CURRENCY_MAPPINGS
    }


def serialize_country_mapping(mapping: Any) -> Dict[str, Any]:
    if isinstance(mapping, dict):
        raw = dict(mapping)
        mapping_id = raw.get("id")
    else:
        raw = {
            "country_code": getattr(mapping, "country_code", ""),
            "country_name_en": getattr(mapping, "country_name_en", ""),
            "country_name_vi": getattr(mapping, "country_name_vi", ""),
            "normalized_name_en": getattr(mapping, "normalized_name_en", None),
            "normalized_name_vi": getattr(mapping, "normalized_name_vi", None),
            "aliases": getattr(mapping, "aliases", []) or [],
            "primary_currency": getattr(mapping, "primary_currency", ""),
            "supported_currencies": getattr(mapping, "supported_currencies", []) or [],
            "active": getattr(mapping, "active", True),
            "created_at": getattr(mapping, "created_at", None),
            "updated_at": getattr(mapping, "updated_at", None),
        }
        mapping_id = str(mapping.id) if getattr(mapping, "id", None) else None

    normalized = normalize_mapping_payload(raw)
    normalized.update(
        {
            "id": mapping_id,
            "created_at": raw.get("created_at"),
            "updated_at": raw.get("updated_at"),
        }
    )
    return normalized


def mapping_search_tokens(mapping: Dict[str, Any]) -> List[str]:
    primary_currency = mapping.get("primary_currency")
    supported = mapping.get("supported_currencies", [])
    currency_names = []

    for code in [primary_currency, *supported]:
        currency_names.extend(
            [
                get_currency_display_name(code, "en"),
                get_currency_display_name(code, "vi"),
            ]
        )

    values = [
        mapping.get("country_code"),
        mapping.get("country_name_en"),
        mapping.get("country_name_vi"),
        mapping.get("normalized_name_en"),
        mapping.get("normalized_name_vi"),
        primary_currency,
        *supported,
        *(mapping.get("aliases") or []),
        *currency_names,
    ]
    return [normalize_search_text(value) for value in values if str(value or "").strip()]


def country_mapping_matches(mapping: Dict[str, Any], query: str) -> bool:
    normalized_query = normalize_search_text(query)
    if not normalized_query:
        return True

    return any(normalized_query in token for token in mapping_search_tokens(mapping))


def country_mapping_score(mapping: Dict[str, Any], query: str) -> int:
    normalized_query = normalize_search_text(query)
    if not normalized_query:
        return 0

    code = normalize_search_text(mapping.get("country_code"))
    primary = normalize_search_text(mapping.get("primary_currency"))
    names = [
        normalize_search_text(mapping.get("country_name_en")),
        normalize_search_text(mapping.get("country_name_vi")),
    ]

    if normalized_query in {code, primary}:
        return 100
    if normalized_query in names:
        return 90
    if any(token.startswith(normalized_query) for token in mapping_search_tokens(mapping)):
        return 70
    return 40


def serialize_currency_rate(rate: CurrencyRate) -> Dict[str, Any]:
    return {
        "id": str(rate.id),
        "target_currency": str(getattr(rate, "target_currency", "") or "").upper(),
        "currency_name": getattr(rate, "currency_name", None),
        "rate_to_vnd": getattr(rate, "rate_to_vnd", 0),
        "market_rate_to_vnd": getattr(rate, "market_rate_to_vnd", None),
        "manual_rate_to_vnd": getattr(rate, "manual_rate_to_vnd", None),
        "manual_override": getattr(rate, "manual_override", False),
        "source": getattr(rate, "source", "manual"),
        "provider": getattr(rate, "provider", None),
        "is_active": getattr(rate, "is_active", True),
        "is_stale": getattr(rate, "is_stale", False),
        "last_updated": getattr(rate, "last_updated", None),
        "created_at": getattr(rate, "created_at", None),
        "updated_at": getattr(rate, "updated_at", None),
    }


def effective_rate_to_vnd(rate: CurrencyRate) -> float:
    if getattr(rate, "manual_override", False) and getattr(rate, "manual_rate_to_vnd", None):
        return safe_float(rate.manual_rate_to_vnd)

    if getattr(rate, "market_rate_to_vnd", None):
        return safe_float(rate.market_rate_to_vnd)

    return safe_float(getattr(rate, "rate_to_vnd", 0))


async def ensure_vnd_base_rate() -> CurrencyRate:
    vnd = await CurrencyRate.find_one(CurrencyRate.target_currency == "VND")

    if vnd:
        changed = False

        if safe_float(getattr(vnd, "rate_to_vnd", 0)) != 1:
            vnd.rate_to_vnd = 1
            changed = True

        if safe_float(getattr(vnd, "market_rate_to_vnd", 0)) != 1:
            vnd.market_rate_to_vnd = 1
            changed = True

        if getattr(vnd, "manual_rate_to_vnd", None) is not None:
            vnd.manual_rate_to_vnd = None
            changed = True

        if getattr(vnd, "manual_override", False):
            vnd.manual_override = False
            changed = True

        if getattr(vnd, "source", None) != "base":
            vnd.source = "base"
            changed = True

        if getattr(vnd, "provider", None) != "system":
            vnd.provider = "system"
            changed = True

        if getattr(vnd, "is_stale", True):
            vnd.is_stale = False
            changed = True

        if not getattr(vnd, "is_active", True):
            vnd.is_active = True
            changed = True

        if changed:
            vnd.last_updated = now_utc()
            vnd.updated_at = now_utc()
            await vnd.save()

        return vnd

    vnd = CurrencyRate(
        target_currency="VND",
        currency_name="Vietnamese Dong",
        rate_to_vnd=1,
        market_rate_to_vnd=1,
        manual_rate_to_vnd=None,
        manual_override=False,
        source="base",
        provider="system",
        is_active=True,
        is_stale=False,
        last_updated=now_utc(),
        created_at=now_utc(),
        updated_at=now_utc(),
    )

    await vnd.insert()
    return vnd


async def get_supported_currency_codes() -> Dict[str, str]:
    """
    Ưu tiên lấy danh sách đang có trong DB.
    Nếu DB trống thì dùng danh sách mặc định Đông Nam Á + vài ngoại tệ phổ biến.
    """
    existing = await CurrencyRate.find_all().to_list()

    codes: Dict[str, str] = {}

    for item in existing:
        code = str(getattr(item, "target_currency", "") or "").upper().strip()
        if not code:
            continue

        codes[code] = getattr(item, "currency_name", None) or DEFAULT_SUPPORTED_CURRENCIES.get(code, code)

    if not codes:
        codes = dict(DEFAULT_SUPPORTED_CURRENCIES)

    codes["VND"] = "Vietnamese Dong"
    return codes


class CurrencyService:
    @staticmethod
    async def get_public_rates() -> Dict[str, Any]:
        await ensure_vnd_base_rate()

        rates_db = await CurrencyRate.find({"is_active": True}).sort("target_currency").to_list()

        stale_after_hours = int(getattr(settings, "CURRENCY_STALE_AFTER_HOURS", 24) or 24)
        rate_map: Dict[str, float] = {"VND": 1.0}
        items: List[Dict[str, Any]] = []

        is_stale_overall = False
        latest_update: Optional[datetime] = None
        provider = None
        source = None

        for rate in rates_db:
            code = str(rate.target_currency).upper()
            rate_time = ensure_aware(getattr(rate, "last_updated", now_utc()) or now_utc())

            is_stale = bool(getattr(rate, "is_stale", False))

            if code != "VND":
                age_seconds = (now_utc() - rate_time).total_seconds()
                if age_seconds > stale_after_hours * 3600:
                    is_stale = True

            if is_stale:
                is_stale_overall = True

            value = 1.0 if code == "VND" else effective_rate_to_vnd(rate)

            if value > 0:
                rate_map[code] = value

            item = serialize_currency_rate(rate)
            item["target_currency"] = code
            item["currency"] = code
            item["rate_to_vnd"] = value
            item["is_stale"] = is_stale
            items.append(item)

            provider = provider or getattr(rate, "provider", None)
            source = source or getattr(rate, "source", None)

            if latest_update is None or rate_time > latest_update:
                latest_update = rate_time

        rates_version = latest_update.isoformat() if latest_update else now_utc().isoformat()

        return {
            "base": "VND",
            "source": source or "database",
            "provider": provider or "system",
            "last_updated": latest_update,
            "rates_version": rates_version,
            "is_stale": is_stale_overall,
            "stale_after_hours": stale_after_hours,
            "rates": rate_map,
            "items": items,
        }

    @staticmethod
    async def convert_to_vnd(data: ConvertRequest) -> Dict[str, Any]:
        amount = Decimal(str(data.amount))
        from_currency = data.from_currency.upper()
        to_currency = data.to_currency.upper()

        public_rates = await CurrencyService.get_public_rates()
        rates = public_rates["rates"]

        if from_currency not in rates:
            raise HTTPException(
                status_code=400,
                detail=f"Exchange rate is not configured for {from_currency}.",
            )

        if to_currency not in rates:
            raise HTTPException(
                status_code=400,
                detail=f"Exchange rate is not configured for {to_currency}.",
            )

        rate_from = Decimal(str(rates[from_currency]))
        rate_to = Decimal(str(rates[to_currency]))
        amount_in_vnd = amount * rate_from
        converted_amount = amount_in_vnd / rate_to

        return {
            "amount": float(amount),
            "original_amount": float(amount),
            "from_currency": from_currency,
            "to_currency": to_currency,
            "rate_from": float(rate_from),
            "rate_to": float(rate_to),
            "exchange_rate": float(rate_from / rate_to),
            "rate": float(rate_from / rate_to),
            "inverse_rate": float(rate_to / rate_from) if rate_from else 0,
            "converted_amount": float(converted_amount),
            "source": public_rates.get("source"),
            "provider": public_rates.get("provider"),
            "is_stale": public_rates.get("is_stale", False),
            "last_updated": public_rates.get("last_updated"),
            "rates_version": public_rates.get("rates_version"),
            "message": "Success",
        }

    @staticmethod
    async def get_admin_currency_rates(
        search: str = "",
        status: str = "all",
        source: str = "all",
        override: str = "all",
        stale: str = "all",
    ) -> List[Dict[str, Any]]:
        await ensure_vnd_base_rate()

        filters: Dict[str, Any] = {}

        if search:
            filters["$or"] = [
                {"target_currency": {"$regex": search, "$options": "i"}},
                {"currency_name": {"$regex": search, "$options": "i"}},
            ]

        if status == "active":
            filters["is_active"] = True
        elif status in {"hidden", "inactive", "disabled"}:
            filters["is_active"] = False

        if source and source != "all":
            filters["source"] = source

        if override == "manual":
            filters["manual_override"] = True
        elif override == "market":
            filters["manual_override"] = False

        if stale == "fresh":
            filters["is_stale"] = False
        elif stale == "stale":
            filters["is_stale"] = True

        rates = await CurrencyRate.find(filters).sort("target_currency").to_list()
        return [serialize_currency_rate(rate) for rate in rates]

    @staticmethod
    async def _merged_country_mappings(include_inactive: bool = True) -> List[Dict[str, Any]]:
        merged = default_country_mapping_map()
        db_mappings = await CountryCurrencyMap.find_all().to_list()

        for mapping in db_mappings:
            serialized = serialize_country_mapping(mapping)
            country_code = serialized.get("country_code")
            if country_code:
                merged[country_code] = serialized

        mappings = list(merged.values())

        if not include_inactive:
            mappings = [item for item in mappings if item.get("active", True)]

        return sorted(mappings, key=lambda item: item.get("country_name_en") or item.get("country_code"))

    @staticmethod
    async def _rate_context() -> Dict[str, Any]:
        public_rates = await CurrencyService.get_public_rates()
        item_map = {
            str(item.get("target_currency") or item.get("currency") or "").upper(): item
            for item in public_rates.get("items", [])
        }

        return {
            "public_rates": public_rates,
            "item_map": item_map,
        }

    @staticmethod
    def _enrich_country_mapping(mapping: Dict[str, Any], rate_context: Dict[str, Any]) -> Dict[str, Any]:
        public_rates = rate_context["public_rates"]
        item_map = rate_context["item_map"]
        primary_currency = str(mapping.get("primary_currency") or "").upper()
        rate_item = item_map.get(primary_currency, {})
        rate_to_vnd = public_rates.get("rates", {}).get(primary_currency, 0)

        return {
            **mapping,
            "currency_name_en": get_currency_display_name(primary_currency, "en"),
            "currency_name_vi": get_currency_display_name(primary_currency, "vi"),
            "rate_to_vnd": rate_to_vnd,
            "source": rate_item.get("source") or public_rates.get("source"),
            "provider": rate_item.get("provider") or public_rates.get("provider"),
            "last_updated": rate_item.get("last_updated") or public_rates.get("last_updated"),
            "is_stale": bool(rate_item.get("is_stale", public_rates.get("is_stale", False))),
            "manual_override": bool(rate_item.get("manual_override", False)),
            "rates_version": public_rates.get("rates_version"),
        }

    @staticmethod
    async def get_public_countries() -> List[Dict[str, Any]]:
        mappings = await CurrencyService._merged_country_mappings(include_inactive=False)
        rate_context = await CurrencyService._rate_context()
        return [
            CurrencyService._enrich_country_mapping(mapping, rate_context)
            for mapping in mappings
        ]

    @staticmethod
    async def search_country_currencies(q: str = "", limit: int = 20) -> List[Dict[str, Any]]:
        query = str(q or "").strip()
        mappings = await CurrencyService._merged_country_mappings(include_inactive=False)

        if query:
            mappings = [
                mapping for mapping in mappings
                if country_mapping_matches(mapping, query)
            ]
            mappings = sorted(
                mappings,
                key=lambda item: (-country_mapping_score(item, query), item.get("country_name_en") or ""),
            )

        rate_context = await CurrencyService._rate_context()
        return [
            CurrencyService._enrich_country_mapping(mapping, rate_context)
            for mapping in mappings[: max(1, min(int(limit or 20), 50))]
        ]

    @staticmethod
    async def get_admin_country_mappings(
        search: str = "",
        status: str = "all",
    ) -> List[Dict[str, Any]]:
        mappings = await CurrencyService._merged_country_mappings(include_inactive=True)

        if search:
            mappings = [
                mapping for mapping in mappings
                if country_mapping_matches(mapping, search)
            ]

        if status == "active":
            mappings = [mapping for mapping in mappings if mapping.get("active", True)]
        elif status == "inactive":
            mappings = [mapping for mapping in mappings if not mapping.get("active", True)]

        rate_context = await CurrencyService._rate_context()
        return [
            CurrencyService._enrich_country_mapping(mapping, rate_context)
            for mapping in mappings
        ]

    @staticmethod
    async def patch_country_mapping(country_code: str, data: Dict[str, Any]) -> Dict[str, Any]:
        code = str(country_code or "").upper().strip()

        if not code:
            raise HTTPException(status_code=400, detail="country_code is required.")

        defaults = default_country_mapping_map()
        base = defaults.get(code, {"country_code": code})
        existing = await CountryCurrencyMap.find_one(CountryCurrencyMap.country_code == code)

        current = serialize_country_mapping(existing) if existing else dict(base)
        allowed_keys = {
            "country_name_en",
            "country_name_vi",
            "aliases",
            "primary_currency",
            "supported_currencies",
            "active",
        }
        next_payload = {**current, "country_code": code}

        for key in allowed_keys:
            if key in data:
                next_payload[key] = data[key]

        normalized = normalize_mapping_payload(next_payload)

        if not normalized["country_name_en"] or not normalized["country_name_vi"]:
            raise HTTPException(status_code=400, detail="Country names are required.")

        if not normalized["primary_currency"]:
            raise HTTPException(status_code=400, detail="primary_currency is required.")

        if normalized["primary_currency"] not in normalized["supported_currencies"]:
            normalized["supported_currencies"].insert(0, normalized["primary_currency"])

        if existing:
            for key, value in normalized.items():
                setattr(existing, key, value)
            existing.updated_at = now_utc()
            await existing.save()
            saved = existing
        else:
            saved = CountryCurrencyMap(
                **normalized,
                created_at=now_utc(),
                updated_at=now_utc(),
            )
            await saved.insert()

        rate_context = await CurrencyService._rate_context()
        return CurrencyService._enrich_country_mapping(serialize_country_mapping(saved), rate_context)

    @staticmethod
    async def create_currency_rate(data: Dict[str, Any]) -> Dict[str, Any]:
        code = str(data.get("target_currency") or data.get("currency") or "").upper().strip()

        if not code:
            raise HTTPException(status_code=400, detail="target_currency is required.")

        existing = await CurrencyRate.find_one(CurrencyRate.target_currency == code)

        if existing:
            raise HTTPException(status_code=400, detail="Currency rate already exists.")

        payload = dict(data)
        payload["target_currency"] = code
        payload["currency_name"] = payload.get("currency_name") or DEFAULT_SUPPORTED_CURRENCIES.get(code, code)

        if code == "VND":
            payload["rate_to_vnd"] = 1
            payload["market_rate_to_vnd"] = 1
            payload["manual_rate_to_vnd"] = None
            payload["manual_override"] = False
            payload["source"] = "base"
            payload["provider"] = "system"
            payload["is_stale"] = False

        payload.setdefault("rate_to_vnd", safe_float(payload.get("market_rate_to_vnd") or payload.get("rate_to_vnd")))
        payload.setdefault("market_rate_to_vnd", payload.get("rate_to_vnd"))
        payload.setdefault("manual_rate_to_vnd", None)
        payload.setdefault("manual_override", False)
        payload.setdefault("source", "manual")
        payload.setdefault("provider", "admin")
        payload.setdefault("is_active", True)
        payload.setdefault("is_stale", False)
        payload.setdefault("last_updated", now_utc())
        payload.setdefault("created_at", now_utc())
        payload.setdefault("updated_at", now_utc())

        rate = CurrencyRate(**payload)
        await rate.insert()
        return serialize_currency_rate(rate)

    @staticmethod
    async def update_currency_rate(rate_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        rate = await CurrencyRate.get(to_object_id(rate_id))

        if not rate:
            raise HTTPException(status_code=404, detail="Currency rate not found.")

        code = str(rate.target_currency).upper()

        for key, value in data.items():
            if key in {"id", "_id", "created_at"}:
                continue

            if code == "VND" and key in {
                "rate_to_vnd",
                "market_rate_to_vnd",
                "manual_rate_to_vnd",
                "manual_override",
            }:
                continue

            if hasattr(rate, key):
                setattr(rate, key, value)

        if code == "VND":
            rate.rate_to_vnd = 1
            rate.market_rate_to_vnd = 1
            rate.manual_rate_to_vnd = None
            rate.manual_override = False
            rate.source = "base"
            rate.provider = "system"
            rate.is_stale = False
        else:
            if getattr(rate, "manual_override", False) and getattr(rate, "manual_rate_to_vnd", None):
                rate.rate_to_vnd = float(rate.manual_rate_to_vnd)
                rate.source = "manual"
            elif not getattr(rate, "manual_override", False) and getattr(rate, "market_rate_to_vnd", None):
                rate.rate_to_vnd = float(rate.market_rate_to_vnd)

        rate.updated_at = now_utc()
        rate.last_updated = now_utc()

        await rate.save()
        return serialize_currency_rate(rate)

    @staticmethod
    async def delete_currency_rate(rate_id: str) -> Dict[str, Any]:
        rate = await CurrencyRate.get(to_object_id(rate_id))

        if not rate:
            raise HTTPException(status_code=404, detail="Currency rate not found.")

        if str(rate.target_currency).upper() == "VND":
            raise HTTPException(status_code=400, detail="Base currency VND cannot be deleted.")

        await rate.delete()
        return {"message": "Currency rate deleted successfully.", "id": rate_id}

    @staticmethod
    async def sync_market_rates() -> Dict[str, Any]:
        provider_name = (
            getattr(settings, "CURRENCY_PROVIDER", None)
            or getattr(settings, "CURRENCY_PROVIDER_NAME", None)
            or "exchangerate-api"
        )
        api_key = getattr(settings, "CURRENCY_PROVIDER_API_KEY", None)
        base_code = (
            getattr(settings, "CURRENCY_BASE_CODE", None)
            or "USD"
        ).upper()

        started_at = now_utc()

        if not api_key:
            log = CurrencyRateSyncLog(
                provider=provider_name,
                status="failed",
                message="Currency rate provider is not configured.",
                fetched_count=0,
                updated_currencies=[],
                missing_currencies=[],
                started_at=started_at,
                finished_at=now_utc(),
                error_detail="Missing CURRENCY_PROVIDER_API_KEY",
            )
            await log.insert()

            raise HTTPException(
                status_code=400,
                detail="Currency rate provider is not configured.",
            )

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(
                    f"https://v6.exchangerate-api.com/v6/{api_key}/latest/{base_code}"
                )
                response.raise_for_status()
                payload = response.json()

            if payload.get("result") == "error":
                raise RuntimeError(payload.get("error-type") or "Provider returned error.")

            provider_rates = payload.get("conversion_rates", {})

            if not provider_rates:
                raise RuntimeError("Provider did not return conversion_rates.")

            if "VND" not in provider_rates:
                raise RuntimeError("Provider did not return VND rate.")

            await ensure_vnd_base_rate()

            base_to_vnd = safe_float(provider_rates["VND"])

            if base_to_vnd <= 0:
                raise RuntimeError("Invalid VND rate from provider.")

            supported = await get_supported_currency_codes()

            count = 0
            updated_codes: List[str] = []
            missing_codes: List[str] = []

            for target, currency_name in supported.items():
                target = str(target).upper().strip()

                if not target:
                    continue

                if target == "VND":
                    continue

                if target not in provider_rates:
                    missing_codes.append(target)
                    continue

                target_per_base = safe_float(provider_rates[target])

                if target_per_base <= 0:
                    missing_codes.append(target)
                    continue

                rate_to_vnd = base_to_vnd / target_per_base

                db_rate = await CurrencyRate.find_one(CurrencyRate.target_currency == target)
                is_new = db_rate is None

                if is_new:
                    db_rate = CurrencyRate(
                        target_currency=target,
                        currency_name=currency_name or DEFAULT_SUPPORTED_CURRENCIES.get(target, target),
                        rate_to_vnd=rate_to_vnd,
                        market_rate_to_vnd=rate_to_vnd,
                        manual_rate_to_vnd=None,
                        manual_override=False,
                        source="market",
                        provider=provider_name,
                        is_active=True,
                        is_stale=False,
                        last_updated=now_utc(),
                        created_at=now_utc(),
                        updated_at=now_utc(),
                    )
                    await db_rate.insert()
                else:
                    db_rate.currency_name = (
                        getattr(db_rate, "currency_name", None)
                        or currency_name
                        or DEFAULT_SUPPORTED_CURRENCIES.get(target, target)
                    )
                    db_rate.market_rate_to_vnd = rate_to_vnd
                    db_rate.provider = provider_name
                    db_rate.is_stale = False
                    db_rate.last_updated = now_utc()
                    db_rate.updated_at = now_utc()

                    if not getattr(db_rate, "manual_override", False):
                        db_rate.rate_to_vnd = rate_to_vnd
                        db_rate.source = "market"

                    await db_rate.save()

                count += 1
                updated_codes.append(target)

            log = CurrencyRateSyncLog(
                provider=provider_name,
                status="success",
                message="Market rates synchronized successfully.",
                fetched_count=count,
                updated_currencies=updated_codes,
                missing_currencies=missing_codes,
                started_at=started_at,
                finished_at=now_utc(),
                error_detail=None,
            )
            await log.insert()

            return {
                "message": "Market rates synchronized successfully.",
                "count": count,
                "fetched_count": count,
                "provider": provider_name,
                "base_code": base_code,
                "updated_codes": updated_codes,
                "missing_codes": missing_codes,
            }

        except HTTPException:
            raise
        except Exception as exc:
            log = CurrencyRateSyncLog(
                provider=provider_name,
                status="failed",
                message="Sync failed.",
                fetched_count=0,
                updated_currencies=[],
                missing_currencies=[],
                started_at=started_at,
                finished_at=now_utc(),
                error_detail=str(exc),
            )
            await log.insert()

            raise HTTPException(status_code=400, detail=f"Sync failed: {str(exc)}")

    @staticmethod
    async def get_sync_logs() -> List[Dict[str, Any]]:
        logs = await CurrencyRateSyncLog.find_all().sort("-started_at").limit(50).to_list()

        return [
            {
                "id": str(log.id),
                "provider": getattr(log, "provider", None),
                "status": getattr(log, "status", None),
                "message": getattr(log, "message", None),
                "fetched_count": getattr(log, "fetched_count", 0),
                "updated_currencies": getattr(log, "updated_currencies", []) or [],
                "missing_currencies": getattr(log, "missing_currencies", []) or [],
                "started_at": getattr(log, "started_at", None),
                "finished_at": getattr(log, "finished_at", None),
                "error_detail": getattr(log, "error_detail", None),
            }
            for log in logs
        ]
