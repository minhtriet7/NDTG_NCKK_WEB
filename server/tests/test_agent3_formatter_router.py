import asyncio
import importlib.util
import json
import sys
import time
import types
from pathlib import Path

import pytest

from app.agents.agent_aggregator import run_aggregator
from app.services.agent3_formatter_router import run_agent3_formatter


def _completed_result(confidence=0.9):
    return {
        "quoc_gia": "Việt Nam",
        "ma_tien_te": "VND",
        "menh_gia": "500000 VND",
        "mat_tien": "Mặt trước",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Polymer",
        "mo_ta": "Evidence đủ mạnh.",
        "quan_diem": "Evidence đủ mạnh.",
        "phuong_phap": "Mock",
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Completed",
        "not_counted_in_consensus": False,
    }


def _partial_result(reason="weak_evidence"):
    return {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": reason,
        "quan_diem": reason,
        "phuong_phap": "Mock",
        "do_tin_cay": 0.2,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [],
        "status": "Partial",
        "not_counted_in_consensus": True,
    }


def _validator(payload, evidence=None):
    result = dict(payload)
    result["validator_called"] = True
    result["evidence"] = list(evidence or [])
    if str(result.get("status") or "").casefold() != "completed":
        result["status"] = "Partial"
        result["not_counted_in_consensus"] = True
    return result


def _parse_formatted_result(formatted_text, raw_lens_data, evidence=None):
    parsed = json.loads(formatted_text)
    item = parsed[0] if isinstance(parsed, list) else parsed
    result = _validator(item, evidence=evidence)
    result["parse_formatted_result_called"] = True
    result["raw_lens_data"] = raw_lens_data
    return json.dumps([result], ensure_ascii=False)


def _evidence():
    return [
        {
            "title": "Vietnam 500000 VND banknote",
            "snippet": "Polymer banknote issued by the State Bank of Vietnam",
            "source": "example.test",
            "url": "https://example.test/vnd-500000",
        }
    ]


def _install_fake_groq_service(monkeypatch, *, result=None, error_name=None):
    module = types.ModuleType("app.services.groq_formatter_service")
    base_error = type("GroqFormatterError", (Exception,), {})
    errors = {}
    for name in (
        "AuthError",
        "BadJson",
        "MissingKey",
        "NoEvidence",
        "ProviderUnavailable",
        "RateLimit",
        "Timeout",
    ):
        error_type = type(name, (base_error,), {})
        errors[name] = error_type
        setattr(module, name, error_type)

    calls = {"count": 0}

    async def fake_format_lens_evidence(evidence, deadline=None):
        calls["count"] += 1
        calls["evidence"] = evidence
        calls["deadline"] = deadline
        if error_name:
            raise errors[error_name](error_name)
        return dict(result or _completed_result())

    module.format_lens_evidence = fake_format_lens_evidence
    monkeypatch.setitem(sys.modules, module.__name__, module)
    return calls


def _run_router(evidence, deterministic_parser, debug_log=None):
    return asyncio.run(
        run_agent3_formatter(
            evidence,
            raw_lens_data=json.dumps(evidence, ensure_ascii=False),
            deadline=None,
            context="",
            debug_log=debug_log,
            deterministic_parser=deterministic_parser,
            validator=_validator,
            parse_formatted_result=_parse_formatted_result,
        )
    )


def test_no_evidence_returns_partial_without_loading_groq():
    def forbidden_parser(*args, **kwargs):
        raise AssertionError("deterministic parser must not run without evidence")

    debug_log = {}
    result = json.loads(_run_router([], forbidden_parser, debug_log=debug_log))

    assert isinstance(result, list)
    assert result[0]["status"] == "Partial"
    assert result[0]["not_counted_in_consensus"] is True
    assert result[0]["groq_called"] is False
    assert result[0]["groq_skipped_reason"] == "no_evidence"
    assert debug_log["formatter_router"]["groq_skipped_reason"] == "no_evidence"


