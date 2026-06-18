import asyncio
import hashlib
import os
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import inspect

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
    import os

    def detect_banknote_objects(image_bytes: bytes, max_objects: int = 5):
        crops = detect_and_crop_banknotes(image_bytes)
        
        ENABLE_AG0_CHECKER = os.getenv("ENABLE_AG0_CHECKER", "true").lower() == "true"
        ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK = os.getenv(
            "ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK",
            "false"
        ).lower() == "true"

        if crops:
            final_crops = crops
        elif ENABLE_AG0_CHECKER and not ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK:
            final_crops = []
        else:
            final_crops = [image_bytes]
            
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
            for index, crop in enumerate(final_crops[:max_objects])
        ]

from app.utils.cloudinary_handler import upload_image_to_cloudinary
from app.agents.agent_1_openai import run_agent1_openai
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
SERVER_ROOT = Path(__file__).resolve().parents[2]
TASK_IMAGE_UPLOAD_DIR = SERVER_ROOT / "uploads" / "recognition_tasks"
TASK_CLOUDINARY_UPLOAD_TIMEOUT_SECONDS = 30.0
TASK_PIPELINE_TIMEOUT_SECONDS = 180.0

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
            "consensus_trace": object_result.get("consensus_trace") or [],
            "summary": object_result.get("summary") or {},
            # AG0 Crop Checker — optional metadata field, không phá schema cũ
            "crop_checker": object_result.get("crop_checker"),
            "selected_box_reason": object_result.get("selected_box_reason"),
            "box_selection_trace": object_result.get("box_selection_trace"),
            "rejected_boxes": object_result.get("rejected_boxes") or [],
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


_EVIDENCE_INVALID_VALUES = {
    "", "none", "null", "unknown",
    "không xác định", "khong xac dinh",
    "n/a", "na", "needs review", "needs_review", "not a banknote",
}

def _is_valid_denomination(value: str) -> bool:
    val = str(value or "").strip().lower()
    if not val or val in _EVIDENCE_INVALID_VALUES:
        return False
    # Check if it looks like a valid denomination (e.g., 5000 VND, 1000 USD) or just numbers
    import re
    if re.search(r'\d+', val):
        return True
    return False

def _is_valid_country(value: str) -> bool:
    val = str(value or "").strip().lower()
    if not val or val in _EVIDENCE_INVALID_VALUES:
        return False
    return True

def _agent_has_raw_evidence(agent_data: dict) -> bool:
    """Check if an individual agent returned valid evidence."""
    if not agent_data:
        return False
    
    denom = str(agent_data.get("menh_gia") or agent_data.get("denomination") or "")
    country = str(agent_data.get("quoc_gia") or agent_data.get("country") or "")
    
    if _is_valid_denomination(denom):
        return True
        
    if _is_valid_country(country):
        features = str(agent_data.get("dac_diem_chinh") or agent_data.get("van_ban_nhin_thay") or "")
        if features and features.lower() not in _EVIDENCE_INVALID_VALUES:
            return True
            
    # Also check if it's a valid object from agent's text
    status = str(agent_data.get("status") or "").lower()
    if status in {"completed", "partial"} and (denom or country):
        return True
        
    return False

def _object_has_raw_agent_evidence(object_result: dict) -> bool:
    """Check if the object has any raw evidence from ANY agent or valid votes."""
    agent_results = object_result.get("agent_results") or []
    for agent_res in agent_results:
        raw_res = agent_res.get("result") or {}
        if _agent_has_raw_evidence(raw_res):
            return True
            
    final_res = object_result.get("final_result") or {}
    valid_votes = final_res.get("valid_votes") or []
    if len(valid_votes) > 0:
        return True
        
    return False

def _has_crop_quality_evidence(object_result: dict) -> bool:
    """Check if the crop has enough quality (not a tiny background artifact)."""
    # area_ratio, width/height
    w = object_result.get("crop_width")
    h = object_result.get("crop_height")
    source = object_result.get("crop_source") or ""
    try:
        crop_confidence = float(object_result.get("crop_confidence") or 0)
    except (TypeError, ValueError):
        crop_confidence = 0.0
    
    if w and h and w > 50 and h > 50:
        if source == "yolo" or crop_confidence > 0.5:
            return True
            
    return False


