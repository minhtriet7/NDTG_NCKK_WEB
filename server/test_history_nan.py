import asyncio
from app.models.recognition_model import RecognitionRequest
from app.core.database import init_db
from app.services.user_service import serialize_history
import json
import math
from datetime import datetime

class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

def check_nan(obj, path=""):
    if isinstance(obj, float):
        if math.isnan(obj):
            print(f"Found NaN at {path}")
        if math.isinf(obj):
            print(f"Found Infinity at {path}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            check_nan(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            check_nan(v, f"{path}[{i}]")

async def main():
    await init_db()
    reqs = await RecognitionRequest.find_all().to_list()
    for req in reqs:
        serialized = serialize_history(req)
        check_nan(serialized, "root")
    print("Checked all history records for NaN/Infinity.")

asyncio.run(main())
