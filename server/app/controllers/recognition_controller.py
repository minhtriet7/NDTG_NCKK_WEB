from fastapi import UploadFile, HTTPException

from app.models.user_model import User
from app.services.recognition_service import RecognitionService, serialize_result


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
    detected_objects = (
        result.get("detected_objects")
        or final_result.get("detected_objects")
        or []
    )
    first_object = detected_objects[0] if detected_objects else {}
    status = final_result.get("status") or result.get("status")
    denomination = (
        final_result.get("final_denomination")
        or final_result.get("menh_gia")
        or final_result.get("denomination")
        or ("Needs review" if status != "Completed" else "N/A")
    )
    country = (
        final_result.get("quoc_gia")
        or final_result.get("country")
        or final_result.get("final_country")
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
        or final_result.get("quan_diem_trong_tai")
        or ""
    )
    confidence = final_result.get("confidence")
    if confidence is None:
        confidence = final_result.get("do_tin_cay")

    formatted = dict(result)
    formatted.update({
        "id": result.get("id"),
        "status": result.get("status"),
        "data": {
            "denomination": denomination,
            "currency": (
                final_result.get("currency")
                or final_result.get("currency_code")
                or final_result.get("ma_tien_te")
                or _derive_currency(denomination)
            ),
            "country": country,
            "origin": country,
            "description": description,
            "material": material,
            "estimated_usd": "N/A",
            "confidence": confidence,
        },
        "agents": {
            "ml_dl": _extract_agent(agent_results, "OpenAI"),
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
            "consensus_pattern": final_result.get("consensus_pattern"),
            "partial": final_result.get("partial", False),
            "completed_objects": final_result.get("completed_objects"),
            "needs_better_image_objects": final_result.get("needs_better_image_objects"),
            "total_objects": final_result.get("total_objects"),
        },
        "detected_objects": detected_objects,
        "multi_object": len(detected_objects) > 1,
        "confidence": confidence,
        "crop_checker": first_object.get("crop_checker") or result.get("crop_checker"),
        "selected_box_reason": (
            first_object.get("selected_box_reason")
            or result.get("selected_box_reason")
        ),
        "box_selection_trace": (
            first_object.get("box_selection_trace")
            or result.get("box_selection_trace")
        ),
        "rejected_boxes": (
            first_object.get("rejected_boxes")
            or result.get("rejected_boxes")
            or []
        ),
        "consensus_trace": (
            first_object.get("consensus_trace")
            or result.get("consensus_trace")
            or []
        ),
        "uploaded_image_url": result.get("uploaded_image_url"),
        "input_image_url": (
            result.get("input_image_url")
            or result.get("uploaded_image_url")
        ),
        "image_url": result.get("uploaded_image_url"),
        "task_id": result.get("task_id"),
        "processing_time_ms": result.get("processing_time_ms"),
        "error_message": result.get("error_message"),
        "created_at": result.get("created_at"),
        "updated_at": result.get("updated_at"),
    })
    return formatted


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
        payload = serialize_result(record)
        payload["message"] = "Banknote recognized successfully. 1 Token deducted."
        return payload

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

    @staticmethod
    async def debug_recognize(user: User, file: UploadFile):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Vui lòng tải lên một tệp hình ảnh.",
            )

        image_bytes = await file.read()
        
        # Gọi run_pipeline trực tiếp với debug_mode=True
        # Không dùng process_banknote vì nó trả về DB record model, thay vì dict
        debug_result = await RecognitionService.run_pipeline(
            user=user,
            image_bytes=image_bytes,
            task=None,
            debug_mode=True
        )

        return debug_result
