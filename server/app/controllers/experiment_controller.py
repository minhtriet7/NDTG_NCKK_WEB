from datetime import datetime
from typing import Optional

from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.models.user_model import User
from app.schemas.experiment_schema import ExperimentRunInput
from app.services.experiment_service import ExperimentService


class ExperimentController:
    @staticmethod
    def ensure_enabled() -> None:
        if not settings.ENABLE_EXPERIMENT_API:
            raise HTTPException(
                status_code=503,
                detail="Experiment API is disabled",
            )

    @staticmethod
    async def run(
        admin: User,
        file: UploadFile,
        payload: ExperimentRunInput,
    ):
        ExperimentController.ensure_enabled()
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Please upload an image file.")

        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")
        if len(image_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size exceeds 5MB.")

        return await ExperimentService.start_batch(
            admin=admin,
            image_bytes=image_bytes,
            payload=payload,
        )

    @staticmethod
    async def list_runs(
        *,
        dataset_id: Optional[str],
        image_id: Optional[str],
        status: Optional[str],
        experiment_id: Optional[str],
        date_from: Optional[datetime],
        date_to: Optional[datetime],
        limit: int,
        offset: int,
    ):
        ExperimentController.ensure_enabled()
        return await ExperimentService.list_runs(
            dataset_id=dataset_id,
            image_id=image_id,
            status=status,
            experiment_id=experiment_id,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )

    @staticmethod
    async def stop_remaining(*, admin: User, experiment_id: str):
        ExperimentController.ensure_enabled()
        return await ExperimentService.stop_remaining_runs(
            admin=admin,
            experiment_id=experiment_id,
        )

    @staticmethod
    async def export(
        *,
        dataset_id: Optional[str],
        image_id: Optional[str],
        date_from: Optional[datetime],
        date_to: Optional[datetime],
    ):
        ExperimentController.ensure_enabled()
        return await ExperimentService.export_runs(
            dataset_id=dataset_id,
            image_id=image_id,
            date_from=date_from,
            date_to=date_to,
        )
