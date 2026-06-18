import asyncio
import sys
import os
import json
from unittest.mock import patch, MagicMock

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.core.database import init_db
from app.models.user_model import User
from app.services.recognition_service import RecognitionService

class MockAgent:
    def __init__(self, responses):
        self.responses = responses
        self.call_count = 0

    def __call__(self, *args, **kwargs):
        idx = min(self.call_count, len(self.responses) - 1)
        self.call_count += 1
        res = self.responses[idx]
        print(f"   MockAgent called (attempt {self.call_count}): returning summary...")
        if isinstance(res, Exception):
            raise res
        return res

async def run_test_case(case_name, mock_detect_val, agent1_res, agent2_res, agent3_res):
    print(f"\n======================================================================")
    print(f"RUNNING TEST CASE: {case_name}")
    print(f"======================================================================")

    user = await User.find_one()
    if not user:
        user = User(email="test@test.com", hashed_password="123", role="admin", token_balance=100)
        await user.insert()
    else:
        user.token_balance = 100
        await user.save()

    image_bytes = b"fake_image_bytes_for_testing"

    mock_agent1 = MockAgent(agent1_res)
    mock_agent2 = MockAgent(agent2_res)
    mock_agent3 = MockAgent(agent3_res)

    with patch("app.services.recognition_service.detect_banknote_objects") as mock_detect, \
         patch("app.services.recognition_service.upload_image_to_cloudinary") as mock_upload, \
         patch("app.services.recognition_service.run_agent1_openai", side_effect=mock_agent1), \
         patch("app.services.recognition_service.run_agent2_llm", side_effect=mock_agent2), \
         patch("app.services.recognition_service.run_agent3_lens", side_effect=mock_agent3):

        mock_detect.return_value = mock_detect_val
        mock_upload.return_value = "https://mocked-cloudinary.com/test_image.jpg"

        result = await RecognitionService.run_pipeline(user, image_bytes, task=None, debug_mode=False)

        print("\n--- TEST CASE RESULTS ---")
        print("Pipeline Status:", result.get("status"))
        
        final_result = result.get("final_result", {})
        print("Consensus Status:", final_result.get("status"))
        print("Consensus Pattern:", final_result.get("consensus_pattern"))
        print("Attempts Used:", final_result.get("attempts_used"))
        print("Max Attempts:", final_result.get("max_attempts"))
        print("Detected Count:", final_result.get("detected_count"))
        print("Require Rerun:", final_result.get("require_rerun"))
        print("Referee View:", final_result.get("quan_diem_trong_tai"))
        
        consensus_trace = []
        if "detected_objects" in final_result and final_result["detected_objects"]:
            consensus_trace = final_result["detected_objects"][0].get("consensus_trace", [])
        elif "consensus_trace" in final_result:
            consensus_trace = final_result["consensus_trace"]
            
        print("Consensus Trace:")
        print(json.dumps(consensus_trace, default=str, ensure_ascii=False, indent=2))
        
        return result, final_result, consensus_trace

async def main():
    await init_db()

    # ----------------------------------------------------
    # Case A: 2/3 immediate consensus (Completed)
    # ----------------------------------------------------
    detect_a = [{
        "object_index": 1,
        "bbox": [10, 10, 100, 50],
        "crop_bytes": b"crop_a",
        "crop_base64": "crop_a_b64",
        "confidence": 0.95,
        "width": 100,
        "height": 50,
        "source": "yolo",
        "fallback": False
    }]
    agent1_a = [json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.95}], ensure_ascii=False)]
    agent2_a = [json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.92}], ensure_ascii=False)]
    agent3_a = [json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.90}], ensure_ascii=False)]
    
    await run_test_case("Case A: 2/3 immediate consensus", detect_a, agent1_a, agent2_a, agent3_a)

    # ----------------------------------------------------
    # Case B: 1-1-1 turning into 2/3 (Retry Success)
    # ----------------------------------------------------
    detect_b = [{
        "object_index": 1,
        "bbox": [10, 10, 100, 50],
        "crop_bytes": b"crop_b",
        "crop_base64": "crop_b_b64",
        "confidence": 0.95,
        "width": 100,
        "height": 50,
        "source": "yolo",
        "fallback": False
    }]
    agent1_b = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "200000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    agent2_b = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "200000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "200000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    agent3_b = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "500000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "500000 VND", "chat_lieu": "Polymer", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    
    await run_test_case("Case B: 1-1-1 turning into 2/3", detect_b, agent1_b, agent2_b, agent3_b)

    # ----------------------------------------------------
    # Case C: 1-1-1 exhausting all 3 attempts (Consensus Failed)
    # ----------------------------------------------------
    detect_c = [{
        "object_index": 1,
        "bbox": [10, 10, 100, 50],
        "crop_bytes": b"crop_c",
        "crop_base64": "crop_c_b64",
        "confidence": 0.95,
        "width": 100,
        "height": 50,
        "source": "yolo",
        "fallback": False
    }]
    agent1_c = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "50000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "20000 VND", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    agent2_c = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "200000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "50000 VND", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    agent3_c = [
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "500000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "200000 VND", "do_tin_cay": 0.9}], ensure_ascii=False),
        json.dumps([{"status": "Completed", "quoc_gia": "Việt Nam", "menh_gia": "100000 VND", "do_tin_cay": 0.9}], ensure_ascii=False)
    ]
    
    await run_test_case("Case C: 1-1-1 exhausting all 3 attempts", detect_c, agent1_c, agent2_c, agent3_c)

    # ----------------------------------------------------
    # Case D: 0/3 due to timeout/API errors (transient)
    # ----------------------------------------------------
    detect_d = [{
        "object_index": 1,
        "bbox": [10, 10, 100, 50],
        "crop_bytes": b"crop_d",
        "crop_base64": "crop_d_b64",
        "confidence": 0.95,
        "width": 100,
        "height": 50,
        "source": "yolo",
        "fallback": False
    }]
    agent1_d = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Gemini API error: timeout after 60s"}], ensure_ascii=False),
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Gemini API error: timeout after 60s"}], ensure_ascii=False)
    ]
    agent2_d = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "OpenAI resource_exhausted rate limit"}], ensure_ascii=False),
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "OpenAI resource_exhausted rate limit"}], ensure_ascii=False)
    ]
    agent3_d = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Lens SerpApi read timed out connection error"}], ensure_ascii=False),
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Lens SerpApi read timed out connection error"}], ensure_ascii=False)
    ]
    
    await run_test_case("Case D: 0/3 due to transient errors", detect_d, agent1_d, agent2_d, agent3_d)

    # ----------------------------------------------------
    # Case E: 0/3 due to zero evidence / background crop
    # ----------------------------------------------------
    detect_e = [{
        "object_index": 1,
        "bbox": None,
        "crop_bytes": b"crop_e",
        "crop_base64": "crop_e_b64",
        "confidence": 0.25,
        "width": 100,
        "height": 50,
        "source": "legacy_cropper",
        "fallback": True
    }]
    agent1_e = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Không tìm thấy đặc điểm tiền giấy"}], ensure_ascii=False)
    ]
    agent2_e = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "Not a banknote, background image"}], ensure_ascii=False)
    ]
    agent3_e = [
        json.dumps([{"status": "Failed", "quoc_gia": "Không xác định", "menh_gia": "Không xác định", "quan_diem": "No evidence found"}], ensure_ascii=False)
    ]
    
    await run_test_case("Case E: 0/3 due to zero evidence / background crop", detect_e, agent1_e, agent2_e, agent3_e)

if __name__ == "__main__":
    asyncio.run(main())
