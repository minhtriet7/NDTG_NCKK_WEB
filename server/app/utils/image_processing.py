import base64
import os
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.core.logger import get_logger
from app.utils.crop_checker import ENABLE_AG0_CHECKER, check_crop

# Khi True: detect_and_crop_banknotes vẫn fallback ảnh gốc ngay cả khi AG0 bật.
# Mặc định False — nghĩa là AG0 quyết định, không lén bypass.
ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK: bool = (
    os.getenv("ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK", "false").lower() == "true"
)

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

# ============================================================
# Heuristic Crop — Tunable Constants
# Thay đổi các giá trị này qua biến môi trường để rollback nhanh
# mà không cần sửa code.
# ============================================================

# NMS IoU threshold — box trùng > threshold này sẽ bị suppress
CROP_NMS_IOU_THRESHOLD = float(os.getenv("CROP_NMS_IOU_THRESHOLD", "0.30"))

# Nested fragment: nếu box nhỏ chứa >= ratio này bên trong box lớn thì bị coi là fragment
CROP_NESTED_CONTAINED_RATIO = float(os.getenv("CROP_NESTED_CONTAINED_RATIO", "0.84"))

# Contour heuristic: area_ratio tối thiểu / tối đa so với toàn ảnh
CROP_CONTOUR_AREA_MIN = float(os.getenv("CROP_CONTOUR_AREA_MIN", "0.025"))
CROP_CONTOUR_AREA_MAX = float(os.getenv("CROP_CONTOUR_AREA_MAX", "0.92"))

# Horizontal split heuristic: area_ratio tối thiểu / tối đa
CROP_HSPLIT_AREA_MIN = float(os.getenv("CROP_HSPLIT_AREA_MIN", "0.035"))
CROP_HSPLIT_AREA_MAX = float(os.getenv("CROP_HSPLIT_AREA_MAX", "0.95"))

# Texture soft-warning: Laplacian variance tối thiểu để log cảnh báo
# (chưa reject, chỉ log WARNING để quan sát)
CROP_TEXTURE_WARN_VARIANCE = float(os.getenv("CROP_TEXTURE_WARN_VARIANCE", "60.0"))

# ============================================================
# Adjacent Fragment Merge — Tunable Constants
# Hai fragment kề nhau có thể là cùng 1 tờ tiền bị cắt thành 2 box.
# Merge khi cả 4 điều kiện dưới đây đều thỏa mãn.
# ============================================================

# y_overlap_ratio tối thiểu giữa 2 box để merge
# (overlap theo trục Y / min_height của 2 box)
MERGE_Y_OVERLAP_RATIO_MIN = float(os.getenv("MERGE_Y_OVERLAP_RATIO_MIN", "0.75"))

# x_gap tối đa (dương = khoảng cách, âm = đang đè nhau) so với chiều rộng ảnh
# 0.04 = tối đa 4% image_w khoảng cách ngang — rất chặt, tránh merge 2 tờ thật
MERGE_X_GAP_MAX_RATIO = float(os.getenv("MERGE_X_GAP_MAX_RATIO", "0.04"))

# Union box area / total image area tối đa
MERGE_UNION_AREA_MAX = float(os.getenv("MERGE_UNION_AREA_MAX", "0.50"))

# Union box aspect ratio hợp lệ (min=1.0 không enforce, max=5.0)
MERGE_UNION_ASPECT_MIN = float(os.getenv("MERGE_UNION_ASPECT_MIN", "1.0"))
MERGE_UNION_ASPECT_MAX = float(os.getenv("MERGE_UNION_ASPECT_MAX", "5.0"))

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


def _compute_texture_variance(crop_img: np.ndarray) -> float:
    """
    Tính Laplacian variance của crop — dùng để ước lượng mức độ texture/detail.
    Giá trị thấp (< CROP_TEXTURE_WARN_VARIANCE) nghĩa là crop có thể là nền trơn
    hoặc vùng rỗng, không chứa đặc điểm nổi bật của tiền giấy.

    Chú ý: hàm này CHỈ được dùng để LOG cảnh báo, không reject cứng.
    Nếu muốn bật reject, hãy sử dụng giá trị này kết hợp với điều kiện rõ ràng
    sau khi đã quan sát log trên nhiều ảnh mẫu.
    """
    try:
        gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY)
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        return float(lap.var())
    except Exception:
        return 0.0


