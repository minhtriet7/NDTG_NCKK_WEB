import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.result_payload_service import (  # noqa: E402
    RAW_USER_BLOCKED_KEYS,
    serialize_admin_diagnostics,
    serialize_admin_result_summary,
    serialize_task_light_status,
    serialize_user_result,
    serialize_user_task,
)


FORBIDDEN_USER_KEYS = RAW_USER_BLOCKED_KEYS | {
    "consensus_trace",
    "provider_trace",
    "promotion_trace",
    "balance_before",
    "balance_after",
}


def _walk_keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _walk_keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_keys(item)


def _assert_no_forbidden_user_keys(payload):
    keys = set(_walk_keys(payload))
    leaked = sorted(keys & FORBIDDEN_USER_KEYS)
    assert leaked == []


def _raw_record(status="completed", final_overrides=None, detected_objects=None):
    final_result = {
        "status": status,
        "final_denomination": "500000 VND",
        "currency": "VND",
        "country": "Vietnam",
        "confidence": 0.93456,
        "matched_agents": 2,
        "total_agents": 3,
        "consensus_pattern": "2/3",
        "valid_vote_count": 2,
        "matched_agents_keys": ["ml_dl", "llm_api"],
        "winner_key": ["vietnam", "VND", 500000],
        "public_explanation": "Two public votes agree.",
        "valid_votes": [
            {"agent_key": "ml_dl", "denomination": "500000 VND", "country": "Vietnam", "currency": "VND"},
            {"agent_key": "llm_api", "denomination": "500000 VND", "country": "Vietnam", "currency": "VND"},
        ],
        "consensus_trace": [{"step": "raw"}],
        "provider_trace": {"api_key": "secret-provider-key"},
        "promotion_trace": {"candidate_queries": ["500000 vnd"]},
        "local_path": "C:/private/uploads/scan.jpg",
        "debate_log": "raw internal debate log",
        "prompt": "internal prompt " * 80,
        "model_attempts": [
            {"model": "provider-model", "retry": idx, "raw_response": "x" * 120}
            for idx in range(6)
        ],
        "token_usage": {"input_tokens": 123},
        "detected_objects": detected_objects or [],
    }
    final_result.update(final_overrides or {})

    return SimpleNamespace(
        id="result-1",
        user_id="user-1",
        task_id="task-1",
        status=status,
        uploaded_image_url="https://cdn.example/scan.jpg?api_key=secret",
        input_image_path="C:/private/uploads/scan.jpg",
        final_result=final_result,
        agent_results=[
            {
                "agent": "agent_1_openai",
                "data": {
                    "denomination": "500000 VND",
                    "country": "Vietnam",
                    "confidence": 0.91,
                    "visible_text": ["500000", "Vietnam"],
                    "provider_trace": {"api_key": "secret"},
                },
            },
            {
                "agent": "agent_2_llm",
                "data": {
                    "denomination": "500000 VND",
                    "country": "Vietnam",
                    "confidence": 0.89,
                },
            },
            {
                "agent": "agent_3_lens",
                "data": {
                    "denomination": "500000 VND",
                    "country": "Vietnam",
                    "confidence": 0.84,
                    "evidence": ["public source"],
                    "promotion_trace": {"reason": "raw"},
                },
            },
        ],
        conversion_result={"to_currency": "VND", "vnd_value": 500000},
        processing_time_ms=1234,
        system_tokens_charged=1,
        token_usage={"input_tokens": 100, "output_tokens": 50},
        input_tokens=100,
        output_tokens=50,
        total_ai_tokens=150,
        billable_ai_tokens=150,
        billing_mode="fixed",
        balance_before=10,
        balance_after=9,
        error_message=None,
        created_at="2026-07-29T00:00:00Z",
        updated_at="2026-07-29T00:00:01Z",
    )


def _ag3_selected_source(index, amount=5000, disposition="supporting"):
    domain = f"source{index}.example"
    return {
        "title": f"AG3 source {index}",
        "url": f"https://{domain}/banknote-{index}",
        "domain": domain,
        "canonical_domain": domain,
        "detected_country": "Vietnam",
        "detected_currency": "VND",
        "detected_amounts": [amount],
        "object_type": "banknote",
        "complete_identity": True,
        "independent_domain": True,
        "evidence_disposition": disposition,
        "final_disposition": disposition,
        "selected_for_ag3_internal_vote": True,
        "selected_for_ag3_vote": True,
        "selected_rank": index,
    }


