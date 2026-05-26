import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core.config import settings
from app.models.user_model import User
from app.models.token_package_model import TokenPackage
from app.models.transaction_model import Transaction

try:
    from app.utils.payment_gateway import SepayGateway
except Exception:
    SepayGateway = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def serialize_transaction(transaction: Transaction) -> Dict[str, Any]:
    return {
        "id": str(transaction.id),
        "user_id": getattr(transaction, "user_id", None),
        "package_id": getattr(transaction, "package_id", None),
        "package_name": getattr(transaction, "package_name", None),
        "amount": getattr(transaction, "amount", 0),
        "currency": getattr(transaction, "currency", "VND"),
        "tokens_added": getattr(transaction, "tokens_added", 0),
        "status": getattr(transaction, "status", "pending"),
        "payment_gateway": getattr(transaction, "payment_gateway", "sepay"),
        "transaction_code": getattr(transaction, "transaction_code", None),
        "transfer_content": getattr(transaction, "transfer_content", None),
        "sepay_transaction_id": getattr(transaction, "sepay_transaction_id", None),
        "credited": getattr(transaction, "credited", False),
        "created_at": getattr(transaction, "created_at", None),
        "updated_at": getattr(transaction, "updated_at", None),
        "paid_at": getattr(transaction, "paid_at", None),
    }


def generate_transaction_code(user_id: str) -> str:
    user_suffix = str(user_id)[-4:].upper()
    random_suffix = uuid.uuid4().hex[:6].upper()
    return f"NAP{user_suffix}{random_suffix}"


def build_transfer_content(transaction_code: str) -> str:
    name_web = getattr(settings, "NAME_WEB", "BANKNOTEAI") or "BANKNOTEAI"
    return f"{name_web}NAPTOKEN{transaction_code}".upper()