def _log_candidate_debug(
    idx: int,
    item: Dict[str, Any],
    image_w: int,
    image_h: int,
    stage: str = "raw",
) -> None:
    """
    Log chi tiết một candidate tại stage cho trước (raw / after_nms / final).
    Dùng logger.debug để không làm spam log production — bật bằng log level DEBUG.
    """
    box = item.get("box", (0, 0, 0, 0))
    x1, y1, x2, y2 = box
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    area = _box_area(box)
    total_area = max(1, image_w * image_h)
    area_ratio = area / float(total_area)
    aspect_ratio = round(max(bw / float(bh), bh / float(bw)), 3)
    source = item.get("source", "unknown")
    score = round(float(item.get("score", 0.0)), 1)
    yolo_conf = item.get("yolo_conf")

    logger.info(
        "[CropCandidate/%s] idx=%s bbox=[%s, %s, %s, %s] "
        "source=%s area_ratio=%.3f aspect=%.2f score=%s",
        stage, idx, x1, y1, x2, y2, source, area_ratio, aspect_ratio, score
    )


def _box_area(box: Tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = box
    return max(0, x2 - x1) * max(0, y2 - y1)


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _candidate_key(item: Dict[str, Any]) -> Tuple[int, int, int, int]:
    return tuple(int(v) for v in item.get("box", (0, 0, 0, 0)))


def _candidate_public_meta(
    item: Dict[str, Any],
    image_w: int,
    image_h: int,
    decision: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    box = _candidate_key(item)
    x1, y1, x2, y2 = box
    bw = max(1, x2 - x1)
    bh = max(1, y2 - y1)
    total_area = max(1, image_w * image_h)

    meta = {
        "bbox": [x1, y1, x2, y2],
        "source": item.get("source", "unknown"),
        "score": round(_safe_float(item.get("score")), 4),
        "yolo_conf": item.get("yolo_conf"),
        "yolo_class": item.get("yolo_class"),
        "area_ratio": round(_box_area(box) / float(total_area), 5),
        "aspect_ratio": round(max(bw / float(bh), bh / float(bw)), 3),
    }

    if decision:
        meta["decision"] = decision
    if reason:
        meta["reason"] = reason

    return meta


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


def _merge_adjacent_banknote_fragments(
    candidates: List[Dict[str, Any]],
    image_w: int,
    image_h: int,
) -> List[Dict[str, Any]]:
    """
    Merge 2 bounding box kề/đè nhau theo chiều ngang mà thực ra là fragment
    của cùng 1 tờ tiền bị heuristic cắt nhầm thành 2 object riêng.

    Ví dụ: tờ 2000 VND bị split thành box-trái và box-phải vì contour detector
    không tìm được đường viền liền mạch. IoU giữa 2 box thấp (< NMS threshold)
    nên NMS không suppress; contained ratio thấp (< 0.84) nên nested filter bỏ qua.

    Điều kiện merge (tất cả phải đúng):
      1. y_overlap_ratio >= MERGE_Y_OVERLAP_RATIO_MIN (0.75)
      2. x_gap <= MERGE_X_GAP_MAX_RATIO * image_w (5% image_w)
      3. union area ratio <= MERGE_UNION_AREA_MAX (50% ảnh)
      4. MERGE_UNION_ASPECT_MIN <= union_aspect <= MERGE_UNION_ASPECT_MAX

    Guard chống merge nhầm 2 tờ tiền thật:
      - Không merge 2 YOLO high-confidence box (cả 2 có yolo_conf >= 0.60)
      - x_gap phải rất nhỏ (chỉ overlap hoặc khoảng cách < 5% image_w)
      - Union area không quá lớn (< 50% ảnh)

    Thuật toán: greedy — sort theo area giảm dần, duyệt từng cặp,
    merge pair đầu tiên thỏa điều kiện rồi restart.
    """
    if len(candidates) <= 1:
        return candidates

    total_area = max(1, image_w * image_h)
    _x_gap_max_px = MERGE_X_GAP_MAX_RATIO * image_w

    def _y_overlap_ratio(a: Tuple, b: Tuple) -> float:
        y1 = max(a[1], b[1])
        y2 = min(a[3], b[3])
        ov = max(0, y2 - y1)
        min_h = min(a[3] - a[1], b[3] - b[1])
        return ov / float(min_h) if min_h > 0 else 0.0

    def _x_gap(a: Tuple, b: Tuple) -> float:
        """Negative = overlap in X, positive = gap in X."""
        return float(max(a[0], b[0]) - min(a[2], b[2]))

    def _union(a: Tuple, b: Tuple) -> Tuple:
        return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))

    def _aspect(box: Tuple) -> float:
        w = max(1, box[2] - box[0])
        h = max(1, box[3] - box[1])
        return max(w / float(h), h / float(w))

    # Greedy: thử merge cho đến khi không còn cặp nào hợp lệ
    changed = True
    while changed and len(candidates) > 1:
        changed = False
        # Sort theo area giảm dần để ưu tiên box lớn làm base
        candidates = sorted(candidates, key=lambda c: _box_area(c["box"]), reverse=True)

        for i in range(len(candidates)):
            if changed:
                break
            for j in range(i + 1, len(candidates)):
                a = candidates[i]
                b = candidates[j]
                box_a = a["box"]
                box_b = b["box"]

                y_ov = _y_overlap_ratio(box_a, box_b)
                
                # CHỈ xét tiếp nếu overlap theo Y đủ lớn (chung 1 hàng ngang)
                if y_ov < MERGE_Y_OVERLAP_RATIO_MIN:
                    continue

                x_gap_px = _x_gap(box_a, box_b)
                x_gap_ratio = x_gap_px / float(image_w)
                union_box = _union(box_a, box_b)
                union_area_ratio = _box_area(union_box) / float(total_area)
                union_asp = _aspect(union_box)

                src_a = a.get("source", "unknown")
                src_b = b.get("source", "unknown")
                
                logger.info(
                    "[CropMerge] checking pair %s/%s (y_ov=%.3f, x_gap_ratio=%.3f, union_area_ratio=%.3f, union_aspect=%.2f)", 
                    i + 1, j + 1, y_ov, x_gap_ratio, union_area_ratio, union_asp
                )

                # ── Guard: Không merge 2 YOLO high-confidence box ──────────
                yolo_conf_a = a.get("yolo_conf") or 0.0
                yolo_conf_b = b.get("yolo_conf") or 0.0
                both_yolo_high = (
                    yolo_conf_a >= 0.60 and yolo_conf_b >= 0.60
                )
                if both_yolo_high:
                    logger.debug(
                        "[CropMerge] Skip pair #%s+#%s: skip_high_confidence_yolo_pair "
                        "(yolo_conf_a=%.2f yolo_conf_b=%.2f)",
                        i + 1, j + 1, yolo_conf_a, yolo_conf_b,
                    )
                    continue

                # ── Kiểm tra từng điều kiện merge ─────────────────────────
                # x_gap_px < 0 nghĩa là overlap. Nếu gap thì gap_ratio < 0.04
                if x_gap_px >= 0 and x_gap_ratio >= 0.04:
                    logger.debug(
                        "[CropMerge] Skip pair %s/%s: skip_large_x_gap "
                        "(x_gap_px=%.0f x_gap_ratio=%.3f >= 0.04)",
                        i + 1, j + 1, x_gap_px, x_gap_ratio,
                    )
                    continue

                if union_area_ratio > MERGE_UNION_AREA_MAX:
                    logger.debug(
                        "[CropMerge] Skip pair #%s+#%s: skip_union_area_too_large "
                        "(union_area=%.3f > %.2f)",
                        i + 1, j + 1, union_area_ratio, MERGE_UNION_AREA_MAX,
                    )
                    continue

                if not (MERGE_UNION_ASPECT_MIN <= union_asp <= MERGE_UNION_ASPECT_MAX):
                    logger.debug(
                        "[CropMerge] Skip pair #%s+#%s: skip_union_aspect_invalid "
                        "(union_aspect=%.2f not in [%.1f, %.1f])",
                        i + 1, j + 1, union_asp,
                        MERGE_UNION_ASPECT_MIN, MERGE_UNION_ASPECT_MAX,
                    )
                    continue

                # ── Thực hiện merge ────────────────────────────────────────
                merged = {
                    "box": union_box,
                    "score": max(
                        float(a.get("score", 0)),
                        float(b.get("score", 0)),
                    ),
                    "source": f"merged({src_a}+{src_b})",
                    # Giữ yolo_conf thấp hơn (bảo thủ hơn) nếu cả 2 là YOLO
                    "yolo_conf": (
                        min(yolo_conf_a, yolo_conf_b)
                        if (yolo_conf_a and yolo_conf_b)
                        else (yolo_conf_a or yolo_conf_b or None)
                    ),
                    "yolo_class": a.get("yolo_class") or b.get("yolo_class"),
                }

                logger.info(
                    "[CropMerge] merged pair %s/%s -> %s (union_area_ratio=%.3f aspect=%.2f)",
                    i + 1, j + 1, union_box, union_area_ratio, union_asp
                )

                # Thay thế cả 2 bằng merged trong candidates
                new_candidates = [
                    c for idx, c in enumerate(candidates) if idx not in (i, j)
                ]
                new_candidates.append(merged)
                candidates = new_candidates
                changed = True
                break  # restart while loop với danh sách mới

    return candidates


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




