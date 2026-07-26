"""Shared normalization and verification helpers for benchmark metrics.

The benchmark code compares the three recognition fields independently:
country, currency and denomination. Missing predictions stay as ``None``;
they are never coerced to 0 or to an empty label for correctness checks.
"""

from __future__ import annotations

import math
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional

from app.utils.currency_normalizer import normalize_currency_identity


MISSING_SENTINEL = "__MISSING__"

MISSING_STRINGS = {
    "",
    "failed",
    "null",
    "0",
}

COUNTRY_ALIASES = {
    "eu": "european union",
    "euro zone": "european union",
    "eurozone": "european union",
    "european union": "european union",
    "lien minh chau au": "european union",
    "chau au": "european union",
    "us": "united states",
    "usa": "united states",
    "united states": "united states",
    "united states of america": "united states",
    "viet nam": "vietnam",
    "vietnam": "vietnam",
}

CURRENCY_ALIASES = {
    "EUR": "EUR",
    "IDR": "IDR",
    "USD": "USD",
    "VND": "VND",
    "VNĐ": "VND",
}

_NUMBER_TOKEN_RE = re.compile(r"\d+(?:[\s,.]\d+)*")


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def normalize_missing_value(value: Any) -> Optional[Any]:
    """Return ``None`` for explicit missing markers, otherwise the original value.

    In the benchmark result files, 0 is used as a missing prediction marker.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and math.isnan(value):
            return None
        if value == 0:
            return None
    if isinstance(value, Decimal) and (value.is_nan() or value.is_zero()):
        return None
    if isinstance(value, str):
        text = " ".join(value.strip().casefold().split())
        if text in MISSING_STRINGS:
            return None
    return value


def normalize_country(value: Any) -> Optional[str]:
    """Canonicalize country labels without substring or prefix matching."""
    value = normalize_missing_value(value)
    if value is None:
        return None
    text = " ".join(str(value).strip().casefold().split())
    if not text:
        return None
    alias_key = _strip_accents(text)
    return COUNTRY_ALIASES.get(alias_key, alias_key)


def normalize_currency(value: Any) -> Optional[str]:
    """Canonicalize currency codes and verified aliases such as ``VNĐ``."""
    value = normalize_missing_value(value)
    if value is None:
        return None
    raw = str(value).strip().upper()
    if not raw:
        return None
    compact = re.sub(r"[\s._-]+", "", raw)
    compact = compact.replace("Ð", "Đ")
    if compact in CURRENCY_ALIASES:
        return CURRENCY_ALIASES[compact]
    if re.fullmatch(r"[A-Z]{3}", compact):
        return compact
    return None


def normalize_denomination(value: Any) -> Optional[int]:
    """Return an integer denomination or ``None`` for missing/unparseable input.

    Thousand separators are accepted, and the numeric part is extracted from
    labels such as ``500 MMK`` or ``500000VND`` without a currency whitelist.
    The parsed integer is compared exactly, so 10000 and 100000 stay distinct.
    """
    value = normalize_missing_value(value)
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value or None
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            return None
        number = int(value)
        return number or None
    if isinstance(value, Decimal):
        if not value.is_finite() or value != value.to_integral_value():
            return None
        number = int(value)
        return number or None

    text = str(value).strip()
    if not text:
        return None

    text = " ".join(text.strip().split())
    number_match = _NUMBER_TOKEN_RE.search(text)
    if not number_match:
        return None
    text = number_match.group(0)

    compact_space = re.sub(r"\s+", "", text)
    if re.fullmatch(r"\d+", compact_space):
        number = int(compact_space)
        return number or None

    if re.fullmatch(r"\d{1,3}([,.]\d{3})+", compact_space):
        number = int(re.sub(r"[,.]", "", compact_space))
        return number or None

    if re.fullmatch(r"\d{1,3}(\s+\d{3})+", text):
        number = int(re.sub(r"\s+", "", text))
        return number or None

    decimal_match = re.fullmatch(r"(\d+)[,.](\d+)", compact_space)
    if decimal_match:
        integer_part, fractional_part = decimal_match.groups()
        if set(fractional_part) == {"0"}:
            number = int(integer_part)
            return number or None
        return None

    try:
        decimal_value = Decimal(compact_space)
    except InvalidOperation:
        return None
    if decimal_value == decimal_value.to_integral_value():
        number = int(decimal_value)
        return number or None
    return None


def normalize_boolean(value: Any) -> Optional[bool]:
    """Normalize common spreadsheet boolean values."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value == 1:
            return True
        if value == 0:
            return False
    if isinstance(value, str):
        text = str(value).strip().casefold()
        if text in {"true", "t", "yes", "y", "1"}:
            return True
        if text in {"false", "f", "no", "n", "0"}:
            return False
    value = normalize_missing_value(value)
    if value is None:
        return None
    text = str(value).strip().casefold()
    if text in {"true", "t", "yes", "y", "1"}:
        return True
    if text in {"false", "f", "no", "n", "0"}:
        return False
    return None


