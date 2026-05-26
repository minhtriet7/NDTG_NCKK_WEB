from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional


class AgentsConfigSchema(BaseModel):
    enable_agent_1: bool = True
    enable_agent_2: bool = True
    enable_agent_3: bool = True
    enable_aggregator: bool = True

    parallel_execution: bool = True
    retry_failed_agents: bool = True
    save_raw_agent_output: bool = True

    agent_timeout_seconds: int = Field(default=60, ge=1, le=300)
    max_retry_count: int = Field(default=1, ge=0, le=10)
    require_minimum_valid_agents: int = Field(default=2, ge=1, le=3)


class AggregatorConfigSchema(BaseModel):
    strategy: str = "majority_vote"
    voting_method: str = "majority_vote"

    minimum_consensus: int = Field(default=2, ge=1, le=3)
    min_consensus_ratio: float = Field(default=0.66, ge=0.0, le=1.0)

    ignore_invalid_results: bool = True
    allow_partial_result: bool = False
    conflict_policy: str = "Needs review"
    normalize_denomination: bool = True
    require_same_country: bool = True
    default_to_agent1: bool = False

    ml_weight: float = Field(default=1.0, ge=0.0)
    llm_weight: float = Field(default=1.0, ge=0.0)
    lens_weight: float = Field(default=1.0, ge=0.0)


class AiModelConfigSchema(BaseModel):
    ai_enabled: bool = True

    yolo_model_path: str = "ml_models/yolo/best.pt"
    res_model_path: str = "ml_models/res/banknote_resnet50_stable_best.pth"
    res_classes_path: str = "ml_models/res/classes.txt"

    yolo_conf_threshold: float = Field(default=0.25, ge=0.0, le=1.0)
    yolo_img_size: int = Field(default=640, ge=64, le=2048)
    res_img_size: int = Field(default=224, ge=64, le=1024)

    device: str = "auto"


class LlmConfigSchema(BaseModel):
    llm_enabled: bool = True
    llm_provider: str = "gemini"

    api_key: Optional[str] = None
    api_key_configured: bool = False

    main_model: str = "gemini-2.5-flash"
    fallback_models: List[str] = Field(
        default_factory=lambda: ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
    )

    max_attempts_per_model: int = Field(default=2, ge=1, le=10)
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    response_mime_type: str = "application/json"
    quota_fallback_enabled: bool = True
    prompt_template: str = ""


class GoogleLensConfigSchema(BaseModel):
    lens_enabled: bool = True
    lens_provider: str = "serpapi"

    api_key: Optional[str] = None
    proxy_url: Optional[str] = None

    language_code: str = "vi"
    country_code: str = "vn"

    max_results: int = Field(default=5, ge=1, le=50)
    max_visual_matches: int = Field(default=10, ge=1, le=50)
    max_exact_matches: int = Field(default=5, ge=1, le=50)

    no_cache: bool = True
    raw_fallback_enabled: bool = True
    formatter_model: str = "gemini-2.5-flash"


class SystemSettingsSchema(BaseModel):
    app_name: str = "BanknoteAI"
    support_email: EmailStr = "support@banknoteai.com"

    default_language: str = "VI"
    default_theme: str = "system"
    public_registration_enabled: bool = True

    max_upload_size_mb: int = Field(default=5, ge=1, le=50)
    allowed_image_types: List[str] = Field(
        default_factory=lambda: ["jpg", "jpeg", "png", "webp"]
    )

    token_cost_per_scan: int = Field(default=1, ge=0)
    scan_history_retention_days: int = Field(default=30, ge=1)

    maintenance_mode: bool = False
    maintenance_message: str = ""
    allow_admin_login_during_maintenance: bool = True

    session_timeout_minutes: int = Field(default=120, ge=5)
    max_login_attempts: int = Field(default=5, ge=1)
    password_min_length: int = Field(default=6, ge=6)
    require_email_verification: bool = False

    feedback_review_sla_days: int = Field(default=3, ge=1)
    admin_alert_email: Optional[EmailStr] = None


class AdminUserUpdateSchema(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    token_balance: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class AdminUserRoleUpdateSchema(BaseModel):
    role: str = Field(pattern="^(user|admin)$")


class AdminUserStatusUpdateSchema(BaseModel):
    is_active: Optional[bool] = None
    status: Optional[str] = None