def _run_ag0_on_candidates(
    candidates: List[Dict[str, Any]],
    img: "np.ndarray",
    image_w: int,
    image_h: int,
    provider_label: str,
) -> Dict:
    """
    Chạy AG0 check trên toàn bộ candidates.
    Returns: {"valid": [KEEP/REVIEW items], "dropped": [metadata of DROP items]}
    """
    valid: List[Dict[str, Any]] = []
    dropped: List[Dict[str, Any]] = []
    keep_count = 0
    review_count = 0
    drop_count = 0

    for item in candidates:
        box = item["box"]
        expanded = _expand_box(box, image_w, image_h, pad_ratio=0.055)
        x1, y1, x2, y2 = expanded

        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            drop_count += 1
            dropped.append({
                "bbox": [x1, y1, x2, y2],
                "source": item.get("source", "unknown"),
                "crop_checker": {
                    "action": "DROP",
                    "confidence": 1.0,
                    "reason": "Empty crop after box expansion.",
                    "metrics": {},
                },
            })
            continue

        yolo_conf = item.get("yolo_conf")
        source = item.get("source", "unknown")

        ag0_result = check_crop(
            crop_img=crop,
            original_img=img,
            box=box,
            source=source,
            yolo_conf=yolo_conf,
        )

        action = ag0_result.get("action", "REVIEW")
        conf = _safe_float(ag0_result.get("confidence"), 0.5)
        reason = ag0_result.get("reason", "")
        metrics = ag0_result.get("metrics", {})
        if not isinstance(metrics, dict):
            metrics = {}

        logger.info(
            "[AG0] source=%s bbox=[%s,%s,%s,%s] action=%s confidence=%.3f reason=%s",
            source, x1, y1, x2, y2, action, conf, str(reason)[:120],
        )

        crop_checker_meta = {
            "action": action,
            "confidence": round(conf, 3),
            "reason": reason,
            "metrics": metrics,
        }

        if action == "DROP":
            drop_count += 1
            dropped.append({
                "bbox": [x1, y1, x2, y2],
                "source": source,
                "crop_checker": crop_checker_meta,
            })
        else:
            if action == "KEEP":
                keep_count += 1
            else:
                review_count += 1
            valid.append({**item, "_ag0_result": ag0_result, "_expanded_box": expanded})

    logger.info(
        "[AG0] provider=%s before=%s keep=%s review=%s drop=%s",
        provider_label, len(candidates), keep_count, review_count, drop_count,
    )
    return {"valid": valid, "dropped": dropped}


