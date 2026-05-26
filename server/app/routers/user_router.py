from fastapi import APIRouter, Depends

from app.controllers.payment_controller import PaymentController
from app.controllers.user_controller import UserController
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.user_schema import UserUpdate, ChangePasswordRequest


router = APIRouter()


@router.get("/me")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return await UserController.get_profile(current_user)


@router.put("/me")
async def update_my_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
):
    return await UserController.update_profile(current_user, data)


@router.put("/me/password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    return await UserController.change_password(current_user, data)


@router.get("/me/history")
async def get_my_recognition_history(current_user: User = Depends(get_current_user)):
    return await UserController.get_history(current_user)


@router.get("/me/transactions")
async def get_my_transactions(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    return await PaymentController.get_my_transactions(current_user, limit)