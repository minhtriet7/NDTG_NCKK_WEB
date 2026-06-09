import base64
import os
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.core.logger import get_logger

logger = get_logger(__name__)


# ============================================================
# YOLO Crop Provider — detector-first (Phase Crop v2B)
# ============================================================

# Priority 1: dedicated crop model (đặt file riêng khi muốn tách hẳn)
# Priority 2: fallback sang Agent-1 YOLO nếu đã xác nhận 1-class banknote
# Priority 3: heuristic cũ (safety net)
CROP_YOLO_MODEL_PATH = os.getenv(
    "CROP_YOLO_MODEL_PATH",
    "ml_models/crop/banknote_crop.pt",
)
CROP_YOLO_FALLBACK_PATH = os.getenv(
    "CROP_YOLO_FALLBACK_PATH",
    "ml_models/yolo/best.pt",
)
CROP_YOLO_CONF = float(os.getenv("CROP_YOLO_CONF", "0.30"))
CROP_YOLO_IMGSZ = int(os.getenv("CROP_YOLO_IMGSZ", "640"))

# Lazy-loaded — không load khi import module
_CROP_YOLO_MODEL = None
_CROP_YOLO_MODEL_LOADED = False  # True kể cả khi load fail → tránh retry mỗi request


def _get_crop_yolo_model():
    """
    Lazy load YOLO crop model.
    Ưu tiên CROP_YOLO_MODEL_PATH, rồi CROP_YOLO_FALLBACK_PATH.
    Bắt buộc model phải là 1-class 'banknote' — guard chống dùng nhầm model denomination.
    Trả về model hoặc None nếu không load được.
    """
    global _CROP_YOLO_MODEL, _CROP_YOLO_MODEL_LOADED

    if _CROP_YOLO_MODEL_LOADED:
        return _CROP_YOLO_MODEL

    _CROP_YOLO_MODEL_LOADED = True  # đặt trước để tránh retry liên tục khi fail

    try:
        from ultralytics import YOLO as _YOLO  # noqa: N812
    except Exception:
        logger.warning("[CropYOLO] ultralytics chưa được cài, dùng heuristic.")
        return None

    # Chọn path tồn tại theo priority
    chosen_path: Optional[str] = None
    if os.path.exists(CROP_YOLO_MODEL_PATH):
        chosen_path = CROP_YOLO_MODEL_PATH
    elif os.path.exists(CROP_YOLO_FALLBACK_PATH):
        chosen_path = CROP_YOLO_FALLBACK_PATH

    if not chosen_path:
        logger.info(
            "[CropYOLO] Không tìm thấy model tại '%s' hoặc '%s', dùng heuristic.",
            CROP_YOLO_MODEL_PATH,
            CROP_YOLO_FALLBACK_PATH,
        )
        return None

    try:
        model = _YOLO(chosen_path)

        # Guard: chỉ chấp nhận 1-class 'banknote' — không dùng model denomination làm crop
        names = model.names or {}
        if len(names) != 1 or list(names.values())[0].lower() != "banknote":
            logger.warning(
                "[CropYOLO] Model tại '%s' có %s class(es): %s. "
                "Chỉ chấp nhận 1-class 'banknote'. Fallback heuristic.",
                chosen_path,
                len(names),
                names,
            )
            return None

        logger.info(
            "[CropYOLO] Loaded crop model từ '%s' — names: %s.",
            chosen_path,
            names,
        )
        _CROP_YOLO_MODEL = model
        return model

    except Exception as exc:
        logger.warning(
            "[CropYOLO] Không load được model '%s': %s. Fallback heuristic.",
            chosen_path,
            exc,
        )
        return None


