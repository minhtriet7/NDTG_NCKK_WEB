import json
import sys
import time
import types
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from app.agents import agent_3_selector as selector
from app.agents.agent_3_lens import (
    Agent3Lens,
    run_candidate_assisted_verification,
)


def _result(
    *,
    status="Partial",
    provider="serpapi",
    error_type=None,
    technical_error=False,
):
    payload = {
        "quoc_gia": "Khong xac dinh",
        "ma_tien_te": "Khong xac dinh",
        "menh_gia": "Khong xac dinh",
        "do_tin_cay": 0.0 if status != "Completed" else 0.9,
        "status": status,
        "provider": provider,
        "evidence": [],
        "not_counted_in_consensus": status != "Completed",
    }
    if error_type:
        payload["error_type"] = error_type
    if technical_error:
        payload["technical_error"] = True
    return json.dumps([payload])


def _config(
    *,
    fallback_enabled=True,
    fallback_provider="selenium",
    selenium_enabled=True,
):
    return SimpleNamespace(
        enable_agent_3=True,
        lens_enabled=True,
        lens_provider="serpapi",
        lens_fallback_enabled=fallback_enabled,
        lens_fallback_provider=fallback_provider,
        agent3_v2_enabled=selenium_enabled,
    )


def _vision_vote():
    return {
        "status": "Completed",
        "quoc_gia": "Laos",
        "ma_tien_te": "LAK",
        "menh_gia": "2000",
        "do_tin_cay": 0.9,
    }


class Agent3SelectorFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def _run(self, config, provider_mock, *, deadline_seconds=12.0):
        with patch.object(
            selector.AdminService,
            "get_system_config",
            new=AsyncMock(return_value=config),
        ), patch.object(
            selector,
            "_run_by_provider",
            new=provider_mock,
        ), patch.object(
            selector,
            "_setting_value",
            side_effect=lambda _name, default=None: default,
        ), patch.object(selector.settings, "SERPAPI_KEY", "mock-secret-1234"):
            raw = await selector.run_agent3_lens(
                b"mock-image",
                deadline=time.monotonic() + deadline_seconds,
            )
        return json.loads(raw)[0]

    async def test_serpapi_completed_does_not_call_selenium(self):
        provider_mock = AsyncMock(return_value=_result(status="Completed"))
        with patch.object(selector, "_is_weak_agent3_result", return_value=False):
            result = await self._run(_config(), provider_mock)

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")
        self.assertFalse(result["provider_trace"]["fallback_attempted"])
        self.assertEqual(result["provider_trace"]["selected_provider"], "serpapi")
        self.assertTrue(result["provider_trace"]["serpapi_only_mode"])

    async def test_serpapi_quota_with_fallback_disabled_is_not_reclassified_as_no_source(self):
        quota = _result(
            status="Failed",
            error_type="rate_limit",
            technical_error=True,
        )
        result = await self._run(
            _config(fallback_enabled=False),
            AsyncMock(return_value=quota),
        )

        self.assertEqual(result["error_type"], "rate_limit")
        self.assertEqual(result["provider_trace"]["primary_error_type"], "rate_limit")
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")
        self.assertFalse(result["provider_trace"]["fallback_attempted"])

    async def test_serpapi_quota_does_not_call_enabled_selenium_in_serpapi_only_mode(self):
        provider_mock = AsyncMock(
            side_effect=[
                _result(status="Failed", error_type="rate_limit", technical_error=True),
                _result(status="Completed", provider="selenium"),
            ]
        )
        result = await self._run(_config(), provider_mock)

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(result["status"], "Failed")
        self.assertEqual(result["provider_trace"]["selected_provider"], "serpapi")
        self.assertEqual(result["provider_trace"]["primary_error_type"], "rate_limit")
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")
        self.assertFalse(result["provider_trace"]["fallback_attempted"])

    async def test_serpapi_429_exception_does_not_call_selenium_in_serpapi_only_mode(self):
        provider_mock = AsyncMock(side_effect=RuntimeError("SerpAPI HTTP 429 quota"))

        result = await self._run(_config(), provider_mock)

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(result["status"], "Failed")
        self.assertEqual(result["error_type"], "rate_limit")
        self.assertIsNone(result["provider_trace"]["selected_provider"])
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")
        self.assertFalse(result["provider_trace"]["fallback_attempted"])

    async def test_weak_primary_stays_non_voting_without_selenium_fallback(self):
        provider_mock = AsyncMock(
            side_effect=[
                _result(status="Partial"),
                _result(status="Partial", provider="selenium"),
            ]
        )
        result = await self._run(_config(), provider_mock)

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(provider_mock.await_count, 1)
        self.assertFalse(result["provider_trace"]["fallback_attempted"])
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")

    async def test_admin_override_cannot_enable_selenium_in_serpapi_only_mode(self):
        provider_mock = AsyncMock(
            side_effect=[
                _result(status="Failed", error_type="rate_limit", technical_error=True),
                _result(status="Completed", provider="selenium"),
            ]
        )
        result = await self._run(
            _config(fallback_provider="serpapi", selenium_enabled=True),
            provider_mock,
        )

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(provider_mock.await_args_list[0].args[0], "serpapi")
        self.assertEqual(result["provider_trace"]["fallback_provider"], "disabled")
        self.assertFalse(result["provider_trace"]["fallback_enabled"])
        self.assertFalse(result["provider_trace"]["selenium_enabled"])
        self.assertTrue(result["provider_trace"]["serpapi_only_mode"])

    async def test_same_primary_skips_with_serpapi_only_reason(self):
        provider_mock = AsyncMock(
            return_value=_result(
                status="Failed",
                error_type="rate_limit",
                technical_error=True,
            )
        )
        result = await self._run(
            _config(fallback_provider="serpapi", selenium_enabled=False),
            provider_mock,
        )

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(
            result["provider_trace"]["fallback_reason"],
            "serpapi_only_mode",
        )

    async def test_selenium_module_unavailable_path_is_not_reached_in_serpapi_only_mode(self):
        provider_mock = AsyncMock(
            side_effect=[
                _result(status="Failed", error_type="rate_limit", technical_error=True),
                ModuleNotFoundError("selenium is not installed"),
            ]
        )
        result = await self._run(_config(), provider_mock)

        self.assertEqual(result["error_type"], "rate_limit")
        self.assertEqual(provider_mock.await_count, 1)
        self.assertFalse(result["provider_trace"]["fallback_attempted"])
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")

    async def test_low_budget_still_reports_serpapi_only_reason(self):
        provider_mock = AsyncMock(return_value=_result(status="Partial"))
        result = await self._run(
            _config(),
            provider_mock,
            deadline_seconds=1.0,
        )

        self.assertEqual(provider_mock.await_count, 1)
        self.assertEqual(result["provider_trace"]["fallback_reason"], "serpapi_only_mode")

    async def test_selector_groq_formatter_keeps_provider_serpapi(self):
        fake_module = types.ModuleType("app.services.groq_formatter_service")

        async def fake_format_lens_evidence(_evidence, deadline=None):
            return {
                "quoc_gia": "Viet Nam",
                "ma_tien_te": "VND",
                "menh_gia": "500000 VND",
                "status": "Completed",
                "provider": "groq",
                "do_tin_cay": 0.9,
            }

        fake_module.format_lens_evidence = fake_format_lens_evidence
        core_result = json.dumps([
            {
                "quoc_gia": "Khong xac dinh",
                "ma_tien_te": "Khong xac dinh",
                "menh_gia": "Khong xac dinh",
                "status": "Partial",
                "provider": "serpapi",
                "evidence": [{"title": "Vietnam 500000 VND banknote"}],
                "not_counted_in_consensus": True,
                "provider_trace": {
                    "primary_provider": "serpapi",
                    "selected_provider": "serpapi",
                },
            }
        ])

        with patch.dict(sys.modules, {fake_module.__name__: fake_module}), patch.object(
            selector,
            "_run_agent3_lens_core",
            new=AsyncMock(return_value=core_result),
        ), patch.object(
            selector.settings,
            "AGENT3_GROQ_FORMATTER_ENABLED",
            True,
        ), patch.object(
            selector.settings,
            "AGENT3_GROQ_FORMATTER_APPLY_PRODUCTION",
            True,
        ):
            raw = await selector.run_agent3_lens(b"mock-image")

        result = json.loads(raw)[0]
        self.assertEqual(result["provider"], "serpapi")
        self.assertEqual(result["formatter_provider"], "groq")
        self.assertEqual(result["provider_trace"]["formatter_provider"], "groq")

    def test_deterministic_formatter_keeps_provider_serpapi(self):
        raw = json.dumps([
            {
                "quoc_gia": "Viet Nam",
                "ma_tien_te": "VND",
                "menh_gia": "500000 VND",
                "status": "Completed",
                "provider": "deterministic",
                "formatter_provider": "deterministic",
                "do_tin_cay": 0.9,
                "not_counted_in_consensus": False,
            }
        ])

        result = json.loads(selector._normalized_agent3_result(raw, "serpapi"))[0]

        self.assertEqual(result["provider"], "serpapi")
        self.assertEqual(result["formatter_provider"], "deterministic")

    async def test_candidate_verification_skips_after_serpapi_quota(self):
        searcher = AsyncMock(return_value=[])
        quota_result = json.loads(
            _result(status="Failed", error_type="rate_limit", technical_error=True)
        )[0]

        result = await run_candidate_assisted_verification(
            _vision_vote(),
            _vision_vote(),
            quota_result,
            searcher=searcher,
            mode="fast_race_to_3",
        )

        searcher.assert_not_awaited()
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_reason"],
            "provider_quota_exhausted",
        )


