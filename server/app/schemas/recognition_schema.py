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


class UserResultResponse(BaseModel):
    id: str
    result_id: str
    status: str
    task_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    image_url: Optional[str] = None
    input_image_url: Optional[str] = None
    uploaded_image_url: Optional[str] = None
    summary: Dict[str, Any] = Field(default_factory=dict)
    data: Dict[str, Any] = Field(default_factory=dict)
    agents: Dict[str, Any] = Field(default_factory=dict)
    agent_votes: List[Dict[str, Any]] = Field(default_factory=list)
    consensus: Dict[str, Any] = Field(default_factory=dict)
    detected_objects: List[Dict[str, Any]] = Field(default_factory=list)
    detected_count: int = 0
    multi_object: bool = False
    conversion_result: Optional[Dict[str, Any]] = None
    processing_time_ms: Optional[int] = None
    credits_charged: int = 0
    billing: Dict[str, Any] = Field(default_factory=dict)
    feedback: Dict[str, Any] = Field(default_factory=dict)
    public_warnings: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
