import asyncio
import json
import os
import sys
import unittest.mock as mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ag3_test_service import run_ag3_test, _mask_secret

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  PASS: {name}")
        PASS += 1
    else:
        print(f"  FAIL: {name}" + (f" -- {detail}" if detail else ""))
        FAIL += 1

# Mock image bytes
mock_image = b"fake_image_bytes"

async def mock_upload_to_public_url(self, image_bytes):
    return "https://res.cloudinary.com/test/image/upload/fake.jpg"

def mock_serpapi_call(*args, **kwargs):
    class MockResponse:
        status_code = 200
        def json(self):
            return {
                "visual_matches": [
                    {
                        "title": "Vietnam 1000 Dong",
                        "snippet": "Banknote from Vietnam",
                        "link": "https://test.com/vn1000",
                        "source": "Test Banknotes",
                        "thumbnail": "..."
                    }
                ]
            }
    return MockResponse()

def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

print("\n=== Test 1: Secrets masking ===")
check("mask None", _mask_secret(None) == "not_set")
check("mask short", _mask_secret("123") == "****")
check("mask long", _mask_secret("abcdefgh1234") == "****1234")

print("\n=== Test 2: Mode full_ag3 ===")
with mock.patch("app.agents.agent_3_lens.Agent3Lens.upload_to_imgbb", new=mock_upload_to_public_url), \
     mock.patch("requests.get", new=mock_serpapi_call), \
     mock.patch("app.services.ag3_test_service.settings.SERPAPI_KEY", "fake_key_1234"):
    
    opts = {
        "mode": "full_ag3",
        "provider": "serpapi",
        "use_original_image": True,
        "enable_groq_evidence_reader": True,
        "groq_evidence_reader_mode": "always"
    }
    
    # Mock Groq Reader since we don't want to call real Groq
    with mock.patch("app.services.ag3_test_service.read_evidence_with_groq") as mock_groq:
        mock_groq.return_value = {
            "status": "completed",
            "support_count": 1,
            "conflict_count": 0,
            "proposed_identity": {"country": "Vietnam", "currency_code": "VND", "denomination": "1000"},
            "evidence_classification": []
        }
        
        res = run_async(run_ag3_test(opts, mock_image))
        print("DEBUG FULL_AG3:", json.dumps(res, indent=2))
        
        check("Full AG3 returns ok", res["ok"])
        check("Flow trace exists", len(res["flow_trace"]) > 0)
        check("Image debug has url", res["image_debug"]["image_url_available"])
        check("SerpAPI was attempted", res["serpapi_debug"]["attempted"])
        check("Evidence harvested", res["evidence_harvest"]["count"] > 0)
        check("Groq was called", res["groq_evidence_reader"]["called"])
        check("Reconciliation ran", res["reconciliation"]["agreement_level"] != "none")

print("\n=== Test 3: Mode serpapi_only ===")
with mock.patch("app.agents.agent_3_lens.Agent3Lens.upload_to_imgbb", new=mock_upload_to_public_url), \
     mock.patch("requests.get", new=mock_serpapi_call), \
     mock.patch("app.services.ag3_test_service.settings.SERPAPI_KEY", "fake_key_1234"):
    
    opts = {"mode": "serpapi_only"}
    res = run_async(run_ag3_test(opts, mock_image))
    
    check("Serpapi only ok", res["ok"])
    check("SerpAPI attempted", res["serpapi_debug"]["attempted"])
    check("Groq not called", res["groq_evidence_reader"]["called"] == False)
    check("Validator skipped", res["validator"]["attempted"] == False)

print("\n=== Test 4: Mode selenium_only disabled ===")
opts = {"mode": "selenium_only", "enable_selenium": False}
res = run_async(run_ag3_test(opts, mock_image))
check("Selenium attempted false", res["selenium_debug"]["attempted"] == False)
check("Skipped reason selenium_disabled", res["selenium_debug"]["skipped_reason"] == "selenium_disabled")

print("\n=== Test 5: Mode evidence_only ===")
with mock.patch("app.agents.agent_3_lens.Agent3Lens.upload_to_imgbb", new=mock_upload_to_public_url), \
     mock.patch("requests.get", new=mock_serpapi_call), \
     mock.patch("app.services.ag3_test_service.settings.SERPAPI_KEY", "fake_key_1234"):
    
    opts = {"mode": "evidence_only", "use_original_image": True}
    res = run_async(run_ag3_test(opts, mock_image))
    
    check("Evidence harvested", res["evidence_harvest"]["count"] > 0)
    check("Deterministic parser ran", res["deterministic_parser"]["status"] != "Failed")
    check("Groq not called", res["groq_evidence_reader"]["called"] == False)

print("\n=== Test 6: Mode groq_reader_only with manual JSON ===")
opts = {
    "mode": "groq_reader_only",
    "enable_groq_evidence_reader": True,
    "manual_evidence_json": json.dumps([{"title": "Test 1000 VND"}])
}
with mock.patch("app.services.ag3_test_service.read_evidence_with_groq") as mock_groq:
    mock_groq.return_value = {"status": "completed", "support_count": 1}
    res = run_async(run_ag3_test(opts, None))
    
    check("Groq called with manual JSON", res["groq_evidence_reader"]["called"])
    check("Serpapi skipped", res["serpapi_debug"]["attempted"] == False)
    check("Validator skipped", res["validator"]["attempted"] == False)

print("\n=== Test 7: SerpAPI timeout handling ===")
import requests
def mock_serpapi_timeout(*args, **kwargs):
    raise requests.exceptions.Timeout("timeout")

with mock.patch("app.agents.agent_3_lens.Agent3Lens.upload_to_imgbb", new=mock_upload_to_public_url), \
     mock.patch("requests.get", side_effect=mock_serpapi_timeout), \
     mock.patch("app.services.ag3_test_service.settings.SERPAPI_KEY", "fake"):
    
    opts = {"mode": "full_ag3"}
    res = run_async(run_ag3_test(opts, mock_image))
    
    check("No crash on timeout", res["ok"])
    check("SerpAPI failed due to exception", res["serpapi_debug"]["error_type"] == "exception")
    check("Ag3 Final is Partial", res["ag3_final"]["status"] == "Partial")

print("\n=== Test 8: Return raw response false ===")
with mock.patch("app.agents.agent_3_lens.Agent3Lens.upload_to_imgbb", new=mock_upload_to_public_url), \
     mock.patch("requests.get", new=mock_serpapi_call), \
     mock.patch("app.services.ag3_test_service.settings.SERPAPI_KEY", "fake_key_1234"):
    
    opts = {"mode": "serpapi_only", "return_raw_response": False}
    res = run_async(run_ag3_test(opts, mock_image))
    
    check("Raw is truncated", res["raw"]["serpapi"].get("truncated") == True)

print(f"\n{'='*60}")
print(f"TOTAL: {PASS+FAIL} | PASS: {PASS} | FAIL: {FAIL}")
if FAIL == 0:
    print("ALL TESTS PASSED")
else:
    sys.exit(1)