def _ag3_serialization_record(
    *,
    selected_count,
    support_count,
    ag4_counts_visual=True,
    force_agent_vote_created=True,
):
    selected_sources = []
    for index in range(1, selected_count + 1):
        if index <= support_count:
            selected_sources.append(_ag3_selected_source(index, amount=5000))
        else:
            disposition = "conflicting" if index % 2 else "partial"
            selected_sources.append(_ag3_selected_source(index, amount=1000 + index, disposition=disposition))

    identity = {"country": "Vietnam", "currency": "VND", "amount": 5000}
    agreement = f"{support_count}/{selected_count}" if selected_count else None
    summary = {
        "raw_articles": selected_sources,
        "candidate_sources": selected_sources,
        "selected_voting_sources": selected_sources,
        "selected_voting_set": selected_sources,
        "required_selected_source_count": 3,
        "maximum_selected_source_count": 5,
        "selected_source_count": selected_count,
        "selected_voting_source_count": selected_count,
        "selected_voting_set_size": selected_count,
        "majority_required": 3,
        "majority_achieved": support_count,
        "support_count": support_count,
        "agreement_pattern": agreement,
        "agreement_achieved": agreement,
        "vote_identity": dict(identity),
        "winning_identity": dict(identity),
        "winning_cluster": {
            **identity,
            "support_count": support_count,
            "independent_domain_count": support_count,
        },
        "vote_eligible": force_agent_vote_created,
        "vote_created": force_agent_vote_created,
        "counted_in_consensus": ag4_counts_visual,
        "not_counted_in_consensus": not ag4_counts_visual,
    }
    ag3_data = {
        "agent_key": "visual_search",
        "status": "Completed",
        "denomination": "5000 VND",
        "country": "Vietnam",
        "currency": "VND",
        "search_performed": True,
        "selected_voting_sources": selected_sources,
        "selected_voting_set": selected_sources,
        "required_selected_source_count": 3,
        "maximum_selected_source_count": 5,
        "selected_source_count": selected_count,
        "selected_voting_source_count": selected_count,
        "selected_voting_set_size": selected_count,
        "majority_required": 3,
        "majority_achieved": support_count,
        "support_count": support_count,
        "agreement_pattern": agreement,
        "agreement_achieved": agreement,
        "vote_identity": dict(identity),
        "winning_identity": dict(identity),
        "winning_cluster": dict(summary["winning_cluster"]),
        "vote_eligible": force_agent_vote_created,
        "vote_created": force_agent_vote_created,
        "counted_in_consensus": ag4_counts_visual,
        "not_counted_in_consensus": not ag4_counts_visual,
        "ag3_verification_summary": summary,
        "evidence": selected_sources,
    }

    valid_votes = [
        {"agent_key": "ml_dl", "denomination": "5000 VND", "country": "Vietnam", "currency": "VND"},
        {"agent_key": "llm_api", "denomination": "5000 VND", "country": "Vietnam", "currency": "VND"},
    ]
    matched_agents_keys = ["ml_dl", "llm_api"]
    if ag4_counts_visual:
        valid_votes.append(
            {
                "agent_key": "visual_search",
                "denomination": "5000 VND",
                "country": "Vietnam",
                "currency": "VND",
            }
        )
        matched_agents_keys.append("visual_search")

    record = _raw_record(
        final_overrides={
            "final_denomination": "5000 VND",
            "currency": "VND",
            "country": "Vietnam",
            "matched_agents": len(matched_agents_keys),
            "total_agents": len(valid_votes),
            "valid_vote_count": len(valid_votes),
            "consensus_pattern": f"{len(matched_agents_keys)}/{len(valid_votes)}",
            "matched_agents_keys": matched_agents_keys,
            "winner_key": ["vietnam", "VND", 5000],
            "valid_votes": valid_votes,
            "agent_counting_traces": {
                "visual_search": {
                    "valid_vote": ag4_counts_visual,
                    "counted_in_consensus": ag4_counts_visual,
                    "matched": ag4_counts_visual,
                }
            },
        }
    )
    record.agent_results[2] = {"agent": "agent_3_lens", "data": ag3_data}
    return record


def _serialized_ag3(record):
    payload = serialize_user_result(record)
    return payload, payload["agents"]["visual_search"]


