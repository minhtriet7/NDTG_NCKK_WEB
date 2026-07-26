import asyncio
import json
import os
import sys
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Reuse strict provider/network stubs. Any accidental external call fails the test.
from tests.test_agent3_p0 import (  # noqa: E402
    run_agent3_lens,
    run_aggregator,
    validate_agent3_identity,
)
from app.agents.agent_3_lens import normalize_lens_evidence  # noqa: E402


def _unknown_payload(provider, evidence):
    return {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "do_tin_cay": 0.2,
        "status": "Partial",
        "provider": provider,
        "evidence": evidence,
    }


def _identity_fields(country="Việt Nam", currency="VND", amount=500000):
    return {
        "detected_country": country,
        "detected_currency": currency,
        "detected_amounts": [amount],
    }


def _serpapi_evidence(score=9.5):
    return {
        "provider": "serpapi",
        "bucket": "exact_matches",
        "position": 1,
        "title": "500.000 đồng (tiền Việt) – Wikipedia tiếng Việt",
        "snippet": "Bài viết về tờ tiền và mệnh giá 500.000 đồng Việt Nam.",
        "link": "https://vi.wikipedia.org/wiki/500.000_đồng_(tiền_Việt)",
        "source": "Wikipedia",
        "score": score,
        "rank_reasons": ["trusted_source", "currency:VND", "amount:500000"],
        **_identity_fields(),
    }


def _selenium_evidence(score=9.5):
    return {
        "provider": "selenium",
        "bucket": "exact_match",
        "rank": 1,
        "title": "500.000 đồng (tiền Việt) – Wikipedia tiếng Việt",
        "snippet": "Bài viết về tờ tiền và mệnh giá 500.000 đồng Việt Nam.",
        "url": "https://vi.wikipedia.org/wiki/500.000_đồng_(tiền_Việt)",
        "source": "vi.wikipedia.org",
        "score": score,
        "rank_reasons": ["trusted_source", "currency:VND", "amount:500000"],
        **_identity_fields(),
    }


