import asyncio
from fastapi.testclient import TestClient
from main import app
from app.core.database import init_db
from app.models.user_model import User

async def main():
    await init_db()
    
    # get user with history
    user = await User.find_one(User.email == "nmt123@gmail.com")
    if not user:
        return
        
    client = TestClient(app)
    from app.core.security import create_access_token
    token = create_access_token(subject=str(user.id))
    
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/users/me/history", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Items: {len(data)}")
        if len(data) > 0:
            import json
            with open("history_response_dump.json", "w", encoding="utf-8") as f:
                json.dump(data[0], f, indent=2, ensure_ascii=False)
            print("Dumped.")

asyncio.run(main())
