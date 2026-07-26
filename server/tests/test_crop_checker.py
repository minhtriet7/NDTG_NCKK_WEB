"""
Test tối thiểu cho AG0 Crop Checker.
Chạy: python -m unittest tests/test_crop_checker.py
"""
import unittest
import cv2
import numpy as np
import sys
import os

# Thêm thư mục gốc vào path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.crop_checker import (
    AG0_REVIEW_ELIGIBLE_YOLO_BANKNOTE_SCORE,
    AG0_SMALL_YOLO_AREA_MIN,
    compute_crop_metrics,
    classify_crop,
    check_crop,
    build_shadow_explainability,
    AG0_DROP_TEXTURE_MIN,
    AG0_DROP_EDGE_MIN,
    AG0_DROP_CONTRAST_MIN,
    AG0_KEEP_TEXTURE_MIN,
    AG0_KEEP_EDGE_MIN,
)


def _handheld_metrics(area_ratio=0.007, outer_border_score=0.18):
    return {
        "area_ratio": area_ratio,
        "aspect_ratio": 2.0,
        "texture_variance": 300.0,
        "edge_density": 0.04,
        "brightness": 42.0,
        "contrast": 40.0,
        "background_score": 0.25,
        "white_ratio": 0.05,
        "color_entropy": 0.55,
        "color_richness": 0.55,
        "saturation_mean": 12.0,
        "long_line_density": 0.20,
        "rectangle_like_density": 0.04,
        "directional_edge_ratio": 0.55,
        "outer_border_score": outer_border_score,
        "layout_panel_count": 0,
        "layout_panel_area_ratio": 0.0,
        "circle_like_count": 1,
        "layout_clutter_score": 0.0,
    }


def _make_plain_image(h=200, w=300, gray=180):
    """Tạo ảnh nền trơn (plain background) — không có họa tiết."""
    img = np.ones((h, w, 3), dtype=np.uint8) * gray
    return img


def _make_textured_image(h=200, w=400):
    """Tạo ảnh có họa tiết/texture (giả lập tiền giấy)."""
    img = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    return img


