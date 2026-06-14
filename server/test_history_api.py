import asyncio
from fastapi.testclient import TestClient
from main import app
from app.core.database import init_db
from app.models.user_model import User

async def main():
    await init_db()
    
    # Get a user from DB
    user = await User.find_one()
    if not user:
        print("No user found in DB.")
        return
        
    print(f"Testing with user: {user.email}")
    
    client = TestClient(app)
    
    from app.core.security import create_access_token
    # auth_router usually passes user.id as subject
    token = create_access_token(subject=str(user.id))
    
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/users/me/history", headers=headers)
    
    print(f"STATUS: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Returned {len(data)} items.")
        if len(data) > 0:
            import json
            print("=== FIRST ITEM ===")
            print(json.dumps(data[0], indent=2)[:500] + "...")
    else:
        print(response.text)

asyncio.run(main())
