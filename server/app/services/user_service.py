from datetime import datetime, timezone
from typing import Any, Dict, List

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.models.user_model import User
from app.models.recognition_model import RecognitionRequest
from app.schemas.user_schema import UserUpdate, ChangePasswordRequest
from app.core.security import verify_password, get_password_hash
from app.services.email_service import EmailService

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": getattr(user, "full_name", ""),
        "role": getattr(user, "role", "user"),
        "provider": getattr(user, "provider", "local"),
        "token_balance": getattr(user, "token_balance", 0),
        "is_active": getattr(user, "is_active", True),
        "phone": getattr(user, "phone", None),
        "country": getattr(user, "country", None),
        "avatar_url": getattr(user, "avatar_url", None),
        "created_at": getattr(user, "created_at", None),
        "updated_at": getattr(user, "updated_at", None),
        "last_login_at": getattr(user, "last_login_at", None),
        "has_password": bool(getattr(user, "hashed_password", "")),
    }


def serialize_history(record: RecognitionRequest) -> Dict[str, Any]:
    return {
        "id": str(record.id),
        "user_id": getattr(record, "user_id", None),
        "uploaded_image_url": getattr(record, "uploaded_image_url", None),
        "image_url": getattr(record, "uploaded_image_url", None),
        "status": getattr(record, "status", None),
        "final_result": getattr(record, "final_result", None),
        "agent_results": getattr(record, "agent_results", []) or [],
        "conversion_result": getattr(record, "conversion_result", None),
        "task_id": getattr(record, "task_id", None),
        "processing_time_ms": getattr(record, "processing_time_ms", None),
        "error_message": getattr(record, "error_message", None),
        "created_at": getattr(record, "created_at", None),
        "updated_at": getattr(record, "updated_at", None),
    }


class UserService:
    @staticmethod
    async def update_profile(user: User, data: UserUpdate) -> User:
        payload = data.model_dump(exclude_unset=True)

        allowed_fields = {"full_name", "avatar_url", "phone", "country"}

        for key, value in payload.items():
            if key in allowed_fields and value is not None and hasattr(user, key):
                setattr(user, key, value)

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return user

    @staticmethod
    async def change_password(user: User, data: ChangePasswordRequest) -> Dict[str, Any]:
        current_password = getattr(data, "current_password", None)
        new_password = getattr(data, "new_password", None)

        if not new_password or len(new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

        current_hash = getattr(user, "hashed_password", "") or ""

        if current_hash:
            if not current_password:
                raise HTTPException(status_code=400, detail="Current password is required.")

            if not verify_password(current_password, current_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect.")

        user.hashed_password = get_password_hash(new_password)

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

        try:
            await EmailService.send_password_updated_email(user)
        except Exception:
            pass

        return {
            "message": "Password updated successfully.",
            "has_password": True,
        }

    @staticmethod
    async def get_recognition_history(user_id: str) -> List[Dict[str, Any]]:
        history = (
            await RecognitionRequest.find(RecognitionRequest.user_id == str(user_id))
            .sort("-created_at")
            .to_list()
        )

        return [serialize_history(record) for record in history]

    @staticmethod
    async def get_user_by_id(user_id: str) -> User:
        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        return user