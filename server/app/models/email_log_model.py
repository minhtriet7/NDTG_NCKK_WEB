from datetime import datetime, timezone
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field


class EmailLog(Document):
    recipient_email: str
    recipient_user_id: Optional[str] = None

    subject: str
    template_key: str = "generic"

    status: str = "pending"  # pending, sent, failed, skipped
    error_message: Optional[str] = None

    metadata: Dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    sent_at: Optional[datetime] = None

    class Settings:
        name = "email_logs"