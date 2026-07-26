from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.controllers.experiment_controller import ExperimentController
from app.core.dependencies import require_admin
from app.models.user_model import User
from app.schemas.experiment_schema import ExperimentRunInput


router = APIRouter()


@router.post("/run", status_code=202)
async def run_experiment(
    file: UploadFile = File(...),
    dataset_id: str = Form(...),
    image_id: str = Form(...),
    ground_truth_country: str = Form(...),
    ground_truth_currency: str = Form(...),
    ground_truth_denomination: str = Form(...),
    repeat_count: int = Form(1, ge=1, le=3),
    delay_between_runs: int = Form(10, ge=0, le=60),
    stop_on_rate_limit: bool = Form(True),
    stop_on_provider_error: bool = Form(True),
    force_rerun: bool = Form(False),
    current_user: User = Depends(require_admin),
):
    payload = ExperimentRunInput(
        dataset_id=dataset_id,
        image_id=image_id,
        ground_truth_country=ground_truth_country,
        ground_truth_currency=ground_truth_currency,
        ground_truth_denomination=ground_truth_denomination,
        repeat_count=repeat_count,
        delay_between_runs=delay_between_runs,
        stop_on_rate_limit=stop_on_rate_limit,
        stop_on_provider_error=stop_on_provider_error,
        force_rerun=force_rerun,
    )
    return await ExperimentController.run(current_user, file, payload)


@router.get("")
async def list_experiments(
    dataset_id: Optional[str] = Query(default=None),
    image_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    experiment_id: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_admin),
):
    return await ExperimentController.list_runs(
        dataset_id=dataset_id,
        image_id=image_id,
        status=status,
        experiment_id=experiment_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.post("/{experiment_id}/stop")
async def stop_experiment_runs(
    experiment_id: str,
    current_user: User = Depends(require_admin),
):
    return await ExperimentController.stop_remaining(
        admin=current_user,
        experiment_id=experiment_id,
    )


@router.get("/export")
async def export_experiments(
    dataset_id: Optional[str] = Query(default=None),
    image_id: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    current_user: User = Depends(require_admin),
):
    workbook = await ExperimentController.export(
        dataset_id=dataset_id,
        image_id=image_id,
        date_from=date_from,
        date_to=date_to,
    )
    filename = f"banknote_experiments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        workbook,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# =============================================================================
# TÍNH NĂNG MỚI — Metrics Calculator (ĐỘC LẬP, không ảnh hưởng code cũ)
# =============================================================================

@router.post("/metrics-calculator")
async def calculate_metrics(
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
):
    """Upload file Excel thô (cùng format với file export thực nghiệm).
    
    Backend sẽ:
    1. Đọc file bằng pandas.
    2. Tính Precision / Recall / F1-Score (Macro & Weighted) cho 3 chiều:
       Country, Currency, Denomination — dùng scikit-learn.
    3. Trả về file .xlsx mới gồm 2 sheets:
       - Raw_Data: dữ liệu gốc từ file upload.
       - Metrics_Report: bảng Overall Summary + Per-Class Breakdown.
    
    Yêu cầu cột tối thiểu trong file upload:
        ground_truth_country, predicted_country,
        ground_truth_currency, predicted_currency,
        ground_truth_denomination, predicted_denomination
    """
    from app.services.metrics_service import MetricsService

    # Validate định dạng file
    filename_lower = (file.filename or "").lower()
    if not (filename_lower.endswith(".xlsx") or filename_lower.endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail="Chỉ chấp nhận file .xlsx hoặc .xls.",
        )

    file_bytes = await file.read()

    # Gọi service tính toán (raise HTTPException nếu có lỗi)
    result_workbook = MetricsService.calculate_from_excel(file_bytes)

    # Đặt tên file kết quả
    original_stem = (file.filename or "result").rsplit(".", 1)[0]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"{original_stem}_metrics_{timestamp}.xlsx"

    return StreamingResponse(
        result_workbook,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{output_filename}"',
        },
    )
