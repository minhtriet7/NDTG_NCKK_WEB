from datetime import datetime, timezone
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field


class ExperimentRun(Document):
    experiment_id: str
    dataset_id: str
    image_id: str
    run_no: int
    repeat_count: int
    admin_id: str

    ground_truth_country: str
    ground_truth_currency: str
    ground_truth_denomination: str

    predicted_country: Optional[str] = None
    predicted_currency: Optional[str] = None
    predicted_denomination: Optional[str] = None
    normalized_ground_truth_country: Optional[str] = None
    normalized_predicted_country: Optional[str] = None
    normalized_ground_truth_currency: Optional[str] = None
    normalized_predicted_currency: Optional[str] = None
    normalized_ground_truth_denomination: Optional[int] = None
    normalized_predicted_denomination: Optional[int] = None

    country_correct: bool = False
    currency_correct: bool = False
    denomination_correct: bool = False
    correct_count: int = 0
    score_pct: float = 0.0
    exact_match: bool = False
    field_correct_count: int = 0
    field_total: int = 3
    field_score_pct: float = 0.0

    valid_agent_count: int = 0
    agent_total: int = 3
    agent_vote_pct: float = 0.0
    completed_agent_count: int = 0
    valid_vote_count: int = 0
    max_matching_votes: int = 0
    required_votes: int = 2
    consensus_reached: bool = False
    vote_groups: list[Dict[str, Any]] = Field(default_factory=list)
    winner_key: Optional[list[Any]] = None

    ag1_model: Optional[str] = None
    ag2_model: Optional[str] = None
    ag3_provider: Optional[str] = None
    ag4_model: Optional[str] = None

    pipeline_status: str = "queued"
    has_warning: bool = False
    has_error: bool = False
    issue_severity: Optional[str] = None
    issue_stage: Optional[str] = None
    issue_type: Optional[str] = None
    issue_message: Optional[str] = None

    ag0_status: str = "queued"
    ag1_status: str = "queued"
    ag2_status: str = "queued"
    ag3_status: str = "queued"
    ag4_status: str = "queued"

    ag0_error_type: Optional[str] = None
    ag0_error_message: Optional[str] = None
    ag1_error_type: Optional[str] = None
    ag1_error_message: Optional[str] = None
    ag2_error_type: Optional[str] = None
    ag2_error_message: Optional[str] = None
    ag3_error_type: Optional[str] = None
    ag3_error_message: Optional[str] = None
    ag4_error_type: Optional[str] = None
    ag4_error_message: Optional[str] = None
    agent_errors: Dict[str, Any] = Field(default_factory=dict)
    
    resize_debug: Dict[str, Any] = Field(default_factory=dict)
    models_used: Dict[str, Any] = Field(default_factory=dict)

    status: str = "queued"
    error_stage: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    provider: Optional[str] = None
    http_status: Optional[int] = None
    retry_after: Optional[int] = None
    raw_excerpt: Optional[str] = None
    duration_ms: Optional[int] = None
    delay_between_runs: int = 10
    stop_on_rate_limit: bool = True
    stop_on_provider_error: bool = True
    force_rerun: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "experiment_runs"
