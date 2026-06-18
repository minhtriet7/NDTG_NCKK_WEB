import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.image_processing import detect_and_crop_banknotes

class TestDetectAndCropBanknotes(unittest.TestCase):
    
    @patch('app.utils.image_processing.detect_banknote_objects')
    @patch('app.utils.image_processing.ENABLE_AG0_CHECKER', True)
    @patch('app.utils.image_processing.ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK', False)
    def test_ag0_enabled_no_valid_crop(self, mock_detect):
        # Case 1: AG0 bật, không có valid crop
        mock_detect.return_value = []
        image_bytes = b"fake_image_bytes"
        
        result = detect_and_crop_banknotes(image_bytes)
        
        self.assertEqual(result, [])
        mock_detect.assert_called_once_with(image_bytes=image_bytes, max_objects=5)

    @patch('app.utils.image_processing.detect_banknote_objects')
    @patch('app.utils.image_processing.ENABLE_AG0_CHECKER', False)
    def test_ag0_disabled(self, mock_detect):
        # Case 2: AG0 tắt
        mock_detect.return_value = []
        image_bytes = b"fake_image_bytes"
        
        result = detect_and_crop_banknotes(image_bytes)
        
        self.assertEqual(result, [image_bytes])
        mock_detect.assert_called_once_with(image_bytes=image_bytes, max_objects=5)

    @patch('app.utils.image_processing.detect_banknote_objects')
    @patch('app.utils.image_processing.ENABLE_AG0_CHECKER', True)
    @patch('app.utils.image_processing.ENABLE_AG0_LEGACY_ORIGINAL_FALLBACK', True)
    def test_legacy_fallback_enabled(self, mock_detect):
        # Case 3: Legacy fallback bật
        mock_detect.return_value = []
        image_bytes = b"fake_image_bytes"
        
        result = detect_and_crop_banknotes(image_bytes)
        
        self.assertEqual(result, [image_bytes])
        mock_detect.assert_called_once_with(image_bytes=image_bytes, max_objects=5)
        
    @patch('app.utils.image_processing.detect_banknote_objects')
    def test_with_valid_crops(self, mock_detect):
        # Optional Case: Có crop hợp lệ
        mock_detect.return_value = [
            {"crop_bytes": b"crop1"},
            {"crop_bytes": b"crop2"},
            {"no_crop": "ignored"} # item without crop_bytes
        ]
        image_bytes = b"fake_image_bytes"
        
        result = detect_and_crop_banknotes(image_bytes)
        
        self.assertEqual(result, [b"crop1", b"crop2"])
        mock_detect.assert_called_once_with(image_bytes=image_bytes, max_objects=5)

if __name__ == '__main__':
    unittest.main()
