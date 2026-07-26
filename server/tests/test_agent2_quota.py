import pytest
import asyncio
import json
from unittest.mock import patch, MagicMock
from app.agents.agent_2_llm import run_agent2_llm, _build_error_response
from app.core.config import settings

@pytest.fixture
def mock_gemini():
    with patch("app.agents.agent_2_llm._sync_call_gemini_wrapper") as mock:
        yield mock

@pytest.mark.asyncio
async def test_ag2_503_fallback_success(mock_gemini):
    # Setup chain to have primary and fallback
    settings.AG2_GEMINI_CHAIN_ENABLED = True
    settings.AG2_GEMINI_MODEL_CHAIN = "gemini-2.5-flash,gemini-2.5-flash-lite"
    settings.GOOGLE_API_KEY = "test_key"
    
    # First call: 503 from primary
    # Second call: success from fallback
    mock_gemini.side_effect = [
        Exception("503 UNAVAILABLE: Provider high demand"),
        """
        ```json
        [{
            "quoc_gia": "Việt Nam",
            "ma_tien_te": "VND",
            "menh_gia": "500000 VND",
            "status": "Completed"
        }]
        ```
        """
    ]
    
    result_json = await run_agent2_llm(b"mock_image", context="")
    parsed = json.loads(result_json)[0]
    
    assert parsed["status"] == "Completed"
    assert parsed["fallback_used"] is True
    assert parsed["ag2_final_model"] == "gemini-2.5-flash-lite"
    assert len(parsed["ag2_model_attempts"]) == 2
    assert parsed["ag2_model_attempts"][0]["reason"] == "provider_unavailable"
    assert parsed["ag2_model_attempts"][1]["status"] == "completed"

@pytest.mark.asyncio
async def test_ag2_429_stops_early(mock_gemini):
    settings.AG2_GEMINI_CHAIN_ENABLED = True
    settings.AG2_GEMINI_MODEL_CHAIN = "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.1-flash-lite"
    settings.GOOGLE_API_KEY = "test_key"
    
    # First call: 429 from primary
    # Second call: 429 from fallback
    # Third call should NOT happen (stops early)
    mock_gemini.side_effect = [
        Exception("429 RESOURCE_EXHAUSTED: Quota exceeded"),
        Exception("429 RESOURCE_EXHAUSTED: Quota exceeded"),
    ]
    
    result_json = await run_agent2_llm(b"mock_image", context="")
    parsed = json.loads(result_json)[0]
    
    assert parsed["status"] == "Partial"
    assert parsed["error_type"] == "provider_quota_exhausted"
    assert parsed.get("technical_error") is True
    assert parsed["fallback_used"] is True
    assert len(parsed["ag2_model_attempts"]) == 2
    assert mock_gemini.call_count == 2 # Did not call the 3rd model!
    
@pytest.mark.asyncio
async def test_ag2_invalid_json_retries_same_model(mock_gemini):
    settings.AG2_GEMINI_CHAIN_ENABLED = True
    settings.AG2_GEMINI_MODEL_CHAIN = "gemini-2.5-flash"
    settings.AG2_GEMINI_MAX_ATTEMPTS_PER_MODEL = 2
    settings.GOOGLE_API_KEY = "test_key"
    
    # First call: Invalid JSON
    # Second call: 429 Quota
    mock_gemini.side_effect = [
        "not a json",
        Exception("429 RESOURCE_EXHAUSTED: Quota exceeded"),
    ]
    
    result_json = await run_agent2_llm(b"mock_image", context="")
    parsed = json.loads(result_json)[0]
    
    assert parsed["status"] == "Partial"
    assert parsed["error_type"] == "provider_quota_exhausted"
    assert len(parsed["ag2_model_attempts"]) == 2
    assert parsed["ag2_model_attempts"][0]["reason"] == "invalid_json"
    assert parsed["ag2_model_attempts"][1]["reason"] == "quota_or_rate_limit"
    assert mock_gemini.call_count == 2
