from app.schemas.user_schema import UserRegister, UserLogin
from app.services.auth_service import AuthService
from app.services.email_service import EmailService


class AuthController:
    @staticmethod
    async def register(data: UserRegister):
        result = await AuthService.register_user(data)

        try:
            user = result if isinstance(result, dict) else None

            await EmailService.send_register_email(
                user_or_email=user.get("email") if user else data.email,
                full_name=user.get("full_name") if user else getattr(data, "full_name", None),
            )
        except Exception:
            pass

        return result

    @staticmethod
    async def login(data: UserLogin):
        result = await AuthService.login_user(data)

        # Không có checkbox Login thường trong admin nên không bắt buộc gửi.
        # Nếu bạn muốn gửi mỗi lần login thì mở đoạn này:
        #
        # try:
        #     user = result.get("user") if isinstance(result, dict) else None
        #     await EmailService.send_login_email(
        #         user_or_email=user.get("email") if user else data.email,
        #         full_name=user.get("full_name") if user else data.email,
        #     )
        # except Exception:
        #     pass

        return result