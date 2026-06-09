from beanie import Document
from pydantic import Field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


class Transaction(Document):
    user_id: str
    package_id: str
    package_name: Optional[str] = None

    amount: float
    currency: str = "VND"
    tokens_added: int

    # pending, success, completed, failed, cancelled
    status: str = "pending"

    # sepay, vnpay, mock
    payment_gateway: str = "sepay"

    transaction_code: str
    transfer_content: Optional[str] = None

    # SEPAY
    sepay_transaction_id: Optional[str] = None

    # VNPAY
    vnpay_transaction_no: Optional[str] = None
    vnpay_bank_code: Optional[str] = None
    vnpay_response_code: Optional[str] = None
    vnpay_order_info: Optional[str] = None

    # Checkout URL for gateways such as VNPay
    payment_url: Optional[str] = None

    # Raw payment gateway payload / callback
    gateway_payload: Optional[Dict[str, Any]] = None

    credited: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: Optional[datetime] = None

    class Settings:
        name = "transactions"