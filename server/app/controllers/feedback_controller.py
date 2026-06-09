from beanie import PydanticObjectId

from app.models.feedback_model import Feedback
from app.models.user_model import User
from app.schemas.feedback_schema import FeedbackCreate
from app.services.feedback_service import FeedbackService
from app.services.email_service import EmailService


def to_object_id(value: str) -> PydanticObjectId:
    return PydanticObjectId(value)


class FeedbackController:
    @staticmethod
    async def submit(user: User, data: FeedbackCreate):
        feedback = await FeedbackService.create_feedback(user, data)

        try:
            await EmailService.send_feedback_created_email(user, feedback)
        except Exception:
            pass

        return feedback

    @staticmethod
    async def get_all_for_user(user: User):
        return await FeedbackService.get_user_feedbacks(user)

    @staticmethod
    async def get_all():
        return await FeedbackService.get_all_feedbacks()

    @staticmethod
    async def mark_resolved(feedback_id: str, admin_reply: str = None):
        result = await FeedbackService.mark_resolved(feedback_id, admin_reply)

        try:
            feedback = None

            if isinstance(result, Feedback):
                feedback = result
            else:
                feedback = await Feedback.get(to_object_id(feedback_id))

            if feedback and getattr(feedback, "user_id", None):
                user = await User.get(to_object_id(feedback.user_id))

                if user:
                    await EmailService.send_feedback_replied_email(user, feedback)

        except Exception:
            pass

        return result