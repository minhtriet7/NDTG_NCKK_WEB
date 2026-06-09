from beanie import Document
from pydantic import Field
from typing import List, Optional
from datetime import datetime, timezone


class SystemConfig(Document):
    # ============================================================
    # AGENTS
    # ============================================================
    enable_agent_1: bool = True
    enable_agent_2: bool = True
    enable_agent_3: bool = True
    enable_aggregator: bool = True

    parallel_execution: bool = True
    retry_failed_agents: bool = True
    save_raw_agent_output: bool = True
    agent_timeout_seconds: int = 60
    # Số lần retry khi agents không đồng thuận (Conflict). Tổng số lần chạy = max_retry_count + 1.
    max_retry_count: int = 2
    require_minimum_valid_agents: int = 2

    # ============================================================
    # AGENT 3 PROVIDER CONTROL
    # ============================================================
    # serpapi  = Agent 3 v1 hiện tại
    # selenium = Agent 3 v2 mới
    # v2       = alias của selenium
    # disabled = bỏ qua Agent 3
    agent3_provider: str = "serpapi"
    agent3_v1_enabled: bool = True
    agent3_v2_enabled: bool = True
    agent3_fallback_enabled: bool = True
    agent3_fallback_provider: str = "serpapi"

    # ============================================================
    # AGGREGATOR
    # ============================================================
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

    # ============================================================
    # AI MODEL
    # ============================================================
    ai_enabled: bool = True
    yolo_model_path: str = "ml_models/yolo/best.pt"
    res_model_path: str = "ml_models/res/banknote_resnet50_stable_best.pth"
    res_classes_path: str = "ml_models/res/classes.txt"
    yolo_conf_threshold: float = 0.25
    yolo_img_size: int = 640
    res_img_size: int = 224
    device: str = "auto"

    # ============================================================
    # LLM
    # ============================================================
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

    # ============================================================
    # GOOGLE LENS
    # ============================================================
    lens_enabled: bool = True

    # Giữ field cũ để không vỡ frontend/admin hiện tại.
    # Đồng bộ logic: lens_provider cũng dùng để chọn Agent 3 v1/v2.
    # serpapi / selenium / v2 / disabled
    lens_provider: str = "serpapi"

    lens_fallback_enabled: bool = True
    lens_fallback_provider: str = "serpapi"

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

    # ============================================================
    # GENERAL APP SETTINGS
    # ============================================================
    app_name: str = "BanknoteAI"
    support_email: str = "support@banknoteai.com"
    default_language: str = "EN"
    default_theme: str = "system"

    public_registration_enabled: bool = True
    feature_email_password_login_enabled: bool = True
    feature_google_login_enabled: bool = True
    feature_scan_enabled: bool = True
    feature_currency_converter_enabled: bool = True
    feature_payment_enabled: bool = True
    feature_feedback_enabled: bool = True
    feature_history_enabled: bool = True

    # ============================================================
    # UPLOAD / RECOGNITION LIMITS
    # ============================================================
    max_upload_size_mb: int = 5
    allowed_image_types: List[str] = Field(
        default_factory=lambda: ["jpg", "jpeg", "png", "webp"]
    )
    scan_history_retention_days: int = 30

    token_cost_per_scan: int = 1

    # ============================================================
    # PAYMENT GATEWAY SETTINGS
    # ============================================================
    payment_gateway_default: str = "sepay"
    enabled_payment_gateways: List[str] = Field(default_factory=lambda: ["sepay"])

    sepay_enabled: bool = True
    vnpay_enabled: bool = False
    mock_payment_enabled: bool = False

    sepay_bank_name: Optional[str] = None
    sepay_account_number: Optional[str] = None
    sepay_account_name: Optional[str] = None

    vnpay_tmn_code_configured: bool = False
    vnpay_hash_secret_configured: bool = False
    vnpay_return_url: Optional[str] = None
    vnpay_ipn_url: Optional[str] = None

    # ============================================================
    # TOKEN BILLING SETTINGS
    # ============================================================
    token_billing_enabled: bool = True

    # fixed: always charge token_cost_per_scan
    # dynamic: charge by AI input/output tokens
    token_billing_mode: str = "fixed"

    dynamic_ai_token_billing_enabled: bool = False
    token_count_model: str = "gpt-3.5-turbo"

    ai_token_to_system_token_rate: int = 1000
    token_billing_tax_rate: float = 0.10
    token_billing_rounding_mode: str = "ceil"

    min_tokens_per_scan: int = 1
    max_tokens_per_scan: int = 10

    refund_on_system_error: bool = True
    refund_on_agent_failure: bool = False
    charge_when_needs_review: bool = True

    save_token_usage_logs: bool = True
    show_token_usage_to_user: bool = True
    show_ai_token_usage_to_admin: bool = True

    # ============================================================
    # EMAIL NOTIFICATIONS
    # ============================================================
    email_notifications_enabled: bool = False

    email_on_register: bool = True
    email_on_google_first_login: bool = True
    email_on_password_reset: bool = True
    email_on_payment_created: bool = True
    email_on_payment_success: bool = True
    email_on_payment_failed: bool = True
    email_on_recognition_completed: bool = False
    email_on_recognition_failed: bool = True
    email_on_feedback_created: bool = True
    email_on_feedback_replied: bool = True
    email_admin_on_system_error: bool = True

    smtp_configured: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: str = "BanknoteAI"

    # ============================================================
    # MAINTENANCE
    # ============================================================
    maintenance_mode: bool = False
    maintenance_message: str = ""
    allow_admin_login_during_maintenance: bool = True

    # ============================================================
    # SECURITY
    # ============================================================
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