def test_low_deadline_budget_skips_formatter_and_preserves_evidence(monkeypatch):
    calls = _install_fake_groq_service(monkeypatch, result=_completed_result())
    debug_log = {}

    def forbidden_deterministic_parser(*_args, **_kwargs):
        raise AssertionError("formatter path must not run with low deadline budget")

    result = json.loads(
        asyncio.run(
            run_agent3_formatter(
                _evidence(),
                raw_lens_data=json.dumps(_evidence(), ensure_ascii=False),
                deadline=time.monotonic() + 0.1,
                context="",
                debug_log=debug_log,
                deterministic_parser=forbidden_deterministic_parser,
                validator=_validator,
                parse_formatted_result=_parse_formatted_result,
            )
        )
    )[0]

    assert calls["count"] == 0
    assert result["status"] == "Partial"
    assert result["not_counted_in_consensus"] is True
    assert result["evidence"]
    assert result["evidence_preserved"] is True
    assert result["timeout_stage"] == "before_formatter"
    assert result["formatter_provider"] == "none"
    assert result["groq_called"] is False
    assert result["groq_skipped_reason"] == "deadline_budget_low"
    trace = debug_log["formatter_router"]
    assert trace["timeout_stage"] == "before_formatter"
    assert trace["fallback_attempted"] is False


def test_missing_groq_module_has_clear_skip_reason(monkeypatch):
    monkeypatch.setitem(sys.modules, "app.services.groq_formatter_service", None)
    debug_log = {}

    result = json.loads(
        _run_router(
            _evidence(),
            lambda *args, **kwargs: _partial_result("module unavailable"),
            debug_log=debug_log,
        )
    )

    assert result[0]["groq_called"] is False
    assert result[0]["groq_skipped_reason"] == "module_unavailable"
    assert result[0]["provider"] == "serpapi"
    assert result[0]["formatter_provider"] == "deterministic"
    assert result[0]["ag3_groq_formatter_used"] is False
    assert result[0]["phuong_phap"] == "Google Lens / SerpAPI"
    assert "Groq" not in result[0]["phuong_phap"]
    assert debug_log["formatter_router"]["groq_skipped_reason"] == "module_unavailable"


def test_strong_deterministic_result_skips_groq(monkeypatch):
    calls = _install_fake_groq_service(
        monkeypatch,
        result=_completed_result(),
    )

    result = json.loads(
        _run_router(_evidence(), lambda *args, **kwargs: _completed_result(0.85))
    )

    assert isinstance(result, list)
    assert result[0]["status"] == "Completed"
    assert result[0]["validator_called"] is True
    assert calls["count"] == 0


def test_strong_deterministic_result_includes_skipped_groq_trace(monkeypatch):
    calls = _install_fake_groq_service(
        monkeypatch,
        result=_completed_result(),
    )
    debug_log = {}

    result = json.loads(
        _run_router(
            _evidence(),
            lambda *args, **kwargs: _completed_result(0.85),
            debug_log=debug_log,
        )
    )

    assert calls["count"] == 0
    assert result[0]["formatter_provider"] == "deterministic"
    assert result[0]["groq_called"] is False
    assert result[0]["groq_skipped_reason"] == "deterministic_strong"
    assert result[0]["formatter_output_status"] == "Completed"
    trace = debug_log["formatter_router"]
    assert trace["formatter_provider"] == "deterministic"
    assert trace["groq_called"] is False
    assert trace["groq_skipped_reason"] == "deterministic_strong"
    assert trace["formatter_output_status"] == "Completed"


def test_weak_deterministic_result_uses_groq_and_existing_parse_flow(monkeypatch):
    calls = _install_fake_groq_service(
        monkeypatch,
        result=_completed_result(0.9),
    )

    result = json.loads(
        _run_router(_evidence(), lambda *args, **kwargs: _partial_result())
    )

    assert calls["count"] == 1
    assert len(calls["evidence"]) <= 5
    assert result[0]["parse_formatted_result_called"] is True
    assert result[0]["validator_called"] is True
    assert isinstance(result, list)


