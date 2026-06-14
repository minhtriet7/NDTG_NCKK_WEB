import asyncio
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.agents.agent_aggregator import run_aggregator

async def test_mix_022():
    json_1 = json.dumps([{"quoc_gia": "Không xác định", "menh_gia": "Không xác định", "status": "Failed"}])
    json_2 = json.dumps([{"quoc_gia": "Myanmar", "menh_gia": "500 MMK", "status": "Completed"}])
    json_3 = json.dumps([{"quoc_gia": "Myanmar", "menh_gia": "500 Kyats", "status": "Completed"}])

    print("Running MIX_022 test with new aggregator...")
    result = await run_aggregator(json_1, json_2, json_3, is_final_attempt=True)
    
    print("\nResult:")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    
    if result.get("status") == "Completed" and result.get("menh_gia") == "500 MMK" and result.get("quoc_gia") == "Myanmar":
        print("\n[PASS] MIX_022 test passed!")
    else:
        print("\n[FAIL] MIX_022 test failed!")

if __name__ == "__main__":
    asyncio.run(test_mix_022())
