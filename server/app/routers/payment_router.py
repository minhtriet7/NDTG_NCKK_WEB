from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

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


@router.get("/gateway-settings")
async def get_payment_gateway_settings():
    return await PaymentController.get_gateway_settings()


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
    request: Request,
    data: CreateTransactionRequest,
    current_user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    return await PaymentController.buy_tokens(current_user, data, client_ip=client_ip)


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


@router.get("/vnpay/return")
async def payment_vnpay_return(request: Request):
    result = await PaymentController.handle_vnpay_return(dict(request.query_params))

    status = result.get("status", "failed")
    transaction = result.get("transaction") or {}

    # Nếu frontend có trang riêng thì đổi URL này theo route thật của web.
    tx_id = transaction.get("id") or transaction.get("transaction_id") or ""

    if status == "success":
        return RedirectResponse(url=f"/payment/success?transaction_id={tx_id}")

    return RedirectResponse(url=f"/payment/failed?transaction_id={tx_id}")


@router.get("/vnpay/ipn")
async def payment_vnpay_ipn(request: Request):
    result = await PaymentController.handle_vnpay_return(dict(request.query_params))

    if result.get("status") == "success":
        return {
            "RspCode": "00",
            "Message": "Confirm Success",
        }

    return {
        "RspCode": "99",
        "Message": result.get("message", "Payment failed"),
    }