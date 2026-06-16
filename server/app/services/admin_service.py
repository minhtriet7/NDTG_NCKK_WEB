from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, UploadFile

from app.models.user_model import User
from app.models.recognition_model import RecognitionRequest
from app.models.banknote_model import Banknote
from app.models.transaction_model import Transaction
from app.models.token_package_model import TokenPackage
from app.models.feedback_model import Feedback
from app.models.system_log_model import SystemLog
from app.models.config_model import SystemConfig
from app.models.currency_model import CurrencyRate, CurrencyRateSyncLog

from app.services.currency_service import CurrencyService
from app.services.payment_service import PaymentService
from app.utils.cloudinary_handler import upload_image_to_cloudinary
from app.utils.file_handler import validate_and_read_image


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize_user(user: User) -> Dict[str, Any]:
    return {
        "id": str(user.id),
        "email": getattr(user, "email", None),
        "full_name": getattr(user, "full_name", "") or "",
        "role": getattr(user, "role", "user"),
        "provider": getattr(user, "provider", "local"),
        "phone": getattr(user, "phone", None),
        "country": getattr(user, "country", None),
        "token_balance": getattr(user, "token_balance", 0),
        "is_active": getattr(user, "is_active", True),
        "avatar_url": getattr(user, "avatar_url", None),
        "created_at": getattr(user, "created_at", None),
        "updated_at": getattr(user, "updated_at", None),
        "last_login_at": getattr(user, "last_login_at", None),
        "has_password": bool(getattr(user, "hashed_password", "")),
    }


def serialize_token_package(package: TokenPackage) -> Dict[str, Any]:
    return {
        "id": str(package.id),
        "package_key": getattr(package, "package_key", None),
        "name": getattr(package, "name", ""),
        "description": getattr(package, "description", ""),
        "features": getattr(package, "features", []) or [],
        "badge": getattr(package, "badge", ""),
        "price_usd": getattr(package, "price_usd", 0),
        "price_vnd": getattr(package, "price_vnd", 0),
        "tokens_included": getattr(package, "tokens_included", 0),
        "tokens": getattr(package, "tokens_included", 0),
        "sort_order": getattr(package, "sort_order", 0),
        "is_active": getattr(package, "is_active", True),
        "created_at": getattr(package, "created_at", None),
        "updated_at": getattr(package, "updated_at", None),
    }


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


def serialize_feedback(feedback: Feedback) -> Dict[str, Any]:
    return {
        "id": str(feedback.id),
        "user_id": getattr(feedback, "user_id", None),
        "feedback_type": getattr(feedback, "feedback_type", "other"),
        "priority": getattr(feedback, "priority", "medium"),
        "rating": getattr(feedback, "rating", None),
        "subject": getattr(feedback, "subject", None),
        "message": getattr(feedback, "message", ""),
        "attached_image_url": getattr(feedback, "attached_image_url", None),
        "related_result_id": getattr(feedback, "related_result_id", None),
        "related_transaction_id": getattr(feedback, "related_transaction_id", None),
        "is_resolved": getattr(feedback, "is_resolved", False),
        "status": getattr(feedback, "status", "new"),
        "admin_reply": getattr(feedback, "admin_reply", None),
        "created_at": getattr(feedback, "created_at", None),
        "updated_at": getattr(feedback, "updated_at", None),
        "resolved_at": getattr(feedback, "resolved_at", None),
    }


def serialize_banknote(banknote: Banknote) -> Dict[str, Any]:
    return {
        "id": str(banknote.id),
        "country": getattr(banknote, "country", ""),
        "denomination": getattr(banknote, "denomination", ""),
        "currency_code": getattr(banknote, "currency_code", ""),
        "origin": getattr(banknote, "origin", ""),
        "description": getattr(banknote, "description", ""),
        "features": getattr(banknote, "features", []) or [],
        "material": getattr(banknote, "material", "Unknown"),
        "series_year": getattr(banknote, "series_year", "Unknown"),
        "front_image_url": getattr(banknote, "front_image_url", None),
        "back_image_url": getattr(banknote, "back_image_url", None),
        "is_active": getattr(banknote, "is_active", True),
        "created_at": getattr(banknote, "created_at", None),
        "updated_at": getattr(banknote, "updated_at", None),
    }


def serialize_result(result: RecognitionRequest) -> Dict[str, Any]:
    return {
        "id": str(result.id),
        "user_id": getattr(result, "user_id", None),
        "uploaded_image_url": getattr(result, "uploaded_image_url", None),
        "status": getattr(result, "status", None),
        "final_result": getattr(result, "final_result", None),
        "agent_results": getattr(result, "agent_results", []) or [],
        "conversion_result": getattr(result, "conversion_result", None),
        "task_id": getattr(result, "task_id", None),
        "processing_time_ms": getattr(result, "processing_time_ms", None),
        "error_message": getattr(result, "error_message", None),
        "created_at": getattr(result, "created_at", None),
        "updated_at": getattr(result, "updated_at", None),
    }


def serialize_currency_rate(rate: CurrencyRate) -> Dict[str, Any]:
    return {
        "id": str(rate.id),
        "target_currency": getattr(rate, "target_currency", ""),
        "currency_name": getattr(rate, "currency_name", None),
        "rate_to_vnd": getattr(rate, "rate_to_vnd", 0),
        "market_rate_to_vnd": getattr(rate, "market_rate_to_vnd", None),
        "manual_rate_to_vnd": getattr(rate, "manual_rate_to_vnd", None),
        "manual_override": getattr(rate, "manual_override", False),
        "source": getattr(rate, "source", "manual"),
        "provider": getattr(rate, "provider", None),
        "is_active": getattr(rate, "is_active", True),
        "is_stale": getattr(rate, "is_stale", False),
        "last_updated": getattr(rate, "last_updated", None),
        "created_at": getattr(rate, "created_at", None),
        "updated_at": getattr(rate, "updated_at", None),
    }


