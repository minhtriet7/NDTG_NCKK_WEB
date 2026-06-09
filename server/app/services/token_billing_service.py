import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from app.models.user_model import User
from app.models.token_usage_model import TokenUsage

try:
    from app.models.config_model import SystemConfig
except Exception:
    SystemConfig = None

try:
    from token_count import TokenCount
except Exception:
    TokenCount = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


class TokenBillingService:
    @staticmethod
    async def get_config():
        if SystemConfig is None:
            return None

        try:
            return await SystemConfig.find_one()
        except Exception:
            return None

    @staticmethod
    def count_tokens(text: Any, model_name: str = "gpt-3.5-turbo") -> int:
        if text is None:
            return 0

        text_value = str(text)

        if not text_value.strip():
            return 0

        if TokenCount is not None:
            try:
                counter = TokenCount(model_name=model_name)
                return int(counter.num_tokens_from_string(text_value))
            except Exception:
                pass

        # Fallback nếu token-count lỗi hoặc chưa cài:
        # ước lượng gần đúng: 1 token ~ 4 ký tự tiếng Anh, tiếng Việt có thể dao động.
        return max(1, math.ceil(len(text_value) / 4))

    @staticmethod
    def apply_rounding(value: float, rounding_mode: str = "ceil") -> int:
        if rounding_mode == "floor":
            return math.floor(value)

        if rounding_mode == "round":
            return round(value)

        return math.ceil(value)

    @staticmethod
    def calculate_billable_ai_tokens(
        input_tokens: int,
        output_tokens: int,
        tax_rate: float,
    ) -> int:
        total_ai_tokens = safe_int(input_tokens) + safe_int(output_tokens)
        return math.ceil(total_ai_tokens * (1 + safe_float(tax_rate, 0.0)))

    @staticmethod
    def calculate_system_tokens(
        input_tokens: int,
        output_tokens: int,
        config=None,
    ) -> Dict[str, int]:
        token_cost_per_scan = safe_int(getattr(config, "token_cost_per_scan", 1), 1)
        token_billing_mode = getattr(config, "token_billing_mode", "fixed")
        dynamic_enabled = bool(
            getattr(config, "dynamic_ai_token_billing_enabled", False)
        )

        tax_rate = safe_float(getattr(config, "token_billing_tax_rate", 0.10), 0.10)
        rate = safe_int(getattr(config, "ai_token_to_system_token_rate", 1000), 1000)
        rounding_mode = getattr(config, "token_billing_rounding_mode", "ceil")

        min_tokens = safe_int(getattr(config, "min_tokens_per_scan", 1), 1)
        max_tokens = safe_int(getattr(config, "max_tokens_per_scan", 10), 10)

        total_ai_tokens = safe_int(input_tokens) + safe_int(output_tokens)
        billable_ai_tokens = TokenBillingService.calculate_billable_ai_tokens(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            tax_rate=tax_rate,
        )

        if token_billing_mode != "dynamic" or not dynamic_enabled:
            system_tokens = token_cost_per_scan
        else:
            raw_system_tokens = billable_ai_tokens / max(rate, 1)
            system_tokens = TokenBillingService.apply_rounding(
                raw_system_tokens,
                rounding_mode,
            )

        system_tokens = max(system_tokens, min_tokens)
        system_tokens = min(system_tokens, max_tokens)

        return {
            "input_tokens": safe_int(input_tokens),
            "output_tokens": safe_int(output_tokens),
            "total_ai_tokens": total_ai_tokens,
            "billable_ai_tokens": billable_ai_tokens,
            "system_tokens_charged": system_tokens,
            "tax_rate": tax_rate,
            "ai_token_to_system_token_rate": rate,
        }

    @staticmethod
    async def estimate_agent_usage(
        agent_name: str,
        input_text: Any,
        output_text: Any,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        config = await TokenBillingService.get_config()
        token_count_model = (
            model_name
            or getattr(config, "token_count_model", None)
            or "gpt-3.5-turbo"
        )

        input_tokens = TokenBillingService.count_tokens(
            input_text,
            model_name=token_count_model,
        )
        output_tokens = TokenBillingService.count_tokens(
            output_text,
            model_name=token_count_model,
        )

        calculated = TokenBillingService.calculate_system_tokens(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            config=config,
        )

        return {
            "agent_name": agent_name,
            "provider": provider,
            "model_name": token_count_model,
            "input_tokens": calculated["input_tokens"],
            "output_tokens": calculated["output_tokens"],
            "total_ai_tokens": calculated["total_ai_tokens"],
            "billable_ai_tokens": calculated["billable_ai_tokens"],
            "system_tokens_charged": calculated["system_tokens_charged"],
            "tax_rate": calculated["tax_rate"],
            "ai_token_to_system_token_rate": calculated[
                "ai_token_to_system_token_rate"
            ],
            "metadata": metadata or {},
        }

    @staticmethod
    async def charge_user_for_scan(
        user: User,
        recognition_id: Optional[str] = None,
        agent_usages: Optional[List[Dict[str, Any]]] = None,
        reason: str = "AI banknote recognition scan",
        force_fixed_cost: Optional[int] = None,
    ) -> Dict[str, Any]:
        config = await TokenBillingService.get_config()

        token_billing_enabled = bool(
            getattr(config, "token_billing_enabled", True)
        )

        if not token_billing_enabled:
            return {
                "charged": False,
                "system_tokens_charged": 0,
                "balance_before": safe_int(getattr(user, "token_balance", 0)),
                "balance_after": safe_int(getattr(user, "token_balance", 0)),
                "reason": "Token billing disabled by administrator.",
                "usage_logs": [],
            }

        save_logs = bool(getattr(config, "save_token_usage_logs", True))

        agent_usages = agent_usages or []

        billing_mode = getattr(config, "token_billing_mode", "fixed")
        token_cost_per_scan = safe_int(
            force_fixed_cost
            if force_fixed_cost is not None
            else getattr(config, "token_cost_per_scan", 1),
            1,
        )

        if billing_mode == "dynamic" and bool(
            getattr(config, "dynamic_ai_token_billing_enabled", False)
        ):
            total_input_tokens = sum(
                safe_int(item.get("input_tokens", 0)) for item in agent_usages
            )
            total_output_tokens = sum(
                safe_int(item.get("output_tokens", 0)) for item in agent_usages
            )

            calculated = TokenBillingService.calculate_system_tokens(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                config=config,
            )

            system_tokens_charged = calculated["system_tokens_charged"]
            billable_ai_tokens = calculated["billable_ai_tokens"]
            total_ai_tokens = calculated["total_ai_tokens"]
            tax_rate = calculated["tax_rate"]
            rate = calculated["ai_token_to_system_token_rate"]
        else:
            total_input_tokens = sum(
                safe_int(item.get("input_tokens", 0)) for item in agent_usages
            )
            total_output_tokens = sum(
                safe_int(item.get("output_tokens", 0)) for item in agent_usages
            )
            total_ai_tokens = total_input_tokens + total_output_tokens
            tax_rate = safe_float(getattr(config, "token_billing_tax_rate", 0.10), 0.10)
            billable_ai_tokens = TokenBillingService.calculate_billable_ai_tokens(
                total_input_tokens,
                total_output_tokens,
                tax_rate,
            )
            rate = safe_int(getattr(config, "ai_token_to_system_token_rate", 1000), 1000)
            system_tokens_charged = token_cost_per_scan

        balance_before = safe_int(getattr(user, "token_balance", 0), 0)

        if balance_before < system_tokens_charged:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Insufficient tokens. Required {system_tokens_charged}, "
                    f"available {balance_before}."
                ),
            )

        user.token_balance = balance_before - system_tokens_charged

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

        balance_after = safe_int(getattr(user, "token_balance", 0), 0)

        usage_logs = []

        if save_logs:
            main_usage = TokenUsage(
                user_id=str(user.id),
                recognition_id=recognition_id,
                usage_type="scan",
                agent_name="system",
                provider=None,
                model_name=getattr(config, "token_count_model", "gpt-3.5-turbo"),
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_ai_tokens=total_ai_tokens,
                tax_rate=tax_rate,
                billable_ai_tokens=billable_ai_tokens,
                ai_token_to_system_token_rate=rate,
                system_tokens_charged=system_tokens_charged,
                balance_before=balance_before,
                balance_after=balance_after,
                billing_mode=billing_mode,
                rounding_mode=getattr(config, "token_billing_rounding_mode", "ceil"),
                status="charged",
                reason=reason,
                metadata={
                    "agent_usages": agent_usages,
                },
            )
            await main_usage.insert()
            usage_logs.append(main_usage)

            for item in agent_usages:
                agent_usage = TokenUsage(
                    user_id=str(user.id),
                    recognition_id=recognition_id,
                    usage_type="llm_agent",
                    agent_name=item.get("agent_name"),
                    provider=item.get("provider"),
                    model_name=item.get("model_name"),
                    input_tokens=safe_int(item.get("input_tokens", 0)),
                    output_tokens=safe_int(item.get("output_tokens", 0)),
                    total_ai_tokens=safe_int(item.get("total_ai_tokens", 0)),
                    tax_rate=safe_float(item.get("tax_rate", tax_rate), tax_rate),
                    billable_ai_tokens=safe_int(item.get("billable_ai_tokens", 0)),
                    ai_token_to_system_token_rate=safe_int(
                        item.get("ai_token_to_system_token_rate", rate),
                        rate,
                    ),
                    system_tokens_charged=0,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    billing_mode=billing_mode,
                    rounding_mode=getattr(
                        config,
                        "token_billing_rounding_mode",
                        "ceil",
                    ),
                    status="logged",
                    reason="Agent token usage log",
                    metadata=item.get("metadata", {}),
                )
                await agent_usage.insert()
                usage_logs.append(agent_usage)

        return {
            "charged": True,
            "system_tokens_charged": system_tokens_charged,
            "balance_before": balance_before,
            "balance_after": balance_after,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "total_ai_tokens": total_ai_tokens,
            "billable_ai_tokens": billable_ai_tokens,
            "tax_rate": tax_rate,
            "billing_mode": billing_mode,
            "usage_logs": [str(item.id) for item in usage_logs],
        }

    @staticmethod
    async def refund_scan_tokens(
        user: User,
        recognition_id: Optional[str],
        tokens_to_refund: int,
        reason: str = "Refund due to system error",
    ) -> Dict[str, Any]:
        tokens_to_refund = safe_int(tokens_to_refund, 0)

        if tokens_to_refund <= 0:
            return {
                "refunded": False,
                "tokens_refunded": 0,
                "reason": "No tokens to refund.",
            }

        balance_before = safe_int(getattr(user, "token_balance", 0), 0)
        user.token_balance = balance_before + tokens_to_refund

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

        balance_after = safe_int(getattr(user, "token_balance", 0), 0)

        usage = TokenUsage(
            user_id=str(user.id),
            recognition_id=recognition_id,
            usage_type="refund",
            agent_name="system",
            input_tokens=0,
            output_tokens=0,
            total_ai_tokens=0,
            billable_ai_tokens=0,
            system_tokens_charged=-tokens_to_refund,
            balance_before=balance_before,
            balance_after=balance_after,
            status="refunded",
            reason=reason,
            metadata={},
        )
        await usage.insert()

        return {
            "refunded": True,
            "tokens_refunded": tokens_to_refund,
            "balance_before": balance_before,
            "balance_after": balance_after,
            "usage_log_id": str(usage.id),
        }

    @staticmethod
    async def list_user_token_usages(
        user_id: str,
        limit: int = 50,
    ) -> Dict[str, Any]:
        usages = (
            await TokenUsage.find(TokenUsage.user_id == str(user_id))
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

        return {
            "items": [TokenBillingService.serialize_usage(item) for item in usages],
            "total": len(usages),
        }

    @staticmethod
    async def list_all_token_usages(
        limit: int = 100,
    ) -> Dict[str, Any]:
        usages = (
            await TokenUsage.find_all()
            .sort("-created_at")
            .limit(limit)
            .to_list()
        )

        return {
            "items": [TokenBillingService.serialize_usage(item) for item in usages],
            "total": len(usages),
        }

    @staticmethod
    def serialize_usage(usage: TokenUsage) -> Dict[str, Any]:
        return {
            "id": str(usage.id),
            "user_id": usage.user_id,
            "recognition_id": usage.recognition_id,
            "transaction_id": usage.transaction_id,
            "usage_type": usage.usage_type,
            "agent_name": usage.agent_name,
            "provider": usage.provider,
            "model_name": usage.model_name,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "total_ai_tokens": usage.total_ai_tokens,
            "tax_rate": usage.tax_rate,
            "billable_ai_tokens": usage.billable_ai_tokens,
            "ai_token_to_system_token_rate": usage.ai_token_to_system_token_rate,
            "system_tokens_charged": usage.system_tokens_charged,
            "balance_before": usage.balance_before,
            "balance_after": usage.balance_after,
            "billing_mode": usage.billing_mode,
            "rounding_mode": usage.rounding_mode,
            "status": usage.status,
            "reason": usage.reason,
            "metadata": usage.metadata,
            "created_at": usage.created_at,
        }