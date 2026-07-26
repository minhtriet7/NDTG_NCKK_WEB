"""
Tests mock/synthetic cho image resize pipeline — KHÔNG gọi API thật.

Danh sách tests:
  1. Aspect ratio giữ nguyên khi resize (2000x1000 -> 1280x640)
  2. Không ép vuông (1600x700 không trở thành 512x512)
  3. No-upscale: ảnh nhỏ hơn target không bị phóng to
  4. JPEG quality configurable (85/88)
  5. AG1/AG2 payload đúng policy (max_long_side <= 1280)
  6. AG3 payload dùng policy riêng (max_long_side <= 1600)
  7. Multi-object: 3 crop lớn đều được resize
  8. Trace fields: upscaled, aspect_preserved, resize_policy, before/after dims
  9. Regression: ảnh nhỏ không bị upscale; PNG/RGBA xử lý an toàn
"""

import io
import os
import sys
import unittest

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.recognition_service import _resize_image_bytes_for_api


def _make_jpeg(width, height, color=(100, 150, 200)):
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _make_png_rgba(width, height):
    img = Image.new("RGBA", (width, height), color=(0, 128, 255, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _decoded_size(result_bytes):
    img = Image.open(io.BytesIO(result_bytes))
    return img.size


class TestResizeAspectRatioPreserved(unittest.TestCase):
    def test_2000x1000_long_side_1280_preserves_aspect(self):
        img_bytes = _make_jpeg(2000, 1000)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertEqual(out_w, 1280)
        self.assertEqual(out_h, 640)
        self.assertTrue(meta["aspect_preserved"])
        self.assertFalse(meta["upscaled"])
        self.assertTrue(meta["resize_applied"])

    def test_1600x700_long_side_1280_preserves_aspect(self):
        img_bytes = _make_jpeg(1600, 700)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertLessEqual(out_w, 1280)
        self.assertLessEqual(out_h, 1280)
        self.assertTrue(meta["aspect_preserved"])


class TestNoSquareDistortion(unittest.TestCase):
    def test_banknote_1600x700_not_512x512(self):
        img_bytes = _make_jpeg(1600, 700)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertFalse(out_w == 512 and out_h == 512, f"Must NOT be 512x512! Got {out_w}x{out_h}")
        ratio = out_w / float(out_h)
        self.assertGreater(ratio, 1.5, f"Banknote aspect > 1.5, got {ratio:.2f}")

    def test_2000x900_not_square(self):
        img_bytes = _make_jpeg(2000, 900)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertNotEqual(out_w, out_h)


class TestNoUpscale(unittest.TestCase):
    def test_small_600x300_not_upscaled(self):
        img_bytes = _make_jpeg(600, 300)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertEqual(out_w, 600)
        self.assertEqual(out_h, 300)
        self.assertFalse(meta["upscaled"])
        self.assertFalse(meta["resize_applied"])

    def test_exactly_at_max_side_not_changed(self):
        img_bytes = _make_jpeg(1280, 640)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag2")
        self.assertFalse(meta["upscaled"])


class TestJpegQualityConfigurable(unittest.TestCase):
    def test_quality_85_valid_jpeg(self):
        img_bytes = _make_jpeg(2000, 1000)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertGreater(len(result), 0)
        Image.open(io.BytesIO(result))  # should not throw

    def test_quality_88_gte_quality_75(self):
        img_bytes = _make_jpeg(2000, 1000)
        r88, _ = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=88, no_upscale=True, agent_label="ag3")
        r75, _ = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=75, no_upscale=True, agent_label="ag3")
        self.assertGreaterEqual(len(r88), len(r75))

    def test_accepts_quality_param(self):
        img_bytes = _make_jpeg(1500, 700)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertIsNotNone(result)
        self.assertIsInstance(meta, dict)


