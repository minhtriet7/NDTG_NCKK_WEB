from datetime import datetime, timezone
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request, status
from fastapi.responses import RedirectResponse

from app.controllers.auth_controller import AuthController
from app.core.config import settings
from app.core.logger import get_logger
from app.core.security import create_access_token
from app.models.user_model import User
from app.schemas.user_schema import UserRegister, UserLogin
from app.services.email_service import EmailService


router = APIRouter()
logger = get_logger(__name__)

oauth = OAuth()

if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    return await AuthController.register(data)


@router.post("/login")
async def login(data: UserLogin):
    return await AuthController.login(data)


@router.get("/google/login")
async def google_login(request: Request, platform: str = "web"):
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        if platform == "mobile":
            return RedirectResponse(
                url="banknoteai://auth/google/success?error=GoogleOAuthNotConfigured"
            )

        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/auth/login?error=GoogleOAuthNotConfigured"
        )

    request.session["google_oauth_platform"] = platform

    redirect_uri = (
        settings.GOOGLE_REDIRECT_URI
        or "http://localhost:8000/api/v1/auth/google/callback"
    )

    logger.info(f"GOOGLE OAUTH redirect_uri USED: {redirect_uri}")

    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")

        if not user_info:
            return _redirect_google_result(
                request,
                error="GoogleAuthFailed",
            )

        email = user_info.get("email")
        full_name = user_info.get("name") or email
        avatar_url = user_info.get("picture")

        if not email:
            return _redirect_google_result(
                request,
                error="GoogleEmailMissing",
            )

        user = await User.find_one(User.email == email)
        is_google_first_login = False

        if not user:
            is_google_first_login = True

            user = User(
                email=email,
                full_name=full_name,
                hashed_password="",
                role="user",
                provider="google",
                token_balance=10,
                is_active=True,
                avatar_url=avatar_url,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                last_login_at=datetime.now(timezone.utc),
            )
            await user.insert()
        else:
            if hasattr(user, "provider"):
                user.provider = getattr(user, "provider", None) or "google"

            if avatar_url and hasattr(user, "avatar_url"):
                user.avatar_url = avatar_url

            if hasattr(user, "last_login_at"):
                user.last_login_at = datetime.now(timezone.utc)

            if hasattr(user, "updated_at"):
                user.updated_at = datetime.now(timezone.utc)

            await user.save()

        access_token = create_access_token(subject=str(user.id))

        if is_google_first_login:
            try:
                await EmailService.send_google_first_login_email(user)
            except Exception as exc:
                logger.warning("Google first login email failed: %s", exc)

        return _redirect_google_result(
            request,
            token=access_token,
        )

    except Exception as exc:
        logger.error("Google OAuth callback failed: %s", exc, exc_info=True)

        return _redirect_google_result(
            request,
            error="ServerError",
        )


def _redirect_google_result(
    request: Request,
    token: Optional[str] = None,
    error: Optional[str] = None,
):
    platform = request.session.pop("google_oauth_platform", "web")

    if platform == "mobile":
        if token:
            return RedirectResponse(
                url=f"banknoteai://auth/google/success?token={token}"
            )

        return RedirectResponse(
            url=f"banknoteai://auth/google/success?error={error or 'GoogleAuthFailed'}"
        )

    if token:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/auth/google/success?token={token}"
        )

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/auth/login?error={error or 'GoogleAuthFailed'}"
    )