def serialize_result(record: RecognitionRequest) -> Dict[str, Any]:
    final_result = getattr(record, "final_result", None) or {}
    detected_objects = final_result.get("detected_objects") or []
    first_object = detected_objects[0] if detected_objects else {}
    uploaded_image_url = getattr(record, "uploaded_image_url", None)
    final_confidence = final_result.get("confidence")
    if final_confidence is None:
        final_confidence = final_result.get("do_tin_cay")

    return {
        "id": str(record.id),
        "user_id": getattr(record, "user_id", None),
        "uploaded_image_url": uploaded_image_url,
        "input_image_url": uploaded_image_url,
        "image_url": uploaded_image_url,
        "status": getattr(record, "status", None),
        "final_result": final_result,
        "agent_results": getattr(record, "agent_results", []) or [],
        "detected_objects": detected_objects,
        "confidence": final_confidence,
        "crop_checker": first_object.get("crop_checker"),
        "selected_box_reason": first_object.get("selected_box_reason"),
        "box_selection_trace": first_object.get("box_selection_trace"),
        "rejected_boxes": first_object.get("rejected_boxes") or [],
        "consensus_trace": first_object.get("consensus_trace") or [],
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



async def run_agent_with_timeout(agent_coro, timeout_sec: int, fallback_message: str):
    if not inspect.isawaitable(agent_coro):
        return agent_coro
    try:
        return await asyncio.wait_for(agent_coro, timeout=timeout_sec)
    except asyncio.TimeoutError:
        logger.warning("[Timeout] Agent timed out after %ss: %s", timeout_sec, fallback_message)
        return json.dumps([{
            "status": "Failed",
            "menh_gia": "Không xác định",
            "quoc_gia": "Không xác định",
            "quan_diem": f"{fallback_message} timeout after {timeout_sec}s, skipped to avoid blocking pipeline."
        }], ensure_ascii=False)
    except Exception as e:
        logger.error("[Error] Agent execution failed: %s", e)
        return json.dumps([{
            "status": "Failed",
            "menh_gia": "Không xác định",
            "quoc_gia": "Không xác định",
            "quan_diem": f"{fallback_message} execution failed: {str(e)[:100]}"
        }], ensure_ascii=False)


class RecognitionService:
    @staticmethod
    async def update_task(
        task: RecognitionTask,
        stage: str,
        progress: int,
        status_value: Optional[str] = None,
    ) -> RecognitionTask:
        if status_value:
            task.status = status_value
        task.stage = stage
        task.progress = max(0, min(progress, 100))
        task.updated_at = now_utc()
        await task.save()
        return task

    @staticmethod
    async def fail_task(
        task: RecognitionTask,
        stage: str,
        error_message: str,
    ) -> RecognitionTask:
        task.status = "failed"
        task.stage = stage or "failed"
        task.progress = 100
        task.error_message = str(error_message or "Recognition task failed.")[:1000]
        task.finished_at = now_utc()
        task.updated_at = now_utc()
        await task.save()
        return task

    @staticmethod
    async def save_task_input_image(
        task: RecognitionTask,
        image_bytes: bytes,
    ) -> str:
        if not image_bytes:
            raise ValueError("Input image is empty.")

        await RecognitionService.update_task(task, "uploading_image", 10)

        def _write_input_image() -> str:
            TASK_IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256(image_bytes).hexdigest()[:16]
            file_path = TASK_IMAGE_UPLOAD_DIR / f"{task.id}_{digest}.jpg"
            file_path.write_bytes(image_bytes)
            return file_path.relative_to(SERVER_ROOT).as_posix()

        image_path = await asyncio.to_thread(_write_input_image)
        task.input_image_path = image_path
        task.stage = "image_saved"
        task.progress = 25
        task.updated_at = now_utc()
        await task.save()
        logger.info("[RecognitionTask] image_saved task_id=%s path=%s", task.id, image_path)
        return image_path

    @staticmethod
    async def upload_input_image_with_timeout(
        image_bytes: bytes,
        task: Optional[RecognitionTask] = None,
    ) -> str:
        try:
            image_url = await asyncio.wait_for(
                upload_image_to_cloudinary(image_bytes),
                timeout=TASK_CLOUDINARY_UPLOAD_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "[RecognitionTask] cloudinary_upload_timeout task_id=%s timeout=%ss",
                task.id if task else None,
                TASK_CLOUDINARY_UPLOAD_TIMEOUT_SECONDS,
            )
            return ""
        except Exception as exc:
            logger.exception(
                "[RecognitionTask] cloudinary_upload_failed task_id=%s error=%s",
                task.id if task else None,
                exc,
            )
            return ""

        if task and image_url:
            task.input_image_url = image_url
            task.updated_at = now_utc()
            await task.save()
            logger.info("[RecognitionTask] cloudinary_uploaded task_id=%s", task.id)

        return image_url or ""

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
        debug_mode: bool = False,
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

        image_url = ""

        if task and not task.input_image_path:
            logger.info("[RecognitionTask] input image missing before pipeline; saving now task_id=%s", task.id)
            await RecognitionService.save_task_input_image(task, image_bytes)

        image_url = await RecognitionService.upload_input_image_with_timeout(
            image_bytes=image_bytes,
            task=task,
        )

        if task and not task.input_image_path and not image_url:
            raise RuntimeError("Input image could not be saved or uploaded.")

        if task:
            await RecognitionService.update_task(task, "cropping", 30)

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
        if task:
            await RecognitionService.update_task(task, "validating_crop_ag0", 40)

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

        # --- AG0 Crop Checker: kiểm tra xem có crop hợp lệ không ---
        # Nếu detect_banknote_objects trả [] (AG0 đã drop hết), dừng ngay,
        # không gọi Agent 1/2/3, không dùng original_fallback.
        if not detected_objects:
            logger.info(
                "[AG0] no_banknote_detected: AG0 đã drop toàn bộ crop. "
                "Không chạy Agent 1/2/3. task_id=%s",
                _task_id_log,
            )
            if task:
                task.status = "failed"
                task.stage = "failed"
                task.progress = 100
                task.result = {
                    "status": "no_banknote_detected",
                    "detected_count": 0,
                    "detected_objects": [],
                    "message": "No valid banknote region detected by crop validation.",
                    "task_id": str(task.id),
                    "uploaded_image_url": image_url or None,
                }
                task.error_message = "No valid banknote region detected by crop validation."
                task.finished_at = now_utc()
                task.updated_at = now_utc()
                await task.save()

            return {
                "status": "no_banknote_detected",
                "detected_count": 0,
                "detected_objects": [],
                "message": (
                    "Không phát hiện vùng tiền giấy hợp lệ sau khi kiểm tra YOLO/OpenCV "
                    "bằng AG0 Checker. Vui lòng chụp lại ảnh rõ hơn."
                ),
                "task_id": str(task.id) if task else None,
                "uploaded_image_url": image_url or None,
                "debug": {
                    "ag0_result": "all_candidates_dropped",
                } if debug_mode else None,
            }

        all_agent_results: List[Dict[str, Any]] = []
        detected_results: List[Dict[str, Any]] = []
        object_summaries: List[Dict[str, Any]] = []
        debug_output_objects = []

        total_objects = len(detected_objects)

        try:
            system_config = await AdminService.get_system_config()
        except Exception:
            system_config = None

        enable_agent_1 = bool(getattr(system_config, "enable_agent_1", True))
        enable_agent_2 = bool(getattr(system_config, "enable_agent_2", True))
        enable_agent_3 = bool(getattr(system_config, "enable_agent_3", True)) and bool(getattr(system_config, "lens_enabled", True))
        enable_aggregator = bool(getattr(system_config, "enable_aggregator", True))
        import os
        MAX_CONFLICT_ATTEMPTS = int(os.getenv("MAX_CONFLICT_ATTEMPTS", "3"))
        MAX_TRANSIENT_FAILURE_ATTEMPTS = int(os.getenv("MAX_TRANSIENT_FAILURE_ATTEMPTS", "2"))
        MAX_ZERO_EVIDENCE_ATTEMPTS = int(os.getenv("MAX_ZERO_EVIDENCE_ATTEMPTS", "1"))
        agent_timeout_seconds = int(getattr(system_config, "agent_timeout_seconds", 60) or 60)

        for position, object_item in enumerate(detected_objects, start=1):
            object_index = int(object_item.get("object_index") or position)
            crop_bytes = object_item.get("crop_bytes") or image_bytes

            # Phân biệt crop thật / fallback ảnh gốc để gắn metadata per object
            _crop_is_fallback = bool(object_item.get("fallback", False))

            # AG0 guard: bỏ qua object bị DROP mà vẫn lọt vào danh sách (phòng thủ)
            _ag0_action = (object_item.get("crop_checker") or {}).get("action")
            if _ag0_action == "DROP":
                logger.warning(
                    "[AG0] skipped dropped object object_index=%s (DROP action slipped through). "
                    "reason=%s",
                    object_index,
                    (object_item.get("crop_checker") or {}).get("reason", ""),
                )
                continue
            if _ag0_action:
                logger.info(
                    "[AG0] processing object_index=%s ag0_action=%s",
                    object_index, _ag0_action,
                )

            progress_base = 50 + int((position - 1) / max(total_objects, 1) * 25)
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
            
            # --- Capture debug ---
            current_debug_object = {
                "object_index": object_index,
                "crop_image_base64": object_item.get("crop_base64") or "original_image",
                "aggregator_log": {"attempts": []}
            }
            consensus_trace = []
            run_max_attempts = 1

            for attempt_idx in range(MAX_CONFLICT_ATTEMPTS):
                attempt_no = attempt_idx + 1
                logger.info("[Recognition/Object] start object_%s attempt=%s/%s", object_index, attempt_no, MAX_CONFLICT_ATTEMPTS)
                
                # --- Capture prompt & raw llm ---
                llm_debug_log = {} if debug_mode else None
                lens_debug_log = {} if debug_mode else None
                lens_v1_debug = {} if debug_mode else None
                lens_v2_debug = {} if debug_mode else None

                agent_tasks = [
                    run_agent_with_timeout(
                        run_agent1_openai(crop_bytes, debug_log=llm_debug_log),
                        agent_timeout_seconds,
                        "Agent 1 OpenAI"
                    ) if enable_agent_1
                    else build_disabled_agent_result("Agent 1 OpenAI", "Agent 1 bị tắt theo cấu hình admin."),
                    run_agent_with_timeout(
                        run_agent2_llm(crop_bytes, context_for_llm, debug_log=llm_debug_log),
                        agent_timeout_seconds,
                        "Agent 2 LLM"
                    ) if enable_agent_2
                    else build_disabled_agent_result("Agent 2 LLM", "Agent 2 bị tắt theo cấu hình admin."),
                    run_agent_with_timeout(
                        run_agent3_lens(crop_bytes, context_for_llm, debug_log=lens_debug_log),
                        35, # Hard timeout 35s cho Agent 3
                        "Agent 3 Lens"
                    ) if enable_agent_3
                    else build_disabled_agent_result("Agent 3 Lens", "Agent 3 bị tắt theo cấu hình admin."),
                ]
                
                if debug_mode and enable_agent_3:
                    from app.agents.agent_3_lens import run_agent3_lens as run_agent3_lens_v1
                    from app.agents.agent_3_lens_v2 import run_agent3_lens_v2
                    agent_tasks.append(
                        run_agent_with_timeout(
                            run_agent3_lens_v1(crop_bytes, context_for_llm, debug_log=lens_v1_debug),
                            35,
                            "Agent 3 Lens v1"
                        )
                    )
                    agent_tasks.append(
                        run_agent_with_timeout(
                            run_agent3_lens_v2(crop_bytes, context_for_llm, debug_log=lens_v2_debug),
                            35,
                            "Agent 3 Lens v2"
                        )
                    )

                try:
                    results = await asyncio.gather(*agent_tasks, return_exceptions=True)
                except Exception as exc:
                    logger.error("[Pipeline] unexpected gather error: %s", exc)
                    results = [exc for _ in agent_tasks]

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
                        "agent": "OpenAI",
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
                    final_consensus = await run_aggregator(r1, r2, r3)
                    pattern = final_consensus.get("consensus_pattern", "unknown")
                    
                    if pattern in ["1-1-1", "conflict", "1-valid-only"]:
                        current_max_attempts = MAX_CONFLICT_ATTEMPTS
                    elif pattern == "transient_error":
                        current_max_attempts = MAX_TRANSIENT_FAILURE_ATTEMPTS
                    elif pattern in ["0/3", "not_banknote_or_unclear", "zero_evidence"]:
                        current_max_attempts = MAX_ZERO_EVIDENCE_ATTEMPTS
                    else:
                        current_max_attempts = 1
                        
                    logger.info(
                        "[ConsensusRetry] object_%s attempt=%s/%s pattern=%s matched_agents=%s", 
                        object_index, attempt_no, current_max_attempts, pattern, final_consensus.get('matched_agents')
                    )
                    
                    final_consensus["attempts_used"] = attempt_no
                    if attempt_idx == 0:
                        run_max_attempts = current_max_attempts
                    final_consensus["max_attempts"] = run_max_attempts
                    
                    if pattern not in ["2/3", "3/3"] and attempt_no < current_max_attempts:
                        require_rerun = True
                    else:
                        require_rerun = False
                        if pattern in ["1-1-1", "conflict", "1-valid-only"]:
                            final_consensus["status"] = "consensus_failed"
                            final_consensus["quan_diem_trong_tai"] = "Không đạt đồng thuận sau 3 lần thử. Cần ảnh rõ hơn hoặc kiểm tra thủ công."
                        elif pattern == "transient_error":
                            final_consensus["status"] = "agent_error"
                            final_consensus["quan_diem_trong_tai"] = "Các agent không trả được kết quả hợp lệ do lỗi kỹ thuật sau 2 lần thử."
                        
                    final_consensus["require_rerun"] = require_rerun

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
                        "consensus_pattern": "unknown",
                        "attempts_used": attempt_no,
                        "max_attempts": 1,
                        "quan_diem_trong_tai": "Aggregator bị tắt theo cấu hình admin.",
                    }
                final_consensus["object_index"] = object_index
                
                def _get_agent_summary(raw_str, agent_name):
                    try:
                        data = json.loads(raw_str)
                        if isinstance(data, list) and len(data) > 0: data = data[0]
                        if not isinstance(data, dict): data = {}
                        return {
                            "agent": agent_name,
                            "status": data.get("status", "Failed"),
                            "country": data.get("quoc_gia", "Không xác định"),
                            "denomination": data.get("menh_gia", "Không xác định"),
                            "confidence": data.get("do_tin_cay", 0)
                        }
                    except Exception:
                        return {"agent": agent_name, "status": "Failed", "country": "Lỗi", "denomination": "Lỗi", "confidence": 0}

                trace_record = {
                    "attempt": attempt_no,
                    "max_attempts": final_consensus.get("max_attempts", 1),
                    "pattern": final_consensus.get("consensus_pattern", "unknown"),
                    "matched_agents": final_consensus.get("matched_agents", 0),
                    "decision": "retry" if final_consensus.get("require_rerun") else "completed",
                    "reason": final_consensus.get("quan_diem_trong_tai", ""),
                    "votes": [
                        _get_agent_summary(r1, "OpenAI"),
                        _get_agent_summary(r2, "LLM"),
                        _get_agent_summary(r3, "Visual Search")
                    ]
                }
                consensus_trace.append(trace_record)
                
                if debug_mode:
                    r3_v1_result = results[3] if enable_agent_3 and len(results) > 3 else None
                    r3_v2_result = results[4] if enable_agent_3 and len(results) > 4 else None

                    if "agent_1_raw" not in current_debug_object:
                        current_debug_object["agent_1_raw"] = r1
                        current_debug_object["agent_2_raw"] = llm_debug_log
                        current_debug_object["agent_3_raw"] = {"raw_result": r3, "debug_log": lens_debug_log}
                        if enable_agent_3:
                            current_debug_object["agent_3_compare"] = {
                                "v1_serpapi": {
                                    "raw_result": r3_v1_result if not isinstance(r3_v1_result, Exception) else str(r3_v1_result), 
                                    "debug_log": lens_v1_debug
                                },
                                "v2_selenium": {
                                    "raw_result": r3_v2_result if not isinstance(r3_v2_result, Exception) else str(r3_v2_result), 
                                    "debug_log": lens_v2_debug
                                }
                            }
                    
                    # Log aggregator
                    current_debug_object["aggregator_log"]["attempts"].append({
                        "attempt": attempt_no,
                        "matched_agents": final_consensus.get("matched_agents", 0),
                        "status": final_consensus.get("status"),
                        "require_rerun": final_consensus.get("require_rerun", False),
                        "votes": [v.get("vote_key") for v in final_consensus.get("valid_votes", [])],
                    })

                if final_consensus.get("require_rerun"):
                    summary_r1 = json.dumps(_get_agent_summary(r1, "OpenAI"), ensure_ascii=False)
                    summary_r2 = json.dumps(_get_agent_summary(r2, "LLM"), ensure_ascii=False)
                    summary_r3 = json.dumps(_get_agent_summary(r3, "Visual Search"), ensure_ascii=False)
                    
                    context_for_llm = f"""Previous attempt produced conflicting results.

Agent 1 OpenAI result:
{summary_r1}

Agent 2 LLM result:
{summary_r2}

Agent 3 Visual Search result:
{summary_r3}

Aggregator conclusion:
{final_consensus.get('quan_diem_trong_tai')}

Please re-check the same crop carefully. Focus on visible text, denomination numbers, country name, portrait/building, color and material. Return the same JSON schema only."""
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
                "consensus_trace": consensus_trace,
                "summary": {
                    "object_index": object_index,
                    "denomination": denomination,
                    "country": country,
                    "currency": currency,
                    "status": final_consensus.get("status") or "Completed",
                    "matched_agents": final_consensus.get("matched_agents", 0),
                },
                # AG0 Crop Checker — optional metadata (không phá schema cũ)
                "crop_checker": object_item.get("crop_checker"),
                "selected_box_reason": object_item.get("selected_box_reason"),
                "box_selection_trace": object_item.get("box_selection_trace"),
                "rejected_boxes": object_item.get("rejected_boxes") or [],
            }

            detected_results.append(object_result)

            object_summaries.append(object_result["summary"])
            
            if debug_mode:
                current_debug_object["final_result"] = final_consensus
                debug_output_objects.append(current_debug_object)

        if task:
            await RecognitionService.update_task(task, "saving_result", 90)

        # ────────────────────────────────────────────────────────────────────────
        # OBJECT FILTER: Safely filter out absolute garbage/fragments
        # ────────────────────────────────────────────────────────────────────────
        logger.info("[ObjectFilter] before count = %s", len(detected_results))
        
        before_filter_count = len(detected_results)
        
        # Check if there's any object with evidence in the entire pool
        any_has_evidence = any(
            _object_has_raw_agent_evidence(item) or _has_crop_quality_evidence(item)
            for item in detected_results
        )
        
        filtered_results = []
        dropped_objects = []
        kept_objects = []

        if any_has_evidence and before_filter_count > 1:
            for item in detected_results:
                obj_idx = item.get("object_index")
                final_res = item.get("final_result") or {}
                status_str = str(final_res.get("status") or "").lower()
                matched_agents = int(final_res.get("matched_agents") or 0)
                
                has_raw = _object_has_raw_agent_evidence(item)
                has_qual = _has_crop_quality_evidence(item)
                valid_votes_count = len(final_res.get("valid_votes") or [])
                
                logger.info(
                    "[ObjectFilter] object original_index=%s display_index=%s bbox=%s status=%s matched_agents=%s",
                    item.get("original_object_index", obj_idx), obj_idx, item.get("bbox"), status_str, matched_agents
                )
                logger.info("[ObjectFilter] raw_agent_evidence=%s", has_raw)
                logger.info("[ObjectFilter] crop_quality_evidence=%s", has_qual)
                logger.info("[ObjectFilter] valid_votes_count=%s", valid_votes_count)
                
                is_zero_evidence = not has_raw and not has_qual
                
                if is_zero_evidence:
                    logger.info("[ObjectFilter] DROP reason=zero_evidence_background")
                    dropped_objects.append(item)
                else:
                    reason = "has_raw_agent_evidence" if has_raw else "has_crop_quality_evidence"
                    logger.info("[ObjectFilter] KEEP reason=%s", reason)
                    filtered_results.append(item)
                    kept_objects.append({"original_object_index": item.get("original_object_index", obj_idx), "reason": reason})
                    
            after_filter_count = len(filtered_results)
            
            # PHASE 2: Safety Guard
            if before_filter_count >= 2 and after_filter_count == 1:
                # Trót lỡ drop về 1, cần check xem dropped object có gì vớt vát được không
                for dropped in dropped_objects:
                    d_has_raw = _object_has_raw_agent_evidence(dropped)
                    d_has_qual = _has_crop_quality_evidence(dropped)
                    if d_has_raw or d_has_qual:
                        # Restore as Needs Review
                        if "final_result" not in dropped:
                            dropped["final_result"] = {}
                        dropped["final_result"]["status"] = "Needs Review"
                        if dropped["final_result"].get("matched_agents") is None:
                            dropped["final_result"]["matched_agents"] = 0
                            
                        logger.info("[ObjectFilter] SAFETY RESTORE original_index=%s", dropped.get("original_object_index", dropped.get("object_index")))
                        filtered_results.append(dropped)
                        kept_objects.append({"original_object_index": dropped.get("original_object_index", dropped.get("object_index")), "reason": "safety_restore"})
                        
                # Cập nhật lại after_filter_count sau khi restore
                # Sắp xếp lại theo bbox Y, X cho đúng thứ tự
                filtered_results = sorted(
                    filtered_results,
                    key=lambda it: (it.get("bbox", [0,0,0,0])[1] // 50, it.get("bbox", [0,0,0,0])[0])
                )
                after_filter_count = len(filtered_results)
                
            # Cập nhật lại index (Phase 4)
            if after_filter_count > 0:
                for new_idx, item in enumerate(filtered_results, start=1):
                    # Preserve original if not already there
                    if "original_object_index" not in item:
                        item["original_object_index"] = item.get("object_index")
                        
                    item["object_index"] = new_idx
                    if "summary" in item:
                        item["summary"]["object_index"] = new_idx
                    if "final_result" in item:
                        item["final_result"]["object_index"] = new_idx
                        
                detected_results = filtered_results
            else:
                logger.warning("[ObjectFilter] filtered rỗng, rollback.")
        else:
            logger.info("[ObjectFilter] Skip filter (no evidence in any object or only 1 object)")

        logger.info("[ObjectFilter] after count = %s", len(detected_results))
        
        if debug_mode:
            final_consensus["debug_filter"] = {
                "before_filter_count": before_filter_count,
                "after_filter_count": len(detected_results),
                "dropped_objects": [
                    {
                        "original_object_index": d.get("original_object_index", d.get("object_index")),
                        "bbox": d.get("bbox"),
                        "reason": "zero_evidence_background"
                    } for d in dropped_objects if d not in filtered_results
                ],
                "kept_objects": kept_objects
            }

        public_detected_results = [
            build_public_detected_object(item) for item in detected_results
        ]
        
        object_summaries = [item.get("summary") for item in detected_results]
        first_trace_object = detected_results[0] if detected_results else {}
        box_selection_trace = first_trace_object.get("box_selection_trace")
        rejected_boxes = first_trace_object.get("rejected_boxes") or []

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
            in {"failed", "needs_better_image", "conflict", "needs review", "needs_review", "not_banknote_or_unclear"}
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
            final_consensus["box_selection_trace"] = box_selection_trace
            final_consensus["rejected_boxes"] = rejected_boxes

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
                "box_selection_trace": box_selection_trace,
                "rejected_boxes": rejected_boxes,
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

        if task:
            await RecognitionService.update_task(task, "saving_result", 95)

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
            task.status = "completed"
            task.stage = "completed"
            task.progress = 100
            task.result_id = str(record.id)
            task.result = result_data
            task.finished_at = now_utc()
            task.updated_at = now_utc()
            await task.save()

        if debug_mode:
            return {
                "input_info": {
                    "file_size_bytes": len(image_bytes),
                    "started_at": started_at.isoformat(),
                    "processing_time_ms": int((now_utc() - started_at).total_seconds() * 1000)
                },
                "objects": debug_output_objects,
                "pipeline_final_status": status_value,
                "final_db_record": result_data
            }

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
    def log_background_task_exception(task_id: str, background_job: asyncio.Task) -> None:
        try:
            exc = background_job.exception()
        except asyncio.CancelledError:
            logger.warning("[RecognitionTask] background_cancelled task_id=%s", task_id)
            return

        if exc:
            logger.error(
                "[RecognitionTask] background_unhandled_exception task_id=%s",
                task_id,
                exc_info=(type(exc), exc, exc.__traceback__),
            )

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
            progress=5,
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await task.insert()
        logger.info("[RecognitionTask] created task_id=%s user_id=%s", task.id, user.id)

        try:
            await RecognitionService.save_task_input_image(task, image_bytes)
        except Exception as exc:
            logger.exception("[RecognitionTask] image_save_failed task_id=%s", task.id)
            await RecognitionService.fail_task(
                task,
                "failed",
                f"Could not save uploaded image: {str(exc)[:300]}",
            )
            return serialize_task(task)

        background_job = asyncio.create_task(
            RecognitionService.run_recognition_background_worker(
                user_id=str(user.id),
                task_id=str(task.id),
                image_bytes=image_bytes,
            )
        )
        background_job.add_done_callback(
            lambda job: RecognitionService.log_background_task_exception(str(task.id), job)
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
            logger.error("[RecognitionTask] background_missing_task task_id=%s", task_id)
            return

        try:
            logger.info("[RecognitionTask] worker_started task_id=%s", task.id)
            user = await User.get(to_object_id(user_id))

            if not user:
                raise HTTPException(status_code=404, detail="User not found.")

            logger.info("[RecognitionTask] pipeline_started task_id=%s", task.id)
            await asyncio.wait_for(
                RecognitionService.run_pipeline(
                    user=user,
                    image_bytes=image_bytes,
                    task=task,
                ),
                timeout=TASK_PIPELINE_TIMEOUT_SECONDS
            )

        except asyncio.TimeoutError:
            logger.exception("[RecognitionTask] pipeline_timeout task_id=%s", task.id)
            task.status = "failed"
            task.stage = "failed"
            task.progress = 100
            task.error_message = "Task timeout sau 180 giây. Vui lòng quét lại."
            task.finished_at = now_utc()
            task.updated_at = now_utc()
            await task.save()
        except Exception as exc:
            logger.exception("[RecognitionTask] pipeline_failed task_id=%s", task.id)
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
