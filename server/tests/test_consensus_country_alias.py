"""
Tests for country alias normalization in the consensus/aggregator pipeline.

Covers the bug: AG1 returning "Hoa Kỳ" and AG3 returning "United States"
should produce the same vote_key and reach consensus.

Run:
    cd server
    python -m pytest tests/test_consensus_country_alias.py -v
    # or without pytest:
    python tests/test_consensus_country_alias.py
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.agents.agent_aggregator import run_aggregator
from app.utils.currency_normalizer import normalize_country, normalize_agent_vote

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_agent_json(status, country, denomination, ma_tien_te=None, not_counted=False):
    d = {
        "status": status,
        "quoc_gia": country,
        "menh_gia": denomination,
    }
    if ma_tien_te:
        d["ma_tien_te"] = ma_tien_te
    if not_counted:
        d["not_counted_in_consensus"] = True
    return json.dumps(d, ensure_ascii=False)


def _failed_agent_json():
    return json.dumps({
        "status": "Failed",
        "error": "429 RESOURCE_EXHAUSTED quota exceeded",
        "error_type": "quota_exceeded",
    })


# ---------------------------------------------------------------------------
# Unit tests — normalize_country alias map
# ---------------------------------------------------------------------------

def test_normalize_country_hoa_ky():
    """'Hoa Kỳ' must normalize to 'United States'."""
    assert normalize_country("Hoa Kỳ") == "United States"
    assert normalize_country("hoa kỳ") == "United States"
    assert normalize_country("Hoa ky") == "United States"   # no diacritics variant


def test_normalize_country_us_variants():
    variants = ["United States", "USA", "U.S.", "America", "united states of america", "US"]
    for v in variants:
        result = normalize_country(v)
        assert result == "United States", f"Expected 'United States' for '{v}', got '{result}'"


def test_normalize_country_my():
    """'Mỹ' is also a Vietnamese alias for the US."""
    assert normalize_country("Mỹ") == "United States"
    assert normalize_country("mỹ") == "United States"


def test_normalize_country_vietnam_aliases():
    for v in ["Việt Nam", "viet nam", "Vietnam", "VN"]:
        result = normalize_country(v)
        assert result == "Vietnam", f"Expected 'Vietnam' for '{v}', got '{result}'"


def test_normalize_country_japan():
    assert normalize_country("Nhật Bản") == "Japan"
    assert normalize_country("japan") == "Japan"


def test_normalize_country_uk():
    for v in ["Anh", "United Kingdom", "UK", "Great Britain"]:
        result = normalize_country(v)
        assert result == "United Kingdom", f"Expected 'United Kingdom' for '{v}', got '{result}'"


def test_normalize_country_south_korea():
    for v in ["Hàn Quốc", "South Korea", "Korea"]:
        result = normalize_country(v)
        assert result == "South Korea", f"Expected 'South Korea' for '{v}', got '{result}'"


# ---------------------------------------------------------------------------
# Test 1 — US alias consensus: AG1 "Hoa Kỳ" + AG2 Failed + AG3 "United States"
# ---------------------------------------------------------------------------

def test_us_alias_consensus():
    """
    AG1: Hoa Kỳ / USD / 100
    AG2: Failed (quota exceeded)
    AG3: United States / USD / 100
    Expected: consensus achieved, matched_agents=2, denomination='100 USD'
    """
    ag1 = _make_agent_json("Completed", "Hoa Kỳ", "100 USD", ma_tien_te="USD")
    ag2 = _failed_agent_json()
    ag3 = _make_agent_json("Completed", "United States", "100 USD", ma_tien_te="USD")

    result = asyncio.run(run_aggregator(ag1, ag2, ag3))

    # Vote keys must match after normalization
    # (both should become ("united states", "USD", "100"))
    assert result.get("matched_agents", 0) >= 2, (
        f"Expected matched_agents>=2, got {result.get('matched_agents')}. "
        f"Status: {result.get('status')}. valid_votes: {result.get('valid_votes')}"
    )
    status = str(result.get("status", "")).lower()
    assert status not in ("conflict", "consensus_failed", "failed", "needs_better_image"), (
        f"Expected successful status, got '{status}'"
    )
    denom = result.get("final_denomination") or result.get("menh_gia") or ""
    assert "100" in str(denom), f"Expected denomination containing '100', got '{denom}'"
    assert "usd" in str(denom).lower() or result.get("ma_tien_te") == "USD", (
        f"Expected USD in result, got denomination='{denom}', ma_tien_te='{result.get('ma_tien_te')}'"
    )

    print(f"[PASS] test_us_alias_consensus: {result.get('final_denomination')} "
          f"matched={result.get('matched_agents')} status={result.get('status')}")


# ---------------------------------------------------------------------------
# Test 2 — Vietnam alias consensus
# ---------------------------------------------------------------------------

def test_vietnam_alias_consensus():
    """
    AG1: Việt Nam / VND / 500000
    AG2: Vietnam / VND / 500000
    AG3: Failed
    Expected: consensus, matched_agents=2
    """
    ag1 = _make_agent_json("Completed", "Việt Nam", "500000 VND", ma_tien_te="VND")
    ag2 = _make_agent_json("Completed", "Vietnam",  "500000 VND", ma_tien_te="VND")
    ag3 = _failed_agent_json()

    result = asyncio.run(run_aggregator(ag1, ag2, ag3))

    assert result.get("matched_agents", 0) >= 2, (
        f"Expected matched_agents>=2, got {result.get('matched_agents')}. "
        f"valid_votes: {result.get('valid_votes')}"
    )
    denom = result.get("final_denomination") or ""
    assert "500000" in str(denom), f"Expected '500000' in denomination, got '{denom}'"

    print(f"[PASS] test_vietnam_alias_consensus: {result.get('final_denomination')} "
          f"matched={result.get('matched_agents')} status={result.get('status')}")


# ---------------------------------------------------------------------------
# Test 3 — Different country does NOT match
# ---------------------------------------------------------------------------

def test_different_country_no_match():
    """
    AG1: United States / USD / 100
    AG2: Failed
    AG3: Canada / CAD / 100
    Expected: no consensus (matched_agents < 2)
    """
    ag1 = _make_agent_json("Completed", "United States", "100 USD", ma_tien_te="USD")
    ag2 = _failed_agent_json()
    ag3 = _make_agent_json("Completed", "Canada", "100 CAD", ma_tien_te="CAD")

    result = asyncio.run(run_aggregator(ag1, ag2, ag3))

    assert result.get("matched_agents", 0) < 2, (
        f"Expected matched_agents<2 (different countries), got {result.get('matched_agents')}"
    )

    print(f"[PASS] test_different_country_no_match: matched={result.get('matched_agents')} "
          f"status={result.get('status')}")


# ---------------------------------------------------------------------------
# Test 4 — My alias (Vietnamese informal) maps to United States
# ---------------------------------------------------------------------------

def test_my_alias_maps_to_us():
    ag1 = _make_agent_json("Completed", "Mỹ", "100 USD", ma_tien_te="USD")
    ag2 = _failed_agent_json()
    ag3 = _make_agent_json("Completed", "USA", "100 USD", ma_tien_te="USD")

    result = asyncio.run(run_aggregator(ag1, ag2, ag3))

    assert result.get("matched_agents", 0) >= 2, (
        f"Expected matched_agents>=2 for 'Mỹ' + 'USA', got {result.get('matched_agents')}. "
        f"valid_votes: {result.get('valid_votes')}"
    )
    print(f"[PASS] test_my_alias_maps_to_us: matched={result.get('matched_agents')} "
          f"status={result.get('status')}")


# ---------------------------------------------------------------------------
# Runner (no pytest)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_normalize_country_hoa_ky,
        test_normalize_country_us_variants,
        test_normalize_country_my,
        test_normalize_country_vietnam_aliases,
        test_normalize_country_japan,
        test_normalize_country_uk,
        test_normalize_country_south_korea,
        test_us_alias_consensus,
        test_vietnam_alias_consensus,
        test_different_country_no_match,
        test_my_alias_maps_to_us,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            print(f"[FAIL] {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"[ERROR] {t.__name__}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {len(tests)-failed}/{len(tests)} passed")
    if failed:
        sys.exit(1)
    else:
        print("All tests passed!")
