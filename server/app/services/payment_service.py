import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core.config import settings
from app.models.user_model import User
from app.models.token_package_model import TokenPackage
from app.models.transaction_model import Transaction
from app.services.email_service import EmailService

try:
    from app.models.config_model import SystemConfig
except Exception:
    SystemConfig = None

try:
    from app.utils.payment_gateway import SepayGateway, VnpayGateway
except Exception:
    SepayGateway = None
    VnpayGateway = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def normalize_gateway(gateway: Optional[str]) -> Optional[str]:
    if not gateway:
        return None

    value = str(gateway).strip().lower()

    if value in {"vietqr", "qr"}:
        return "sepay"

    if value in {"bank_transfer", "bank"}:
        return "bank_transfer"

    if value in {"sandbox", "test"}:
        return "mock"

    return value


def generate_transaction_code(user_id: str) -> str:
    user_suffix = str(user_id)[-4:].upper()
    random_suffix = uuid.uuid4().hex[:6].upper()
    return f"NAP{user_suffix}{random_suffix}"


def build_transfer_content(transaction_code: str) -> str:
    name_web = getattr(settings, "NAME_WEB", "BANKNOTEAI") or "BANKNOTEAI"
    return f"{name_web}NAPTOKEN{transaction_code}".upper()


def serialize_transaction(transaction: Transaction) -> Dict[str, Any]:
    return {
        "id": str(transaction.id),
        "transaction_id": str(transaction.id),

        "user_id": getattr(transaction, "user_id", None),
        "package_id": getattr(transaction, "package_id", None),
        "package_name": getattr(transaction, "package_name", None),

        "amount": getattr(transaction, "amount", 0),
        "currency": getattr(transaction, "currency", "VND"),
        "tokens_added": getattr(transaction, "tokens_added", 0),

        "status": getattr(transaction, "status", "pending"),
        "payment_gateway": getattr(transaction, "payment_gateway", "sepay"),
        "gateway": getattr(transaction, "payment_gateway", "sepay"),

        "transaction_code": getattr(transaction, "transaction_code", None),
        "transfer_content": getattr(transaction, "transfer_content", None),

        "sepay_transaction_id": getattr(transaction, "sepay_transaction_id", None),

        "vnpay_transaction_no": getattr(transaction, "vnpay_transaction_no", None),
        "vnpay_bank_code": getattr(transaction, "vnpay_bank_code", None),
        "vnpay_response_code": getattr(transaction, "vnpay_response_code", None),
        "vnpay_order_info": getattr(transaction, "vnpay_order_info", None),

        "payment_url": getattr(transaction, "payment_url", None),

        "credited": getattr(transaction, "credited", False),

        "created_at": getattr(transaction, "created_at", None),
        "updated_at": getattr(transaction, "updated_at", None),
        "paid_at": getattr(transaction, "paid_at", None),
    }


async def safe_send_payment_created_email(user: User, transaction: Transaction):
    try:
        await EmailService.send_payment_created_email(user, transaction)
    except Exception:
        pass


async def safe_send_payment_success_email(user: User, transaction: Transaction):
    try:
        await EmailService.send_payment_success_email(user, transaction)
    except Exception:
        pass


async def safe_send_payment_failed_email(user: User, transaction: Transaction):
    try:
        await EmailService.send_payment_failed_email(user, transaction)
    except Exception:
        pass


