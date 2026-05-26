from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone


class Transaction(Document):
    user_id: str
    package_id: str
    package_name: Optional[str] = None

    amount: float
    currency: str = "VND"
    tokens_added: int

    status: str = "pending"  # pending, success, completed, failed, cancelled
    payment_gateway: str = "sepay"  # sepay, vietqr, bank_transfer, mock

    transaction_code: str
    transfer_content: Optional[str] = None
    sepay_transaction_id: Optional[str] = None

    credited: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: Optional[datetime] = None

    class Settings:
        name = "transactions"