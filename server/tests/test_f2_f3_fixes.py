"""
Tests cho F-2 (safe country-infer bare denomination) và F-3 (denomination fallback).

F-2 tests bao gồm 8 cases bắt buộc:
  1. Vietnam + "100000" -> vote_key ("vietnam", "VND", "100000")
  2. Vietnam + "100000 USD" -> NO infer (conflict)
  3. Cambodia + "500" -> KHR
  4. Indonesia + "500" -> IDR
  5. Unknown + "500" -> vote_key None
  6. Trinidad + "50" -> khong infer (not in whitelist)
  7. Vietnam + "100000" + conflict text "USD" -> reject
  8. Existing tests van pass

F-3 tests:
  A. denomination = None khi final_consensus khong co final_denomination/menh_gia/denomination
  B. Gia tri "Needs review" KHONG bao gio duoc xuat hien trong field denomination

Run:
    cd server
    python -m pytest tests/test_f2_f3_fixes.py -v
    hoac
    python tests/test_f2_f3_fixes.py
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import pytest
except ImportError:
    pytest = None

from app.utils.currency_normalizer import (
    normalize_agent_vote,
    infer_currency_from_country_safe,
    SAFE_COUNTRY_CURRENCY_INFER,
    COUNTRY_TO_CURRENCY,
)


# ---------------------------------------------------------------------------
# F-2 Test Cases - safe country-infer bare denomination
# ---------------------------------------------------------------------------

def test_f2_tc1_vietnam_bare_infers_vnd():
    """TC1: Vietnam + '100000' -> vote_key ('vietnam', 'VND', '100000')"""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000"})
    assert result["currency_code"] == "VND", f"Expected VND, got {result['currency_code']}"
    assert result["vote_key"] is not None, "vote_key should not be None"
    assert result["vote_key"] == ("vietnam", "VND", "100000"), f"Unexpected vote_key {result['vote_key']}"
    assert result.get("currency_inferred_from_country") is True, "Should be flagged as inferred"


def test_f2_tc2_vietnam_bare_with_usd_conflict_no_infer():
    """TC2: Vietnam + '100000 USD' -> khong infer VND (conflict: USD trong text)"""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000 USD"})
    assert result["currency_code"] == "USD", f"Expected USD from text, got {result['currency_code']}"
    if result["vote_key"] is not None:
        assert result["vote_key"][1] == "USD", f"vote_key currency should be USD, got {result['vote_key']}"


def test_f2_tc3_cambodia_bare_infers_khr():
    """TC3: Cambodia + '500' -> KHR"""
    result = normalize_agent_vote({"quoc_gia": "Cambodia", "menh_gia": "500"})
    assert result["currency_code"] == "KHR", f"Expected KHR, got {result['currency_code']}"
    assert result["vote_key"] == ("cambodia", "KHR", "500"), f"Unexpected vote_key {result['vote_key']}"
    assert result.get("currency_inferred_from_country") is True


def test_f2_tc4_indonesia_bare_infers_idr():
    """TC4: Indonesia + '500' -> IDR"""
    result = normalize_agent_vote({"quoc_gia": "Indonesia", "menh_gia": "500"})
    assert result["currency_code"] == "IDR", f"Expected IDR, got {result['currency_code']}"
    assert result["vote_key"] == ("indonesia", "IDR", "500"), f"Unexpected vote_key {result['vote_key']}"


def test_f2_tc5_unknown_country_bare_no_infer():
    """TC5: Khong xac dinh country + '500' -> vote_key None"""
    result = normalize_agent_vote({"quoc_gia": "Khong xac dinh", "menh_gia": "500"})
    assert result["currency_code"] is None, f"Expected None, got {result['currency_code']}"
    assert result["vote_key"] is None, f"Expected None vote_key, got {result['vote_key']}"


def test_f2_tc6_trinidad_bare_no_infer_not_in_whitelist():
    """TC6: Trinidad + '50' -> khong infer (not in SAFE_COUNTRY_CURRENCY_INFER whitelist)"""
    result = normalize_agent_vote({"quoc_gia": "Trinidad and Tobago", "menh_gia": "50"})
    assert result["currency_code"] is None, (
        f"Trinidad should NOT be inferred, got {result['currency_code']}"
    )
    assert result["vote_key"] is None, f"vote_key should be None for unwhitelisted country"


def test_f2_tc7_vietnam_bare_conflict_usd_text_no_vnd():
    """TC7: Vietnam + denomination text co 'USD' -> reject VND"""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000 USD"})
    if result["vote_key"] is not None:
        assert result["vote_key"][1] != "VND", (
            f"Should NOT infer VND when USD conflict exists, got {result['vote_key']}"
        )


def test_f2_tc8_myanmar_bare_infers_mmk():
    """TC8: Myanmar + '500' (bare) -> infer MMK via safe whitelist.

    Sau F-2 fix, Myanmar trong SAFE_COUNTRY_CURRENCY_INFER -> infer MMK.
    Day la thay doi co chu dich so voi Phase P0 (khong infer truoc day).
    """
    result = normalize_agent_vote({"quoc_gia": "Myanmar", "menh_gia": "500"})
    assert result["currency_code"] == "MMK", (
        f"Myanmar + bare '500' should infer MMK via safe whitelist, got {result['currency_code']}"
    )
    assert result["vote_key"] == ("myanmar", "MMK", "500")


def test_f2_explicit_currency_still_overrides_whitelist():
    """Explicit currency field LUON co priority cao hon country-infer."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000", "ma_tien_te": "IDR"})
    assert result["currency_code"] == "IDR", f"Explicit IDR should win, got {result['currency_code']}"
    assert result.get("currency_inferred_from_country") is False


