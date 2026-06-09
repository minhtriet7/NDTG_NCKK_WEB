"""
Test nhanh Phase Crop v2B — detector-first banknote crop.
Chạy: python test_crop_v2b.py
"""
import sys
import os
import logging

# Setup basic logging để thấy [CropYOLO] output
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(name)s | %(message)s",
    stream=sys.stdout,
)

import cv2
import numpy as np

# Import module sau khi logging setup
from app.utils.image_processing import detect_banknote_objects


def _make_blank_image(w=640, h=480, color=(200, 200, 200)) -> bytes:
    """Ảnh xám trống — không có tiền."""
    img = np.ones((h, w, 3), dtype=np.uint8)
    img[:] = color
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes() if ok else b""


def _make_ui_strip_image(w=1080, h=1920) -> bytes:
    """
    Mô phỏng ảnh screenshot điện thoại:
    - Nền trắng
    - Nhiều thanh ngang màu (giống status bar, nav bar)
    - Text label màu teal
    """
    img = np.ones((h, w, 3), dtype=np.uint8) * 245

    # Status bar
    img[0:60, :] = [20, 20, 20]
    # Header teal
    img[60:160, :] = [180, 140, 30]  # BGR ~ teal
    # Content strips
    for y in range(200, h - 200, 120):
        img[y:y+80, 40:w-40] = [230, 230, 230]
    # Nav bar
    img[h-100:h, :] = [240, 240, 240]

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes() if ok else b""


def _make_rect_banknote_image(w=800, h=400, bg=(220, 220, 220)) -> bytes:
    """
    Ảnh giả lập 1 tờ tiền: hình chữ nhật màu sắc rõ trên nền sáng.
    YOLO trained thật nên sẽ không detect ảnh giả này.
    Dùng để test fallback path (YOLO 0 det → heuristic).
    """
    img = np.ones((h + 100, w + 100, 3), dtype=np.uint8)
    img[:] = bg
    # Vẽ hình chữ nhật giả tiền
    cv2.rectangle(img, (50, 50), (w + 50, h + 50), (30, 140, 80), -1)
    cv2.rectangle(img, (70, 70), (w + 30, h + 30), (200, 180, 50), 4)

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes() if ok else b""


def _load_image_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _check_object_schema(obj: dict, label: str):
    required = [
        "object_index", "raw_candidate_count", "bbox",
        "crop_bytes", "crop_base64", "confidence",
        "width", "height", "source", "fallback",
    ]
    missing = [k for k in required if k not in obj]
    if missing:
        print(f"  ⚠️  MISSING schema fields: {missing}")
    else:
        print(f"  ✅ Schema OK — fallback={obj['fallback']} source={obj['source']} "
              f"crop_provider={obj.get('crop_provider')} yolo_conf={obj.get('yolo_conf')}")


def run_test(label: str, image_bytes: bytes):
    print(f"\n{'='*60}")
    print(f"TEST: {label}")
    print(f"{'='*60}")
    if not image_bytes:
        print("  ⚠️  Empty image bytes, skip.")
        return

    objects = detect_banknote_objects(image_bytes, max_objects=5)
    print(f"  → {len(objects)} object(s) returned")
    for obj in objects:
        _check_object_schema(obj, label)
    return objects


if __name__ == "__main__":
    print("\n=== Phase Crop v2B — Quick Test ===\n")

    # Case 1: Ảnh trống (không có tiền)
    run_test("Ảnh xám trống — không có tiền", _make_blank_image())

    # Case 2: Ảnh UI/text strip giả màn hình
    run_test("Ảnh UI screenshot giả (nền màn hình)", _make_ui_strip_image())

    # Case 3: Ảnh hình chữ nhật màu (YOLO sẽ không detect vì không phải tiền thật)
    run_test("Ảnh hình chữ nhật màu giả tiền (YOLO miss → heuristic)", _make_rect_banknote_image())

    # Case 4: Ảnh thật từ file nếu có
    real_images = [
        ("ảnh tiền thật 1", "test_banknote_1.jpg"),
        ("ảnh tiền thật 2", "test_banknote_2.jpg"),
        ("ảnh nhiều tờ", "test_multi_banknote.jpg"),
    ]
    for label, fname in real_images:
        if os.path.exists(fname):
            run_test(label, _load_image_bytes(fname))
        else:
            print(f"\n[SKIP] '{fname}' không tồn tại — đặt file ảnh thật để test YOLO detection.")

    print("\n=== Test hoàn tất ===\n")