def compare_country(ground_truth: Any, prediction: Any) -> bool:
    gt = normalize_country(ground_truth)
    pred = normalize_country(prediction)
    return gt is not None and pred is not None and gt == pred


def compare_currency(ground_truth: Any, prediction: Any) -> bool:
    gt = normalize_currency(ground_truth)
    pred = normalize_currency(prediction)
    return gt is not None and pred is not None and gt == pred


def compare_denomination(ground_truth: Any, prediction: Any) -> bool:
    gt = normalize_denomination(ground_truth)
    pred = normalize_denomination(prediction)
    return gt is not None and pred is not None and gt == pred


def calculate_field_correctness(
    *,
    ground_truth_country: Any,
    predicted_country: Any,
    ground_truth_currency: Any,
    predicted_currency: Any,
    ground_truth_denomination: Any,
    predicted_denomination: Any,
) -> Dict[str, Any]:
    """Verify field-level correctness and exact-match accuracy.

    ``field_score_pct`` is the percentage of the three independently verified
    fields that match. ``exact_match`` is true only when all three fields match.
    """
    ground_truth_identity = normalize_currency_identity(
        ground_truth_country,
        ground_truth_currency,
        ground_truth_denomination,
    )
    predicted_identity = normalize_currency_identity(
        predicted_country,
        predicted_currency,
        predicted_denomination,
    )
    normalized_ground_truth_country = (
        ground_truth_identity["canonical_country"] or normalize_country(ground_truth_country)
    )
    normalized_predicted_country = (
        predicted_identity["canonical_country"] or normalize_country(predicted_country)
    )
    normalized_ground_truth_currency = (
        ground_truth_identity["currency_code"] or normalize_currency(ground_truth_currency)
    )
    normalized_predicted_currency = (
        predicted_identity["currency_code"] or normalize_currency(predicted_currency)
    )
    normalized_ground_truth_denomination = (
        ground_truth_identity["denomination"]
        if ground_truth_identity["denomination"] is not None
        else normalize_denomination(ground_truth_denomination)
    )
    normalized_predicted_denomination = (
        predicted_identity["denomination"]
        if predicted_identity["denomination"] is not None
        else normalize_denomination(predicted_denomination)
    )

    country_correct = (
        normalized_ground_truth_country is not None
        and normalized_predicted_country is not None
        and normalized_ground_truth_country == normalized_predicted_country
    )
    currency_correct = (
        normalized_ground_truth_currency is not None
        and normalized_predicted_currency is not None
        and normalized_ground_truth_currency == normalized_predicted_currency
    )
    denomination_correct = (
        normalized_ground_truth_denomination is not None
        and normalized_predicted_denomination is not None
        and normalized_ground_truth_denomination
        == normalized_predicted_denomination
    )
    field_correct_count = int(country_correct) + int(currency_correct) + int(
        denomination_correct
    )
    field_total = 3
    exact_match = (
        country_correct and currency_correct and denomination_correct
    )

    return {
        "normalized_ground_truth_country": normalized_ground_truth_country,
        "normalized_predicted_country": normalized_predicted_country,
        "normalized_ground_truth_currency": normalized_ground_truth_currency,
        "normalized_predicted_currency": normalized_predicted_currency,
        "normalized_ground_truth_denomination": normalized_ground_truth_denomination,
        "normalized_predicted_denomination": normalized_predicted_denomination,
        "country_correct": country_correct,
        "currency_correct": currency_correct,
        "denomination_correct": denomination_correct,
        "field_correct_count": field_correct_count,
        "field_total": field_total,
        "field_score_pct": round(field_correct_count / field_total * 100, 2),
        "exact_match": exact_match,
        "has_complete_prediction": (
            normalized_predicted_country is not None
            and normalized_predicted_currency is not None
            and normalized_predicted_denomination is not None
        ),
    }


def classification_label(value: Any, normalizer: Any) -> str:
    """Return a sklearn-safe label, using a sentinel for missing predictions."""
    normalized = normalizer(value)
    if normalized is None:
        return MISSING_SENTINEL
    return str(normalized)
