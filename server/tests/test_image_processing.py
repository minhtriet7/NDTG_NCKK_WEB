import os
import sys
import unittest
from unittest.mock import patch

import numpy as np


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.image_processing import (
    _apply_nms_merge_nested,
    _merge_adjacent_banknote_fragments,
    _remove_nested_fragment_candidates,
    _run_ag0_on_candidates,
    detect_and_crop_banknotes,
)


class TestDetectAndCropBanknotes(unittest.TestCase):
    @patch("app.utils.image_processing.detect_banknote_objects")
    def test_no_valid_crop_does_not_fallback_to_original(self, mock_detect):
        mock_detect.return_value = []

        result = detect_and_crop_banknotes(b"fake_image_bytes")

        self.assertEqual(result, [])
        mock_detect.assert_called_once_with(
            image_bytes=b"fake_image_bytes",
            max_objects=5,
        )

    @patch("app.utils.image_processing.detect_banknote_objects")
    def test_only_agent_eligible_crops_are_returned(self, mock_detect):
        mock_detect.return_value = [
            {"crop_bytes": b"blocked", "agent_eligible": False},
            {"crop_bytes": b"eligible", "agent_eligible": True},
            {"no_crop": "ignored", "agent_eligible": True},
        ]

        result = detect_and_crop_banknotes(b"fake_image_bytes")

        self.assertEqual(result, [b"eligible"])

    @patch("app.utils.image_processing.detect_banknote_objects")
    def test_no_agents_receive_crop_when_all_objects_are_ineligible(self, mock_detect):
        mock_detect.return_value = [
            {"crop_bytes": b"poster-a", "agent_eligible": False},
            {"crop_bytes": b"poster-b", "agent_eligible": False},
        ]

        self.assertEqual(detect_and_crop_banknotes(b"fake_image_bytes"), [])


class TestAg0CandidateGate(unittest.TestCase):
    @patch("app.utils.image_processing.check_crop")
    def test_high_yolo_confidence_does_not_override_poster_reject(self, mock_check):
        mock_check.return_value = {
            "action": "REVIEW",
            "confidence": 0.91,
            "reason": "Poster/collage geometry dominates.",
            "metrics": {"layout_clutter_score": 0.9},
            "ag0_action": "REVIEW",
            "ag0_confidence": 0.91,
            "banknote_score": 0.72,
            "document_score": 0.61,
            "document_like_score": 0.61,
            "banknote_like_score": 0.72,
            "agent_eligible_shadow": False,
            "agent_eligible": False,
            "positive_evidence": ["YOLO banknote confidence=0.99"],
            "negative_evidence": ["poster/collage layout clutter=0.900"],
            "rejected_reason": "Strong poster/collage layout.",
            "strong_banknote_evidence": False,
            "strong_document_structure": True,
            "decision_reason": "Strong poster/collage layout.",
        }
        image = np.zeros((300, 500, 3), dtype=np.uint8)
        candidates = [{
            "box": (20, 30, 480, 270),
            "source": "yolo_crop",
            "yolo_conf": 0.99,
        }]

        result = _run_ag0_on_candidates(
            candidates,
            image,
            image_w=500,
            image_h=300,
            provider_label="yolo",
        )

        self.assertEqual(result["valid"], [])
        self.assertEqual(len(result["dropped"]), 1)
        self.assertFalse(result["dropped"][0]["agent_eligible"])
        self.assertEqual(
            result["dropped"][0]["rejected_reason"],
            "Strong poster/collage layout.",
        )


class TestMultiBanknoteSelection(unittest.TestCase):
    def test_nested_filter_keeps_three_separate_yolo_boxes(self):
        candidates = [
            {"box": (40, 80, 240, 180), "source": "yolo_crop", "yolo_conf": 0.66},
            {"box": (300, 90, 500, 190), "source": "yolo_crop", "yolo_conf": 0.64},
            {"box": (560, 75, 760, 175), "source": "yolo_crop", "yolo_conf": 0.61},
        ]

        result = _remove_nested_fragment_candidates(candidates, 1000, 600)

        self.assertEqual(len(result), 3)
        self.assertEqual({item["box"] for item in result}, {item["box"] for item in candidates})

    def test_nested_filter_large_weak_yolo_does_not_collapse_inner(self):
        large = {
            "box": (30, 30, 970, 970),
            "source": "yolo_crop",
            "yolo_conf": 0.35,
        }
        inner = [
            {"box": (120, 180, 360, 300), "source": "yolo_crop", "yolo_conf": 0.62},
            {"box": (400, 350, 680, 490), "source": "yolo_crop", "yolo_conf": 0.58},
            {"box": (610, 620, 890, 760), "source": "yolo_crop", "yolo_conf": 0.55},
        ]

        result = _remove_nested_fragment_candidates([large, *inner], 1000, 1000)

        self.assertNotIn(large, result)
        self.assertEqual({item["box"] for item in result}, {item["box"] for item in inner})

    def test_nested_filter_large_strong_yolo_collapses_inner(self):
        large = {
            "box": (30, 30, 970, 970),
            "source": "yolo_crop",
            "yolo_conf": 0.75,
            "score": 10.0,
        }
        inner = [
            {"box": (120, 180, 360, 300), "source": "yolo_crop", "yolo_conf": 0.62},
            {"box": (400, 350, 680, 490), "source": "yolo_crop", "yolo_conf": 0.58},
        ]

        result = _remove_nested_fragment_candidates([large, *inner], 1000, 1000)

        self.assertEqual(len(result), 1)
        self.assertIn("large_single_note", result[0]["source"])

    def test_merge_does_not_merge_two_distinct_yolo_banknotes(self):
        candidates = [
            {"box": (100, 300, 300, 400), "source": "yolo_crop", "yolo_conf": 0.50},
            {"box": (320, 300, 520, 400), "source": "yolo_crop", "yolo_conf": 0.52},
        ]

        result = _merge_adjacent_banknote_fragments(candidates, 1000, 800)

        self.assertEqual(len(result), 2)

    def test_single_note_overlapping_fragments_still_merge(self):
        candidates = [
            {"box": (100, 300, 260, 400), "source": "yolo_crop", "yolo_conf": 0.35},
            {"box": (235, 300, 410, 400), "source": "yolo_crop", "yolo_conf": 0.38},
        ]

        result = _merge_adjacent_banknote_fragments(candidates, 1000, 800)

        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["source"].startswith("merged("))

    def test_selection_trace_counts_each_filter_stage(self):
        trace = {}
        candidates = [
            {"box": (40, 80, 240, 180), "source": "yolo_crop", "yolo_conf": 0.66, "score": 10.0},
            {"box": (300, 90, 500, 190), "source": "yolo_crop", "yolo_conf": 0.64, "score": 9.0},
            {"box": (560, 75, 760, 175), "source": "yolo_crop", "yolo_conf": 0.61, "score": 8.0},
        ]

        result = _apply_nms_merge_nested(
            candidates,
            image_w=1000,
            image_h=600,
            trace=trace,
        )

        self.assertEqual(len(result), 3)
        self.assertEqual(trace["yolo_raw_count"], 3)
        self.assertEqual(trace["after_nms_count"], 3)
        self.assertEqual(trace["after_merge_count"], 3)
        self.assertEqual(trace["after_nested_count"], 3)
        self.assertEqual(trace["merge_count"], 0)
        self.assertEqual(trace["dropped_by_nested_count"], 0)


if __name__ == "__main__":
    unittest.main()