def _assert_valid_ag3_vote(ag3, selected_count, support_count):
    assert ag3["selected_source_count"] == selected_count
    assert ag3["selected_voting_source_count"] == selected_count
    assert ag3["selected_voting_set_size"] == selected_count
    assert len(ag3["selected_voting_sources"]) == selected_count
    assert ag3["majority_achieved"] == support_count
    assert ag3["agreement_pattern"] == f"{support_count}/{selected_count}"
    assert ag3["vote_identity"] == {"country": "Vietnam", "currency": "VND", "amount": 5000}
    assert ag3["vote_eligible"] is True
    assert ag3["vote_created"] is True
    assert ag3["counted_in_consensus"] is True
    assert ag3["counted"] is True
    assert ag3["not_counted_in_consensus"] is False
    assert ag3["support_ratio"] == {
        "supporting_sources": support_count,
        "selected_sources": selected_count,
    }


def test_user_result_excludes_raw_diagnostics_and_keeps_public_contract():
    payload = serialize_user_result(_raw_record())

    _assert_no_forbidden_user_keys(payload)
    assert payload["result_id"] == "result-1"
    assert payload["summary"]["denomination"] == "500000 VND"
    assert payload["summary"]["country"] == "Vietnam"
    assert len(payload["agent_votes"]) == 3
    assert payload["agents"]["ml_dl"]["denomination"] == "500000 VND"
    assert payload["agent_votes"][0]["matched"] is True
    assert payload["agent_votes"][0]["counted"] is True
    assert payload["agent_votes"][2]["matched"] is False
    assert payload["consensus"]["matched_agents"] == 2
    assert payload["consensus"]["total_agents"] == 3
    assert payload["consensus"]["pattern"] == "2/3"
    assert payload["billing"]["app_tokens_charged"] == 1
    assert payload["billing"]["credits_charged"] == 1
    assert payload["billing"]["charged"] is True
    assert payload["billing"]["billing_mode"] == "fixed"
    assert payload["billing"]["skipped"] is False
    assert payload["image_url"].endswith("api_key=REDACTED")
    assert payload["image"]["original_url"].endswith("api_key=REDACTED")


def test_ag3_serializer_preserves_selected_3_support_3_counted_vote():
    _, ag3 = _serialized_ag3(
        _ag3_serialization_record(selected_count=3, support_count=3)
    )

    _assert_valid_ag3_vote(ag3, selected_count=3, support_count=3)


def test_ag3_serializer_preserves_selected_4_support_3_counted_vote():
    _, ag3 = _serialized_ag3(
        _ag3_serialization_record(selected_count=4, support_count=3)
    )

    _assert_valid_ag3_vote(ag3, selected_count=4, support_count=3)


def test_ag3_serializer_preserves_selected_5_support_4_counted_vote():
    _, ag3 = _serialized_ag3(
        _ag3_serialization_record(selected_count=5, support_count=4)
    )

    _assert_valid_ag3_vote(ag3, selected_count=5, support_count=4)


def test_ag3_serializer_preserves_five_selected_with_two_dissent_sources():
    _, ag3 = _serialized_ag3(
        _ag3_serialization_record(selected_count=5, support_count=3)
    )

    _assert_valid_ag3_vote(ag3, selected_count=5, support_count=3)
    dispositions = {
        item["final_disposition"]
        for item in ag3["selected_voting_sources"]
    }
    assert "supporting" in dispositions
    assert "partial" in dispositions
    assert "conflicting" in dispositions


def test_ag3_serializer_rejects_selected_2_even_if_agent_claims_vote():
    _, ag3 = _serialized_ag3(
        _ag3_serialization_record(
            selected_count=2,
            support_count=2,
            ag4_counts_visual=False,
            force_agent_vote_created=True,
        )
    )

    assert ag3["selected_source_count"] == 0
    assert ag3["selected_voting_set_size"] == 0
    assert ag3["majority_achieved"] == 0
    assert ag3["vote_eligible"] is False
    assert ag3["vote_created"] is False
    assert ag3["counted_in_consensus"] is False
    assert ag3["counted"] is False
    assert ag3["not_counted_in_consensus"] is True


def test_ag3_serializer_does_not_contradict_ag4_counted_visual_vote():
    payload, ag3 = _serialized_ag3(
        _ag3_serialization_record(selected_count=4, support_count=3)
    )

    assert any(
        vote.get("agent_key") == "visual_search"
        for vote in payload["consensus"]["valid_votes"]
    )
    visual_vote = next(
        vote for vote in payload["agent_votes"]
        if vote.get("agent_key") == "visual_search"
    )
    assert ag3["counted_in_consensus"] is True
    assert ag3["vote_created"] is True
    assert visual_vote["counted_in_consensus"] is True
    assert visual_vote["vote_created"] is True