def test_mock_groq_success_includes_called_trace(monkeypatch):
    calls = _install_fake_groq_service(
        monkeypatch,
        result=_completed_result(0.9),
    )
    debug_log = {}

    result = json.loads(
        _run_router(
            _evidence(),
            lambda *args, **kwargs: _partial_result(),
            debug_log=debug_log,
        )
    )

    assert calls["count"] == 1
    assert result[0]["provider"] == "serpapi"
    assert result[0]["formatter_provider"] == "groq"
    assert result[0]["groq_called"] is True
    assert result[0]["groq_skipped_reason"] is None
    assert result[0]["ag3_groq_formatter_used"] is True
    assert result[0]["phuong_phap"] == "Google Lens / SerpAPI + Groq Formatter"
    assert result[0]["formatter_output_status"] == "Completed"
    trace = debug_log["formatter_router"]
    assert trace["formatter_provider"] == "groq"
    assert trace["groq_called"] is True
    assert trace["formatter_output_status"] == "Completed"


def test_groq_input_receives_compact_page_text_only(monkeypatch):
    calls = _install_fake_groq_service(
        monkeypatch,
        result=_completed_result(0.9),
    )
    evidence = [
        {
            **_evidence()[0],
            "page_text_excerpt": "banknote page text " * 300,
            "page_text_checked": True,
            "page_text_identity_terms": ["currency:VND", "amount:500000"],
            "raw_html": "<html>" + ("x" * 10000) + "</html>",
        }
    ]

    result = json.loads(
        _run_router(evidence, lambda *args, **kwargs: _partial_result())
    )

    sent = calls["evidence"][0]
    assert calls["count"] == 1
    assert "page_text_excerpt" in sent
    assert len(sent["page_text_excerpt"]) <= 2200
    assert sent["page_text_checked"] is True
    assert sent["page_text_identity_terms"] == ["currency:VND", "amount:500000"]
    assert "raw_html" not in sent
    assert result[0]["formatter_provider"] == "groq"


def test_compact_formatter_evidence_preserves_rank_metadata(monkeypatch):
    calls = _install_fake_groq_service(monkeypatch, result=_completed_result(0.9))
    captured = {}
    ranked = {
        **_evidence()[0],
        "provider": "selenium",
        "bucket": "text_result",
        "rank": 1,
        "score": 8.0,
        "rank_reasons": ["keyword:tiền giấy", "currency:LAK", "amount:2000"],
        "detected_country": "Lào",
        "detected_currency": "LAK",
        "detected_amounts": [2000],
        "page_text_excerpt": "Tiền giấy Lào 2000 Kip",
        "page_text_checked": True,
    }

    def deterministic_parser(evidence, **kwargs):
        captured["evidence"] = evidence
        return _completed_result(0.85)

    result = json.loads(_run_router([ranked], deterministic_parser))
    sent = captured["evidence"][0]

    assert calls["count"] == 0
    assert sent["score"] == 8.0
    assert sent["detected_country"] == "Lào"
    assert sent["detected_currency"] == "LAK"
    assert sent["detected_amounts"] == [2000]
    assert "currency:LAK" in sent["rank_reasons"]
    assert result[0]["groq_called"] is False
    assert result[0]["groq_skipped_reason"] == "deterministic_strong"


def test_groq_bad_json_returns_partial_without_heavy_fallback(monkeypatch):
    calls = _install_fake_groq_service(monkeypatch, error_name="BadJson")

    result = json.loads(
        _run_router(_evidence(), lambda *args, **kwargs: _partial_result())
    )

    assert calls["count"] == 1
    assert result[0]["status"] == "Partial"
    assert result[0]["not_counted_in_consensus"] is True


