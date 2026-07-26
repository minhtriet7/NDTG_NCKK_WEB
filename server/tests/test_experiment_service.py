from app.services.experiment_service import (
    FATAL_BATCH_ERROR_TYPES,
    _agent_error_detail,
    _fatal_batch_error_type,
    _mark_nonfatal_ag3_warning,
    _normalize_error_type,
    _resolve_experiment_pipeline_status,
)


def _ag3_error(error_type: str, severity: str = "error"):
    return {
        "stage": "AG3",
        "error_type": error_type,
        "severity": severity,
        "error_message": error_type,
        "provider": "serpapi",
    }


def test_ag3_deadline_with_completed_final_is_warning_and_does_not_stop_batch():
    agent_results = [
        {
            "agent": "Lens",
            "data": {
                "status": "Failed",
                "error_type": "technical_error",
                "technical_error": True,
                "quan_diem": (
                    "Agent 3 deadline exhausted before a safe result was produced."
                ),
                "not_counted_in_consensus": True,
            },
        }
    ]
    detail = _agent_error_detail(
        agent_results,
        "Lens",
        "AG3",
        "lens",
        1000,
    )
    agent_errors = {"ag3": detail["error"]}

    assert detail["error"]["error_type"] == "ag3_timeout"
    assert _mark_nonfatal_ag3_warning(agent_errors, final_completed=True)
    status, has_warning, has_error = _resolve_experiment_pipeline_status(
        final_completed=True,
        valid_agent_count=2,
        agent_errors=agent_errors,
    )

    assert status == "completed_with_warning"
    assert has_warning is True
    assert has_error is False
    assert _fatal_batch_error_type(agent_errors) is None


def test_generic_ag3_provider_error_is_nonfatal_when_final_exists():
    agent_errors = {"ag3": _ag3_error("provider_error")}

    assert _mark_nonfatal_ag3_warning(agent_errors, final_completed=True)
    status, has_warning, has_error = _resolve_experiment_pipeline_status(
        final_completed=True,
        valid_agent_count=2,
        agent_errors=agent_errors,
    )

    assert status == "completed_with_warning"
    assert has_warning is True
    assert has_error is False
    assert "provider_error" not in FATAL_BATCH_ERROR_TYPES
    assert _fatal_batch_error_type(agent_errors) is None


def test_ag3_weak_evidence_is_warning_and_not_fatal():
    agent_errors = {"ag3": _ag3_error("weak_lens_evidence")}

    assert _mark_nonfatal_ag3_warning(agent_errors, final_completed=True)
    assert agent_errors["ag3"]["severity"] == "warning"
    assert _fatal_batch_error_type(agent_errors) is None


def test_auth_config_quota_and_rate_limit_remain_fatal():
    fatal_types = (
        "auth_error",
        "invalid_api_key",
        "missing_api_key",
        "provider_config_error",
        "quota_exceeded",
        "rate_limit",
        "provider_unavailable",
    )
    for error_type in fatal_types:
        agent_errors = {"ag3": _ag3_error(error_type)}
        _mark_nonfatal_ag3_warning(agent_errors, final_completed=True)
        assert agent_errors["ag3"]["severity"] == "error"
        assert _fatal_batch_error_type(agent_errors) == error_type


def test_error_normalizer_distinguishes_deadline_and_provider_error():
    assert (
        _normalize_error_type(
            "Agent 3 deadline exhausted before a safe result was produced.",
            "Failed",
            "technical_error",
        )
        == "timeout"
    )
    assert (
        _normalize_error_type(
            "SerpAPI provider returned an unexpected technical error.",
            "Failed",
            "technical_error",
        )
        == "provider_error"
    )


def test_serpapi_quota_message_maps_to_rate_limit_for_batch_stop_guard():
    error_type = _normalize_error_type(
        "SerpApi HTTP 429: Your account has run out of searches.",
        "Failed",
        "rate_limit",
    )

    assert error_type == "rate_limit"
    assert _fatal_batch_error_type(
        {"ag3": _ag3_error(error_type)}
    ) == "rate_limit"
