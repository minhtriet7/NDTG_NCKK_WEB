from fastapi import APIRouter, Depends, Request

from app.controllers.payment_controller import PaymentController
from app.core.dependencies import get_current_user
from app.models.token_package_model import TokenPackage
from app.models.user_model import User
from app.schemas.payment_schema import CreateTransactionRequest


router = APIRouter()


def serialize_token_package(pkg: TokenPackage) -> dict:
    return {
        "id": str(pkg.id),
        "package_key": getattr(pkg, "package_key", None),
        "name": pkg.name,
        "description": getattr(pkg, "description", ""),
        "tokens": getattr(pkg, "tokens_included", 0),
        "tokens_included": getattr(pkg, "tokens_included", 0),
        "price_vnd": getattr(pkg, "price_vnd", 0),
        "price_usd": getattr(pkg, "price_usd", 0),
        "features": getattr(pkg, "features", []) or [],
        "badge": getattr(pkg, "badge", ""),
        "sort_order": getattr(pkg, "sort_order", 0),
        "is_active": getattr(pkg, "is_active", True),
    }


@router.get("/token-packages")
async def get_all_active_packages():
    packages = (
        await TokenPackage.find(TokenPackage.is_active == True)
        .sort("sort_order")
        .to_list()
    )

    return [serialize_token_package(pkg) for pkg in packages]


@router.post("/buy")
async def buy_tokens(
    data: CreateTransactionRequest,
    current_user: User = Depends(get_current_user),
):
    return await PaymentController.buy_tokens(current_user, data)


@router.get("/status/{transaction_id}")
async def get_payment_status(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
):
    return await PaymentController.get_payment_status(current_user, transaction_id)


@router.get("/transactions")
async def get_my_transactions(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    return await PaymentController.get_my_transactions(current_user, limit)


@router.post("/webhook/sepay")
async def payment_sepay_webhook(request: Request):
    payload = await request.json()
    return await PaymentController.handle_webhook_payload(payload)