def _yolo_crop_candidates(img: np.ndarray) -> List[Dict[str, Any]]:
    """
    Chạy YOLO inference và convert sang schema candidate hiện tại.
    Trả về list rỗng nếu: model None, 0 detection, hoặc inference lỗi.
    """
    model = _get_crop_yolo_model()
    if model is None:
        return []

    image_h, image_w = img.shape[:2]

    try:
        results = model.predict(
            source=img,
            imgsz=CROP_YOLO_IMGSZ,
            conf=CROP_YOLO_CONF,
            verbose=False,
        )
    except Exception as exc:
        logger.warning("[CropYOLO] Inference lỗi: %s. Fallback heuristic.", exc)
        return []

    if not results:
        return []

    result = results[0]
    if result.boxes is None or len(result.boxes) == 0:
        return []

    candidates: List[Dict[str, Any]] = []

    for box in result.boxes:
        xyxy = box.xyxy[0].detach().cpu().numpy().tolist()
        conf = float(box.conf[0].detach().cpu().item())

        x1 = max(0, int(xyxy[0]))
        y1 = max(0, int(xyxy[1]))
        x2 = min(image_w, int(xyxy[2]))
        y2 = min(image_h, int(xyxy[3]))

        if x2 <= x1 or y2 <= y1:
            continue

        candidates.append(
            {
                "box": (x1, y1, x2, y2),
                # score cùng đơn vị với heuristic để NMS hoạt động đồng nhất
                "score": conf * _box_area((x1, y1, x2, y2)),
                "source": "yolo_crop",
                "yolo_conf": round(conf, 4),
                "yolo_class": "banknote",
            }
        )

    logger.debug("[CropYOLO] Raw detections: %s box(es).", len(candidates))
    return candidates


def _encode_crop(img: np.ndarray):
    ok, buffer = cv2.imencode(
        ".jpg",
        img,
        [int(cv2.IMWRITE_JPEG_QUALITY), 92],
    )
    if not ok:
        return None
    return buffer.tobytes()


