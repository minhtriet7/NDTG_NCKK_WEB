import asyncio
import json
import os
import sys
import time
import unittest


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Reuse the provider/network stubs from the P0 test module. No external API is
# reachable while these tests exercise the production validator/aggregator.
from tests.test_agent3_p0 import run_aggregator, validate_agent3_identity
from app.agents.agent_3_lens import (
    FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS,
    _deadline_result_json,
    _identity_text_amounts_with_ignored,
    _page_text_identity_terms,
    _parse_amount_token,
    _candidate_conflicts_with_lens,
    build_agreed_vision_candidate,
    build_candidate_verification_queries,
    enrich_lens_evidence_with_page_text,
    parse_lens_evidence_without_llm,
    resolve_candidate_verification_mode,
    run_candidate_assisted_verification,
)
from app.services.evidence_ranker_service import _extract_amounts, rank_lens_evidence
from app.services.groq_evidence_reader_service import reconcile_ag3_evidence


def _unknown_agent3(evidence):
    return {
        "quoc_gia": "Không xác định",
        "ma_tien_te": "Không xác định",
        "menh_gia": "Không xác định",
        "status": "Partial",
        "do_tin_cay": 0.9,
        "not_counted_in_consensus": True,
        "error_type": "insufficient_evidence",
        "evidence": evidence,
    }


def _vnd_evidence(score=9.5):
    return {
        "title": "500.000 đồng (tiền Việt) – Wikipedia tiếng Việt",
        "source": "Wikipedia",
        "url": "https://vi.wikipedia.org/wiki/500.000_đồng_(tiền_Việt)",
        "score": score,
        "detected_country": "Việt Nam",
        "detected_currency": "VND",
        "detected_amounts": [500000],
        "rank_reasons": [
            "currency:VND",
            "country:Việt Nam",
            "amount:500000",
        ],
    }


def _vnd_amount_evidence(amount, score, source="Independent Currency Reference"):
    formatted_amount = f"{amount:,}".replace(",", ".")
    source_slug = "-".join(str(source).lower().split())
    return {
        "title": f"{formatted_amount} đồng Việt Nam banknote",
        "snippet": f"Tiền giấy Việt Nam mệnh giá {formatted_amount} VND.",
        "source": source,
        "url": f"https://{source_slug}.example/vnd-{amount}",
        "score": score,
        "detected_country": "Việt Nam",
        "detected_currency": "VND",
        "detected_amounts": [amount],
        "rank_reasons": [
            "currency:VND",
            "country:Việt Nam",
            f"amount:{amount}",
        ],
    }


def _khr_amount_evidence(
    amount,
    score,
    source="Cambodia Currency Reference",
    *,
    domain=None,
    title=None,
    snippet=None,
    page_text=False,
):
    source_slug = "-".join(str(source).lower().split())
    item = {
        "title": title or f"Cambodia {amount} Riel banknote",
        "snippet": snippet or f"Cambodia {amount} KHR riel banknote reference.",
        "source": source,
        "domain": domain or f"{source_slug}.example",
        "url": f"https://{domain or source_slug + '.example'}/khr-{amount}",
        "score": score,
        "detected_country": "Cambodia",
        "detected_currency": "KHR",
        "detected_amounts": [amount],
        "rank_reasons": [
            "currency:KHR",
            "country:Cambodia",
            f"amount:{amount}",
        ],
        "page_text_checked": True if page_text else "skipped",
    }
    if page_text:
        item["page_text_excerpt"] = f"Cambodia {amount} riel banknote, {amount} KHR."
    return item


def _lak_amount_evidence(
    amount,
    score,
    source="Laos Currency Reference",
    *,
    domain=None,
    title=None,
    snippet=None,
    page_text=False,
):
    source_slug = "-".join(str(source).lower().split())
    host = domain or f"{source_slug}.example"
    item = {
        "title": title or f"Laos {amount} Kip banknote",
        "snippet": snippet or f"Laos {amount} LAK kip banknote reference.",
        "source": source,
        "domain": host,
        "url": f"https://{host}/lak-{amount}",
        "score": score,
        "detected_country": "Laos",
        "detected_currency": "LAK",
        "detected_amounts": [amount],
        "rank_reasons": [
            "currency:LAK",
            "country:Laos",
            f"amount:{amount}",
        ],
        "page_text_checked": True if page_text else "skipped",
    }
    if page_text:
        item["page_text_excerpt"] = f"Laos {amount} kip banknote, {amount} LAK."
    return item


def _eur_amount_evidence(
    amount,
    score,
    source="Euro Currency Reference",
    *,
    country="European Union",
    domain=None,
    page_text=False,
):
    source_slug = "-".join(str(source).lower().split())
    host = domain or f"{source_slug}.example"
    item = {
        "title": f"{country} {amount} Euro banknote",
        "snippet": f"{country} {amount} EUR euro banknote reference.",
        "source": source,
        "domain": host,
        "url": f"https://{host}/eur-{amount}",
        "score": score,
        "detected_country": country,
        "detected_currency": "EUR",
        "detected_amounts": [amount],
        "rank_reasons": [
            "currency:EUR",
            f"country:{country}",
            f"amount:{amount}",
        ],
        "page_text_checked": True if page_text else "skipped",
    }
    if page_text:
        item["page_text_excerpt"] = (
            f"{country} {amount} euro banknote, denomination {amount} EUR."
        )
    return item


def _vision_agent(
    amount=10000,
    *,
    country="Việt Nam",
    currency="VND",
    status="Completed",
):
    return {
        "quoc_gia": country,
        "ma_tien_te": currency,
        "menh_gia": f"{amount} {currency}",
        "chat_lieu": "Polymer",
        "van_ban_nhin_thay": [str(amount), currency],
        "do_tin_cay": 0.9,
        "status": status,
    }