class Agent3ProviderParityTests(unittest.TestCase):
    def test_serpapi_evidence_verified(self):
        evidence = [_serpapi_evidence()]
        result = validate_agent3_identity(
            _unknown_payload("serpapi", evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["provider"], "serpapi")
        self.assertTrue(result["promotion_trace"]["promoted"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "strong_trusted_single_evidence",
        )
        self.assertEqual(result["evidence"][0]["url"], evidence[0]["link"])

    def test_selenium_evidence_verified(self):
        evidence = [_selenium_evidence()]
        result = validate_agent3_identity(
            _unknown_payload("selenium", evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["provider"], "selenium")
        self.assertTrue(result["promotion_trace"]["promoted"])
        self.assertEqual(result["promotion_trace"]["provider"], "selenium")

    def test_provider_schema_and_identity_parity(self):
        serp = validate_agent3_identity(
            _unknown_payload("serpapi", [_serpapi_evidence()]),
            evidence=[_serpapi_evidence()],
        )
        selenium = validate_agent3_identity(
            _unknown_payload("selenium", [_selenium_evidence()]),
            evidence=[_selenium_evidence()],
        )
        required_schema = {
            "provider", "bucket", "rank", "title", "snippet", "url",
            "source", "domain", "score", "rank_reasons", "detected_country",
            "detected_currency", "detected_amounts", "raw",
        }

        self.assertEqual(serp["status"], selenium["status"])
        self.assertEqual(serp["ma_tien_te"], selenium["ma_tien_te"])
        self.assertEqual(serp["menh_gia"], selenium["menh_gia"])
        self.assertEqual(serp["quoc_gia"], selenium["quoc_gia"])
        self.assertTrue(required_schema.issubset(serp["evidence"][0]))
        self.assertTrue(required_schema.issubset(selenium["evidence"][0]))

    def test_weak_source_only_stays_partial(self):
        weak = {
            **_selenium_evidence(),
            "source": "Facebook Marketplace",
            "url": "https://facebook.com/marketplace/item/500000",
            "score": 9.5,
        }
        result = validate_agent3_identity(
            _unknown_payload("selenium", [weak]),
            evidence=[weak],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["promotion_trace"]["reason"], "weak_source_only")

    def test_two_independent_evidence_can_agree(self):
        first = {
            **_serpapi_evidence(score=7.4),
            "source": "banknote-reference.example",
            "link": "https://banknote-reference.example/vnd-500000",
        }
        second = {
            **_selenium_evidence(score=7.2),
            "source": "currency-news.example",
            "url": "https://currency-news.example/vietnam-500000-note",
            "rank": 2,
        }
        result = validate_agent3_identity(
            _unknown_payload("serpapi", [first, second]),
            evidence=[first, second],
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "multiple_independent_evidence_agreement",
        )
        self.assertTrue(
            result["promotion_trace"]["checks"]["multiple_evidence_agreement"]
        )

    def test_conflicting_evidence_stays_partial(self):
        conflicting = {
            "provider": "serpapi",
            "bucket": "exact_match",
            "rank": 2,
            "title": "Indonesia 100000 Rupiah banknote – Wikipedia",
            "snippet": "Indonesian currency banknote denomination 100000 rupiah.",
            "url": "https://en.wikipedia.org/wiki/100000_rupiah",
            "source": "Wikipedia",
            "score": 9.1,
            "rank_reasons": ["trusted_source", "currency:IDR", "amount:100000"],
            **_identity_fields("Indonesia", "IDR", 100000),
        }
        evidence = [{**_serpapi_evidence(), "score": 9.2}, conflicting]
        result = validate_agent3_identity(
            _unknown_payload("serpapi", evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertEqual(result["promotion_trace"]["reason"], "conflicting_evidence")
        self.assertFalse(result["promotion_trace"]["checks"]["conflict_check_passed"])

    def test_invalid_denomination_stays_partial(self):
        invalid = {
            **_serpapi_evidence(),
            "title": "123456 VND banknote denomination",
            "detected_amounts": [123456],
        }
        result = validate_agent3_identity(
            _unknown_payload("serpapi", [invalid]),
            evidence=[invalid],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertEqual(result["promotion_trace"]["reason"], "amount_not_allowed")
        self.assertIn("amount_not_allowed", result["validation_errors"])

    def test_normalizer_does_not_treat_link_and_url_differently(self):
        serp = normalize_lens_evidence([_serpapi_evidence()], provider="serpapi")[0]
        selenium = normalize_lens_evidence([_selenium_evidence()], provider="selenium")[0]
        self.assertEqual(serp["bucket"], selenium["bucket"])
        self.assertEqual(serp["domain"], selenium["domain"])
        self.assertTrue(serp["url"])
        self.assertTrue(selenium["url"])

    def test_promoted_ag3_joins_three_of_three_consensus(self):
        ag3 = validate_agent3_identity(
            _unknown_payload("serpapi", [_serpapi_evidence()]),
            evidence=[_serpapi_evidence()],
        )
        vote = {
            "status": "Completed",
            "quoc_gia": "Việt Nam",
            "ma_tien_te": "VND",
            "menh_gia": "500000 VND",
        }
        result = asyncio.run(
            run_aggregator(
                json.dumps([vote], ensure_ascii=False),
                json.dumps([vote], ensure_ascii=False),
                json.dumps([ag3], ensure_ascii=False),
            )
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["matched_agents"], 3)
        self.assertIn("3/3", result["consensus_reason"])


class Agent3FallbackTraceTests(unittest.IsolatedAsyncioTestCase):
    async def test_partial_serpapi_falls_back_to_verified_selenium(self):
        weak = {
            **_serpapi_evidence(),
            "source": "Facebook Marketplace",
            "link": "https://facebook.com/marketplace/item/500000",
        }
        primary = validate_agent3_identity(
            _unknown_payload("serpapi", [weak]),
            evidence=[weak],
        )
        fallback = validate_agent3_identity(
            _unknown_payload("selenium", [_selenium_evidence()]),
            evidence=[_selenium_evidence()],
        )
        config = SimpleNamespace(
            enable_agent_3=True,
            lens_enabled=True,
            lens_provider="serpapi",
            lens_fallback_enabled=True,
            lens_fallback_provider="selenium",
            agent3_v2_enabled=True,
        )
        provider_mock = AsyncMock(
            side_effect=[
                json.dumps([primary], ensure_ascii=False),
                json.dumps([fallback], ensure_ascii=False),
            ]
        )

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

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["provider_trace"]["selected_provider"], "selenium")
        self.assertTrue(result["provider_trace"]["fallback_attempted"])
        self.assertEqual(
            result["provider_trace"]["fallback_reason"],
            "primary_partial_weak_evidence",
        )
        self.assertEqual(result["promotion_trace"]["provider"], "selenium")


if __name__ == "__main__":
    unittest.main(verbosity=2)