def _apply_nms_merge_nested(
    candidates: List[Dict[str, Any]],
    image_w: int,
    image_h: int,
) -> List[Dict[str, Any]]:
    """NMS -> merge fragment -> nested filter."""
    candidates = _non_max_suppression(candidates, iou_threshold=CROP_NMS_IOU_THRESHOLD)
    logger.info("[CropProvider] after NMS count = %s", len(candidates))

    before_merge = len(candidates)
    candidates = _merge_adjacent_banknote_fragments(candidates, image_w, image_h)
    after_merge = len(candidates)
    logger.info("[CropProvider] after merge count = %s", after_merge)
    if after_merge < before_merge:
        logger.info(
            "[CropMerge] Merged %s fragment(s): %s -> %s candidate(s).",
            before_merge - after_merge, before_merge, after_merge,
        )

    candidates = _remove_nested_fragment_candidates(candidates, image_w, image_h)
    logger.info("[CropProvider] after nested count = %s", len(candidates))
    return candidates


def detect_banknote_objects(
    image_bytes: bytes,
    max_objects: int = 5,
) -> List[Dict[str, Any]]:
    """
    Trả về danh sách object đã crop, có metadata để pipeline chạy từng tờ tiền.
    Không dùng OCR ở đây; chỉ tách vùng ảnh.

    AG0 Crop Checker được tích hợp theo luồng:
      YOLO candidates -> AG0 -> nếu valid_yolo=0 -> OpenCV fallback -> AG0
      -> nếu valid_opencv=0 -> trả list rỗng (no_banknote_detected)
      (không dùng original_fallback sau khi AG0 drop hết)
    """
    # -- Decode ảnh — nếu lỗi thì dùng original_fallback (legacy decode exception) -
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
                "crop_checker": None,
            }
        ]

    image_h, image_w = img.shape[:2]

    # -- Phase 1: YOLO -> NMS -> Merge -> Nested -> AG0 ---------------------------
    yolo_raw = _yolo_crop_candidates(img)
    ag0_dropped_all: List[Dict] = []
    opencv_fallback_used = False
    valid_candidates: List[Dict[str, Any]] = []
    raw_candidate_count = 0
    crop_provider = "heuristic"
    box_selection_trace: Dict[str, Any] = {
        "max_objects": max_objects,
        "opencv_fallback_used": False,
        "providers": [],
    }

    if yolo_raw:
        crop_provider = "yolo"
        yolo_trace = {
            "provider": "yolo",
            "raw_candidates": [
                _candidate_public_meta(item, image_w, image_h, decision="RAW")
                for item in yolo_raw
            ],
            "post_filter_candidates": [],
            "rejected_boxes": [],
            "ag0_dropped": [],
            "valid_count": 0,
        }
        logger.info("[CropYOLO] Detected %s YOLO candidate(s).", len(yolo_raw))
        logger.info("[CropProvider] raw candidates count = %s", len(yolo_raw))
        for idx, raw_item in enumerate(yolo_raw, start=1):
            _log_candidate_debug(idx, raw_item, image_w, image_h, stage="raw")

        yolo_filtered = _apply_nms_merge_nested(yolo_raw, image_w, image_h)
        yolo_filtered_keys = {_candidate_key(item) for item in yolo_filtered}
        yolo_trace["post_filter_candidates"] = [
            _candidate_public_meta(item, image_w, image_h, decision="POST_FILTER")
            for item in yolo_filtered
        ]
        yolo_trace["rejected_boxes"] = [
            _candidate_public_meta(
                item,
                image_w,
                image_h,
                decision="FILTERED",
                reason="Removed by NMS, merge, or nested-fragment filtering.",
            )
            for item in yolo_raw
            if _candidate_key(item) not in yolo_filtered_keys
        ]
        raw_candidate_count = len(yolo_filtered)

        yolo_limited = sorted(
            yolo_filtered[:max_objects],
            key=lambda it: (it["box"][1] // 50, it["box"][0]),
        )

        if ENABLE_AG0_CHECKER:
            ag0_yolo = _run_ag0_on_candidates(yolo_limited, img, image_w, image_h, "yolo")
            ag0_dropped_all.extend(ag0_yolo["dropped"])
            valid_candidates = ag0_yolo["valid"]
            yolo_trace["ag0_dropped"] = ag0_yolo["dropped"]
            yolo_trace["valid_count"] = len(valid_candidates)
        else:
            logger.info("[AG0] Checker disabled (ENABLE_AG0_CHECKER=false), skipping.")
            valid_candidates = yolo_limited
            yolo_trace["valid_count"] = len(valid_candidates)

        box_selection_trace["providers"].append(yolo_trace)

        if valid_candidates:
            logger.info(
                "[AG0] opencv_fallback_used=False (YOLO valid=%s)", len(valid_candidates)
            )
        else:
            logger.info("[AG0] YOLO valid=0 after AG0. Will try OpenCV fallback.")
    else:
        if _get_crop_yolo_model() is not None:
            logger.info("[CropYOLO] No detections from YOLO model.")

    # -- Phase 2: OpenCV Heuristics Fallback — chỉ nếu YOLO cho 0 valid ----------
    if not valid_candidates:
        opencv_fallback_used = True
        box_selection_trace["opencv_fallback_used"] = True
        logger.info("[AG0] opencv_fallback_used=True")

        contour_cands = _find_contour_candidates(img)
        hsplit_cands = _find_horizontal_split_candidates(img)
        color_cands = _find_color_block_candidates(img)

        opencv_raw: List[Dict[str, Any]] = []
        opencv_raw.extend(contour_cands)
        opencv_raw.extend(hsplit_cands)
        opencv_raw.extend(color_cands)
        opencv_trace = {
            "provider": "opencv",
            "raw_counts": {
                "contour": len(contour_cands),
                "horizontal_split": len(hsplit_cands),
                "color_block": len(color_cands),
            },
            "raw_candidates": [
                _candidate_public_meta(item, image_w, image_h, decision="RAW")
                for item in opencv_raw
            ],
            "post_filter_candidates": [],
            "rejected_boxes": [],
            "ag0_dropped": [],
            "valid_count": 0,
        }

        logger.info(
            "[Crop] Heuristic provider: contour=%s h_split=%s color=%s total=%s",
            len(contour_cands), len(hsplit_cands), len(color_cands), len(opencv_raw),
        )

        if opencv_raw:
            logger.info("[CropProvider] raw candidates count = %s", len(opencv_raw))
            for idx, raw_item in enumerate(opencv_raw, start=1):
                _log_candidate_debug(idx, raw_item, image_w, image_h, stage="raw")

            opencv_filtered = _apply_nms_merge_nested(opencv_raw, image_w, image_h)
            opencv_filtered_keys = {_candidate_key(item) for item in opencv_filtered}
            opencv_trace["post_filter_candidates"] = [
                _candidate_public_meta(item, image_w, image_h, decision="POST_FILTER")
                for item in opencv_filtered
            ]
            opencv_trace["rejected_boxes"] = [
                _candidate_public_meta(
                    item,
                    image_w,
                    image_h,
                    decision="FILTERED",
                    reason="Removed by NMS, merge, or nested-fragment filtering.",
                )
                for item in opencv_raw
                if _candidate_key(item) not in opencv_filtered_keys
            ]
            raw_candidate_count = len(opencv_filtered)

            opencv_limited = sorted(
                opencv_filtered[:max_objects],
                key=lambda it: (it["box"][1] // 50, it["box"][0]),
            )

            if ENABLE_AG0_CHECKER:
                ag0_opencv = _run_ag0_on_candidates(
                    opencv_limited, img, image_w, image_h, "opencv"
                )
                ag0_dropped_all.extend(ag0_opencv["dropped"])
                valid_candidates = ag0_opencv["valid"]
                opencv_trace["ag0_dropped"] = ag0_opencv["dropped"]
                opencv_trace["valid_count"] = len(valid_candidates)
            else:
                valid_candidates = opencv_limited
                opencv_trace["valid_count"] = len(valid_candidates)
        else:
            logger.info("[Crop] No heuristic candidates found.")

        box_selection_trace["providers"].append(opencv_trace)

    # -- Phase 3: Nếu vẫn không có valid candidate -> trả list rỗng ---------------
    if not valid_candidates:
        logger.info(
            "[AG0] All candidates dropped by AG0 Checker. "
            "Returning empty list (no_banknote_detected). "
            "opencv_fallback_used=%s dropped_total=%s",
            opencv_fallback_used, len(ag0_dropped_all),
        )
        # Trả list rỗng — recognition_service sẽ xử lý no_banknote_detected
        # KHÔNG dùng original_fallback sau khi AG0 đã xác nhận toàn bộ là rác
        return []

    # -- Phase 4: Build final crop objects từ valid_candidates --------------------
    objects: List[Dict[str, Any]] = []

    for index, item in enumerate(valid_candidates, start=1):
        box = item["box"]
        expanded = item.get("_expanded_box") or _expand_box(box, image_w, image_h, pad_ratio=0.055)
        x1, y1, x2, y2 = expanded

        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            continue

        crop_bytes = _encode_crop(crop)
        if not crop_bytes:
            continue

        crop_h, crop_w = crop.shape[:2]
        area_ratio = _box_area(expanded) / float(max(1, image_w * image_h))
        aspect_ratio = round(
            max(crop_w / float(max(1, crop_h)), crop_h / float(max(1, crop_w))), 3
        )
        confidence = max(0.35, min(0.98, 0.45 + area_ratio))

        # AG0 result đã tính ở Phase 1/2
        ag0_result = item.get("_ag0_result") or {}
        ag0_metrics = ag0_result.get("metrics", {})
        if not isinstance(ag0_metrics, dict):
            ag0_metrics = {}
        crop_checker_meta = {
            "action": ag0_result.get("action", "REVIEW"),
            "confidence": round(_safe_float(ag0_result.get("confidence"), 0.5), 3),
            "reason": ag0_result.get("reason", ""),
            "metrics": ag0_metrics,
        }
        selected_box_reason = (
            f"{item.get('source', 'unknown')} candidate accepted by AG0 as "
            f"{crop_checker_meta['action']}: {crop_checker_meta.get('reason', '')}"
        )
        rejected_boxes = []
        for provider_trace in box_selection_trace.get("providers", []):
            rejected_boxes.extend(provider_trace.get("rejected_boxes") or [])
            rejected_boxes.extend(provider_trace.get("ag0_dropped") or [])

        # Soft texture warning (giữ lại để backward-compat với log cũ)
        texture_var = _compute_texture_variance(crop)
        if texture_var < CROP_TEXTURE_WARN_VARIANCE:
            logger.warning(
                "[CropTexture] Candidate #%s (source=%s) texture_variance=%.1f < %.1f. "
                "AG0 action=%s.",
                index, item.get("source", "unknown"),
                texture_var, CROP_TEXTURE_WARN_VARIANCE,
                crop_checker_meta["action"],
            )
        else:
            logger.debug(
                "[CropTexture] Candidate #%s (source=%s): texture_variance=%.1f OK",
                index, item.get("source", "unknown"), texture_var,
            )

        logger.info(
            "[CropFinal] #%s: source=%s bbox=[%s,%s,%s,%s] "
            "area_ratio=%.3f aspect=%.2f texture_var=%.1f confidence=%.3f ag0=%s",
            index, item.get("source", "unknown"),
            x1, y1, x2, y2,
            area_ratio, aspect_ratio, texture_var, confidence,
            crop_checker_meta["action"],
        )

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
                "yolo_conf": item.get("yolo_conf"),
                "yolo_class": item.get("yolo_class"),
                "crop_checker": crop_checker_meta,
                "selected_box_reason": selected_box_reason,
                "box_selection_trace": box_selection_trace if index == 1 else None,
                "rejected_boxes": rejected_boxes if index == 1 else [],
                # Dropped candidates metadata — chỉ attach vào object đầu tiên
                # để recognition_service có thể log/debug khi cần
                "_ag0_dropped": ag0_dropped_all if index == 1 else [],
            }
        )

    logger.info(
        "Returned %s final crop object(s) from %s raw candidate(s). "
        "opencv_fallback=%s dropped_total=%s",
        len(objects), raw_candidate_count,
        opencv_fallback_used, len(ag0_dropped_all),
    )
    return objects






