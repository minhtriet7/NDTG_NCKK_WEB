from typing import Optional
import inspect

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel

from app.controllers.admin_controller import AdminController
from app.core.dependencies import require_admin
from app.models.user_model import User
from app.schemas.admin_schema import (
    AgentsConfigSchema,
    AggregatorConfigSchema,
    AiModelConfigSchema,
    GoogleLensConfigSchema,
    LlmConfigSchema,
    SystemSettingsSchema,
    AdminUserUpdateSchema,
    AdminUserRoleUpdateSchema,
    AdminUserStatusUpdateSchema,
)


router = APIRouter()


# ============================================================
# Helpers
# ============================================================
async def maybe_await(value):
    """
    Cho phép gọi cả async function và sync function.
    Nếu value là coroutine/awaitable thì await, nếu không thì trả thẳng.
    """
    if inspect.isawaitable(value):
        return await value
    return value


def filter_supported_kwargs(func, kwargs: dict) -> dict:
    """
    Chỉ truyền các keyword mà function thật sự nhận.
    Tránh lỗi TypeError khi Controller đã đổi signature.
    Ví dụ:
    - Controller nhận get_currency_rates(search, source)
    - Router có thêm status/override/stale
    => chỉ truyền search/source.
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


# ============================================================
# Schemas nội bộ cho Router
# ============================================================
class FbStatusSchema(BaseModel):
    status: str


class FbPrioritySchema(BaseModel):
    priority: str


class FbReplySchema(BaseModel):
    admin_reply: str
    status: str = "resolved"


class TxStatusUpdateSchema(BaseModel):
    status: str


def admin_user(current_user: User = Depends(require_admin)):
    return current_user


# ============================================================
# Dashboard
# ============================================================
@router.get("/dashboard/summary")
async def get_dashboard_summary(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_dashboard_summary())


@router.get("/system/health")
async def get_system_health(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_system_health())


@router.get("/agents/performance")
async def get_agent_performance(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_agent_performance())


@router.get("/recognition/recent")
async def get_recent_scans(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_recent_scans(limit))


@router.get("/feedbacks/pending")
async def get_pending_feedback(
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_pending_feedback(limit))


# ============================================================
# Users
# ============================================================
@router.get("/users")
async def get_admin_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    search: str = "",
    role: str = "all",
    status: str = "all",
    provider: str = "all",
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.get_users(page, limit, search, role, status, provider)
    )


@router.get("/users/{user_id}")
async def get_admin_user_detail(
    user_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_user_detail(user_id))


@router.put("/users/{user_id}")
async def update_admin_user(
    user_id: str,
    data: AdminUserUpdateSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_user(user_id, data.model_dump(exclude_unset=True))
    )


@router.put("/users/{user_id}/role")
async def update_admin_user_role(
    user_id: str,
    data: AdminUserRoleUpdateSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_user_role(user_id, data.role))


@router.put("/users/{user_id}/status")
async def update_admin_user_status(
    user_id: str,
    data: AdminUserStatusUpdateSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_user_status(
            user_id,
            data.model_dump(exclude_unset=True),
        )
    )


@router.delete("/users/{user_id}")
async def delete_admin_user(
    user_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_user(user_id, current_user))


# ============================================================
# Token Packages
# ============================================================
@router.get("/token-packages")
async def get_admin_token_packages(
    search: Optional[str] = Query(default=None),
    status: str = "all",
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_token_packages(search=search, status=status))


@router.post("/token-packages")
async def create_admin_token_package(
    payload: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.create_token_package(payload))


@router.put("/token-packages/{package_id}")
async def update_admin_token_package(
    package_id: str,
    payload: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_token_package(package_id, payload))


@router.patch("/token-packages/{package_id}/toggle")
async def toggle_admin_token_package(
    package_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.toggle_token_package(package_id))


@router.delete("/token-packages/{package_id}")
async def delete_admin_token_package(
    package_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_token_package(package_id))


# ============================================================
# Transactions
# ============================================================
@router.get("/transactions")
async def get_admin_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: str = "",
    status: str = "all",
    gateway: str = "all",
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.get_transactions(page, limit, search, status, gateway)
    )


@router.get("/transactions/{tx_id}")
async def get_admin_transaction_detail(
    tx_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_transaction_detail(tx_id))


@router.put("/transactions/{tx_id}/status")
async def update_admin_transaction_status(
    tx_id: str,
    data: TxStatusUpdateSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_transaction_status(tx_id, data.status))


@router.put("/transactions/{tx_id}/mark-paid")
async def mark_admin_transaction_paid(
    tx_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.mark_transaction_paid(tx_id))


@router.put("/transactions/{tx_id}/cancel")
async def cancel_admin_transaction(
    tx_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.cancel_transaction(tx_id))


@router.delete("/transactions/{tx_id}")
async def delete_admin_transaction(
    tx_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_transaction(tx_id))


# ============================================================
# Feedbacks
# ============================================================
@router.get("/feedbacks")
async def get_admin_feedbacks(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: str = "",
    type: str = "all",
    status: str = "all",
    priority: str = "all",
    rating: str = "all",
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.get_feedbacks(
            page,
            limit,
            search,
            type,
            status,
            priority,
            rating,
        )
    )


@router.get("/feedbacks/{fb_id}")
async def get_admin_feedback_detail(
    fb_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_feedback_detail(fb_id))


@router.put("/feedbacks/{fb_id}/status")
async def update_admin_feedback_status(
    fb_id: str,
    data: FbStatusSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_feedback_status(fb_id, data.status))


@router.put("/feedbacks/{fb_id}/priority")
async def update_admin_feedback_priority(
    fb_id: str,
    data: FbPrioritySchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_feedback_priority(fb_id, data.priority))


@router.post("/feedbacks/{fb_id}/reply")
async def reply_admin_feedback(
    fb_id: str,
    data: FbReplySchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.reply_feedback(fb_id, data.admin_reply, data.status)
    )


@router.delete("/feedbacks/{fb_id}")
async def delete_admin_feedback(
    fb_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_feedback(fb_id))


# ============================================================
# Recognition Results
# ============================================================
@router.get("/results")
async def get_admin_results(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_all_results())


@router.get("/results/{id}")
async def get_admin_result_detail(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_result_detail(id))


@router.delete("/results/{id}")
async def delete_admin_result(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_result(id))


@router.put("/results/{id}/review")
async def mark_result_reviewed(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.review_result(id))


@router.post("/results/{id}/rerun")
async def rerun_recognition(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.rerun_result(id))


# ============================================================
# Banknotes
# ============================================================
@router.get("/banknotes")
async def get_admin_banknotes(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_all_banknotes())


@router.post("/banknotes")
async def create_banknote(
    data: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.create_banknote(data))


@router.put("/banknotes/{id}")
async def update_banknote(
    id: str,
    data: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_banknote(id, data))


@router.delete("/banknotes/{id}")
async def delete_banknote(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_banknote(id))


@router.post("/banknotes/{id}/upload-image")
async def upload_banknote_image(
    id: str,
    file: UploadFile = File(...),
    side: str = Query(default="front"),
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.upload_banknote_image(id, file, side))


# ============================================================
# Currency Rates
# ============================================================
@router.get("/currency-rates")
async def get_admin_currency_rates(
    search: Optional[str] = Query(default=""),
    status: Optional[str] = Query(default="all"),
    source: Optional[str] = Query(default="all"),
    override: Optional[str] = Query(default="all"),
    stale: Optional[str] = Query(default="all"),
    current_user: User = Depends(admin_user),
):
    """
    Endpoint an toàn cho trang Admin Currency Rates.

    Lý do:
    - Frontend có thể gửi search/source/status/override/stale.
    - AdminController.get_currency_rates ở từng phiên bản có thể chỉ nhận một số tham số.
    - filter_supported_kwargs sẽ chỉ truyền đúng tham số Controller đang hỗ trợ.
    """
    params = {
        "search": search or "",
        "status": status or "all",
        "source": source or "all",
        "override": override or "all",
        "stale": stale or "all",
    }

    kwargs = filter_supported_kwargs(AdminController.get_currency_rates, params)

    return await maybe_await(AdminController.get_currency_rates(**kwargs))


@router.post("/currency-rates")
async def create_currency_rate(
    data: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.create_currency_rate(data))


@router.post("/currency-rates/sync")
async def sync_currency_rates(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.sync_currency_rates())


@router.get("/currency-rates/sync-logs")
async def get_sync_logs(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_sync_logs())


@router.put("/currency-rates/{id}")
async def update_currency_rate(
    id: str,
    data: dict,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.update_currency_rate(id, data))


@router.delete("/currency-rates/{id}")
async def delete_currency_rate(
    id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.delete_currency_rate(id))


# ============================================================
# Agents Overview / Status
# ============================================================
@router.get("/agents/overview")
async def get_agents_overview(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_agents_overview())


@router.get("/agents/status")
async def get_agents_status(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_agents_status())


@router.post("/agents/test/{agent_key}")
async def test_agent(
    agent_key: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.test_agent(agent_key))


# ============================================================
# Agents Config
# ============================================================
@router.get("/config/agents")
async def get_agents_config(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_agents_config())


@router.put("/config/agents")
async def update_agents_config(
    data: AgentsConfigSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_agents_config(data.model_dump(exclude_unset=True))
    )


@router.get("/config/aggregator")
async def get_aggregator_config(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_aggregator_config())


@router.put("/config/aggregator")
async def update_aggregator_config(
    data: AggregatorConfigSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_aggregator_config(data.model_dump(exclude_unset=True))
    )


@router.get("/config/ai-model")
async def get_ai_model_config(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_ai_model_config())


@router.put("/config/ai-model")
async def update_ai_model_config(
    data: AiModelConfigSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_ai_model_config(data.model_dump(exclude_unset=True))
    )


@router.get("/config/llm")
async def get_llm_config(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_llm_config())


@router.put("/config/llm")
async def update_llm_config(
    data: LlmConfigSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_llm_config(data.model_dump(exclude_unset=True))
    )


@router.get("/config/google-lens")
async def get_google_lens_config(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_google_lens_config())


@router.put("/config/google-lens")
async def update_google_lens_config(
    data: GoogleLensConfigSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_google_lens_config(data.model_dump(exclude_unset=True))
    )


@router.get("/config/{module}")
async def get_module_config(
    module: str,
    current_user: User = Depends(admin_user),
):
    config = await maybe_await(AdminController.get_config())
    data = config.model_dump() if hasattr(config, "model_dump") else dict(config)

    if module == "ai-model":
        data["enabled"] = data.get("ai_enabled", True)
    elif module == "llm":
        data["enabled"] = data.get("llm_enabled", True)
    elif module == "google-lens":
        data["enabled"] = data.get("lens_enabled", True)

    return data


@router.put("/config/{module}")
async def update_module_config(
    module: str,
    payload: dict,
    current_user: User = Depends(admin_user),
):
    if module == "ai-model" and "enabled" in payload:
        payload["ai_enabled"] = payload.pop("enabled")
    elif module == "llm" and "enabled" in payload:
        payload["llm_enabled"] = payload.pop("enabled")
    elif module == "google-lens" and "enabled" in payload:
        payload["lens_enabled"] = payload.pop("enabled")

    return await maybe_await(AdminController.update_config(payload))


# ============================================================
# Settings
# ============================================================
@router.get("/settings")
async def get_system_settings(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.get_system_settings())


@router.put("/settings")
async def update_system_settings(
    payload: SystemSettingsSchema,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.update_system_settings(payload.model_dump(exclude_unset=True))
    )


# ============================================================
# System Logs
# ============================================================
@router.get("/logs")
async def get_system_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    level: str = "all",
    module: str = "all",
    search: str = "",
    current_user: User = Depends(admin_user),
):
    return await maybe_await(
        AdminController.get_system_logs(page, limit, level, module, search)
    )


@router.delete("/logs/clear")
async def clear_system_logs(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.clear_system_logs())


@router.get("/logs/export")
async def export_system_logs(current_user: User = Depends(admin_user)):
    return await maybe_await(AdminController.export_system_logs())


@router.get("/logs/{log_id}")
async def get_system_log_detail(
    log_id: str,
    current_user: User = Depends(admin_user),
):
    return await maybe_await(AdminController.get_system_log_detail(log_id))
