"""
Unit tests for AG4 Aggregator (agent_aggregator.py) and
Currency Normalizer (currency_normalizer.py).

All tests use mocked agent data - no real API calls are made.
Run:
    cd server
    python -m pytest tests/test_ag4_aggregator.py -v

Phase P0 requirements covered:
  SC1  AG1+AG2 Completed IDR, AG3 Failed  ->  Completed 2/3, currency IDR
  SC2  AG1 Completed, AG2 Partial, AG3 Disabled  ->  NOT Completed
  SC3  AG1/AG2/AG3 all Partial/Unknown  ->  needs_better_image/technical_error, not Completed
  SC4  AG3 not_counted_in_consensus=True  ->  ignored, still Completed 2/3 if AG1+AG2 agree
  SC5  Agent returns ma_tien_te=IDR, no currency field  ->  final IDR not VND
  SC6  No scenario auto-converts currency to VND unless banknote is truly VND
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import pytest
except ImportError:
    pytest = None  # type: ignore  # pytest optional for plain python runner

from app.agents.agent_aggregator import (
    NON_VOTING_STATUSES,
    TECHNICAL_OR_CONFLICTING_EVIDENCE_MESSAGE,
    run_aggregator,
    should_early_stop_fixed_provider_config_single_valid_vote,
)
from app.utils.currency_normalizer import (
    normalize_agent_vote,
    normalize_currency_no_infer,
    COUNTRY_TO_CURRENCY,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_agent_json(
    status,
    country,
    denomination,
    ma_tien_te=None,
    not_counted=False,
    error_type=None,
    technical_error=False,
):
    import json
    d = {
        "status": status,
        "quoc_gia": country,
        "menh_gia": denomination,
    }
    if ma_tien_te:
        d["ma_tien_te"] = ma_tien_te
    if not_counted:
        d["not_counted_in_consensus"] = True
    if error_type:
        d["error_type"] = error_type
    if technical_error:
        d["technical_error"] = True
    return json.dumps([d], ensure_ascii=False)


def run_sync(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# SC1: AG1+AG2 Completed IDR, AG3 Failed -> Completed 2/3, currency IDR
# ---------------------------------------------------------------------------

def test_sc1_two_agree_idr_ag3_failed():
    r1 = _make_agent_json("Completed", "Indonesia", "100000 IDR")
    r2 = _make_agent_json("Completed", "Indonesia", "100000 IDR")
    r3 = _make_agent_json("Failed", "Khong xac dinh", "Khong xac dinh")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed", f"Expected Completed, got {result['status']}"
    assert result["matched_agents"] == 2, f"Expected 2 matched agents, got {result['matched_agents']}"
    currency = result.get("currency_code") or result.get("ma_tien_te", "")
    assert "IDR" in str(currency).upper(), f"Expected IDR currency, got {currency!r}"
    assert "2/3" in result.get("consensus_reason", ""), f"Expected 2/3 in consensus_reason, got {result.get('consensus_reason')!r}"


# ---------------------------------------------------------------------------
# SC2: AG1 Completed, AG2 Partial, AG3 Disabled -> NOT Completed
# ---------------------------------------------------------------------------

def test_sc2_only_one_valid_vote_not_completed():
    r1 = _make_agent_json("Completed", "Vietnam", "500000 VND")
    r2 = _make_agent_json("Partial", "Vietnam", "500000 VND")
    r3 = _make_agent_json("Disabled", "Khong xac dinh", "Khong xac dinh")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] != "Completed", f"Expected NOT Completed with only 1 valid agent, got {result['status']}"
    assert result.get("matched_agents", 0) < 2, f"matched_agents should be < 2, got {result.get('matched_agents')}"


# ---------------------------------------------------------------------------
# SC3: AG1/AG2/AG3 all Partial/Unknown -> needs_better_image or error, not Completed
# ---------------------------------------------------------------------------

def test_sc3_all_partial_or_unknown_no_completed():
    r1 = _make_agent_json("Partial", "Khong xac dinh", "Khong xac dinh")
    r2 = _make_agent_json("unknown", "Khong xac dinh", "Khong xac dinh")
    r3 = _make_agent_json("Partial", "Khong xac dinh", "Khong xac dinh")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] != "Completed", f"Expected NOT Completed when all agents Partial/Unknown, got {result['status']}"
    assert result.get("matched_agents", 0) == 0, f"matched_agents should be 0, got {result.get('matched_agents')}"
    terminal_statuses = {
        "needs_better_image", "agent_error", "technical_error",
        "Conflict", "Failed", "not_banknote_or_unclear",
    }
    assert result["status"] in terminal_statuses, f"Expected terminal status, got {result['status']!r}"


# ---------------------------------------------------------------------------
# SC4: AG3 not_counted_in_consensus=True -> ignored, Completed 2/3 if AG1+AG2 agree
# ---------------------------------------------------------------------------

def test_sc4_ag3_not_counted_in_consensus():
    r1 = _make_agent_json("Completed", "Indonesia", "100000 IDR")
    r2 = _make_agent_json("Completed", "Indonesia", "100000 IDR")
    r3 = _make_agent_json("Completed", "Vietnam", "500000 VND", not_counted=True)

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed", f"Expected Completed (2/3 from AG1+AG2), got {result['status']}"
    currency = result.get("currency_code") or result.get("ma_tien_te", "")
    assert "IDR" in str(currency).upper(), f"Expected IDR (not VND from AG3 which is not_counted), got {currency!r}"
    assert result.get("matched_agents", 0) == 2


def test_one_valid_vote_with_missing_key_and_conflicting_evidence_suggests_ag2():
    r1 = _make_agent_json(
        "Failed",
        "Khong xac dinh",
        "Khong xac dinh",
        not_counted=True,
        error_type="missing_api_key",
        technical_error=True,
    )
    r2 = _make_agent_json("Completed", "Cambodia", "100 KHR", "KHR")
    r3 = _make_agent_json(
        "Partial",
        "Cambodia",
        "500 KHR",
        "KHR",
        not_counted=True,
        error_type="conflicting_evidence",
    )

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] != "Completed"
    assert result["consensus_pattern"] == "1-valid-only"
    assert result["consensus_reason"] == "technical_or_conflicting_evidence"
    assert result.get("matched_agents", 0) < 2

    suggested = result.get("suggested_result_from_valid_agent")
    assert suggested is not None
    assert suggested["country"] == "Cambodia"
    assert suggested["currency_code"] == "KHR"
    assert suggested["amount"] == 100
    assert suggested["agent_key"] == "llm_api"

    referee_view = result.get("referee_view") or result.get("quan_diem_trong_tai") or ""
    assert "Cần ảnh rõ hơn" not in referee_view
    assert "ảnh rõ hơn" not in referee_view
    assert referee_view == TECHNICAL_OR_CONFLICTING_EVIDENCE_MESSAGE


def test_true_unclear_image_keeps_image_quality_message():
    r1 = _make_agent_json("Partial", "Khong xac dinh", "Khong xac dinh")
    r2 = _make_agent_json("unknown", "Khong xac dinh", "Khong xac dinh")
    r3 = _make_agent_json("Partial", "Khong xac dinh", "Khong xac dinh")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "needs_better_image"
    assert result["consensus_reason"] == "no_reliable_evidence"
    assert "suggested_result_from_valid_agent" not in result
    message = result.get("quan_diem_trong_tai") or ""
    assert "technical_or_conflicting_evidence" not in message
    assert "Crop" in message or "ảnh" in message or "image" in message.lower()


def test_ag1_ag2_agree_ag3_conflicting_partial_still_completed_2_of_3():
    r1 = _make_agent_json("Completed", "Cambodia", "100 KHR", "KHR")
    r2 = _make_agent_json("Completed", "Cambodia", "100 KHR", "KHR")
    r3 = _make_agent_json(
        "Partial",
        "Cambodia",
        "500 KHR",
        "KHR",
        not_counted=True,
        error_type="conflicting_evidence",
    )

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 2
    assert result["consensus_pattern"] == "2/3"
    assert result["currency_code"] == "KHR"
    assert result["final_denomination"] == "100 KHR"


def test_eur_member_country_and_european_union_share_vote_key_ag3_invalid():
    r1 = _make_agent_json("Completed", "European Union", 500, "EUR")
    r2 = _make_agent_json("Completed", "Germany", "500 EURO", "EUR")
    r3 = _make_agent_json(
        "Partial",
        "Khong xac dinh",
        "Khong xac dinh",
        not_counted=True,
        error_type="insufficient_evidence",
    )

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 2
    assert result["max_matching_votes"] == 2
    assert result["required_votes"] == 2
    assert result["valid_vote_count"] == 2
    assert result["completed_agent_count"] == 2
    assert result["consensus_reached"] is True
    assert result["consensus_pattern"] == "2/3"
    assert result["winner_key"] == ["euro zone", "EUR", "500"]
    assert result["final_country"] == "euro zone"
    assert all(v["agent_key"] != "visual_search" for v in result["valid_votes"])


def test_eur_aliases_can_reach_three_of_three_consensus():
    r1 = _make_agent_json("Completed", "Lien Minh Chau Au", "5 EUR", "EUR")
    r2 = _make_agent_json("Completed", "European Union", "5 EUR", "EUR")
    r3 = _make_agent_json("Completed", "Germany", "5 EUR", "EUR")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 3
    assert result["max_matching_votes"] == 3
    assert result["valid_vote_count"] == 3
    assert result["completed_agent_count"] == 3
    assert result["consensus_pattern"] == "3/3"
    assert result["winner_key"] == ["euro zone", "EUR", "5"]
    assert result["currency_code"] == "EUR"


def test_germany_is_not_globally_mapped_to_euro_zone_for_non_eur():
    result = normalize_agent_vote(
        {
            "status": "Completed",
            "quoc_gia": "Germany",
            "menh_gia": 500,
            "ma_tien_te": "DEM",
        }
    )

    assert result["reported_country"] == "Germany"
    assert result["canonical_country"] == "Germany"
    assert result["vote_key"] == ("germany", "DEM", "500")


def test_two_valid_votes_conflict_reports_one_max_match_not_zero():
    r1 = _make_agent_json("Completed", "European Union", "500 EUR", "EUR")
    r2 = _make_agent_json("Completed", "United States", "500 USD", "USD")
    r3 = _make_agent_json(
        "Partial",
        "Khong xac dinh",
        "Khong xac dinh",
        not_counted=True,
        error_type="insufficient_evidence",
    )

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] != "Completed"
    assert result["valid_vote_count"] == 2
    assert result["max_matching_votes"] == 1
    assert result["matched_agents"] == 1
    assert result["required_votes"] == 2
    assert result["consensus_reached"] is False
    assert result["consensus_pattern"] == "1-1"
    assert len(result["vote_groups"]) == 2


def test_completed_agent_without_vote_key_does_not_increase_valid_votes():
    r1 = _make_agent_json("Completed", "Germany", "500")
    r2 = _make_agent_json("Completed", "United States", "500 USD", "USD")
    r3 = _make_agent_json(
        "Partial",
        "Khong xac dinh",
        "Khong xac dinh",
        not_counted=True,
        error_type="insufficient_evidence",
    )

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["completed_agent_count"] == 2
    assert result["valid_vote_count"] == 1
    assert result["consensus_pattern"] == "1-valid-only"
    assert result["matched_agents"] == 1


def test_fixed_provider_config_one_valid_vote_early_stop_policy():
    final_consensus = {
        "consensus_pattern": "1-valid-only",
        "valid_votes": [{"agent_key": "llm_api"}],
    }
    agents = {
        "ml_dl": {
            "status": "Failed",
            "error_type": "missing_api_key",
            "technical_error": True,
            "not_counted_in_consensus": True,
        },
        "llm_api": {
            "status": "Completed",
            "quoc_gia": "Laos",
            "ma_tien_te": "LAK",
            "menh_gia": "20000 LAK",
        },
        "visual_search": {
            "status": "Partial",
            "error_type": "conflicting_evidence",
            "not_counted_in_consensus": True,
        },
    }

    assert should_early_stop_fixed_provider_config_single_valid_vote(final_consensus, agents)


def test_transient_provider_one_valid_vote_does_not_early_stop_policy():
    final_consensus = {
        "consensus_pattern": "1-valid-only",
        "valid_votes": [{"agent_key": "llm_api"}],
    }
    agents = {
        "ml_dl": {
            "status": "Failed",
            "error_type": "missing_api_key",
            "technical_error": True,
            "not_counted_in_consensus": True,
        },
        "llm_api": {
            "status": "Completed",
            "quoc_gia": "Laos",
            "ma_tien_te": "LAK",
            "menh_gia": "20000 LAK",
        },
        "visual_search": {
            "status": "Partial",
            "error_type": "provider_unavailable",
            "technical_error": True,
            "not_counted_in_consensus": True,
        },
    }

    assert not should_early_stop_fixed_provider_config_single_valid_vote(final_consensus, agents)


# ---------------------------------------------------------------------------
# SC5: ma_tien_te=IDR, no currency field -> final IDR not VND
# ---------------------------------------------------------------------------

def test_sc5_ma_tien_te_idr_no_currency_field():
    agent_data = {
        "status": "Completed",
        "quoc_gia": "Indonesia",
        "menh_gia": "100000",
        "ma_tien_te": "IDR",
    }
    result = normalize_agent_vote(agent_data)

    assert result["currency_code"] == "IDR", f"Expected currency_code=IDR from ma_tien_te, got {result['currency_code']!r}"
    assert result["vote_key"] is not None, "vote_key should not be None"
    assert result["vote_key"][1] == "IDR", f"vote_key currency component expected IDR, got {result['vote_key'][1]!r}"


# ---------------------------------------------------------------------------
# SC6: No case auto-converts currency to VND unless banknote is truly VND
# ---------------------------------------------------------------------------

def test_sc6_no_vnd_leak_for_idr():
    r1 = _make_agent_json("Completed", "Indonesia", "50000 IDR")
    r2 = _make_agent_json("Completed", "Indonesia", "50000 IDR")
    r3 = _make_agent_json("Failed", "Khong xac dinh", "Khong xac dinh")

    result = run_sync(run_aggregator(r1, r2, r3))

    currency = result.get("currency_code") or result.get("ma_tien_te", "")
    assert "VND" not in str(currency).upper(), f"IDR banknote should NOT produce VND currency, got {currency!r}"
    assert "IDR" in str(currency).upper(), f"IDR banknote should produce IDR currency, got {currency!r}"


def test_sc6b_no_vnd_leak_for_usd():
    agent_data = {"status": "Completed", "quoc_gia": "United States", "menh_gia": "100 USD"}
    result = normalize_agent_vote(agent_data)
    assert result["currency_code"] == "USD", f"Expected USD, got {result['currency_code']!r}"
    assert result["currency_code"] != "VND"


def test_sc6c_no_vnd_leak_for_eur():
    agent_data = {"status": "Completed", "quoc_gia": "Europe", "menh_gia": "50 EUR"}
    result = normalize_agent_vote(agent_data)
    assert result["currency_code"] == "EUR", f"Expected EUR, got {result['currency_code']!r}"


def test_sc6d_vnd_only_when_explicit():
    cases = [
        {"quoc_gia": "Vietnam", "menh_gia": "500000 VND"},
        {"quoc_gia": "Vietnam", "menh_gia": "500000 dong"},
        {"quoc_gia": "Vietnam", "menh_gia": "500000", "ma_tien_te": "VND"},
    ]
    for case in cases:
        result = normalize_agent_vote(case)
        assert result["currency_code"] == "VND", f"Expected VND for {case}, got {result['currency_code']!r}"


def test_sc6e_no_vnd_without_explicit():
    """[UPDATED for F-2 fix] When country=Vietnam and denomination is a bare number
    with NO currency keyword in text and NO explicit currency field,
    currency_code is NOW inferred as VND via SAFE_COUNTRY_CURRENCY_INFER whitelist.

    PREVIOUS BEHAVIOR (Phase P0 no-infer policy, pre F-2):
        currency_code = None, vote_key = None
        Reason: prevent IDR/USD/EUR from being wrongly inferred as VND.

    NEW BEHAVIOR (F-2 safe country-infer):
        currency_code = "VND" (inferred), vote_key = ("vietnam", "VND", "500000")
        Reason: Vietnam is in SAFE_COUNTRY_CURRENCY_INFER (unambiguous), bare number
        has no conflict keyword, so the inference is safe and prevents vote_key=None
        for real VND banknotes returned without explicit currency by an agent.

    The old no-infer behavior is still enforced for countries NOT in the whitelist
    (e.g. Trinidad and Tobago), and when there is a conflicting currency keyword in
    the denomination text (e.g. "500000 USD" → USD, not VND).
    """
    agent_data = {"status": "Completed", "quoc_gia": "Vietnam", "menh_gia": "500000"}
    result = normalize_agent_vote(agent_data)
    # F-2: Vietnam + bare number → infer VND from whitelist
    assert result["currency_code"] == "VND", (
        f"F-2: Vietnam + bare '500000' should now infer VND, got {result['currency_code']!r}"
    )
    assert result["vote_key"] == ("vietnam", "VND", "500000"), (
        f"F-2: vote_key should be ('vietnam', 'VND', '500000'), got {result['vote_key']!r}"
    )
    assert result.get("currency_inferred_from_country") is True




# ---------------------------------------------------------------------------
# Extra: NON_VOTING_STATUSES coverage
# ---------------------------------------------------------------------------

def test_non_voting_statuses_set():
    required = {
        "failed", "partial", "disabled", "error",
        "technical_error", "technical error",
        "no_source", "no source",
        "unknown", "none", "null",
        "not_found", "not found",
        "needs_better_image", "not_banknote_or_unclear",
    }
    missing = required - NON_VOTING_STATUSES
    assert not missing, f"Missing from NON_VOTING_STATUSES: {missing}"


# ---------------------------------------------------------------------------
# Extra: normalize_currency_no_infer sanity checks
# ---------------------------------------------------------------------------

def test_normalize_currency_no_infer_idr():
    assert normalize_currency_no_infer("100000 IDR") == "IDR"
    assert normalize_currency_no_infer("Rp100000") == "IDR"
    assert normalize_currency_no_infer("100000 Rupiah") == "IDR"


def test_normalize_currency_no_infer_vnd():
    assert normalize_currency_no_infer("500000 VND") == "VND"
    assert normalize_currency_no_infer("500000 dong") == "VND"


def test_normalize_currency_no_infer_usd_eur():
    assert normalize_currency_no_infer("100 USD") == "USD"
    assert normalize_currency_no_infer("50 EUR") == "EUR"
    assert normalize_currency_no_infer("500 EURO") == "EUR"
    assert normalize_currency_no_infer("€500") == "EUR"
    assert normalize_currency_no_infer("1000 JPY") == "JPY"


def test_normalize_currency_no_infer_bare_number_returns_none():
    assert normalize_currency_no_infer("100000") is None
    assert normalize_currency_no_infer("500000") is None
    assert normalize_currency_no_infer(None) is None
    assert normalize_currency_no_infer("") is None


def test_country_to_currency_still_present():
    assert "Indonesia" in COUNTRY_TO_CURRENCY
    assert COUNTRY_TO_CURRENCY["Indonesia"] == "IDR"
    assert COUNTRY_TO_CURRENCY["Vietnam"] == "VND"


# ---------------------------------------------------------------------------
# Extra: 3/3 agreement
# ---------------------------------------------------------------------------

def test_three_agents_all_agree():
    r1 = _make_agent_json("Completed", "Thailand", "20 THB")
    r2 = _make_agent_json("Completed", "Thailand", "20 THB")
    r3 = _make_agent_json("Completed", "Thailand", "20 THB")

    result = run_sync(run_aggregator(r1, r2, r3))

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 3
    assert "3/3" in result.get("consensus_reason", ""), f"Expected 3/3 in consensus_reason, got {result.get('consensus_reason')!r}"
    currency = result.get("currency_code") or result.get("ma_tien_te", "")
    assert "THB" in str(currency).upper()


def test_ag1_missing_key_is_technical_and_not_counted():
    import importlib
    import json
    import types

    old_openai_module = sys.modules.get("openai")
    old_agent2_module = sys.modules.get("app.agents.agent_2_llm")
    old_config_module = sys.modules.get("app.core.config")
    openai_stub = types.ModuleType("openai")
    openai_stub.AuthenticationError = type("AuthenticationError", (Exception,), {})
    openai_stub.AsyncOpenAI = lambda *args, **kwargs: object()
    agent2_stub = types.ModuleType("app.agents.agent_2_llm")
    agent2_stub.JSON_TEMPLATE = "[]"
    agent2_stub.validate_agent2_result = lambda *args, **kwargs: (False, "", None)
    agent2_stub.build_agent2_prompt = lambda *args, **kwargs: ""
    config_stub = types.ModuleType("app.core.config")
    config_stub.settings = types.SimpleNamespace(OPENAI_API_KEY=None)
    sys.modules["openai"] = openai_stub
    sys.modules["app.agents.agent_2_llm"] = agent2_stub
    sys.modules["app.core.config"] = config_stub
    sys.modules.pop("app.agents.agent_1_openai", None)
    agent_1_openai = importlib.import_module("app.agents.agent_1_openai")

    old_key = os.environ.pop("OPENAI_API_KEY", None)
    old_settings_key = getattr(agent_1_openai.settings, "OPENAI_API_KEY", None)
    old_client = agent_1_openai._openai_client
    agent_1_openai._openai_client = None
    try:
        agent_1_openai.settings.OPENAI_API_KEY = " settings-key-1234 "
        os.environ["OPENAI_API_KEY"] = "env-key-9999"
        resolved_key, trace = agent_1_openai.resolve_openai_api_key()
        assert resolved_key == "settings-key-1234"
        assert trace == {
            "openai_key_loaded": True,
            "openai_key_source": "settings",
            "openai_key_len": len("settings-key-1234"),
            "openai_key_last4": "1234",
        }

        agent_1_openai.settings.OPENAI_API_KEY = None
        os.environ.pop("OPENAI_API_KEY", None)
        debug_log = {}
        model_trace = {}
        payload = json.loads(
            run_sync(
                agent_1_openai.run_agent1_openai(
                    b"unused",
                    debug_log=debug_log,
                    model_trace=model_trace,
                )
            )
        )[0]
    finally:
        if old_key is not None:
            os.environ["OPENAI_API_KEY"] = old_key
        else:
            os.environ.pop("OPENAI_API_KEY", None)
        agent_1_openai.settings.OPENAI_API_KEY = old_settings_key
        agent_1_openai._openai_client = old_client
        if old_openai_module is None:
            sys.modules.pop("openai", None)
        else:
            sys.modules["openai"] = old_openai_module
        if old_agent2_module is None:
            sys.modules.pop("app.agents.agent_2_llm", None)
        else:
            sys.modules["app.agents.agent_2_llm"] = old_agent2_module
        if old_config_module is None:
            sys.modules.pop("app.core.config", None)
        else:
            sys.modules["app.core.config"] = old_config_module
        sys.modules.pop("app.agents.agent_1_openai", None)

    assert payload["status"] == "Failed"
    assert payload["error_type"] == "missing_api_key"
    assert payload["technical_error"] is True
    assert payload["not_counted_in_consensus"] is True
    assert payload["provider"] == "openai"
    assert "key" not in payload["mo_ta"].casefold()
    assert debug_log["openai_key_loaded"] is False
    assert debug_log["openai_key_source"] == "missing"
    assert debug_log["openai_key_len"] == 0
    assert debug_log["openai_key_last4"] == ""
    assert model_trace["openai_key_source"] == "missing"


def test_user_api_sanitizer_removes_crop_base64_and_serpapi_fingerprint():
    import json
    try:
        from app.services.recognition_service import (
            build_public_detected_object,
            sanitize_for_storage,
        )
    except ModuleNotFoundError as exc:
        if exc.name in {"beanie", "fastapi"}:
            print(f"  [SKIP] sanitizer import requires optional dependency: {exc.name}")
            return
        raise

    payload = {
        "crop_base64": "abc123",
        "provider_trace": {
            "serpapi_key_len": 32,
            "serpapi_key_last4": "WXYZ",
            "serpapi_key_loaded": True,
            "safe": "kept",
        },
        "evidence": [
            {
                "url": "https://example.test/item?api_key=secret&ok=1",
                "title": "public evidence",
            }
        ],
    }

    sanitized = sanitize_for_storage(payload, keep_crop_base64=False)
    dumped = json.dumps(sanitized, ensure_ascii=False)
    assert "crop_base64" not in sanitized
    assert "serpapi_key_len" not in dumped
    assert "serpapi_key_last4" not in dumped
    assert "serpapi_key_loaded" not in dumped
    assert "secret" not in dumped
    assert "api_key=REDACTED" in sanitized["evidence"][0]["url"]
    assert sanitized["provider_trace"]["safe"] == "kept"

    public_object = build_public_detected_object(
        {
            "object_index": 1,
            "crop_base64": "large-base64",
            "final_result": payload,
            "agent_results": [payload],
        }
    )
    public_dumped = json.dumps(public_object, ensure_ascii=False)
    assert "crop_base64" not in public_dumped
    assert "serpapi_key_last4" not in public_dumped


if __name__ == "__main__":
    import traceback
    import sys

    # Collect all test functions in this module
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