@pytest.mark.parametrize(
    "error_name",
    ["MissingKey", "AuthError", "RateLimit", "Timeout", "ProviderUnavailable"],
)
def test_provider_errors_do_not_escape_router(monkeypatch, error_name):
    calls = _install_fake_groq_service(monkeypatch, error_name=error_name)

    result = json.loads(
        _run_router(_evidence(), lambda *args, **kwargs: _partial_result(error_name))
    )

    assert calls["count"] == 1
    assert result[0]["status"] == "Partial"
    assert result[0]["not_counted_in_consensus"] is True


def test_missing_key_trace_marks_groq_as_skipped(monkeypatch):
    calls = _install_fake_groq_service(monkeypatch, error_name="MissingKey")
    debug_log = {}

    result = json.loads(
        _run_router(
            _evidence(),
            lambda *args, **kwargs: _partial_result("MissingKey"),
            debug_log=debug_log,
        )
    )

    assert calls["count"] == 1
    assert result[0]["groq_called"] is False
    assert result[0]["groq_skipped_reason"] == "missing_api_key"
    assert result[0]["formatter_output_status"] == "Partial"
    trace = debug_log["formatter_router"]
    assert trace["groq_called"] is False
    assert trace["groq_skipped_reason"] == "missing_api_key"


def _load_groq_service_without_real_sdk_or_settings(monkeypatch):
    groq_stub = types.ModuleType("groq")
    groq_stub.AsyncGroq = type("AsyncGroq", (), {})
    config_stub = types.ModuleType("app.core.config")
    config_stub.settings = types.SimpleNamespace(
        GROQ_API_KEY=None,
        AGENT3_FORMATTER_MAX_EVIDENCE=5,
        AGENT3_GROQ_TIMEOUT_SECONDS=8.0,
        AGENT3_GROQ_MODEL="mock-primary",
        AGENT3_GROQ_TEMPERATURE=0.0,
        AGENT3_GROQ_MAX_OUTPUT_TOKENS=500,
    )
    monkeypatch.setitem(sys.modules, "groq", groq_stub)
    monkeypatch.setitem(sys.modules, "app.core.config", config_stub)

    service_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "services"
        / "groq_formatter_service.py"
    )
    spec = importlib.util.spec_from_file_location(
        "mocked_groq_formatter_service",
        service_path,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_service_unwraps_one_object_list_without_provider(monkeypatch):
    service = _load_groq_service_without_real_sdk_or_settings(monkeypatch)
    payload = {"status": "Partial", "not_counted_in_consensus": True}

    result = service.extract_json_object_or_first_list_item(
        json.dumps([payload])
    )

    assert result == payload


def test_service_compacts_to_five_safe_fields(monkeypatch):
    service = _load_groq_service_without_real_sdk_or_settings(monkeypatch)
    evidence = [
        {
            "title": f"Title {index}",
            "text": "Short text",
            "source": "example.test",
            "link": f"https://example.test/{index}",
            "raw_serpapi_response": {"must": "not leak"},
        }
        for index in range(8)
    ]

    compact = service.compact_top_evidence(evidence)

    assert len(compact) == 5
    assert all(
        set(item) == {"title", "snippet", "source", "url"}
        for item in compact
    )


def test_ag4_completes_two_of_three_when_ag3_is_partial():
    agent1 = _completed_result()
    agent2 = _completed_result()
    agent3 = _partial_result()

    result = asyncio.run(
        run_aggregator(
            json.dumps([agent1], ensure_ascii=False),
            json.dumps([agent2], ensure_ascii=False),
            json.dumps([agent3], ensure_ascii=False),
        )
    )

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 2


def test_ag4_does_not_count_partial_agent3_as_second_vote():
    agent1 = _completed_result()
    agent2 = _partial_result("agent2 failed")
    agent2["status"] = "Failed"
    agent3 = _partial_result()

    result = asyncio.run(
        run_aggregator(
            json.dumps([agent1], ensure_ascii=False),
            json.dumps([agent2], ensure_ascii=False),
            json.dumps([agent3], ensure_ascii=False),
        )
    )

    assert result["status"] != "Completed"
    assert all(
        vote.get("agent_key") != "visual_search"
        for vote in result.get("valid_votes", [])
    )
