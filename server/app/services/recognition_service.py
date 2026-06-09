import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.user_model import User
from app.models.recognition_model import RecognitionRequest
from app.models.recognition_task_model import RecognitionTask
from app.services.token_billing_service import TokenBillingService
from app.core.logger import get_logger

logger = get_logger(__name__)

try:
    from app.utils.image_processing import detect_banknote_objects
except ModuleNotFoundError:
    from app.utils.image_checker import detect_and_crop_banknotes

    def detect_banknote_objects(image_bytes: bytes, max_objects: int = 5):
        crops = detect_and_crop_banknotes(image_bytes)
        return [
            {
                "object_index": index + 1,
                "bbox": None,
                "crop_bytes": crop,
                "crop_base64": None,
                "confidence": 0.25,
                "width": None,
                "height": None,
                "source": "legacy_cropper",
            }
            for index, crop in enumerate((crops or [image_bytes])[:max_objects])
        ]

from app.utils.cloudinary_handler import upload_image_to_cloudinary
from app.agents.agent_1_ml import run_agent1_yolo
from app.agents.agent_2_llm import run_agent2_llm
from app.agents.agent_3_selector import run_agent3_lens
from app.services.admin_service import AdminService
from app.agents.agent_aggregator import run_aggregator

# Fallback constant khi SystemConfig chưa có trong DB.
# Phải khớp với config_model.py SystemConfig.max_retry_count default.
MAX_CONSENSUS_RETRIES = 2

# Tối đa N tờ tiền mỗi ảnh. Thay hardcode 5.
MAX_BANKNOTES_PER_IMAGE = 5

_CROP_LOG_PREFIX = "[Recognition/Crop]"

def _agent_status(agent_data):
    return agent_data.get("status") if isinstance(agent_data, dict) else "Failed"

def _agent_denomination(agent_data):
    if not isinstance(agent_data, dict):
        return "Unknown"
    return agent_data.get("menh_gia") or agent_data.get("denomination") or "Unknown"


def build_disabled_agent_result(agent_name: str, reason: str) -> str:
    return json.dumps([
        {
            "quoc_gia": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": reason,
            "quan_diem": reason,
            "phuong_phap": agent_name,
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Disabled",
        }
    ], ensure_ascii=False)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")


def parse_agent_json(raw_value: Any, fallback_message: str) -> Dict[str, Any]:
    if isinstance(raw_value, Exception):
        return {
            "status": "Failed",
            "error": str(raw_value),
            "message": fallback_message,
        }

    if isinstance(raw_value, dict):
        return raw_value

    try:
        parsed = json.loads(raw_value)

        if isinstance(parsed, list):
            return parsed[0] if parsed else {}

        if isinstance(parsed, dict):
            return parsed

        return {
            "raw": str(raw_value),
            "message": fallback_message,
        }

    except Exception:
        return {
            "raw": str(raw_value),
            "message": fallback_message,
        }


def sanitize_for_storage(value: Any, keep_crop_base64: bool = True) -> Any:
    """
    Return JSON-safe data without circular references.
    - crop_bytes is never serializable, so remove it.
    - crop_base64 can be kept for UI preview, or stripped for token billing.
    - raw_text can be very large; truncate it when storing/billing to keep payload sane.
    """
    if isinstance(value, dict):
        output: Dict[str, Any] = {}
        for key, item in value.items():
            if key == "crop_bytes":
                continue
            if key == "crop_base64" and not keep_crop_base64:
                continue
            if key == "raw_text" and isinstance(item, str):
                output[key] = item[:3000]
                continue
            output[key] = sanitize_for_storage(item, keep_crop_base64=keep_crop_base64)
        return output

    if isinstance(value, list):
        return [sanitize_for_storage(item, keep_crop_base64=keep_crop_base64) for item in value]

    if isinstance(value, tuple):
        return [sanitize_for_storage(item, keep_crop_base64=keep_crop_base64) for item in value]

    return value


