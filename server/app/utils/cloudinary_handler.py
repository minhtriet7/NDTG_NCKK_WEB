import asyncio
from typing import Optional

import cloudinary
import cloudinary.uploader

from app.core.config import settings
from app.core.logger import get_logger


logger = get_logger(__name__)


cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)


async def upload_image_to_cloudinary(image_bytes: bytes) -> str:
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_API_SECRET:
        logger.warning("Cloudinary is not configured. Skip image upload.")
        return ""

    def _upload() -> Optional[str]:
        result = cloudinary.uploader.upload(
            image_bytes,
            folder="banknote_scans",
            resource_type="image",
        )
        return result.get("secure_url")

    try:
        url = await asyncio.to_thread(_upload)
        return url or ""
    except Exception as exc:
        logger.error("Cloudinary upload failed: %s", exc, exc_info=True)
        return ""