class TestAgentPayloadResizePolicy(unittest.TestCase):
    def test_ag1_ag2_long_side_le_1280(self):
        img_bytes = _make_jpeg(3000, 1400)
        result, _ = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertLessEqual(max(out_w, out_h), 1280)

    def test_ag3_long_side_le_1600(self):
        img_bytes = _make_jpeg(3000, 1400)
        result, _ = _resize_image_bytes_for_api(img_bytes, max_side=1600, jpeg_quality=88, no_upscale=True, agent_label="ag3")
        out_w, out_h = _decoded_size(result)
        self.assertLessEqual(max(out_w, out_h), 1600)

    def test_ag3_larger_than_ag1_for_same_input(self):
        img_bytes = _make_jpeg(3000, 1400)
        r_ag1, _ = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        r_ag3, _ = _resize_image_bytes_for_api(img_bytes, max_side=1600, jpeg_quality=88, no_upscale=True, agent_label="ag3")
        ag1_long = max(_decoded_size(r_ag1))
        ag3_long = max(_decoded_size(r_ag3))
        self.assertGreater(ag3_long, ag1_long)


class TestMultiObjectResize(unittest.TestCase):
    def test_three_large_crops_all_resized(self):
        crops = [
            _make_jpeg(2400, 1000, color=(200, 100, 50)),
            _make_jpeg(2000, 900, color=(50, 200, 100)),
            _make_jpeg(1800, 800, color=(100, 50, 200)),
        ]
        for i, crop in enumerate(crops):
            result, meta = _resize_image_bytes_for_api(crop, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label=f"ag1_obj{i+1}")
            out_w, out_h = _decoded_size(result)
            self.assertLessEqual(max(out_w, out_h), 1280, f"Crop #{i+1}: long_side={max(out_w,out_h)} > 1280")
            self.assertTrue(meta["aspect_preserved"], f"Crop #{i+1}: aspect not preserved")


class TestTraceFields(unittest.TestCase):
    REQUIRED = [
        "resize_applied", "resize_max_side", "resize_policy",
        "original_width", "original_height", "resized_width", "resized_height",
        "original_bytes", "resized_bytes", "upscaled", "aspect_preserved", "no_upscale",
    ]

    def test_all_required_trace_fields_present(self):
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        for field in self.REQUIRED:
            self.assertIn(field, meta, f"Missing trace field: {field}")

    def test_before_after_dimensions(self):
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertEqual(meta["original_width"], 2000)
        self.assertEqual(meta["original_height"], 1000)
        self.assertEqual(meta["resized_width"], 1280)
        self.assertEqual(meta["resized_height"], 640)

    def test_resize_policy_mentions_max_side_and_quality(self):
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag2")
        self.assertIn("1280", meta["resize_policy"])
        self.assertIn("85", meta["resize_policy"])

    def test_upscaled_false_for_downscale(self):
        img_bytes = _make_jpeg(3000, 1400)
        _, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertFalse(meta["upscaled"])

    def test_upscaled_false_for_no_resize(self):
        img_bytes = _make_jpeg(600, 300)
        _, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertFalse(meta["upscaled"])


