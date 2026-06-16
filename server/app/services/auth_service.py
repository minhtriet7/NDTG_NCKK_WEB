from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException, status

from app.models.user_model import User
from app.schemas.user_schema import UserRegister, UserLogin
from app.core.security import get_password_hash, verify_password, create_access_token


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


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


class AuthService:
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

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": serialize_user(user),
        }
