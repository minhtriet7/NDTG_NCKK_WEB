from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException, status

from app.models.user_model import User
from app.schemas.user_schema import UserRegister, UserLogin
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    hash_token,
    verify_password,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


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
        "email_verified": bool(getattr(user, "email_verified", False))
        or str(provider).lower() == "google",
        "phone": getattr(user, "phone", None),
        "country": getattr(user, "country", None),
        "avatar_url": getattr(user, "avatar_url", None),
        "created_at": getattr(user, "created_at", None),
        "updated_at": getattr(user, "updated_at", None),
        "last_login_at": getattr(user, "last_login_at", None),
        "has_password": bool(getattr(user, "hashed_password", "")),
    }


class AuthService:
    @staticmethod
    async def verify_email_token(token: str) -> Dict[str, Any]:
        normalized_token = str(token or "").strip()

        if not normalized_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token.",
            )

        user = await User.find_one(
            User.email_verification_token_hash == hash_token(normalized_token)
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token.",
            )

        expires_at = getattr(user, "email_verification_expires_at", None)

        if not expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token.",
            )

        if getattr(expires_at, "tzinfo", None) is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < now_utc():
            user.email_verification_token_hash = None
            user.email_verification_expires_at = None
            await user.save()

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification token.",
            )

        user.email_verified = True
        user.email_verification_token_hash = None
        user.email_verification_expires_at = None
        user.email_verification_sent_at = None
        user.updated_at = now_utc()
        await user.save()

        return {
            "message": "Email verified successfully.",
            "email_verified": True,
        }

    @staticmethod
    async def request_password_reset(email: str) -> Dict[str, Any]:
        if email:
            await User.find_one(User.email == email)

        return {
            "message": "If this email is registered, password reset instructions will be sent.",
        }

    @staticmethod
    async def register_user(data: UserRegister) -> Dict[str, Any]:
        existing_user = await User.find_one(User.email == data.email)

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered.",
            )

        new_user = User(
            email=data.email,
            hashed_password=get_password_hash(data.password),
            full_name=data.full_name,
            role="user",
            provider="local",
            token_balance=5,
            is_active=True,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await new_user.insert()
        return serialize_user(new_user)

    @staticmethod
    async def login_user(data: UserLogin) -> Dict[str, Any]:
        user = await User.find_one(User.email == data.email)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password.",
            )

        if not getattr(user, "is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is locked.",
            )

        hashed_password = getattr(user, "hashed_password", "") or ""

        if not hashed_password or not verify_password(data.password, hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password.",
            )

        if hasattr(user, "last_login_at"):
            user.last_login_at = now_utc()
            await user.save()

        access_token = create_access_token(subject=str(user.id))
        refresh_token = create_refresh_token(subject=str(user.id))

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": serialize_user(user),
        }

    @staticmethod
    async def refresh_access_token(refresh_token: str) -> Dict[str, Any]:
        try:
            payload = decode_access_token(refresh_token)
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
        
        try:
            from bson import ObjectId
            user = await User.get(ObjectId(user_id))
        except Exception:
            user = None
            
        if not user or not getattr(user, "is_active", True):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")
            
        new_access_token = create_access_token(subject=str(user.id))
        new_refresh_token = create_refresh_token(subject=str(user.id))
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "user": serialize_user(user),
        }