def test_ag3_raw_lens_articles_serialize_without_contaminating_visible_text():
    record = _raw_record()
    record.agent_results[2]["data"] = {
        "agent_key": "visual_search",
        "status": "Completed",
        "denomination": "100000 VND",
        "country": "Vietnam",
        "currency": "VND",
        "matched": True,
        "counted": True,
        "vote_eligible": False,
        "not_counted_in_consensus": True,
        "raw_lens_result_count": 5,
        "ag3_verification_summary": {
            "vote_eligible": False,
            "counted_in_consensus": False,
            "not_counted_in_consensus": True,
            "raw_lens_result_count": 5,
            "partial_evidence_count": 5,
            "disposition_counts": {"partial": 5},
        },
        "visible_text": [{"title": "Tien 100k seri dep"}],
        "evidence": [
            {
                "title": f"Lens article {idx}",
                "url": f"https://example{idx}.com/lens-{idx}",
                "domain": f"example{idx}.com",
                "raw_rank": idx,
                "raw_lens_score": 9 - idx,
                "page_fetch_status": "skipped",
                "source_class": "WEAK_COMMERCIAL",
                "detected_country": "Vietnam",
                "detected_currency": "VND",
                "detected_amounts": [100000],
                "object_type": "banknote",
                "complete_identity": True,
                "independent_domain": False,
                "evidence_disposition": "partial",
                "evidence_reason": "weak_source_or_skipped_page_text",
                "selected_for_ag3_internal_vote": False,
            }
            for idx in range(1, 6)
        ],
    }
    ag3_data = record.agent_results[2]["data"]
    ag3_data["evidence"][0].pop("title")
    ag3_data["evidence"][0]["page_title"] = "Lens article from page title"
    ag3_summary = ag3_data["ag3_verification_summary"]
    ag3_summary.update({
        "candidate_sources": ag3_data["evidence"][:3],
        "selected_voting_sources": ag3_data["evidence"][:3],
        "selected_source_count": 3,
        "majority_achieved": 3,
        "agreement_pattern": "3/3",
        "vote_eligible": True,
    })
    ag3_data["vote_eligible"] = True

    payload = serialize_user_result(record)
    ag3 = payload["agents"]["visual_search"]
    lens_items = payload["evidence"]["lens_evidence"]

    assert ag3["vote_eligible"] is False
    assert ag3["counted"] is False
    assert ag3["matched"] is False
    assert ag3["selected_source_count"] == 0
    assert ag3["majority_achieved"] == 0
    assert ag3.get("agreement_pattern") is None
    assert ag3["vote_created"] is False
    assert len(ag3["ag3_verification_summary"]["raw_articles"]) == 5
    assert len(ag3["ag3_verification_summary"]["candidate_sources"]) == 3
    assert ag3["ag3_verification_summary"]["selected_voting_sources"] == []
    assert ag3["ag3_verification_summary"]["selected_source_count"] == 0
    assert ag3["ag3_verification_summary"]["agreement_pattern"] is None
    assert ag3["ag3_verification_summary"]["candidate_sources"][0]["title"] == "Lens article from page title"
    assert "Tien 100k seri dep" not in payload["evidence"]["visible_text"]
    assert len(lens_items) == 5
    assert lens_items[0]["final_disposition"] == "partial"
    assert lens_items[0]["final_reason"] == "weak_source_or_skipped_page_text"
    assert lens_items[0]["page_fetch_status"] == "skipped"
    assert payload["consensus"]["valid_vote_count"] == 2
    assert payload["consensus"]["matched_agents_keys"] == ["ml_dl", "llm_api"]
    assert payload["consensus"]["winner_key"] == ["vietnam", "VND", 500000]


