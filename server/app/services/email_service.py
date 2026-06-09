import asyncio
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any, Dict, Optional

from app.core.config import settings
from app.models.email_log_model import EmailLog
from app.models.user_model import User
from app.services import email_templates as templates

try:
    from app.models.config_model import SystemConfig
except Exception:
    SystemConfig = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def env_value(name: str, default=None):
    value = os.getenv(name)

    if value not in [None, ""]:
        return value

    return getattr(settings, name, default)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)

    if value is None:
        value = getattr(settings, name, default)

    return str(value).strip().lower() in ["1", "true", "yes", "on"]


def obj_to_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}

    if isinstance(value, dict):
        return value

    data = {}

    for key in [
        "id",
        "user_id",
        "package_id",
        "package_name",
        "amount",
        "currency",
        "tokens_added",
        "status",
        "payment_gateway",
        "gateway",
        "transaction_code",
        "transfer_content",
        "subject",
        "feedback_type",
        "priority",
        "message",
        "admin_reply",
        "created_at",
        "updated_at",
    ]:
        if hasattr(value, key):
            item = getattr(value, key)
            data[key] = str(item) if key == "id" else item

    return data


class EmailService:
    @staticmethod
    async def get_system_config():
        if SystemConfig is None:
            return None

        try:
            return await SystemConfig.find_one()
        except Exception:
            return None

    @staticmethod
    async def is_enabled(flag_name: str) -> bool:
        config = await EmailService.get_system_config()

        # .env bật thì cho phép gửi, tránh DB/admin settings chưa đồng bộ làm tắt email.
        env_master_enabled = env_bool("EMAIL_NOTIFICATIONS_ENABLED", False)

        db_master_enabled = False
        if config is not None and hasattr(config, "email_notifications_enabled"):
            db_master_enabled = bool(getattr(config, "email_notifications_enabled"))

        master_enabled = env_master_enabled or db_master_enabled

        if not master_enabled:
            return False

        # Nếu DB có flag cụ thể thì dùng DB.
        # Nếu DB chưa có flag thì mặc định bật để test.
        if config is not None and hasattr(config, flag_name):
            return bool(getattr(config, flag_name))

        return True

    @staticmethod
    async def smtp_settings() -> Dict[str, Any]:
        config = await EmailService.get_system_config()

        host = env_value("SMTP_HOST", None)
        port = int(env_value("SMTP_PORT", 587) or 587)
        username = env_value("SMTP_USERNAME", None)
        password = env_value("SMTP_PASSWORD", None)
        from_email = env_value("SMTP_FROM_EMAIL", username)
        from_name = env_value("SMTP_FROM_NAME", "BanknoteAI")

        # Admin settings có thể override các field không nhạy cảm.
        # Password vẫn đọc từ .env.
        if config is not None:
            if getattr(config, "smtp_host", None):
                host = getattr(config, "smtp_host")

            if getattr(config, "smtp_port", None):
                port = int(getattr(config, "smtp_port"))

            if getattr(config, "smtp_username", None):
                username = getattr(config, "smtp_username")

            if getattr(config, "smtp_from_email", None):
                from_email = getattr(config, "smtp_from_email")

            if getattr(config, "smtp_from_name", None):
                from_name = getattr(config, "smtp_from_name")

        return {
            "host": host,
            "port": port,
            "username": username,
            "password": password,
            "from_email": from_email,
            "from_name": from_name,
        }

    @staticmethod
    async def send_email(
        to_email: str,
        subject: str,
        html_body: str,
        template_key: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        metadata = metadata or {}

        log = EmailLog(
            recipient_email=to_email,
            recipient_user_id=user_id,
            subject=subject,
            template_key=template_key,
            status="pending",
            metadata=metadata,
            created_at=now_utc(),
        )

        await log.insert()

        smtp = await EmailService.smtp_settings()

        if (
            not smtp["host"]
            or not smtp["port"]
            or not smtp["username"]
            or not smtp["password"]
            or not smtp["from_email"]
        ):
            log.status = "skipped"
            log.error_message = (
                "SMTP is not fully configured. Required: SMTP_HOST, "
                "SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL."
            )
            await log.save()

            print("📧 [EMAIL SKIPPED]", log.error_message)

            return {
                "sent": False,
                "status": "skipped",
                "reason": log.error_message,
                "email_log_id": str(log.id),
            }

        try:
            message = EmailMessage()
            message["Subject"] = subject
            message["From"] = f'{smtp["from_name"]} <{smtp["from_email"]}>'
            message["To"] = to_email
            message.set_content("This email requires an HTML-compatible email client.")
            message.add_alternative(html_body, subtype="html")

            def send_sync():
                with smtplib.SMTP(smtp["host"], smtp["port"], timeout=30) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(smtp["username"], smtp["password"])
                    server.send_message(message)

            await asyncio.to_thread(send_sync)

            log.status = "sent"
            log.sent_at = now_utc()
            await log.save()

            print(f"📧 [EMAIL SENT] to={to_email} subject={subject}")

            return {
                "sent": True,
                "status": "sent",
                "email_log_id": str(log.id),
            }

        except Exception as exc:
            log.status = "failed"
            log.error_message = str(exc)
            await log.save()

            print(f"📧 [EMAIL FAILED] to={to_email} error={exc}")

            return {
                "sent": False,
                "status": "failed",
                "reason": str(exc),
                "email_log_id": str(log.id),
            }

    @staticmethod
    async def send_register_email(user_or_email: Any, full_name: Optional[str] = None):
        if not await EmailService.is_enabled("email_on_register"):
            print("📧 [EMAIL OFF] register")
            return None

        if isinstance(user_or_email, User):
            email = user_or_email.email
            name = user_or_email.full_name
            user_id = str(user_or_email.id)
        else:
            email = str(user_or_email)
            name = full_name or email
            user_id = None

        data = templates.register_email(name)

        return await EmailService.send_email(
            to_email=email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="register",
            user_id=user_id,
            metadata={"full_name": name},
        )

    @staticmethod
    async def send_login_email(user_or_email: Any, full_name: Optional[str] = None):
        if not await EmailService.is_enabled("email_on_login"):
            print("📧 [EMAIL OFF] login")
            return None

        if isinstance(user_or_email, User):
            email = user_or_email.email
            name = user_or_email.full_name
            user_id = str(user_or_email.id)
        else:
            email = str(user_or_email)
            name = full_name or email
            user_id = None

        data = templates.login_email(name)

        return await EmailService.send_email(
            to_email=email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="login",
            user_id=user_id,
            metadata={"full_name": name},
        )

    @staticmethod
    async def send_payment_created_email(user: User, transaction: Any):
        if not await EmailService.is_enabled("email_on_payment_created"):
            print("📧 [EMAIL OFF] payment_created")
            return None

        tx = obj_to_dict(transaction)
        data = templates.payment_created_email(user.full_name, tx)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="payment_created",
            user_id=str(user.id),
            metadata={"transaction": tx},
        )

    @staticmethod
    async def send_payment_success_email(user: User, transaction: Any):
        if not await EmailService.is_enabled("email_on_payment_success"):
            print("📧 [EMAIL OFF] payment_success")
            return None

        tx = obj_to_dict(transaction)
        data = templates.payment_success_email(user.full_name, tx)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="payment_success",
            user_id=str(user.id),
            metadata={"transaction": tx},
        )

    @staticmethod
    async def send_payment_failed_email(user: User, transaction: Any):
        if not await EmailService.is_enabled("email_on_payment_failed"):
            print("📧 [EMAIL OFF] payment_failed")
            return None

        tx = obj_to_dict(transaction)
        data = templates.payment_failed_email(user.full_name, tx)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="payment_failed",
            user_id=str(user.id),
            metadata={"transaction": tx},
        )

    @staticmethod
    async def send_feedback_created_email(user: User, feedback: Any):
        if not await EmailService.is_enabled("email_on_feedback_created"):
            print("📧 [EMAIL OFF] feedback_created")
            return None

        fb = obj_to_dict(feedback)
        data = templates.feedback_created_email(user.full_name, fb)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="feedback_created",
            user_id=str(user.id),
            metadata={"feedback": fb},
        )

    @staticmethod
    async def send_feedback_replied_email(user: User, feedback: Any):
        if not await EmailService.is_enabled("email_on_feedback_replied"):
            print("📧 [EMAIL OFF] feedback_replied")
            return None

        fb = obj_to_dict(feedback)
        data = templates.feedback_replied_email(user.full_name, fb)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="feedback_replied",
            user_id=str(user.id),
            metadata={"feedback": fb},
        )
    @staticmethod
    async def send_password_updated_email(user: User):
        # Dùng chung checkbox Password Reset trên Admin Settings
        if not await EmailService.is_enabled("email_on_password_reset"):
            print("📧 [EMAIL OFF] password_updated")
            return None

        data = templates.password_updated_email(user.full_name)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="password_updated",
            user_id=str(user.id),
            metadata={
                "event": "password_updated",
                "email": user.email,
            },
        )
    @staticmethod
    async def send_google_first_login_email(user: User):
        if not await EmailService.is_enabled("email_on_google_first_login"):
            print("📧 [EMAIL OFF] google_first_login")
            return None

        data = templates.google_first_login_email(user.full_name)

        return await EmailService.send_email(
            to_email=user.email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="google_first_login",
            user_id=str(user.id),
            metadata={
                "event": "google_first_login",
                "email": user.email,
            },
        )

    @staticmethod
    async def send_admin_system_error_email(error_message: str, path: str = "N/A"):
        if not await EmailService.is_enabled("email_on_admin_system_error"):
            print("📧 [EMAIL OFF] admin_system_error")
            return None

        config = await EmailService.get_system_config()

        admin_email = None
        if config is not None and hasattr(config, "admin_alert_email"):
            admin_email = getattr(config, "admin_alert_email", None)

        if not admin_email:
            admin_email = env_value("ADMIN_ALERT_EMAIL", None)

        if not admin_email:
            print("📧 [EMAIL SKIPPED] admin_alert_email is not configured")
            return None

        data = templates.admin_system_error_email(
            error_message=error_message,
            path=path,
        )

        return await EmailService.send_email(
            to_email=admin_email,
            subject=data["subject"],
            html_body=data["html"],
            template_key="admin_system_error",
            user_id=None,
            metadata={
                "event": "admin_system_error",
                "path": path,
                "error_message": error_message,
            },
        )