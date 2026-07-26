import asyncio
import json
import sys
import types

from tests.test_agent3_p0 import validate_agent3_identity
from app.agents.agent_aggregator import run_aggregator
from app.agents.agent_3_lens import Agent3Lens
from app.services.agent3_formatter_router import run_agent3_formatter


def _completed_vote():
    return {
        "quoc_gia": "Việt Nam",
        "ma_tien_te": "VND",
        "menh_gia": "500000 VND",
        "status": "Completed",
        "do_tin_cay": 0.9,
    }


def _weak_deterministic_result(*_args, **_kwargs):
    return {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "status": "Partial",
        "do_tin_cay": 0.2,
        "not_counted_in_consensus": True,
    }


def _install_fake_groq(monkeypatch):
    module = types.ModuleType("app.services.groq_formatter_service")
    base_error = type("GroqFormatterError", (Exception,), {})
    for name in (
        "AuthError",
        "BadJson",
        "MissingKey",
        "NoEvidence",
        "ProviderUnavailable",
        "RateLimit",
        "Timeout",
    ):
        setattr(module, name, type(name, (base_error,), {}))

    async def fake_format_lens_evidence(_evidence, deadline=None):
        return _completed_vote()

    module.format_lens_evidence = fake_format_lens_evidence
    monkeypatch.setitem(sys.modules, module.__name__, module)


def test_ag3_v1_router_validates_mock_groq_before_ag4(monkeypatch):
    _install_fake_groq(monkeypatch)
    agent3_v1 = Agent3Lens()
    debug_log = {}
    weak_evidence = [
        {
            "title": "Possible banknote image",
            "snippet": "No reliable issuing country or denomination is visible.",
            "source": "example.test",
            "url": "https://example.test/uncertain",
        }
    ]

    agent3_json = asyncio.run(
        run_agent3_formatter(
            weak_evidence,
            raw_lens_data=json.dumps(weak_evidence, ensure_ascii=False),
            deadline=None,
            context="mock integration",
            debug_log=debug_log,
            deterministic_parser=_weak_deterministic_result,
            validator=validate_agent3_identity,
            parse_formatted_result=agent3_v1.parse_formatted_result,
        )
    )
    agent3 = json.loads(agent3_json)[0]

    assert agent3["status"] == "Partial"
    assert agent3["not_counted_in_consensus"] is True
    assert agent3["formatter_provider"] == "groq"
    assert agent3["groq_called"] is True
    assert agent3["formatter_output_status"] == "Partial"
    trace = debug_log["formatter_router"]
    assert trace["formatter_provider"] == "groq"
    assert trace["groq_called"] is True
    assert trace["formatter_output_status"] == "Partial"

    valid_vote = json.dumps([_completed_vote()], ensure_ascii=False)
    result = asyncio.run(run_aggregator(valid_vote, valid_vote, agent3_json))

    assert result["status"] == "Completed"
    assert result["matched_agents"] == 2
    assert result["consensus_pattern"] == "2/3"
