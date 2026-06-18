import asyncio
from app.agents.agent_3_lens import Agent3Lens

async def main():
    agent = Agent3Lens()
    agent.upload_to_imgbb = lambda x: "https://picsum.photos/200"
    print("Running Agent 3 SerpApi...")
    res = await agent.run(b"dummy")
    print("Res:", res)

if __name__ == "__main__":
    asyncio.run(main())