def serialize_log(log: SystemLog) -> Dict[str, Any]:
    return {
        "id": str(log.id),
        "level": getattr(log, "level", "INFO"),
        "module": getattr(log, "module", "system"),
        "message": getattr(log, "message", ""),
        "request_id": getattr(log, "request_id", None),
        "user_id": getattr(log, "user_id", None),
        "path": getattr(log, "path", None),
        "method": getattr(log, "method", None),
        "status_code": getattr(log, "status_code", None),
        "error_detail": getattr(log, "error_detail", None),
        "stack_trace": getattr(log, "stack_trace", None),
        "raw": getattr(log, "raw", None),
        "created_at": getattr(log, "created_at", None),
        "timestamp": getattr(log, "timestamp", None),
    }


class AdminService:
    @staticmethod
    async def get_dashboard_stats() -> Dict[str, Any]:
        total_users = await User.count()
        active_users = await User.find({"is_active": True}).count()

        total_scans = await RecognitionRequest.count()
        completed_scans = await RecognitionRequest.find(
            {"status": {"$in": ["Completed", "success", "completed", "High Consensus"]}}
        ).count()

        success_transactions = await Transaction.find(
            {"status": {"$in": ["success", "completed"]}}
        ).to_list()

        total_revenue_vnd = sum(float(getattr(tx, "amount", 0) or 0) for tx in success_transactions)
        tokens_sold = sum(int(getattr(tx, "tokens_added", 0) or 0) for tx in success_transactions)

        pending_feedback = await Feedback.find(
            {"status": {"$in": ["new", "pending"]}}
        ).count()

        return {
            "kpis": {
                "total_users": total_users,
                "active_users": active_users,
                "total_scans": total_scans,
                "completed_scans": completed_scans,
                "total_revenue_vnd": total_revenue_vnd,
                "tokens_sold": tokens_sold,
                "pending_feedback": pending_feedback,
            },
            "last_updated": now_utc(),
        }

    @staticmethod
    async def get_payment_overview() -> Dict[str, Any]:
        total = await Transaction.count()
        pending = await Transaction.find({"status": "pending"}).count()
        completed = await Transaction.find({"status": {"$in": ["success", "completed"]}}).count()
        failed = await Transaction.find({"status": "failed"}).count()

        transactions = await Transaction.find({"status": {"$in": ["success", "completed"]}}).to_list()
        revenue_vnd = sum(float(getattr(tx, "amount", 0) or 0) for tx in transactions)

        return {
            "total_transactions": total,
            "pending_transactions": pending,
            "completed_transactions": completed,
            "failed_transactions": failed,
            "revenue_vnd": revenue_vnd,
        }

    @staticmethod
    async def get_user_overview() -> Dict[str, Any]:
        users = await User.find_all().to_list()

        total = len(users)
        active = len([user for user in users if getattr(user, "is_active", True)])
        admins = len([user for user in users if getattr(user, "role", "user") == "admin"])
        google_users = len([user for user in users if getattr(user, "provider", "local") == "google"])

        return {
            "total_users": total,
            "active_users": active,
            "inactive_users": total - active,
            "admin_users": admins,
            "normal_users": total - admins,
            "google_oauth_users": google_users,
            "email_users": total - google_users,
        }

    @staticmethod
    async def get_banknote_overview() -> Dict[str, Any]:
        banknotes = await Banknote.find_all().to_list()
        countries = sorted(set(getattr(item, "country", "") for item in banknotes if getattr(item, "country", "")))
        missing_images = len([item for item in banknotes if not getattr(item, "front_image_url", None)])

        return {
            "total_banknotes": len(banknotes),
            "supported_countries_count": len(countries),
            "supported_countries": countries,
            "missing_images_count": missing_images,
        }

    @staticmethod
    async def get_system_health() -> Dict[str, Any]:
        database_status = "online"

        try:
            await User.find_one()
        except Exception:
            database_status = "down"

        config = await AdminService.get_system_config()

        return {
            "api_server": "online",
            "database": database_status,
            "agent_1_ml": "enabled" if getattr(config, "enable_agent_1", True) else "disabled",
            "agent_2_llm": "enabled" if getattr(config, "enable_agent_2", True) else "disabled",
            "agent_3_lens": "enabled" if getattr(config, "enable_agent_3", True) else "disabled",
            "aggregator": "enabled" if getattr(config, "enable_aggregator", True) else "disabled",
            "checked_at": now_utc(),
        }

    @staticmethod
    async def get_agent_performance() -> Dict[str, Any]:
        scans = await RecognitionRequest.find_all().to_list()
        total = len(scans)

        if total == 0:
            return {
                "ml_dl_success_rate": 0,
                "llm_success_rate": 0,
                "lens_success_rate": 0,
                "consensus_rate": 0,
                "conflict_rate": 0,
                "average_scan_time_sec": 0,
            }

        ml_success = 0
        llm_success = 0
        lens_success = 0
        consensus_count = 0
        conflict_count = 0

        total_processing_ms = 0
        processing_count = 0

        for scan in scans:
            agent_results = getattr(scan, "agent_results", []) or []
            final_result = getattr(scan, "final_result", {}) or {}

            for item in agent_results:
                agent_name = str(item.get("agent", "")).lower()
                data = item.get("data") or item.get("result") or {}

                failed = data.get("status") == "Failed" or "error" in data

                if "yolo" in agent_name or "ml" in agent_name:
                    if not failed:
                        ml_success += 1
                elif "llm" in agent_name:
                    if not failed:
                        llm_success += 1
                elif "lens" in agent_name:
                    if not failed:
                        lens_success += 1

            matched_agents = int(final_result.get("matched_agents") or final_result.get("so_luong_dong_thuan") or 0)

            if matched_agents >= 2:
                consensus_count += 1
            else:
                conflict_count += 1

            processing_ms = getattr(scan, "processing_time_ms", None)
            if processing_ms:
                total_processing_ms += processing_ms
                processing_count += 1

        return {
            "ml_dl_success_rate": round((ml_success / total) * 100, 1),
            "llm_success_rate": round((llm_success / total) * 100, 1),
            "lens_success_rate": round((lens_success / total) * 100, 1),
            "consensus_rate": round((consensus_count / total) * 100, 1),
            "conflict_rate": round((conflict_count / total) * 100, 1),
            "average_scan_time_sec": round((total_processing_ms / processing_count) / 1000, 2)
            if processing_count
            else 0,
        }

    @staticmethod
    async def get_recent_scans(limit: int = 10) -> List[Dict[str, Any]]:
        scans = await RecognitionRequest.find_all().sort("-created_at").limit(limit).to_list()
        return [serialize_result(scan) for scan in scans]

    @staticmethod
    async def get_pending_feedback(limit: int = 5) -> List[Dict[str, Any]]:
        feedbacks = (
            await Feedback.find({"status": {"$in": ["new", "pending"]}})
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )
        return [serialize_feedback(feedback) for feedback in feedbacks]

    @staticmethod
    async def get_system_config() -> SystemConfig:
        config = await SystemConfig.find_one()

        if not config:
            config = SystemConfig()
            await config.insert()

        return config

    @staticmethod
    async def update_system_config(data: Dict[str, Any]) -> SystemConfig:
        config = await AdminService.get_system_config()

        for key, value in data.items():
            if key in {"id", "_id", "created_at"}:
                continue

            if hasattr(config, key) and value is not None:
                setattr(config, key, value)

        if hasattr(config, "updated_at"):
            config.updated_at = now_utc()

        await config.save()
        return config

    @staticmethod
    async def get_admin_users(
        page: int = 1,
        limit: int = 50,
        search: str = "",
        role: str = "all",
        status: str = "all",
        provider: str = "all",
    ) -> Dict[str, Any]:
        page = max(page, 1)
        limit = max(min(limit, 200), 1)
        skip = (page - 1) * limit

        filters: Dict[str, Any] = {}

        if role and role != "all":
            filters["role"] = role

        if status and status != "all":
            if status in {"active", "enabled"}:
                filters["is_active"] = True
            elif status in {"inactive", "disabled", "blocked", "banned"}:
                filters["is_active"] = False

        if provider and provider != "all":
            filters["provider"] = {"$regex": provider, "$options": "i"}

        if search:
            search_filter = {
                "$or": [
                    {"email": {"$regex": search, "$options": "i"}},
                    {"full_name": {"$regex": search, "$options": "i"}},
                ]
            }

            if filters:
                filters = {"$and": [filters, search_filter]}
            else:
                filters = search_filter

        total = await User.find(filters).count()
        users = await User.find(filters).sort("-created_at").skip(skip).limit(limit).to_list()

        return {
            "items": [serialize_user(user) for user in users],
            "total": total,
            "page": page,
            "limit": limit,
        }

    @staticmethod
    async def get_admin_user_detail(user_id: str) -> Dict[str, Any]:
        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        return serialize_user(user)

    @staticmethod
    async def update_admin_user(user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        allowed_fields = {
            "full_name",
            "phone",
            "country",
            "avatar_url",
            "token_balance",
            "is_active",
        }

        for key, value in data.items():
            if key in allowed_fields and value is not None and hasattr(user, key):
                setattr(user, key, value)

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return serialize_user(user)

    @staticmethod
    async def update_user_role(user_id: str, role: str) -> Dict[str, Any]:
        if role not in {"user", "admin"}:
            raise HTTPException(status_code=400, detail="Invalid role.")

        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        user.role = role

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return serialize_user(user)

    @staticmethod
    async def update_user_status(user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        is_active = data.get("is_active")

        if is_active is None and "status" in data:
            is_active = str(data["status"]).lower() in {"active", "enabled", "true"}

        if is_active is None:
            raise HTTPException(status_code=400, detail="Missing status value.")

        user.is_active = bool(is_active)

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()
        return serialize_user(user)

    @staticmethod
    async def delete_admin_user(user_id: str, current_admin: User) -> Dict[str, Any]:
        if str(current_admin.id) == str(user_id):
            raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

        user = await User.get(to_object_id(user_id))

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        await user.delete()
        return {"message": "User deleted successfully.", "id": user_id}

    @staticmethod
    async def get_token_packages(search: Optional[str] = None, status: str = "all") -> List[Dict[str, Any]]:
        filters: Dict[str, Any] = {}

        if search:
            filters["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
            ]

        if status == "active":
            filters["is_active"] = True
        elif status in {"inactive", "hidden", "disabled"}:
            filters["is_active"] = False

        packages = await TokenPackage.find(filters).sort("sort_order").to_list()
        return [serialize_token_package(package) for package in packages]

    @staticmethod
    async def create_token_package(payload: Dict[str, Any]) -> Dict[str, Any]:
        package = TokenPackage(
            package_key=payload.get("package_key"),
            name=payload.get("name"),
            price_usd=payload.get("price_usd") or 0,
            price_vnd=payload.get("price_vnd") or 0,
            tokens_included=payload.get("tokens_included") or payload.get("tokens") or 0,
            description=payload.get("description") or "",
            features=payload.get("features") or [],
            badge=payload.get("badge") or "",
            sort_order=payload.get("sort_order") or 0,
            is_active=payload.get("is_active", True),
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await package.insert()
        return serialize_token_package(package)

    @staticmethod
    async def update_token_package(package_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        package = await TokenPackage.get(to_object_id(package_id))

        if not package:
            raise HTTPException(status_code=404, detail="Token package not found.")

        allowed_fields = {
            "package_key",
            "name",
            "price_usd",
            "price_vnd",
            "tokens_included",
            "description",
            "features",
            "badge",
            "sort_order",
            "is_active",
        }

        if "tokens" in payload and "tokens_included" not in payload:
            payload["tokens_included"] = payload["tokens"]

        for key, value in payload.items():
            if key in allowed_fields and value is not None and hasattr(package, key):
                setattr(package, key, value)

        if hasattr(package, "updated_at"):
            package.updated_at = now_utc()

        await package.save()
        return serialize_token_package(package)

    @staticmethod
    async def toggle_token_package(package_id: str) -> Dict[str, Any]:
        package = await TokenPackage.get(to_object_id(package_id))

        if not package:
            raise HTTPException(status_code=404, detail="Token package not found.")

        package.is_active = not bool(getattr(package, "is_active", True))

        if hasattr(package, "updated_at"):
            package.updated_at = now_utc()

        await package.save()
        return serialize_token_package(package)

    @staticmethod
    async def delete_token_package(package_id: str) -> Dict[str, Any]:
        package = await TokenPackage.get(to_object_id(package_id))

        if not package:
            raise HTTPException(status_code=404, detail="Token package not found.")

        await package.delete()
        return {"message": "Token package deleted successfully.", "id": package_id}

    @staticmethod
    async def get_transactions(
        page: int = 1,
        limit: int = 50,
        search: str = "",
        status: str = "all",
        gateway: str = "all",
    ) -> Dict[str, Any]:
        page = max(page, 1)
        limit = max(min(limit, 100), 1)
        skip = (page - 1) * limit

        filters: Dict[str, Any] = {}

        if status and status != "all":
            filters["status"] = status

        if gateway and gateway != "all":
            filters["payment_gateway"] = gateway

        if search:
            filters["$or"] = [
                {"transaction_code": {"$regex": search, "$options": "i"}},
                {"transfer_content": {"$regex": search, "$options": "i"}},
                {"package_name": {"$regex": search, "$options": "i"}},
            ]

        total = await Transaction.find(filters).count()
        transactions = await Transaction.find(filters).sort("-created_at").skip(skip).limit(limit).to_list()

        return {
            "items": [serialize_transaction(tx) for tx in transactions],
            "total": total,
            "page": page,
            "limit": limit,
        }

    @staticmethod
    async def get_transaction_detail(tx_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(tx_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        return serialize_transaction(transaction)

    @staticmethod
    async def update_transaction_status(tx_id: str, status: str) -> Dict[str, Any]:
        if status not in {"pending", "success", "completed", "failed", "cancelled"}:
            raise HTTPException(status_code=400, detail="Invalid transaction status.")

        transaction = await Transaction.get(to_object_id(tx_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if status in {"success", "completed"}:
            transaction = await PaymentService.credit_transaction_once(transaction)
            return serialize_transaction(transaction)

        if getattr(transaction, "credited", False):
            raise HTTPException(status_code=400, detail="Credited transaction status cannot be changed.")

        transaction.status = status
        transaction.updated_at = now_utc()
        await transaction.save()

        return serialize_transaction(transaction)

    @staticmethod
    async def mark_transaction_paid(tx_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(tx_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        transaction = await PaymentService.credit_transaction_once(transaction)
        return serialize_transaction(transaction)

    @staticmethod
    async def cancel_transaction(tx_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(tx_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if getattr(transaction, "credited", False) or transaction.status in {"success", "completed"}:
            raise HTTPException(status_code=400, detail="Completed transaction cannot be cancelled.")

        transaction.status = "cancelled"
        transaction.updated_at = now_utc()
        await transaction.save()

        return serialize_transaction(transaction)

    @staticmethod
    async def delete_transaction(tx_id: str) -> Dict[str, Any]:
        transaction = await Transaction.get(to_object_id(tx_id))

        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found.")

        if transaction.status in {"success", "completed"} or getattr(transaction, "credited", False):
            raise HTTPException(status_code=400, detail="Completed transaction cannot be deleted.")

        await transaction.delete()
        return {"message": "Transaction deleted successfully.", "id": tx_id}

    @staticmethod
    async def get_feedbacks(
        page: int = 1,
        limit: int = 50,
        search: str = "",
        feedback_type: str = "all",
        status: str = "all",
        priority: str = "all",
        rating: str = "all",
    ) -> Dict[str, Any]:
        page = max(page, 1)
        limit = max(min(limit, 100), 1)
        skip = (page - 1) * limit

        filters: Dict[str, Any] = {}

        if feedback_type and feedback_type != "all":
            filters["feedback_type"] = feedback_type

        if status and status != "all":
            filters["status"] = status

        if priority and priority != "all":
            filters["priority"] = priority

        if rating and rating != "all":
            try:
                filters["rating"] = int(rating)
            except ValueError:
                pass

        if search:
            filters["$or"] = [
                {"subject": {"$regex": search, "$options": "i"}},
                {"message": {"$regex": search, "$options": "i"}},
            ]

        total = await Feedback.find(filters).count()
        feedbacks = await Feedback.find(filters).sort("-created_at").skip(skip).limit(limit).to_list()

        return {
            "items": [serialize_feedback(feedback) for feedback in feedbacks],
            "total": total,
            "page": page,
            "limit": limit,
        }

    @staticmethod
    async def get_feedback_detail(feedback_id: str) -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        return serialize_feedback(feedback)

    @staticmethod
    async def update_feedback_status(feedback_id: str, status: str) -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        feedback.status = status
        feedback.is_resolved = status in {"resolved", "reviewed", "closed"}

        if feedback.is_resolved:
            feedback.resolved_at = now_utc()

        feedback.updated_at = now_utc()
        await feedback.save()

        return serialize_feedback(feedback)

    @staticmethod
    async def update_feedback_priority(feedback_id: str, priority: str) -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        feedback.priority = priority
        feedback.updated_at = now_utc()
        await feedback.save()

        return serialize_feedback(feedback)

    @staticmethod
    async def reply_feedback(feedback_id: str, admin_reply: str, status: str = "resolved") -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        feedback.admin_reply = admin_reply
        feedback.status = status
        feedback.is_resolved = status in {"resolved", "reviewed", "closed"}

        if feedback.is_resolved:
            feedback.resolved_at = now_utc()

        feedback.updated_at = now_utc()
        await feedback.save()

        return serialize_feedback(feedback)

    @staticmethod
    async def delete_feedback(feedback_id: str) -> Dict[str, Any]:
        feedback = await Feedback.get(to_object_id(feedback_id))

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found.")

        await feedback.delete()
        return {"message": "Feedback deleted successfully.", "id": feedback_id}

    @staticmethod
    async def get_all_results() -> List[Dict[str, Any]]:
        results = await RecognitionRequest.find_all().sort("-created_at").to_list()
        return [serialize_result(result) for result in results]

    @staticmethod
    async def delete_result(result_id: str) -> Dict[str, Any]:
        result = await RecognitionRequest.get(to_object_id(result_id))

        if not result:
            raise HTTPException(status_code=404, detail="Recognition result not found.")

        await result.delete()
        return {"message": "Recognition result deleted successfully.", "id": result_id}

    @staticmethod
    async def review_result(result_id: str) -> Dict[str, Any]:
        result = await RecognitionRequest.get(to_object_id(result_id))

        if not result:
            raise HTTPException(status_code=404, detail="Recognition result not found.")

        result.status = "Reviewed"

        if hasattr(result, "updated_at"):
            result.updated_at = now_utc()

        await result.save()
        return serialize_result(result)

    @staticmethod
    async def get_all_banknotes() -> List[Dict[str, Any]]:
        banknotes = await Banknote.find_all().sort("country").to_list()
        return [serialize_banknote(banknote) for banknote in banknotes]

    @staticmethod
    async def create_banknote(data: Dict[str, Any]) -> Dict[str, Any]:
        banknote = Banknote(**data)
        await banknote.insert()
        return serialize_banknote(banknote)

    @staticmethod
    async def update_banknote(banknote_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        for key, value in data.items():
            if key in {"id", "_id", "created_at"}:
                continue

            if hasattr(banknote, key):
                setattr(banknote, key, value)

        if hasattr(banknote, "updated_at"):
            banknote.updated_at = now_utc()

        await banknote.save()
        return serialize_banknote(banknote)

    @staticmethod
    async def upload_banknote_image(
        banknote_id: str,
        file: UploadFile,
        side: str = "front",
    ) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        normalized_side = str(side or "front").strip().lower()
        if normalized_side not in {"front", "back"}:
            raise HTTPException(status_code=400, detail="Image side must be 'front' or 'back'.")

        image_bytes = await validate_and_read_image(file)
        image_url = await upload_image_to_cloudinary(image_bytes)

        if not image_url:
            raise HTTPException(
                status_code=503,
                detail="Image upload service is not configured or unavailable.",
            )

        if normalized_side == "back":
            banknote.back_image_url = image_url
        else:
            banknote.front_image_url = image_url

        if hasattr(banknote, "updated_at"):
            banknote.updated_at = now_utc()

        await banknote.save()

        return {
            **serialize_banknote(banknote),
            "uploaded_image_url": image_url,
            "side": normalized_side,
        }

    @staticmethod
    async def delete_banknote(banknote_id: str) -> Dict[str, Any]:
        banknote = await Banknote.get(to_object_id(banknote_id))

        if not banknote:
            raise HTTPException(status_code=404, detail="Banknote not found.")

        await banknote.delete()
        return {"message": "Banknote deleted successfully.", "id": banknote_id}

    @staticmethod
    async def get_all_currency_rates(
        search: str = "",
        status: str = "all",
        source: str = "all",
        override: str = "all",
    ) -> List[Dict[str, Any]]:
        return await CurrencyService.get_admin_currency_rates(
            search=search,
            status=status,
            source=source,
            override=override,
        )

    @staticmethod
    async def create_currency_rate(data: Dict[str, Any]) -> Dict[str, Any]:
        return await CurrencyService.create_currency_rate(data)

    @staticmethod
    async def update_currency_rate(rate_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        return await CurrencyService.update_currency_rate(rate_id, data)

    @staticmethod
    async def delete_currency_rate(rate_id: str) -> Dict[str, Any]:
        return await CurrencyService.delete_currency_rate(rate_id)

    @staticmethod
    async def sync_currency_rates() -> Dict[str, Any]:
        return await CurrencyService.sync_market_rates()

    @staticmethod
    async def get_sync_logs() -> List[Dict[str, Any]]:
        logs = await CurrencyRateSyncLog.find_all().sort("-started_at").limit(50).to_list()

        return [
            {
                "id": str(log.id),
                "provider": getattr(log, "provider", None),
                "status": getattr(log, "status", None),
                "message": getattr(log, "message", None),
                "fetched_count": getattr(log, "fetched_count", 0),
                "started_at": getattr(log, "started_at", None),
                "finished_at": getattr(log, "finished_at", None),
                "error_detail": getattr(log, "error_detail", None),
            }
            for log in logs
        ]

    @staticmethod
    async def get_agents_overview() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        agents = [
            {
                "id": "agent_1_ml",
                "name": "Agent 1 ML/DL",
                "type": "ml_model",
                "enabled": getattr(config, "enable_agent_1", True),
                "status": "enabled" if getattr(config, "enable_agent_1", True) else "disabled",
                "health": "configured" if getattr(config, "yolo_model_path", None) and getattr(config, "res_model_path", None) else "missing_config",
                "last_run_at": None,
                "latency_ms": None,
                "success_rate": None,
                "route": "/admin/ai-model-config",
            },
            {
                "id": "agent_2_llm",
                "name": "Agent 2 LLM",
                "type": "llm",
                "enabled": getattr(config, "enable_agent_2", True),
                "status": "enabled" if getattr(config, "enable_agent_2", True) else "disabled",
                "health": "configured" if getattr(config, "llm_enabled", True) else "disabled",
                "last_run_at": None,
                "latency_ms": None,
                "success_rate": None,
                "route": "/admin/llm-config",
            },
            {
                "id": "agent_3_lens",
                "name": f"Agent 3 Google Lens ({getattr(config, 'lens_provider', 'serpapi')})",
                "type": "visual_search",
                "provider": getattr(config, "lens_provider", "serpapi"),
                "fallback_enabled": getattr(config, "lens_fallback_enabled", True),
                "enabled": getattr(config, "enable_agent_3", True) and getattr(config, "lens_enabled", True),
                "status": "enabled" if (getattr(config, "enable_agent_3", True) and getattr(config, "lens_enabled", True)) else "disabled",
                "health": "configured" if getattr(config, "lens_enabled", True) else "disabled",
                "last_run_at": None,
                "latency_ms": None,
                "success_rate": None,
                "route": "/admin/google-lens-config",
            },
            {
                "id": "aggregator",
                "name": "Aggregator",
                "type": "core",
                "enabled": getattr(config, "enable_aggregator", True),
                "status": "enabled" if getattr(config, "enable_aggregator", True) else "disabled",
                "health": "configured",
                "last_run_at": None,
                "latency_ms": None,
                "success_rate": None,
                "route": "/admin/aggregator-config",
            },
        ]

        active_agents = len([agent for agent in agents if agent["enabled"]])

        return {
            "summary": {
                "total_agents": len(agents),
                "active_agents": active_agents,
                "overall_health": "good" if active_agents >= 2 else "warning",
            },
            "agents": agents,
        }

    @staticmethod
    async def get_system_settings() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        return {
            # General app settings
            "app_name": getattr(config, "app_name", "BanknoteAI"),
            "support_email": getattr(config, "support_email", "support@banknoteai.com"),
            "default_language": getattr(config, "default_language", "EN"),
            "default_theme": getattr(config, "default_theme", "system"),

            "public_registration_enabled": getattr(config, "public_registration_enabled", True),
            "feature_email_password_login_enabled": getattr(config, "feature_email_password_login_enabled", True),
            "feature_google_login_enabled": getattr(config, "feature_google_login_enabled", True),
            "feature_scan_enabled": getattr(config, "feature_scan_enabled", True),
            "feature_currency_converter_enabled": getattr(config, "feature_currency_converter_enabled", True),
            "feature_payment_enabled": getattr(config, "feature_payment_enabled", True),
            "feature_feedback_enabled": getattr(config, "feature_feedback_enabled", True),
            "feature_history_enabled": getattr(config, "feature_history_enabled", True),

            # Upload / recognition limits
            "max_upload_size_mb": getattr(config, "max_upload_size_mb", 5),
            "allowed_image_types": getattr(config, "allowed_image_types", ["jpg", "jpeg", "png", "webp"]),
            "scan_history_retention_days": getattr(config, "scan_history_retention_days", 30),
            "token_cost_per_scan": getattr(config, "token_cost_per_scan", 1),

            # Payment gateway
            "payment_gateway_default": getattr(config, "payment_gateway_default", "sepay"),
            "enabled_payment_gateways": getattr(config, "enabled_payment_gateways", ["sepay"]),

            "sepay_enabled": getattr(config, "sepay_enabled", True),
            "vnpay_enabled": getattr(config, "vnpay_enabled", False),
            "mock_payment_enabled": getattr(config, "mock_payment_enabled", False),

            "sepay_bank_name": getattr(config, "sepay_bank_name", None),
            "sepay_account_number": getattr(config, "sepay_account_number", None),
            "sepay_account_name": getattr(config, "sepay_account_name", None),

            "vnpay_tmn_code_configured": getattr(config, "vnpay_tmn_code_configured", False),
            "vnpay_hash_secret_configured": getattr(config, "vnpay_hash_secret_configured", False),
            "vnpay_return_url": getattr(config, "vnpay_return_url", None),
            "vnpay_ipn_url": getattr(config, "vnpay_ipn_url", None),

            # Token billing
            "token_billing_enabled": getattr(config, "token_billing_enabled", True),
            "token_billing_mode": getattr(config, "token_billing_mode", "fixed"),
            "dynamic_ai_token_billing_enabled": getattr(config, "dynamic_ai_token_billing_enabled", False),
            "token_count_model": getattr(config, "token_count_model", "gpt-3.5-turbo"),

            "ai_token_to_system_token_rate": getattr(config, "ai_token_to_system_token_rate", 1000),
            "token_billing_tax_rate": getattr(config, "token_billing_tax_rate", 0.10),
            "token_billing_rounding_mode": getattr(config, "token_billing_rounding_mode", "ceil"),

            "min_tokens_per_scan": getattr(config, "min_tokens_per_scan", 1),
            "max_tokens_per_scan": getattr(config, "max_tokens_per_scan", 10),

            "refund_on_system_error": getattr(config, "refund_on_system_error", True),
            "refund_on_agent_failure": getattr(config, "refund_on_agent_failure", False),
            "charge_when_needs_review": getattr(config, "charge_when_needs_review", True),

            "save_token_usage_logs": getattr(config, "save_token_usage_logs", True),
            "show_token_usage_to_user": getattr(config, "show_token_usage_to_user", True),
            "show_ai_token_usage_to_admin": getattr(config, "show_ai_token_usage_to_admin", True),

            # Email notifications
            "email_notifications_enabled": getattr(config, "email_notifications_enabled", False),

            "email_on_register": getattr(config, "email_on_register", True),
            "email_on_google_first_login": getattr(config, "email_on_google_first_login", True),
            "email_on_password_reset": getattr(config, "email_on_password_reset", True),
            "email_on_payment_created": getattr(config, "email_on_payment_created", True),
            "email_on_payment_success": getattr(config, "email_on_payment_success", True),
            "email_on_payment_failed": getattr(config, "email_on_payment_failed", True),
            "email_on_recognition_completed": getattr(config, "email_on_recognition_completed", False),
            "email_on_recognition_failed": getattr(config, "email_on_recognition_failed", True),
            "email_on_feedback_created": getattr(config, "email_on_feedback_created", True),
            "email_on_feedback_replied": getattr(config, "email_on_feedback_replied", True),
            "email_admin_on_system_error": getattr(config, "email_admin_on_system_error", True),

            "smtp_configured": getattr(config, "smtp_configured", False),
            "smtp_host": getattr(config, "smtp_host", None),
            "smtp_port": getattr(config, "smtp_port", 587),
            "smtp_username": getattr(config, "smtp_username", None),
            "smtp_from_email": getattr(config, "smtp_from_email", None),
            "smtp_from_name": getattr(config, "smtp_from_name", "BanknoteAI"),

            # Maintenance
            "maintenance_mode": getattr(config, "maintenance_mode", False),
            "maintenance_message": getattr(config, "maintenance_message", ""),
            "allow_admin_login_during_maintenance": getattr(config, "allow_admin_login_during_maintenance", True),

            # Security
            "session_timeout_minutes": getattr(config, "session_timeout_minutes", 120),
            "max_login_attempts": getattr(config, "max_login_attempts", 5),
            "password_min_length": getattr(config, "password_min_length", 6),
            "require_email_verification": getattr(config, "require_email_verification", False),

            "feedback_review_sla_days": getattr(config, "feedback_review_sla_days", 3),
            "admin_alert_email": getattr(config, "admin_alert_email", None),

            "updated_at": getattr(config, "updated_at", None),
        }

    @staticmethod
    async def update_system_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
        config = await AdminService.update_system_config(payload)
        return await AdminService.get_system_settings()

    @staticmethod
    async def get_system_logs(
        page: int = 1,
        limit: int = 50,
        level: str = "all",
        module: str = "all",
        search: str = "",
    ) -> Dict[str, Any]:
        page = max(page, 1)
        limit = max(min(limit, 200), 1)
        skip = (page - 1) * limit

        filters: Dict[str, Any] = {}

        if level and level != "all":
            filters["level"] = {"$regex": f"^{level}$", "$options": "i"}

        if module and module != "all":
            filters["module"] = {"$regex": f"^{module}$", "$options": "i"}

        if search:
            filters["$or"] = [
                {"message": {"$regex": search, "$options": "i"}},
                {"request_id": {"$regex": search, "$options": "i"}},
                {"path": {"$regex": search, "$options": "i"}},
            ]

        total = await SystemLog.find(filters).count()
        logs = await SystemLog.find(filters).sort("-created_at").skip(skip).limit(limit).to_list()

        return {
            "items": [serialize_log(log) for log in logs],
            "total": total,
            "page": page,
            "limit": limit,
        }

    @staticmethod
    async def get_system_log_detail(log_id: str) -> Dict[str, Any]:
        log = await SystemLog.get(to_object_id(log_id))

        if not log:
            raise HTTPException(status_code=404, detail="System log not found.")

        return serialize_log(log)

    @staticmethod
    async def clear_system_logs() -> Dict[str, Any]:
        await SystemLog.find_all().delete()
        return {"message": "All system logs were cleared."}

    @staticmethod
    async def export_system_logs() -> List[Dict[str, Any]]:
        logs = await SystemLog.find_all().sort("-created_at").to_list()
        return [serialize_log(log) for log in logs]
    
        # ============================================================
    # RECOGNITION RESULT RERUN
    # ============================================================

    @staticmethod
    async def rerun_result(result_id: str) -> Dict[str, Any]:
        result = await RecognitionRequest.get(to_object_id(result_id))

        if not result:
            raise HTTPException(status_code=404, detail="Recognition result not found.")

        result.status = "rerun_required"

        if hasattr(result, "error_message"):
            result.error_message = "Admin requested rerun."

        if hasattr(result, "updated_at"):
            result.updated_at = now_utc()

        await result.save()

        return {
            "message": "Recognition result marked for rerun.",
            "result": serialize_result(result),
        }

    # ============================================================
    # AGENTS STATUS / TEST
    # ============================================================

    @staticmethod
    async def get_agents_status() -> Dict[str, Any]:
        return await AdminService.get_agents_overview()

    @staticmethod
    async def test_agent(agent_key: str) -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        allowed_agents = {
            "agent_1_ml": {
                "name": "Agent 1 ML/DL",
                "enabled": getattr(config, "enable_agent_1", True),
                "configured": bool(
                    getattr(config, "yolo_model_path", None)
                    and getattr(config, "res_model_path", None)
                ),
            },
            "agent_2_llm": {
                "name": "Agent 2 LLM",
                "enabled": getattr(config, "enable_agent_2", True),
                "configured": bool(getattr(config, "llm_enabled", True)),
            },
            "agent_3_lens": {
                "name": f"Agent 3 Google Lens ({getattr(config, 'lens_provider', 'serpapi')})",
                "enabled": getattr(config, "enable_agent_3", True) and getattr(config, "lens_enabled", True),
                "configured": bool(getattr(config, "lens_enabled", True)) and str(getattr(config, "lens_provider", "serpapi")).lower() != "disabled",
            },
            "aggregator": {
                "name": "Aggregator",
                "enabled": getattr(config, "enable_aggregator", True),
                "configured": True,
            },
        }

        if agent_key not in allowed_agents:
            raise HTTPException(status_code=400, detail="Invalid agent key.")

        agent = allowed_agents[agent_key]

        if not agent["enabled"]:
            return {
                "agent_key": agent_key,
                "name": agent["name"],
                "status": "disabled",
                "ok": False,
                "message": "Agent is disabled in system config.",
                "tested_at": now_utc(),
            }

        if not agent["configured"]:
            return {
                "agent_key": agent_key,
                "name": agent["name"],
                "status": "missing_config",
                "ok": False,
                "message": "Agent configuration is incomplete.",
                "tested_at": now_utc(),
            }

        return {
            "agent_key": agent_key,
            "name": agent["name"],
            "status": "ok",
            "ok": True,
            "message": "Agent configuration looks valid.",
            "tested_at": now_utc(),
        }

    # ============================================================
    # CONFIG HELPERS
    # ============================================================

    @staticmethod
    def _pick_config_fields(config: SystemConfig, fields: List[str]) -> Dict[str, Any]:
        return {
            field: getattr(config, field, None)
            for field in fields
            if hasattr(config, field)
        }

    @staticmethod
    async def _update_config_fields(payload: Dict[str, Any], allowed_fields: List[str]) -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        for key, value in payload.items():
            if key not in allowed_fields:
                continue

            if value is None:
                continue

            if hasattr(config, key):
                setattr(config, key, value)

        if hasattr(config, "updated_at"):
            config.updated_at = now_utc()

        await config.save()

        return AdminService._pick_config_fields(config, allowed_fields)

    # ============================================================
    # AGENTS CONFIG
    # ============================================================

    @staticmethod
    async def get_agents_config() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        fields = [
            "enable_agent_1",
            "enable_agent_2",
            "enable_agent_3",
            "enable_aggregator",
            "parallel_execution",
            "retry_failed_agents",
            "save_raw_agent_output",
            "agent_timeout_seconds",
            "max_retry_count",
            "require_minimum_valid_agents",
            "lens_provider",
            "lens_fallback_enabled",
            "lens_fallback_provider",
            "agent3_v2_enabled",
        ]

        return AdminService._pick_config_fields(config, fields)

    @staticmethod
    async def update_agents_config(payload: Dict[str, Any]) -> Dict[str, Any]:
        fields = [
            "enable_agent_1",
            "enable_agent_2",
            "enable_agent_3",
            "enable_aggregator",
            "parallel_execution",
            "retry_failed_agents",
            "save_raw_agent_output",
            "agent_timeout_seconds",
            "max_retry_count",
            "require_minimum_valid_agents",
            "lens_provider",
            "lens_fallback_enabled",
            "lens_fallback_provider",
            "agent3_v2_enabled",
        ]

        return await AdminService._update_config_fields(payload, fields)

    # ============================================================
    # AI MODEL CONFIG
    # ============================================================

    @staticmethod
    async def get_ai_model_config() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        fields = [
            "ai_enabled",
            "yolo_model_path",
            "res_model_path",
            "res_classes_path",
            "yolo_conf_threshold",
            "yolo_img_size",
            "res_img_size",
            "device",
        ]

        data = AdminService._pick_config_fields(config, fields)

        data["enabled"] = data.get("ai_enabled", True)
        data["classes_path"] = data.get("res_classes_path")
        data["yolo_confidence"] = data.get("yolo_conf_threshold")

        return data

    @staticmethod
    async def update_ai_model_config(payload: Dict[str, Any]) -> Dict[str, Any]:
        if "enabled" in payload and "ai_enabled" not in payload:
            payload["ai_enabled"] = payload.pop("enabled")

        if "classes_path" in payload and "res_classes_path" not in payload:
            payload["res_classes_path"] = payload.pop("classes_path")

        if "yolo_confidence" in payload and "yolo_conf_threshold" not in payload:
            payload["yolo_conf_threshold"] = payload.pop("yolo_confidence")

        fields = [
            "ai_enabled",
            "yolo_model_path",
            "res_model_path",
            "res_classes_path",
            "yolo_conf_threshold",
            "yolo_img_size",
            "res_img_size",
            "device",
        ]

        return await AdminService._update_config_fields(payload, fields)

    # ============================================================
    # LLM CONFIG
    # ============================================================

    @staticmethod
    async def get_llm_config() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        fields = [
            "llm_enabled",
            "llm_provider",
            "api_key_configured",
            "main_model",
            "fallback_models",
            "max_attempts_per_model",
            "temperature",
            "response_mime_type",
            "quota_fallback_enabled",
            "prompt_template",
        ]

        data = AdminService._pick_config_fields(config, fields)

        data["enabled"] = data.get("llm_enabled", True)
        data["api_key"] = ""
        data["api_key_configured"] = bool(
            getattr(config, "api_key", None)
            or getattr(config, "api_key_configured", False)
        )

        return data

    @staticmethod
    async def update_llm_config(payload: Dict[str, Any]) -> Dict[str, Any]:
        if "enabled" in payload and "llm_enabled" not in payload:
            payload["llm_enabled"] = payload.pop("enabled")

        config = await AdminService.get_system_config()

        api_key = payload.pop("api_key", None)

        if api_key:
            if hasattr(config, "api_key"):
                config.api_key = api_key

            if hasattr(config, "api_key_configured"):
                config.api_key_configured = True

        fields = [
            "llm_enabled",
            "llm_provider",
            "api_key_configured",
            "main_model",
            "fallback_models",
            "max_attempts_per_model",
            "temperature",
            "response_mime_type",
            "quota_fallback_enabled",
            "prompt_template",
        ]

        for key, value in payload.items():
            if key in fields and value is not None and hasattr(config, key):
                setattr(config, key, value)

        if hasattr(config, "updated_at"):
            config.updated_at = now_utc()

        await config.save()

        return await AdminService.get_llm_config()

    # ============================================================
    # GOOGLE LENS CONFIG
    # ============================================================

    @staticmethod
    async def get_google_lens_config() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        fields = [
            "lens_enabled",
            "lens_provider",
            "lens_fallback_enabled",
            "lens_fallback_provider",
            "agent3_v2_enabled",
            "proxy_url",
            "language_code",
            "country_code",
            "max_results",
            "max_visual_matches",
            "max_exact_matches",
            "no_cache",
            "raw_fallback_enabled",
            "formatter_model",
        ]

        data = AdminService._pick_config_fields(config, fields)

        data["enabled"] = data.get("lens_enabled", True)
        data["api_key"] = ""
        data["api_key_configured"] = bool(getattr(config, "api_key", None))

        return data

    @staticmethod
    async def update_google_lens_config(payload: Dict[str, Any]) -> Dict[str, Any]:
        if "enabled" in payload and "lens_enabled" not in payload:
            payload["lens_enabled"] = payload.pop("enabled")

        config = await AdminService.get_system_config()

        api_key = payload.pop("api_key", None)

        if api_key and hasattr(config, "api_key"):
            config.api_key = api_key

        fields = [
            "lens_enabled",
            "lens_provider",
            "lens_fallback_enabled",
            "lens_fallback_provider",
            "agent3_v2_enabled",
            "proxy_url",
            "language_code",
            "country_code",
            "max_results",
            "max_visual_matches",
            "max_exact_matches",
            "no_cache",
            "raw_fallback_enabled",
            "formatter_model",
        ]

        for key, value in payload.items():
            if key in fields and value is not None and hasattr(config, key):
                setattr(config, key, value)

        if hasattr(config, "updated_at"):
            config.updated_at = now_utc()

        await config.save()

        return await AdminService.get_google_lens_config()

    # ============================================================
    # AGGREGATOR CONFIG
    # ============================================================

    @staticmethod
    async def get_aggregator_config() -> Dict[str, Any]:
        config = await AdminService.get_system_config()

        fields = [
            "strategy",
            "voting_method",
            "minimum_consensus",
            "min_consensus_ratio",
            "ignore_invalid_results",
            "allow_partial_result",
            "conflict_policy",
            "normalize_denomination",
            "require_same_country",
            "default_to_agent1",
            "ml_weight",
            "llm_weight",
            "lens_weight",
        ]

        return AdminService._pick_config_fields(config, fields)

    @staticmethod
    async def update_aggregator_config(payload: Dict[str, Any]) -> Dict[str, Any]:
        fields = [
            "strategy",
            "voting_method",
            "minimum_consensus",
            "min_consensus_ratio",
            "ignore_invalid_results",
            "allow_partial_result",
            "conflict_policy",
            "normalize_denomination",
            "require_same_country",
            "default_to_agent1",
            "ml_weight",
            "llm_weight",
            "lens_weight",
        ]

        return await AdminService._update_config_fields(payload, fields)
