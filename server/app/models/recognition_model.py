from beanie import Document
from pydantic import Field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone


class RecognitionRequest(Document):
    user_id: str
    uploaded_image_url: str

    status: str = "success"  # success, Completed, Failed, Needs Review, rerun_required, uncertain

    final_result: Optional[Dict[str, Any]] = None
    agent_results: List[Dict[str, Any]] = Field(default_factory=list)
    conversion_result: Optional[Dict[str, Any]] = None

    task_id: Optional[str] = None
    processing_time_ms: Optional[int] = None
    error_message: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "recognition_requests"