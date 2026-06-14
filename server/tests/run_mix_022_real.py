import asyncio
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.core.database import init_db
from app.models.user_model import User
from app.services.recognition_service import RecognitionService
import json

async def run_real_test():
    await init_db()
    
    # Get the first user and give them tokens
    user = await User.find_one()
    if not user:
        user = User(email="test@test.com", hashed_password="123", role="admin", token_balance=100)
        await user.insert()
    else:
        user.token_balance = max(user.token_balance or 0, 100)
        await user.save()

    image_path = r"D:\LuanVanTotNghiep\A_NDTG_BCNCKH\NCKH_THUCNGHIEM\01_DATASET\real_100\images\MIX_022_MM_MMK_500_front_zoom.jpg"
    
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    print(f"Running pipeline on {image_path}...")
    
    # Use real API logic without task
    result = await RecognitionService.run_pipeline(user, image_bytes, task=None)
    
    print("\n========= RAW RESULT =========")
    print(json.dumps(result, default=str, ensure_ascii=False, indent=2))
    
    print("\n========= FINAL RESULT =========")
    
    # For single_object mode, the dict contains final_result at root level or within an object
    final_result = result.get("final_result", {})
    if not final_result and "detected_objects" in result:
        final_result = result["detected_objects"][0].get("final_result", {})
        
    print("Final Country:", final_result.get("final_country") or final_result.get("quoc_gia"))
    print("Final Denomination:", final_result.get("final_denomination") or final_result.get("menh_gia"))
    print("Matched Agents:", final_result.get("matched_agents"))
    print("Currency Code:", final_result.get("currency_code"))
    print("Status:", final_result.get("status"))

if __name__ == "__main__":
    asyncio.run(run_real_test())
