from fastapi import APIRouter, Depends

from app.controllers.feedback_controller import FeedbackController
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.schemas.feedback_schema import FeedbackCreate


router = APIRouter()


@router.post("/")
async def submit_feedback(
    data: FeedbackCreate,
    current_user: User = Depends(get_current_user),
):
    return await FeedbackController.submit(current_user, data)


@router.get("/")
async def get_my_feedbacks(current_user: User = Depends(get_current_user)):
    return await FeedbackController.get_all_for_user(current_user)