def _box_area(box: Tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = box
    return max(0, x2 - x1) * max(0, y2 - y1)


def _iou(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    inter = _box_area((ix1, iy1, ix2, iy2))
    union = _box_area(box_a) + _box_area(box_b) - inter

    if union <= 0:
        return 0.0

    return inter / union




def _intersection_area(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> int:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    return _box_area((ix1, iy1, ix2, iy2))


def _contained_ratio(inner: Tuple[int, int, int, int], outer: Tuple[int, int, int, int]) -> float:
    inner_area = _box_area(inner)
    if inner_area <= 0:
        return 0.0
    return _intersection_area(inner, outer) / float(inner_area)


def _box_center(box: Tuple[int, int, int, int]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _center_inside(inner: Tuple[int, int, int, int], outer: Tuple[int, int, int, int]) -> bool:
    cx, cy = _box_center(inner)
    x1, y1, x2, y2 = outer
    return x1 <= cx <= x2 and y1 <= cy <= y2


def _remove_nested_fragment_candidates(
    candidates: List[Dict[str, Any]],
    image_w: int,
    image_h: int,
) -> List[Dict[str, Any]]:
    """
    Avoid false multi-object detection when one real banknote is split into
    several internal fragments. This was causing one 500000 VND note to become
    3 objects: full image + upper note area + lower note area.
    """
    if len(candidates) <= 1:
        return candidates

    total_area = max(1, image_w * image_h)

    # If there is a very large candidate that nearly covers the whole photo,
    # keep it and drop inner fragments. This is safer for single-banknote photos
    # taken in a hand/on a bag, where texture creates many fake regions.
    very_large = [
        item for item in candidates
        if _box_area(item["box"]) / float(total_area) >= 0.72
    ]

    if very_large:
        large = max(very_large, key=lambda item: _box_area(item["box"]))
        inner_items = [
            item for item in candidates
            if item is not large and _center_inside(item["box"], large["box"])
        ]

        # Keep only the large candidate when almost all other boxes are fragments
        # inside it. This fixes the false 3-banknotes result on a single note.
        if len(inner_items) >= max(1, len(candidates) - 1):
            large = dict(large)
            large["source"] = f'{large.get("source", "unknown")}_large_single_note'
            large["score"] = float(large.get("score", 0)) + total_area * 0.5
            return [large]

    filtered: List[Dict[str, Any]] = []

    for item in sorted(candidates, key=lambda x: _box_area(x["box"]), reverse=True):
        box = item["box"]
        area = _box_area(box)
        is_fragment = False

        for kept in filtered:
            kept_box = kept["box"]
            kept_area = _box_area(kept_box)

            if kept_area <= area:
                continue

            contained = _contained_ratio(box, kept_box)

            # If a smaller box is mostly inside a larger one, it is usually a
            # fragment of the same banknote rather than a separate banknote.
            if contained >= 0.84:
                is_fragment = True
                break

        if not is_fragment:
            filtered.append(item)

    return filtered

def _non_max_suppression(
    candidates: List[Dict[str, Any]],
    iou_threshold: float = 0.32,
) -> List[Dict[str, Any]]:
    candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)
    selected: List[Dict[str, Any]] = []

    for item in candidates:
        box = item["box"]
        keep = True

        for chosen in selected:
            if _iou(box, chosen["box"]) > iou_threshold:
                keep = False
                break

        if keep:
            selected.append(item)

    return selected


def _expand_box(
    box: Tuple[int, int, int, int],
    image_w: int,
    image_h: int,
    pad_ratio: float = 0.055,
) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = box

    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)

    pad_x = int(bw * pad_ratio)
    pad_y = int(bh * pad_ratio)

    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(image_w, x2 + pad_x),
        min(image_h, y2 + pad_y),
    )


def _read_cv2_image(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Cannot decode image.")

    return img


def _build_candidate(
    box: Tuple[int, int, int, int],
    score: float,
    source: str,
) -> Dict[str, Any]:
    return {
        "box": tuple(int(v) for v in box),
        "score": float(score),
        "source": source,
    }


def _find_contour_candidates(img: np.ndarray) -> List[Dict[str, Any]]:
    image_h, image_w = img.shape[:2]
    total_area = image_h * image_w

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    edges_a = cv2.Canny(blurred, 28, 110)
    edges_b = cv2.Canny(blurred, 55, 170)
    edges = cv2.bitwise_or(edges_a, edges_b)

    # Kernel nhỏ để giữ 2 tờ tiền sát nhau không bị dính thành 1 khối lớn.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(
        edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    candidates: List[Dict[str, Any]] = []

    for contour in contours:
        area = cv2.contourArea(contour)

        if area < total_area * 0.018:
            continue

        x, y, w, h = cv2.boundingRect(contour)

        if w <= 0 or h <= 0:
            continue

        box_area = w * h
        area_ratio = box_area / float(total_area)
        aspect = max(w / float(h), h / float(w))
        fill_ratio = area / float(box_area)

        if area_ratio < 0.025 or area_ratio > 0.92:
            continue

        if not (1.12 <= aspect <= 6.2):
            continue

        if fill_ratio < 0.055:
            continue

        candidates.append(
            _build_candidate(
                box=(x, y, x + w, y + h),
                score=area * (1.0 + min(aspect, 5.0) * 0.06),
                source="contour",
            )
        )

    return candidates


def _split_active_segments(active: np.ndarray, min_height: int) -> List[Tuple[int, int]]:
    segments: List[Tuple[int, int]] = []
    start = None

    for idx, value in enumerate(active):
        if bool(value) and start is None:
            start = idx

        if not bool(value) and start is not None:
            end = idx
            if end - start >= min_height:
                segments.append((start, end))
            start = None

    if start is not None:
        end = len(active) - 1
        if end - start >= min_height:
            segments.append((start, end))

    return segments


def _merge_close_segments(
    segments: List[Tuple[int, int]],
    gap_threshold: int,
) -> List[Tuple[int, int]]:
    if not segments:
        return []

    segments = sorted(segments)
    merged = [segments[0]]

    for start, end in segments[1:]:
        prev_start, prev_end = merged[-1]

        if start - prev_end <= gap_threshold:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))

    return merged


