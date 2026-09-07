import sys
import json
import asyncio
from TikTokLive import TikTokLiveClient

async def check_live(username):
    client = TikTokLiveClient(unique_id=username)
    try:
        # connect() will raise an error or we can check room_id after a short wait
        # But a better way with this lib is usually checking the room info if available
        # or just attempting a brief connection.
        # However, the most reliable "check" without overhead is sometimes just 
        # using the internal room_id check if we can.
        
        is_live = await client.is_live()
        print(json.dumps({"is_live": is_live}))
    except Exception as e:
        print(json.dumps({"is_live": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"is_live": False, "error": "No username provided"}))
    else:
        username = sys.argv[1]
        asyncio.run(check_live(username))
