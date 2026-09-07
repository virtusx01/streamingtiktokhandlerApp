import httpx
import asyncio
import time

BASE_URL = "http://localhost:3005"

async def send_event(endpoint, payload):
    url = f"{BASE_URL}/api/{endpoint}"
    print(f"--- Sending {endpoint} to {url} ---")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, timeout=5.0)
            print(f"Result: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"Error: {e}")

async def main():
    # 1. Simulate Share Event
    await send_event("share-event", {
        "nickname": "Zuper Sharer",
        "username": "zuper_sharer",
        "eventId": f"share_{time.time()}"
    })
    
    await asyncio.sleep(2)
    
    # 2. Simulate Follow Event
    await send_event("follow-event", {
        "nickname": "New Follower",
        "username": "new_follower",
        "eventId": f"follow_{time.time()}"
    })
    
    await asyncio.sleep(2)
    
    # 3. Simulate Like Event (Milestone)
    await send_event("like-event", {
        "nickname": "Liker Pro",
        "username": "liker_pro",
        "likeCount": 1000,
        "totalLikes": 5000,
        "eventId": f"like_{time.time()}"
    })

if __name__ == "__main__":
    asyncio.run(main())
