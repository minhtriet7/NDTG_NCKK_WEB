import asyncio
from app.models.recognition_model import RecognitionRequest
from app.core.database import init_db
from app.services.user_service import serialize_history
import json
from datetime import datetime

class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

async def main():
    await init_db()
    reqs = await RecognitionRequest.find_all().sort("-created_at").limit(5).to_list()
    if not reqs:
        print("No history found in DB.")
        return
    
    for first in reqs:
        serialized = serialize_history(first)
        print("=== SERIALIZED RECORD ===")
        try:
            print(json.dumps(serialized, cls=JSONEncoder, indent=2)[:500] + "\... (truncated)")
        except Exception as e:
            print(f"JSON DUMP ERROR: {e}")
            print(serialized)

asyncio.run(main())
