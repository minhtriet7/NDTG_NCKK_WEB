from beanie import Document
from pydantic import Field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


class SystemLog(Document):
    level: str = "INFO"
    module: str = "system"
    message: str

    request_id: Optional[str] = None
    user_id: Optional[str] = None
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None

    error_detail: Optional[str] = None
    stack_trace: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "system_logs"