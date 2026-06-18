from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from beanie import PydanticObjectId
from fastapi import HTTPException, UploadFile

from app.models.user_model import User
from app.models.recognition_model import RecognitionRequest
from app.models.token_usage_model import TokenUsage
from app.schemas.user_schema import UserUpdate, ChangePasswordRequest, UserPreferencesUpdate
from app.core.config import settings
from app.core.security import create_secure_token, get_password_hash, hash_token, verify_password
from app.services.email_service import EmailService
from app.utils.cloudinary_handler import upload_image_to_cloudinary
from app.utils.file_handler import validate_and_read_image

try:
    from app.models.config_model import SystemConfig
except Exception:
    SystemConfig = None


DEFAULT_PREFERENCES = {
    "language": "EN",
    "theme": "light",
    "default_country": "Vietnam",
    "default_currency": "VND",
}

EMAIL_VERIFICATION_EXPIRES_HOURS = 24
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60
EMAIL_VERIFICATION_MESSAGE = (
    "If email verification is available, instructions will be sent shortly."
)

SUCCESS_STATUSES = [
    "success",
    "Success",
    "completed",
    "Completed",
    "High Consensus",
    "Partial Success",
]

FAILED_STATUSES = [
    "failed",
    "Failed",
    "error",
    "Error",
]

REVIEW_STATUSES = [
    "Needs Review",
    "needs_review",
    "Conflict Detected",
    "conflict",
    "uncertain",
    "Needs clearer image",
    "needs_better_image",
    "rerun_required",
]

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def serialize_user(user: User) -> Dict[str, Any]:
    provider = getattr(user, "provider", "local")

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": getattr(user, "full_name", ""),
        "role": getattr(user, "role", "user"),
        "provider": provider,
        "token_balance": getattr(user, "token_balance", 0),
        "is_active": getattr(user, "is_active", True),
        "email_verified": is_email_verified(user),
        "phone": getattr(user, "phone", None),
        "country": getattr(user, "country", None),
        "avatar_url": getattr(user, "avatar_url", None),
        "preferences": getattr(user, "preferences", {}) or {},
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
        "token_usage": getattr(record, "token_usage", {}) or {},
        "system_tokens_charged": getattr(record, "system_tokens_charged", 0),
        "balance_before": getattr(record, "balance_before", None),
        "balance_after": getattr(record, "balance_after", None),
        "created_at": getattr(record, "created_at", None),
        "updated_at": getattr(record, "updated_at", None),
    }


def normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if not value:
        return None

    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=timezone.utc)

    return value


def is_email_verified(user: User) -> bool:
    provider = str(getattr(user, "provider", "local") or "local").lower()
    return bool(getattr(user, "email_verified", False)) or provider == "google"


def build_email_verification_url(base_url: str, token: str) -> str:
    frontend_base = str(getattr(settings, "FRONTEND_URL", "") or "").rstrip("/")
    fallback_base = str(base_url or "").rstrip("/")
    app_base = frontend_base or fallback_base or "http://localhost:5173"
    return f"{app_base}/auth/verify-email?token={quote(token)}"