def test_user_result_exposes_public_crop_evidence_and_omits_missing_billing():
    record = SimpleNamespace(
        id="usd-result",
        status="completed",
        uploaded_image_url="https://cdn.example/usd.jpg",
        final_result={
            "status": "completed",
            "final_denomination": 1,
            "currency": "USD",
            "country": "United States",
            "detected_objects": [
                {
                    "object_index": 1,
                    "bbox": [10, 20, 310, 180],
                    "crop_checker": {
                        "action": "ACCEPT",
                        "banknote_score": 0.94,
                        "document_score": 0.03,
                        "agent_eligible": True,
                        "selected_box_reason": "best banknote-like box",
                    },
                    "public_evidence": {
                        "visible_text": ["ONE DOLLAR"],
                        "key_features": ["George Washington portrait"],
                        "lens_evidence": [
                            {"title": "US one dollar bill", "url": "https://example.com/usd?token=secret"}
                        ],
                    },
                }
            ],
        },
        agent_results=[],
    )

    payload = serialize_user_result(record)

    assert payload["summary"]["denomination"] == "1"
    assert payload["summary"]["currency"] == "USD"
    assert payload["crop"]["action"] == "ACCEPT"
    assert payload["crop"]["agent_eligible"] is True
    assert payload["crop"]["banknote_score"] == 0.94
    assert payload["evidence"]["visible_text"] == ["ONE DOLLAR"]
    assert payload["evidence"]["lens_evidence"][0]["url"].endswith("token=REDACTED")
    assert "billing" not in payload
    assert "credits_charged" not in payload
    assert payload["consensus"].get("matched_agents") is None
    assert payload["consensus"].get("total_agents") is None


def test_user_result_supports_single_multi_partial_no_banknote_invalid_and_old_records():
    cases = [
        _raw_record(),
        _raw_record(
            final_overrides={"mode": "multi_object", "total_objects": 2},
            detected_objects=[
                {"summary": {"denomination": "500000 VND", "country": "Vietnam", "confidence": 0.9}},
                {"summary": {"denomination": "100000 VND", "country": "Vietnam", "confidence": 0.8}},
            ],
        ),
        _raw_record(status="completed_partial", final_overrides={"partial": True}),
        _raw_record(status="no_banknote_detected", final_overrides={"detected_count": 0}),
        _raw_record(status="needs_review", final_overrides={"final_denomination": "Needs review"}),
        SimpleNamespace(id="old-1", status="completed", final_result={}, agent_results=[]),
    ]

    for record in cases:
        payload = serialize_user_result(record)
        _assert_no_forbidden_user_keys(payload)
        assert payload["summary"]
        assert "agent_votes" in payload
        assert "detected_objects" in payload


def test_user_task_status_excludes_raw_task_result_and_local_paths():
    task = SimpleNamespace(
        id="task-1",
        status="completed",
        stage="done",
        progress=100,
        input_image_url="https://cdn.example/input.jpg?token=secret",
        input_image_path="C:/private/uploads/input.jpg",
        result_id="result-1",
        result={"final_result": {"provider_trace": {"api_key": "secret"}}},
        error_message=None,
        created_at="2026-07-29T00:00:00Z",
        updated_at="2026-07-29T00:00:01Z",
        finished_at="2026-07-29T00:00:02Z",
    )
    public_result = serialize_user_result(_raw_record())
    payload = serialize_user_task(task, public_result=public_result)

    _assert_no_forbidden_user_keys(payload)
    assert payload["task_id"] == "task-1"
    assert payload["result"]["result_id"] == "result-1"
    assert "input_image_path" not in payload
    assert payload["input_image_url"].endswith("token=REDACTED")


def test_light_task_status_is_small_terminal_and_result_free():
    task = SimpleNamespace(
        id="task-1",
        status="completed",
        stage="done",
        progress=100,
        input_image_url="https://cdn.example/input.jpg?token=secret",
        input_image_path="C:/private/uploads/input.jpg",
        result_id="result-1",
        result={"final_result": {"provider_trace": {"api_key": "secret"}}},
        agent_results=[{"agent": "agent_1_openai", "data": {"prompt": "raw"}}],
        error_message=None,
        created_at="2026-07-29T00:00:00Z",
        updated_at="2026-07-29T00:00:01Z",
        finished_at="2026-07-29T00:00:02Z",
    )

    payload = serialize_task_light_status(task)

    assert payload == {
        "task_id": "task-1",
        "status": "completed",
        "stage": "done",
        "progress": 100,
        "result_id": "result-1",
        "terminal": True,
        "cancel_requested": False,
        "updated_at": "2026-07-29T00:00:01Z",
        "finished_at": "2026-07-29T00:00:02Z",
        "retry_after_ms": 1000,
    }
    encoded = json.dumps(payload, default=str)
    assert "final_result" not in encoded
    assert "agent_results" not in encoded
    assert "input_image_path" not in encoded


