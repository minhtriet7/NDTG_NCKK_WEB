from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone


class Feedback(Document):
    user_id: str

    feedback_type: str = "other"
    priority: str = "medium"
    rating: Optional[int] = None

    subject: Optional[str] = None
    message: str

    attached_image_url: Optional[str] = None
    related_result_id: Optional[str] = None
    related_transaction_id: Optional[str] = None

    is_resolved: bool = False
    status: str = "new"
    admin_reply: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None

    class Settings:
        name = "feedbacks"