import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.models.user_model import User
from app.models.recognition_model import RecognitionRequest
from app.models.recognition_task_model import RecognitionTask

try:
    from app.utils.image_processing import detect_and_crop_banknotes
except ModuleNotFoundError:
    from app.utils.image_checker import detect_and_crop_banknotes

from app.utils.cloudinary_handler import upload_image_to_cloudinary
from app.agents.agent_1_ml import run_agent1_yolo
from app.agents.agent_2_llm import run_agent2_llm
from app.agents.agent_3_lens import run_agent3_lens
from app.agents.agent_aggregator import run_aggregator


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


class RecognitionService:
    @staticmethod
    async def update_task(task: RecognitionTask, stage: str, progress: int) -> RecognitionTask:
        task.stage = stage
        task.progress = max(0, min(progress, 100))
        task.updated_at = now_utc()
        await task.save()
        return task

    @staticmethod
    async def run_pipeline(user: User, image_bytes: bytes, task: Optional[RecognitionTask] = None) -> Dict[str, Any]:
        started_at = now_utc()

        if len(image_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size exceeds 5MB.")

        if int(getattr(user, "token_balance", 0) or 0) < 1:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Tài khoản không đủ Token. Vui lòng nạp thêm.",
            )

        if task:
            await RecognitionService.update_task(task, "preprocessing", 15)

        try:
            cropped_images = detect_and_crop_banknotes(image_bytes)
            if not cropped_images:
                cropped_images = [image_bytes]
        except Exception:
            cropped_images = [image_bytes]

        best_image_bytes = cropped_images[0]

        if task:
            await RecognitionService.update_task(task, "uploading_image", 25)

        image_url = await upload_image_to_cloudinary(image_bytes)

        if task:
            task.input_image_url = image_url
            task.updated_at = now_utc()
            await task.save()
            await RecognitionService.update_task(task, "running_agents", 35)

        context_for_llm = ""
        max_retries = 1
        final_consensus: Dict[str, Any] = {}
        agent_results: List[Dict[str, Any]] = []

        for attempt in range(max_retries + 1):
            results = await asyncio.gather(
                run_agent1_yolo(best_image_bytes),
                run_agent2_llm(best_image_bytes, context_for_llm),
                run_agent3_lens(best_image_bytes),
                return_exceptions=True,
            )

            raw_1 = results[0]
            raw_2 = results[1]
            raw_3 = results[2]

            agent1_data = parse_agent_json(raw_1, "Agent 1 failed.")
            agent2_data = parse_agent_json(raw_2, "Agent 2 failed.")
            agent3_data = parse_agent_json(raw_3, "Agent 3 failed.")

            agent_results = [
                {
                    "agent": "YOLO",
                    "data": agent1_data,
                },
                {
                    "agent": "LLM",
                    "data": agent2_data,
                },
                {
                    "agent": "Lens",
                    "data": agent3_data,
                },
            ]

            r1 = json.dumps([agent1_data], ensure_ascii=False)
            r2 = json.dumps([agent2_data], ensure_ascii=False)
            r3 = json.dumps([agent3_data], ensure_ascii=False)

            if task:
                await RecognitionService.update_task(task, "aggregating", 70)

            final_consensus = await run_aggregator(r1, r2, r3)

            if final_consensus.get("require_rerun") and attempt < max_retries:
                context_for_llm = (
                    f"YOLO result: {r1}. Lens result: {r3}. "
                    "Analyze again carefully and return a strict JSON result."
                )
                await asyncio.sleep(1)
                continue

            break

        status_value = "Completed"

        if final_consensus.get("status") in {"Failed", "Conflict"}:
            status_value = "Needs Review"

        if final_consensus.get("require_rerun"):
            status_value = "Needs Review"

        record = RecognitionRequest(
            user_id=str(user.id),
            uploaded_image_url=image_url or "https://via.placeholder.com/400",
            status=status_value,
            final_result=final_consensus,
            agent_results=agent_results,
            task_id=str(task.id) if task else None,
            processing_time_ms=int((now_utc() - started_at).total_seconds() * 1000),
            created_at=now_utc(),
            updated_at=now_utc(),
        )

        await record.insert()

        user.token_balance = int(getattr(user, "token_balance", 0) or 0) - 1

        if hasattr(user, "updated_at"):
            user.updated_at = now_utc()

        await user.save()

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

    @staticmethod
    async def process_banknote(user: User, image_bytes: bytes) -> RecognitionRequest:
        result = await RecognitionService.run_pipeline(user=user, image_bytes=image_bytes, task=None)
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
    async def run_recognition_background_worker(user_id: str, task_id: str, image_bytes: bytes) -> None:
        task = await RecognitionTask.get(to_object_id(task_id))

        if not task:
            return

        try:
            user = await User.get(to_object_id(user_id))

            if not user:
                raise HTTPException(status_code=404, detail="User not found.")

            await RecognitionService.run_pipeline(user=user, image_bytes=image_bytes, task=task)

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
            raise HTTPException(status_code=403, detail="You do not have access to this task.")

        return serialize_task(task)

    @staticmethod
    async def get_recognition_by_id(user_id: str, record_id: str) -> Dict[str, Any]:
        result = await RecognitionRequest.get(to_object_id(record_id))

        if not result:
            raise HTTPException(status_code=404, detail="Recognition result not found.")

        if result.user_id != str(user_id):
            raise HTTPException(status_code=403, detail="You do not have access to this result.")

        return serialize_result(result)