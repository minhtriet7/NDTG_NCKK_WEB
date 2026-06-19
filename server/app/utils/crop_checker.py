"""
AG0 Crop Checker — rule-based OpenCV validator
===============================================
Kiểm định chất lượng từng vùng crop ảnh trước khi đưa vào Agent 1/2/3.
Không nhận diện mệnh giá. Chỉ trả lời: "Crop này có thể là tiền giấy không?"

Kết quả output:
  - KEEP   : đủ bằng chứng là tiền giấy, gửi vào Agent 1/2/3
  - REVIEW : không chắc chắn, vẫn gửi vào Agent 1/2/3 nhưng gắn cờ cảnh báo
  - DROP   : chắc chắn là rác/nền, KHÔNG gửi vào Agent 1/2/3

Quy tắc cốt lõi:
  - DROP chỉ khi tổ hợp NHIỀU điều kiện xấu đồng thời.
  - Nếu không chắc → REVIEW (tuyệt đối không DROP nhầm tiền thật).
  - Background Score cao đơn lẻ KHÔNG đủ để DROP.
  - yolo_conf cao đơn lẻ KHÔNG đủ để KEEP.
"""

import os
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np

from app.core.logger import get_logger

logger = get_logger(__name__)

# ============================================================
# Feature flag — đọc từ env
# ============================================================

ENABLE_AG0_CHECKER: bool = os.getenv("ENABLE_AG0_CHECKER", "true").lower() == "true"

# ============================================================
# Ngưỡng phân loại — đọc từ env với fallback hardcoded
# Thay đổi qua env để rollback/tinh chỉnh không cần sửa code.
# ============================================================

# --- DROP thresholds (tổ hợp, không phải đơn lẻ) ---
AG0_DROP_AREA_RATIO_MIN = float(os.getenv("AG0_DROP_AREA_RATIO_MIN", "0.01"))
AG0_DROP_TEXTURE_MIN = float(os.getenv("AG0_DROP_TEXTURE_MIN", "12.0"))
AG0_DROP_EDGE_MIN = float(os.getenv("AG0_DROP_EDGE_MIN", "0.01"))
AG0_DROP_CONTRAST_MIN = float(os.getenv("AG0_DROP_CONTRAST_MIN", "10.0"))
AG0_DROP_BACKGROUND_MAX = float(os.getenv("AG0_DROP_BACKGROUND_MAX", "0.85"))

# --- KEEP thresholds ---
AG0_KEEP_TEXTURE_MIN = float(os.getenv("AG0_KEEP_TEXTURE_MIN", "50.0"))
AG0_KEEP_EDGE_MIN = float(os.getenv("AG0_KEEP_EDGE_MIN", "0.04"))
AG0_KEEP_CONTRAST_MIN = float(os.getenv("AG0_KEEP_CONTRAST_MIN", "10.0"))
AG0_KEEP_ASPECT_MIN = float(os.getenv("AG0_KEEP_ASPECT_MIN", "1.2"))
AG0_KEEP_ASPECT_MAX = float(os.getenv("AG0_KEEP_ASPECT_MAX", "3.5"))

# --- YOLO confidence levels ---
AG0_YOLO_HIGH_CONF = float(os.getenv("AG0_YOLO_HIGH_CONF", "0.70"))
AG0_YOLO_MEDIUM_CONF = float(os.getenv("AG0_YOLO_MEDIUM_CONF", "0.30"))

# --- Brightness sanity ---
AG0_BRIGHTNESS_MIN = float(os.getenv("AG0_BRIGHTNESS_MIN", "20.0"))   # quá tối
AG0_BRIGHTNESS_MAX = float(os.getenv("AG0_BRIGHTNESS_MAX", "245.0"))  # quá sáng/lóa


# ============================================================
# Helpers
# ============================================================

def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img is None or img.size == 0:
        return np.zeros((1, 1), dtype=np.uint8)
    if len(img.shape) == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _clip01(value: Any) -> float:
    return max(0.0, min(1.0, _safe_float(value, 0.0)))


