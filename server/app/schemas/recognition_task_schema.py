from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from datetime import datetime


class RecognitionTaskStartResponse(BaseModel):
    task_id: str
    status: str = "processing"


class RecognitionTaskStatusResponse(BaseModel):
    task_id: str

    status: str = "processing"  # processing, completed, failed
    stage: str = "queued"
    progress: int = Field(default=0, ge=0, le=100)

    input_image_url: Optional[str] = None
    input_image_path: Optional[str] = None
    result_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    error_message: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class RecognitionTaskUpdate(BaseModel):
    status: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)

    input_image_url: Optional[str] = None
    input_image_path: Optional[str] = None

    result_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    error_message: Optional[str] = None
    finished_at: Optional[datetime] = None