def build_public_detected_object(object_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build one object result for API/UI without any self-reference.
    This fixes: ValueError: Circular reference detected.
    """
    final_result = dict(object_result.get("final_result") or {})
    final_result.pop("detected_objects", None)
    final_result.pop("summary", None)

    return sanitize_for_storage(
        {
            "object_index": object_result.get("object_index"),
            "bbox": object_result.get("bbox"),
            "crop_base64": object_result.get("crop_base64"),
            "crop_confidence": object_result.get("crop_confidence"),
            "crop_width": object_result.get("crop_width"),
            "crop_height": object_result.get("crop_height"),
            "crop_source": object_result.get("crop_source"),
            "fallback": object_result.get("fallback"),
            "final_result": final_result,
            "agent_results": object_result.get("agent_results") or [],
            "summary": object_result.get("summary") or {},
        },
        keep_crop_base64=True,
    )


def is_object_resolved(object_result: Dict[str, Any]) -> bool:
    final_result = object_result.get("final_result") or {}
    status_text = str(final_result.get("status") or "").lower()
    matched_agents = int(final_result.get("matched_agents") or final_result.get("so_luong_dong_thuan") or 0)

    if final_result.get("require_rerun"):
        return False

    # needs_better_image là terminal: pipeline đã kết thúc với object này, không retry thêm.
    if status_text == "needs_better_image":
        return True

    if status_text in {"failed", "conflict", "needs review", "needs_review"}:
        return False

    return matched_agents >= 2


def serialize_result(record: RecognitionRequest) -> Dict[str, Any]:
    return {
        "id": str(record.id),
        "user_id": getattr(record, "user_id", None),
        "uploaded_image_url": getattr(record, "uploaded_image_url", None),
        "status": getattr(record, "status", None),
        "final_result": getattr(record, "final_result", None),
        "agent_results": getattr(record, "agent_results", []) or [],
        "conversion_result": getattr(record, "conversion_result", None),
        "task_id": getattr(record, "task_id", None),
        "processing_time_ms": getattr(record, "processing_time_ms", None),
        "error_message": getattr(record, "error_message", None),

        # Token billing fields
        "token_usage": getattr(record, "token_usage", {}) or {},
        "system_tokens_charged": getattr(record, "system_tokens_charged", 0),
        "input_tokens": getattr(record, "input_tokens", 0),
        "output_tokens": getattr(record, "output_tokens", 0),
        "total_ai_tokens": getattr(record, "total_ai_tokens", 0),
        "billable_ai_tokens": getattr(record, "billable_ai_tokens", 0),
        "billing_mode": getattr(record, "billing_mode", None),
        "balance_before": getattr(record, "balance_before", None),
        "balance_after": getattr(record, "balance_after", None),

        "created_at": getattr(record, "created_at", None),
        "updated_at": getattr(record, "updated_at", None),
    }


def serialize_task(task: RecognitionTask) -> Dict[str, Any]:
    return {
        "task_id": str(task.id),
        "id": str(task.id),
        "user_id": getattr(task, "user_id", None),
        "status": getattr(task, "status", "processing"),
        "stage": getattr(task, "stage", "queued"),
        "progress": getattr(task, "progress", 0),
        "input_image_url": getattr(task, "input_image_url", None),
        "input_image_path": getattr(task, "input_image_path", None),
        "result_id": getattr(task, "result_id", None),
        "result": getattr(task, "result", None),
        "error_message": getattr(task, "error_message", None),
        "created_at": getattr(task, "created_at", None),
        "updated_at": getattr(task, "updated_at", None),
        "finished_at": getattr(task, "finished_at", None),
    }


def build_agent_usage_input(
    agent_name: str,
    context_for_llm: str,
    agent_data: Dict[str, Any],
) -> Dict[str, Any]:
    if agent_name == "LLM":
        input_text = (
            "Analyze banknote image with OCR/context. "
            f"Additional context: {context_for_llm or ''}"
        )
        provider = "llm"
        model_name = agent_data.get("model") or agent_data.get("model_name")
    elif agent_name == "Aggregator":
        input_text = "Aggregate YOLO, LLM and Lens results into a final banknote JSON."
        provider = "aggregator"
        model_name = agent_data.get("model") or agent_data.get("model_name")
    elif agent_name == "Lens":
        input_text = "Visual search and external reference matching for banknote image."
        provider = "lens"
        model_name = agent_data.get("model") or agent_data.get("model_name")
    else:
        input_text = "ML/DL banknote visual detection."
        provider = "ml"
        model_name = agent_data.get("model") or agent_data.get("model_name")

    output_text = json.dumps(sanitize_for_storage(agent_data, keep_crop_base64=False), ensure_ascii=False)

    return {
        "agent_name": agent_name,
        "input_text": input_text,
        "output_text": output_text,
        "provider": provider,
        "model_name": model_name,
        "metadata": {
            "status": agent_data.get("status"),
            "confidence": agent_data.get("confidence"),
            "currency": agent_data.get("currency") or agent_data.get("loai_tien"),
            "denomination": agent_data.get("denomination") or agent_data.get("menh_gia"),
        },
    }


class RecognitionService:
    @staticmethod
    async def update_task(
        task: RecognitionTask,
        stage: str,
        progress: int,
    ) -> RecognitionTask:
        task.stage = stage
        task.progress = max(0, min(progress, 100))
        task.updated_at = now_utc()
        await task.save()
        return task

    @staticmethod
    async def build_agent_usages(
        agent_results: List[Dict[str, Any]],
        final_consensus: Dict[str, Any],
        context_for_llm: str,
    ) -> List[Dict[str, Any]]:
        usages: List[Dict[str, Any]] = []

        for item in agent_results:
            agent_name = item.get("agent") or item.get("agent_name") or "unknown_agent"
            agent_data = item.get("data") or item

            if not isinstance(agent_data, dict):
                agent_data = {"raw": str(agent_data)}

            usage_input = build_agent_usage_input(
                agent_name=agent_name,
                context_for_llm=context_for_llm,
                agent_data=agent_data,
            )

            usage = await TokenBillingService.estimate_agent_usage(
                agent_name=usage_input["agent_name"],
                input_text=usage_input["input_text"],
                output_text=usage_input["output_text"],
                provider=usage_input["provider"],
                model_name=usage_input["model_name"],
                metadata=usage_input["metadata"],
            )
            usages.append(usage)

        if final_consensus:
            aggregator_input = build_agent_usage_input(
                agent_name="Aggregator",
                context_for_llm=context_for_llm,
                agent_data=final_consensus,
            )

            aggregator_usage = await TokenBillingService.estimate_agent_usage(
                agent_name=aggregator_input["agent_name"],
                input_text=aggregator_input["input_text"],
                output_text=aggregator_input["output_text"],
                provider=aggregator_input["provider"],
                model_name=aggregator_input["model_name"],
                metadata=aggregator_input["metadata"],
            )
            usages.append(aggregator_usage)

        return usages

    @staticmethod
    async def run_pipeline(
        user: User,
        image_bytes: bytes,
        task: Optional[RecognitionTask] = None,
    ) -> Dict[str, Any]:
        _task_id_log = task.id if task else "None"
        logger.info("[Recognition] Start scan task_id=%s", _task_id_log)

        started_at = now_utc()

        if len(image_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size exceeds 5MB.")

        # Check tối thiểu trước khi chạy AI.
        # Billing thật sẽ được trừ sau khi có kết quả, theo config admin.
        if int(getattr(user, "token_balance", 0) or 0) < 1:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Tài khoản không đủ Token. Vui lòng nạp thêm.",
            )

        if task:
            await RecognitionService.update_task(task, "preprocessing", 10)

        try:
            detected_objects = detect_banknote_objects(
                image_bytes,
                max_objects=MAX_BANKNOTES_PER_IMAGE,
            )
        except Exception:
            detected_objects = [
                {
                    "object_index": 1,
                    "bbox": None,
                    "crop_bytes": image_bytes,
                    "crop_base64": None,
                    "confidence": 0.2,
                    "width": None,
                    "height": None,
                    "source": "fallback_exception",
                    "fallback": True,
                }
            ]

        # --- [3.7 + 3.8 C] Log & Trích xuất Metadata Crop ---
        _all_fallback = all(bool(o.get("fallback")) for o in detected_objects)
        _raw_candidate_count = max(
            (int(o.get("raw_candidate_count") or 0) for o in detected_objects), default=0
        )
        _too_many = _raw_candidate_count > MAX_BANKNOTES_PER_IMAGE

        logger.info(
            "%s total_detected=%s all_fallback=%s raw_candidate_count=%s",
            _CROP_LOG_PREFIX, len(detected_objects), _all_fallback, _raw_candidate_count
        )
        for _o in detected_objects:
            logger.info(
                "[Recognition/Object] object_index=%s source=%s confidence=%s fallback=%s bbox=%s",
                _o.get('object_index'), _o.get('source'), _o.get('confidence'), _o.get('fallback', False), _o.get('bbox')
            )

        if _all_fallback:
            logger.warning(
                "%s WARN: Không tìm được crop heuristic, đang dùng ảnh gốc fallback.", _CROP_LOG_PREFIX
            )
        if _too_many:
            logger.warning(
                "%s WARN: Ảnh có quá nhiều vùng (%s). Chỉ xử lý %s vùng lớn nhất.",
                _CROP_LOG_PREFIX, _raw_candidate_count, MAX_BANKNOTES_PER_IMAGE
            )
        # -----------------------------------------------------

        if not detected_objects:
            detected_objects = [
                {
                    "object_index": 1,
                    "bbox": None,
                    "crop_bytes": image_bytes,
                    "crop_base64": None,
                    "confidence": 0.2,
                    "width": None,
                    "height": None,
                    "source": "fallback_empty",
                    "fallback": True,
                }
            ]

        if task:
            await RecognitionService.update_task(task, "uploading_image", 20)

        image_url = await upload_image_to_cloudinary(image_bytes)

        if task:
            task.input_image_url = image_url
            task.updated_at = now_utc()
            await task.save()

        all_agent_results: List[Dict[str, Any]] = []
        detected_results: List[Dict[str, Any]] = []
        object_summaries: List[Dict[str, Any]] = []

        total_objects = len(detected_objects)

        try:
            system_config = await AdminService.get_system_config()
        except Exception:
            system_config = None

        enable_agent_1 = bool(getattr(system_config, "enable_agent_1", True))
        enable_agent_2 = bool(getattr(system_config, "enable_agent_2", True))
        enable_agent_3 = bool(getattr(system_config, "enable_agent_3", True)) and bool(getattr(system_config, "lens_enabled", True))
        enable_aggregator = bool(getattr(system_config, "enable_aggregator", True))
        max_retries = int(getattr(system_config, "max_retry_count", MAX_CONSENSUS_RETRIES) or MAX_CONSENSUS_RETRIES)
        agent_timeout_seconds = int(getattr(system_config, "agent_timeout_seconds", 60) or 60)

        for position, object_item in enumerate(detected_objects, start=1):
            object_index = int(object_item.get("object_index") or position)
            crop_bytes = object_item.get("crop_bytes") or image_bytes

            # Phân biệt crop thật / fallback ảnh gốc để gắn metadata per object
            _crop_is_fallback = bool(object_item.get("fallback", False))

            progress_base = 20 + int((position - 1) / max(total_objects, 1) * 55)
            if task:
                await RecognitionService.update_task(
                    task,
                    f"running_agents_object_{object_index}",
                    min(75, progress_base),
                )

            context_for_llm = (
                f"You are analyzing banknote object #{object_index} cropped from the original image. "
                "Only identify the banknote inside this crop. "
                "Do not use information from other banknotes outside this crop."
            )

            final_consensus: Dict[str, Any] = {}
            object_agent_results: List[Dict[str, Any]] = []

            for attempt in range(max_retries + 1):
                logger.info("[Recognition/Object] start object_%s attempt=%s/%s", object_index, attempt, max_retries)

                agent_tasks = [
                    run_agent1_yolo(crop_bytes)
                    if enable_agent_1
                    else build_disabled_agent_result("Agent 1 ML/DL", "Agent 1 bị tắt theo cấu hình admin."),
                    run_agent2_llm(crop_bytes, context_for_llm)
                    if enable_agent_2
                    else build_disabled_agent_result("Agent 2 LLM", "Agent 2 bị tắt theo cấu hình admin."),
                    run_agent3_lens(crop_bytes, context_for_llm)
                    if enable_agent_3
                    else build_disabled_agent_result("Agent 3 Lens", "Agent 3 bị tắt theo cấu hình admin."),
                ]

                try:
                    results = await asyncio.wait_for(
                        asyncio.gather(*agent_tasks, return_exceptions=True),
                        timeout=agent_timeout_seconds,
                    )
                except asyncio.TimeoutError:
                    results = [
                        TimeoutError(f"Agents timeout after {agent_timeout_seconds}s"),
                        TimeoutError(f"Agents timeout after {agent_timeout_seconds}s"),
                        TimeoutError(f"Agents timeout after {agent_timeout_seconds}s"),
                    ]

                raw_1 = results[0]
                raw_2 = results[1]
                raw_3 = results[2]

                agent1_data = parse_agent_json(raw_1, "Agent 1 failed.")
                agent2_data = parse_agent_json(raw_2, "Agent 2 failed.")
                agent3_data = parse_agent_json(raw_3, "Agent 3 failed.")

                _st1 = _agent_status(agent1_data)
                _st2 = _agent_status(agent2_data)
                _st3 = _agent_status(agent3_data)

                _dm1 = _agent_denomination(agent1_data)
                _dm2 = _agent_denomination(agent2_data)
                _dm3 = _agent_denomination(agent3_data)

                logger.info("[Agent1] done object_%s status=%s denomination=%s", object_index, _st1, _dm1)
                logger.info("[Agent2] done object_%s status=%s denomination=%s", object_index, _st2, _dm2)
                logger.info("[Agent3] done object_%s status=%s denomination=%s", object_index, _st3, _dm3)

                for agent_data in [agent1_data, agent2_data, agent3_data]:
                    if isinstance(agent_data, dict):
                        agent_data["object_index"] = object_index

                object_agent_results = [
                    {
                        "agent": "YOLO",
                        "object_index": object_index,
                        "data": agent1_data,
                    },
                    {
                        "agent": "LLM",
                        "object_index": object_index,
                        "data": agent2_data,
                    },
                    {
                        "agent": "Lens",
                        "object_index": object_index,
                        "data": agent3_data,
                    },
                ]

                r1 = json.dumps([agent1_data], ensure_ascii=False)
                r2 = json.dumps([agent2_data], ensure_ascii=False)
                r3 = json.dumps([agent3_data], ensure_ascii=False)

                if task:
                    await RecognitionService.update_task(
                        task,
                        f"aggregating_object_{object_index}",
                        min(85, progress_base + 10),
                    )

                if enable_aggregator:
                    is_final_attempt = (attempt >= max_retries)
                    final_consensus = await run_aggregator(r1, r2, r3, is_final_attempt=is_final_attempt)
                    logger.info(
                        "[Aggregator] done object_%s status=%s matched_agents=%s", 
                        object_index, final_consensus.get('status'), final_consensus.get('matched_agents')
                    )
                else:
                    final_consensus = {
                        "require_rerun": False,
                        "method": "aggregator_disabled",
                        "status": "Needs Review",
                        "matched_agents": 0,
                        "so_luong_dong_thuan": 0,
                        "final_denomination": None,
                        "final_agent": None,
                        "valid_votes": [],
                        "quan_diem_trong_tai": "Aggregator bị tắt theo cấu hình admin.",
                    }
                final_consensus["object_index"] = object_index

                if final_consensus.get("require_rerun") and attempt < max_retries:
                    context_for_llm = (
                        f"Object #{object_index} has conflicting agent results. "
                        f"YOLO result: {r1}. Lens result: {r3}. "
                        "Analyze the crop again carefully and return one strict JSON result."
                    )
                    await asyncio.sleep(1)
                    continue

                break

            all_agent_results.extend(object_agent_results)

            denomination = (
                final_consensus.get("final_denomination")
                or final_consensus.get("menh_gia")
                or final_consensus.get("denomination")
                or "Needs review"
            )

            country = (
                final_consensus.get("quoc_gia")
                or final_consensus.get("country")
                or final_consensus.get("final_country")
                or "Không xác định"
            )

            currency = None
            if isinstance(denomination, str):
                parts = denomination.upper().split()
                currency = parts[-1] if len(parts) >= 2 else None

            object_result = {
                "object_index": object_index,
                "bbox": object_item.get("bbox"),
                # Metadata crop per object
                "crop_is_fallback": _crop_is_fallback,
                "crop_warning": (
                    "Không tìm được vùng tiền rõ ràng bằng crop heuristic, đang phân tích ảnh gốc."
                    if _crop_is_fallback else None
                ),
                "crop_base64": object_item.get("crop_base64"),
                "crop_confidence": object_item.get("confidence"),
                "crop_width": object_item.get("width"),
                "crop_height": object_item.get("height"),
                "crop_source": object_item.get("source"),
                "fallback": bool(object_item.get("fallback", False)),
                "final_result": final_consensus,
                "agent_results": object_agent_results,
                "summary": {
                    "object_index": object_index,
                    "denomination": denomination,
                    "country": country,
                    "currency": currency,
                    "status": final_consensus.get("status") or "Completed",
                    "matched_agents": final_consensus.get("matched_agents", 0),
                },
            }

            detected_results.append(object_result)
            object_summaries.append(object_result["summary"])

        if task:
            await RecognitionService.update_task(task, "building_result", 88)

        public_detected_results = [
            build_public_detected_object(item) for item in detected_results
        ]

        resolved_count = sum(1 for item in detected_results if is_object_resolved(item))

        # 1. TÍNH TOÁN CÁC BIẾN LOGIC NO_BANKNOTE_DETECTED TRƯỚC
        _any_has_valid_votes = any(
            len((item.get("final_result") or {}).get("valid_votes") or []) > 0
            for item in detected_results
        )
        _all_crops_were_fallback = all(
            bool(item.get("crop_is_fallback")) for item in detected_results
        )
        _all_terminal_negative = all(
            str((item.get("final_result") or {}).get("status") or "").lower()
            in {"failed", "needs_better_image", "conflict", "needs review", "needs_review"}
            for item in detected_results
        )
        _no_banknote_detected = (
            _all_crops_were_fallback
            and not _any_has_valid_votes
            and _all_terminal_negative
        )

        # 2. TÍNH TOÁN COUNTERS CHO MULTI-OBJECT STATUS
        completed_count = sum(
            1 for item in detected_results
            if str((item.get("final_result") or {}).get("status") or "").lower() == "completed"
        )
        needs_image_count = sum(
            1 for item in detected_results
            if str((item.get("final_result") or {}).get("status") or "").lower() == "needs_better_image"
        )
        # Giữ any_needs_image cho single-object compat
        any_needs_image = needs_image_count > 0
        needs_review = resolved_count < len(detected_results)
        # Partial: ít nhất 1 completed nhưng không phải tất cả Completed
        is_partial = completed_count > 0 and completed_count < len(detected_results)

        # 3. TẠO FINAL_CONSENSUS
        # Nếu chỉ có 1 object thì vẫn giữ result cũ để frontend/mobile cũ không vỡ.
        # Quan trọng: KHÔNG gắn detected_results gốc vào chính final_consensus,
        # vì detected_results[0].final_result chính là final_consensus -> circular reference.
        if len(detected_results) == 1:
            final_consensus = dict(detected_results[0].get("final_result") or {})
            final_consensus["mode"] = "single_object"
            final_consensus["detected_count"] = 1
            final_consensus["detected_objects"] = public_detected_results
            final_consensus["summary"] = object_summaries

            # Metadata Crop & Too Many luôn có mặt
            final_consensus["crop_is_fallback"] = _all_crops_were_fallback
            final_consensus["too_many_banknotes_detected"] = _too_many
            final_consensus["raw_candidate_count"] = _raw_candidate_count
            final_consensus["max_processed_banknotes"] = MAX_BANKNOTES_PER_IMAGE

            _warnings = []
            if _all_crops_were_fallback:
                _warnings.append("Không tìm được vùng tiền rõ ràng bằng crop heuristic, đang phân tích ảnh gốc.")
            if _too_many:
                _warnings.append(
                    f"Ảnh có nhiều vùng nghi là tờ tiền ({_raw_candidate_count} vùng). "
                    f"Hệ thống chỉ xử lý tối đa {MAX_BANKNOTES_PER_IMAGE} vùng rõ nhất."
                )
            if _warnings:
                final_consensus["crop_warning"] = " | ".join(_warnings)
        else:
            _multi_status = (
                "Completed"
                if completed_count == len(detected_results)
                else "needs_better_image"
                if completed_count == 0 and needs_image_count == len(detected_results)
                else "Needs Review"
            )
            _nbi_note = (
                f"{needs_image_count} object(s) need a clearer image. "
                if needs_image_count > 0 else ""
            )
            final_consensus = {
                "mode": "multi_object",
                "status": _multi_status,
                "detected_count": len(detected_results),
                "detected_objects": public_detected_results,
                "summary": object_summaries,
                "menh_gia": f"{len(detected_results)} banknotes detected",
                "final_denomination": f"{len(detected_results)} banknotes detected",
                "quoc_gia": "Multiple",
                "quan_diem_trong_tai": (
                    f"Detected {len(detected_results)} banknote object(s). "
                    f"Completed: {completed_count}/{len(detected_results)}. "
                    + _nbi_note
                    + "Each object was analyzed separately by YOLO, LLM, Lens, then aggregated."
                ),
                "method": "multi_object_pipeline",
                "matched_agents": resolved_count,
                "resolved_objects": resolved_count,
                "total_objects": len(detected_results),
                "completed_objects": completed_count,
                "needs_better_image_objects": needs_image_count,
                "partial": is_partial,
                "object_status_summary": {
                    "completed": completed_count,
                    "needs_better_image": needs_image_count,
                    "needs_review": len(detected_results) - completed_count - needs_image_count,
                    "total": len(detected_results),
                },
                # Partial multi-object không retry tổng pipeline
                "require_rerun": False,

                # Metadata Crop & Too Many luôn có mặt
                "crop_is_fallback": _all_crops_were_fallback,
                "too_many_banknotes_detected": _too_many,
                "raw_candidate_count": _raw_candidate_count,
                "max_processed_banknotes": MAX_BANKNOTES_PER_IMAGE,
            }

            _warnings = []
            if _all_crops_were_fallback:
                _warnings.append("Không tìm được vùng tiền rõ ràng bằng crop heuristic, đang phân tích ảnh gốc.")
            if _too_many:
                _warnings.append(
                    f"Ảnh có nhiều vùng nghi là tờ tiền ({_raw_candidate_count} vùng). "
                    f"Hệ thống chỉ xử lý tối đa {MAX_BANKNOTES_PER_IMAGE} vùng rõ nhất."
                )
            if _warnings:
                final_consensus["crop_warning"] = " | ".join(_warnings)

        # 4. CẬP NHẬT THEO NO_BANKNOTE_DETECTED
        if _no_banknote_detected:
            logger.info(
                "%s CONCLUSION: no_banknote_detected — "
                "Crop heuristic fail + không có valid vote + tất cả object terminal tiêu cực.", _CROP_LOG_PREFIX
            )
            final_consensus["status"] = "no_banknote_detected"
            final_consensus["require_rerun"] = False
            final_consensus["message"] = "Không phát hiện tiền giấy trong ảnh. Vui lòng chụp rõ toàn bộ tờ tiền giấy."
            final_consensus["final_denomination"] = None

        final_consensus = sanitize_for_storage(final_consensus, keep_crop_base64=True)

        # Ưu tiên: no_banknote_detected > logic tách single/multi
        if _no_banknote_detected:
            status_value = "no_banknote_detected"
        elif len(detected_results) == 1:
            # Single-object: giữ behavior cũ chính xác
            if any_needs_image:
                status_value = "needs_better_image"
            elif needs_review:
                status_value = "Needs Review"
            elif str(final_consensus.get("status") or "").lower() in {"failed", "conflict", "needs review", "needs_review"}:
                status_value = "Needs Review"
            elif final_consensus.get("require_rerun"):
                status_value = "Needs Review"
            else:
                status_value = "Completed"
        else:
            # Multi-object: dùng counter thay vì any()
            if completed_count == len(detected_results):
                status_value = "Completed"
            elif completed_count == 0 and needs_image_count == len(detected_results):
                # Tất cả đều cần ảnh tốt hơn
                status_value = "needs_better_image"
            elif completed_count > 0:
                # Partial: có ít nhất 1 completed → Needs Review, không sập toàn bộ
                status_value = "Needs Review"
            else:
                status_value = "Needs Review"

        logger.info(
            "[Recognition] final status=%s require_rerun=%s detected_count=%s",
            status_value, final_consensus.get("require_rerun"), len(detected_results)
        )

        agent_usages = await RecognitionService.build_agent_usages(
            agent_results=all_agent_results,
            final_consensus=final_consensus,
            context_for_llm="Multi-object banknote recognition pipeline",
        )

        record = RecognitionRequest(
            user_id=str(user.id),
            uploaded_image_url=image_url or "https://via.placeholder.com/400",
            status=status_value,
            final_result=final_consensus,
            agent_results=all_agent_results,
            task_id=str(task.id) if task else None,
            processing_time_ms=int((now_utc() - started_at).total_seconds() * 1000),
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await record.insert()

        try:
            billing_result = await TokenBillingService.charge_user_for_scan(
                user=user,
                recognition_id=str(record.id),
                agent_usages=agent_usages,
                reason="Banknote recognition completed",
            )

            record.token_usage = billing_result
            record.system_tokens_charged = int(
                billing_result.get("system_tokens_charged", 0) or 0
            )
            record.input_tokens = int(billing_result.get("input_tokens", 0) or 0)
            record.output_tokens = int(billing_result.get("output_tokens", 0) or 0)
            record.total_ai_tokens = int(
                billing_result.get("total_ai_tokens", 0) or 0
            )
            record.billable_ai_tokens = int(
                billing_result.get("billable_ai_tokens", 0) or 0
            )
            record.billing_mode = billing_result.get("billing_mode")
            record.balance_before = billing_result.get("balance_before")
            record.balance_after = billing_result.get("balance_after")
            record.updated_at = now_utc()
            await record.save()

        except HTTPException as exc:
            record.status = "Failed"
            record.error_message = f"Billing failed: {exc.detail}"
            record.updated_at = now_utc()
            await record.save()
            raise exc

        result_data = serialize_result(record)

        if task:
            task.status = "done"
            task.stage = "done"
            task.progress = 100
            task.result_id = str(record.id)
            task.result = result_data
            task.finished_at = now_utc()
            task.updated_at = now_utc()
            await task.save()

        return result_data

    async def process_banknote(user: User, image_bytes: bytes) -> RecognitionRequest:
        result = await RecognitionService.run_pipeline(
            user=user,
            image_bytes=image_bytes,
            task=None,
        )

        record = await RecognitionRequest.get(to_object_id(result["id"]))

        if not record:
            raise HTTPException(status_code=500, detail="Recognition result was not saved.")

        return record

    @staticmethod
    async def start_recognition_task(user: User, image_bytes: bytes) -> Dict[str, Any]:
        if int(getattr(user, "token_balance", 0) or 0) < 1:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Tài khoản không đủ Token. Vui lòng nạp thêm.",
            )

        task = RecognitionTask(
            user_id=str(user.id),
            status="processing",
            stage="queued",
            progress=0,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await task.insert()

        asyncio.create_task(
            RecognitionService.run_recognition_background_worker(
                user_id=str(user.id),
                task_id=str(task.id),
                image_bytes=image_bytes,
            )
        )

        return serialize_task(task)

    @staticmethod
    async def run_recognition_background_worker(
        user_id: str,
        task_id: str,
        image_bytes: bytes,
    ) -> None:
        task = await RecognitionTask.get(to_object_id(task_id))

        _task_id_log = task.id if task else "None"
        logger.info("[Recognition] Start scan task_id=%s", _task_id_log)

        if not task:
            return

        try:
            user = await User.get(to_object_id(user_id))

            if not user:
                raise HTTPException(status_code=404, detail="User not found.")

            await RecognitionService.run_pipeline(
                user=user,
                image_bytes=image_bytes,
                task=task,
            )

        except Exception as exc:
            task.status = "failed"
            task.stage = "failed"
            task.progress = 100
            task.error_message = str(exc)
            task.finished_at = now_utc()
            task.updated_at = now_utc()
            await task.save()

    @staticmethod
    async def get_task_status(user: User, task_id: str) -> Dict[str, Any]:
        task = await RecognitionTask.get(to_object_id(task_id))

        if not task:
            raise HTTPException(status_code=404, detail="Recognition task not found.")

        if task.user_id != str(user.id) and getattr(user, "role", "user") != "admin":
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this task.",
            )

        return serialize_task(task)

    @staticmethod
    async def get_recognition_by_id(user_id: str, record_id: str) -> Dict[str, Any]:
        result = await RecognitionRequest.get(to_object_id(record_id))

        if not result:
            raise HTTPException(status_code=404, detail="Recognition result not found.")

        if result.user_id != str(user_id):
            raise HTTPException(
                status_code=403,
                detail="You do not have access to this result.",
            )

        return serialize_result(result)