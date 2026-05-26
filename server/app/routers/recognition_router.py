from fastapi import APIRouter, Depends, UploadFile, File

from app.controllers.recognition_controller import RecognitionController
from app.core.dependencies import get_current_user
from app.models.user_model import User


router = APIRouter()


@router.post("/scan")
async def scan_banknote(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    return await RecognitionController.recognize(current_user, file)


@router.post("/tasks")
async def start_recognition_task(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    return await RecognitionController.start_task(current_user, file)


@router.get("/tasks/{task_id}")
async def get_recognition_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    return await RecognitionController.get_task_status(current_user, task_id)


@router.get("/{record_id}")
async def get_scan_detail(
    record_id: str,
    current_user: User = Depends(get_current_user),
):
    return await RecognitionController.get_result_detail(current_user, record_id)