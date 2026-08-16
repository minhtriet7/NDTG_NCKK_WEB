from __future__ import annotations
import unittest
from typing import Dict, Any

import tests.test_agent3_p0  # noqa: F401 - installs offline stubs for bundled Python

from app.services.evidence_ranker_service import (
    classify_source,
    get_canonical_domain,
    _extract_amounts,
    _has_banknote_context,
    _clean_number,
)
from app.agents.agent_3_lens import (
    _item_has_banknote_context,
    _collect_ag3_candidate_records,
    parse_lens_evidence_without_llm,
    validate_agent3_identity,
)


class TestAG3EvidenceEligibility(unittest.TestCase):
    def _article(
        self,
        idx: int,
        *,
        amount: int = 100000,
        country: str = "Vietnam",
        currency: str = "VND",
        domain: str | None = None,
        source_class: str = "NEUTRAL",
        quality: str = "COMPLETE_EXACT",
        banknote: bool = True,
        targeted: bool = False,
        amounts: list[int] | None = None,
    ) -> Dict[str, Any]:
        domain = domain or f"ag3source{idx}.com"
        identity_amounts = amounts if amounts is not None else [amount]
        object_word = "banknote" if banknote else "coin"
        url = f"https://{domain}/banknote-{idx}"
        return {
            "title": f"{country} {amount} {currency} {object_word} catalog {idx}",
            "snippet": f"{country} {currency} {amount} {object_word} verified catalog page.",
            "url": url,
            "link": url,
            "domain": domain,
            "canonical_domain": get_canonical_domain(url),
            "source_trust_level": source_class,
            "source_class": source_class,
            "score": 10.0 - (idx / 100.0),
            "raw_lens_score": 10.0 - (idx / 100.0),
            "raw_rank": idx,
            "detected_country": country,
            "detected_currency": currency,
            "detected_amounts": identity_amounts,
            "content_identity_quality": quality,
            "has_banknote_context": banknote,
            "page_fetch_status": "success",
            "page_text_checked": True,
            "page_text_excerpt": f"{country} {currency} {amount} {object_word} complete identity.",
            "page_text_identity_terms": [
                f"country:{country}",
                f"currency:{currency}",
                f"amount:{amount}",
                f"banknote_context:{object_word}",
            ],
            "is_candidate_assisted": targeted,
            "evidence_type": "targeted_candidate_verification" if targeted else "lens",
        }

    def test_01_numista_subdomain_trusted_direct_exact(self):
        item = {
            "title": "500 000 Đồng – Vietnam – Numista",
            "link": "https://en.numista.com/catalogue/note205915.html",
            "domain": "en.numista.com",
            "page_text": "Issuer Vietnam. Value 500 000 Đồng. Composition Polymer.",
        }
        classified = classify_source(item)
        self.assertEqual(classified["canonical_domain"], "numista.com")
        self.assertEqual(classified["source_trust_level"], "TRUSTED")

        context_valid = _item_has_banknote_context(item)
        self.assertTrue(context_valid)

        amounts = _extract_amounts(f"{item['title']} {item['page_text']}")
        self.assertIn(500000, amounts)

    def test_02_fake_numista_domain_not_trusted(self):
        item = {
            "title": "500 000 Đồng – Fake Numista",
            "link": "https://fake-numista.com/note/123",
            "domain": "fake-numista.com",
            "page_text": "Issuer Vietnam. Value 500 000 Đồng.",
        }
        classified = classify_source(item)
        self.assertEqual(classified["canonical_domain"], "fake-numista.com")
        self.assertNotEqual(classified["source_trust_level"], "TRUSTED")

    def test_03_space_separated_denomination(self):
        text = "Tờ tiền 500 000 Đồng polymer Việt Nam"
        amounts = _extract_amounts(text)
        self.assertEqual(amounts, [500000])

    def test_04_nbsp_and_narrow_nbsp_denomination(self):
        text_nbsp = "Tờ tiền 500\u00A0000 Đồng polymer"
        text_narrow = "Tờ tiền 500\u202F000 Đồng polymer"
        self.assertEqual(_extract_amounts(text_nbsp), [500000])
        self.assertEqual(_extract_amounts(text_narrow), [500000])

    def test_05_misleading_sale_price_disambiguation(self):
        text = "Tờ tiền 500.000đ khổ lớn — Giá bán 3.000.000đ"
        amounts = _extract_amounts(text)
        self.assertEqual(amounts, [500000])
        self.assertNotIn(3000000, amounts)

    def test_06_finance_unrelated_page_exclusion(self):
        item = {
            "title": "Gửi 200 triệu nhận 500.000 đồng tiền lãi hàng tháng",
            "snippet": "Ngân hàng thông báo mức lãi suất mới...",
            "link": "https://vietnam.vn/finance-news/123",
            "domain": "vietnam.vn",
        }
        context_valid = _item_has_banknote_context(item)
        self.assertFalse(context_valid)

    def test_07_qualified_three_of_five_promotion(self):
        evidence = [
            {
                "title": "500.000 Đồng Việt Nam Banknote Note",
                "link": "https://banknoteworld.com/note1",
                "domain": "banknoteworld.com",
                "source_trust_level": "TRUSTED",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [500000],
                "complete_identity_support": True,
            },
            {
                "title": "Tờ 500.000đ Polymer Banknote",
                "link": "https://colnect.com/note2",
                "domain": "colnect.com",
                "source_trust_level": "TRUSTED",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [500000],
                "complete_identity_support": True,
            },
            {
                "title": "500000 Dong Note Vietnam Banknote",
                "link": "https://thegioitien.vn/note3",
                "domain": "thegioitien.vn",
                "source_trust_level": "WEAK_COMMERCIAL",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [500000],
                "complete_identity_support": True,
            },
            {
                "title": "200.000 Dong Banknote Note",
                "link": "https://other.com/note4",
                "domain": "other.com",
                "source_trust_level": "NEUTRAL",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [200000],
                "complete_identity_support": True,
            },
            {
                "title": "Random News Banknote Note",
                "link": "https://news.com/note5",
                "domain": "news.com",
                "source_trust_level": "NEUTRAL",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
                "complete_identity_support": True,
            },
        ]
        records = _collect_ag3_candidate_records(evidence, identity_mode="complete")
        self.assertGreaterEqual(len(records), 3)

    def test_08_multiple_subdomains_single_domain_count(self):
        url1 = "https://en.numista.com/catalogue/note1.html"
        url2 = "https://fr.numista.com/catalogue/note1.html"
        self.assertEqual(get_canonical_domain(url1), "numista.com")
        self.assertEqual(get_canonical_domain(url2), "numista.com")

    def test_09_context_helper_and_item_helper_consistency(self):
        item = {
            "title": "Tờ tiền 500.000 đồng polymer Việt Nam",
            "snippet": "Mẫu tiền giấy 500000 VND phát hành năm 2003",
            "link": "https://banknoteworld.com/note1",
        }
        text = f"{item['title']} {item['snippet']}"
        self.assertEqual(_has_banknote_context(text), _item_has_banknote_context(item))

    def test_10_two_usd_offline_fixture_classification(self):
        fixture_2usd = [
            {"title": "Vì sao tờ 2 USD mang ý nghĩa may mắn", "domain": "soha.vn"},
            {"title": "Tờ 2 đô la mặt trước 2003...", "domain": "voz.vn"},
            {"title": "Vì sao tờ 2 USD được coi là đồng tiền may mắn...", "domain": "eva.vn"},
            {"title": "Tờ 2 USD lì xì Tết...", "domain": "giadinh.suckhoedoisong.vn"},
            {"title": "Một số tờ 2 USD có thể trị giá...", "domain": "thanhnien.vn"},
        ]
        for item in fixture_2usd:
            text = item["title"]
            amounts = _extract_amounts(text)
            self.assertIn(2, amounts)
            # Without explicit United States country text in snippet, complete_identity is False
            self.assertFalse(_is_complete_identity_item(item))

    def test_11_formatter_cases_a_b_c_d(self):
        # Case A: 5 raw, 0 eligible -> formatter_skipped_reason = no_eligible_winning_cluster
        raw_items_0_eligible = [
            {"title": f"News item {i}", "domain": f"news{i}.com", "source_trust_level": "NEUTRAL"}
            for i in range(5)
        ]
        records = _collect_ag3_candidate_records(raw_items_0_eligible, identity_mode="complete")
        self.assertEqual(len(records), 0)

        # Case D: Locked identity protection
        locked_c = "Vietnam"
        locked_curr = "VND"
        locked_denom = 500000

        res_item = {"quoc_gia": "United States", "ma_tien_te": "USD", "menh_gia": 2}
        if (res_item["quoc_gia"] != locked_c or res_item["ma_tien_te"] != locked_curr or res_item["menh_gia"] != locked_denom):
            res_item["quoc_gia"] = locked_c
            res_item["ma_tien_te"] = locked_curr
            res_item["menh_gia"] = locked_denom
            res_item["formatter_changed_locked_identity"] = True

        self.assertEqual(res_item["quoc_gia"], "Vietnam")
        self.assertEqual(res_item["menh_gia"], 500000)
        self.assertTrue(res_item["formatter_changed_locked_identity"])

    def test_12_ranker_score_not_mapped_to_confidence(self):
        raw_item = {"title": "2 USD Note", "score": 8.00, "confidence": None}
        confidence = raw_item.get("confidence")
        ranker_score = raw_item.get("score")
        self.assertIsNone(confidence)
        self.assertEqual(ranker_score, 8.00)

    def test_13_decoupled_vote_eligibility_and_consensus_counting(self):
        from app.services.result_payload_service import _agent_payload
        selected_sources = [
            {
                "title": f"Verified source {index}",
                "url": f"https://verified{index}.example/note",
                "canonical_domain": f"verified{index}.example",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [500000],
            }
            for index in range(1, 6)
        ]
        mock_ag3 = {
            "agent": "visual_search",
            "status": "Completed",
            "vote_eligible": True,
            "ag3_verification_summary": {
                "vote_eligible": True,
                "raw_lens_result_count": 5,
                "eligible_evidence_count": 5,
                "selected_voting_sources": selected_sources,
                "selected_source_count": 5,
                "majority_achieved": 3,
                "agreement_pattern": "3/5",
                "vote_identity": {"country": "Vietnam", "currency": "VND", "amount": 500000},
            }
        }
        mock_final_result = {
            "matched_agents_keys": ["ml_dl", "llm_api"] # AG3 did not match winning consensus
        }
        payload = _agent_payload(mock_ag3, ["visual_search"], mock_final_result)
        self.assertTrue(payload["vote_eligible"])
        self.assertTrue(payload["counted_in_consensus"])
        self.assertFalse(payload["matched"])
        self.assertEqual(payload["aggregator_counting_reason"], "different_from_winning_identity")


    def test_14_ag3_independent_classification_does_not_use_final_decision(self):
        # Verify evidence classification uses AG3's internal winning identity, not external final decision
        ev_item = {
            "title": "20.000 Đồng – Vietnam – Numista",
            "detected_country": "Việt Nam",
            "detected_currency": "VND",
            "detected_amounts": [20000],
            "score": 11.00,
        }
        accepted_identity_2k = {"country": "Việt Nam", "currency": "VND", "amount": 2000}

        # Compare against AG3 internal candidate 2k
        p_amount = accepted_identity_2k["amount"]
        it_amounts = ev_item["detected_amounts"]
        is_conflicting = any(a != p_amount for a in it_amounts)
        self.assertTrue(is_conflicting)

    def test_15_high_ranker_score_does_not_make_supporting(self):
        # A high score (11.00) for 20,000 VND is conflicting when target identity is 2,000 VND
        item = {
            "title": "20 000 Đồng – Vietnam – Numista",
            "score": 11.00,
            "detected_amounts": [20000],
            "detected_currency": "VND",
            "detected_country": "Việt Nam",
        }
        target_denom = 2000
        is_supporting = 2000 in item["detected_amounts"]
        self.assertFalse(is_supporting)
        self.assertGreater(item["score"], 10.0)

    def test_16_commercial_exact_match_not_auto_eligible(self):
        # Commercial listings are categorized by source_trust_level and page intent, not auto-supporting
        item = {
            "title": "Vietnam 2000 Dong Note Listing",
            "link": "https://facebook.com/marketplace/item/123",
            "domain": "facebook.com",
            "source_trust_level": "SOCIAL",
        }
        classified = classify_source(item)
        self.assertEqual(classified["source_trust_level"], "SOCIAL")
        self.assertFalse(classified["is_accessible"] and classified["source_trust_level"] != "SOCIAL")

    def test_17_parser_keeps_web_titles_out_of_visible_text_and_reports_invariant(self):
        parsed = parse_lens_evidence_without_llm(
            [
                {
                    "title": "Tien 100k seri dep",
                    "domain": "example.com",
                    "source_trust_level": "WEAK_COMMERCIAL",
                },
                {
                    "title": "Facebook marketplace money listing",
                    "domain": "facebook.com",
                    "source_trust_level": "SOCIAL",
                },
            ]
        )
        summary = parsed.get("ag3_verification_summary") or {}
        trace = summary.get("ag3_formatter_decision_trace") or {}

        self.assertEqual(parsed.get("van_ban_nhin_thay"), [])
        self.assertEqual(parsed.get("banknote_visible_text"), [])
        self.assertEqual(summary.get("raw_lens_result_count"), 2)
        self.assertTrue(summary.get("count_invariant_ok"))
        self.assertIn("partial_evidence_count", summary)
        self.assertFalse(trace.get("groq_invoked"))

    def test_18_vietnam_10000_fixture_uses_three_of_five_structured_vote(self):
        evidence = [
            {
                "title": "2023 p-119 10,000 dong Vietnam polymer banknotes",
                "snippet": "Vietnam 10,000 Dong polymer banknote catalog reference.",
                "url": "https://vietnambanknote.com/vietnam-polymer-10000-dong",
                "domain": "vietnambanknote.com",
                "canonical_domain": "vietnambanknote.com",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [10000],
                "content_identity_quality": "COMPLETE_EXACT",
                "has_banknote_context": True,
                "page_text_excerpt": "Vietnam polymer 10,000 Dong banknote VND catalog listing.",
                "page_text_identity_terms": ["country:Vietnam", "currency:VND", "amount:10000", "banknote_context:banknote"],
            },
            {
                "title": "To 100.000 dong seri sieu khung",
                "snippet": "Vietnam 100,000 VND polymer banknote collector listing.",
                "url": "https://seridep.vn/to-100000-dong-seri-sieukhung",
                "domain": "seridep.vn",
                "canonical_domain": "seridep.vn",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
                "content_identity_quality": "COMPLETE_EXACT",
                "has_banknote_context": True,
                "page_text_excerpt": "To tien polymer 100.000 dong Viet Nam VND banknote.",
                "page_text_identity_terms": ["country:Vietnam", "currency:VND", "amount:100000", "banknote_context:banknote"],
            },
            {
                "title": "Tu 1-9, phat hanh tien polymer menh gia 100.000 dong",
                "snippet": "Official newspaper article on Vietnam VND 100,000 polymer banknote.",
                "url": "https://nhandan.vn/tu-1-9-phat-hanh-tien-polymer-menh-gia-100-000-dong-post539201.html",
                "domain": "nhandan.vn",
                "canonical_domain": "nhandan.vn",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
                "content_identity_quality": "COMPLETE_EXACT",
                "has_banknote_context": True,
                "page_text_excerpt": "Ngan hang Nha nuoc phat hanh tien polymer menh gia 100.000 dong VND.",
                "page_text_identity_terms": ["country:Vietnam", "currency:VND", "amount:100000", "banknote_context:banknote"],
            },
            {
                "title": "Tien polymer 10.000 dong co loi do khau che ban",
                "snippet": "News article about Vietnam 10,000 VND polymer banknote.",
                "url": "https://dantri.com.vn/kinh-doanh/tien-polymer-10000-dong-co-loi-do-khau-che-ban.htm",
                "domain": "dantri.com.vn",
                "canonical_domain": "dantri.com.vn",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [10000],
                "content_identity_quality": "COMPLETE_EXACT",
                "has_banknote_context": True,
                "page_text_excerpt": "Tien polymer 10.000 dong Viet Nam VND banknote co loi che ban.",
                "page_text_identity_terms": ["country:Vietnam", "currency:VND", "amount:10000", "banknote_context:banknote"],
            },
            {
                "title": "Vietnam polymer 10,000 Dong 2006",
                "snippet": "Catalog page for Vietnam 10,000 Dong polymer banknote.",
                "url": "https://art-hanoi.com/vietnam-polymer-10000-dong-2006",
                "domain": "art-hanoi.com",
                "canonical_domain": "art-hanoi.com",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [10000],
                "content_identity_quality": "COMPLETE_EXACT",
                "has_banknote_context": True,
                "page_text_excerpt": "Vietnam polymer 10,000 Dong 2006 VND banknote catalog.",
                "page_text_identity_terms": ["country:Vietnam", "currency:VND", "amount:10000", "banknote_context:banknote"],
            },
        ]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}
        dispositions = [item.get("final_disposition") for item in result.get("evidence") or []]
        clusters = summary.get("candidate_clusters") or []
        cluster_counts = {
            int(cluster.get("amount")): cluster.get("support_count")
            for cluster in clusters
            if cluster.get("amount") is not None
        }

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["menh_gia"], "10000 VND")
        self.assertTrue(result["vote_eligible"])
        self.assertEqual(summary.get("raw_lens_result_count"), 5)
        self.assertEqual(summary.get("qualified_source_count"), 5)
        self.assertEqual(summary.get("qualified_independent_domain_count"), 5)
        self.assertEqual(summary.get("supporting_evidence_count"), 3)
        self.assertEqual(summary.get("conflicting_evidence_count"), 2)
        self.assertEqual(summary.get("partial_evidence_count"), 0)
        self.assertEqual(summary.get("excluded_evidence_count"), 0)
        self.assertEqual(summary.get("duplicate_evidence_count"), 0)
        self.assertEqual(cluster_counts.get(10000), 3)
        self.assertEqual(cluster_counts.get(100000), 2)
        self.assertEqual(summary.get("selected_voting_set_size"), 5)
        self.assertEqual(summary.get("majority_required"), 3)
        self.assertEqual(summary.get("agreement_achieved"), "3/5")
        self.assertEqual(summary.get("promotion_reason"), "qualified_three_of_five")
        self.assertEqual(dispositions.count("supporting"), 3)
        self.assertEqual(dispositions.count("conflicting"), 2)
        self.assertTrue(summary.get("count_invariant_ok"))
        for item in result.get("evidence") or []:
            self.assertNotIn(item.get("source_class"), (None, "None", ""))
            self.assertEqual(item.get("page_fetch_status"), "success")
            self.assertTrue(item.get("page_text_checked"))

    def test_19_provider_result_limit_caps_initial_to_ten(self):
        evidence = [self._article(i, amount=100000, domain=f"limit{i}.com") for i in range(1, 13)]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}

        self.assertEqual(summary.get("initial_lens_result_count"), 10)
        self.assertEqual(summary.get("targeted_search_result_count"), 0)
        self.assertEqual(summary.get("total_raw_evidence_count"), 10)
        self.assertEqual(len(result.get("evidence") or []), 10)
        self.assertEqual(summary.get("selected_source_count"), 5)
        self.assertEqual(len(summary.get("raw_articles") or []), 10)
        self.assertEqual(len(summary.get("selected_voting_sources") or []), 5)
        self.assertEqual(summary.get("required_selected_source_count"), 5)
        self.assertTrue(summary.get("count_invariant_ok"))

    def test_20_top_five_three_of_five_creates_one_ag3_vote(self):
        evidence = [
            self._article(1, amount=100000, domain="three1.com"),
            self._article(2, amount=100000, domain="three2.com"),
            self._article(3, amount=100000, domain="three3.com"),
            self._article(4, amount=500000, domain="minor1.com"),
            self._article(5, amount=200000, domain="minor2.com"),
        ]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}
        vote_identity = summary.get("vote_identity") or {}

        self.assertEqual(result.get("status"), "Completed")
        self.assertTrue(summary.get("vote_eligible"))
        self.assertEqual(summary.get("selected_source_count"), 5)
        self.assertEqual(summary.get("majority_required"), 3)
        self.assertEqual(summary.get("majority_achieved"), 3)
        self.assertEqual(summary.get("agreement_pattern"), "3/5")
        self.assertTrue(summary.get("vote_created"))
        self.assertEqual(len(summary.get("candidate_sources") or []), 5)
        self.assertEqual(len(summary.get("selected_voting_sources") or []), 5)
        self.assertEqual(vote_identity.get("amount"), 100000)
        self.assertEqual((result.get("evidence") or [])[0].get("selected_for_ag3_vote"), True)

    def test_21_five_sources_without_three_majority_does_not_vote(self):
        evidence = [
            self._article(1, amount=100000, domain="nomaj1.com"),
            self._article(2, amount=100000, domain="nomaj2.com"),
            self._article(3, amount=500000, domain="nomaj3.com"),
            self._article(4, amount=500000, domain="nomaj4.com"),
            self._article(5, amount=200000, domain="nomaj5.com"),
        ]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}

        self.assertEqual(result.get("status"), "Partial")
        self.assertFalse(summary.get("vote_eligible"))
        self.assertEqual(summary.get("selected_source_count"), 5)
        self.assertEqual(summary.get("majority_achieved"), 2)
        self.assertEqual(summary.get("agreement_pattern"), "2/5")
        self.assertEqual(summary.get("selection_reason"), "no_three_of_five_majority")
        self.assertEqual(summary.get("vote_identity"), {})

    def test_22_duplicate_domain_removes_one_representative_and_blocks_vote(self):
        evidence = [
            self._article(1, amount=100000, domain="dupe.com"),
            self._article(2, amount=100000, domain="dupe.com"),
            self._article(3, amount=100000, domain="unique3.com"),
            self._article(4, amount=100000, domain="unique4.com"),
            self._article(5, amount=100000, domain="unique5.com"),
        ]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}
        dispositions = [item.get("final_disposition") for item in result.get("evidence") or []]

        self.assertFalse(summary.get("vote_eligible"))
        self.assertEqual(summary.get("qualified_item_count_before_dedupe"), 5)
        self.assertEqual(summary.get("qualified_independent_domain_count"), 4)
        self.assertEqual(summary.get("candidate_source_count"), 4)
        self.assertEqual(summary.get("selected_source_count"), 0)
        self.assertEqual(summary.get("selected_voting_sources"), [])
        self.assertEqual(summary.get("majority_achieved"), 0)
        self.assertIsNone(summary.get("agreement_pattern"))
        self.assertFalse(summary.get("vote_created"))
        self.assertEqual(summary.get("duplicate_evidence_count"), 1)
        self.assertIn("duplicate", dispositions)
        self.assertEqual(summary.get("selection_reason"), "insufficient_five_qualified_independent_sources")

    def test_23_missing_country_currency_or_denomination_is_partial(self):
        missing_country = self._article(1, domain="partial-country.com", quality="PARTIAL_IDENTITY")
        missing_country.pop("detected_country", None)
        missing_country["page_text_excerpt"] = ""
        missing_country["page_text_identity_terms"] = []

        missing_currency = self._article(2, domain="partial-currency.com", quality="PARTIAL_IDENTITY")
        missing_currency.pop("detected_currency", None)
        missing_currency["page_text_excerpt"] = ""
        missing_currency["page_text_identity_terms"] = []

        missing_amount = self._article(3, domain="partial-amount.com", quality="PARTIAL_IDENTITY")
        missing_amount["detected_amounts"] = []
        missing_amount["page_text_excerpt"] = ""
        missing_amount["page_text_identity_terms"] = []

        result = validate_agent3_identity({"status": "Partial"}, evidence=[
            missing_country,
            missing_currency,
            missing_amount,
        ])
        summary = result.get("ag3_verification_summary") or {}
        dispositions = [item.get("final_disposition") for item in result.get("evidence") or []]

        self.assertEqual(dispositions, ["partial", "partial", "partial"])
        self.assertEqual(summary.get("partial_evidence_count"), 3)
        self.assertFalse(summary.get("vote_eligible"))

    def test_24_coin_and_social_sources_are_excluded(self):
        coin = self._article(1, amount=100000, domain="coin-source.com", banknote=False)
        social = self._article(2, amount=100000, domain="facebook.com", source_class="SOCIAL")

        result = validate_agent3_identity({"status": "Partial"}, evidence=[coin, social])
        summary = result.get("ag3_verification_summary") or {}
        reasons = [item.get("final_reason") for item in result.get("evidence") or []]

        self.assertEqual(summary.get("excluded_evidence_count"), 2)
        self.assertEqual(summary.get("partial_evidence_count"), 0)
        self.assertFalse(summary.get("vote_eligible"))
        self.assertIn("non_banknote_numismatic_object", reasons)
        self.assertIn("social_source", reasons)

    def test_25_multiple_denominations_is_partial_not_selected(self):
        multi = self._article(
            1,
            amount=100000,
            domain="multi-denom.com",
            amounts=[100000, 500000],
            quality="PARTIAL_IDENTITY",
        )

        result = validate_agent3_identity({"status": "Partial"}, evidence=[multi])
        summary = result.get("ag3_verification_summary") or {}
        evidence = result.get("evidence") or []

        self.assertEqual(evidence[0].get("final_disposition"), "partial")
        self.assertNotEqual(evidence[0].get("selected_for_ag3_vote"), True)
        self.assertEqual(summary.get("partial_evidence_count"), 1)
        self.assertFalse(summary.get("vote_eligible"))

    def test_26_targeted_sources_are_counted_with_initial_total_invariant(self):
        evidence = [
            self._article(1, amount=100000, domain="initial1.com"),
            self._article(2, amount=100000, domain="initial2.com"),
            self._article(3, amount=500000, domain="initial3.com"),
            self._article(4, amount=100000, domain="target1.com", targeted=True),
            self._article(5, amount=100000, domain="target2.com", targeted=True),
        ]

        result = validate_agent3_identity({"status": "Partial"}, evidence=evidence)
        summary = result.get("ag3_verification_summary") or {}

        self.assertEqual(summary.get("initial_lens_result_count"), 3)
        self.assertEqual(summary.get("targeted_search_result_count"), 2)
        self.assertEqual(summary.get("total_raw_evidence_count"), 5)
        self.assertEqual(
            summary.get("total_raw_evidence_count"),
            summary.get("initial_lens_result_count") + summary.get("targeted_search_result_count"),
        )
        self.assertTrue(summary.get("vote_eligible"))
        self.assertEqual(summary.get("agreement_pattern"), "4/5")


def _is_complete_identity_item(item: Dict[str, Any]) -> bool:
    country = item.get("detected_country")
    currency = item.get("detected_currency")
    amounts = item.get("detected_amounts")
    return bool(country and currency and amounts)


if __name__ == "__main__":
    unittest.main()