def normalize_status(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def is_success_status(value: Optional[str]) -> bool:
    status_value = normalize_status(value)
    return (
        status_value in {"success", "completed"}
        or "success" in status_value
        or "complete" in status_value
        or "high consensus" in status_value
    )


def is_failed_status(value: Optional[str]) -> bool:
    status_value = normalize_status(value)
    return status_value in {"failed", "error"} or "fail" in status_value


def is_review_status(value: Optional[str]) -> bool:
    status_value = normalize_status(value)
    return (
        not is_success_status(status_value)
        and not is_failed_status(status_value)
        and (
            "review" in status_value
            or "conflict" in status_value
            or "partial" in status_value
            or "uncertain" in status_value
            or "better" in status_value
        )
    )


def normalize_preferences(raw: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    preferences = {
        **DEFAULT_PREFERENCES,
        **(raw or {}),
    }

    preferences["language"] = str(preferences.get("language") or "EN").upper()
    if preferences["language"] not in {"EN", "VI"}:
        preferences["language"] = DEFAULT_PREFERENCES["language"]

    preferences["theme"] = str(preferences.get("theme") or "light").lower()
    if preferences["theme"] not in {"light", "dark", "system"}:
        preferences["theme"] = DEFAULT_PREFERENCES["theme"]

    preferences["default_country"] = str(
        preferences.get("default_country") or DEFAULT_PREFERENCES["default_country"]
    )
    preferences["default_currency"] = str(
        preferences.get("default_currency") or DEFAULT_PREFERENCES["default_currency"]
    ).upper()

    return preferences


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
    async def upload_avatar(user: User, file: UploadFile) -> User:
        image_bytes = await validate_and_read_image(file)
        image_url = await upload_image_to_cloudinary(image_bytes)

        if not image_url:
            raise HTTPException(
                status_code=503,
                detail="Avatar upload service is not configured or unavailable.",
            )

        user.avatar_url = image_url

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return user

    @staticmethod
    async def resend_email_verification(
        user: User,
        base_url: str,
    ) -> Dict[str, Any]:
        if is_email_verified(user):
            if str(getattr(user, "provider", "local") or "local").lower() == "google":
                user.email_verified = True
                user.email_verification_token_hash = None
                user.email_verification_expires_at = None
                user.email_verification_sent_at = None

                if hasattr(user, "updated_at"):
                    user.updated_at = now_utc()

                await user.save()

            return {
                "message": EMAIL_VERIFICATION_MESSAGE,
                "email_verified": True,
            }

        sent_at = normalize_datetime(
            getattr(user, "email_verification_sent_at", None)
        )

        if sent_at:
            seconds_since_last_send = (now_utc() - sent_at).total_seconds()
            if seconds_since_last_send < EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS:
                return {
                    "message": EMAIL_VERIFICATION_MESSAGE,
                    "email_verified": False,
                }

        token = create_secure_token()
        user.email_verification_token_hash = hash_token(token)
        user.email_verification_expires_at = now_utc() + timedelta(
            hours=EMAIL_VERIFICATION_EXPIRES_HOURS
        )
        user.email_verification_sent_at = now_utc()

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

        try:
            await EmailService.send_email_verification_email(
                user,
                build_email_verification_url(base_url, token),
                EMAIL_VERIFICATION_EXPIRES_HOURS,
            )
        except Exception:
            pass

        return {
            "message": EMAIL_VERIFICATION_MESSAGE,
            "email_verified": False,
        }

    @staticmethod
    async def get_profile_stats(user: User) -> Dict[str, Any]:
        user_id = str(user.id)

        total_scans = await RecognitionRequest.find(
            RecognitionRequest.user_id == user_id
        ).count()

        successful_scans = await RecognitionRequest.find(
            {
                "user_id": user_id,
                "status": {"$in": SUCCESS_STATUSES},
            }
        ).count()

        failed_scans = await RecognitionRequest.find(
            {
                "user_id": user_id,
                "status": {"$in": FAILED_STATUSES},
            }
        ).count()

        needs_review_scans = await RecognitionRequest.find(
            {
                "user_id": user_id,
                "status": {"$in": REVIEW_STATUSES},
            }
        ).count()

        recent_records = (
            await RecognitionRequest.find(RecognitionRequest.user_id == user_id)
            .sort("-created_at")
            .limit(5)
            .to_list()
        )

        tokens_used = 0

        try:
            usage_pipeline = [
                {
                    "$match": {
                        "user_id": user_id,
                        "system_tokens_charged": {"$gt": 0},
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "tokens_used": {"$sum": "$system_tokens_charged"},
                    }
                },
            ]
            usage_result = await TokenUsage.get_motor_collection().aggregate(
                usage_pipeline
            ).to_list(length=1)
            tokens_used = int((usage_result[0] or {}).get("tokens_used", 0)) if usage_result else 0
        except Exception:
            tokens_used = 0

        if not tokens_used:
            try:
                history_pipeline = [
                    {"$match": {"user_id": user_id}},
                    {
                        "$group": {
                            "_id": None,
                            "tokens_used": {"$sum": "$system_tokens_charged"},
                        }
                    },
                ]
                history_result = await RecognitionRequest.get_motor_collection().aggregate(
                    history_pipeline
                ).to_list(length=1)
                tokens_used = int((history_result[0] or {}).get("tokens_used", 0)) if history_result else 0
            except Exception:
                tokens_used = 0

        return {
            "total_scans": total_scans,
            "successful_scans": successful_scans,
            "failed_scans": failed_scans,
            "needs_review_scans": needs_review_scans,
            "tokens_used": tokens_used,
            "last_scan_at": getattr(recent_records[0], "created_at", None)
            if recent_records
            else None,
            "recent_activity": [
                serialize_history(record)
                for record in recent_records
            ],
        }

    @staticmethod
    async def get_profile_config() -> Dict[str, Any]:
        config = None

        if SystemConfig is not None:
            try:
                config = await SystemConfig.find_one()
            except Exception:
                config = None

        raw_token_cost = getattr(config, "token_cost_per_scan", 1)
        token_cost = int(raw_token_cost if raw_token_cost is not None else 1)
        billing_mode = getattr(config, "token_billing_mode", "fixed") or "fixed"
        dynamic_enabled = bool(
            getattr(config, "dynamic_ai_token_billing_enabled", False)
        )

        if billing_mode == "dynamic" and dynamic_enabled:
            billing_note = (
                "Dynamic billing is enabled. Actual token cost can vary by AI usage."
            )
        else:
            billing_note = "Fixed default scan cost from system settings."

        return {
            "token_cost_per_scan": token_cost,
            "currency": "VND",
            "billing_note": billing_note,
            "billing_mode": billing_mode,
            "dynamic_billing_enabled": dynamic_enabled,
        }

    @staticmethod
    async def get_preferences(user: User) -> Dict[str, str]:
        return normalize_preferences(getattr(user, "preferences", {}) or {})

    @staticmethod
    async def update_preferences(
        user: User,
        data: UserPreferencesUpdate,
    ) -> Dict[str, str]:
        payload = data.model_dump(exclude_unset=True)
        preferences = normalize_preferences(getattr(user, "preferences", {}) or {})

        if "language" in payload and payload["language"] is not None:
            language = str(payload["language"]).strip().upper()
            if language not in {"EN", "VI"}:
                raise HTTPException(status_code=400, detail="Invalid language.")
            preferences["language"] = language

        if "theme" in payload and payload["theme"] is not None:
            theme = str(payload["theme"]).strip().lower()
            if theme not in {"light", "dark", "system"}:
                raise HTTPException(status_code=400, detail="Invalid theme.")
            preferences["theme"] = theme

        if "default_country" in payload and payload["default_country"] is not None:
            country = str(payload["default_country"]).strip()
            if not country:
                raise HTTPException(status_code=400, detail="Invalid default country.")
            preferences["default_country"] = country

        if "default_currency" in payload and payload["default_currency"] is not None:
            currency = str(payload["default_currency"]).strip().upper()
            if not currency or len(currency) > 10:
                raise HTTPException(status_code=400, detail="Invalid default currency.")
            preferences["default_currency"] = currency

        user.preferences = preferences

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return preferences

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
