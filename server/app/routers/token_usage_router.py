from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.services.token_billing_service import TokenBillingService


router = APIRouter()


def is_admin(user: User) -> bool:
    role = str(getattr(user, "role", "user") or "user").lower()
    return role in ["admin", "superadmin"]


@router.get("/my")
async def get_my_token_usage_logs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    return await TokenBillingService.list_user_token_usages(
        user_id=str(current_user.id),
        limit=limit,
    )


@router.get("/admin")
async def get_admin_token_usage_logs(
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    if not is_admin(current_user):
        return {
            "items": [],
            "total": 0,
            "error": "Admin permission required.",
        }

    return await TokenBillingService.list_all_token_usages(limit=limit)