def _normalized_color_entropy(crop_img: np.ndarray) -> float:
    """Entropy của histogram màu BGR lượng tử hóa 4x4x4, chuẩn hóa về 0..1."""
    try:
        reduced = cv2.resize(
            crop_img,
            (min(256, crop_img.shape[1]), min(256, crop_img.shape[0])),
            interpolation=cv2.INTER_AREA,
        )
        bins = (reduced.astype(np.uint16) // 64).reshape(-1, 3)
        indexes = (bins[:, 0] * 16 + bins[:, 1] * 4 + bins[:, 2]).astype(np.int64)
        counts = np.bincount(indexes, minlength=64).astype(np.float64)
        probabilities = counts[counts > 0] / max(1.0, counts.sum())
        entropy = -float(np.sum(probabilities * np.log2(probabilities)))
        return _clip01(entropy / 6.0)
    except Exception:
        return 0.0


def _compute_structural_metrics(gray: np.ndarray, edges: np.ndarray) -> Dict[str, float]:
    """
    Metric shadow để phân biệt texture tự nhiên với tài liệu/sơ đồ:
    đường thẳng dài, khung chữ nhật và edge thiên mạnh theo một hướng.
    """
    h, w = gray.shape[:2]
    total_pixels = max(1, h * w)
    diagonal = max(1.0, float(np.hypot(w, h)))

    long_line_density = 0.0
    try:
        min_line_length = max(20, int(min(h, w) * 0.22))
        lines = cv2.HoughLinesP(
            edges,
            1,
            np.pi / 180,
            threshold=max(18, int(min(h, w) * 0.08)),
            minLineLength=min_line_length,
            maxLineGap=max(4, int(min(h, w) * 0.025)),
        )
        if lines is not None:
            total_line_length = 0.0
            axis_aligned_line_length = 0.0
            for x1, y1, x2, y2 in lines[:, 0]:
                line_length = float(np.hypot(x2 - x1, y2 - y1))
                total_line_length += line_length
                angle = abs(float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))) % 180.0
                axis_distance = min(angle, abs(90.0 - angle), abs(180.0 - angle))
                if axis_distance <= 10.0:
                    axis_aligned_line_length += line_length

            # Sơ đồ/tài liệu thường có nhiều đường dài nằm ngang/dọc đồng thời.
            # Nhân tỷ lệ hướng trục với mức phủ đường thẳng để tránh ảnh tiền có
            # texture dày làm metric bão hòa chỉ vì Hough tìm được nhiều line.
            if total_line_length > 0:
                axis_aligned_ratio = axis_aligned_line_length / total_line_length
                line_coverage = _clip01(total_line_length / (diagonal * 8.0))
                long_line_density = _clip01(axis_aligned_ratio * line_coverage)
    except Exception:
        long_line_density = 0.0

    rectangle_like_density = 0.0
    try:
        contours, _ = cv2.findContours(
            edges,
            cv2.RETR_LIST,
            cv2.CHAIN_APPROX_SIMPLE,
        )
        rectangle_area = 0.0
        for contour in contours:
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 0:
                continue
            polygon = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
            if len(polygon) != 4 or not cv2.isContourConvex(polygon):
                continue
            area = float(abs(cv2.contourArea(polygon)))
            area_ratio = area / float(total_pixels)
            if 0.003 <= area_ratio <= 0.80:
                rectangle_area += area
        rectangle_like_density = _clip01(rectangle_area / float(total_pixels))
    except Exception:
        rectangle_like_density = 0.0

    directional_edge_ratio = 0.0
    try:
        grad_x = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
        grad_y = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
        x_energy = float(np.sum(grad_x))
        y_energy = float(np.sum(grad_y))
        total_energy = x_energy + y_energy
        if total_energy > 0:
            directional_edge_ratio = max(x_energy, y_energy) / total_energy
    except Exception:
        directional_edge_ratio = 0.0

    return {
        "long_line_density": round(long_line_density, 5),
        "rectangle_like_density": round(rectangle_like_density, 5),
        "directional_edge_ratio": round(directional_edge_ratio, 5),
    }