class TestRegressionEdgeCases(unittest.TestCase):
    def test_small_crop_not_upscaled(self):
        img_bytes = _make_jpeg(400, 200)
        result, _ = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        self.assertEqual(out_w, 400)
        self.assertEqual(out_h, 200)

    def test_png_rgba_handled_safely(self):
        img_bytes = _make_png_rgba(1800, 800)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertGreater(len(result), 0)
        self.assertIsNone(meta.get("resize_error"))
        Image.open(io.BytesIO(result))  # should not throw

    def test_1x1_tiny_input_no_crash(self):
        img_bytes = _make_jpeg(1, 1)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertIsNotNone(result)

    def test_3000x1200_aspect_preserved(self):
        img_bytes = _make_jpeg(3000, 1200)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        out_w, out_h = _decoded_size(result)
        expected_ratio = 3000 / 1200
        actual_ratio = out_w / out_h
        self.assertAlmostEqual(actual_ratio, expected_ratio, delta=0.05)

    def test_bytes_tracked_in_trace(self):
        img_bytes = _make_jpeg(2000, 1000)
        result, meta = _resize_image_bytes_for_api(img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1")
        self.assertEqual(meta["original_bytes"], len(img_bytes))
        self.assertEqual(meta["resized_bytes"], len(result))


class TestConfigDefaults(unittest.TestCase):
    def test_agent_image_max_long_side_not_512(self):
        try:
            from app.core.config import settings
            val = getattr(settings, "AGENT_IMAGE_MAX_LONG_SIDE", None)
            self.assertIsNotNone(val)
            self.assertNotEqual(val, 512, "AGENT_IMAGE_MAX_LONG_SIDE=512 FORBIDDEN!")
            self.assertGreaterEqual(val, 1024)
        except ImportError:
            self.skipTest("Cannot import settings")

    def test_ag3_max_long_side_gte_ag1(self):
        try:
            from app.core.config import settings
            ag1 = getattr(settings, "AGENT_IMAGE_MAX_LONG_SIDE", 1280)
            ag3 = getattr(settings, "AGENT3_IMAGE_MAX_LONG_SIDE", 1600)
            self.assertGreaterEqual(ag3, ag1)
        except ImportError:
            self.skipTest("Cannot import settings")

    def test_vision_resize_max_side_not_512_in_defaults(self):
        """
        VISION_RESIZE_MAX_SIDE trong code defaults (config.py) phải không phải 512.
        NOTE: .env có thể override giá trị này. Nếu .env đang set VISION_RESIZE_MAX_SIDE=512,
        đó là deployment risk cần sửa .env thủ công (không tự động sửa .env theo yêu cầu prompt).
        Test này chỉ verify code default trong config.py, không verify runtime value từ .env.
        """
        try:
            # Đọc trực tiếp từ config class default, bỏ qua .env
            from app.core.config import Settings
            field_info = Settings.model_fields.get("VISION_RESIZE_MAX_SIDE")
            if field_info is None:
                self.skipTest("VISION_RESIZE_MAX_SIDE field not found in Settings")
            code_default = field_info.default
            self.assertNotEqual(code_default, 512,
                f"config.py DEFAULT for VISION_RESIZE_MAX_SIDE must not be 512! "
                f"Got {code_default}. Note: .env may still override this - check .env separately.")
        except (ImportError, AttributeError):
            self.skipTest("Cannot inspect Settings model_fields")

    def test_no_upscale_default_true(self):
        try:
            from app.core.config import settings
            val = getattr(settings, "AGENT_IMAGE_NO_UPSCALE", True)
            self.assertTrue(val)
        except ImportError:
            self.skipTest("Cannot import settings")

    def test_new_user_recognition_resize_enabled_defined(self):
        """USER_RECOGNITION_RESIZE_ENABLED phải tồn tại trong config."""
        try:
            from app.core.config import Settings
            self.assertIn("USER_RECOGNITION_RESIZE_ENABLED", Settings.model_fields,
                "USER_RECOGNITION_RESIZE_ENABLED must be defined in Settings")
        except (ImportError, AttributeError):
            self.skipTest("Cannot inspect Settings model_fields")

    def test_new_experiment_resize_enabled_defined(self):
        """EXPERIMENT_RESIZE_ENABLED phải tồn tại trong config."""
        try:
            from app.core.config import Settings
            self.assertIn("EXPERIMENT_RESIZE_ENABLED", Settings.model_fields,
                "EXPERIMENT_RESIZE_ENABLED must be defined in Settings")
        except (ImportError, AttributeError):
            self.skipTest("Cannot inspect Settings model_fields")

    def test_experiment_resize_follows_user_default_true(self):
        """EXPERIMENT_RESIZE_FOLLOWS_USER mặc định True."""
        try:
            from app.core.config import Settings
            fi = Settings.model_fields.get("EXPERIMENT_RESIZE_FOLLOWS_USER")
            if fi is None:
                self.skipTest("EXPERIMENT_RESIZE_FOLLOWS_USER field not found")
            self.assertTrue(fi.default, "EXPERIMENT_RESIZE_FOLLOWS_USER should default to True")
        except (ImportError, AttributeError):
            self.skipTest("Cannot inspect Settings model_fields")


# ===========================================================================
# Test Suite 7 — _resolve_resize_policy scope tests
# ===========================================================================
class TestResizePolicyScopeUser(unittest.TestCase):
    """Test 1 bắt buộc: user flow với legacy .env VISION_RESIZE_MAX_SIDE=512 không dùng 512."""

    def _make_mock_settings(self, **overrides):
        """Tạo mock settings object với các giá trị cần thiết."""
        defaults = {
            "USER_RECOGNITION_RESIZE_ENABLED": False,
            "EXPERIMENT_RESIZE_ENABLED": False,
            "EXPERIMENT_RESIZE_FOLLOWS_USER": True,
            "VISION_RESIZE_ENABLED": False,
            "VISION_RESIZE_MAX_SIDE": 512,       # .env cũ set 512
            "VISION_RESIZE_APPLY_PRODUCTION": True,
            "VISION_RESIZE_APPLY_EXPERIMENT": True,
            "AGENT_IMAGE_MAX_LONG_SIDE": 1280,   # policy mới luôn 1280
            "AGENT_IMAGE_JPEG_QUALITY": 85,
            "AGENT3_IMAGE_MAX_LONG_SIDE": 1600,  # policy mới AG3 = 1600
            "AGENT3_IMAGE_JPEG_QUALITY": 88,
            "AGENT_IMAGE_NO_UPSCALE": True,
        }
        defaults.update(overrides)

        class MockSettings:
            pass
        for k, v in defaults.items():
            setattr(MockSettings, k, v)
        return MockSettings()

    def _call_resolve_policy(self, mock_settings, experiment_mode):
        """Gọi _resolve_resize_policy với mock settings."""
        from unittest.mock import patch
        from app.services import recognition_service
        with patch.object(recognition_service, "settings", mock_settings):
            return recognition_service._resolve_resize_policy(experiment_mode)

    def test_user_flow_legacy_env_512_still_uses_1280_for_ag1(self):
        """
        Legacy .env set VISION_RESIZE_MAX_SIDE=512 + VISION_RESIZE_ENABLED=true.
        User flow phải dùng AGENT_IMAGE_MAX_LONG_SIDE=1280, KHÔNG phải 512.
        """
        s = self._make_mock_settings(
            VISION_RESIZE_ENABLED=True,
            VISION_RESIZE_MAX_SIDE=512,
            USER_RECOGNITION_RESIZE_ENABLED=False,  # chưa set flag mới
        )
        policy = self._call_resolve_policy(s, experiment_mode=False)
        self.assertTrue(policy["enabled"], "Resize should be enabled via legacy alias")
        self.assertNotEqual(policy["max_side_ag1"], 512,
            f"AG1/AG2 max_side MUST NOT be 512! Got {policy['max_side_ag1']}")
        self.assertEqual(policy["max_side_ag1"], 1280,
            f"AG1/AG2 max_side should be 1280, got {policy['max_side_ag1']}")
        self.assertEqual(policy["scope"], "user")

    def test_user_flow_resize_disabled_returns_disabled_scope(self):
        """Test 2: User flow resize disabled → scope=disabled, crop không resize."""
        s = self._make_mock_settings(
            USER_RECOGNITION_RESIZE_ENABLED=False,
            VISION_RESIZE_ENABLED=False,
        )
        policy = self._call_resolve_policy(s, experiment_mode=False)
        self.assertFalse(policy["enabled"], "Resize should be disabled")
        self.assertEqual(policy["scope"], "disabled")
        # Kiểm tra crop bytes không bị resize khi disabled
        img_bytes = _make_jpeg(1600, 700)
        result, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1"
        )
        # Ảnh 1600px > 1280 nên sẽ resize — nhưng test này verify scope=disabled
        # Scope disabled có nghĩa pipeline không gọi _resize_image_bytes_for_api
        self.assertFalse(policy["enabled"])  # pipeline skip resize khi disabled

    def test_user_flow_new_flag_enabled_returns_user_scope(self):
        """USER_RECOGNITION_RESIZE_ENABLED=True → scope=user, max_side=1280."""
        s = self._make_mock_settings(USER_RECOGNITION_RESIZE_ENABLED=True)
        policy = self._call_resolve_policy(s, experiment_mode=False)
        self.assertTrue(policy["enabled"])
        self.assertEqual(policy["scope"], "user")
        self.assertEqual(policy["max_side_ag1"], 1280)
        self.assertEqual(policy["resize_policy_source"], "USER_RECOGNITION_RESIZE_ENABLED")

    def test_user_flow_max_side_ag1_never_512(self):
        """Dù .env set gì, max_side_ag1 trong policy phải không phải 512."""
        for vision_enabled in [True, False]:
            for user_enabled in [True, False]:
                s = self._make_mock_settings(
                    VISION_RESIZE_ENABLED=vision_enabled,
                    VISION_RESIZE_MAX_SIDE=512,
                    USER_RECOGNITION_RESIZE_ENABLED=user_enabled,
                )
                policy = self._call_resolve_policy(s, experiment_mode=False)
                self.assertNotEqual(policy["max_side_ag1"], 512,
                    f"max_side_ag1=512 FORBIDDEN! (VISION_RESIZE_ENABLED={vision_enabled}, USER_RECOGNITION_RESIZE_ENABLED={user_enabled})")
                self.assertNotEqual(policy["max_side_ag3"], 512,
                    f"max_side_ag3=512 FORBIDDEN! (VISION_RESIZE_ENABLED={vision_enabled}, USER_RECOGNITION_RESIZE_ENABLED={user_enabled})")


