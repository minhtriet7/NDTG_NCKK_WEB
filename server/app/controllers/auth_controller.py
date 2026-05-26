from app.schemas.user_schema import UserRegister, UserLogin
from app.services.auth_service import AuthService


class AuthController:
    @staticmethod
    async def register(data: UserRegister):
        return await AuthService.register_user(data)

    @staticmethod
    async def login(data: UserLogin):
        return await AuthService.login_user(data)