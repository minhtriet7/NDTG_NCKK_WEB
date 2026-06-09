from datetime import datetime, timezone
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field


class TokenUsage(Document):
    user_id: str

    # recognition_id có thể là RecognitionRequest id hoặc task id
    recognition_id: Optional[str] = None
    transaction_id: Optional[str] = None

    # scan, llm_agent, aggregator, refund, manual_adjustment
    usage_type: str = "scan"

    # agent_1, agent_2, agent_3, aggregator, system
    agent_name: Optional[str] = None

    provider: Optional[str] = None
    model_name: Optional[str] = None

    input_tokens: int = 0
    output_tokens: int = 0
    total_ai_tokens: int = 0

    tax_rate: float = 0.10
    billable_ai_tokens: int = 0

    ai_token_to_system_token_rate: int = 1000
    system_tokens_charged: int = 0

    balance_before: int = 0
    balance_after: int = 0

    billing_mode: str = "fixed"  # fixed, dynamic
    rounding_mode: str = "ceil"

    status: str = "charged"  # charged, refunded, skipped, failed
    reason: Optional[str] = None

    metadata: Dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "token_usages"