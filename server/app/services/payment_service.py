import asyncio
import uuid
from datetime import datetime, timedelta, timezone
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


ALLOWED_PAYMENT_METHODS = {"vnpay", "bank_transfer", "vietqr"}
VNPAY_PENDING_REUSE_MINUTES = 15
_vnpay_creation_locks: Dict[str, asyncio.Lock] = {}


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
        return "bank_transfer"

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


def get_document_collection(document_class):
    getter = getattr(document_class, "get_pymongo_collection", None)
    if getter is None:
        getter = getattr(document_class, "get_motor_collection", None)
    if getter is None:
        raise RuntimeError(f"No async collection accessor for {document_class.__name__}.")
    return getter()


def get_vnpay_creation_lock(user_id: str, package_id: str) -> asyncio.Lock:
    key = f"{user_id}:{package_id}"
    return _vnpay_creation_locks.setdefault(key, asyncio.Lock())


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
        "payment_gateway": getattr(transaction, "payment_gateway", "bank_transfer"),
        "gateway": getattr(transaction, "payment_gateway", "bank_transfer"),

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

        # SePay and mock payments are deliberately disabled for user-facing flows.
        # VietQR is a QR presentation for the manual bank_transfer method.
        # VNPay stays unavailable until the merchant website/return URL is
        # approved. Ignore stale DB/environment flags in the public flow.
        vnpay_enabled = False
        enabled_gateways = ["bank_transfer"] if feature_payment_enabled else []

        if feature_payment_enabled and vnpay_enabled:
            enabled_gateways.append("vnpay")

        default_gateway = normalize_gateway(
            getattr(config, "payment_gateway_default", None)
        )

        if not default_gateway or default_gateway not in enabled_gateways:
            default_gateway = enabled_gateways[0] if enabled_gateways else "bank_transfer"

        return {
            "feature_payment_enabled": feature_payment_enabled,
            "payment_gateway_default": default_gateway,
            "enabled_payment_gateways": enabled_gateways,
            "sepay_enabled": False,
            "vietqr_enabled": "bank_transfer" in enabled_gateways,
            "bank_transfer_enabled": "bank_transfer" in enabled_gateways,
            "vnpay_enabled": "vnpay" in enabled_gateways,
            "mock_payment_enabled": False,
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

        raw_gateway = str(requested_gateway or "").strip().lower()
        if not raw_gateway:
            raise HTTPException(status_code=400, detail="Payment method is required.")

        if raw_gateway == "sepay":
            raise HTTPException(status_code=400, detail="SePay is disabled.")

        if raw_gateway == "vnpay" and not gateway_settings.get("vnpay_enabled"):
            raise HTTPException(
                status_code=503,
                detail="VNPay is not configured or not approved for this return URL.",
            )

        if raw_gateway not in ALLOWED_PAYMENT_METHODS:
            raise HTTPException(
                status_code=400,
                detail=f"Payment gateway '{raw_gateway}' is disabled or unsupported.",
            )

        gateway = normalize_gateway(raw_gateway)

        if gateway not in enabled_gateways:
            raise HTTPException(
                status_code=400,
                detail=f"Payment gateway '{gateway}' is disabled or unsupported.",
            )

        return gateway

    @staticmethod
    async def create_or_reuse_vnpay_transaction(
        user: User,
        package: TokenPackage,
        config,
        client_ip: str,
    ) -> Dict[str, Any]:
        if VnpayGateway is None:
            raise HTTPException(
                status_code=503,
                detail="VNPay is not configured or not approved for this return URL.",
            )

        # Validate every required setting before inserting a transaction so a
        # configuration failure cannot leave another unusable pending record.
        VnpayGateway.validate_configuration(config)

        user_id = str(user.id)
        package_id = str(package.id)
        amount = float(getattr(package, "price_vnd", 0) or 0)
        lock = get_vnpay_creation_lock(user_id, package_id)

        async with lock:
            cutoff = now_utc() - timedelta(minutes=VNPAY_PENDING_REUSE_MINUTES)
            transaction_collection = get_document_collection(Transaction)
            recent_pending = (
                await Transaction.find(
                    {
                        "user_id": user_id,
                        "package_id": package_id,
                        "amount": amount,
                        "payment_gateway": "vnpay",
                        "status": "pending",
                        "credited": {"$ne": True},
                        "created_at": {"$gte": cutoff},
                    }
                )
                .sort("-created_at")
                .to_list()
            )
            existing = recent_pending[0] if recent_pending else None

            if len(recent_pending) > 1:
                duplicate_ids = [item.id for item in recent_pending[1:]]
                await transaction_collection.update_many(
                    {
                        "_id": {"$in": duplicate_ids},
                        "status": "pending",
                        "credited": {"$ne": True},
                    },
                    {"$set": {"status": "cancelled", "updated_at": now_utc()}},
                )

            if existing:
                payment_url = getattr(existing, "payment_url", None)
                if not payment_url:
                    payment_url = await VnpayGateway.create_payment_url(
                        transaction_id=str(existing.id),
                        transaction_code=existing.transaction_code,
                        amount_vnd=int(existing.amount),
                        order_info=existing.transfer_content or existing.transaction_code,
                        client_ip=client_ip,
                        config=config,
                    )
                    existing.payment_url = payment_url
                    existing.updated_at = now_utc()
                    await existing.save()

                return {
                    **serialize_transaction(existing),
                    "is_mock": False,
                    "reused_pending": True,
                    "payment_url": payment_url,
                    "invoice": {
                        **serialize_transaction(existing),
                        "gateway": "vnpay",
                        "payment_url": payment_url,
                    },
                }

            await transaction_collection.update_many(
                {
                    "user_id": user_id,
                    "package_id": package_id,
                    "amount": amount,
                    "payment_gateway": "vnpay",
                    "status": "pending",
                    "credited": {"$ne": True},
                    "created_at": {"$lt": cutoff},
                },
                {"$set": {"status": "cancelled", "updated_at": now_utc()}},
            )

            transaction_code = generate_transaction_code(user_id)
            transfer_content = build_transfer_content(transaction_code)
            transaction = Transaction(
                user_id=user_id,
                package_id=package_id,
                package_name=getattr(package, "name", None),
                amount=amount,
                currency="VND",
                tokens_added=int(getattr(package, "tokens_included", 0) or 0),
                status="pending",
                payment_gateway="vnpay",
                transaction_code=transaction_code,
                transfer_content=transfer_content,
                credited=False,
                created_at=now_utc(),
                updated_at=now_utc(),
            )
            await transaction.insert()

            try:
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
            except Exception:
                transaction.status = "failed"
                transaction.updated_at = now_utc()
                await transaction.save()
                raise

            await safe_send_payment_created_email(user, transaction)
            return {
                **serialize_transaction(transaction),
                "is_mock": False,
                "reused_pending": False,
                "payment_url": payment_url,
                "invoice": {
                    **serialize_transaction(transaction),
                    "gateway": "vnpay",
                    "payment_url": payment_url,
                },
            }

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

        if gateway == "vnpay":
            return await PaymentService.create_or_reuse_vnpay_transaction(
                user=user,
                package=package,
                config=config,
                client_ip=client_ip,
            )

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

        # Manual VietQR/bank transfer invoice.
        await safe_send_payment_created_email(user, transaction)

        qr_data: Dict[str, Any] = {}

        if SepayGateway is not None:
            try:
                qr_data = await SepayGateway.create_payment_qr(
                    user_id=str(user.id),
                    package_name=getattr(package, "name", ""),
                    amount=int(getattr(package, "price_vnd", 0) or 0),
                    tx_code=transaction_code,
                    transfer_content=transfer_content,
                    bank_account_number=(
                        getattr(settings, "BANK_ACCOUNT_NUMBER", None)
                        or getattr(config, "sepay_account_number", None)
                    ),
                    bank_id=(
                        getattr(settings, "BANK_ID", None)
                        or getattr(config, "sepay_bank_name", None)
                    ),
                    account_name=(
                        getattr(settings, "ACCOUNT_NAME", None)
                        or getattr(config, "sepay_account_name", None)
                    ),
                )
            except Exception:
                qr_data = {}

        return {
            **serialize_transaction(transaction),
            "is_mock": False,
            "qr_url": qr_data.get("qr_url"),
            "bank_account": qr_data.get("bank_account") or getattr(settings, "BANK_ACCOUNT_NUMBER", None),
            "bank_name": qr_data.get("bank_name") or getattr(settings, "BANK_ID", None),
            "account_name": qr_data.get("account_name") or getattr(settings, "ACCOUNT_NAME", None),
            "invoice": {
                **serialize_transaction(transaction),
                "gateway": gateway,
                "qr_url": qr_data.get("qr_url"),
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

        if str(getattr(transaction, "status", "pending") or "pending").lower() != "pending":
            raise HTTPException(
                status_code=409,
                detail="Transaction is not pending or is already being processed.",
            )

        user = await User.get(to_object_id(transaction.user_id))

        if not user:
            raise HTTPException(status_code=404, detail="Transaction user not found.")

        tokens_to_add = int(getattr(transaction, "tokens_added", 0) or 0)
        if tokens_to_add <= 0 or float(getattr(transaction, "amount", 0) or 0) <= 0:
            raise HTTPException(status_code=400, detail="Invalid transaction value.")

        claimed_at = now_utc()
        transaction_collection = get_document_collection(Transaction)
        claim_result = await transaction_collection.update_one(
            {
                "_id": transaction.id,
                "credited": {"$ne": True},
                "status": "pending",
            },
            {
                "$set": {
                    "status": "processing",
                    "updated_at": claimed_at,
                }
            },
        )

        if int(getattr(claim_result, "matched_count", 0) or 0) != 1:
            refreshed = await Transaction.get(transaction.id)
            if refreshed and getattr(refreshed, "credited", False):
                return refreshed
            raise HTTPException(
                status_code=409,
                detail="Transaction is already being processed.",
            )

        user_collection = get_document_collection(User)
        user_incremented = False
        try:
            user_result = await user_collection.update_one(
                {"_id": user.id},
                {
                    "$inc": {"token_balance": tokens_to_add},
                    "$set": {"updated_at": now_utc()},
                },
            )
            if int(getattr(user_result, "matched_count", 0) or 0) != 1:
                raise HTTPException(status_code=404, detail="Transaction user not found.")
            user_incremented = True

            paid_at = now_utc()
            finalize_result = await transaction_collection.update_one(
                {
                    "_id": transaction.id,
                    "credited": {"$ne": True},
                    "status": "processing",
                },
                {
                    "$set": {
                        "credited": True,
                        "status": "success",
                        "paid_at": paid_at,
                        "updated_at": paid_at,
                    }
                },
            )
            if int(getattr(finalize_result, "matched_count", 0) or 0) != 1:
                raise RuntimeError("Could not finalize the claimed payment transaction.")
        except Exception:
            # Reset is safe only before the balance increment. After incrementing,
            # leave the transaction in processing state to prevent double credit.
            if not user_incremented:
                await transaction_collection.update_one(
                    {
                        "_id": transaction.id,
                        "credited": {"$ne": True},
                        "status": "processing",
                    },
                    {"$set": {"status": "pending", "updated_at": now_utc()}},
                )
            raise

        refreshed_transaction = await Transaction.get(transaction.id)
        refreshed_user = await User.get(user.id)
        if not refreshed_transaction or not refreshed_user:
            raise RuntimeError("Payment was credited but could not be reloaded.")

        await safe_send_payment_success_email(refreshed_user, refreshed_transaction)
        return refreshed_transaction

    @staticmethod
    async def process_webhook(webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        raise HTTPException(status_code=410, detail="SePay is disabled.")

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

        if str(getattr(transaction, "payment_gateway", "") or "").lower() != "vnpay":
            raise HTTPException(status_code=400, detail="Transaction is not a VNPay payment.")

        raw_amount = normalized_params.get("vnp_Amount")
        try:
            received_amount = int(str(raw_amount))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid VNPay amount.")

        expected_amount = int(round(float(getattr(transaction, "amount", 0) or 0) * 100))
        if received_amount != expected_amount:
            raise HTTPException(status_code=400, detail="VNPay amount does not match transaction.")

        if normalized_params.get("vnp_CurrCode", "VND").upper() != "VND":
            raise HTTPException(status_code=400, detail="Invalid VNPay currency.")

        if transaction_no:
            duplicate_provider_transaction = await Transaction.find_one(
                {
                    "_id": {"$ne": transaction.id},
                    "vnpay_transaction_no": str(transaction_no),
                    "credited": True,
                }
            )
            if duplicate_provider_transaction:
                raise HTTPException(
                    status_code=409,
                    detail="VNPay transaction reference was already used.",
                )

        if getattr(transaction, "credited", False):
            return {
                "status": "success",
                "message": "VNPay payment was already credited.",
                "transaction": serialize_transaction(transaction),
            }

        safe_gateway_payload = {
            key: value
            for key, value in normalized_params.items()
            if key not in {"vnp_SecureHash", "vnp_SecureHashType"}
        }
        transaction_collection = get_document_collection(Transaction)
        await transaction_collection.update_one(
            {"_id": transaction.id},
            {
                "$set": {
                    "vnpay_transaction_no": transaction_no,
                    "vnpay_bank_code": bank_code,
                    "vnpay_response_code": response_code,
                    "vnpay_order_info": order_info,
                    "gateway_payload": safe_gateway_payload,
                    "updated_at": now_utc(),
                }
            },
        )
        transaction = await Transaction.get(transaction.id)
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if response_code == "00":
            transaction = await PaymentService.credit_transaction_once(transaction)
            message = "VNPay payment confirmed and tokens credited."
            status = "success"
        else:
            await transaction_collection.update_one(
                {
                    "_id": transaction.id,
                    "credited": {"$ne": True},
                    "status": "pending",
                },
                {"$set": {"status": "failed", "updated_at": now_utc()}},
            )
            transaction = await Transaction.get(transaction.id)
            if transaction and getattr(transaction, "credited", False):
                return {
                    "status": "success",
                    "message": "VNPay payment was already credited.",
                    "transaction": serialize_transaction(transaction),
                }

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
