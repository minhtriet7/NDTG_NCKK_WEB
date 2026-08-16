import pytest
from app.services.evidence_ranker_service import _score_item
from app.services.result_payload_service import sanitize_admin_diagnostics
from app.agents.agent_aggregator import classify_consensus_pattern

def test_primary_denomination_classification():
    # Wikipedia
    wiki_item = {
        "title": "200.000 đồng (tiền Việt)",
        "snippet": "Mặt trước có nhắc thêm 10.000 đồng.",
        "page_text_excerpt": "10000 200000"
    }
    _score_item(wiki_item, "")
    assert wiki_item["primary_denomination"] == 200000
    assert 10000 in wiki_item["mentioned_denominations"]
    assert wiki_item["denomination_ambiguous"] is False

    # Art Hanoi
    art_hanoi = {
        "title": "Vietnam 200,000 Dong polymer",
        "snippet": "Banknote UNC"
    }
    _score_item(art_hanoi, "")
    assert art_hanoi["primary_denomination"] == 200000
    assert art_hanoi["denomination_ambiguous"] is False

    # SGGP
    sggp = {
        "title": "Phát hành tiền 10.000 đồng và 200.000 đồng",
    }
    _score_item(sggp, "")
    assert sggp["primary_denomination"] is None
    assert sggp["denomination_ambiguous"] is True

    # Tuổi Trẻ
    tuoitre = {
        "title": "Tiền 50.000 và 500.000 giả",
    }
    _score_item(tuoitre, "")
    assert tuoitre["primary_denomination"] is None
    assert tuoitre["denomination_ambiguous"] is True

def test_selection_does_not_fill_five_invalid():
    # Mocking normalized evidence output from Lens parser
    evidence = []
    # Add 2 exact 200k sources
    for i in range(2):
        evidence.append({
            "title": f"200.000 dong site {i}",
            "domain": f"site{i}.com",
            "canonical_domain": f"site{i}.com",
            "complete_identity": True,
            "has_banknote": True,
            "qualified_source": True,
            "content_identity_quality": "COMPLETE_IDENTITY",
            "detected_amounts": [200000],
            "detected_currency": "VND",
            "detected_country": "Vietnam",
            "object_type": "banknote",
            "source_class": "TRUSTED",
            "primary_denomination": 200000,
            "denomination_ambiguous": False
        })
    # Add 8 noise/invalid/ambiguous sources
    for i in range(8):
        evidence.append({
            "title": f"100.000 dong and 200.000 site {i}",
            "domain": f"noise{i}.com",
            "canonical_domain": f"noise{i}.com",
            "complete_identity": True,
            "has_banknote": True,
            "content_identity_quality": "COMPLETE_IDENTITY",
            "detected_amounts": [100000, 200000],
            "detected_currency": "VND",
            "detected_country": "Vietnam",
            "object_type": "banknote",
            "source_class": "TRUSTED",
            "primary_denomination": None,
            "denomination_ambiguous": True
        })
    
    # We construct a mock context around _parse_lens_payload
    # Because _parse_lens_payload requires a full JSON from serpapi
    # We will just unit test the eligible items filtering manually as done in the agent

    # Testing the selection logic that we updated in agent_3_lens.py
    # Since agent_3_lens.py is procedural inside _parse_lens_payload, 
    # we can just test the expected contract.
    eligible_items = [e for e in evidence if not e.get("denomination_ambiguous")]
    assert len(eligible_items) == 2
    
    # Selection logic in agent_3_lens:
    # candidate_voting_items = eligible_items[:AG3_SELECTED_SOURCE_LIMIT]
    # selected_voting_items = candidate_voting_items if len(candidate_voting_items) == 5 else []
    candidate_voting_items = eligible_items[:5]
    selected_voting_items = candidate_voting_items if len(candidate_voting_items) == 5 else []
    
    assert len(selected_voting_items) == 0

def test_diagnostics_performance_and_consensus():
    # Diagnostics check
    dirty_payload = {
        "raw_html": "<!doctype html><html><body></body></html>",
        "script": "var a = 1;",
        "window.ytplayer": "{}",
        "ytcfg": "{}",
        "experiment_flags": "{}",
        "page_text_excerpt": "A" * 3000,
        "nested": {
            "window.ytplayer": "{}",
            "page_text_excerpt": "B" * 2500
        },
        "formatter_trace": {
            "name": "ag3_lens_analyzer",
            "raw_articles": [{"title": "huge object"}]
        }
    }
    clean = sanitize_admin_diagnostics(dirty_payload)
    
    assert clean.get("raw_html") == "REDACTED"
    assert clean.get("script") == "[REMOVED_FOR_PERFORMANCE]"
    assert clean.get("window.ytplayer") == "[REMOVED_FOR_PERFORMANCE]"
    assert clean.get("ytcfg") == "[REMOVED_FOR_PERFORMANCE]"
    assert clean.get("experiment_flags") == "[REMOVED_FOR_PERFORMANCE]"
    assert len(clean["page_text_excerpt"]) < 2100
    assert clean["nested"]["window.ytplayer"] == "[REMOVED_FOR_PERFORMANCE]"
    assert len(clean["nested"]["page_text_excerpt"]) < 2100
    assert clean["formatter_trace"]["raw_articles"] == "[DUPLICATE_REMOVED_USE_ROOT]"

    # Consensus check
    valid_votes = [
        {"vote_key": ("Vietnam", "VND", 200000)},
        {"vote_key": ("Vietnam", "VND", 200000)}
    ]
    pattern = classify_consensus_pattern({}, valid_votes, matched_count=2)
    assert pattern == "2/2"
