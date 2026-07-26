"""
benchmark_metrics_router.py
============================
Router MỚI — hoàn toàn độc lập với experiment_router.py.
Prefix: /api/v1/admin/benchmark-metrics
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import require_admin
from app.models.user_model import User
from app.services.benchmark_metrics_service import BenchmarkMetricsService

router = APIRouter()


@router.post("/export")
async def export_benchmark_metrics(
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
):
    """
    Upload file Excel benchmark (HeThong + GPT_GEMINI sheets).
    Server tính Accuracy / Precision / Recall / F1 cho 3 model:
    BanknoteAI, GPT, Gemini — hoàn toàn riêng biệt.
    Trả về file .xlsx kết quả gồm 3 sheets:
      - Metrics_Summary
      - Metrics_Per_Dimension
      - Notes
    """
    # Validate định dạng file
    fname = (file.filename or "").lower()
    if not (fname.endswith(".xlsx") or fname.endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail="Chỉ chấp nhận file .xlsx hoặc .xls.",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="File upload rỗng.")

    # Giới hạn 20 MB
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File quá lớn. Giới hạn tối đa 20 MB.",
        )

    original_stem = (file.filename or "benchmark").rsplit(".", 1)[0]
    output_filename = f"{original_stem}_simple_verified_metrics.xlsx"

    result_workbook = BenchmarkMetricsService.calculate(file_bytes=file_bytes)

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
