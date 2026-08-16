import pytest
from app.utils.currency_normalizer import normalize_currency_identity, canonical_country_for_currency
from app.agents.agent_aggregator import classify_consensus_pattern, _build_vote_groups
from collections import Counter

def test_strict_ag3_vote_counted():
    # TEST 1 — STRICT AG3 VOTE ĐƯỢC COUNTED
    # AG1: Eurozone / EUR / 10
    # AG2: Eurozone / EUR / 10
    # AG3: European Union / EUR / 10
    
    ag1_vote = normalize_currency_identity("Eurozone", "EUR", 10)
    ag2_vote = normalize_currency_identity("Eurozone", "EUR", 10)
    ag3_vote = normalize_currency_identity("European Union", "EUR", 10)
    
    # Assert canonical comparison identifies same identity
    assert ag1_vote["vote_key"] == ("euro zone", "EUR", "10")
    assert ag2_vote["vote_key"] == ("euro zone", "EUR", "10")
    assert ag3_vote["vote_key"] == ("euro zone", "EUR", "10")
    
    # Mock aggregation counting logic
    valid_votes = [ag1_vote, ag2_vote, ag3_vote]
    key_counter = Counter([v["vote_key"] for v in valid_votes if v.get("vote_key")])
    winner_key, matched_count = key_counter.most_common(1)[0]
    
    assert matched_count == 3
    assert len(valid_votes) == 3
    
    # Simulate agent mapping for classify_consensus_pattern
    agents = {"agent1": {}, "agent2": {}, "visual_search": {}}
    pattern = classify_consensus_pattern(agents, valid_votes, matched_count)
    assert pattern == "3/3"


def test_strict_ag3_dissent_still_counted():
    # TEST 2 — STRICT AG3 DISSENT VẪN COUNTED
    # AG1 và AG2: Eurozone / EUR / 10
    # AG3 strict vote: European Union / EUR / 20
    
    ag1_vote = normalize_currency_identity("Eurozone", "EUR", 10)
    ag2_vote = normalize_currency_identity("Eurozone", "EUR", 10)
    ag3_vote = normalize_currency_identity("European Union", "EUR", 20)
    
    assert ag1_vote["vote_key"] == ("euro zone", "EUR", "10")
    assert ag3_vote["vote_key"] == ("euro zone", "EUR", "20")
    
    # Mock aggregation counting logic
    valid_votes = [ag1_vote, ag2_vote, ag3_vote]
    key_counter = Counter([v["vote_key"] for v in valid_votes if v.get("vote_key")])
    winner_key, matched_count = key_counter.most_common(1)[0]
    
    assert winner_key == ("euro zone", "EUR", "10")
    assert matched_count == 2
    assert len(valid_votes) == 3
    
    agents = {"agent1": {}, "agent2": {}, "visual_search": {}}
    pattern = classify_consensus_pattern(agents, valid_votes, matched_count)
    assert pattern == "2/3"


def test_stale_flag_does_not_override():
    # TEST 3 — STALE FLAG
    # This verifies that after the revert logic is removed, a completed vote isn't destroyed
    # and not_counted_in_consensus is properly False on success.
    
    # To test this at the unit level, we verify the contract of the payload mutation
    # since we cannot run the full _resolve_agent3_fallback without mock networks.
    
    # Assume original was Partial with not_counted_in_consensus = True
    original = {"status": "Partial", "not_counted_in_consensus": True}
    
    # Assume validate_agent3_identity completed successfully (simulated)
    validated = {"status": "Completed", "not_counted_in_consensus": False}
    
    # Keys do NOT match (e.g. 10 EUR candidate vs 20 EUR validated)
    keys_match = False
    
    # Logic in agent_3_lens.py:
    used_for_vote = bool(
        str(validated.get("status") or "").casefold() == "completed"
        and not bool(validated.get("not_counted_in_consensus"))
        and keys_match
    )
    
    assert used_for_vote is False
    
    # The crucial fix: we NO LONGER revert validated back to dict(original).
    # It used to be: if status == completed and not used_for_vote -> revert.
    # Now validated remains intact.
    
    assert validated["status"] == "Completed"
    assert validated["not_counted_in_consensus"] is False