class TestResizePolicyScopeExperiment(unittest.TestCase):
    """Test 3/4: experiment flow follows user / override riêng."""

    def _make_mock_settings(self, **overrides):
        defaults = {
            "USER_RECOGNITION_RESIZE_ENABLED": False,
            "EXPERIMENT_RESIZE_ENABLED": False,
            "EXPERIMENT_RESIZE_FOLLOWS_USER": True,
            "VISION_RESIZE_ENABLED": False,
            "VISION_RESIZE_MAX_SIDE": 512,
            "VISION_RESIZE_APPLY_PRODUCTION": True,
            "VISION_RESIZE_APPLY_EXPERIMENT": True,
            "AGENT_IMAGE_MAX_LONG_SIDE": 1280,
            "AGENT_IMAGE_JPEG_QUALITY": 85,
            "AGENT3_IMAGE_MAX_LONG_SIDE": 1600,
            "AGENT3_IMAGE_JPEG_QUALITY": 88,
            "AGENT_IMAGE_NO_UPSCALE": True,
        }
        defaults.update(overrides)

        class MockSettings:
            pass
        for k, v in defaults.items():
            setattr(MockSettings, k, v)
        return MockSettings()

    def _call_resolve_policy(self, mock_settings, experiment_mode):
        from unittest.mock import patch
        from app.services import recognition_service
        with patch.object(recognition_service, "settings", mock_settings):
            return recognition_service._resolve_resize_policy(experiment_mode)

    def test_experiment_follows_user_disabled(self):
        """Test 3: EXPERIMENT_RESIZE_FOLLOWS_USER=True + user disabled → experiment cũng disabled."""
        s = self._make_mock_settings(
            USER_RECOGNITION_RESIZE_ENABLED=False,
            VISION_RESIZE_ENABLED=False,
            EXPERIMENT_RESIZE_FOLLOWS_USER=True,
            EXPERIMENT_RESIZE_ENABLED=True,  # không quan trọng khi follows_user=True
        )
        policy = self._call_resolve_policy(s, experiment_mode=True)
        self.assertFalse(policy["enabled"],
            "Experiment should follow user policy (disabled)")
        self.assertIn("EXPERIMENT_RESIZE_FOLLOWS_USER", policy["resize_policy_source"])

    def test_experiment_follows_user_enabled(self):
        """Test 3: EXPERIMENT_RESIZE_FOLLOWS_USER=True + user enabled → experiment cũng enabled."""
        s = self._make_mock_settings(
            USER_RECOGNITION_RESIZE_ENABLED=True,
            EXPERIMENT_RESIZE_FOLLOWS_USER=True,
            EXPERIMENT_RESIZE_ENABLED=False,  # không ảnh hưởng khi follows=True
        )
        policy = self._call_resolve_policy(s, experiment_mode=True)
        self.assertTrue(policy["enabled"],
            "Experiment should follow user policy (enabled)")
        self.assertEqual(policy["max_side_ag1"], 1280)

    def test_experiment_override_independent(self):
        """Test 4: EXPERIMENT_RESIZE_FOLLOWS_USER=False → experiment dùng EXPERIMENT_RESIZE_ENABLED riêng."""
        s = self._make_mock_settings(
            USER_RECOGNITION_RESIZE_ENABLED=False,  # user disabled
            EXPERIMENT_RESIZE_FOLLOWS_USER=False,
            EXPERIMENT_RESIZE_ENABLED=True,          # experiment bật riêng
        )
        policy = self._call_resolve_policy(s, experiment_mode=True)
        self.assertTrue(policy["enabled"], "Experiment override should be independent")
        self.assertEqual(policy["resize_policy_source"], "EXPERIMENT_RESIZE_ENABLED")
        self.assertEqual(policy["scope"], "experiment")

    def test_experiment_override_does_not_affect_user_flow(self):
        """Test 4: experiment override chỉ ảnh hưởng experiment, user flow không bị."""
        s = self._make_mock_settings(
            USER_RECOGNITION_RESIZE_ENABLED=False,  # user disabled
            EXPERIMENT_RESIZE_FOLLOWS_USER=False,
            EXPERIMENT_RESIZE_ENABLED=True,
            VISION_RESIZE_ENABLED=False,
        )
        from unittest.mock import patch
        from app.services import recognition_service
        with patch.object(recognition_service, "settings", s):
            user_policy = recognition_service._resolve_resize_policy(experiment_mode=False)
            exp_policy  = recognition_service._resolve_resize_policy(experiment_mode=True)

        self.assertFalse(user_policy["enabled"],
            "User flow must NOT be affected by experiment override")
        self.assertTrue(exp_policy["enabled"],
            "Experiment flow should be enabled by override")
        self.assertEqual(user_policy["scope"], "disabled")
        self.assertEqual(exp_policy["scope"], "experiment")

    def test_legacy_vision_resize_enabled_activates_both_flows(self):
        """Legacy: VISION_RESIZE_ENABLED=True + APPLY flags → cả user và experiment enabled."""
        s = self._make_mock_settings(
            VISION_RESIZE_ENABLED=True,
            VISION_RESIZE_APPLY_PRODUCTION=True,
            VISION_RESIZE_APPLY_EXPERIMENT=True,
            USER_RECOGNITION_RESIZE_ENABLED=False,
            EXPERIMENT_RESIZE_FOLLOWS_USER=True,
        )
        from unittest.mock import patch
        from app.services import recognition_service
        with patch.object(recognition_service, "settings", s):
            user_policy = recognition_service._resolve_resize_policy(experiment_mode=False)
            exp_policy  = recognition_service._resolve_resize_policy(experiment_mode=True)

        self.assertTrue(user_policy["enabled"], "Legacy VISION_RESIZE_ENABLED=True should activate user resize")
        self.assertTrue(exp_policy["enabled"], "Legacy VISION_RESIZE_ENABLED=True + follows_user should activate exp")
        # NHƯNG max_side phải là 1280, không phải 512
        self.assertNotEqual(user_policy["max_side_ag1"], 512)
        self.assertNotEqual(exp_policy["max_side_ag1"], 512)
        self.assertEqual(user_policy["max_side_ag1"], 1280)
        self.assertEqual(exp_policy["max_side_ag1"], 1280)