def test_light_task_status_sanitizes_failed_error_and_clamps_retry():
    task = SimpleNamespace(
        id="task-2",
        status="failed",
        stage="failed",
        progress=999,
        result_id=None,
        error_message='Traceback (most recent call last): File "C:/secret/app.py"',
        updated_at=None,
        finished_at="2026-07-29T00:00:02Z",
    )

    payload = serialize_task_light_status(task, retry_after_ms=50)

    assert payload["progress"] == 100
    assert payload["retry_after_ms"] == 1000
    assert payload["terminal"] is True
    assert payload["public_error"] == "Recognition failed. Please try again."
    assert "result" not in payload


def test_light_task_status_no_banknote_and_cancelled_are_terminal():
    no_banknote_task = SimpleNamespace(
        id="task-no-note",
        status="no_banknote_detected",
        stage="no_banknote_detected",
        progress=100,
        result_id="result-no-note",
        error_message=None,
        cancel_requested=False,
        updated_at=None,
        finished_at="2026-07-29T00:00:02Z",
    )
    cancelled_task = SimpleNamespace(
        id="task-cancelled",
        status="cancelled",
        stage="cancelled",
        progress=100,
        result_id=None,
        error_message="Recognition task was cancelled before completion.",
        cancel_requested=True,
        cancel_requested_at="2026-07-29T00:00:01Z",
        cancelled_at="2026-07-29T00:00:02Z",
        updated_at=None,
        finished_at="2026-07-29T00:00:02Z",
    )

    no_banknote_payload = serialize_task_light_status(no_banknote_task)
    cancelled_payload = serialize_task_light_status(cancelled_task)

    assert no_banknote_payload["terminal"] is True
    assert no_banknote_payload["status"] == "no_banknote_detected"
    assert no_banknote_payload["result_id"] == "result-no-note"
    assert "result" not in no_banknote_payload

    assert cancelled_payload["terminal"] is True
    assert cancelled_payload["status"] == "cancelled"
    assert cancelled_payload["cancel_requested"] is True
    assert cancelled_payload["public_error"] == "Recognition stopped."
    assert "result" not in cancelled_payload


def test_admin_diagnostics_keeps_billing_tokens_but_redacts_secrets_and_paths():
    record = _raw_record()
    task = SimpleNamespace(
        id="task-1",
        user_id="user-1",
        status="completed",
        stage="done",
        progress=100,
        input_image_url="https://cdn.example/task.jpg?access_token=secret",
        result_id="result-1",
        error_message=None,
        created_at=None,
        updated_at=None,
        finished_at=None,
    )
    payload = serialize_admin_diagnostics(record, task)

    assert payload["result"]["final_result"]["provider_trace"]["api_key"] == "REDACTED"
    assert payload["billing"]["token_usage"] == {"input_tokens": 100, "output_tokens": 50}
    assert payload["billing"]["system_tokens_charged"] == 1
    assert payload["billing"]["balance_before"] == 10
    assert payload["diagnostics"]["provider_traces"]
    encoded = json.dumps(payload, default=str)
    assert "secret-provider-key" not in encoded
    assert "C:/private/uploads/scan.jpg" not in encoded


def test_admin_diagnostics_redacts_headers_cookies_html_and_tracebacks():
    record = _raw_record(
        final_overrides={
            "headers": {"Authorization": "Bearer raw-secret-token"},
            "cookies": "sessionid=raw-secret-cookie",
            "raw_html": "<html><body>raw provider page</body></html>",
            "traceback": 'Traceback (most recent call last): File "C:/secret/app.py"',
        }
    )
    payload = serialize_admin_diagnostics(record, None)

    encoded = json.dumps(payload, default=str)
    assert "raw-secret-token" not in encoded
    assert "raw-secret-cookie" not in encoded
    assert "raw provider page" not in encoded
    assert "Traceback (most recent call last)" not in encoded
    assert "C:/secret/app.py" not in encoded
    assert payload["result"]["final_result"]["headers"] == "REDACTED"
    assert payload["result"]["final_result"]["cookies"] == "REDACTED"
    assert payload["result"]["final_result"]["raw_html"] == "REDACTED"
    assert payload["result"]["final_result"]["traceback"] == "REDACTED"