def test_f2_denomination_with_currency_text_parses_correctly():
    """Denomination text co currency -> parsed tu text (step 2), khong phai infer (step 3)."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "500000 VND"})
    assert result["currency_code"] == "VND"
    assert result.get("currency_inferred_from_country") is False


def test_f2_vietnam_viet_nam_alias_infers_vnd():
    """Country 'Viet Nam' (alias) -> normalized to 'Vietnam' -> infer VND."""
    result = normalize_agent_vote({"quoc_gia": "Viet Nam", "menh_gia": "50000"})
    assert result["currency_code"] == "VND", f"Viet Nam alias should infer VND, got {result['currency_code']}"


def test_f2_campuchia_alias_infers_khr():
    """Country 'Campuchia' (Vietnamese name) -> normalized to 'Cambodia' -> infer KHR."""
    result = normalize_agent_vote({"quoc_gia": "Campuchia", "menh_gia": "5000"})
    assert result["currency_code"] == "KHR", f"Campuchia should infer KHR, got {result['currency_code']}"


def test_f2_bare_number_with_rp_prefix_not_bare():
    """'Rp500' co 'Rp' prefix -> parsed as IDR via CURRENCY_MAPPING (step 2), khong phai bare."""
    result = normalize_agent_vote({"quoc_gia": "Indonesia", "menh_gia": "Rp500"})
    assert result["currency_code"] == "IDR"
    assert result.get("currency_inferred_from_country") is False


def test_f2_infer_helper_bare_number():
    """Unit test helper: infer_currency_from_country_safe() voi bare number."""
    assert infer_currency_from_country_safe("Vietnam", "100000") == "VND"
    assert infer_currency_from_country_safe("Cambodia", "500") == "KHR"
    assert infer_currency_from_country_safe("Indonesia", "500") == "IDR"
    assert infer_currency_from_country_safe("Japan", "5000") == "JPY"
    assert infer_currency_from_country_safe("South Korea", "1000") == "KRW"


def test_f2_infer_helper_blocks_conflict():
    """infer_currency_from_country_safe() phai tra None khi co currency conflict."""
    assert infer_currency_from_country_safe("Vietnam", "100000 USD") is None
    assert infer_currency_from_country_safe("Vietnam", "100000 IDR") is None
    assert infer_currency_from_country_safe("Vietnam", "100000 EUR") is None


def test_f2_infer_helper_blocks_unknown_country():
    """infer_currency_from_country_safe() tra None cho country khong trong whitelist."""
    assert infer_currency_from_country_safe("Trinidad and Tobago", "50") is None
    assert infer_currency_from_country_safe("Some Country", "500") is None
    assert infer_currency_from_country_safe(None, "500") is None
    assert infer_currency_from_country_safe("", "500") is None


def test_f2_infer_helper_blocks_non_bare():
    """infer_currency_from_country_safe() tra None khi denomination co text content."""
    assert infer_currency_from_country_safe("Vietnam", "one hundred thousand") is None
    assert infer_currency_from_country_safe("Vietnam", "100k") is None
    assert infer_currency_from_country_safe("Vietnam", "100000 vnd") is None


def test_f2_whitelist_contains_required_countries():
    """SAFE_COUNTRY_CURRENCY_INFER co du cac quoc gia toi thieu theo spec."""
    required = {
        "Vietnam": "VND",
        "Cambodia": "KHR",
        "Laos": "LAK",
        "Myanmar": "MMK",
        "Indonesia": "IDR",
        "Thailand": "THB",
        "Japan": "JPY",
        "South Korea": "KRW",
        "China": "CNY",
    }
    for country, expected_currency in required.items():
        assert country in SAFE_COUNTRY_CURRENCY_INFER, f"{country} missing from whitelist"
        assert SAFE_COUNTRY_CURRENCY_INFER[country] == expected_currency, (
            f"{country} should map to {expected_currency}, "
            f"got {SAFE_COUNTRY_CURRENCY_INFER[country]}"
        )


# ---------------------------------------------------------------------------
# F-3 Regression tests - denomination fallback MUST NOT be "Needs review"
# ---------------------------------------------------------------------------

def test_f3_denomination_none_when_no_data():
    """Khi agent khong tra denomination hop le -> vote_key phai None."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "status": "Conflict"})
    assert result["vote_key"] is None, "No denomination -> no vote_key"
    assert result["amount"] is None