def detect_and_crop_banknotes(image_bytes: bytes) -> List[bytes]:
    """
    Backward compatible API cho code cũ, nhưng không được bypass AG0.

    Nếu AG0 bật và detect_banknote_objects trả [] nghĩa là YOLO/OpenCV
    đều không có crop hợp lệ sau AG0 Checker. Khi đó trả [] để caller
    xử lý no_banknote_detected, không fallback ảnh gốc.

    Chỉ fallback ảnh gốc khi:
    - ENABLE_AG0_CHECKER=false (AG0 tắt), hoặc
    - ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK=true (legacy mode bật tường minh).
    """
    objects = detect_banknote_objects(image_bytes=image_bytes, max_objects=5)
    crop_bytes_list = [
        item["crop_bytes"]
        for item in objects
        if item.get("crop_bytes")
    ]

    if crop_bytes_list:
        return crop_bytes_list

    if ENABLE_AG0_CHECKER and not ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK:
        logger.info(
            "[AG0] detect_and_crop_banknotes: no valid crop, return [] "
            "instead of original_fallback (ENABLE_AG0_CHECKER=true, "
            "ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK=false)."
        )
        return []

    logger.info(
        "[AG0] detect_and_crop_banknotes: legacy original_fallback enabled or "
        "AG0 disabled — returning original image bytes."
    )
    return [image_bytes]
