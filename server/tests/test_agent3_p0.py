import asyncio
import json
import os
import sys
import time
import types
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def _forbid_network(*_args, **_kwargs):
    raise AssertionError("Provider/network access is forbidden in AG3 unit tests.")


# Keep this test runnable even when only the bundled Python runtime is available.
requests_stub = types.ModuleType("requests")
requests_stub.get = _forbid_network
requests_stub.post = _forbid_network
sys.modules["requests"] = requests_stub

config_stub = types.ModuleType("app.core.config")
config_stub.settings = SimpleNamespace(
    IMGBB_API_KEY=None,
    SERPAPI_KEY=None,
    AGENT3_SERPAPI_TIMEOUT_SECONDS=20,
    AGENT3_SERPAPI_MAX_RETRIES=1,
    AGENT3_FORMATTER_TIMEOUT_SECONDS=10,
    AGENT3_FORMATTER_MAX_RETRIES=1,
    AGENT3_SELENIUM_ENABLED=False,
    model_fields_set=set(),
)
sys.modules["app.core.config"] = config_stub

agent2_stub = types.ModuleType("app.agents.agent_2_llm")
agent2_stub.JSON_TEMPLATE = "{}"
agent2_stub.MODEL_LLM_MAIN = "mock"
agent2_stub.clean_json = lambda value: value
agent2_stub.get_gemini_client = _forbid_network
sys.modules["app.agents.agent_2_llm"] = agent2_stub

base_stub = types.ModuleType("app.agents.base_agent")


class _BaseAgent:
    def __init__(self, agent_name="Agent"):
        self.agent_name = agent_name


base_stub.BaseAgent = _BaseAgent
sys.modules["app.agents.base_agent"] = base_stub

google_stub = types.ModuleType("google")
google_genai_stub = types.ModuleType("google.genai")
google_types_stub = types.ModuleType("google.genai.types")
google_types_stub.GenerateContentConfig = lambda **kwargs: kwargs
google_genai_stub.types = google_types_stub
google_stub.genai = google_genai_stub
sys.modules["google"] = google_stub
sys.modules["google.genai"] = google_genai_stub
sys.modules["google.genai.types"] = google_types_stub

admin_stub = types.ModuleType("app.services.admin_service")


class _AdminService:
    @staticmethod
    async def get_system_config():
        return SimpleNamespace()


admin_stub.AdminService = _AdminService
sys.modules["app.services.admin_service"] = admin_stub

chrome_stub = types.ModuleType("app.services.chrome_driver")


class _ChromeDriver:
    def __init__(self, *_args, **_kwargs):
        _forbid_network()


chrome_stub.ChromeDriver = _ChromeDriver
sys.modules["app.services.chrome_driver"] = chrome_stub

link_validator_stub = types.ModuleType("app.utils.link_validator")


async def _forbid_link_validation(*_args, **_kwargs):
    _forbid_network()


link_validator_stub.filter_alive_links = _forbid_link_validation
sys.modules["app.utils.link_validator"] = link_validator_stub

from app.agents.agent_3_lens import (  # noqa: E402
    _extract_amount_currency,
    _stage_timeout,
    parse_lens_evidence_without_llm,
    validate_agent3_identity,
)
from app.agents.agent_3_selector import (  # noqa: E402
    _is_weak_agent3_result,
    run_agent3_lens,
)
from app.agents.agent_3_lens_v2 import Agent3LensV2  # noqa: E402
from app.agents.agent_aggregator import run_aggregator  # noqa: E402
from app.services.evidence_ranker_service import (  # noqa: E402
    build_banknote_result_from_evidence,
    rank_lens_evidence,
)


def _agent3_payload(**overrides):
    payload = {
        "quoc_gia": "United States",
        "ma_tien_te": "USD",
        "menh_gia": "100 USD",
        "do_tin_cay": 0.9,
        "status": "Completed",
        "provider": "mock",
        "evidence": [
            {
                "bucket": "exact_match",
                "title": "United States 100 USD banknote",
                "snippet": "100 US dollar bill",
                "source": "example.test",
                "url": "https://example.test/us-100-banknote",
            }
        ],
    }
    payload.update(overrides)
    return payload