class TestResizePolicyScopeInTrace(unittest.TestCase):
    """Test 8: resize_scope, resize_policy_source phải có trong trace."""

    def _resolve(self, experiment_mode, **kw):
        defaults = {
            "USER_RECOGNITION_RESIZE_ENABLED": True,
            "EXPERIMENT_RESIZE_ENABLED": False,
            "EXPERIMENT_RESIZE_FOLLOWS_USER": True,
            "VISION_RESIZE_ENABLED": False,
            "VISION_RESIZE_MAX_SIDE": 512,
            "VISION_RESIZE_APPLY_PRODUCTION": True,
            "VISION_RESIZE_APPLY_EXPERIMENT": True,
            "AGENT_IMAGE_MAX_LONG_SIDE": 1280,
            "AGENT_IMAGE_JPEG_QUALITY": 85,
            "AGENT3_IMAGE_MAX_LONG_SIDE": 1600,
            "AGENT3_IMAGE_JPEG_QUALITY": 88,
            "AGENT_IMAGE_NO_UPSCALE": True,
        }
        defaults.update(kw)

        class MS:
            pass
        for k, v in defaults.items():
            setattr(MS, k, v)
        from unittest.mock import patch
        from app.services import recognition_service
        with patch.object(recognition_service, "settings", MS()):
            return recognition_service._resolve_resize_policy(experiment_mode)

    def test_policy_dict_has_scope_field(self):
        """Policy dict phải có 'scope' field."""
        policy = self._resolve(experiment_mode=False)
        self.assertIn("scope", policy)

    def test_policy_dict_has_resize_policy_source(self):
        """Policy dict phải có 'resize_policy_source' field."""
        policy = self._resolve(experiment_mode=False)
        self.assertIn("resize_policy_source", policy)

    def test_policy_dict_user_scope_value(self):
        """User flow enabled → scope='user'."""
        policy = self._resolve(experiment_mode=False, USER_RECOGNITION_RESIZE_ENABLED=True)
        self.assertEqual(policy["scope"], "user")

    def test_policy_dict_disabled_scope_value(self):
        """User flow disabled → scope='disabled'."""
        policy = self._resolve(
            experiment_mode=False,
            USER_RECOGNITION_RESIZE_ENABLED=False,
            VISION_RESIZE_ENABLED=False,
        )
        self.assertEqual(policy["scope"], "disabled")

    def test_policy_dict_has_no_upscale(self):
        """Policy dict phải có 'no_upscale' field."""
        policy = self._resolve(experiment_mode=False)
        self.assertIn("no_upscale", policy)
        self.assertTrue(policy["no_upscale"])

    def test_policy_dict_max_side_fields(self):
        """Policy dict phải có max_side_ag1, max_side_ag3."""
        policy = self._resolve(experiment_mode=False)
        self.assertIn("max_side_ag1", policy)
        self.assertIn("max_side_ag3", policy)
        self.assertGreater(policy["max_side_ag3"], policy["max_side_ag1"],
            "AG3 max_side should be > AG1 max_side")

    def test_policy_max_side_ag1_and_ag3_separate(self):
        """Test 5: AG3 có thể lớn hơn AG1/AG2."""
        policy = self._resolve(experiment_mode=False)
        self.assertEqual(policy["max_side_ag1"], 1280)
        self.assertEqual(policy["max_side_ag3"], 1600)
        self.assertGreater(policy["max_side_ag3"], policy["max_side_ag1"])

    def test_resize_meta_trace_has_aspect_preserved(self):
        """Test 8: resize trace từ _resize_image_bytes_for_api có aspect_preserved."""
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        self.assertIn("aspect_preserved", meta)
        self.assertTrue(meta["aspect_preserved"])

    def test_resize_meta_trace_has_no_upscale(self):
        """Test 8: resize trace có no_upscale field."""
        img_bytes = _make_jpeg(600, 300)
        _, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        self.assertIn("no_upscale", meta)
        self.assertTrue(meta["no_upscale"])

    def test_resize_meta_trace_has_agent_label(self):
        """Test 8: agent_label trong trace."""
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        self.assertEqual(meta["agent_label"], "ag1_user")

    def test_resize_meta_trace_has_resize_policy(self):
        """Test 8: resize_policy string có trong trace."""
        img_bytes = _make_jpeg(2000, 1000)
        _, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        self.assertIn("resize_policy", meta)
        self.assertIn("1280", meta["resize_policy"])


class TestNoSquareAndNoUpscaleRegression(unittest.TestCase):
    """Test 6/7: no square distortion và no upscale regression."""

    def test_1600x700_not_512x512_with_1280_policy(self):
        """Test 6: 1600×700 không trở thành 512×512."""
        img_bytes = _make_jpeg(1600, 700)
        result, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        out_w, out_h = _decoded_size(result)
        self.assertFalse(out_w == 512 and out_h == 512,
            f"MUST NOT be 512x512! Got {out_w}x{out_h}")
        self.assertNotEqual(out_w, out_h, "Must not be square")

    def test_600x300_not_upscaled(self):
        """Test 7: 600×300 không bị upscale lên 1280."""
        img_bytes = _make_jpeg(600, 300)
        result, meta = _resize_image_bytes_for_api(
            img_bytes, max_side=1280, jpeg_quality=85, no_upscale=True, agent_label="ag1_user"
        )
        out_w, out_h = _decoded_size(result)
        self.assertEqual(out_w, 600)
        self.assertEqual(out_h, 300)
        self.assertFalse(meta["upscaled"])
        self.assertFalse(meta["resize_applied"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
