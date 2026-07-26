import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


def _load_validator_without_project_env():
    config_stub = types.ModuleType("app.core.config")
    config_stub.settings = types.SimpleNamespace(GOOGLE_API_KEY=None)
    module_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "agents"
        / "agent_2_llm.py"
    )
    spec = importlib.util.spec_from_file_location(
        "isolated_agent_2_llm_for_currency_contract",
        module_path,
    )
    module = importlib.util.module_from_spec(spec)
    previous_config = sys.modules.get("app.core.config")
    try:
        sys.modules["app.core.config"] = config_stub
        spec.loader.exec_module(module)
    finally:
        if previous_config is None:
            sys.modules.pop("app.core.config", None)
        else:
            sys.modules["app.core.config"] = previous_config
    return module


agent2_module = _load_validator_without_project_env()
validate_agent2_result = agent2_module.validate_agent2_result
build_agent2_prompt = agent2_module.build_agent2_prompt


def _payload(*, country="Việt Nam", currency="VND", denomination="500000 VND"):
    return {
        "quoc_gia": country,
        "ma_tien_te": currency,
        "menh_gia": denomination,
        "mat_tien": "Mặt trước",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Polymer",
        "mo_ta": "Test validator contract.",
        "quan_diem": "Test validator contract.",
        "phuong_phap": "Unit test",
        "do_tin_cay": 0.9,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Completed",
    }


def _validate(payload):
    return validate_agent2_result(
        json.dumps([payload], ensure_ascii=False)
    )


def test_prompt_contains_multi_note_same_denomination_rule():
    prompt = build_agent2_prompt().lower()

    assert "nhiều tờ tiền cùng mệnh giá" in prompt
    assert 'status="completed"' in prompt
    assert "tờ rõ nhất" in prompt or "phổ biến nhất" in prompt


def test_prompt_contains_multi_note_different_denomination_rule():
    prompt = build_agent2_prompt().lower()

    assert "nhiều tờ khác mệnh giá" in prompt
    assert 'menh_gia="không xác định"' in prompt
    assert 'status="partial"' in prompt


def test_prompt_contains_ignore_hand_background_rule():
    prompt = build_agent2_prompt().lower()

    assert "bỏ qua tay người" in prompt
    assert "bàn, nền" in prompt
    assert "chỉ tập trung vào phần tiền giấy" in prompt


def test_rejects_explicit_currency_conflicting_with_denomination():
    valid, message, normalized = _validate(
        _payload(currency="USD", denomination="500000 VND")
    )

    assert valid is False
    assert "Mâu thuẫn ma_tien_te và menh_gia" in message
    assert normalized is None


def test_keeps_matching_explicit_currency():
    valid, message, normalized = _validate(
        _payload(currency="VND", denomination="500000 VND")
    )

    assert valid is True, message
    assert json.loads(normalized)[0]["ma_tien_te"] == "VND"


@pytest.mark.parametrize("currency", ["Không xác định", "", None])
def test_fills_unknown_explicit_currency_from_denomination(currency):
    valid, message, normalized = _validate(
        _payload(currency=currency, denomination="500000 VND")
    )

    assert valid is True, message
    result = json.loads(normalized)[0]
    assert result["ma_tien_te"] == "VND"
    assert result["menh_gia"] == "500000 VND"


@pytest.mark.parametrize("currency", ["VNĐ", "VND", "vnd", "₫"])
def test_normalizes_vietnamese_currency_aliases(currency):
    valid, message, normalized = _validate(
        _payload(currency=currency, denomination="500000 VND")
    )

    assert valid is True, message
    assert json.loads(normalized)[0]["ma_tien_te"] == "VND"


def test_preserves_existing_bare_denomination_behavior():
    valid, message, normalized = _validate(
        _payload(currency="VND", denomination="500000")
    )

    assert valid is True, message
    result = json.loads(normalized)[0]
    assert result["ma_tien_te"] == "VND"
    assert result["menh_gia"] == "500000 VND"


def test_unknown_identity_remains_invalid():
    valid, _, normalized = _validate(
        _payload(
            country="Không xác định",
            currency="Không xác định",
            denomination="Không xác định",
        )
    )

    assert valid is False
    assert normalized is None


@pytest.mark.parametrize(
    "country",
    ["Trinidad and Tobago", "Trinidad và Tobago"],
)
def test_accepts_open_world_country_with_iso_like_currency(country):
    valid, message, normalized = _validate(
        _payload(country=country, currency="TTD", denomination="50 TTD")
    )

    assert valid is True, message
    result = json.loads(normalized)[0]
    assert result["quoc_gia"] == country
    assert result["ma_tien_te"] == "TTD"
    assert result["menh_gia"] == "50 TTD"
    assert result["status"] == "Completed"


def test_accepts_sane_unknown_country_and_currency_code():
    valid, message, normalized = _validate(
        _payload(country="Some New Country", currency="ABC", denomination="50 ABC")
    )

    assert valid is True, message
    result = json.loads(normalized)[0]
    assert result["quoc_gia"] == "Some New Country"
    assert result["ma_tien_te"] == "ABC"
    assert result["menh_gia"] == "50 ABC"


def test_gemini_model_chain_source_is_visible_without_provider_call():
    chain, source, detail = agent2_module._resolve_gemini_model_chain(False)

    assert chain == ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
    assert source == "default"
    assert detail == "FALLBACK_MODELS"
    assert "gemini-3.1-flash-lite" not in chain
    assert "gemini-3.5-flash" not in chain


def test_env_admin_unverified_model_chain_warning_without_provider_call():
    warning = agent2_module._ag2_model_chain_warning(
        ["gemini-3.1-flash-lite", "gemini-2.5-flash"],
        "env/admin",
    )

    assert warning == "env_admin_chain_contains_unverified_models"
    assert agent2_module._ag2_model_chain_warning(
        ["gemini-3.1-flash-lite"],
        "default",
    ) is None


@pytest.mark.parametrize("denomination", ["50 Dollars", "Fifty Dollars"])
def test_explicit_ttd_controls_ambiguous_dollar_denomination(denomination):
    valid, message, normalized = _validate(
        _payload(
            country="Trinidad and Tobago",
            currency="TTD",
            denomination=denomination,
        )
    )

    assert valid is True, message
    result = json.loads(normalized)[0]
    assert result["ma_tien_te"] == "TTD"
    assert result["menh_gia"] == "50 TTD"


def test_ambiguous_dollars_without_explicit_currency_has_clear_error():
    valid, message, normalized = _validate(
        _payload(
            country="Trinidad and Tobago",
            currency="Không xác định",
            denomination="50 Dollars",
        )
    )

    assert valid is False
    assert message == "currency_missing_or_ambiguous"
    assert normalized is None


@pytest.mark.parametrize(
    "explicit_currency,denomination",
    [("TTD", "50 USD"), ("USD", "50 TTD"), ("VND", "50 USD")],
)
def test_open_world_validator_still_rejects_currency_mismatch(
    explicit_currency,
    denomination,
):
    valid, message, normalized = _validate(
        _payload(
            country="Trinidad and Tobago",
            currency=explicit_currency,
            denomination=denomination,
        )
    )

    assert valid is False
    assert "Mâu thuẫn ma_tien_te và menh_gia" in message
    assert normalized is None
