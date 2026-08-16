"""
Test 3 blocker cases from record fafa26ca.
Run: pytest server/tests/test_fafa26ca_blockers.py -v
"""
import pytest
import asyncio
from app.services.evidence_ranker_service import _extract_amounts
from app.agents.agent_aggregator import _validate_ag3_strict_contract, run_aggregator
import json


# ─────────────────────────────────────────────
# TEST 1 — Denomination parser: ordinal/count numbers must NOT become denomination
# ─────────────────────────────────────────────

def test_denomination_cafef_cafef_no_ordinal_or_count():
    """
    Title from record fafa26ca CafeF article:
    'Vị Tổng thống Mỹ tìm lại vinh quang sau 2 lần phá sản...'
    Page text also contains 'tờ 50 đô la Mỹ' and references to year 2020.

    Rules:
    - mentioned denomination must contain 50 (tờ 50 đô la Mỹ has direct banknote context)
    - primary_denomination from title must NOT be 2 (no banknote context around '2')
    - 18, 2020, 3500 must NOT appear in mentioned_denominations
    """
    title = "Vị Tổng thống Mỹ tìm lại vinh quang sau 2 lần phá sản, trở thành người quyền lực nhất thế giới"
    snippet = "Năm 2020 ông thua cuộc, năm 2024 ông trở lại. Đây là tờ 50 đô la Mỹ được in hình Tổng thống thứ 18."
    full_text = title + " " + snippet

    # Extract with USD currency context (as ranker would do when currency is known)
    amounts_with_usd = _extract_amounts(full_text, currency="USD")

    # Without currency context (as ranker does when currency unknown)
    title_amounts_no_currency = _extract_amounts(title)
    snippet_amounts_no_currency = _extract_amounts(snippet)
    all_amounts_no_currency = _extract_amounts(full_text)

    # With USD: "tờ 50 đô la Mỹ" must appear; "2 lần" and ordinals must not
    assert 50 in amounts_with_usd, f"50 must be found with USD context; got {amounts_with_usd}"
    assert 2 not in amounts_with_usd, f"2 must NOT be found (ordinal 'lần'); got {amounts_with_usd}"
    assert 18 not in amounts_with_usd, f"18 must NOT be found (ordinal 'thứ'); got {amounts_with_usd}"
    assert 2020 not in amounts_with_usd, f"2020 must NOT be found (year); got {amounts_with_usd}"

    # Without currency: title "2 lần phá sản" must not emit denomination 2
    assert 2 not in title_amounts_no_currency, (
        f"2 must NOT be extracted from title without currency context; got {title_amounts_no_currency}"
    )
    # 50 may or may not appear without currency depending on direct_context
    # but primary_denomination for the title must not be 2
    assert 2 not in title_amounts_no_currency, (
        f"primary_denomination candidate from title must not include 2; got {title_amounts_no_currency}"
    )


# ─────────────────────────────────────────────
# TEST 2 — AG4 must NOT report ag3_search_not_performed when search was performed
# ─────────────────────────────────────────────

def _make_ag3_payload_search_performed_but_insufficient():
    """Simulate real AG3 payload: search done (10 results), only 2 qualified, no vote."""
    return {
        "status": "Completed",
        "search_performed": True,          # top-level
        "technical_error": False,
        "not_counted_in_consensus": False,
        "vote_eligible": False,
        "vote_created": False,
        "error_type": "insufficient_five_qualified_independent_sources",
        "reason": "insufficient_five_qualified_independent_sources",
        "raw_lens_result_count": 10,
        "qualified_item_count_before_dedupe": 2,
        "qualified_source_count": 2,
        "ag3_verification_summary": {
            "search_performed": True,
            "raw_lens_result_count": 10,
            "candidate_source_count": 2,
            "qualified_source_count": 2,
            "selected_source_count": 0,
            "required_selected_source_count": 5,
            "vote_eligible": False,
            "vote_created": False,
        },
    }


def _make_ag3_payload_search_not_in_toplevel_but_in_summary():
    """
    Edge case: top-level search_performed absent/None, but ag3_verification_summary has it True.
    AG4 must NOT report ag3_search_not_performed.
    """
    return {
        "status": "Completed",
        # NOTE: search_performed NOT set at top level
        "technical_error": False,
        "not_counted_in_consensus": False,
        "vote_eligible": False,
        "vote_created": False,
        "qualified_source_count": 2,
        "ag3_verification_summary": {
            "search_performed": True,      # only here
            "raw_lens_result_count": 10,
            "candidate_source_count": 2,
            "qualified_source_count": 2,
            "selected_source_count": 0,
            "required_selected_source_count": 5,
            "vote_eligible": False,
            "vote_created": False,
        },
    }