def _compute_background_score(
    crop_img: np.ndarray,
    original_img: np.ndarray,
    border_ratio: float = 0.08,
) -> Optional[float]:
    """
    Tính độ tương đồng màu sắc (Histogram HSV correlation) giữa crop
    và vùng biên của ảnh gốc (ước lượng màu nền).

    Trả về None nếu không tính được (ảnh quá nhỏ, ảnh gốc không có).
    """
    if original_img is None or original_img.size == 0:
        return None
    if crop_img is None or crop_img.size == 0:
        return None

    try:
        oh, ow = original_img.shape[:2]
        bh = max(1, int(oh * border_ratio))
        bw = max(1, int(ow * border_ratio))

        # Lấy 4 dải biên của ảnh gốc làm "mẫu nền"
        top = original_img[:bh, :]
        bottom = original_img[oh - bh:, :]
        left = original_img[bh:oh - bh, :bw]
        right = original_img[bh:oh - bh, ow - bw:]

        parts = [p for p in [top, bottom, left, right] if p.size > 0]
        if not parts:
            return None

        border_sample = np.vstack([p.reshape(-1, p.shape[-1]) for p in parts])
        border_sample_img = border_sample.reshape(1, -1, border_sample.shape[-1])

        if border_sample_img.shape[1] < 10:
            return None

        # Chuẩn bị border_sample_img thành ảnh 2D
        bg_img = border_sample.reshape(-1, 1, 3).astype(np.uint8)
        if bg_img.shape[0] < 4:
            return None

        crop_hsv = cv2.cvtColor(crop_img, cv2.COLOR_BGR2HSV)
        bg_hsv = cv2.cvtColor(bg_img, cv2.COLOR_BGR2HSV)

        h_bins, s_bins = 32, 32
        hist_range_h = [0, 180]
        hist_range_s = [0, 256]

        crop_h_hist = cv2.calcHist([crop_hsv], [0], None, [h_bins], hist_range_h)
        crop_s_hist = cv2.calcHist([crop_hsv], [1], None, [s_bins], hist_range_s)
        bg_h_hist = cv2.calcHist([bg_hsv], [0], None, [h_bins], hist_range_h)
        bg_s_hist = cv2.calcHist([bg_hsv], [1], None, [s_bins], hist_range_s)

        cv2.normalize(crop_h_hist, crop_h_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        cv2.normalize(crop_s_hist, crop_s_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        cv2.normalize(bg_h_hist, bg_h_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        cv2.normalize(bg_s_hist, bg_s_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

        corr_h = cv2.compareHist(crop_h_hist, bg_h_hist, cv2.HISTCMP_CORREL)
        corr_s = cv2.compareHist(crop_s_hist, bg_s_hist, cv2.HISTCMP_CORREL)

        score = (float(corr_h) + float(corr_s)) / 2.0
        return max(0.0, min(1.0, score))

    except Exception as exc:
        logger.debug("[AG0/background_score] error: %s", exc)
        return None


# ============================================================
# Public API
# ============================================================

def compute_crop_metrics(
    crop_img: np.ndarray,
    original_img: Optional[np.ndarray] = None,
    box: Optional[Tuple[int, int, int, int]] = None,
) -> Dict[str, Any]:
    """
    Tính toàn bộ metrics OpenCV cho một vùng crop.

    Args:
        crop_img     : ảnh crop BGR (numpy array).
        original_img : ảnh gốc BGR (dùng để tính background_score). Có thể None.
        box          : (x1, y1, x2, y2) tọa độ trong ảnh gốc (dùng tính area_ratio).

    Returns:
        dict với các key: area_ratio, aspect_ratio, texture_variance,
        edge_density, brightness, contrast, background_score.
    """
    if crop_img is None or crop_img.size == 0:
        return {
            "area_ratio": 0.0,
            "aspect_ratio": 1.0,
            "texture_variance": 0.0,
            "edge_density": 0.0,
            "brightness": 0.0,
            "contrast": 0.0,
            "background_score": None,
            "white_ratio": 0.0,
            "color_entropy": 0.0,
            "color_richness": 0.0,
            "saturation_mean": 0.0,
            "long_line_density": 0.0,
            "rectangle_like_density": 0.0,
            "directional_edge_ratio": 0.0,
        }

    h, w = crop_img.shape[:2]

    # --- area_ratio ---
    area_ratio: float = 0.0
    if box is not None and original_img is not None:
        try:
            x1, y1, x2, y2 = box
            box_area = max(0, x2 - x1) * max(0, y2 - y1)
            img_area = original_img.shape[0] * original_img.shape[1]
            area_ratio = box_area / float(img_area) if img_area > 0 else 0.0
        except Exception:
            area_ratio = 0.0
    elif original_img is not None:
        # Ước lượng từ kích thước crop so với ảnh gốc
        img_area = original_img.shape[0] * original_img.shape[1]
        area_ratio = (h * w) / float(img_area) if img_area > 0 else 0.0
    else:
        # Không có ảnh gốc — để 0.5 (neutral, không bị DROP vì area)
        area_ratio = 0.5

    # --- aspect_ratio ---
    aspect_ratio = max(w / float(max(h, 1)), h / float(max(w, 1)))

    gray = _to_gray(crop_img)

    # --- texture_variance (Laplacian) ---
    try:
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        texture_variance = float(laplacian.var())
    except Exception:
        texture_variance = 0.0

    # --- edge_density (Canny) ---
    try:
        edges = cv2.Canny(gray, 50, 150)
        total_pixels = max(1, gray.shape[0] * gray.shape[1])
        edge_density = float(np.count_nonzero(edges)) / total_pixels
    except Exception:
        edges = np.zeros_like(gray)
        edge_density = 0.0

    # --- brightness (mean gray) ---
    try:
        brightness = float(np.mean(gray))
    except Exception:
        brightness = 0.0

    # --- contrast (std gray) ---
    try:
        contrast = float(np.std(gray))
    except Exception:
        contrast = 0.0

    # --- background_score ---
    background_score = _compute_background_score(crop_img, original_img)

    # --- Shadow-only document/banknote explainability metrics ---
    try:
        hsv = cv2.cvtColor(crop_img, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        white_ratio = float(
            np.mean((value >= 235) & (saturation <= 35))
        )
        saturation_mean = float(np.mean(saturation))
    except Exception:
        white_ratio = 0.0
        saturation_mean = 0.0

    color_entropy = _normalized_color_entropy(crop_img)
    structural_metrics = _compute_structural_metrics(gray, edges)

    return {
        "area_ratio": round(area_ratio, 5),
        "aspect_ratio": round(aspect_ratio, 3),
        "texture_variance": round(texture_variance, 2),
        "edge_density": round(edge_density, 5),
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "background_score": round(background_score, 4) if background_score is not None else None,
        "white_ratio": round(white_ratio, 5),
        "color_entropy": round(color_entropy, 5),
        "color_richness": round(color_entropy, 5),
        "saturation_mean": round(saturation_mean, 2),
        **structural_metrics,
    }


def classify_crop(
    metrics: Dict[str, Any],
    source: str = "unknown",
    yolo_conf: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Phân loại crop dựa trên metrics + source + yolo_conf.

    Returns dict:
        action     : "KEEP" | "REVIEW" | "DROP"
        confidence : 0.0–1.0 (ước lượng mức độ chắc chắn của quyết định)
        reason     : chuỗi giải thích ngắn gọn
    """
    area_ratio = _safe_float(metrics.get("area_ratio"), 0.5)
    aspect_ratio = _safe_float(metrics.get("aspect_ratio"), 2.0)
    texture_variance = _safe_float(metrics.get("texture_variance"), 0.0)
    edge_density = _safe_float(metrics.get("edge_density"), 0.0)
    brightness = _safe_float(metrics.get("brightness"), 128.0)
    contrast = _safe_float(metrics.get("contrast"), 0.0)
    background_score = metrics.get("background_score")  # có thể None

    yolo_conf_val = _safe_float(yolo_conf, 0.0) if yolo_conf is not None else None
    yolo_high = yolo_conf_val is not None and yolo_conf_val >= AG0_YOLO_HIGH_CONF
    yolo_medium = yolo_conf_val is not None and yolo_conf_val >= AG0_YOLO_MEDIUM_CONF

    reasons: list = []

    # ── Kiểm tra DROP đơn lẻ (area quá nhỏ) ─────────────────────────────────
    if area_ratio < AG0_DROP_AREA_RATIO_MIN:
        return {
            "action": "DROP",
            "confidence": 0.97,
            "reason": f"Area ratio {area_ratio:.4f} < {AG0_DROP_AREA_RATIO_MIN} (too small to be a banknote)",
        }

    # ── Kiểm tra DROP tổ hợp ──────────────────────────────────────────────────
    # Phải đồng thời xấu ở texture + edge + contrast + (background nếu có)
    texture_is_very_bad = texture_variance < AG0_DROP_TEXTURE_MIN
    edge_is_very_bad = edge_density < AG0_DROP_EDGE_MIN
    contrast_is_very_bad = contrast < AG0_DROP_CONTRAST_MIN
    background_is_high = (
        background_score is not None and background_score > AG0_DROP_BACKGROUND_MAX
    )

    drop_combo_bad_metrics = texture_is_very_bad and edge_is_very_bad and contrast_is_very_bad

    # Trường hợp tổ hợp 4 điều kiện (có background score)
    if drop_combo_bad_metrics and background_is_high:
        return {
            "action": "DROP",
            "confidence": 0.93,
            "reason": (
                f"All quality metrics are very poor: "
                f"texture={texture_variance:.1f} (< {AG0_DROP_TEXTURE_MIN}), "
                f"edge={edge_density:.4f} (< {AG0_DROP_EDGE_MIN}), "
                f"contrast={contrast:.1f} (< {AG0_DROP_CONTRAST_MIN}), "
                f"background_score={background_score:.3f} (> {AG0_DROP_BACKGROUND_MAX}). "
                f"Crop is likely background/plain surface."
            ),
        }

    # Trường hợp tổ hợp 3 điều kiện metrics mà không có background (rất chắc là rác)
    if drop_combo_bad_metrics and background_score is None:
        # Không có background_score → nới lỏng hơn, chỉ DROP nếu cực xấu
        if (
            texture_variance < AG0_DROP_TEXTURE_MIN * 0.5
            and edge_density < AG0_DROP_EDGE_MIN * 0.5
            and contrast < AG0_DROP_CONTRAST_MIN * 0.5
        ):
            return {
                "action": "DROP",
                "confidence": 0.85,
                "reason": (
                    f"Metrics extremely poor (no background reference available): "
                    f"texture={texture_variance:.1f}, "
                    f"edge={edge_density:.4f}, "
                    f"contrast={contrast:.1f}. Likely plain background."
                ),
            }

    # ── Kiểm tra điều kiện KEEP ────────────────────────────────────────────────
    texture_good = texture_variance >= AG0_KEEP_TEXTURE_MIN
    edge_good = edge_density >= AG0_KEEP_EDGE_MIN
    contrast_good = contrast >= AG0_KEEP_CONTRAST_MIN
    aspect_normal = AG0_KEEP_ASPECT_MIN <= aspect_ratio <= AG0_KEEP_ASPECT_MAX
    background_low = background_score is None or background_score <= 0.50

    metrics_good_count = sum([texture_good, edge_good, contrast_good])

    if texture_good and edge_good and contrast_good and aspect_normal and background_low:
        keep_conf = 0.92
        if yolo_high:
            keep_conf = min(0.98, keep_conf + 0.05)
        return {
            "action": "KEEP",
            "confidence": round(keep_conf, 3),
            "reason": (
                f"Good texture ({texture_variance:.1f}), "
                f"edge density ({edge_density:.4f}), "
                f"contrast ({contrast:.1f}), "
                f"aspect ratio ({aspect_ratio:.2f}). "
                f"Crop is likely a banknote."
            ),
        }

    # KEEP nếu YOLO high-conf VÀ ít nhất 2/3 metrics tốt
    if yolo_high and metrics_good_count >= 2 and not drop_combo_bad_metrics:
        return {
            "action": "KEEP",
            "confidence": round(0.82 + 0.03 * metrics_good_count, 3),
            "reason": (
                f"YOLO high confidence ({yolo_conf_val:.2f}) combined with "
                f"{metrics_good_count}/3 good metrics. Accepted as banknote."
            ),
        }

    # ── REVIEW — mọi trường hợp còn lại ──────────────────────────────────────
    # Tổng hợp lý do tại sao không đủ KEEP nhưng chưa đủ DROP
    if yolo_high and drop_combo_bad_metrics:
        reasons.append(
            f"YOLO confidence high ({yolo_conf_val:.2f}) but metrics are poor "
            f"(texture={texture_variance:.1f}, edge={edge_density:.4f}, contrast={contrast:.1f}). "
            f"Sending to agents for final decision."
        )
    elif yolo_medium and not drop_combo_bad_metrics:
        reasons.append(
            f"YOLO confidence moderate ({yolo_conf_val:.2f}). "
            f"Metrics marginal: texture={texture_variance:.1f}, "
            f"edge={edge_density:.4f}, contrast={contrast:.1f}."
        )
    elif not aspect_normal:
        reasons.append(
            f"Unusual aspect ratio ({aspect_ratio:.2f}), "
            f"possibly folded or partial banknote."
        )
    elif background_score is not None and background_score > AG0_DROP_BACKGROUND_MAX:
        reasons.append(
            f"Background score is high ({background_score:.3f}) but texture/edge/contrast "
            f"suggest possible banknote content. Not dropping."
        )
    else:
        reasons.append(
            f"Marginal quality: texture={texture_variance:.1f}, "
            f"edge={edge_density:.4f}, contrast={contrast:.1f}. "
            f"Cannot confirm but not dropping."
        )

    return {
        "action": "REVIEW",
        "confidence": round(0.45 + 0.05 * min(metrics_good_count, 3), 3),
        "reason": " | ".join(reasons) if reasons else "Marginal metrics, sent for agent review.",
    }


def build_shadow_explainability(
    metrics: Dict[str, Any],
    action: str,
    confidence: float,
    source: str = "unknown",
    yolo_conf: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Tính explainability/policy shadow. Hàm này KHÔNG thay đổi action thật và
    KHÔNG được dùng để chặn Agent trong Phase 2B-1.
    """
    area_ratio = _safe_float(metrics.get("area_ratio"), 0.0)
    aspect_ratio = _safe_float(metrics.get("aspect_ratio"), 1.0)
    texture = _safe_float(metrics.get("texture_variance"), 0.0)
    edge_density = _safe_float(metrics.get("edge_density"), 0.0)
    contrast = _safe_float(metrics.get("contrast"), 0.0)
    white_ratio = _safe_float(metrics.get("white_ratio"), 0.0)
    color_richness = _safe_float(
        metrics.get("color_richness", metrics.get("color_entropy")),
        0.0,
    )
    saturation_mean = _safe_float(metrics.get("saturation_mean"), 0.0)
    long_line_density = _safe_float(metrics.get("long_line_density"), 0.0)
    rectangle_density = _safe_float(metrics.get("rectangle_like_density"), 0.0)
    directional_ratio = _safe_float(metrics.get("directional_edge_ratio"), 0.0)
    yolo_confidence = _safe_float(yolo_conf, 0.0) if yolo_conf is not None else 0.0

    if AG0_KEEP_ASPECT_MIN <= aspect_ratio <= AG0_KEEP_ASPECT_MAX:
        aspect_score = 1.0
    elif 1.0 <= aspect_ratio <= 4.2:
        aspect_score = 0.55
    else:
        aspect_score = 0.10

    texture_score = _clip01(np.log1p(max(texture, 0.0)) / np.log1p(800.0))
    if edge_density < 0.015:
        edge_score = _clip01(edge_density / 0.015)
    elif edge_density <= 0.24:
        edge_score = 1.0
    else:
        edge_score = _clip01(1.0 - (edge_density - 0.24) / 0.30)
    contrast_score = _clip01(contrast / 45.0)
    saturation_score = _clip01(saturation_mean / 80.0)
    area_score = 1.0 if 0.04 <= area_ratio <= 0.85 else 0.45

    banknote_score = _clip01(
        0.20 * aspect_score
        + 0.12 * texture_score
        + 0.12 * edge_score
        + 0.10 * contrast_score
        + 0.20 * color_richness
        + 0.12 * saturation_score
        + 0.06 * area_score
        + 0.08 * yolo_confidence
    )

    white_signal = _clip01((white_ratio - 0.45) / 0.45)
    low_color_signal = _clip01((0.45 - color_richness) / 0.35)
    low_saturation_signal = _clip01((45.0 - saturation_mean) / 40.0)
    long_line_signal = _clip01((long_line_density - 0.45) / 0.45)
    rectangle_signal = _clip01((rectangle_density - 0.04) / 0.36)
    directional_signal = _clip01((directional_ratio - 0.58) / 0.30)
    extreme_aspect_signal = _clip01((aspect_ratio - 3.5) / 3.0)

    document_score = _clip01(
        0.25 * white_signal
        + 0.15 * low_color_signal
        + 0.15 * low_saturation_signal
        + 0.20 * long_line_signal
        + 0.12 * rectangle_signal
        + 0.06 * directional_signal
        + 0.07 * extreme_aspect_signal
    )

    positive_evidence = []
    negative_evidence = []

    if AG0_KEEP_ASPECT_MIN <= aspect_ratio <= AG0_KEEP_ASPECT_MAX:
        positive_evidence.append(f"banknote-like aspect_ratio={aspect_ratio:.2f}")
    elif aspect_ratio > 4.2:
        negative_evidence.append(f"very elongated crop aspect_ratio={aspect_ratio:.2f}")
    if 0.04 <= area_ratio <= 0.85:
        positive_evidence.append(f"reasonable crop area_ratio={area_ratio:.3f}")
    if texture >= AG0_KEEP_TEXTURE_MIN:
        positive_evidence.append(f"rich local texture={texture:.1f}")
    if 0.025 <= edge_density <= 0.24:
        positive_evidence.append(f"usable edge density={edge_density:.4f}")
    if contrast >= AG0_KEEP_CONTRAST_MIN:
        positive_evidence.append(f"adequate contrast={contrast:.1f}")
    if color_richness >= 0.45:
        positive_evidence.append(f"color richness={color_richness:.3f}")
    if saturation_mean >= 45:
        positive_evidence.append(f"meaningful saturation={saturation_mean:.1f}")
    if yolo_confidence >= AG0_YOLO_HIGH_CONF:
        positive_evidence.append(f"YOLO banknote confidence={yolo_confidence:.2f}")

    if white_ratio >= 0.65:
        negative_evidence.append(f"large white background ratio={white_ratio:.3f}")
    if color_richness <= 0.35:
        negative_evidence.append(f"low color richness={color_richness:.3f}")
    if saturation_mean <= 35:
        negative_evidence.append(f"low mean saturation={saturation_mean:.1f}")
    if long_line_density >= 0.72:
        negative_evidence.append(f"many long straight lines={long_line_density:.3f}")
    if rectangle_density >= 0.10:
        negative_evidence.append(f"rectangle-like layout={rectangle_density:.3f}")
    if directional_ratio >= 0.72:
        negative_evidence.append(f"directional edge dominance={directional_ratio:.3f}")
    if source != "yolo_crop" and aspect_ratio > AG0_KEEP_ASPECT_MAX:
        negative_evidence.append(f"heuristic source={source} with non-banknote aspect")

    strong_banknote_evidence = (
        banknote_score >= 0.86
        or (
            AG0_KEEP_ASPECT_MIN <= aspect_ratio <= AG0_KEEP_ASPECT_MAX
            and texture >= AG0_KEEP_TEXTURE_MIN
            and 0.025 <= edge_density <= 0.24
            and contrast >= AG0_KEEP_CONTRAST_MIN
            and (color_richness >= 0.45 or saturation_mean >= 45)
        )
    )
    strong_document_structure = (
        long_line_density >= 0.72
        or rectangle_density >= 0.10
    )
    document_dominates = document_score > banknote_score * 0.75
    too_many_negative_signals = len(negative_evidence) > 1

    if action == "KEEP":
        # KEEP remains permissive for real notes on white/low-color backgrounds.
        # Only withhold a nominal KEEP when several strong document signals
        # agree and banknote evidence is not independently strong.
        agent_eligible = not (
            document_score >= 0.65
            and document_dominates
            and strong_document_structure
            and too_many_negative_signals
            and not strong_banknote_evidence
        )
    elif action == "DROP":
        agent_eligible = False
    else:
        if source == "yolo_crop":
            # YOLO confidence is supporting evidence, never the sole reason
            # for an uncertain crop to consume Agent calls.
            agent_eligible = (
                banknote_score >= 0.78
                and document_score <= 0.35
                and not too_many_negative_signals
                and not document_dominates
                and not (
                    strong_document_structure
                    and not strong_banknote_evidence
                )
            )
        else:
            # Heuristic-only crops have no YOLO confirmation, so require
            # stronger banknote evidence and a low document score.
            agent_eligible = (
                banknote_score >= 0.80
                and document_score <= 0.30
                and aspect_ratio >= 1.80
            )

    agent_eligible_shadow = agent_eligible

    if not agent_eligible:
        if action == "KEEP":
            shadow_reason = (
                "AG0 gate downgrades this nominal KEEP because strong document-like "
                "structure dominates the available banknote evidence."
            )
        elif action == "REVIEW":
            shadow_reason = (
                "AG0 gate withholds this crop from agents because it is a WEAK REVIEW: "
                f"banknote_score={banknote_score:.3f}, document_score={document_score:.3f}, "
                f"negative_evidence_count={len(negative_evidence)}, "
                f"yolo_conf={yolo_confidence:.3f}, source={source}. "
                "YOLO confidence alone is not enough to send it to AI Agents."
            )
        else:
            shadow_reason = (
                "AG0 gate withholds this crop from agents because it was marked DROP."
            )
    else:
        if action == "KEEP":
            shadow_reason = "AG0 gate allows this crop because it was marked KEEP."
        else:
            shadow_reason = (
                "AG0 gate keeps this uncertain crop agent-eligible for review because it is a STRONG REVIEW "
                "(high banknote_score, low document_score, and strong confidence)."
            )

    decision_reason = (
        f"Current AG0 action={action} confidence={confidence:.3f}. "
        f"banknote_score={banknote_score:.3f}, document_score={document_score:.3f}. "
        f"{shadow_reason}"
    )

    return {
        "ag0_action": action,
        "ag0_confidence": round(confidence, 3),
        "banknote_score": round(banknote_score, 4),
        "document_score": round(document_score, 4),
        "document_like_score": round(document_score, 4),
        "banknote_like_score": round(banknote_score, 4),
        "agent_eligible_shadow": bool(agent_eligible_shadow),
        "agent_eligible": bool(agent_eligible),
        "positive_evidence": positive_evidence,
        "negative_evidence": negative_evidence,
        "strong_banknote_evidence": bool(strong_banknote_evidence),
        "strong_document_structure": bool(strong_document_structure),
        "decision_reason": decision_reason,
    }


def check_crop(
    crop_img: np.ndarray,
    original_img: Optional[np.ndarray] = None,
    box: Optional[Tuple[int, int, int, int]] = None,
    source: str = "unknown",
    yolo_conf: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Entry-point tổng hợp: tính metrics + phân loại + trả dict chuẩn.

    Returns:
        {
          "action"     : "KEEP" | "REVIEW" | "DROP",
          "is_banknote": bool,
          "is_partial" : bool,
          "confidence" : float,
          "reason"     : str,
          "method"     : "opencv_rule",
          "metrics"    : { ... }
        }
    """
    if not ENABLE_AG0_CHECKER:
        # Feature flag tắt → bypass, coi là KEEP
        return {
            "action": "KEEP",
            "is_banknote": True,
            "is_partial": False,
            "confidence": 1.0,
            "reason": "AG0 Checker is disabled (ENABLE_AG0_CHECKER=false). Bypassing.",
            "method": "disabled",
            "metrics": {},
            "ag0_action": "KEEP",
            "ag0_confidence": 1.0,
            "banknote_score": 0.0,
            "document_score": 0.0,
            "document_like_score": 0.0,
            "banknote_like_score": 0.0,
            "agent_eligible_shadow": True,
            "agent_eligible": True,
            "positive_evidence": ["AG0 checker disabled; current behavior bypasses validation."],
            "negative_evidence": [],
            "decision_reason": "Current AG0 behavior is bypassed; shadow policy is not evaluated.",
        }

    try:
        metrics = compute_crop_metrics(crop_img, original_img=original_img, box=box)
    except Exception as exc:
        logger.warning("[AG0] compute_crop_metrics error: %s. Defaulting to REVIEW.", exc)
        metrics = {
            "area_ratio": 0.5,
            "aspect_ratio": 2.0,
            "texture_variance": 0.0,
            "edge_density": 0.0,
            "brightness": 128.0,
            "contrast": 0.0,
            "background_score": None,
            "white_ratio": 0.0,
            "color_entropy": 0.0,
            "color_richness": 0.0,
            "saturation_mean": 0.0,
            "long_line_density": 0.0,
            "rectangle_like_density": 0.0,
            "directional_edge_ratio": 0.0,
        }

    try:
        classification = classify_crop(metrics, source=source, yolo_conf=yolo_conf)
    except Exception as exc:
        logger.warning("[AG0] classify_crop error: %s. Defaulting to REVIEW.", exc)
        classification = {
            "action": "REVIEW",
            "confidence": 0.5,
            "reason": f"Classify error: {exc}. Defaulting to REVIEW.",
        }

    action = classification.get("action", "REVIEW")
    confidence = _safe_float(classification.get("confidence"), 0.5)
    reason = classification.get("reason", "")

    is_banknote = action in ("KEEP",)
    is_partial = action == "REVIEW"
    shadow = build_shadow_explainability(
        metrics=metrics,
        action=action,
        confidence=confidence,
        source=source,
        yolo_conf=yolo_conf,
    )

    # A nominal KEEP with overwhelming document evidence is exposed as REVIEW
    # so logs/API do not claim that a rejected document-like crop was kept.
    if action == "KEEP" and not shadow.get("agent_eligible", True):
        action = "REVIEW"
        is_banknote = False
        is_partial = True
        reason = (
            f"{reason} | Downgraded from KEEP: strong document-like evidence "
            "outweighs banknote evidence."
        )
        shadow["ag0_action"] = "REVIEW"
        shadow["decision_reason"] = (
            f"Current AG0 action=REVIEW (downgraded from KEEP) confidence={confidence:.3f}. "
            f"banknote_score={shadow.get('banknote_score', 0.0):.3f}, "
            f"document_score={shadow.get('document_score', 0.0):.3f}. "
            "Agent gate rejected the crop because document-like structure is dominant."
        )

    result = {
        "action": action,
        "is_banknote": is_banknote,
        "is_partial": is_partial,
        "confidence": confidence,
        "reason": reason,
        "method": "opencv_rule",
        "metrics": metrics,
        **shadow,
    }

    return result
