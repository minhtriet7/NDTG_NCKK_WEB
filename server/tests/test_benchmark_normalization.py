from app.utils.benchmark_normalization import (
    calculate_field_correctness,
    compare_denomination,
    normalize_denomination,
)


def test_normalize_denomination_required_examples():
    assert normalize_denomination("500 MMK") == 500
    assert normalize_denomination("1000 MMK") == 1000
    assert normalize_denomination("5000 KHR") == 5000
    assert normalize_denomination("10000 LAK") == 10000
    assert normalize_denomination("20 THB") == 20
    assert normalize_denomination("50 MYR") == 50
    assert normalize_denomination("2 SGD") == 2
    assert normalize_denomination("100000 IDR") == 100000
    assert normalize_denomination("500000 VND") == 500000
    assert normalize_denomination("500000VND") == 500000
    assert normalize_denomination("10000 VND") == 10000
    assert normalize_denomination("10,000") == 10000
    assert normalize_denomination("10.000") == 10000
    assert normalize_denomination("10 000") == 10000
    assert normalize_denomination(10000.0) == 10000
    assert normalize_denomination(None) is None
    assert normalize_denomination("FAILED") is None
    assert normalize_denomination(0) is None
    assert normalize_denomination("0") is None
    assert normalize_denomination("10000 VND") != 100000
    assert compare_denomination("10000 VND", 100000) is False


def test_field_correctness_keeps_independent_fields():
    result = calculate_field_correctness(
        ground_truth_country="Vietnam",
        ground_truth_currency="VND",
        ground_truth_denomination=500000,
        predicted_country="Vietnam",
        predicted_currency="VND",
        predicted_denomination=100000,
    )

    assert result["country_correct"] is True
    assert result["currency_correct"] is True
    assert result["denomination_correct"] is False
    assert result["field_correct_count"] == 2
    assert result["field_score_pct"] == 66.67
    assert result["exact_match"] is False


def test_missing_prediction_does_not_become_zero():
    result = calculate_field_correctness(
        ground_truth_country="Vietnam",
        ground_truth_currency="VND",
        ground_truth_denomination=10000,
        predicted_country=None,
        predicted_currency="FAILED",
        predicted_denomination=None,
    )

    assert result["normalized_predicted_denomination"] is None
    assert result["has_complete_prediction"] is False
    assert result["field_correct_count"] == 0
    assert result["exact_match"] is False


def test_eur_member_country_matches_european_union_identity():
    result = calculate_field_correctness(
        ground_truth_country="European Union",
        ground_truth_currency="EUR",
        ground_truth_denomination=500,
        predicted_country="Germany",
        predicted_currency="EUR",
        predicted_denomination="500 EUR",
    )

    assert result["normalized_ground_truth_country"] == "Euro Zone"
    assert result["normalized_predicted_country"] == "Euro Zone"
    assert result["country_correct"] is True
    assert result["currency_correct"] is True
    assert result["denomination_correct"] is True
    assert result["field_correct_count"] == 3
    assert result["exact_match"] is True


def test_non_eur_country_behavior_is_not_euro_canonicalized():
    result = calculate_field_correctness(
        ground_truth_country="European Union",
        ground_truth_currency="EUR",
        ground_truth_denomination=500,
        predicted_country="Germany",
        predicted_currency="DEM",
        predicted_denomination=500,
    )

    assert result["normalized_ground_truth_country"] == "Euro Zone"
    assert result["normalized_predicted_country"] == "Germany"
    assert result["country_correct"] is False
    assert result["currency_correct"] is False
    assert result["denomination_correct"] is True