class PaymentService:
    @staticmethod
    async def get_payment_config():
        if SystemConfig is None:
            return None

        try:
            return await SystemConfig.find_one()
        except Exception:
            return None

    @staticmethod
    async def get_public_gateway_settings() -> Dict[str, Any]:
        config = await PaymentService.get_payment_config()

        feature_payment_enabled = getattr(config, "feature_payment_enabled", True)

        sepay_enabled = getattr(config, "sepay_enabled", True)
        vnpay_enabled = False # TEMP DISABLED DUE TO UNAPPROVED MERCHANT
        mock_payment_enabled = getattr(config, "mock_payment_enabled", False)

        enabled_gateways = []

        for gateway in getattr(config, "enabled_payment_gateways", []) or []:
            normalized = normalize_gateway(gateway)

            if normalized and normalized not in enabled_gateways:
                enabled_gateways.append(normalized)

        if sepay_enabled and "sepay" not in enabled_gateways:
            enabled_gateways.append("sepay")
            
        if sepay_enabled and "bank_transfer" not in enabled_gateways:
            enabled_gateways.append("bank_transfer")

        if vnpay_enabled and "vnpay" not in enabled_gateways:
            enabled_gateways.append("vnpay")

        if mock_payment_enabled and "mock" not in enabled_gateways:
            enabled_gateways.append("mock")

        if not enabled_gateways and sepay_enabled:
            enabled_gateways = ["sepay"]

        default_gateway = normalize_gateway(
            getattr(config, "payment_gateway_default", None)
        )

        if not default_gateway or default_gateway not in enabled_gateways:
            default_gateway = enabled_gateways[0] if enabled_gateways else "sepay"

        return {
            "feature_payment_enabled": feature_payment_enabled,
            "payment_gateway_default": default_gateway,
            "enabled_payment_gateways": enabled_gateways,
            "sepay_enabled": "sepay" in enabled_gateways,
            "bank_transfer_enabled": "bank_transfer" in enabled_gateways,
            "vnpay_enabled": "vnpay" in enabled_gateways,
            "mock_payment_enabled": "mock" in enabled_gateways,
        }

    @staticmethod
    async def resolve_gateway(requested_gateway: Optional[str]) -> str:
        gateway_settings = await PaymentService.get_public_gateway_settings()

        if not gateway_settings["feature_payment_enabled"]:
            raise HTTPException(
                status_code=400,
                detail="Payment feature is currently disabled by administrator.",
            )

        enabled_gateways: List[str] = gateway_settings["enabled_payment_gateways"]

        if not enabled_gateways:
            raise HTTPException(
                status_code=400,
                detail="No payment gateway is enabled.",
            )

        gateway = normalize_gateway(requested_gateway)

        if not gateway:
            gateway = gateway_settings["payment_gateway_default"]

        if gateway not in enabled_gateways:
            raise HTTPException(
                status_code=400,
                detail=f"Payment gateway '{gateway}' is disabled or unsupported.",
            )

        return gateway

    @staticmethod
    async def create_transaction(
        user: User,
        package_id: str,
        gateway: Optional[str] = None,
        client_ip: str = "127.0.0.1",
    ) -> Dict[str, Any]:
        package = await TokenPackage.get(to_object_id(package_id))

        if not package:
            raise HTTPException(status_code=404, detail="Token package not found.")

        if not getattr(package, "is_active", True):
            raise HTTPException(
                status_code=400,
                detail="This token package is not active.",
            )

        gateway = await PaymentService.resolve_gateway(gateway)
        config = await PaymentService.get_payment_config()

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
            payment_gateway=gateway,
            transaction_code=transaction_code,
            transfer_content=transfer_content,
            credited=False,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await transaction.insert()

        # Gửi mail tạo giao dịch cho tất cả gateway, bao gồm mock.
        # Mock dùng để demo nên vẫn có email invoice/test invoice.
        await safe_send_payment_created_email(user, transaction)

        if gateway == "mock":
            transaction = await PaymentService.credit_transaction_once(transaction)

            return {
                **serialize_transaction(transaction),
                "is_mock": True,
                "invoice": {
                    **serialize_transaction(transaction),
                    "gateway": "mock",
                },
            }

        if gateway == "vnpay":
            payment_url = ""

            if VnpayGateway is not None:
                payment_url = await VnpayGateway.create_payment_url(
                    transaction_id=str(transaction.id),
                    transaction_code=transaction.transaction_code,
                    amount_vnd=int(transaction.amount),
                    order_info=transaction.transfer_content or transaction.transaction_code,
                    client_ip=client_ip,
                    config=config,
                )

            transaction.payment_url = payment_url
            transaction.updated_at = now_utc()
            await transaction.save()

            return {
                **serialize_transaction(transaction),
                "is_mock": False,
                "payment_url": payment_url,
                "invoice": {
                    **serialize_transaction(transaction),
                    "gateway": "vnpay",
                    "payment_url": payment_url,
                },
            }

        qr_data: Dict[str, Any] = {}

        if SepayGateway is not None:
            try:
                qr_data = await SepayGateway.create_payment_qr(
                    user_id=str(user.id),
                    package_name=getattr(package, "name", ""),
                    amount=int(getattr(package, "price_vnd", 0) or 0),
                    tx_code=transaction_code,
                    transfer_content=transfer_content,
                    bank_account_number=getattr(config, "sepay_account_number", None),
                    bank_id=getattr(config, "sepay_bank_name", None),
                    account_name=getattr(config, "sepay_account_name", None),
                )
            except Exception:
                qr_data = {}

        return {
            **serialize_transaction(transaction),
            "is_mock": False,
            "qr_url": qr_data.get("qr_url") if gateway == "sepay" else None,
            "bank_account": qr_data.get("bank_account") or getattr(settings, "BANK_ACCOUNT_NUMBER", None),
            "bank_name": qr_data.get("bank_name") or getattr(settings, "BANK_ID", None),
            "account_name": qr_data.get("account_name") or getattr(settings, "ACCOUNT_NAME", None),
            "invoice": {
                **serialize_transaction(transaction),
                "gateway": gateway,
                "qr_url": qr_data.get("qr_url") if gateway == "sepay" else None,
                "bank_account": qr_data.get("bank_account") or getattr(settings, "BANK_ACCOUNT_NUMBER", None),
                "bank_name": qr_data.get("bank_name") or getattr(settings, "BANK_ID", None),
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

        # Gửi mail thành công cho cả sepay, vnpay, mock.
        await safe_send_payment_success_email(user, transaction)

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
            {
                "status": {"$in": ["pending", "failed", "cancelled"]},
                "payment_gateway": {"$in": ["sepay", "bank_transfer"]},
            }
        ).to_list()

        target_transaction: Optional[Transaction] = None

        for transaction in pending_transactions:
            transaction_code = str(
                getattr(transaction, "transaction_code", "") or ""
            ).upper()
            expected_transfer_content = str(
                getattr(transaction, "transfer_content", "") or ""
            ).upper()

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
            raise HTTPException(
                status_code=400,
                detail="Transferred amount is not enough.",
            )

        if sepay_transaction_id:
            target_transaction.sepay_transaction_id = str(sepay_transaction_id)

        target_transaction.gateway_payload = webhook_data
        target_transaction = await PaymentService.credit_transaction_once(
            target_transaction
        )

        return {
            "status": "success",
            "matched": True,
            "message": "Payment confirmed and tokens credited.",
            "transaction": serialize_transaction(target_transaction),
        }

    @staticmethod
    async def process_vnpay_return(params: Dict[str, Any]) -> Dict[str, Any]:
        normalized_params = {str(k): str(v) for k, v in params.items()}
        config = await PaymentService.get_payment_config()

        if VnpayGateway is None:
            raise HTTPException(
                status_code=400,
                detail="VNPay gateway is not available.",
            )

        if not VnpayGateway.verify_return_params(normalized_params, config=config):
            raise HTTPException(
                status_code=400,
                detail="Invalid VNPay signature.",
            )

        transaction_code = normalized_params.get("vnp_TxnRef")
        response_code = normalized_params.get("vnp_ResponseCode")
        transaction_no = normalized_params.get("vnp_TransactionNo")
        bank_code = normalized_params.get("vnp_BankCode")
        order_info = normalized_params.get("vnp_OrderInfo")

        if not transaction_code:
            raise HTTPException(
                status_code=400,
                detail="Missing VNPay transaction reference.",
            )

        transaction = await Transaction.find_one(
            Transaction.transaction_code == transaction_code
        )

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        transaction.vnpay_transaction_no = transaction_no
        transaction.vnpay_bank_code = bank_code
        transaction.vnpay_response_code = response_code
        transaction.vnpay_order_info = order_info
        transaction.gateway_payload = normalized_params
        transaction.updated_at = now_utc()

        if response_code == "00":
            transaction = await PaymentService.credit_transaction_once(transaction)
            message = "VNPay payment confirmed and tokens credited."
            status = "success"
        else:
            transaction.status = "failed"
            transaction.updated_at = now_utc()
            await transaction.save()

            try:
                user = await User.get(to_object_id(transaction.user_id))

                if user:
                    await safe_send_payment_failed_email(user, transaction)
            except Exception:
                pass

            message = "VNPay payment failed."
            status = "failed"

        return {
            "status": status,
            "message": message,
            "transaction": serialize_transaction(transaction),
        }

    @staticmethod
    async def get_payment_status(user: User, transaction_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(transaction_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if transaction.user_id != str(user.id) and getattr(user, "role", "user") != "admin":
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this transaction.",
            )

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
            "items": [
                serialize_transaction(transaction)
                for transaction in transactions
            ],
            "total": len(transactions),
        }

    @staticmethod
    async def mark_transaction_paid_by_admin(transaction_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(transaction_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        transaction = await PaymentService.credit_transaction_once(transaction)
        return serialize_transaction(transaction)