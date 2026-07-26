import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.agents.agent_aggregator import run_aggregator

def test_mix_022():
    json_1 = json.dumps([{"quoc_gia": "Không xác định", "menh_gia": "Không xác định", "status": "Failed"}])
    json_2 = json.dumps([{"quoc_gia": "Myanmar", "menh_gia": "500 MMK", "status": "Completed"}])
    json_3 = json.dumps([{"quoc_gia": "Myanmar", "menh_gia": "500 Kyats", "status": "Completed"}])

    print("Running MIX_022 test with new aggregator...")
    result = asyncio.run(run_aggregator(json_1, json_2, json_3))
    
    print("\nResult:")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    
    assert result.get("status") == "Completed"
    assert result.get("menh_gia") == "500 MMK"
    assert result.get("quoc_gia") == "Myanmar"

if __name__ == "__main__":
    test_mix_022()