def _find_horizontal_split_candidates(img: np.ndarray) -> List[Dict[str, Any]]:
    """
    Fallback quan trọng cho ảnh nhiều tờ tiền xếp trên/dưới nhau.
    Ví dụ ảnh có 2 USD ở trên và 2000 VND ở dưới:
    contour có thể chỉ bắt được tờ dưới, nên cần dùng projection theo trục Y.
    """
    image_h, image_w = img.shape[:2]
    total_area = image_h * image_w

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    edges = cv2.Canny(gray, 35, 140)
    edges = cv2.dilate(
        edges,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
        iterations=1,
    )

    row_density = np.mean(edges > 0, axis=1)

    window = max(7, image_h // 70)
    kernel = np.ones(window, dtype=np.float32) / float(window)
    smooth = np.convolve(row_density, kernel, mode="same")

    threshold = max(float(np.mean(smooth) * 0.72), 0.012)
    active = smooth > threshold

    segments = _split_active_segments(active, min_height=max(24, int(image_h * 0.09)))
    segments = _merge_close_segments(segments, gap_threshold=max(8, image_h // 45))

    candidates: List[Dict[str, Any]] = []

    for y1, y2 in segments:
        band = edges[y1:y2, :]

        col_density = np.mean(band > 0, axis=0)
        col_threshold = max(float(np.mean(col_density) * 0.55), 0.006)
        active_cols = col_density > col_threshold
        col_segments = _split_active_segments(active_cols, min_height=max(35, int(image_w * 0.18)))

        if not col_segments:
            x1, x2 = 0, image_w
        else:
            x1 = min(seg[0] for seg in col_segments)
            x2 = max(seg[1] for seg in col_segments)

        box_w = x2 - x1
        box_h = y2 - y1

        if box_w <= 0 or box_h <= 0:
            continue

        box_area = box_w * box_h
        area_ratio = box_area / float(total_area)
        aspect = max(box_w / float(box_h), box_h / float(box_w))

        if area_ratio < 0.035 or area_ratio > 0.95:
            continue

        if not (1.05 <= aspect <= 7.0):
            continue

        score = float(np.sum(band > 0)) + box_area * 0.02

        candidates.append(
            _build_candidate(
                box=(int(x1), int(y1), int(x2), int(y2)),
                score=score,
                source="horizontal_split",
            )
        )

    return candidates


def _find_color_block_candidates(img: np.ndarray) -> List[Dict[str, Any]]:
    """
    Fallback nhẹ: nhiều tờ tiền có nền sáng khác mặt bàn.
    Dùng saturation/value để tìm vùng có texture khác biệt.
    """
    image_h, image_w = img.shape[:2]
    total_area = image_h * image_w

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    mask = cv2.inRange(saturation, 18, 255)
    bright_mask = cv2.inRange(value, 55, 255)
    mask = cv2.bitwise_and(mask, bright_mask)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: List[Dict[str, Any]] = []

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)

        if w <= 0 or h <= 0:
            continue

        area = w * h
        aspect = max(w / float(h), h / float(w))

        if area < total_area * 0.03 or area > total_area * 0.92:
            continue

        if not (1.1 <= aspect <= 6.5):
            continue

        candidates.append(
            _build_candidate(
                box=(x, y, x + w, y + h),
                score=float(area) * 0.4,
                source="color_block",
            )
        )

    return candidates


def detect_banknote_objects(
    image_bytes: bytes,
    max_objects: int = 5,
) -> List[Dict[str, Any]]:
    """
    Trả về danh sách object đã crop, có metadata để pipeline chạy từng tờ tiền.
    Không dùng OCR ở đây; chỉ tách vùng ảnh.
    """
    try:
        img = _read_cv2_image(image_bytes)
    except Exception as exc:
        logger.warning("Cannot decode image, using original image. Error: %s", exc)
        return [
            {
                "object_index": 1,
                "raw_candidate_count": 0,
                "bbox": None,
                "crop_bytes": image_bytes,
                "crop_base64": base64.b64encode(image_bytes).decode("utf-8"),
                "confidence": 0.2,
                "width": None,
                "height": None,
                "source": "original_decode_failed",
                "fallback": True,
            }
        ]

    image_h, image_w = img.shape[:2]

    # ── Phase v2B: Thử YOLO detector trước ──────────────────────────────────
    yolo_candidates = _yolo_crop_candidates(img)
    crop_provider = "heuristic"

    if yolo_candidates:
        candidates = yolo_candidates
        crop_provider = "yolo"
        logger.info("[CropYOLO] Dùng YOLO crop provider: %s candidate(s).", len(candidates))
    else:
        # Không có detection — log rõ nếu model đã load (tránh log nhầm khi model không tồn tại)
        if _get_crop_yolo_model() is not None:
            logger.info("[CropYOLO] No detections, fallback heuristic.")

        contour_cands = _find_contour_candidates(img)
        hsplit_cands = _find_horizontal_split_candidates(img)
        color_cands = _find_color_block_candidates(img)

        candidates = []
        candidates.extend(contour_cands)
        candidates.extend(hsplit_cands)
        candidates.extend(color_cands)

        logger.info(
            "[Crop] Heuristic provider: contour=%s h_split=%s color=%s",
            len(contour_cands), len(hsplit_cands), len(color_cands),
        )
    # ─────────────────────────────────────────────────────────────────────────

    total_before_nms = len(candidates)
    candidates = _non_max_suppression(candidates, iou_threshold=0.30)
    total_after_nms = len(candidates)

    candidates = _remove_nested_fragment_candidates(candidates, image_w, image_h)
    raw_candidate_count = len(candidates)

    logger.debug(
        "Crop candidates stats: provider=%s | "
        "Before NMS=%s, After NMS=%s, After Fragment Filter (raw_candidate_count)=%s",
        crop_provider,
        total_before_nms, total_after_nms, raw_candidate_count
    )

    # Ưu tiên thứ tự trên xuống dưới, trái sang phải để kết quả ổn định.
    candidates = sorted(
        candidates[:max_objects],
        key=lambda item: (item["box"][1], item["box"][0]),
    )

    objects: List[Dict[str, Any]] = []

    for index, item in enumerate(candidates, start=1):
        box = item["box"]
        expanded = _expand_box(box, image_w, image_h, pad_ratio=0.055)
        x1, y1, x2, y2 = expanded

        crop = img[y1:y2, x1:x2]

        if crop.size == 0:
            continue

        crop_bytes = _encode_crop(crop)

        if not crop_bytes:
            continue

        crop_h, crop_w = crop.shape[:2]
        area_ratio = _box_area(expanded) / float(max(1, image_w * image_h))
        confidence = max(0.35, min(0.98, 0.45 + area_ratio))

        objects.append(
            {
                "object_index": len(objects) + 1,
                "raw_candidate_count": raw_candidate_count,
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "crop_bytes": crop_bytes,
                "crop_base64": base64.b64encode(crop_bytes).decode("utf-8"),
                "confidence": round(float(confidence), 4),
                "width": int(crop_w),
                "height": int(crop_h),
                "source": item.get("source", "unknown"),
                "fallback": False,
                # Fields bổ sung — không phá schema cũ
                "crop_provider": crop_provider,
                "yolo_conf": item.get("yolo_conf"),    # None nếu từ heuristic
                "yolo_class": item.get("yolo_class"),  # None nếu từ heuristic
            }
        )

    if not objects:
        logger.info("No reliable banknote candidate found, using original image.")
        original_bytes = _encode_crop(img) or image_bytes
        return [
            {
                "object_index": 1,
                "raw_candidate_count": raw_candidate_count,
                "bbox": [0, 0, int(image_w), int(image_h)],
                "crop_bytes": original_bytes,
                "crop_base64": base64.b64encode(original_bytes).decode("utf-8"),
                "confidence": 0.25,
                "width": int(image_w),
                "height": int(image_h),
                "source": "original_fallback",
                "fallback": True,
            }
        ]

    logger.info(
        "Returned %s final crop object(s) from %s raw candidate(s).",
        len(objects), raw_candidate_count
    )
    return objects


def detect_and_crop_banknotes(image_bytes: bytes) -> List[bytes]:
    """
    Backward compatible API cho code cũ.
    """
    objects = detect_banknote_objects(image_bytes=image_bytes, max_objects=5)
    return [item["crop_bytes"] for item in objects if item.get("crop_bytes")] or [image_bytes]
