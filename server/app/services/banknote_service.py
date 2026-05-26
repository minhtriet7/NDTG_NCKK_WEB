from datetime import datetime, timezone
from typing import Any, Dict, List

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.models.banknote_model import Banknote


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def serialize_banknote(banknote: Banknote) -> Dict[str, Any]:
    return {
        "id": str(banknote.id),
        "country": getattr(banknote, "country", ""),
        "denomination": getattr(banknote, "denomination", ""),
        "currency_code": getattr(banknote, "currency_code", ""),
        "origin": getattr(banknote, "origin", ""),
        "description": getattr(banknote, "description", ""),
        "features": getattr(banknote, "features", []) or [],
        "material": getattr(banknote, "material", "Unknown"),
        "series_year": getattr(banknote, "series_year", "Unknown"),
        "front_image_url": getattr(banknote, "front_image_url", None),
        "back_image_url": getattr(banknote, "back_image_url", None),
        "is_active": getattr(banknote, "is_active", True),
        "created_at": getattr(banknote, "created_at", None),
        "updated_at": getattr(banknote, "updated_at", None),
    }


class BanknoteService:
    @staticmethod
    async def get_all_banknotes() -> List[Dict[str, Any]]:
        banknotes = await Banknote.find({"is_active": True}).sort("country").to_list()
        return [serialize_banknote(banknote) for banknote in banknotes]

    @staticmethod
    async def get_banknote_by_id(banknote_id: str) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        return serialize_banknote(banknote)

    @staticmethod
    async def create_banknote(data: Dict[str, Any]) -> Dict[str, Any]:
        banknote = Banknote(**data)
        await banknote.insert()
        return serialize_banknote(banknote)

    @staticmethod
    async def update_banknote(banknote_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        for key, value in data.items():
            if key in {"id", "_id", "created_at"}:
                continue

            if hasattr(banknote, key):
                setattr(banknote, key, value)

        if hasattr(banknote, "updated_at"):
            banknote.updated_at = now_utc()

        await banknote.save()
        return serialize_banknote(banknote)

    @staticmethod
    async def delete_banknote(banknote_id: str) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        await banknote.delete()
        return {"message": "Banknote deleted successfully.", "id": banknote_id}