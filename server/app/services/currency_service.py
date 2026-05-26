from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core.config import settings
from app.models.currency_model import CurrencyRate, CurrencyRateSyncLog
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
}


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

        return {
            "base": "VND",
            "source": source or "database",
            "provider": provider or "system",
            "last_updated": latest_update,
            "is_stale": is_stale_overall,
            "stale_after_hours": stale_after_hours,
            "rates": rate_map,
            "items": items,
        }

    @staticmethod
    async def convert_to_vnd(data: ConvertRequest) -> Dict[str, Any]:
        amount = float(data.amount)
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

        amount_in_vnd = amount * float(rates[from_currency])
        converted_amount = amount_in_vnd / float(rates[to_currency])

        return {
            "amount": amount,
            "original_amount": amount,
            "from_currency": from_currency,
            "to_currency": to_currency,
            "rate_from": float(rates[from_currency]),
            "rate_to": float(rates[to_currency]),
            "exchange_rate": float(rates[from_currency]) / float(rates[to_currency]),
            "converted_amount": converted_amount,
            "source": public_rates.get("source"),
            "provider": public_rates.get("provider"),
            "is_stale": public_rates.get("is_stale", False),
            "last_updated": public_rates.get("last_updated"),
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

            for target, currency_name in supported.items():
                target = str(target).upper().strip()

                if not target:
                    continue

                if target == "VND":
                    continue

                if target not in provider_rates:
                    continue

                target_per_base = safe_float(provider_rates[target])

                if target_per_base <= 0:
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
            }

        except HTTPException:
            raise
        except Exception as exc:
            log = CurrencyRateSyncLog(
                provider=provider_name,
                status="failed",
                message="Sync failed.",
                fetched_count=0,
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
                "started_at": getattr(log, "started_at", None),
                "finished_at": getattr(log, "finished_at", None),
                "error_detail": getattr(log, "error_detail", None),
            }
            for log in logs
        ]