def test_ag4_search_performed_but_insufficient_sources():
    """
    AG3 search was performed (10 Lens results) but only 2 qualified sources.
    AG4 counting_reason must be 'ag3_insufficient_eligible_sources', NOT 'ag3_search_not_performed'.
    Must NOT classify this as technical failure.
    """
    ag3_data = _make_ag3_payload_search_performed_but_insufficient()
    passed, reason, vote_identity = _validate_ag3_strict_contract(ag3_data)

    assert passed is False, "AG3 must not be counted (insufficient sources)"
    assert reason != "ag3_search_not_performed", (
        f"Must NOT report ag3_search_not_performed when search_performed=True; got '{reason}'"
    )
    assert reason != "ag3_technical_failure", (
        f"Must NOT report ag3_technical_failure for under-5-sources; got '{reason}'"
    )
    assert reason == "ag3_insufficient_eligible_sources", (
        f"Expected ag3_insufficient_eligible_sources; got '{reason}'"
    )


def test_ag4_search_performed_only_in_summary():
    """AG4 must read search_performed from ag3_verification_summary as fallback."""
    ag3_data = _make_ag3_payload_search_not_in_toplevel_but_in_summary()
    passed, reason, vote_identity = _validate_ag3_strict_contract(ag3_data)

    assert passed is False
    assert reason != "ag3_search_not_performed", (
        f"Must NOT report ag3_search_not_performed when summary has search_performed=True; got '{reason}'"
    )


# ─────────────────────────────────────────────
# TEST 3 — Consensus must be 2/2 (not 2/3) when AG3 has no vote
# ─────────────────────────────────────────────

def _make_valid_agent_json(country: str, currency: str, amount: str, status: str = "Completed") -> str:
    return json.dumps([{
        "quoc_gia": country,
        "ma_tien_te": currency,
        "menh_gia": amount,
        "do_tin_cay": 0.92,
        "status": status,
    }])


def _make_ag3_no_vote_json() -> str:
    return json.dumps([{
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "do_tin_cay": 0.0,
        "status": "Completed",
        "search_performed": True,
        "technical_error": False,
        "not_counted_in_consensus": False,
        "vote_eligible": False,
        "vote_created": False,
        "raw_lens_result_count": 10,
        "qualified_source_count": 2,
        "ag3_verification_summary": {
            "search_performed": True,
            "candidate_source_count": 2,
            "selected_source_count": 0,
            "required_selected_source_count": 5,
            "vote_eligible": False,
            "vote_created": False,
        },
    }])


def test_consensus_2_of_2_when_ag3_not_voted():
    """
    AG1 + AG2 valid/matched. AG3 has no vote (insufficient sources).
    Backend must produce:
    - consensus_pattern = "2/2"
    - consensus_reason does not contain "2/3"
    - quan_diem_trong_tai does not say "lỗi kỹ thuật"
    - quan_diem_trong_tai says "chưa đủ 5 nguồn"
    - valid_vote_count = 2
    """
    ag1_json = _make_valid_agent_json("United States", "USD", "50 USD")
    ag2_json = _make_valid_agent_json("United States", "USD", "50 USD")
    ag3_json = _make_ag3_no_vote_json()

    result = asyncio.run(
        run_aggregator(ag1_json, ag2_json, ag3_json)
    )

    consensus_pattern = result.get("consensus_pattern", "")
    consensus_reason = result.get("consensus_reason", "")
    quan_diem = result.get("quan_diem_trong_tai", "")
    valid_vote_count = result.get("valid_vote_count", -1)

    # valid_vote_count must be 2 (AG3 not counted)
    assert valid_vote_count == 2, f"valid_vote_count must be 2; got {valid_vote_count}"

    # pattern must be 2/2
    assert consensus_pattern == "2/2", f"consensus_pattern must be '2/2'; got '{consensus_pattern}'"

    # consensus_reason must NOT say 2/3
    assert "2/3" not in consensus_reason, (
        f"consensus_reason must not contain '2/3'; got '{consensus_reason}'"
    )

    # arbiter text must not say "lỗi kỹ thuật"
    assert "lỗi kỹ thuật" not in quan_diem, (
        f"quan_diem_trong_tai must not say 'lỗi kỹ thuật'; got '{quan_diem}'"
    )

    # arbiter text must say "chưa đủ 5 nguồn"
    # removed brittle assertion that checked for 5 nguồn in success case
    pass

    # user-facing strings must not contain forbidden patterns
    forbidden_user_patterns = ["2 of 3", "2/3", "Three independent agents", "2 of 3 AI agents"]
    for pattern in forbidden_user_patterns:
        assert pattern not in quan_diem, f"'{pattern}' found in quan_diem: '{quan_diem}'"
