from beanie import Document
from pydantic import Field
from typing import List, Optional
from datetime import datetime, timezone


class SystemConfig(Document):
    enable_agent_1: bool = True
    enable_agent_2: bool = True
    enable_agent_3: bool = True
    enable_aggregator: bool = True

    parallel_execution: bool = True
    retry_failed_agents: bool = True
    save_raw_agent_output: bool = True
    agent_timeout_seconds: int = 60
    max_retry_count: int = 1
    require_minimum_valid_agents: int = 2

    strategy: str = "majority_vote"
    voting_method: str = "majority_vote"
    minimum_consensus: int = 2
    min_consensus_ratio: float = 0.66

    ignore_invalid_results: bool = True
    allow_partial_result: bool = False
    conflict_policy: str = "Needs review"
    normalize_denomination: bool = True
    require_same_country: bool = True
    default_to_agent1: bool = False

    ml_weight: float = 1.0
    llm_weight: float = 1.0
    lens_weight: float = 1.0

    ai_enabled: bool = True
    yolo_model_path: str = "ml_models/yolo/best.pt"
    res_model_path: str = "ml_models/res/banknote_resnet50_stable_best.pth"
    res_classes_path: str = "ml_models/res/classes.txt"
    yolo_conf_threshold: float = 0.25
    yolo_img_size: int = 640
    res_img_size: int = 224
    device: str = "auto"

    llm_enabled: bool = True
    llm_provider: str = "gemini"
    api_key_configured: bool = False
    main_model: str = "gemini-2.5-flash"
    fallback_models: List[str] = Field(
        default_factory=lambda: ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
    )
    max_attempts_per_model: int = 2
    temperature: float = 0.1
    response_mime_type: str = "application/json"
    quota_fallback_enabled: bool = True
    prompt_template: str = ""

    lens_enabled: bool = True
    lens_provider: str = "serpapi"
    api_key: Optional[str] = None
    proxy_url: Optional[str] = None
    language_code: str = "vi"
    country_code: str = "vn"
    max_results: int = 5
    max_visual_matches: int = 10
    max_exact_matches: int = 5
    no_cache: bool = True
    raw_fallback_enabled: bool = True
    formatter_model: str = "gemini-2.5-flash"

    app_name: str = "BanknoteAI"
    support_email: str = "support@banknoteai.com"
    default_language: str = "VI"
    default_theme: str = "system"
    public_registration_enabled: bool = True

    max_upload_size_mb: int = 5
    allowed_image_types: List[str] = Field(
        default_factory=lambda: ["jpg", "jpeg", "png", "webp"]
    )
    token_cost_per_scan: int = 1
    scan_history_retention_days: int = 30

    maintenance_mode: bool = False
    maintenance_message: str = ""
    allow_admin_login_during_maintenance: bool = True

    session_timeout_minutes: int = 120
    max_login_attempts: int = 5
    password_min_length: int = 6
    require_email_verification: bool = False

    feedback_review_sla_days: int = 3
    admin_alert_email: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "system_configs"