def test_admin_result_summary_excludes_heavy_payload_and_keeps_table_fields():
    payload = serialize_admin_result_summary(_raw_record())

    assert payload["id"] == "result-1"
    assert payload["result_id"] == "result-1"
    assert payload["task_id"] == "task-1"
    assert payload["user_id"] == "user-1"
    assert payload["status"] == "completed"
    assert payload["denomination"] == "500000 VND"
    assert payload["country"] == "Vietnam"
    assert payload["currency"] == "VND"
    assert payload["confidence"] == 0.9346
    assert payload["matched_agents"] == 2
    assert payload["consensus"] == {
        "status": "completed",
        "matched_agents": 2,
        "total_agents": 3,
    }
    assert payload["image_url"].endswith("api_key=REDACTED")

    encoded = json.dumps(payload, default=str)
    for forbidden in (
        "final_result",
        "agent_results",
        "detected_objects",
        "provider_trace",
        "promotion_trace",
        "consensus_trace",
        "token_usage",
        "balance_before",
        "balance_after",
        "input_image_path",
        "prompt",
        "debate_log",
    ):
        assert forbidden not in encoded
    assert "secret-provider-key" not in encoded


def test_payload_comparison_user_payload_is_smaller_and_required_fields_remain():
    record = _raw_record()
    raw_payload = {
        "final_result": record.final_result,
        "agent_results": record.agent_results,
        "token_usage": record.token_usage,
        "balance_before": record.balance_before,
        "balance_after": record.balance_after,
        "input_image_path": record.input_image_path,
    }
    user_payload = serialize_user_result(record)

    encoded_user = json.dumps(user_payload, default=str)
    encoded_raw = json.dumps(raw_payload, default=str)

    assert "secret-provider-key" in encoded_raw
    assert "secret-provider-key" not in encoded_user
    assert "final_result" not in encoded_user
    assert "agent_results" not in encoded_user
    assert "token_usage" not in encoded_user
    assert user_payload["summary"]
    assert user_payload["agent_votes"]
    assert user_payload["consensus"]
    assert user_payload["resultId"] == "result-1"
    assert user_payload["agentVotes"] == user_payload["agent_votes"]


def test_admin_diagnostics_route_uses_admin_guard():
    router_path = Path(__file__).resolve().parents[1] / "app" / "routers" / "admin_router.py"
    text = router_path.read_text(encoding="utf-8")

    assert '@router.get("/results/{id}/diagnostics"' in text
    assert "current_user: User = Depends(admin_user)" in text
    assert "require_admin" in text


def test_user_result_and_task_routes_keep_owner_guards():
    service_path = Path(__file__).resolve().parents[1] / "app" / "services" / "recognition_service.py"
    router_path = Path(__file__).resolve().parents[1] / "app" / "routers" / "recognition_router.py"
    service_text = service_path.read_text(encoding="utf-8")
    router_text = router_path.read_text(encoding="utf-8")

    assert "if result.user_id != str(user_id):" in service_text
    assert "if task.user_id != str(user.id)" in service_text
    assert "status_code=403" in service_text
    assert "current_user: User = Depends(get_current_user)" in router_text


def test_light_task_status_route_is_before_legacy_task_route():
    router_path = Path(__file__).resolve().parents[1] / "app" / "routers" / "recognition_router.py"
    router_text = router_path.read_text(encoding="utf-8")

    light_route = '@router.get("/tasks/{task_id}/status")'
    legacy_route = '@router.get("/tasks/{task_id}")'

    assert light_route in router_text
    assert router_text.index(light_route) < router_text.index(legacy_route)
    assert "current_user: User = Depends(get_current_user)" in router_text


def test_processing_uses_light_status_polling_and_public_result_fetch():
    client_root = Path(__file__).resolve().parents[2] / "client" / "src"
    processing_text = (
        client_root / "pages" / "user" / "Processing.jsx"
    ).read_text(encoding="utf-8")
    service_text = (client_root / "services" / "recognitionService.js").read_text(
        encoding="utf-8"
    )

    assert "getRecognitionTaskLightStatus" in processing_text
    assert "getRecognitionTaskStatus" not in processing_text
    assert "cancelRecognitionTask" in processing_text
    assert "TERMINAL_CANCELLED_STATUSES" in processing_text
    assert "cancelState === \"cancelled\"" in processing_text
    assert "getRecognitionResult(resultId)" in processing_text
    assert "resultFetchStartedRef" in processing_text
    assert "pollInFlightRef" in processing_text
    assert "setInterval" not in processing_text
    assert "setTimeout(() =>" in processing_text
    assert "/recognition/tasks/${taskId}/status" in service_text
    assert "/recognition/tasks/${taskId}/cancel" in service_text


