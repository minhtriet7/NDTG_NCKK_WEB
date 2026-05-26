from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CreateTransactionRequest(BaseModel):
    package_id: str
    gateway: Optional[str] = "sepay"


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

    credited: bool = False
    is_mock: Optional[bool] = False

    qr_url: Optional[str] = None
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