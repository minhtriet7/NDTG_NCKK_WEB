from beanie import Document
from pydantic import Field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


class RecognitionTask(Document):
    user_id: str

    status: str = "processing"  # processing, done, failed
    stage: str = "queued"
    progress: int = 0

    input_image_url: Optional[str] = None
    input_image_path: Optional[str] = None

    result_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    error_message: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None

    class Settings:
        name = "recognition_tasks"