class PaymentService:
    @staticmethod
    async def create_transaction(user: User, package_id: str, gateway: str = "sepay") -> Dict[str, Any]:
        package = await TokenPackage.get(to_object_id(package_id))

        if not package:
            raise HTTPException(status_code=404, detail="Token package not found.")

        if not getattr(package, "is_active", True):
            raise HTTPException(status_code=400, detail="This token package is not active.")

        gateway = (gateway or "sepay").lower()

        if gateway == "bank_transfer":
            gateway = "sepay"

        if gateway not in {"mock", "sepay", "vietqr"}:
            raise HTTPException(status_code=400, detail="Unsupported payment gateway.")

        transaction_code = generate_transaction_code(str(user.id))
        transfer_content = build_transfer_content(transaction_code)

        transaction = Transaction(
            user_id=str(user.id),
            package_id=str(package.id),
            package_name=getattr(package, "name", None),
            amount=float(getattr(package, "price_vnd", 0) or 0),
            currency="VND",
            tokens_added=int(getattr(package, "tokens_included", 0) or 0),
            status="pending",
            payment_gateway="mock" if gateway == "mock" else "sepay",
            transaction_code=transaction_code,
            transfer_content=transfer_content,
            credited=False,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await transaction.insert()

        if gateway == "mock":
            transaction = await PaymentService.credit_transaction_once(transaction)

            return {
                **serialize_transaction(transaction),
                "is_mock": True,
                "invoice": {
                    "transaction_id": str(transaction.id),
                    "amount": transaction.amount,
                    "currency": transaction.currency,
                    "gateway": transaction.payment_gateway,
                    "status": transaction.status,
                    "transaction_code": transaction.transaction_code,
                    "transfer_content": transaction.transfer_content,
                },
            }

        qr_data: Dict[str, Any] = {}

        if SepayGateway:
            try:
                qr_data = await SepayGateway.create_payment_qr(
    user_id=str(user.id),
    package_name=getattr(package, "name", ""),
    amount=int(getattr(package, "price_vnd", 0) or 0),
    tx_code=transaction_code,
    transfer_content=transfer_content,
)
            except Exception:
                qr_data = {}

        return {
            **serialize_transaction(transaction),
            "is_mock": False,
            "qr_url": qr_data.get("qr_url"),
            "bank_account": qr_data.get("bank_account") or getattr(settings, "SEPAY_ACCOUNT_NUMBER", None),
            "bank_name": qr_data.get("bank_name") or getattr(settings, "SEPAY_BANK_BRAND", None),
            "account_name": qr_data.get("account_name") or getattr(settings, "ACCOUNT_NAME", None),
            "invoice": {
                "transaction_id": str(transaction.id),
                "amount": transaction.amount,
                "currency": transaction.currency,
                "gateway": transaction.payment_gateway,
                "status": transaction.status,
                "transaction_code": transaction.transaction_code,
                "transfer_content": transaction.transfer_content,
                "qr_url": qr_data.get("qr_url"),
                "bank_account": qr_data.get("bank_account") or getattr(settings, "SEPAY_ACCOUNT_NUMBER", None),
                "bank_name": qr_data.get("bank_name") or getattr(settings, "SEPAY_BANK_BRAND", None),
                "account_name": qr_data.get("account_name") or getattr(settings, "ACCOUNT_NAME", None),
            },
        }

    @staticmethod
    async def credit_transaction_once(transaction_or_id: Union[Transaction, str]) -> Transaction:
        if isinstance(transaction_or_id, Transaction):
            transaction = transaction_or_id
        else:
            transaction = await Transaction.get(to_object_id(transaction_or_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if getattr(transaction, "credited", False):
            return transaction

        user = await User.get(to_object_id(transaction.user_id))

        if not user:
            raise HTTPException(status_code=404, detail="Transaction user not found.")

        user.token_balance = int(getattr(user, "token_balance", 0) or 0) + int(
            getattr(transaction, "tokens_added", 0) or 0
        )

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

        transaction.credited = True
        transaction.status = "success"
        transaction.paid_at = now_utc()
        transaction.updated_at = now_utc()
        await transaction.save()

        return transaction

    @staticmethod
    async def process_webhook(webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        transfer_content = str(
            webhook_data.get("content")
            or webhook_data.get("transactionContent")
            or webhook_data.get("description")
            or ""
        ).strip().upper()

        if not transfer_content:
            raise HTTPException(status_code=400, detail="Missing transfer content.")

        amount = float(
            webhook_data.get("amount")
            or webhook_data.get("transferAmount")
            or webhook_data.get("transfer_amount")
            or 0
        )

        sepay_transaction_id = (
            webhook_data.get("id")
            or webhook_data.get("transaction_id")
            or webhook_data.get("sepay_transaction_id")
        )

        pending_transactions = await Transaction.find(
            {"status": {"$in": ["pending", "failed", "cancelled"]}}
        ).to_list()

        target_transaction: Optional[Transaction] = None

        for transaction in pending_transactions:
            transaction_code = str(getattr(transaction, "transaction_code", "") or "").upper()
            expected_transfer_content = str(getattr(transaction, "transfer_content", "") or "").upper()

            if transaction_code and transaction_code in transfer_content:
                target_transaction = transaction
                break

            if expected_transfer_content and expected_transfer_content in transfer_content:
                target_transaction = transaction
                break

        if not target_transaction:
            return {
                "status": "ignored",
                "matched": False,
                "message": "No matching pending transaction found.",
            }

        if amount and amount < float(getattr(target_transaction, "amount", 0) or 0):
            raise HTTPException(status_code=400, detail="Transferred amount is not enough.")

        if sepay_transaction_id:
            target_transaction.sepay_transaction_id = str(sepay_transaction_id)

        target_transaction = await PaymentService.credit_transaction_once(target_transaction)

        return {
            "status": "success",
            "matched": True,
            "message": "Payment confirmed and tokens credited.",
            "transaction": serialize_transaction(target_transaction),
        }

    @staticmethod
    async def get_payment_status(user: User, transaction_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(transaction_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if transaction.user_id != str(user.id) and getattr(user, "role", "user") != "admin":
            raise HTTPException(status_code=403, detail="You do not have access to this transaction.")

        return serialize_transaction(transaction)

    @staticmethod
    async def get_user_transactions(user: User, limit: int = 20) -> Dict[str, Any]:
        transactions = (
            await Transaction.find(Transaction.user_id == str(user.id))
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

        return {
            "items": [serialize_transaction(transaction) for transaction in transactions],
            "total": len(transactions),
        }

    @staticmethod
    async def mark_transaction_paid_by_admin(transaction_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(transaction_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        transaction = await PaymentService.credit_transaction_once(transaction)
        return serialize_transaction(transaction)