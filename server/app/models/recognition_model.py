from beanie import Document
from pydantic import Field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone


class RecognitionRequest(Document):
    user_id: str
    uploaded_image_url: str

    # success, Completed, Failed, Needs Review, rerun_required, uncertain
    status: str = "success"

    final_result: Optional[Dict[str, Any]] = None
    agent_results: List[Dict[str, Any]] = Field(default_factory=list)
    conversion_result: Optional[Dict[str, Any]] = None

    task_id: Optional[str] = None
    processing_time_ms: Optional[int] = None
    error_message: Optional[str] = None

    # ============================================================
    # TOKEN BILLING / TOKEN USAGE
    # ============================================================
    token_usage: Dict[str, Any] = Field(default_factory=dict)

    system_tokens_charged: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_ai_tokens: int = 0
    billable_ai_tokens: int = 0

    billing_mode: Optional[str] = None
    balance_before: Optional[int] = None
    balance_after: Optional[int] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "recognition_requests"