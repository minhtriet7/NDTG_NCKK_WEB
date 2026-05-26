from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime


class RecognitionResponse(BaseModel):
    id: str
    status: str
    message: str = "Success"

    final_result: Optional[Dict[str, Any]] = None
    agent_results: List[Dict[str, Any]] = Field(default_factory=list)
    conversion_result: Optional[Dict[str, Any]] = None

    uploaded_image_url: Optional[str] = None
    task_id: Optional[str] = None
    processing_time_ms: Optional[int] = None
    error_message: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None


class RecognitionResultDetail(BaseModel):
    id: str
    user_id: str
    uploaded_image_url: str
    status: str

    final_result: Optional[Dict[str, Any]] = None
    agent_results: List[Dict[str, Any]] = Field(default_factory=list)
    conversion_result: Optional[Dict[str, Any]] = None

    task_id: Optional[str] = None
    processing_time_ms: Optional[int] = None
    error_message: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None