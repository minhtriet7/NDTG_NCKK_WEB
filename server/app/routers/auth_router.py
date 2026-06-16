from datetime import datetime, timezone
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request, status, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

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


class NativeGoogleLogin(BaseModel):
    id_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    return await AuthController.register(data)


@router.post("/login")
async def login(data: UserLogin):
    return await AuthController.login(data)


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    return await AuthController.forgot_password(data.email)


@router.post("/google/native")
async def google_native_login(data: NativeGoogleLogin):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth is not configured on this server.",
        )

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        # Verify ID token
        # We pass audience=None to support multiple clients (Web, Android, iOS)
        id_info = google_id_token.verify_oauth2_token(
            data.id_token,
            google_requests.Request(),
            audience=None
        )

        email = id_info.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email missing from Google token.",
            )

        full_name = id_info.get("name") or email
        avatar_url = id_info.get("picture")

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

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "token_balance": user.token_balance,
                "avatar_url": user.avatar_url,
            }
        }

    except ValueError as val_err:
        logger.error(f"Google ID Token verification failed: {val_err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Google ID Token: {str(val_err)}",
        )
    except Exception as exc:
        logger.error(f"Google Native Login failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during Google authentication.",
        )


@router.get("/google/login")
async def google_login(
    request: Request,
    platform: str = "web",
    redirect_url: Optional[str] = None
):
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        if platform == "mobile":
            return RedirectResponse(
                url="banknoteai://auth/google/success?error=GoogleOAuthNotConfigured"
            )

        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/auth/login?error=GoogleOAuthNotConfigured"
        )

    # Check if a specific redirect URI is configured and if its domain differs from the current request host.
    # If there is a mismatch, redirect the browser to the correct host to ensure session cookies are set/read correctly.
    if settings.GOOGLE_REDIRECT_URI:
        from urllib.parse import urlparse, urlunparse, urlencode
        configured_url = urlparse(settings.GOOGLE_REDIRECT_URI)
        configured_host = configured_url.netloc.lower()
        
        # Determine current request host (with reverse proxy headers considered)
        request_host = request.headers.get("x-forwarded-host", request.url.netloc).lower()
        
        # Clean port numbers for host comparison
        conf_host_clean = configured_host.split(":")[0]
        req_host_clean = request_host.split(":")[0]
        
        if conf_host_clean != req_host_clean:
            target_scheme = configured_url.scheme
            if "ngrok-free.dev" in configured_host:
                target_scheme = "https"
                
            query_params = dict(request.query_params)
            new_query = urlencode(query_params)
            target_path = request.url.path
            
            redirect_target = urlunparse((
                target_scheme,
                configured_host,
                target_path,
                "",
                new_query,
                ""
            ))
            
            logger.info(f"Redirecting login request from {request_host} to {configured_host} to match GOOGLE_REDIRECT_URI: {redirect_target}")
            return RedirectResponse(url=redirect_target)

    request.session["google_oauth_platform"] = platform

    # Determine frontend URL dynamically from Referer header or query parameter
    from urllib.parse import urlparse
    referer = request.headers.get("referer")
    frontend_url = redirect_url
    if not frontend_url and referer:
        try:
            parsed = urlparse(referer)
            if parsed.scheme and parsed.netloc:
                frontend_url = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass

    if frontend_url:
        try:
            domain = urlparse(frontend_url).netloc.lower()
            allowed = "localhost" in domain or "ngrok" in domain
            if settings.FRONTEND_URL:
                allowed = allowed or (urlparse(settings.FRONTEND_URL).netloc.lower() in domain)
            
            if allowed:
                request.session["google_oauth_frontend_url"] = frontend_url
                logger.info(f"GOOGLE OAUTH dynamic frontend_url detected: {frontend_url}")
        except Exception:
            pass

    redirect_uri = settings.GOOGLE_REDIRECT_URI
    if not redirect_uri:
        # Dynamically build based on request scheme and host
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host", request.url.netloc)
        redirect_uri = f"{scheme}://{host}/api/v1/auth/google/callback"

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

    # Fallback frontend URL
    fallback_frontend = settings.FRONTEND_URL or "http://localhost:5173"
    frontend_url = request.session.pop("google_oauth_frontend_url", fallback_frontend)

    if token:
        return RedirectResponse(
            url=f"{frontend_url}/auth/google/success?token={token}"
        )

    return RedirectResponse(
        url=f"{frontend_url}/auth/login?error={error or 'GoogleAuthFailed'}"
    )
