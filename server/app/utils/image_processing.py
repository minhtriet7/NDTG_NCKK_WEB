import cv2
import numpy as np

from app.core.logger import get_logger


logger = get_logger(__name__)


def detect_and_crop_banknotes(image_bytes: bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        logger.warning("Cannot decode image, using original image.")
        return [image_bytes]

    height, width = img.shape[:2]
    total_area = height * width

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 150)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(
        closed_edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    cropped_images = []

    for contour in contours[:3]:
        area = cv2.contourArea(contour)

        if area <= total_area * 0.12:
            continue

        x, y, w, h = cv2.boundingRect(contour)

        if w <= 0 or h <= 0:
            continue

        aspect_ratio = float(w) / float(h) if w >= h else float(h) / float(w)

        if not (1.0 <= aspect_ratio <= 3.5):
            continue

        pad = 15
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(width, x + w + pad)
        y2 = min(height, y + h + pad)

        roi = img[y1:y2, x1:x2]

        if roi.size == 0:
            continue

        success, buffer = cv2.imencode(".jpg", roi)

        if success:
            cropped_images.append(buffer.tobytes())

    if not cropped_images:
        logger.info("No reliable banknote contour found, using original image.")
        return [image_bytes]

    logger.info("Detected %s banknote candidate(s).", len(cropped_images))
    return cropped_images