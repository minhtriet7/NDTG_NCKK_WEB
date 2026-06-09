import asyncio
import base64
from unittest.mock import patch, MagicMock

# Import the service
from app.services.recognition_service import RecognitionService

async def main():
    print("Starting tests...")
    
    mock_user = MagicMock()
    mock_user.id = 1
    
    image_bytes = b"fake_image_data"
    
    with patch("app.services.recognition_service.detect_banknote_objects") as mock_detect, \
         patch("app.services.recognition_service.upload_image_to_cloudinary") as mock_upload, \
         patch("app.services.recognition_service.run_agent1_yolo") as mock_agent1, \
         patch("app.services.recognition_service.run_agent2_llm") as mock_agent2, \
         patch("app.services.recognition_service.run_agent3_lens") as mock_agent3, \
         patch("app.services.recognition_service.run_aggregator") as mock_aggregator, \
         patch("app.services.recognition_service.TokenBillingService.charge_tokens") as mock_charge, \
         patch("app.services.recognition_service.RecognitionRequest.create") as mock_create_req, \
         patch("app.services.recognition_service.db_session") as mock_db, \
         patch("app.services.recognition_service.RecognitionTask") as mock_task:

        mock_upload.return_value = "http://fake-url.com/image.jpg"
        mock_charge.return_value = (True, 0, 0, 0, 0, 0)
        mock_create_req.return_value = MagicMock(id=1)
        
        print("\n--- Test 1: Crop fallback + no valid vote + Failed (should be no_banknote_detected) ---")
        mock_detect.return_value = [
            {
                "object_index": 1,
                "bbox": [0, 0, 100, 100],
                "crop_bytes": b"fake",
                "crop_base64": "fake",
                "confidence": 0.25,
                "width": 100,
                "height": 100,
                "source": "original_fallback",
                "fallback": True,
                "raw_candidate_count": 0
            }
        ]
        mock_agent1.return_value = {"status": "Failed"}
        mock_agent2.return_value = {"status": "Failed"}
        mock_agent3.return_value = {"status": "Failed"}
        mock_aggregator.return_value = {
            "status": "Failed",
            "valid_votes": [],
            "matched_agents": 0
        }
        
        result = await RecognitionService.run_pipeline(mock_user, image_bytes)
        print("Status:", result["status"])
        print("Final Consensus Status:", result["final_result"]["status"])
        print("Message:", result["final_result"].get("message"))
        print("Crop warning:", result["final_result"].get("crop_warning"))
        
        print("\n--- Test 2: Raw_candidate_count > 5 (warning only) ---")
        mock_detect.return_value = [
            {
                "object_index": i,
                "bbox": [0, 0, 10, 10],
                "crop_bytes": b"fake",
                "crop_base64": "fake",
                "confidence": 0.9,
                "width": 10,
                "height": 10,
                "source": "contour",
                "fallback": False,
                "raw_candidate_count": 10
            } for i in range(1, 6)
        ]
        mock_aggregator.return_value = {
            "status": "Completed",
            "valid_votes": ["YOLO", "LLM"],
            "matched_agents": 2,
            "menh_gia": "500000"
        }
        result = await RecognitionService.run_pipeline(mock_user, image_bytes)
        print("Status:", result["status"])
        print("Too many banknotes detected:", result["final_result"].get("too_many_banknotes_detected"))
        print("Raw candidate count:", result["final_result"].get("raw_candidate_count"))
        print("Crop warning:", result["final_result"].get("crop_warning"))

if __name__ == "__main__":
    asyncio.run(main())