class Agent3EvidencePromotionTests(unittest.TestCase):
    def test_vietnam_1000_dong_title_does_not_extract_nam_or_year(self):
        ranked = rank_lens_evidence(
            [
                {
                    "title": (
                        "Tiền Giấy Cotton Việt Nam 1000 Đồng 1988|"
                        "Tiền Việt Nam 1000 Đồng 1988"
                    ),
                    "source": "Currency Article",
                    "url": "https://currency.example/vietnam-1000-dong",
                }
            ]
        )[0]

        self.assertIn(ranked["detected_country"], {"Vietnam", "Việt Nam"})
        self.assertEqual(ranked["detected_currency"], "VND")
        self.assertEqual(ranked["detected_amounts"], [1000])
        self.assertNotEqual(ranked["detected_currency"], "NAM")
        self.assertNotIn("currency:NAM", ranked["rank_reasons"])

    def test_vietnam_1000_dong_page_text_has_direct_identity_terms(self):
        terms = _page_text_identity_terms(
            "Tiền Giấy Cotton Việt Nam 1000 Đồng 1988 ... "
            "Tiền Việt Nam 1000 Đồng 1988"
        )

        self.assertIn("currency:VND", terms)
        self.assertIn("amount:1000", terms)
        self.assertTrue(any(term == "country:Vietnam" for term in terms))
        self.assertTrue(any(term.startswith("banknote_context:") for term in terms))
        self.assertNotIn("currency:NAM", terms)

    def test_ebay_catalog_year_and_quantity_do_not_create_extra_amounts(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": (
                        "VIETNAM 1000 Dong, 1988, P-106, UNC, "
                        "1000 Pieces (BRICK) | eBay"
                    ),
                    "source": "eBay",
                    "url": "https://www.ebay.example/vietnam-1000-dong",
                }
            ]
        )
        ranked = evidence[0]

        self.assertIn(ranked["detected_country"], {"Vietnam", "Việt Nam"})
        self.assertEqual(ranked["detected_currency"], "VND")
        self.assertEqual(ranked["detected_amounts"], [1000])
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])

    def test_serial_bin_and_sp_tokens_are_not_currency_or_denomination(self):
        ranked = rank_lens_evidence(
            [
                {
                    "title": "Tờ 1k seri bin 868686 - SP007707",
                    "source": "Serial Listing",
                }
            ]
        )[0]

        self.assertNotEqual(ranked["detected_currency"], "BIN")
        self.assertEqual(ranked["detected_amounts"], [])

    def test_vietnam_1000_support_promotes_without_shop_conflict(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Tiền Giấy Cotton Việt Nam 1000 Đồng 1988",
                    "snippet": "Bài viết về tiền giấy Việt Nam.",
                    "page_text_excerpt": "Tiền Việt Nam 1000 Đồng 1988.",
                    "page_text_checked": True,
                    "source": "Currency Article A",
                    "url": "https://article-a.example/vnd-1000",
                },
                {
                    "title": "Tờ 1.000 Đồng",
                    "snippet": "Tiền Việt Nam 1000 Đồng 1988.",
                    "page_text_excerpt": "Tiền giấy Việt Nam mệnh giá 1000 VND.",
                    "page_text_checked": True,
                    "source": "Currency Article B",
                    "url": "https://article-b.example/vnd-1000",
                },
                {
                    "title": "100000 đồng Việt Nam 1994 cotton Shop tiền sưu tầm",
                    "source": "D-money Shop",
                    "url": "https://shop.example/vnd-100000",
                },
            ]
        )
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "VND")
        self.assertEqual(result["menh_gia"], "1000 VND")
        self.assertEqual(trace["selected_identity"]["amount"], 1000)
        self.assertGreaterEqual(trace["direct_title_or_snippet_support_count"], 2)
        self.assertGreaterEqual(trace["page_text_support_count"], 1)
        self.assertGreaterEqual(trace["support_signal_count"], 3)
        self.assertTrue(trace["page_text_used_for_identity"])
        self.assertEqual(trace["conflicting_denominations"], [])
        self.assertGreaterEqual(trace["noise_filtered_count"], 1)

    def test_single_clean_page_text_identity_support_promotes_with_confidence_cap(self):
        evidence = [
            {
                "title": "Vietnam 1000 Dong banknote 1988",
                "snippet": "Article about Vietnam 1000 dong banknote.",
                "page_text_excerpt": "Vietnam 1000 Dong banknote 1988. Denomination 1000 VND.",
                "page_text_checked": True,
                "page_text_identity_terms": [
                    "currency:VND",
                    "amount:1000",
                    "country:Vietnam",
                    "banknote_context:banknote",
                ],
                "source": "Tien Quoc Te",
                "domain": "tienquocte.net",
                "url": "https://tienquocte.net/vnd-1000-1988",
                "score": 9.5,
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [1000],
                "rank_reasons": [
                    "currency:VND",
                    "country:Vietnam",
                    "amount:1000",
                    "visual_match",
                ],
            }
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertFalse(result.get("not_counted_in_consensus"))
        self.assertEqual(result["ma_tien_te"], "VND")
        self.assertEqual(result["menh_gia"], "1000 VND")
        self.assertEqual(result["do_tin_cay"], 0.80)
        self.assertEqual(trace["reason"], "page_text_identity_support")
        self.assertEqual(trace["promotion_path"], "page_text_identity_support")
        self.assertEqual(trace["support_signal_count"], 2)
        self.assertEqual(trace["independent_source_count"], 1)
        self.assertEqual(trace["page_text_support_count"], 1)
        self.assertEqual(trace["exact_amount_support_count"], 1)
        self.assertEqual(trace["independent_conflicting_amount_support_count"], 0)

    def test_shop_page_text_identity_support_does_not_promote(self):
        evidence = [
            {
                "title": "Vietnam 1000 Dong banknote shop listing",
                "snippet": "Collector shop listing for Vietnam 1000 VND banknote.",
                "page_text_excerpt": "Vietnam 1000 Dong banknote 1988. Denomination 1000 VND.",
                "page_text_checked": True,
                "page_text_identity_terms": [
                    "currency:VND",
                    "amount:1000",
                    "country:Vietnam",
                    "banknote_context:banknote",
                ],
                "source": "eBay",
                "domain": "ebay.com",
                "url": "https://www.ebay.com/itm/vietnam-1000-dong",
                "score": 9.5,
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [1000],
                "rank_reasons": [
                    "currency:VND",
                    "country:Vietnam",
                    "amount:1000",
                ],
            }
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(trace["promoted"])

    def test_identity_amount_parser_ignores_percent_year_serial_grade_quantity_and_price(self):
        amounts, ignored = _identity_text_amounts_with_ignored(
            {
                "title": (
                    "100% authentic. Year 2000. Serial 100. "
                    "PMG 100 EPQ. Lot 100 pcs. Price 100 shop."
                ),
                "snippet": "Collector marketplace listing only.",
            },
            "VND",
        )
        ignored_reasons = {record["reason"] for record in ignored}

        self.assertEqual(amounts, [])
        self.assertIn("ignored_percentage_number", ignored_reasons)
        self.assertIn("ignored_year_number", ignored_reasons)
        self.assertIn("ignored_serial_number", ignored_reasons)
        self.assertIn("ignored_grade_number", ignored_reasons)
        self.assertIn("ignored_listing_quantity", ignored_reasons)
        self.assertIn("weak_shop_conflict_ignored", ignored_reasons)

    def test_seridep_percent_numbers_do_not_create_false_conflict_or_vote(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": (
                        "Vietnam 2000 Dong banknote 100% new 2026 "
                        "serial 2222222 PMG 65 EPQ | SERIDEP.VN"
                    ),
                    "snippet": "Collector listing for Vietnam 2000 VND banknote, li xi sale.",
                    "page_text_excerpt": (
                        "SERIDEP.VN collector listing: Vietnam 2000 Dong banknote, "
                        "100% authentic, serial 2222222, PMG 65 EPQ."
                    ),
                    "page_text_checked": True,
                    "source": "SERIDEP.VN",
                    "domain": "seridep.vn",
                    "url": "https://seridep.vn/vietnam-2000-dong-100-percent",
                }
            ]
        )
        ranked = evidence[0]

        self.assertEqual(ranked["detected_amounts"], [2000])
        self.assertNotIn(100, ranked["detected_amounts"])
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(trace["promoted"])
        self.assertEqual(trace["conflicting_denominations"], [])
        self.assertEqual(trace["independent_conflicting_amount_support_count"], 0)
        self.assertIn(
            trace["reason"],
            {"single_untrusted_page_text_source", "weak_commercial_source_not_counted", "noise_only"},
        )

    def test_facebook_li_xi_and_seridep_sources_do_not_promote_alone(self):
        cases = [
            ("Facebook", "facebook.com", "Vietnam 2000 Dong li xi sale on Facebook"),
            ("SERIDEP.VN", "seridep.vn", "Vietnam 2000 Dong serial dep collector listing"),
        ]

        for source, domain, title in cases:
            with self.subTest(source=source):
                evidence = [
                    {
                        "title": title,
                        "snippet": "Collector listing for a Vietnam 2000 VND banknote.",
                        "page_text_excerpt": "Vietnam 2000 Dong banknote. Denomination 2000 VND.",
                        "page_text_checked": True,
                        "page_text_identity_terms": [
                            "currency:VND",
                            "amount:2000",
                            "country:Vietnam",
                            "banknote_context:banknote",
                        ],
                        "source": source,
                        "domain": domain,
                        "url": f"https://{domain}/vietnam-2000-dong",
                        "score": 9.5,
                        "detected_country": "Vietnam",
                        "detected_currency": "VND",
                        "detected_amounts": [2000],
                        "rank_reasons": ["currency:VND", "country:Vietnam", "amount:2000"],
                    }
                ]

                result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
                trace = result["promotion_trace"]

                self.assertEqual(result["status"], "Partial")
                self.assertTrue(result["not_counted_in_consensus"])
                self.assertFalse(trace["promoted"])
                self.assertLess(trace["independent_source_count"], 2)

    def test_single_clean_vietnam_2000_page_text_identity_support_still_promotes(self):
        evidence = [
            {
                "title": "Vietnam 2000 Dong banknote 1988",
                "snippet": "Reference article about the Vietnam 2000 VND banknote.",
                "page_text_excerpt": "Vietnam 2000 Dong banknote 1988. Denomination 2000 VND.",
                "page_text_checked": True,
                "page_text_identity_terms": [
                    "currency:VND",
                    "amount:2000",
                    "country:Vietnam",
                    "banknote_context:banknote",
                ],
                "source": "Independent Currency Reference",
                "domain": "currency-reference.example",
                "url": "https://currency-reference.example/vnd-2000-1988",
                "score": 9.5,
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [2000],
                "rank_reasons": ["currency:VND", "country:Vietnam", "amount:2000"],
            }
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertFalse(result.get("not_counted_in_consensus"))
        self.assertEqual(result["menh_gia"], "2000 VND")
        self.assertEqual(trace["reason"], "page_text_identity_support")

    def test_direct_clean_conflicting_denomination_still_blocks_promotion(self):
        evidence = [
            {
                **_vnd_amount_evidence(2000, 9.5, "Currency Reference A"),
                "page_text_excerpt": "Vietnam 2000 Dong banknote. Denomination 2000 VND.",
                "page_text_checked": True,
                "page_text_identity_terms": [
                    "currency:VND",
                    "amount:2000",
                    "country:Vietnam",
                    "banknote_context:banknote",
                ],
            },
            _vnd_amount_evidence(2000, 9.0, "Currency Reference B"),
            {
                "title": "Vietnam 100 Dong banknote denomination",
                "snippet": "This exact banknote is denomination 100 VND.",
                "page_text_excerpt": "Vietnam 100 Dong banknote. Denomination 100 VND.",
                "page_text_checked": True,
                "source": "Independent Currency Reference C",
                "domain": "currency-reference-c.example",
                "url": "https://currency-reference-c.example/vnd-100",
                "score": 8.9,
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [100],
                "rank_reasons": ["currency:VND", "country:Vietnam", "amount:100"],
            },
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(trace["reason"], "conflicting_denominations_in_lens_evidence")
        self.assertFalse(trace["checks"]["conflict_check_passed"])
        self.assertEqual(trace["conflicting_denominations"][0]["amount"], 100)

    def test_dong_kip_is_lak_not_vnd(self):
        ranked = rank_lens_evidence(
            [{"title": "2011 Lào 2000 đồng Kip", "source": "Currency Article"}]
        )[0]

        self.assertEqual(ranked["detected_currency"], "LAK")
        self.assertNotEqual(ranked["detected_currency"], "VND")
        self.assertEqual(ranked["detected_amounts"], [2000])

    def test_denomination_family_list_does_not_create_lak_conflict(self):
        evidence = [
            _lak_amount_evidence(20000, 9.4, "Laos Currency Guide A", page_text=True),
            _lak_amount_evidence(20000, 8.8, "Laos Currency Guide B"),
            {
                "title": (
                    "Laos Kip banknote denominations 500, 1000, 2000, "
                    "5000, 10 Thousand, 20 Thousand, 50 Thousand LAK"
                ),
                "snippet": "Catalog list of Lao kip banknote denominations.",
                "source": "BanknoteWorld",
                "domain": "banknoteworld.com",
                "url": "https://banknoteworld.com/laos-denominations",
                "score": 8.2,
                "detected_country": "Laos",
                "detected_currency": "LAK",
                "detected_amounts": [500, 1000, 2000, 5000, 10000, 20000, 50000],
                "rank_reasons": ["currency:LAK", "country:Laos", "amount:20000"],
            },
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "LAK")
        self.assertEqual(result["menh_gia"], "20000 LAK")
        self.assertEqual(trace["conflicting_denominations"], [])
        self.assertEqual(trace["independent_conflicting_amount_support_count"], 0)
        self.assertGreaterEqual(
            trace["denomination_list_filtered_count"] + trace["noise_filtered_count"],
            1,
        )

    def test_direct_singular_conflicting_lak_denomination_still_blocks_promotion(self):
        evidence = [
            _lak_amount_evidence(20000, 9.4, "Laos Currency Guide A", page_text=True),
            _lak_amount_evidence(20000, 8.8, "Laos Currency Guide B"),
            _lak_amount_evidence(10000, 8.7, "Independent Laos Note Guide"),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertIn("conflicting_denominations_in_lens_evidence", result["validation_errors"])
        self.assertEqual(trace["reason"], "conflicting_denominations_in_lens_evidence")
        self.assertFalse(trace["checks"]["conflict_check_passed"])
        self.assertEqual(trace["conflicting_denominations"][0]["amount"], 10000)

    def test_weak_shop_stock_lak_sources_do_not_promote(self):
        evidence = [
            _lak_amount_evidence(
                20000,
                8.9,
                "iStock",
                domain="istockphoto.com",
                title="Laos 20000 Kip banknote stock photo",
                snippet="Stock image of a 20000 LAK banknote.",
            ),
            _lak_amount_evidence(
                20000,
                8.6,
                "Shopee",
                domain="shopee.example",
                title="Laos 20000 Kip banknote shop listing",
                snippet="Collector shop listing for a 20000 LAK banknote.",
            ),
            _lak_amount_evidence(
                20000,
                8.3,
                "eBay",
                domain="ebay.example",
                title="Laos 20000 Kip banknote auction",
                snippet="Auction listing for a 20000 LAK banknote.",
            ),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertNotEqual(result.get("menh_gia"), "20000 LAK")
        self.assertFalse(trace["promoted"])
        self.assertLess(trace["independent_source_count"], 2)

    def test_timeout_before_serpapi_returns_has_empty_evidence_and_stage_trace(self):
        started_at = time.monotonic() - 0.05
        result = json.loads(
            _deadline_result_json(
                timeout_stage="serpapi",
                deadline=time.monotonic(),
                run_started_at=started_at,
                evidence=[],
                stage_trace=[{"stage": "upload", "status": "completed"}],
            )
        )[0]

        self.assertIn(result["status"], {"Failed", "Partial"})
        self.assertEqual(result["evidence"], [])
        self.assertEqual(result["timeout_stage"], "serpapi")
        self.assertFalse(result["evidence_preserved"])
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["promotion_trace"]["timeout_stage"], "serpapi")

    def test_timeout_after_lens_preserves_ranked_evidence_as_partial(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Trinidad and Tobago 50 TTD banknote",
                    "source": "Currency Article",
                    "url": "https://currency.example/ttd-50",
                }
            ]
        )
        result = json.loads(
            _deadline_result_json(
                timeout_stage="before_page_text",
                deadline=time.monotonic(),
                run_started_at=time.monotonic() - 0.1,
                evidence=evidence,
                raw_lens_text=json.dumps(evidence),
            )
        )[0]

        self.assertEqual(result["status"], "Partial")
        self.assertEqual(len(result["evidence"]), 1)
        self.assertGreater(result["top5_evidence_count"], 0)
        self.assertTrue(result["evidence_preserved"])
        self.assertTrue(result["promotion_trace"]["evidence_preserved"])
        self.assertTrue(result["not_counted_in_consensus"])

    def test_page_text_is_skipped_when_deadline_budget_is_low(self):
        async def forbidden_fetch(_url, _timeout_seconds):
            raise AssertionError("page fetch must not run with low deadline budget")

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "Trinidad and Tobago 50 TTD banknote",
                        "source": "Currency Article",
                        "url": "https://currency.example/ttd-50",
                    }
                ],
                deadline=time.monotonic() + 1.0,
                fetcher=forbidden_fetch,
            )
        )

        self.assertEqual(enriched[0]["page_text_checked"], "skipped")
        self.assertEqual(
            enriched[0]["page_text_skip_reason"],
            "deadline_budget_low",
        )

    def test_candidate_verification_promotes_agreed_vnd_from_independent_articles(self):
        lens_evidence = rank_lens_evidence([
            {
                "title": "Đơn nhà sau Tết, vợ khoe tóm được 10 triệu quỹ đen",
                "source": "Social News",
                "url": "https://social-news.example/quy-den",
            },
            {
                "title": "Đổi 1 triệu tiền thật lấy 12 triệu tiền giả",
                "source": "Fraud News",
                "url": "https://fraud-news.example/tien-gia",
            },
            {
                "title": "Cảnh giác chiêu biến tờ 20.000 đồng thành 500.000 đồng",
                "source": "Consumer Warning",
                "url": "https://warning.example/bien-to",
            },
            {
                "title": "Tờ Tiền 10k Lỗi Hình Bác Hồ - Giấy Việt Nam Chính Hãng | TikTok",
                "source": "TikTok",
                "url": "https://tiktok.com/example-10k",
            },
            {
                "title": "Tiền bị rách, đổi ở đâu để không mất phí?",
                "source": "General News",
                "url": "https://general-news.example/tien-rach",
            },
        ])

        async def mock_search(_query, _timeout_seconds):
            return [
                {
                    "title": "Tờ 10.000 đồng polymer Việt Nam",
                    "snippet": "Bài viết trực tiếp về tờ tiền mệnh giá 10.000 VND.",
                    "source": "Currency Article A",
                    "url": "https://article-a.example/vnd-10000",
                },
                {
                    "title": "Vietnam 10000 dong polymer banknote",
                    "snippet": "The 10000 VND banknote is a Vietnamese polymer note.",
                    "source": "Currency Article B",
                    "url": "https://article-b.example/vietnam-10000-banknote",
                },
            ]

        async def mock_page_fetch(url, _timeout_seconds):
            if "article-a" in url:
                return "Tờ tiền polymer Việt Nam mệnh giá 10.000 VND."
            return "Vietnam 10000 dong polymer banknote."

        agent1 = _vision_agent()
        agent2 = _vision_agent()
        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1,
                agent2,
                _unknown_agent3(lens_evidence),
                searcher=mock_search,
                page_fetcher=mock_page_fetch,
            )
        )
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["menh_gia"], "10000 VND")
        self.assertTrue(trace["candidate_verification_attempted"])
        self.assertGreaterEqual(trace["candidate_support_signal_count"], 3)
        self.assertGreaterEqual(trace["candidate_independent_source_count"], 2)
        self.assertTrue(trace["candidate_used_for_vote"])
        self.assertEqual(trace["candidate_verification_mode"], "fast_race_to_3")
        self.assertEqual(
            trace["candidate_verification_timeout_seconds"],
            FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS,
        )
        self.assertEqual(trace["candidate_verification_reason"], "promoted_to_3_of_3")
        consensus = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([agent2], ensure_ascii=False),
                json.dumps([result], ensure_ascii=False),
            )
        )
        self.assertEqual(consensus["status"], "Completed")
        self.assertEqual(consensus["consensus_pattern"], "3/3")
        self.assertFalse(consensus["require_rerun"])
        candidate_items = [
            item for item in result["evidence"]
            if item.get("is_candidate_assisted")
        ]
        self.assertGreaterEqual(len(candidate_items), 2)
        self.assertTrue(all(item.get("query") for item in candidate_items))
        self.assertTrue(all(
            item.get("evidence_type") == "candidate_verification"
            for item in candidate_items
        ))

    def test_candidate_verification_one_weak_source_stays_partial(self):
        async def mock_search(_query, _timeout_seconds):
            return [{
                "title": "Tờ tiền 10k Việt Nam | TikTok",
                "snippet": "Video tờ 10.000 đồng polymer.",
                "source": "TikTok",
                "url": "https://tiktok.com/weak-10000",
            }]

        agent1 = _vision_agent()
        agent2 = _vision_agent()
        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1,
                agent2,
                _unknown_agent3([{
                    "title": "Tiền bị rách, đổi ở đâu?",
                    "source": "General News",
                }]),
                searcher=mock_search,
            )
        )
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(trace["candidate_verification_attempted"])
        self.assertFalse(trace["candidate_used_for_vote"])
        self.assertEqual(trace["candidate_verification_reason"], "insufficient_external_support")
        self.assertEqual(trace["candidate_verification_mode"], "fast_race_to_3")
        consensus = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([agent2], ensure_ascii=False),
                json.dumps([result], ensure_ascii=False),
            )
        )
        self.assertEqual(consensus["status"], "Completed")
        self.assertEqual(consensus["consensus_pattern"], "2/3")
        self.assertFalse(consensus["require_rerun"])

    def test_candidate_fast_timeout_preserves_two_of_three_consensus(self):
        async def slow_search(_query, _timeout_seconds):
            await asyncio.sleep(0.1)
            return []

        agent1 = _vision_agent()
        agent2 = _vision_agent()
        original_agent3 = _unknown_agent3([{
            "title": "Tiền bị rách, đổi ở đâu?",
            "source": "General News",
        }])
        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1,
                agent2,
                original_agent3,
                searcher=slow_search,
                mode="fast_race_to_3",
                timeout_seconds=0.02,
            )
        )
        trace = result["promotion_trace"]

        self.assertEqual(resolve_candidate_verification_mode(agent1, agent2), "fast_race_to_3")
        self.assertEqual(FAST_CANDIDATE_VERIFICATION_TIMEOUT_SECONDS, 2.5)
        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(trace["candidate_used_for_vote"])
        self.assertEqual(trace["candidate_verification_reason"], "fast_timeout")
        self.assertEqual(trace["candidate_verification_mode"], "fast_race_to_3")
        self.assertEqual(trace["candidate_verification_timeout_seconds"], 0.02)
        consensus = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([agent2], ensure_ascii=False),
                json.dumps([result], ensure_ascii=False),
            )
        )
        self.assertEqual(consensus["status"], "Completed")
        self.assertEqual(consensus["consensus_pattern"], "2/3")
        self.assertFalse(consensus["require_rerun"])

    def test_candidate_verification_skips_when_vision_agents_conflict(self):
        search_called = False

        async def forbidden_search(_query, _timeout_seconds):
            nonlocal search_called
            search_called = True
            raise AssertionError("candidate search must not run on AG1/AG2 conflict")

        result = asyncio.run(
            run_candidate_assisted_verification(
                _vision_agent(10000),
                _vision_agent(20000),
                _unknown_agent3([]),
                searcher=forbidden_search,
            )
        )

        self.assertFalse(search_called)
        self.assertFalse(result["promotion_trace"]["candidate_verification_attempted"])
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_reason"],
            "vision_agents_not_agreed",
        )
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_mode"],
            "skip",
        )

    def test_candidate_verification_rescues_consensus_with_one_valid_vision_agent(self):
        async def mock_search(_query, _timeout_seconds):
            return [
                {
                    "title": "Tờ 10.000 đồng polymer Việt Nam",
                    "snippet": "Tờ tiền mệnh giá 10000 VND.",
                    "source": "Currency Article A",
                    "url": "https://rescue-a.example/vnd-10000",
                },
                {
                    "title": "Vietnam 10000 VND banknote",
                    "snippet": "Vietnamese 10000 dong banknote.",
                    "source": "Currency Article B",
                    "url": "https://rescue-b.example/vnd-10000",
                },
            ]

        async def mock_page_fetch(_url, _timeout_seconds):
            return "Tờ tiền polymer Việt Nam mệnh giá 10.000 VND."

        agent1 = _vision_agent()
        failed_agent2 = _vision_agent(status="Failed")
        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1,
                failed_agent2,
                _unknown_agent3([{
                    "title": "Tiền bị rách, đổi ở đâu?",
                    "source": "General News",
                }]),
                searcher=mock_search,
                page_fetcher=mock_page_fetch,
            )
        )

        self.assertEqual(resolve_candidate_verification_mode(agent1, failed_agent2), "rescue_consensus")
        self.assertEqual(result["status"], "Completed")
        self.assertTrue(result["promotion_trace"]["candidate_verification_attempted"])
        self.assertTrue(result["promotion_trace"]["candidate_used_for_vote"])
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_reason"],
            "rescued_consensus",
        )
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_mode"],
            "rescue_consensus",
        )
        consensus = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([failed_agent2], ensure_ascii=False),
                json.dumps([result], ensure_ascii=False),
            )
        )
        self.assertEqual(consensus["status"], "Completed")
        self.assertEqual(consensus["consensus_pattern"], "2/3")
        self.assertFalse(consensus["require_rerun"])

    def test_candidate_hook_error_preserves_existing_results(self):
        async def failing_search(_query, _timeout_seconds):
            raise RuntimeError("mock candidate provider failure")

        agent1 = _vision_agent()
        agent2 = _vision_agent()
        original_agent3 = _unknown_agent3([])
        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1,
                agent2,
                original_agent3,
                searcher=failing_search,
            )
        )

        self.assertEqual(result["status"], original_agent3["status"])
        self.assertEqual(result["menh_gia"], original_agent3["menh_gia"])
        self.assertEqual(
            result["promotion_trace"]["candidate_verification_reason"],
            "candidate_provider_error",
        )
        consensus = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([agent2], ensure_ascii=False),
                json.dumps([result], ensure_ascii=False),
            )
        )
        self.assertEqual(consensus["status"], "Completed")
        self.assertEqual(consensus["consensus_pattern"], "2/3")
        self.assertFalse(consensus["require_rerun"])

    def test_candidate_verification_noise_is_neither_support_nor_conflict(self):
        async def mock_search(_query, _timeout_seconds):
            return [
                {"title": "Đổi 1 triệu tiền thật lấy 12 triệu tiền giả", "source": "News A"},
                {"title": "Vợ khoe tóm được 10 triệu quỹ đen", "source": "News B"},
                {"title": "Cảnh giác chiêu biến tờ 20.000 đồng thành 500.000 đồng", "source": "News C"},
            ]

        result = asyncio.run(
            run_candidate_assisted_verification(
                _vision_agent(),
                _vision_agent(),
                _unknown_agent3([]),
                searcher=mock_search,
            )
        )
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertEqual(trace["candidate_support_signal_count"], 0)
        self.assertEqual(trace["candidate_independent_source_count"], 0)
        self.assertFalse(trace["candidate_used_for_vote"])
        self.assertEqual(trace.get("conflicting_denominations") or [], [])

    def test_candidate_queries_are_general_and_not_vnd_denomination_hardcoded(self):
        queries = build_candidate_verification_queries({
            "country": "Laos",
            "currency": "LAK",
            "amount": 2000,
            "material": "Paper",
            "visible_text": [],
        })

        self.assertIn("2000 LAK banknote", queries)
        self.assertIn("2000 kip note", queries)
        self.assertTrue(all("10000" not in query for query in queries))

    def test_promotes_complete_vnd_identity_with_auxiliary_lens_support(self):
        primary = {
            "title": "Tờ tiền Việt Nam mệnh giá 100.000 đồng",
            "snippet": "Bài viết trực tiếp về tiền giấy Việt Nam.",
            "page_text_excerpt": "Tờ tiền giấy Việt Nam mệnh giá 100.000 VND.",
            "page_text_checked": True,
            "source": "Local News",
            "url": "https://news.example/vietnam-100000",
            "score": 9.5,
            "detected_country": "Việt Nam",
            "detected_currency": "VND",
            "detected_amounts": [100000],
            "rank_reasons": [
                "visual_match",
                "currency:VND",
                "country:Việt Nam",
                "amount:100000",
            ],
        }
        auxiliary = {
            "title": "Tờ tiền mẫu Việt Nam 100k VND Specimen Polymer",
            "snippet": "Tờ tiền mẫu Việt Nam mệnh giá 100.000 đồng.",
            "source": "Banknote Reference",
            "url": "https://banknote-reference.example/vnd-100k-specimen",
            "score": 8.2,
            "rank_reasons": ["visual_match", "amount:100000"],
        }
        context_support = {
            "title": "Tiền polymer tại Việt Nam",
            "snippet": "Thông tin về tiền giấy và đồng Việt Nam.",
            "source": "Currency Reference",
            "url": "https://currency-reference.example/vietnam-polymer",
            "score": 6.5,
            "detected_country": "Việt Nam",
            "detected_currency": "VND",
            "detected_amounts": [],
            "rank_reasons": ["currency:VND", "country:Việt Nam"],
        }
        evidence = [primary, auxiliary, context_support]

        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "VND")
        self.assertIn("100000", result["menh_gia"])
        self.assertTrue(result["promotion_trace"]["promoted"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "promoted_from_lens_evidence",
        )
        self.assertGreaterEqual(result["promotion_trace"]["support_count"], 2)
        self.assertLessEqual(result["do_tin_cay"], 0.85)

    def test_amount_only_auxiliary_evidence_does_not_promote(self):
        evidence = [
            {
                "title": "100k gift",
                "source": "Gift Catalog",
                "score": 9.5,
                "detected_country": "Không xác định",
                "detected_currency": None,
                "detected_amounts": [100000],
            }
        ]

        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertFalse(result["promotion_trace"]["promoted"])

    def test_vnd_amount_formats_are_normalized(self):
        for value in (
            "100k",
            "100 K",
            "100.000",
            "100 000",
            "100000",
            "100.000đ",
            "100.000 đồng",
            "100000 VND",
        ):
            with self.subTest(value=value):
                self.assertEqual(_parse_amount_token(value), 100000)

        self.assertEqual(_extract_amounts("Tờ tiền 100.000 đồng", currency="VND"), [100000])
        self.assertNotIn(100, _extract_amounts("Tờ tiền 100.000 đồng", currency="VND"))

    def test_real_100000_vnd_top_five_promotes_without_url_conflict(self):
        evidence = [
            {
                "title": "Tờ 100.000 đồng bị phát hiện làm giả nhiều nhất - VnEconomy",
                "snippet": "",
                "source": "VnEconomy",
                "url": "https://vneconomy.vn/to-100000-dong-bi-phat-hien-lam-gia-nhieu-nhat.htm",
                "score": 9.5,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
            },
            {
                "title": "Đố bạn: Di tích lịch sử nào được in trên tờ tiền 100.000 đồng?",
                "snippet": "",
                "source": "VTC News",
                "url": "https://vtcnews.vn/do-ban-di-tich-lich-su-nao-duoc-in-tren-to-tien-100-000-dong-ar807268.html",
                "score": 9.5,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
            },
            {
                "title": "Phát hành loại tiền polymer mệnh giá 100.000 đồng",
                "snippet": "",
                "source": "SGGP",
                "url": "https://www.sggp.org.vn/phat-hanh-loai-tien-polymer-menh-gia-100000-dong-post111190.html",
                "score": 9.5,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
            },
            {
                "title": "Phát hiện tiền giả 100.000 đồng in trên giấy nhựa",
                "snippet": "",
                "source": "Thanh Niên",
                "url": "https://thanhnien.vn/phat-hien-tien-gia-100000-dong-in-tren-giay-nhua-185176961.htm",
                "score": 9.5,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
            },
            {
                "title": "Tiền polymer tại Việt Nam",
                "snippet": "",
                "source": "Wikipedia",
                "url": "https://vi.wikipedia.org/wiki/Tiền_polymer_tại_Việt_Nam",
                "score": 5.2,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [],
            },
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "VND")
        self.assertIn("100000", result["menh_gia"])
        self.assertFalse(result.get("not_counted_in_consensus", False))
        trace = result["promotion_trace"]
        self.assertTrue(trace["promoted"])
        self.assertGreaterEqual(trace["context_support_count"], 3)
        self.assertGreaterEqual(trace["exact_amount_support_count"], 2)
        self.assertEqual(trace["conflicting_denominations"], [])
        self.assertNotEqual(trace["reason"], "near_top_conflicting_denomination")

    def test_ranker_never_extracts_denomination_from_url_identifiers(self):
        evidence = [
            {
                "title": "Tiền polymer tại Việt Nam",
                "snippet": "Thông tin tiền giấy VND.",
                "source": "News",
                "url": f"https://news.example/{identifier}.html",
            }
            for identifier in ("ar807268", "post111190", "185176961")
        ]

        ranked = rank_lens_evidence(evidence)

        self.assertTrue(all(item["detected_amounts"] == [] for item in ranked))
        parsed = parse_lens_evidence_without_llm(evidence)
        self.assertEqual(parsed["status"], "Partial")
        self.assertNotIn("amount:807268", parsed.get("dac_diem_chinh", []))
        self.assertNotIn("amount:111190", parsed.get("dac_diem_chinh", []))
        self.assertNotIn("amount:185176961", parsed.get("dac_diem_chinh", []))

    def test_price_exchange_year_and_catalog_numbers_are_not_denominations(self):
        cases = (
            ("collector price $25", "USD"),
            ("exchange rate 100000 VND to USD", "VND"),
            ("VND banknote issued 2003", "VND"),
            ("VND banknote catalog P-100", "VND"),
            ("VND banknote post111190", "VND"),
        )
        for text, currency in cases:
            with self.subTest(text=text):
                self.assertEqual(_extract_amounts(text, currency=currency), [])

    def test_direct_usd_article_evidence_promotes(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Nh\u1eefng b\u00ed \u1ea9n ph\u00eda sau t\u1edd 1 USD",
                    "snippet": "",
                    "page_text_excerpt": "Bài viết trực tiếp về tờ tiền 1 USD của Hoa Kỳ.",
                    "page_text_checked": True,
                    "source": "Currency Article A",
                    "url": "https://article-a.example/usd-one-dollar",
                },
                {
                    "title": "Nh\u1eefng bi\u1ec3u t\u01b0\u1ee3ng b\u00ed \u1ea9n tr\u00ean \u0111\u1ed3ng 1 \u0111\u00f4la M\u1ef9",
                    "snippet": "",
                    "source": "Currency Article B",
                    "url": "https://article-b.example/usd-one-dollar",
                },
            ]
        )

        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "USD")
        self.assertEqual(result["quoc_gia"], "United States")
        self.assertIn("1 USD", result["menh_gia"])
        self.assertFalse(result.get("not_counted_in_consensus", False))
        trace = result["promotion_trace"]
        self.assertTrue(trace["promoted"])
        self.assertGreaterEqual(trace["exact_amount_support_count"], 2)
        self.assertEqual(
            trace["selected_identity"],
            {"country": "United States", "currency": "USD", "amount": 1},
        )

    def test_exchange_rate_usd_noise_is_not_exact_denomination_support(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "T\u1ef7 gi\u00e1 USD h\u00f4m nay 1-8",
                    "snippet": "",
                    "source": "Exchange Rate News",
                    "url": "https://rates.example/usd-hom-nay-1-8",
                },
                {
                    "title": "T\u1ef7 gi\u00e1 USD h\u00f4m nay (23-1)",
                    "snippet": "",
                    "source": "Exchange Rate News",
                    "url": "https://rates.example/usd-hom-nay-23-1",
                },
            ]
        )

        self.assertTrue(all(item["detected_amounts"] == [] for item in evidence))
        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        trace = result["promotion_trace"]
        self.assertFalse(trace["promoted"])
        self.assertEqual(trace["exact_amount_support_count"], 0)

    def test_dola_my_is_usd_not_lao(self):
        text = "Nh\u1eefng bi\u1ec3u t\u01b0\u1ee3ng b\u00ed \u1ea9n tr\u00ean \u0111\u1ed3ng 1 \u0111\u00f4la M\u1ef9"
        ranked = rank_lens_evidence(
            [
                {
                    "title": text,
                    "snippet": "",
                    "source": "Currency Article",
                    "url": "https://article.example/usd-one-dollar",
                }
            ]
        )
        detected = ranked[0]

        self.assertNotEqual(detected["detected_country"], "L\u00e0o")
        self.assertEqual(detected["detected_currency"], "USD")
        self.assertIn(detected["detected_country"], {"United States", "Hoa K\u1ef3", "M\u1ef9"})

    def test_foreign_country_dollars_do_not_default_to_usd(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Tiền Trinidad và Tobago 50 Dollars",
                    "snippet": "Trinidad and Tobago banknote denomination 50 Dollars.",
                    "source": "Currency Article",
                    "url": "https://currency.example/trinidad-50-dollars",
                }
            ]
        )
        detected = evidence[0]

        self.assertNotEqual(detected["detected_currency"], "USD")
        self.assertNotEqual(detected["detected_country"], "United States")
        self.assertNotEqual(detected["detected_country"], "Việt Nam")
        self.assertIn("Trinidad", detected["detected_country"])
        self.assertEqual(detected["detected_amounts"], [50])

    def test_foreign_country_dollars_do_not_default_in_deterministic_fallback(self):
        result = parse_lens_evidence_without_llm(
            [
                {
                    "title": "Tiền Trinidad và Tobago 50 đôla banknote",
                    "source": "Currency Article",
                }
            ]
        )

        self.assertNotEqual(result["ma_tien_te"], "USD")
        self.assertNotEqual(result["quoc_gia"], "United States")
        self.assertEqual(result["status"], "Partial")

    def test_explicit_open_world_currency_code_is_preserved_by_ag3(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Trinidad and Tobago 50 TTD banknote 2015 UNC",
                    "snippet": "FIFTY DOLLARS Trinidad and Tobago.",
                    "source": "Currency Article A",
                    "url": "https://currency-a.example/trinidad-50-ttd",
                    "page_text_excerpt": "Trinidad and Tobago banknote 50 TTD.",
                    "page_text_checked": True,
                },
                {
                    "title": "Trinidad and Tobago 50 TTD note",
                    "snippet": "Independent banknote evidence.",
                    "source": "Currency Article B",
                    "url": "https://currency-b.example/trinidad-50-ttd",
                },
            ]
        )

        self.assertTrue(all(item["detected_currency"] == "TTD" for item in evidence))
        self.assertTrue(all(item["detected_amounts"] == [50] for item in evidence))
        self.assertTrue(all("Trinidad" in item["detected_country"] for item in evidence))

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "TTD")
        self.assertEqual(result["menh_gia"], "50 TTD")

    def test_us_dollar_context_still_maps_to_usd(self):
        for title in ("United States 50 dollars", "$50 US dollar banknote"):
            with self.subTest(title=title):
                detected = rank_lens_evidence(
                    [{"title": title, "source": "US Currency Article"}]
                )[0]
                self.assertEqual(detected["detected_currency"], "USD")
                self.assertEqual(detected["detected_country"], "United States")
                self.assertEqual(detected["detected_amounts"], [50])

    def test_generic_dong_tien_giay_does_not_imply_vnd(self):
        detected = rank_lens_evidence(
            [
                {
                    "title": "Những đồng tiền giấy đẹp nhất hành tinh - Trinidad và Tobago",
                    "source": "World Currency Article",
                }
            ]
        )[0]

        self.assertNotEqual(detected["detected_currency"], "VND")
        self.assertNotIn(detected["detected_country"], {"Việt Nam", "Vietnam"})

    def test_explicit_vietnamese_dong_context_still_maps_vnd(self):
        detected = rank_lens_evidence(
            [
                {
                    "title": "tờ 100.000 đồng Việt Nam",
                    "source": "Vietnam Currency Article",
                }
            ]
        )[0]

        self.assertEqual(detected["detected_currency"], "VND")
        self.assertIn(detected["detected_country"], {"Việt Nam", "Vietnam"})
        self.assertEqual(detected["detected_amounts"], [100000])

    def test_ebay_shop_or_auction_evidence_cannot_alone_promote(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "$1 One Dollar birthday note",
                    "snippet": "Collector listing for a serial-number birthday note.",
                    "source": "eBay",
                    "domain": "ebay.com",
                    "url": "https://www.ebay.com/itm/one-dollar-birthday-note",
                }
            ]
        )

        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        trace = result["promotion_trace"]
        self.assertFalse(trace["promoted"])
        self.assertEqual(trace["reason"], "noise_only")
        self.assertEqual(trace["exact_amount_support_count"], 0)

    def test_general_direct_article_support_across_currencies(self):
        cases = (
            ("100 euro banknote", "EUR", 100, "European Union"),
            ("€100 note", "EUR", 100, "European Union"),
            ("20 pounds note", "GBP", 20, "United Kingdom"),
            ("£20 banknote", "GBP", 20, "United Kingdom"),
            ("1000 won banknote", "KRW", 1000, "South Korea"),
            ("₩1000 note", "KRW", 1000, "South Korea"),
            ("₫100000 banknote", "VND", 100000, "Việt Nam"),
            ("tờ 100.000 đồng Việt Nam", "VND", 100000, "Việt Nam"),
            ("100,000 VND banknote", "VND", 100000, "Việt Nam"),
            ("one dollar bill", "USD", 1, "United States"),
            ("$1 banknote", "USD", 1, "United States"),
            ("50 baht banknote", "THB", 50, "Thái Lan"),
        )

        for index, (title, currency, amount, country) in enumerate(cases, start=1):
            with self.subTest(title=title):
                evidence = rank_lens_evidence(
                    [
                        {
                            "title": title,
                            "snippet": "",
                            "source": "Currency Article",
                            "url": f"https://article.example/general-{index}",
                        }
                    ]
                )
                ranked = evidence[0]
                self.assertEqual(ranked["detected_currency"], currency)
                self.assertEqual(ranked["detected_amounts"], [amount])
                self.assertEqual(ranked["detected_country"], country)

                result = validate_agent3_identity(
                    _unknown_agent3(evidence),
                    evidence=evidence,
                )
                self.assertEqual(result["status"], "Partial")
                self.assertTrue(result["not_counted_in_consensus"])
                self.assertEqual(
                    result["promotion_trace"]["exact_amount_support_count"],
                    1,
                )

    def test_multi_evidence_direct_articles_promote_across_major_currencies(self):
        cases = (
            ("100 euro banknote", "EUR", 100, "European Union"),
            ("20 pounds note", "GBP", 20, "United Kingdom"),
            ("1000 won banknote", "KRW", 1000, "South Korea"),
            ("one dollar bill", "USD", 1, "United States"),
            ("tờ 100.000 đồng Việt Nam", "VND", 100000, "Việt Nam"),
        )

        for index, (title, currency, amount, country) in enumerate(cases, start=1):
            with self.subTest(title=title):
                evidence = rank_lens_evidence(
                    [
                        {
                            "title": title,
                            "snippet": "Direct banknote article reference.",
                            "page_text_excerpt": f"Direct article about the {title}.",
                            "page_text_checked": True,
                            "source": f"Currency Article {index}A",
                            "url": f"https://article-a.example/general-{index}",
                        },
                        {
                            "title": title,
                            "snippet": "Independent banknote article reference.",
                            "source": f"Currency Article {index}B",
                            "url": f"https://article-b.example/general-{index}",
                        },
                    ]
                )

                result = validate_agent3_identity(
                    _unknown_agent3(evidence),
                    evidence=evidence,
                )

                self.assertEqual(result["status"], "Completed")
                self.assertFalse(result.get("not_counted_in_consensus", False))
                self.assertEqual(result["ma_tien_te"], currency)
                self.assertEqual(result["quoc_gia"], country)
                self.assertIn(str(amount), result["menh_gia"])
                trace = result["promotion_trace"]
                self.assertTrue(trace["promoted"])
                self.assertGreaterEqual(trace["exact_amount_support_count"], 2)
                self.assertEqual(
                    trace["selected_identity"],
                    {"country": country, "currency": currency, "amount": amount},
                )

    def test_general_noise_contexts_do_not_count_as_exact_support(self):
        cases = (
            "Tỷ giá USD hôm nay 1-8",
            "Exchange rate 100 EUR to VND",
            "USD converted to VND",
            "collector price $25",
            "auction sold for £20",
            "catalog P-120",
            "issued 2003",
        )

        for index, title in enumerate(cases, start=1):
            with self.subTest(title=title):
                evidence = rank_lens_evidence(
                    [
                        {
                            "title": title,
                            "snippet": "",
                            "source": "Noise Source",
                            "url": f"https://noise.example/general-{index}",
                        }
                    ]
                )
                result = validate_agent3_identity(
                    _unknown_agent3(evidence),
                    evidence=evidence,
                )

                self.assertEqual(result["status"], "Partial")
                self.assertTrue(result["not_counted_in_consensus"])
                self.assertEqual(
                    result["promotion_trace"]["exact_amount_support_count"],
                    0,
                )

    def test_symbol_alias_amount_not_allowed_does_not_promote(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "¥500 note",
                    "snippet": "",
                    "source": "Currency Article",
                    "url": "https://article.example/jpy-500",
                }
            ]
        )

        self.assertEqual(evidence[0]["detected_currency"], "JPY")
        self.assertEqual(evidence[0]["detected_country"], "Japan")
        self.assertEqual(evidence[0]["detected_amounts"], [])

        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["promotion_trace"]["exact_amount_support_count"], 0)

    def test_mock_page_text_support_counts_for_lao_2000_kip(self):
        raw_evidence = [
            {
                "title": "Tiền Lào 2000 Kip",
                "snippet": "",
                "source": "Article A",
                "url": "https://article-a.example/lao-2000-kip",
            },
            {
                "title": "Tiền giấy Lào 2000 Kip",
                "snippet": "",
                "source": "Article B",
                "url": "https://article-b.example/lao-2000-kip",
            },
        ]

        async def fake_fetch(url, timeout_seconds):
            return "tiền giấy Lào mệnh giá 2000 Kip, tờ tiền của Lào"

        pre_ranked = rank_lens_evidence(raw_evidence)
        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                pre_ranked,
                max_urls=2,
                fetcher=fake_fetch,
            )
        )
        preserved = next(item for item in enriched if "Article A" == item["source"])
        self.assertEqual(preserved["detected_currency"], "LAK")
        self.assertIn(2000, preserved["detected_amounts"])
        self.assertGreater(preserved["score"], 0)
        evidence = rank_lens_evidence(enriched)
        result = parse_lens_evidence_without_llm(evidence)

        trace = result["promotion_trace"]
        self.assertEqual(result["status"], "Completed")
        self.assertEqual(trace["selected_identity"]["currency"], "LAK")
        self.assertEqual(trace["selected_identity"]["amount"], 2000)
        self.assertIn(trace["selected_identity"]["country"], {"Lào", "Laos"})
        self.assertGreaterEqual(trace["page_text_support_count"], 1)
        self.assertTrue(trace["page_text_used_for_identity"])
        self.assertGreaterEqual(trace["support_signal_count"], 3)
        self.assertGreaterEqual(trace["independent_source_count"], 2)
        self.assertGreaterEqual(trace["direct_title_or_snippet_support_count"], 2)

    def test_top_five_lak_support_signals_promote_and_filter_noise(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Tiền giấy Lào 2000 Kip 2011 UNC",
                    "snippet": "Bài viết về tờ tiền Lào mệnh giá 2000 Kip.",
                    "source": "Lao Currency Article",
                    "url": "https://lao-article.example/2000-kip",
                    "page_text_excerpt": "Tiền giấy Lào 2000 Kip, tờ tiền của Laos.",
                    "page_text_checked": True,
                },
                {
                    "title": "Tiền Lào 2000 Kip",
                    "snippet": "Thông tin trực tiếp về tiền giấy Lào.",
                    "source": "Independent Lao Article",
                    "url": "https://independent-lao.example/2000-kip",
                },
                {
                    "title": "Một Ngày Chi Tiêu 100.000 Kíp ở Lào",
                    "snippet": "Video trải nghiệm ăn uống và mua sắm.",
                    "source": "TikTok",
                    "url": "https://www.tiktok.com/@travel/video/100000-kip",
                },
                {
                    "title": "Tỷ giá Kip Lào sang VND hôm nay",
                    "snippet": "Currency converter LAK to VND.",
                    "source": "Exchange Rate",
                    "url": "https://rates.example/lak-vnd",
                },
                {
                    "title": "Đồng Kip xuống mức thấp nhất trong nhiều năm",
                    "snippet": "Tin tức kinh tế Lào.",
                    "source": "Economic News",
                    "url": "https://economy.example/lao-kip-low",
                },
            ]
        )

        direct_scores = [
            item["score"] for item in evidence if "Article" in item.get("source", "")
        ]
        noise_scores = [
            item["score"]
            for item in evidence
            if item.get("source") in {"TikTok", "Exchange Rate", "Economic News"}
        ]
        self.assertGreater(min(direct_scores), max(noise_scores))
        tiktok = next(item for item in evidence if item.get("source") == "TikTok")
        self.assertNotIn(100000, tiktok.get("detected_amounts") or [])

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertFalse(result["not_counted_in_consensus"])
        self.assertTrue(trace["promoted"])
        self.assertEqual(trace["selected_identity"]["currency"], "LAK")
        self.assertEqual(trace["selected_identity"]["amount"], 2000)
        self.assertIn(trace["selected_identity"]["country"], {"Lào", "Laos"})
        self.assertGreaterEqual(trace["support_signal_count"], 3)
        self.assertGreaterEqual(trace["independent_source_count"], 2)
        self.assertGreaterEqual(trace["direct_title_or_snippet_support_count"], 2)
        self.assertGreaterEqual(trace["page_text_support_count"], 1)
        self.assertGreaterEqual(trace["exact_amount_support_count"], 2)
        self.assertTrue(trace["checks"]["multiple_evidence_agreement"])
        self.assertEqual(trace["noise_filtered_count"], 3)
        self.assertEqual(trace["conflicting_denominations"], [])

    def test_two_direct_titles_without_page_text_stay_partial(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Tiền giấy Lào 2000 Kip",
                    "source": "Lao Article A",
                    "url": "https://lao-a.example/2000-kip",
                },
                {
                    "title": "Tiền Lào 2000 Kip",
                    "source": "Lao Article B",
                    "url": "https://lao-b.example/2000-kip",
                },
            ]
        )
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(trace["promoted"])
        self.assertEqual(trace["support_signal_count"], 2)
        self.assertEqual(trace["independent_source_count"], 2)
        self.assertEqual(trace["direct_title_or_snippet_support_count"], 2)
        self.assertEqual(trace["page_text_support_count"], 0)
        self.assertEqual(trace["reason"], "insufficient_support_signals")

    def test_two_untrusted_direct_sources_plus_page_text_promote(self):
        evidence = rank_lens_evidence(
            [
                {
                    "title": "Tiền giấy Lào 2000 Kip",
                    "snippet": "Bài viết nhỏ về tờ tiền Lào.",
                    "source": "Small Currency Blog A",
                    "url": "https://small-a.example/lao-2000",
                    "page_text_excerpt": "Tờ tiền giấy Laos mệnh giá 2000 Kip.",
                    "page_text_checked": True,
                },
                {
                    "title": "Tiền Lào 2000 Kip",
                    "snippet": "Independent direct banknote reference.",
                    "source": "Small Currency Blog B",
                    "url": "https://small-b.example/lao-2000",
                },
            ]
        )
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertTrue(trace["promoted"])
        self.assertFalse(trace["checks"]["source_trusted"])
        self.assertEqual(trace["support_signal_count"], 3)
        self.assertEqual(trace["independent_source_count"], 2)
        self.assertEqual(trace["direct_title_or_snippet_support_count"], 2)
        self.assertEqual(trace["page_text_support_count"], 1)

    def test_lao_page_text_ignores_distant_vietnam_footer(self):
        raw_evidence = [
            {
                "title": "Tiền giấy Lào 2000 Kip 2011 UNC",
                "source": "Article A",
                "url": "https://article-a.example/lao-2000-kip",
            },
            {
                "title": "Tiền Lào 2000 Kip",
                "source": "Article B",
                "url": "https://article-b.example/lao-2000-kip",
            },
        ]

        async def fake_fetch(url, timeout_seconds):
            if "article-a" in url:
                return (
                    "Tiền giấy Lào 2000 Kip 2011 UNC, tờ tiền của Lào. "
                    "Cửa hàng tiền xưa Việt Nam."
                )
            return ""

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                raw_evidence,
                max_urls=2,
                fetcher=fake_fetch,
            )
        )
        evidence = rank_lens_evidence(enriched)
        result = parse_lens_evidence_without_llm(evidence)

        primary = next(item for item in evidence if "Article A" == item["source"])
        self.assertIn(primary["detected_country"], {"Lào", "Laos"})
        self.assertNotIn(primary["detected_country"], {"Việt Nam", "Vietnam"})
        self.assertEqual(primary["detected_currency"], "LAK")
        self.assertIn(2000, primary["detected_amounts"])
        self.assertGreater(primary["score"], 0)
        self.assertTrue(
            any(
                reason.startswith(("amount:", "currency:", "keyword:"))
                for reason in primary["rank_reasons"]
            )
        )
        self.assertIn("country:Laos", primary["page_text_identity_terms"])

        trace = result["promotion_trace"]
        self.assertEqual(result["status"], "Completed")
        self.assertIn(result["quoc_gia"], {"Lào", "Laos"})
        self.assertEqual(trace["selected_identity"]["currency"], "LAK")
        self.assertEqual(trace["selected_identity"]["amount"], 2000)
        self.assertIn(trace["selected_identity"]["country"], {"Lào", "Laos"})
        self.assertGreaterEqual(trace["page_text_support_count"], 1)
        self.assertTrue(trace["page_text_used_for_identity"])
        self.assertEqual(trace["conflicting_denominations"], [])

    def test_lao_titles_support_identity_when_second_page_is_empty(self):
        calls = []

        async def fake_fetch(url, timeout_seconds):
            calls.append(url)
            if "article-a" in url:
                return "Tiền giấy Lào 2000 Kip, tờ tiền của Lào"
            return ""

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "Tiền giấy Lào 2000 Kip",
                        "source": "Article A",
                        "url": "https://article-a.example/lao-2000-kip",
                    },
                    {
                        "title": "Tiền Lào 2000 Kip",
                        "source": "Article B",
                        "url": "https://article-b.example/lao-2000-kip",
                    },
                ],
                max_urls=2,
                fetcher=fake_fetch,
            )
        )
        evidence = rank_lens_evidence(enriched)
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)

        self.assertEqual(len(calls), 2)
        self.assertEqual(enriched[1]["page_text_skip_reason"], "empty_or_non_html")
        self.assertEqual(result["status"], "Completed")
        self.assertGreaterEqual(
            result["promotion_trace"]["exact_amount_support_count"],
            2,
        )

    def test_page_fetch_skipped_for_exchange_rate_noise(self):
        async def forbidden_fetch(_url, _timeout_seconds):
            raise AssertionError("noise evidence must not fetch page text")

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "Đồng Kip xuống mức thấp nhất theo tỷ giá",
                        "source": "Exchange News",
                        "url": "https://rates.example/lao-kip",
                    }
                ],
                fetcher=forbidden_fetch,
            )
        )

        self.assertEqual(enriched[0]["page_text_checked"], "skipped")
        self.assertEqual(
            enriched[0]["page_text_skip_reason"],
            "noise_exchange_or_conversion",
        )

    def test_page_fetch_skipped_for_market_movement_noise(self):
        async def forbidden_fetch(_url, _timeout_seconds):
            raise AssertionError("market movement evidence must not fetch page text")

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "Đồng Kip (Lào) xuống mức thấp nhất trong nhiều năm",
                        "source": "Market News",
                        "url": "https://rates.example/lao-kip-low",
                    }
                ],
                fetcher=forbidden_fetch,
            )
        )

        self.assertEqual(enriched[0]["page_text_checked"], "skipped")
        self.assertEqual(
            enriched[0]["page_text_skip_reason"],
            "noise_exchange_or_conversion",
        )
        evidence = rank_lens_evidence(enriched)
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        self.assertEqual(result["status"], "Partial")
        self.assertEqual(result["promotion_trace"]["exact_amount_support_count"], 0)

    def test_page_fetch_skipped_for_conversion_and_no_1000_conflict(self):
        async def forbidden_fetch(_url, _timeout_seconds):
            raise AssertionError("conversion evidence must not fetch page text")

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "1000 tiền Lào bằng bao nhiêu tiền Việt Nam",
                        "source": "Converter",
                        "url": "https://converter.example/lao-1000-vnd",
                    }
                ],
                fetcher=forbidden_fetch,
            )
        )

        self.assertEqual(enriched[0]["page_text_checked"], "skipped")
        self.assertEqual(
            enriched[0]["page_text_skip_reason"],
            "noise_exchange_or_conversion",
        )
        evidence = rank_lens_evidence(enriched)
        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        self.assertEqual(result["status"], "Partial")
        self.assertEqual(result["promotion_trace"]["exact_amount_support_count"], 0)
        self.assertEqual(result["promotion_trace"]["conflicting_denominations"], [])

    def test_page_text_fetch_top_n_limit(self):
        calls = []

        async def fake_fetch(url, timeout_seconds):
            calls.append(url)
            return "banknote article text"

        evidence = [
            {
                "title": f"{index} euro banknote",
                "source": f"Article {index}",
                "url": f"https://article-{index}.example/euro",
            }
            for index in (5, 10, 20, 50, 100)
        ]

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                evidence,
                max_urls=2,
                fetcher=fake_fetch,
            )
        )

        self.assertEqual(len(calls), 2)
        self.assertEqual(
            [item["page_text_checked"] for item in enriched[:2]],
            [True, True],
        )
        self.assertTrue(
            all(item["page_text_skip_reason"] == "top_n_limit" for item in enriched[2:])
        )

    def test_page_text_budget_counts_successful_fetches_not_empty_attempts(self):
        calls = []

        async def fake_fetch(url, timeout_seconds):
            calls.append(url)
            if "article-1" in url:
                return ""
            return "100 euro banknote"

        evidence = [
            {
                "title": "100 euro banknote",
                "source": f"Article {index}",
                "url": f"https://article-{index}.example/euro",
            }
            for index in range(1, 5)
        ]
        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                evidence,
                max_urls=2,
                fetcher=fake_fetch,
            )
        )

        self.assertEqual(len(calls), 3)
        self.assertEqual(enriched[0]["page_text_skip_reason"], "empty_or_non_html")
        self.assertEqual(
            [item["page_text_checked"] for item in enriched[1:3]],
            [True, True],
        )
        self.assertEqual(enriched[3]["page_text_skip_reason"], "top_n_limit")

    def test_page_text_fetch_skips_unsafe_url_before_fetcher(self):
        async def forbidden_fetch(_url, _timeout_seconds):
            raise AssertionError("unsafe URL must not be fetched")

        enriched = asyncio.run(
            enrich_lens_evidence_with_page_text(
                [
                    {
                        "title": "100 euro banknote",
                        "source": "Article",
                        "url": "http://127.0.0.1/internal",
                    }
                ],
                fetcher=forbidden_fetch,
            )
        )

        self.assertEqual(enriched[0]["page_text_checked"], "skipped")
        self.assertEqual(enriched[0]["page_text_skip_reason"], "unsafe_url")

    def test_single_strong_500000_vnd_evidence_stays_partial(self):
        result = validate_agent3_identity(
            _unknown_agent3([_vnd_evidence()]),
            evidence=[_vnd_evidence()],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(result["promotion_trace"]["promoted"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "insufficient_support_signals",
        )

    def test_does_not_promote_weak_evidence(self):
        weak = _vnd_evidence(score=7.5)
        result = validate_agent3_identity(
            _unknown_agent3([weak]),
            evidence=[weak],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertIn("insufficient_support_signals", result.get("validation_errors", []))

    def test_untrusted_single_evidence_stays_partial_and_caps_confidence(self):
        weak_single = _vnd_amount_evidence(10000, score=11.5)
        result = validate_agent3_identity(
            _unknown_agent3([weak_single]),
            evidence=[weak_single],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["promotion_trace"]["reason"], "insufficient_support_signals")
        self.assertLessEqual(result["do_tin_cay"], 0.70)

    def test_mixed_denominations_same_currency_stay_partial(self):
        evidence = [
            _vnd_evidence(score=11.0),
            {
                **_vnd_evidence(score=10.5),
                "source": "Second 500k Reference",
                "url": "https://second-reference.example/vnd-500000",
            },
            _vnd_amount_evidence(100000, score=7.5, source="First 100k Reference"),
            _vnd_amount_evidence(100000, score=7.2, source="Second 100k Reference"),
        ]
        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(result["promotion_trace"]["checks"]["conflict_check_passed"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "mixed_denomination_lens_evidence",
        )

    def test_near_top_conflicting_denomination_stays_partial(self):
        evidence = [
            _vnd_evidence(score=9.5),
            {
                **_vnd_evidence(score=9.0),
                "source": "Second 500k Reference",
                "url": "https://second-reference.example/vnd-500000",
            },
            _vnd_amount_evidence(10000, score=8.0, source="First 10k Reference"),
            _vnd_amount_evidence(10000, score=7.8, source="Second 10k Reference"),
        ]
        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "near_top_conflicting_denomination",
        )
        conflicts = result["promotion_trace"]["conflicting_denominations"]
        self.assertTrue(conflicts)
        self.assertEqual(conflicts[0]["amount"], 10000)
        self.assertGreaterEqual(conflicts[0]["support_count"], 2)

    def test_one_auxiliary_conflicting_amount_blocks_promotion(self):
        evidence = [
            {
                **_vnd_amount_evidence(100000, score=9.5, source="Primary 100k Reference"),
                "page_text_excerpt": "Tờ tiền giấy Việt Nam mệnh giá 100.000 VND.",
                "page_text_checked": True,
            },
            _vnd_amount_evidence(100000, score=9.0, source="Second 100k Reference"),
            {
                "title": "Tiền polymer tại Việt Nam",
                "snippet": "Thông tin tiền giấy VND.",
                "source": "General VND Reference",
                "url": "https://general-reference.example/vnd-polymer",
                "score": 6.0,
                "detected_country": "Việt Nam",
                "detected_currency": "VND",
                "detected_amounts": [],
            },
            _vnd_amount_evidence(200000, score=10.2, source="Single 200k Reference"),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(result["promotion_trace"]["promoted"])
        self.assertEqual(
            result["promotion_trace"]["reason"],
            "conflicting_denominations_in_lens_evidence",
        )
        self.assertEqual(result["error_type"], "conflicting_evidence")
        self.assertEqual(
            result["promotion_trace"]["independent_conflicting_amount_support_count"],
            1,
        )

    def test_cambodia_500_vs_5000_conflict_stays_partial(self):
        evidence = [
            _khr_amount_evidence(500, 9.2, source="Cambodia Article A"),
            _khr_amount_evidence(500, 8.9, source="Cambodia Article B"),
            _khr_amount_evidence(5000, 8.8, source="Numis Reference"),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["error_type"], "conflicting_evidence")
        self.assertEqual(trace["reason"], "conflicting_denominations_in_lens_evidence")
        self.assertEqual(trace["independent_conflicting_amount_support_count"], 1)

    def test_cambodia_stock_shop_metadata_does_not_promote(self):
        evidence = [
            _khr_amount_evidence(
                500,
                9.5,
                source="iStock",
                domain="istockphoto.com",
                title="Cambodia 500 Riel banknote stock photo",
                snippet="Royalty-free stock image of Cambodia 500 riel.",
            ),
            _khr_amount_evidence(
                500,
                8.9,
                source="Shopee",
                domain="shopee.example",
                title="Cambodia 500 Riel banknote listing",
                snippet="Shop listing for collector note.",
            ),
            _khr_amount_evidence(
                500,
                8.8,
                source="Collector Listing",
                domain="collector-market.example",
                title="Cambodia 500 Riel collector price",
                snippet="Collector marketplace listing.",
            ),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertFalse(trace["promoted"])
        self.assertLess(trace["independent_source_count"], 3)

    def test_cambodia_strong_clean_evidence_promotes(self):
        evidence = [
            _khr_amount_evidence(
                500,
                9.6,
                source="Wikipedia",
                domain="wikipedia.org",
                page_text=True,
            ),
            _khr_amount_evidence(
                500,
                9.2,
                source="Central Bank Reference",
                domain="centralbank.example",
            ),
            _khr_amount_evidence(
                500,
                8.8,
                source="Cambodia Currency Article",
                domain="currency-article.example",
            ),
        ]

        result = validate_agent3_identity(_unknown_agent3(evidence), evidence=evidence)
        trace = result["promotion_trace"]

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["ma_tien_te"], "KHR")
        self.assertIn("500", result["menh_gia"])
        self.assertTrue(trace["promoted"])
        self.assertGreaterEqual(trace["support_signal_count"], 3)
        self.assertGreaterEqual(trace["independent_source_count"], 3)
        self.assertGreaterEqual(trace["exact_amount_support_count"], 3)
        self.assertGreaterEqual(trace["page_text_support_count"], 1)
        self.assertEqual(trace["independent_conflicting_amount_support_count"], 0)

    def test_candidate_lens_eur_aliases_do_not_conflict(self):
        for amount in (5, 500):
            with self.subTest(amount=amount):
                agent1 = _vision_agent(
                    amount=amount,
                    country="Lien Minh Chau Au",
                    currency="EUR",
                )
                agent2 = _vision_agent(
                    amount=amount,
                    country="Lien Minh Chau Au",
                    currency="EUR",
                )
                candidate, reason = build_agreed_vision_candidate(agent1, agent2)
                lens = {
                    "status": "Completed",
                    "quoc_gia": "European Union",
                    "ma_tien_te": "EUR",
                    "menh_gia": f"{amount} EUR",
                    "promotion_trace": {
                        "promoted": True,
                        "selected_identity": {
                            "country": "European Union",
                            "currency": "EUR",
                            "amount": amount,
                        },
                    },
                }

                self.assertEqual(reason, "vision_agents_agreed")
                self.assertFalse(_candidate_conflicts_with_lens(candidate, lens))

    def test_germany_eur_candidate_matches_euro_issuing_region_lens(self):
        agent1 = _vision_agent(amount=5, country="Germany", currency="EUR")
        agent2 = _vision_agent(amount=5, country="Germany", currency="EUR")
        candidate, _reason = build_agreed_vision_candidate(agent1, agent2)
        lens = {
            "status": "Completed",
            "quoc_gia": "European Union",
            "ma_tien_te": "EUR",
            "menh_gia": "5 EUR",
            "promotion_trace": {
                "promoted": True,
                "selected_identity": {
                    "country": "European Union",
                    "currency": "EUR",
                    "amount": 5,
                },
            },
        }

        self.assertFalse(_candidate_conflicts_with_lens(candidate, lens))

    def test_candidate_lens_true_identity_conflicts_still_block(self):
        cases = [
            ("Germany", "DEM", 5, "European Union", "EUR", 5),
            ("European Union", "EUR", 5, "European Union", "EUR", 10),
            ("European Union", "EUR", 5, "United States", "USD", 5),
        ]
        for candidate_country, candidate_currency, candidate_amount, lens_country, lens_currency, lens_amount in cases:
            with self.subTest(
                candidate=(candidate_country, candidate_currency, candidate_amount),
                lens=(lens_country, lens_currency, lens_amount),
            ):
                agent1 = _vision_agent(
                    amount=candidate_amount,
                    country=candidate_country,
                    currency=candidate_currency,
                )
                agent2 = _vision_agent(
                    amount=candidate_amount,
                    country=candidate_country,
                    currency=candidate_currency,
                )
                candidate, _reason = build_agreed_vision_candidate(agent1, agent2)
                lens = {
                    "status": "Completed",
                    "quoc_gia": lens_country,
                    "ma_tien_te": lens_currency,
                    "menh_gia": f"{lens_amount} {lens_currency}",
                    "promotion_trace": {
                        "promoted": True,
                        "selected_identity": {
                            "country": lens_country,
                            "currency": lens_currency,
                            "amount": lens_amount,
                        },
                    },
                }

                self.assertTrue(_candidate_conflicts_with_lens(candidate, lens))

    def test_completed_eur_alias_identity_is_not_demoted_after_evidence_validation(self):
        evidence = [
            _eur_amount_evidence(5, 9.6, "Euro Banknote Reference A", page_text=True),
            _eur_amount_evidence(5, 9.2, "Euro Banknote Reference B"),
            _eur_amount_evidence(5, 8.9, "Euro Banknote Reference C"),
        ]
        result = validate_agent3_identity(
            {
                "status": "Completed",
                "quoc_gia": "Lien Minh Chau Au",
                "ma_tien_te": "EUR",
                "menh_gia": "5 EUR",
                "do_tin_cay": 0.91,
                "not_counted_in_consensus": False,
                "evidence": evidence,
            },
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Completed")
        self.assertFalse(result.get("not_counted_in_consensus"))
        self.assertEqual(result["ma_tien_te"], "EUR")
        self.assertEqual(result["menh_gia"], "5 EUR")
        self.assertTrue(result["promotion_trace"]["canonical_identity_match"])

    def test_groq_reconciliation_uses_canonical_eur_identity(self):
        result = reconcile_ag3_evidence(
            {
                "country": "Lien Minh Chau Au",
                "currency": "EUR",
                "amount": 5,
            },
            {
                "groq_evidence_reader_used": True,
                "status": "completed",
                "proposed_identity": {
                    "country": "European Union",
                    "currency_code": "EUR",
                    "denomination": "5",
                },
                "support_count": 3,
                "conflict_count": 0,
                "independent_supporting_domains": ["a.example", "b.example"],
            },
            [],
        )

        self.assertEqual(result["reason"], "deterministic_and_groq_agree_completed")
        self.assertTrue(result["eligible_for_validation"])
        self.assertTrue(result["canonical_identity_match"])
        self.assertEqual(result["deterministic_canonical_key"], ["euro zone", "EUR", "5"])
        self.assertEqual(result["groq_canonical_key"], ["euro zone", "EUR", "5"])

    def test_ag2_candidate_100_khr_demotes_completed_lens_500_khr(self):
        search_called = False

        async def forbidden_search(_query, _timeout_seconds):
            nonlocal search_called
            search_called = True
            raise AssertionError("candidate search must not run before conflict guard")

        agent1_missing_key = {
            "status": "Failed",
            "error_type": "missing_api_key",
            "technical_error": True,
            "not_counted_in_consensus": True,
        }
        agent2_candidate = _vision_agent(amount=100, country="Cambodia", currency="KHR")
        lens_500 = {
            "status": "Completed",
            "quoc_gia": "Cambodia",
            "ma_tien_te": "KHR",
            "menh_gia": "500 KHR",
            "provider": "serpapi",
            "do_tin_cay": 0.9,
            "not_counted_in_consensus": False,
            "promotion_trace": {
                "promoted": True,
                "selected_identity": {
                    "country": "Cambodia",
                    "currency": "KHR",
                    "amount": 500,
                },
                "support_signal_count": 2,
                "independent_source_count": 2,
                "direct_title_or_snippet_support_count": 2,
                "exact_amount_support_count": 2,
                "page_text_support_count": 0,
                "trusted_source_count": 0,
                "independent_conflicting_amount_support_count": 0,
                "checks": {"source_trusted": False},
            },
        }

        result = asyncio.run(
            run_candidate_assisted_verification(
                agent1_missing_key,
                agent2_candidate,
                lens_500,
                searcher=forbidden_search,
            )
        )
        trace = result["promotion_trace"]

        self.assertFalse(search_called)
        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertEqual(result["error_type"], "conflicting_evidence")
        self.assertEqual(trace["reason"], "candidate_lens_identity_conflict")
        self.assertEqual(trace["candidate_identity"]["amount"], 100)
        self.assertFalse(trace["candidate_used_for_vote"])

    def test_does_not_promote_missing_currency_or_amount(self):
        incomplete = {
            **_vnd_evidence(score=9.5),
            "detected_currency": None,
            "detected_amounts": [],
        }
        result = validate_agent3_identity(
            _unknown_agent3([incomplete]),
            evidence=[incomplete],
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertIn("currency_missing", result.get("validation_errors", []))
        self.assertIn("amount_not_allowed", result.get("validation_errors", []))

    def test_does_not_promote_conflicting_strong_evidence(self):
        conflicting = {
            "title": "Indonesia 100000 Rupiah banknote",
            "source": "Wikipedia",
            "url": "https://example.test/indonesia-100000",
            "score": 9.2,
            "detected_country": "Indonesia",
            "detected_currency": "IDR",
            "detected_amounts": [100000],
            "rank_reasons": [
                "currency:IDR",
                "country:Indonesia",
                "amount:100000",
            ],
        }
        evidence = [_vnd_evidence(score=9.5), conflicting]
        result = validate_agent3_identity(
            _unknown_agent3(evidence),
            evidence=evidence,
        )

        self.assertEqual(result["status"], "Partial")
        self.assertTrue(result["not_counted_in_consensus"])
        self.assertIn("conflicting_evidence", result.get("validation_errors", []))

    def test_promoted_agent3_can_join_three_of_three_consensus(self):
        promotion_evidence = [
            {
                **_vnd_evidence(),
                "page_text_excerpt": "Tờ tiền Việt Nam mệnh giá 500.000 VND.",
                "page_text_checked": True,
            },
            {
                **_vnd_evidence(score=9.0),
                "source": "Independent Currency Article",
                "url": "https://independent.example/vnd-500000",
            },
        ]
        promoted = validate_agent3_identity(
            _unknown_agent3(promotion_evidence),
            evidence=promotion_evidence,
        )
        agent1 = {
            "status": "Completed",
            "quoc_gia": "Việt Nam",
            "ma_tien_te": "VND",
            "menh_gia": "500000 VND",
        }
        agent2 = {
            "status": "Completed",
            "quoc_gia": "Vietnam",
            "ma_tien_te": "VND",
            "menh_gia": "500.000 VND",
        }

        result = asyncio.run(
            run_aggregator(
                json.dumps([agent1], ensure_ascii=False),
                json.dumps([agent2], ensure_ascii=False),
                json.dumps([promoted], ensure_ascii=False),
            )
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["matched_agents"], 3)
        reason = str(
            result.get("consensus_reason")
            or result.get("quan_diem_trong_tai")
            or ""
        )
        self.assertIn("3/3", reason)

    def test_two_valid_agents_win_when_agent3_has_weak_wrong_evidence(self):
        weak_agent3 = validate_agent3_identity(
            _unknown_agent3([_vnd_amount_evidence(10000, score=11.5)]),
            evidence=[_vnd_amount_evidence(10000, score=11.5)],
        )
        valid_vote = {
            "status": "Completed",
            "quoc_gia": "Việt Nam",
            "ma_tien_te": "VND",
            "menh_gia": "500000 VND",
        }

        result = asyncio.run(
            run_aggregator(
                json.dumps([valid_vote], ensure_ascii=False),
                json.dumps([valid_vote], ensure_ascii=False),
                json.dumps([weak_agent3], ensure_ascii=False),
            )
        )

        self.assertEqual(weak_agent3["status"], "Partial")
        self.assertTrue(weak_agent3["not_counted_in_consensus"])
        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["matched_agents"], 2)
        self.assertIn("500000", str(result.get("menh_gia") or ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