class Agent3ValidationTests(unittest.TestCase):
    def test_expired_deadline_stops_next_stage(self):
        with self.assertRaises(TimeoutError):
            _stage_timeout(time.monotonic() - 1.0, 10.0)

    def test_no_source_is_not_counted(self):
        result = validate_agent3_identity(
            _agent3_payload(status="Partial", evidence=[]),
            evidence=[],
        )
        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["error_type"], "no_source")

    def test_technical_error_is_not_counted(self):
        result = validate_agent3_identity(
            _agent3_payload(status="Failed", error_type="technical_error", evidence=[]),
            evidence=[],
        )
        self.assertEqual(result["status"], "Failed")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["error_type"], "technical_error")

    def test_v2_partial_response_uses_common_validator(self):
        result = json.loads(
            Agent3LensV2()._partial_response(
                "No usable source",
                raw_evidence=[],
            )
        )[0]
        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["error_type"], "no_source")

    def test_weak_result_and_invalid_denomination(self):
        weak = _agent3_payload(menh_gia="2024 USD", do_tin_cay=0.1)
        self.assertTrue(_is_weak_agent3_result(json.dumps([weak])))

    def test_us_is_not_matched_inside_business(self):
        parsed = parse_lens_evidence_without_llm(
            [
                {
                    "bucket": "exact_match",
                    "title": "Business catalog 100 USD banknote",
                    "snippet": "Catalog listing without an issuing country",
                    "source": "example.test",
                    "url": "https://example.test/business-catalog",
                }
            ]
        )
        self.assertEqual(parsed["quoc_gia"], "Không xác định")
        self.assertEqual(parsed["status"], "Partial")

    def test_usd_without_country_does_not_become_timor_leste(self):
        ranked = rank_lens_evidence(
            [
                {
                    "bucket": "exact_match",
                    "title": "100 USD banknote",
                    "snippet": "Currency note",
                    "source": "example.test",
                    "url": "https://example.test/100-usd",
                }
            ]
        )
        candidate = build_banknote_result_from_evidence(ranked)
        validated = validate_agent3_identity(candidate, evidence=ranked)
        self.assertEqual(candidate["quoc_gia"], "Không xác định")
        self.assertEqual(validated["status"], "Partial")
        self.assertTrue(validated["not_counted_in_consensus"])

    def test_sale_price_is_not_used_as_denomination(self):
        amount, currency = _extract_amount_currency(
            "United States 100 USD banknote price $50.00"
        )
        parsed = parse_lens_evidence_without_llm(
            [
                {
                    "bucket": "exact_match",
                    "title": "United States 100 USD banknote price $50.00",
                    "snippet": "Collector shop listing",
                    "source": "example.test",
                    "url": "https://example.test/us-100-sale",
                }
            ]
        )
        self.assertEqual((amount, currency), (100, "USD"))
        self.assertIn("amount:100", parsed["dac_diem_chinh"])
        self.assertNotIn("amount:50", parsed["dac_diem_chinh"])


class Agent3SelectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_weak_primary_uses_fallback_when_budget_remains(self):
        config = SimpleNamespace(
            enable_agent_3=True,
            lens_enabled=True,
            lens_provider="serpapi",
            lens_fallback_enabled=True,
            lens_fallback_provider="selenium",
            agent3_v2_enabled=True,
        )
        weak = json.dumps([_agent3_payload(status="Partial", evidence=[])])
        valid = json.dumps([_agent3_payload(provider="selenium")])
        provider_mock = AsyncMock(side_effect=[weak, valid])

        with patch(
            "app.agents.agent_3_selector.AdminService.get_system_config",
            new=AsyncMock(return_value=config),
        ), patch(
            "app.agents.agent_3_selector._run_by_provider",
            new=provider_mock,
        ):
            result = json.loads(
                await run_agent3_lens(
                    b"mock-image",
                    deadline=time.monotonic() + 10.0,
                )
            )[0]

        self.assertEqual(provider_mock.await_count, 2)
        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["fallback_from_provider"], "serpapi")

    async def test_weak_primary_does_not_start_fallback_without_budget(self):
        config = SimpleNamespace(
            enable_agent_3=True,
            lens_enabled=True,
            lens_provider="serpapi",
            lens_fallback_enabled=True,
            lens_fallback_provider="selenium",
            agent3_v2_enabled=True,
        )
        weak = json.dumps([_agent3_payload(status="Partial", evidence=[])])
        provider_mock = AsyncMock(return_value=weak)

        with patch(
            "app.agents.agent_3_selector.AdminService.get_system_config",
            new=AsyncMock(return_value=config),
        ), patch(
            "app.agents.agent_3_selector._run_by_provider",
            new=provider_mock,
        ):
            result = json.loads(
                await run_agent3_lens(
                    b"mock-image",
                    deadline=time.monotonic() + 1.0,
                )
            )[0]

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(result["status"], "Partial")


class AggregatorGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_valid_agents_win_when_agent3_failed(self):
        vote = {
            "quoc_gia": "United States",
            "ma_tien_te": "USD",
            "menh_gia": "100 USD",
            "do_tin_cay": 0.9,
            "status": "Completed",
        }
        failed_agent3 = _agent3_payload(
            status="Failed",
            error_type="technical_error",
            not_counted_in_consensus=True,
            evidence=[],
        )
        result = await run_aggregator(
            json.dumps([vote]),
            json.dumps([vote]),
            json.dumps([failed_agent3]),
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["matched_agents"], 2)
        self.assertEqual(result["consensus_pattern"], "2/3")


if __name__ == "__main__":
    unittest.main()