class Agent3ProviderDiagnosticsTests(unittest.TestCase):
    def test_safe_key_fingerprint_never_contains_full_key(self):
        fingerprint = selector._safe_key_fingerprint("mock-secret-1234")
        self.assertEqual(
            fingerprint,
            {"loaded": True, "length": 16, "last4": "1234"},
        )
        self.assertNotIn("mock-secret-1234", json.dumps(fingerprint))

    def test_serpapi_429_builds_rate_limit_result(self):
        result = json.loads(
            Agent3Lens().build_visual_search_result(
                error=RuntimeError(
                    "SerpApi HTTP 429: Your account has run out of searches."
                )
            )
        )[0]

        self.assertEqual(result["status"], "Failed")
        self.assertEqual(result["error_type"], "rate_limit")
        self.assertTrue(result["technical_error"])
        self.assertEqual(result["provider_trace"]["primary_error_type"], "rate_limit")

    def test_serpapi_no_cache_uses_config_flag(self):
        response = Mock(status_code=200)
        response.json.return_value = {"visual_matches": []}
        with patch(
            "app.agents.agent_3_lens.requests.get",
            return_value=response,
        ) as request_mock, patch(
            "app.agents.agent_3_lens.settings.SERPAPI_KEY",
            "mock-key",
        ), patch(
            "app.agents.agent_3_lens.settings.AGENT3_SERPAPI_NO_CACHE",
            False,
        ):
            Agent3Lens()._call_serpapi_google_lens("https://example.test/image.jpg")

        self.assertEqual(request_mock.call_args.kwargs["params"]["no_cache"], "false")


if __name__ == "__main__":
    unittest.main(verbosity=2)