def _make_checkerboard_image(h=200, w=400, tile=20):
    """Tạo ảnh bàn cờ — có edge density cao."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            if (y // tile + x // tile) % 2 == 0:
                img[y:y+tile, x:x+tile] = 255
    return img


def _make_low_light_banknote(h=220, w=440, label="10000"):
    """Deterministic grayscale note-like crop with a clear outer border."""
    image = np.full((h, w, 3), 38, dtype=np.uint8)
    cv2.rectangle(image, (8, 8), (w - 9, h - 9), (105, 105, 105), 3)
    cv2.rectangle(image, (20, 22), (w - 21, h - 23), (62, 62, 62), 1)
    cv2.ellipse(
        image,
        (int(w * 0.72), h // 2),
        (int(w * 0.10), int(h * 0.28)),
        0,
        0,
        360,
        (88, 88, 88),
        2,
    )
    for offset in range(35, w - 35, 24):
        cv2.line(image, (offset, 35), (offset - 18, h - 35), (55, 55, 55), 1)
    cv2.putText(
        image,
        label,
        (28, int(h * 0.63)),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (118, 118, 118),
        2,
        cv2.LINE_AA,
    )
    noise = np.random.default_rng(17).integers(-5, 6, image.shape, dtype=np.int16)
    return np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def _make_poster_collage(h=360, w=640):
    """Synthetic thumbnail/poster with many panels and portrait-like circles."""
    image = np.full((h, w, 3), (24, 28, 36), dtype=np.uint8)
    colors = [
        (35, 95, 220),
        (190, 70, 35),
        (45, 160, 85),
        (160, 55, 170),
        (40, 175, 190),
        (190, 120, 35),
        (85, 75, 210),
        (60, 150, 150),
    ]
    panel_w, panel_h = 130, 72
    positions = [(25 + col * 150, 90 + row * 100) for row in range(2) for col in range(4)]
    for index, (x, y) in enumerate(positions):
        color = colors[index]
        cv2.rectangle(image, (x, y), (x + panel_w, y + panel_h), color, -1)
        cv2.rectangle(image, (x, y), (x + panel_w, y + panel_h), (235, 235, 235), 2)
        cv2.circle(image, (x + 34, y + 34), 20, (225, 225, 225), -1)
        cv2.circle(image, (x + 34, y + 34), 20, (20, 20, 20), 2)
    cv2.putText(
        image,
        "7 EURO",
        (145, 58),
        cv2.FONT_HERSHEY_DUPLEX,
        1.8,
        (245, 245, 245),
        4,
        cv2.LINE_AA,
    )
    return image


class TestComputeCropMetrics(unittest.TestCase):
    def test_plain_image_has_low_texture(self):
        """Ảnh nền trơn phải có texture_variance rất thấp."""
        crop = _make_plain_image()
        metrics = compute_crop_metrics(crop)
        self.assertLess(metrics["texture_variance"], AG0_DROP_TEXTURE_MIN,
                        "Plain image should have very low texture_variance")

    def test_textured_image_has_high_texture(self):
        """Ảnh random noise phải có texture_variance cao."""
        crop = _make_textured_image()
        metrics = compute_crop_metrics(crop)
        self.assertGreater(metrics["texture_variance"], AG0_KEEP_TEXTURE_MIN,
                           "Random noise image should have high texture_variance")

    def test_checkerboard_has_high_edge_density(self):
        """Ảnh bàn cờ phải có edge_density cao."""
        crop = _make_checkerboard_image()
        metrics = compute_crop_metrics(crop)
        self.assertGreater(metrics["edge_density"], AG0_KEEP_EDGE_MIN,
                           "Checkerboard should have high edge_density")

    def test_plain_image_has_low_edge_density(self):
        """Ảnh nền trơn phải có edge_density rất thấp."""
        crop = _make_plain_image()
        metrics = compute_crop_metrics(crop)
        self.assertLess(metrics["edge_density"], AG0_DROP_EDGE_MIN,
                        "Plain image should have very low edge_density")

    def test_aspect_ratio_landscape(self):
        """Ảnh landscape 400x200 phải có aspect_ratio = 2.0."""
        crop = _make_textured_image(h=200, w=400)
        metrics = compute_crop_metrics(crop)
        self.assertAlmostEqual(metrics["aspect_ratio"], 2.0, places=1)

    def test_area_ratio_with_original(self):
        """area_ratio phải được tính đúng nếu truyền original_img và box."""
        original = np.zeros((1000, 1000, 3), dtype=np.uint8)
        crop = np.zeros((500, 500, 3), dtype=np.uint8)
        box = (0, 0, 500, 500)  # 500x500 trên ảnh 1000x1000 → 25%
        metrics = compute_crop_metrics(crop, original_img=original, box=box)
        self.assertAlmostEqual(metrics["area_ratio"], 0.25, places=2)

    def test_empty_crop_returns_zeros(self):
        """Empty crop không crash, trả về values mặc định."""
        crop = np.zeros((0, 0, 3), dtype=np.uint8)
        metrics = compute_crop_metrics(crop)
        self.assertEqual(metrics["texture_variance"], 0.0)
        self.assertEqual(metrics["edge_density"], 0.0)

    def test_none_crop_returns_zeros(self):
        """None crop không crash."""
        metrics = compute_crop_metrics(None)
        self.assertEqual(metrics["texture_variance"], 0.0)


class TestClassifyCrop(unittest.TestCase):
    def test_plain_background_drops(self):
        """Ảnh nền trơn với đủ điều kiện xấu phải bị DROP."""
        crop = _make_plain_image()
        original = _make_plain_image(h=1000, w=1500)
        # Giả lập background_score cao bằng cách làm ảnh gốc và crop cùng màu
        metrics = compute_crop_metrics(crop, original_img=original, box=(0, 0, 300, 200))
        # Inject thêm background_score cao
        metrics["background_score"] = 0.92
        metrics["texture_variance"] = 2.0  # dưới ngưỡng DROP
        metrics["edge_density"] = 0.003   # dưới ngưỡng DROP
        metrics["contrast"] = 3.0        # dưới ngưỡng DROP

        result = classify_crop(metrics)
        self.assertEqual(result["action"], "DROP",
                         f"Should DROP plain background, got: {result}")

    def test_textured_image_keeps(self):
        """Ảnh có texture/edge tốt phải được KEEP."""
        crop = _make_checkerboard_image()
        metrics = compute_crop_metrics(crop)
        metrics["aspect_ratio"] = 2.0   # tỉ lệ tiền giấy
        metrics["background_score"] = 0.1
        result = classify_crop(metrics)
        self.assertIn(result["action"], ("KEEP", "REVIEW"),
                      f"Textured image should be KEEP or REVIEW, got: {result}")

    def test_small_area_always_drops(self):
        """Box quá nhỏ (area_ratio < 0.01) phải bị DROP đơn lẻ."""
        metrics = {
            "area_ratio": 0.005,
            "aspect_ratio": 2.0,
            "texture_variance": 80.0,
            "edge_density": 0.08,
            "brightness": 128.0,
            "contrast": 40.0,
            "background_score": 0.1,
        }
        result = classify_crop(metrics)
        self.assertEqual(result["action"], "DROP",
                         "Tiny area_ratio should always DROP")

    def test_ag0_small_yolo_banknote(self):
        metrics = _handheld_metrics(area_ratio=0.007)
        classification = classify_crop(
            metrics,
            source="yolo_crop",
            yolo_conf=0.62,
        )
        shadow = build_shadow_explainability(
            metrics,
            action=classification["action"],
            confidence=classification["confidence"],
            source="yolo_crop",
            yolo_conf=0.62,
        )

        self.assertNotEqual(classification["action"], "DROP")
        self.assertTrue(shadow["agent_eligible"], shadow["decision_reason"])
        self.assertTrue(shadow["small_clear_yolo_candidate"])
        self.assertEqual(
            shadow["yolo_review_threshold"],
            AG0_REVIEW_ELIGIBLE_YOLO_BANKNOTE_SCORE,
        )

    def test_ag0_very_small_below_new_min_drops(self):
        result = classify_crop(
            _handheld_metrics(area_ratio=0.003),
            source="yolo_crop",
            yolo_conf=0.80,
        )

        self.assertLess(0.003, AG0_SMALL_YOLO_AREA_MIN)
        self.assertEqual(result["action"], "DROP")

    def test_ag0_dark_low_saturation_yolo_eligible(self):
        metrics = _handheld_metrics(area_ratio=0.04, outer_border_score=0.10)
        classification = classify_crop(
            metrics,
            source="yolo_crop",
            yolo_conf=0.72,
        )
        shadow = build_shadow_explainability(
            metrics,
            action=classification["action"],
            confidence=classification["confidence"],
            source="yolo_crop",
            yolo_conf=0.72,
        )

        self.assertTrue(shadow["low_light_banknote_protection"])
        self.assertTrue(shadow["agent_eligible"], shadow["negative_evidence"])
        self.assertFalse(shadow["poster_layout_reject"])

    def test_yolo_high_conf_with_bad_metrics_reviews(self):
        """YOLO high-conf nhưng metrics xấu → REVIEW, không KEEP."""
        metrics = {
            "area_ratio": 0.3,
            "aspect_ratio": 2.0,
            "texture_variance": 5.0,   # xấu
            "edge_density": 0.005,     # xấu
            "brightness": 128.0,
            "contrast": 3.0,           # xấu
            "background_score": 0.9,
        }
        result = classify_crop(metrics, yolo_conf=0.85)
        self.assertIn(result["action"], ("REVIEW", "DROP"),
                      f"High yolo_conf with bad metrics should be REVIEW or DROP, got: {result}")
        # Không được là KEEP
        self.assertNotEqual(result["action"], "KEEP",
                            "High yolo_conf alone should NOT grant KEEP with bad metrics")

    def test_high_background_score_but_good_metrics_reviews(self):
        """Background score cao nhưng texture/edge tốt → REVIEW/KEEP, không DROP."""
        metrics = {
            "area_ratio": 0.3,
            "aspect_ratio": 2.0,
            "texture_variance": 80.0,
            "edge_density": 0.06,
            "brightness": 128.0,
            "contrast": 40.0,
            "background_score": 0.92,  # cao nhưng metrics tốt
        }
        result = classify_crop(metrics)
        self.assertNotEqual(result["action"], "DROP",
                            "High background_score alone should NOT DROP when metrics are good")

    def test_ambiguous_is_review(self):
        """Trường hợp mơ hồ phải là REVIEW, không DROP."""
        metrics = {
            "area_ratio": 0.2,
            "aspect_ratio": 1.8,
            "texture_variance": 25.0,   # ngưỡng trung bình
            "edge_density": 0.025,      # ngưỡng trung bình
            "brightness": 100.0,
            "contrast": 20.0,
            "background_score": 0.5,
        }
        result = classify_crop(metrics)
        self.assertEqual(result["action"], "REVIEW",
                         f"Ambiguous metrics should be REVIEW, got: {result}")


class TestCheckCrop(unittest.TestCase):
    def test_returns_standard_schema(self):
        """check_crop phải trả đủ các field theo schema chuẩn."""
        crop = _make_textured_image()
        result = check_crop(crop)
        required_keys = {"action", "is_banknote", "is_partial", "confidence", "reason", "method", "metrics"}
        self.assertTrue(required_keys.issubset(result.keys()),
                        f"Missing keys: {required_keys - set(result.keys())}")

    def test_action_is_valid(self):
        """action phải là KEEP, REVIEW, hoặc DROP."""
        crop = _make_plain_image()
        result = check_crop(crop)
        self.assertIn(result["action"], ("KEEP", "REVIEW", "DROP"))

    def test_confidence_in_range(self):
        """confidence phải nằm trong [0, 1]."""
        crop = _make_textured_image()
        result = check_crop(crop)
        self.assertGreaterEqual(result["confidence"], 0.0)
        self.assertLessEqual(result["confidence"], 1.0)

    def test_does_not_crash_on_tiny_image(self):
        """Không crash với ảnh rất nhỏ."""
        crop = np.zeros((5, 5, 3), dtype=np.uint8)
        result = check_crop(crop)
        self.assertIn(result["action"], ("KEEP", "REVIEW", "DROP"))

    def test_does_not_crash_on_grayscale(self):
        """Không crash với ảnh gray 2D."""
        crop = np.zeros((100, 200), dtype=np.uint8)
        result = check_crop(crop)
        self.assertIn(result["action"], ("KEEP", "REVIEW", "DROP"))

    def test_low_light_handheld_note_remains_agent_eligible(self):
        crop = _make_low_light_banknote()
        original = np.full((720, 1080, 3), 24, dtype=np.uint8)
        result = check_crop(
            crop,
            original_img=original,
            box=(250, 230, 830, 520),
            source="yolo_crop",
            yolo_conf=0.68,
        )

        self.assertTrue(result["agent_eligible"], result["decision_reason"])
        self.assertNotEqual(result["action"], "DROP")
        self.assertLess(result["metrics"]["saturation_mean"], 35.0)
        self.assertTrue(result["low_light_banknote_protection"])

    def test_low_saturation_is_not_a_standalone_reject(self):
        crop = _make_low_light_banknote(label="2000")
        result = check_crop(
            crop,
            source="yolo_crop",
            yolo_conf=0.72,
        )

        self.assertTrue(result["agent_eligible"], result["negative_evidence"])
        self.assertTrue(
            any("low mean saturation" in item for item in result["negative_evidence"])
        )

    def test_small_clear_yolo_note_is_not_rejected_by_area_alone(self):
        crop = _make_low_light_banknote()
        original = np.full((2000, 3000, 3), 20, dtype=np.uint8)
        result = check_crop(
            crop,
            original_img=original,
            box=(1200, 800, 1420, 1000),
            source="yolo_crop",
            yolo_conf=0.69,
        )

        self.assertLess(result["metrics"]["area_ratio"], AG0_DROP_AREA_RATIO_MIN)
        self.assertNotEqual(result["action"], "DROP")
        self.assertTrue(result["agent_eligible"], result["decision_reason"])

    def test_ag0_poster_collage_still_rejected(self):
        poster = _make_poster_collage()
        result = check_crop(
            poster,
            original_img=poster,
            box=(0, 0, poster.shape[1], poster.shape[0]),
            source="yolo_crop",
            yolo_conf=0.94,
        )

        self.assertFalse(result["agent_eligible"], result["decision_reason"])
        self.assertTrue(result["poster_layout_reject"])
        self.assertIsNotNone(result["rejected_reason"])
        self.assertTrue(
            any(
                "panel" in item or "collage" in item
                for item in result["negative_evidence"]
            )
        )

    def test_high_yolo_confidence_cannot_override_poster_negative(self):
        result = check_crop(
            _make_poster_collage(),
            source="yolo_crop",
            yolo_conf=0.99,
        )

        self.assertFalse(result["agent_eligible"])
        self.assertNotEqual(result["action"], "KEEP")

    def test_synthetic_real_note_regressions_remain_eligible(self):
        for label in ("1000", "10000", "100000", "2000 LAK"):
            with self.subTest(label=label):
                result = check_crop(
                    _make_low_light_banknote(label=label),
                    source="yolo_crop",
                    yolo_conf=0.70,
                )
                self.assertTrue(result["agent_eligible"], result["decision_reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
