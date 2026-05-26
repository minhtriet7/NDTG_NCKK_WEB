from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class FeedbackCreate(BaseModel):
    feedback_type: str = Field(default="suggestion")
    priority: str = Field(default="medium")
    rating: Optional[int] = Field(default=None, ge=1, le=5)

    subject: Optional[str] = None
    message: str = Field(min_length=1)

    attached_image_url: Optional[str] = None
    related_result_id: Optional[str] = None
    related_transaction_id: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    user_id: str

    feedback_type: str
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

    created_at: datetime
    updated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FeedbackStatusUpdate(BaseModel):
    status: str


class FeedbackPriorityUpdate(BaseModel):
    priority: str


class FeedbackReplyRequest(BaseModel):
    admin_reply: str
    status: str = "resolved"