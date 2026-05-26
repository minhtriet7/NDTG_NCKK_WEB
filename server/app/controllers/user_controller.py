from app.models.user_model import User
from app.schemas.user_schema import UserUpdate, ChangePasswordRequest
from app.services.user_service import UserService


def serialize_user_profile(user: User):
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


class UserController:
    @staticmethod
    async def get_profile(user: User):
        return serialize_user_profile(user)

    @staticmethod
    async def update_profile(user: User, data: UserUpdate):
        updated_user = await UserService.update_profile(user, data)
        return serialize_user_profile(updated_user)

    @staticmethod
    async def change_password(user: User, data: ChangePasswordRequest):
        return await UserService.change_password(user, data)

    @staticmethod
    async def get_history(user: User):
        return await UserService.get_recognition_history(str(user.id))