def test_cancel_route_static_contract_and_owner_guard():
    service_path = Path(__file__).resolve().parents[1] / "app" / "services" / "recognition_service.py"
    router_path = Path(__file__).resolve().parents[1] / "app" / "routers" / "recognition_router.py"
    controller_path = Path(__file__).resolve().parents[1] / "app" / "controllers" / "recognition_controller.py"
    model_path = Path(__file__).resolve().parents[1] / "app" / "models" / "recognition_task_model.py"

    service_text = service_path.read_text(encoding="utf-8")
    router_text = router_path.read_text(encoding="utf-8")
    controller_text = controller_path.read_text(encoding="utf-8")
    model_text = model_path.read_text(encoding="utf-8")

    assert '@router.post("/tasks/{task_id}/cancel")' in router_text
    assert "current_user: User = Depends(get_current_user)" in router_text
    assert "cancel_task(current_user, task_id)" in router_text
    assert "cancel_task(user: User, task_id: str)" in controller_text
    assert "cancel_recognition_task(user, task_id)" in controller_text
    assert "async def cancel_recognition_task" in service_text
    assert "if task.user_id != str(user.id)" in service_text
    assert "status_code=403" in service_text
    assert "cancel_requested: bool = False" in model_text
    assert "cancel_requested_at" in model_text
    assert "cancelled_at" in model_text
    assert "RecognitionTaskCancelled" in service_text
    assert "check_task_cancelled(task)" in service_text


def test_phase3a_admin_results_route_and_list_navigation_contract():
    client_root = Path(__file__).resolve().parents[2] / "client" / "src"
    routes_text = (client_root / "routes" / "AppRoutes.jsx").read_text(encoding="utf-8")
    list_text = (
        client_root / "pages" / "admin" / "ResultsManager.jsx"
    ).read_text(encoding="utf-8")
    service_text = (client_root / "services" / "adminService.js").read_text(
        encoding="utf-8"
    )

    assert 'import ResultDiagnostics from "../pages/admin/ResultDiagnostics.jsx";' in routes_text
    assert '<Route path="/admin/results/:id" element={<ResultDiagnostics />} />' in routes_text
    assert "getAdminResultDiagnostics" not in list_text
    assert "navigate(`/admin/results/${id}`" in list_text
    assert "resultSummary: result" in list_text
    assert "from: `${location.pathname}${location.search}`" in list_text
    assert "setSelectedScan" not in list_text
    assert "selectedScan" not in list_text
    assert "dangerouslySetInnerHTML" not in list_text
    assert "JSON.stringify" not in list_text
    assert "Copy JSON" not in list_text
    assert "Download JSON" not in list_text
    assert "getAdminResultDiagnostics = async (id, options = {})" in service_text
    assert 'api.get(`/admin/results/${id}/diagnostics`, options)' in service_text


def test_phase3a_detail_shell_fetches_lazily_without_raw_json_tools():
    client_root = Path(__file__).resolve().parents[2] / "client" / "src"
    detail_text = (
        client_root / "pages" / "admin" / "ResultDiagnostics.jsx"
    ).read_text(encoding="utf-8")
    tabs_text = (
        client_root / "components" / "admin" / "results" / "DiagnosticsTabs.jsx"
    ).read_text(encoding="utf-8")
    admin_service_text = (
        Path(__file__).resolve().parents[1] / "app" / "services" / "admin_service.py"
    ).read_text(encoding="utf-8")

    assert "new AbortController()" in detail_text
    assert "requestInFlightRef" in detail_text
    assert "getAdminResultDiagnostics(id, { signal: controller.signal })" in detail_text
    assert 'role="alert"' in detail_text
    assert 'aria-live="polite"' in detail_text
    assert 'role="tablist"' in tabs_text
    assert 'role="tabpanel"' in detail_text
    assert 'id="objects-panel"' in detail_text
    assert 'id="consensus-panel"' in detail_text
    assert 'id="evidence-panel"' in detail_text
    assert 'id="billing-panel"' in detail_text
    assert 'id="timing-panel"' in detail_text
    assert 'id="raw-panel"' in detail_text
    assert "Raw JSON" in detail_text
    assert "JsonTree" in detail_text
    assert "Copy JSON" in detail_text
    assert "Download JSON" in detail_text
    for forbidden in (
        "dangerouslySetInnerHTML",
        "localStorage",
        "sessionStorage",
    ):
        assert forbidden not in detail_text

    assert "serialize_admin_result_summary" in admin_service_text
    assert "return [serialize_admin_result_summary(result) for result in results]" in admin_service_text
