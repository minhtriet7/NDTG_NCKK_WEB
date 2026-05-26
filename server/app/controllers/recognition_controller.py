from fastapi import UploadFile, HTTPException

from app.models.user_model import User
from app.services.recognition_service import RecognitionService


def _derive_currency(denomination: str) -> str:
    if not denomination or denomination in {"Needs review", "N/A"}:
        return "N/A"

    parts = str(denomination).strip().split()

    if len(parts) >= 2:
        return parts[-1].upper()

    return "VND"


def _extract_agent(agent_results, name):
    return next(
        (
            item.get("data", {})
            for item in agent_results
            if item.get("agent") == name
        ),
        {},
    )


def _format_result_detail(result: dict):
    final_result = result.get("final_result") or {}
    agent_results = result.get("agent_results") or []

    status = final_result.get("status") or result.get("status")
    is_completed = status == "Completed" or result.get("status") == "Completed"

    if is_completed:
        denomination = (
            final_result.get("final_denomination")
            or final_result.get("menh_gia")
            or "N/A"
        )
        country = (
            final_result.get("quoc_gia")
            or final_result.get("country")
            or "Không xác định"
        )
        material = (
            final_result.get("chat_lieu")
            or final_result.get("material")
            or "Không xác định"
        )
        description = (
            final_result.get("mo_ta")
            or final_result.get("description")
            or ""
        )
    else:
        denomination = "Needs review"
        country = "Không xác định"
        material = "Không xác định"
        description = (
            "Các Agent chưa đạt đồng thuận đủ tin cậy. "
            "Cần quét lại hoặc kiểm tra thủ công."
        )

    return {
        "id": result.get("id"),
        "status": result.get("status"),
        "data": {
            "denomination": denomination,
            "currency": _derive_currency(denomination),
            "country": country,
            "origin": country,
            "description": description,
            "material": material,
            "estimated_usd": "N/A",
        },
        "agents": {
            "ml_dl": _extract_agent(agent_results, "YOLO"),
            "llm_api": _extract_agent(agent_results, "LLM"),
            "visual_search": _extract_agent(agent_results, "Lens"),
        },
        "consensus": {
            "method": final_result.get("method", "majority_vote"),
            "matched_agents": final_result.get("matched_agents")
            or final_result.get("so_luong_dong_thuan", 0),
            "status": status,
            "referee_view": final_result.get("quan_diem_trong_tai", ""),
            "valid_votes": final_result.get("valid_votes", []),
            "debate_log": final_result.get("debate_log", ""),
        },
        "uploaded_image_url": result.get("uploaded_image_url"),
        "image_url": result.get("uploaded_image_url"),
        "task_id": result.get("task_id"),
        "processing_time_ms": result.get("processing_time_ms"),
        "error_message": result.get("error_message"),
        "created_at": result.get("created_at"),
        "updated_at": result.get("updated_at"),
    }


class RecognitionController:
    @staticmethod
    async def recognize(user: User, file: UploadFile):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Vui lòng tải lên một tệp hình ảnh.",
            )

        image_bytes = await file.read()
        record = await RecognitionService.process_banknote(user, image_bytes)

        return {
            "id": str(record.id),
            "status": record.status,
            "message": "Banknote recognized successfully. 1 Token deducted.",
            "final_result": record.final_result,
            "agent_results": record.agent_results,
            "uploaded_image_url": record.uploaded_image_url,
            "created_at": record.created_at,
        }

    @staticmethod
    async def start_task(user: User, file: UploadFile):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Vui lòng tải lên một tệp hình ảnh.",
            )

        image_bytes = await file.read()
        return await RecognitionService.start_recognition_task(user, image_bytes)

    @staticmethod
    async def get_task_status(user: User, task_id: str):
        return await RecognitionService.get_task_status(user, task_id)

    @staticmethod
    async def get_result_detail(user: User, record_id: str):
        result = await RecognitionService.get_recognition_by_id(str(user.id), record_id)
        return _format_result_detail(result)