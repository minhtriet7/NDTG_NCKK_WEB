from app.models.user_model import User
from app.schemas.feedback_schema import FeedbackCreate
from app.services.feedback_service import FeedbackService


class FeedbackController:
    @staticmethod
    async def submit(user: User, data: FeedbackCreate):
        return await FeedbackService.create_feedback(user, data)

    @staticmethod
    async def get_all_for_user(user: User):
        return await FeedbackService.get_user_feedbacks(user)

    @staticmethod
    async def get_all():
        return await FeedbackService.get_all_feedbacks()

    @staticmethod
    async def mark_resolved(feedback_id: str, admin_reply: str = None):
        return await FeedbackService.mark_resolved(feedback_id, admin_reply)