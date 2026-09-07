import sys
import json
import asyncio

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from TikTokLive import TikTokLiveClient

async def check_live(username):
    clean_user = username.strip().lstrip('@')
    if not clean_user:
        print(json.dumps({"is_live": False, "error": "Empty username"}))
        return
    client = TikTokLiveClient(unique_id=clean_user)
    try:
        is_live = await client.is_live()
        print(json.dumps({"is_live": bool(is_live)}))
    except Exception as e:
        print(json.dumps({"is_live": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"is_live": False, "error": "No username provided"}))
    else:
        username = sys.argv[1]
        asyncio.run(check_live(username))
