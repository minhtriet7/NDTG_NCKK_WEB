import inspect

from app.models.user_model import User
from app.services.admin_service import AdminService
from app.services.currency_service import CurrencyService
from app.models.currency_model import CurrencyRateSyncLog


async def _maybe_await(value):
    """
    Cho phép gọi cả async function và sync function.
    Nếu value là coroutine/awaitable thì await, nếu không thì trả thẳng.
    """
    if inspect.isawaitable(value):
        return await value
    return value


def _filter_supported_kwargs(func, kwargs: dict) -> dict:
    """
    Chỉ truyền những tham số mà function/service thật sự nhận.
    Tránh lỗi:
    TypeError: got an unexpected keyword argument 'stale'
    """
    signature = inspect.signature(func)

    for parameter in signature.parameters.values():
        if parameter.kind == inspect.Parameter.VAR_KEYWORD:
            return kwargs

    return {
        key: value
        for key, value in kwargs.items()
        if key in signature.parameters
    }


class AdminController:
    # ============================================================
    # DASHBOARD
    # ============================================================

    @staticmethod
    async def get_dashboard_summary():
        kpi_data = await AdminService.get_dashboard_stats()
        payment_data = await AdminService.get_payment_overview()
        user_data = await AdminService.get_user_overview()
        banknote_data = await AdminService.get_banknote_overview()

        return {
            **kpi_data,
            "payments": payment_data,
            "users_breakdown": user_data,
            "banknotes_breakdown": banknote_data,
        }

    @staticmethod
    async def get_system_health():
        return await AdminService.get_system_health()

    @staticmethod
    async def get_agent_performance():
        return await AdminService.get_agent_performance()

    @staticmethod
    async def get_recent_scans(limit: int):
        return await AdminService.get_recent_scans(limit)

    @staticmethod
    async def get_pending_feedback(limit: int):
        return await AdminService.get_pending_feedback(limit)

    # ============================================================
    # SYSTEM CONFIG
    # ============================================================

    @staticmethod
    async def get_config():
        return await AdminService.get_system_config()

    @staticmethod
    async def update_config(data: dict):
        return await AdminService.update_system_config(data)

    # ============================================================
    # USERS
    # ============================================================

    @staticmethod
    async def get_users(
        page: int,
        limit: int,
        search: str,
        role: str,
        status: str,
        provider: str,
    ):
        return await AdminService.get_admin_users(
            page=page,
            limit=limit,
            search=search,
            role=role,
            status=status,
            provider=provider,
        )

    @staticmethod
    async def get_user_detail(user_id: str):
        return await AdminService.get_admin_user_detail(user_id)

    @staticmethod
    async def update_user(user_id: str, data: dict):
        return await AdminService.update_admin_user(user_id, data)

    @staticmethod
    async def update_user_role(user_id: str, role: str):
        return await AdminService.update_user_role(user_id, role)

    @staticmethod
    async def update_user_status(user_id: str, data: dict):
        return await AdminService.update_user_status(user_id, data)

    @staticmethod
    async def delete_user(user_id: str, current_admin: User):
        return await AdminService.delete_admin_user(user_id, current_admin)

    # ============================================================
    # TOKEN PACKAGES
    # ============================================================

    @staticmethod
    async def get_token_packages(search=None, status="all"):
        return await AdminService.get_token_packages(
            search=search,
            status=status,
        )

    @staticmethod
    async def create_token_package(payload: dict):
        return await AdminService.create_token_package(payload)

    @staticmethod
    async def update_token_package(package_id: str, payload: dict):
        return await AdminService.update_token_package(package_id, payload)

    @staticmethod
    async def toggle_token_package(package_id: str):
        return await AdminService.toggle_token_package(package_id)

    @staticmethod
    async def delete_token_package(package_id: str):
        return await AdminService.delete_token_package(package_id)

    # ============================================================
    # TRANSACTIONS
    # ============================================================

    @staticmethod
    async def get_transactions(
        page: int,
        limit: int,
        search: str,
        status: str,
        gateway: str,
    ):
        return await AdminService.get_transactions(
            page=page,
            limit=limit,
            search=search,
            status=status,
            gateway=gateway,
        )

    @staticmethod
    async def get_transaction_detail(tx_id: str):
        return await AdminService.get_transaction_detail(tx_id)

    @staticmethod
    async def update_transaction_status(tx_id: str, new_status: str):
        return await AdminService.update_transaction_status(tx_id, new_status)

    @staticmethod
    async def mark_transaction_paid(tx_id: str):
        return await AdminService.mark_transaction_paid(tx_id)

    @staticmethod
    async def cancel_transaction(tx_id: str):
        return await AdminService.cancel_transaction(tx_id)

    @staticmethod
    async def delete_transaction(tx_id: str):
        return await AdminService.delete_transaction(tx_id)

    # ============================================================
    # FEEDBACKS
    # ============================================================

    @staticmethod
    async def get_feedbacks(
        page: int,
        limit: int,
        search: str,
        type: str,
        status: str,
        priority: str,
        rating: str,
    ):
        return await AdminService.get_feedbacks(
            page=page,
            limit=limit,
            search=search,
            feedback_type=type,
            status=status,
            priority=priority,
            rating=rating,
        )

    @staticmethod
    async def get_feedback_detail(fb_id: str):
        return await AdminService.get_feedback_detail(fb_id)

    @staticmethod
    async def update_feedback_status(fb_id: str, new_status: str):
        return await AdminService.update_feedback_status(fb_id, new_status)

    @staticmethod
    async def update_feedback_priority(fb_id: str, priority: str):
        return await AdminService.update_feedback_priority(fb_id, priority)

    @staticmethod
    async def reply_feedback(fb_id: str, reply_msg: str, status: str):
        return await AdminService.reply_feedback(fb_id, reply_msg, status)

    @staticmethod
    async def delete_feedback(fb_id: str):
        return await AdminService.delete_feedback(fb_id)

    # ============================================================
    # RECOGNITION RESULTS
    # ============================================================

    @staticmethod
    async def get_all_results():
        return await AdminService.get_all_results()

    @staticmethod
    async def delete_result(id: str):
        return await AdminService.delete_result(id)

    @staticmethod
    async def review_result(id: str):
        return await AdminService.review_result(id)

    @staticmethod
    async def rerun_result(id: str):
        return await AdminService.rerun_result(id)

    # ============================================================
    # BANKNOTES
    # ============================================================

    @staticmethod
    async def get_all_banknotes():
        return await AdminService.get_all_banknotes()

    @staticmethod
    async def create_banknote(data: dict):
        return await AdminService.create_banknote(data)

    @staticmethod
    async def update_banknote(id: str, data: dict):
        return await AdminService.update_banknote(id, data)

    @staticmethod
    async def delete_banknote(id: str):
        return await AdminService.delete_banknote(id)

    # ============================================================
    # CURRENCY RATES
    # ============================================================

    @staticmethod
    async def get_currency_rates(
        search: str = "",
        status: str = "all",
        source: str = "all",
        override: str = "all",
        stale: str = "all",
    ):
        """
        Lấy danh sách tỷ giá cho Admin.

        Router/frontend có thể gửi đủ:
        search, status, source, override, stale.

        Nhưng CurrencyService.get_admin_currency_rates() trong project hiện tại
        có thể chưa nhận đủ các tham số đó. Vì vậy phải lọc kwargs trước khi gọi.
        """
        params = {
            "search": search or "",
            "status": status or "all",
            "source": source or "all",
            "override": override or "all",
            "stale": stale or "all",
        }

        kwargs = _filter_supported_kwargs(
            CurrencyService.get_admin_currency_rates,
            params,
        )

        return await _maybe_await(
            CurrencyService.get_admin_currency_rates(**kwargs)
        )

    @staticmethod
    async def get_all_currency_rates():
        params = {
            "search": "",
            "status": "all",
            "source": "all",
            "override": "all",
            "stale": "all",
        }

        kwargs = _filter_supported_kwargs(
            CurrencyService.get_admin_currency_rates,
            params,
        )

        return await _maybe_await(
            CurrencyService.get_admin_currency_rates(**kwargs)
        )

    @staticmethod
    async def create_currency_rate(data: dict):
        if hasattr(CurrencyService, "create_currency_rate"):
            return await _maybe_await(
                CurrencyService.create_currency_rate(data)
            )

        raise AttributeError(
            "CurrencyService.create_currency_rate is not implemented"
        )

    @staticmethod
    async def update_currency_rate(id: str, data: dict):
        if hasattr(CurrencyService, "update_currency_rate"):
            return await _maybe_await(
                CurrencyService.update_currency_rate(id, data)
            )

        raise AttributeError(
            "CurrencyService.update_currency_rate is not implemented"
        )

    @staticmethod
    async def delete_currency_rate(id: str):
        if hasattr(CurrencyService, "delete_currency_rate"):
            return await _maybe_await(
                CurrencyService.delete_currency_rate(id)
            )

        raise AttributeError(
            "CurrencyService.delete_currency_rate is not implemented"
        )

    @staticmethod
    async def sync_currency_rates():
        if hasattr(CurrencyService, "sync_market_rates"):
            return await _maybe_await(
                CurrencyService.sync_market_rates()
            )

        if hasattr(CurrencyService, "sync_currency_rates"):
            return await _maybe_await(
                CurrencyService.sync_currency_rates()
            )

        raise AttributeError(
            "CurrencyService sync function is not implemented"
        )

    @staticmethod
    async def get_sync_logs():
        if hasattr(CurrencyService, "get_sync_logs"):
            return await _maybe_await(CurrencyService.get_sync_logs())

        logs = (
            await CurrencyRateSyncLog.find_all()
            .sort("-started_at")
            .limit(50)
            .to_list()
        )

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

    # ============================================================
    # AGENTS
    # ============================================================

    @staticmethod
    async def get_agents_overview():
        return await AdminService.get_agents_overview()

    @staticmethod
    async def get_agents_status():
        return await AdminService.get_agents_status()

    @staticmethod
    async def test_agent(agent_key: str):
        return await AdminService.test_agent(agent_key)

    # ============================================================
    # AGENTS CONFIG
    # ============================================================

    @staticmethod
    async def get_agents_config():
        return await AdminService.get_agents_config()

    @staticmethod
    async def update_agents_config(data: dict):
        return await AdminService.update_agents_config(data)

    @staticmethod
    async def get_aggregator_config():
        return await AdminService.get_aggregator_config()

    @staticmethod
    async def update_aggregator_config(data: dict):
        return await AdminService.update_aggregator_config(data)

    @staticmethod
    async def get_ai_model_config():
        return await AdminService.get_ai_model_config()

    @staticmethod
    async def update_ai_model_config(data: dict):
        return await AdminService.update_ai_model_config(data)

    @staticmethod
    async def get_llm_config():
        return await AdminService.get_llm_config()

    @staticmethod
    async def update_llm_config(data: dict):
        return await AdminService.update_llm_config(data)

    @staticmethod
    async def get_google_lens_config():
        return await AdminService.get_google_lens_config()

    @staticmethod
    async def update_google_lens_config(data: dict):
        return await AdminService.update_google_lens_config(data)

    # ============================================================
    # SYSTEM SETTINGS
    # ============================================================

    @staticmethod
    async def get_system_settings():
        return await AdminService.get_system_settings()

    @staticmethod
    async def update_system_settings(data: dict):
        return await AdminService.update_system_settings(data)

    # ============================================================
    # SYSTEM LOGS
    # ============================================================

    @staticmethod
    async def get_system_logs(
        page: int,
        limit: int,
        level: str,
        module: str,
        search: str,
    ):
        return await AdminService.get_system_logs(
            page=page,
            limit=limit,
            level=level,
            module=module,
            search=search,
        )

    @staticmethod
    async def clear_system_logs():
        return await AdminService.clear_system_logs()

    @staticmethod
    async def export_system_logs():
        return await AdminService.export_system_logs()

    @staticmethod
    async def get_system_log_detail(log_id: str):
        return await AdminService.get_system_log_detail(log_id)