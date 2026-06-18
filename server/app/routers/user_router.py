from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.controllers.payment_controller import PaymentController
from app.controllers.user_controller import UserController
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.user_schema import (
    UserUpdate,
    ChangePasswordRequest,
    UserPreferencesUpdate,
)


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


@router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    return await UserController.upload_avatar(current_user, file)


@router.post("/me/email/resend-verification")
async def resend_my_email_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    return await UserController.resend_email_verification(
        current_user,
        str(request.base_url),
    )


@router.get("/me/stats")
async def get_my_profile_stats(current_user: User = Depends(get_current_user)):
    return await UserController.get_stats(current_user)


@router.get("/me/profile-config")
async def get_my_profile_config(current_user: User = Depends(get_current_user)):
    return await UserController.get_profile_config()


@router.get("/me/preferences")
async def get_my_preferences(current_user: User = Depends(get_current_user)):
    return await UserController.get_preferences(current_user)


@router.put("/me/preferences")
async def update_my_preferences(
    data: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
):
    return await UserController.update_preferences(current_user, data)


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
