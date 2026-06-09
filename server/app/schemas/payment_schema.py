from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class CreateTransactionRequest(BaseModel):
    package_id: str
    gateway: Optional[str] = None


class PaymentGatewaySettingsResponse(BaseModel):
    feature_payment_enabled: bool = True
    payment_gateway_default: str = "sepay"
    enabled_payment_gateways: List[str] = ["sepay"]

    sepay_enabled: bool = True
    vnpay_enabled: bool = False
    mock_payment_enabled: bool = False


class CheckoutInvoiceResponse(BaseModel):
    transaction_id: str
    amount: float
    currency: str = "VND"
    gateway: str
    status: str

    transaction_code: str
    transfer_content: Optional[str] = None

    bank_account_number: Optional[str] = None
    bank_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    qr_url: Optional[str] = None

    payment_url: Optional[str] = None


class TransactionResponse(BaseModel):
    id: str
    user_id: Optional[str] = None

    package_id: str
    package_name: Optional[str] = None

    amount: float
    currency: str = "VND"
    tokens_added: int

    status: str
    payment_gateway: str

    transaction_code: str
    transfer_content: Optional[str] = None

    sepay_transaction_id: Optional[str] = None

    vnpay_transaction_no: Optional[str] = None
    vnpay_bank_code: Optional[str] = None
    vnpay_response_code: Optional[str] = None
    vnpay_order_info: Optional[str] = None

    credited: bool = False
    is_mock: Optional[bool] = False

    qr_url: Optional[str] = None
    payment_url: Optional[str] = None

    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    account_name: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaymentStatusResponse(BaseModel):
    transaction_id: str
    status: str
    credited: bool = False
    transaction: Optional[TransactionResponse] = None
    message: Optional[str] = None


class AdminUpdateTransactionStatusRequest(BaseModel):
    status: str = Field(pattern="^(pending|success|completed|failed|cancelled)$")