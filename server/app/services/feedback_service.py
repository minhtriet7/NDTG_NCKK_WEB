from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.models.user_model import User
from app.models.feedback_model import Feedback
from app.schemas.feedback_schema import FeedbackCreate


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def serialize_feedback(feedback: Feedback) -> Dict[str, Any]:
    return {
        "id": str(feedback.id),
        "user_id": getattr(feedback, "user_id", None),
        "feedback_type": getattr(feedback, "feedback_type", "other"),
        "priority": getattr(feedback, "priority", "medium"),
        "rating": getattr(feedback, "rating", None),
        "subject": getattr(feedback, "subject", None),
        "message": getattr(feedback, "message", ""),
        "attached_image_url": getattr(feedback, "attached_image_url", None),
        "related_result_id": getattr(feedback, "related_result_id", None),
        "related_transaction_id": getattr(feedback, "related_transaction_id", None),
        "is_resolved": getattr(feedback, "is_resolved", False),
        "status": getattr(feedback, "status", "new"),
        "admin_reply": getattr(feedback, "admin_reply", None),
        "created_at": getattr(feedback, "created_at", None),
        "updated_at": getattr(feedback, "updated_at", None),
        "resolved_at": getattr(feedback, "resolved_at", None),
    }


class FeedbackService:
    @staticmethod
    async def create_feedback(user: User, data: FeedbackCreate) -> Dict[str, Any]:
        payload = data.model_dump(exclude_unset=True)

        feedback = Feedback(
            user_id=str(user.id),
            feedback_type=payload.get("feedback_type") or "suggestion",
            priority=payload.get("priority") or "medium",
            rating=payload.get("rating"),
            subject=payload.get("subject"),
            message=payload.get("message", ""),
            attached_image_url=payload.get("attached_image_url"),
            related_result_id=payload.get("related_result_id"),
            related_transaction_id=payload.get("related_transaction_id"),
            is_resolved=False,
            status="pending",
            admin_reply=None,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await feedback.insert()
        return serialize_feedback(feedback)

    @staticmethod
    async def get_user_feedbacks(user: User) -> List[Dict[str, Any]]:
        feedbacks = (
            await Feedback.find({"user_id": str(user.id)})
            .sort("-created_at")
            .to_list()
        )

        return [serialize_feedback(feedback) for feedback in feedbacks]

    @staticmethod
    async def get_all_feedbacks() -> List[Dict[str, Any]]:
        feedbacks = await Feedback.find_all().sort("-created_at").to_list()
        return [serialize_feedback(feedback) for feedback in feedbacks]

    @staticmethod
    async def mark_resolved(feedback_id: str, admin_reply: Optional[str] = None) -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        feedback.is_resolved = True
        feedback.status = "resolved"
        feedback.admin_reply = admin_reply
        feedback.resolved_at = now_utc()
        feedback.updated_at = now_utc()

        await feedback.save()
        return serialize_feedback(feedback)