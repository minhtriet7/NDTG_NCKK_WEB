from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from app.routers.token_usage_router import router as token_usage_router
from app.core.database import init_db
from app.core.config import settings

from app.routers.auth_router import router as auth_router
from app.routers.user_router import router as user_router
from app.routers.recognition_router import router as recognition_router
from app.routers.banknote_router import router as banknote_router
from app.routers.payment_router import router as payment_router
from app.routers.currency_router import router as currency_router
from app.routers.feedback_router import router as feedback_router
from app.routers.admin_router import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API cho hệ thống nhận diện tiền giấy Đông Nam Á",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    max_age=3600,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail

    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("detail") or "Request failed"
        error_code = detail.get("error_code") or "HTTP_ERROR"
    else:
        message = str(detail)
        error_code = "HTTP_ERROR"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": message,
            "error_code": error_code,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "error_code": "INTERNAL_SERVER_ERROR",
        },
    )


app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(user_router, prefix="/api/v1/users", tags=["Users"])
app.include_router(recognition_router, prefix="/api/v1/recognition", tags=["Recognition"])
app.include_router(banknote_router, prefix="/api/v1/banknotes", tags=["Banknotes"])
app.include_router(payment_router, prefix="/api/v1/payment", tags=["Payment"])
app.include_router(currency_router, prefix="/api/v1/currency", tags=["Currency"])
app.include_router(feedback_router, prefix="/api/v1/feedback", tags=["Feedback"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(token_usage_router, prefix="/api/v1/token-usage", tags=["Token Usage"])


@app.get("/")
async def root():
    return {"message": "Welcome to Banknote Recognition API"}