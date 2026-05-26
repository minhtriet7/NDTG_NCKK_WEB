from fastapi import UploadFile, HTTPException, status

from app.core.config import settings


DEFAULT_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024


def get_allowed_extensions() -> set[str]:
    configured = getattr(settings, "ALLOWED_IMAGE_TYPES", None)

    if configured and isinstance(configured, list):
        return {str(item).lower().replace(".", "") for item in configured}

    return DEFAULT_ALLOWED_EXTENSIONS


def get_max_file_size() -> int:
    max_upload_size_mb = getattr(settings, "MAX_UPLOAD_SIZE_MB", None)

    if max_upload_size_mb:
        return int(max_upload_size_mb) * 1024 * 1024

    return DEFAULT_MAX_FILE_SIZE


async def validate_and_read_image(file: UploadFile) -> bytes:
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng tải lên một tệp tin.",
        )

    if not file.filename or "." not in file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tệp không hợp lệ.",
        )

    allowed_extensions = get_allowed_extensions()
    max_file_size = get_max_file_size()

    ext = file.filename.rsplit(".", 1)[-1].lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng {ext} không được hỗ trợ. Chỉ nhận: {', '.join(sorted(allowed_extensions)).upper()}.",
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp tải lên không phải là hình ảnh hợp lệ.",
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp ảnh rỗng.",
        )

    if len(file_bytes) > max_file_size:
        max_mb = round(max_file_size / 1024 / 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dung lượng tệp quá lớn. Giới hạn tối đa là {max_mb}MB.",
        )

    return file_bytes