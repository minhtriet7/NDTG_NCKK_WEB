"""Small classification metric helpers for benchmark reports.

The output mirrors the sklearn ``classification_report(..., output_dict=True,
zero_division=0)`` fields used by the existing services closely enough for the
benchmark workbook: per-class precision/recall/f1/support plus accuracy,
macro average and weighted average.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence


def _round(value: float) -> float:
    return round(float(value), 4)


def classification_report_dict(
    y_true: Sequence[Any],
    y_pred: Sequence[Any],
) -> Dict[str, Any]:
    """Compute classification metrics with missing/unknown labels included.

    Precision, recall and F1 use zero_division=0 semantics. The caller decides
    whether missing predictions are represented as a sentinel label or filtered
    out before calling this function.
    """
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have the same length.")

    total = len(y_true)
    labels = sorted({str(v) for v in y_true} | {str(v) for v in y_pred})
    report: Dict[str, Any] = {}
    correct = 0

    macro_precision = 0.0
    macro_recall = 0.0
    macro_f1 = 0.0
    weighted_precision = 0.0
    weighted_recall = 0.0
    weighted_f1 = 0.0

    for label in labels:
        true_matches = [str(value) == label for value in y_true]
        pred_matches = [str(value) == label for value in y_pred]
        tp = sum(t and p for t, p in zip(true_matches, pred_matches))
        fp = sum((not t) and p for t, p in zip(true_matches, pred_matches))
        fn = sum(t and (not p) for t, p in zip(true_matches, pred_matches))
        support = sum(true_matches)

        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall)
            else 0.0
        )

        report[label] = {
            "precision": _round(precision),
            "recall": _round(recall),
            "f1-score": _round(f1),
            "support": int(support),
        }
        macro_precision += precision
        macro_recall += recall
        macro_f1 += f1
        weighted_precision += precision * support
        weighted_recall += recall * support
        weighted_f1 += f1 * support

    correct = sum(str(a) == str(b) for a, b in zip(y_true, y_pred))
    label_count = max(len(labels), 1)
    support_total = total
    report["accuracy"] = _round(correct / total) if total else 0.0
    report["macro avg"] = {
        "precision": _round(macro_precision / label_count),
        "recall": _round(macro_recall / label_count),
        "f1-score": _round(macro_f1 / label_count),
        "support": int(support_total),
    }
    report["weighted avg"] = {
        "precision": _round(weighted_precision / support_total)
        if support_total
        else 0.0,
        "recall": _round(weighted_recall / support_total)
        if support_total
        else 0.0,
        "f1-score": _round(weighted_f1 / support_total)
        if support_total
        else 0.0,
        "support": int(support_total),
    }
    return report


def report_summary(report: Dict[str, Any]) -> Dict[str, float]:
    """Extract the aggregate metrics used by workbook summary sheets."""
    macro = report.get("macro avg", {})
    weighted = report.get("weighted avg", {})
    return {
        "accuracy": _round(float(report.get("accuracy", 0.0) or 0.0)),
        "macro_precision": _round(float(macro.get("precision", 0.0) or 0.0)),
        "macro_recall": _round(float(macro.get("recall", 0.0) or 0.0)),
        "macro_f1": _round(float(macro.get("f1-score", 0.0) or 0.0)),
        "weighted_precision": _round(
            float(weighted.get("precision", 0.0) or 0.0)
        ),
        "weighted_recall": _round(float(weighted.get("recall", 0.0) or 0.0)),
        "weighted_f1": _round(float(weighted.get("f1-score", 0.0) or 0.0)),
    }


def mean(values: Iterable[float]) -> float:
    values_list: List[float] = [float(value) for value in values]
    return sum(values_list) / len(values_list) if values_list else 0.0