def test_f3_needs_review_string_not_a_valid_denomination():
    """'Needs review' khong phai denomination hop le -> vote_key None."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "Needs review"})
    assert result["amount"] is None, "No parseable amount from 'Needs review'"
    assert result["vote_key"] is None


def test_f3_country_to_currency_backward_compat():
    """COUNTRY_TO_CURRENCY cu van con trong module (backward compat)."""
    assert "Vietnam" in COUNTRY_TO_CURRENCY
    assert COUNTRY_TO_CURRENCY["Vietnam"] == "VND"
    assert "Indonesia" in COUNTRY_TO_CURRENCY


# ---------------------------------------------------------------------------
# Backward compatibility - tests tu SC5, SC6e, existing suites
# ---------------------------------------------------------------------------

def test_backward_compat_sc5_explicit_ma_tien_te():
    """SC5: ma_tien_te=IDR explicit -> IDR, khong bi override boi country Vietnam."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000", "ma_tien_te": "IDR"})
    assert result["currency_code"] == "IDR", f"Explicit IDR should win, got {result['currency_code']}"
    if result["vote_key"]:
        assert result["vote_key"][1] == "IDR"


def test_backward_compat_explicit_idr_denomination():
    """Denomination '100000 IDR' -> IDR tu text, khong bi thay bang VND du quoc_gia Vietnam."""
    result = normalize_agent_vote({"quoc_gia": "Vietnam", "menh_gia": "100000 IDR"})
    assert result["currency_code"] == "IDR", "IDR from text should win over VND country-infer"
    assert result.get("currency_inferred_from_country") is False


def test_backward_compat_usd_eur_from_text():
    """USD/EUR tu denomination text -> khong bi replace boi country-infer."""
    r1 = normalize_agent_vote({"quoc_gia": "Europe", "menh_gia": "100 USD"})
    assert r1["currency_code"] == "USD"

    r2 = normalize_agent_vote({"quoc_gia": "Europe", "menh_gia": "50 EUR"})
    assert r2["currency_code"] == "EUR"


# ---------------------------------------------------------------------------
# Runner (plain python, no pytest required)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import traceback

    _test_fns = [
        (name, obj)
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and callable(obj)
    ]
    _passed = 0
    _failed = 0
    for _name, _fn in _test_fns:
        try:
            _fn()
            print(f"  [PASS] {_name}")
            _passed += 1
        except Exception as _exc:
            print(f"  [FAIL] {_name}: {_exc}")
            traceback.print_exc()
            _failed += 1
    print(f"\nTOTAL: {_passed} passed, {_failed} failed")
    if _failed:
        sys.exit(1)
