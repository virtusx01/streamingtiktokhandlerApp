import httpx
import json
import os
import sys
import asyncio

import sqlite3

# Define database path
DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'app.db')
GIFT_EVENT_URL = "http://localhost:3005/api/gift-event"
COMMENT_EVENT_URL = "http://localhost:3005/api/comment-event"

def load_config():
    config = {"rewards": {}}
    if not os.path.exists(DB_PATH):
        return config

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Load rewards
        cursor.execute("SELECT name, actions FROM rewards")
        for name, actions_json in cursor.fetchall():
            try:
                config["rewards"][name] = {"actions": json.loads(actions_json)}
            except:
                config["rewards"][name] = {"actions": []}
                
        conn.close()
        return config
    except Exception as e:
        print(f"--> [Error] Failed to load config from DB: {e}")
        return config

async def simulate_comment(comment_text, username="Viewer_123"):
    payload = {
        "comment": comment_text,
        "username": username
    }
    print(f"[Simulation] Sending comment event to Next.js API...")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(COMMENT_EVENT_URL, json=payload)
            print(f"Response: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"❌ Error: {e}")

async def simulate_gift(gift_name, username="Viewer_123", count=1, msg_id=None):
    config = load_config()
    rewards = config.get("rewards", {})
    
    reward = rewards.get(gift_name)
    if not reward and "rose" in gift_name.lower():
        reward = rewards.get("Rose")

    # Translate gift names to Indonesian
    TRANSLATIONS = {
        "Rose": "Mawar",
        "Tiktok": "Tiktok",
    }
    
    indonesian_gift_name = TRANSLATIONS.get(gift_name, gift_name)
    if not msg_id:
        msg_id = f"sim_{int(time.time())}"

    if reward:
        payload = {
            **reward,
            "giftName": indonesian_gift_name,
            "username": username,
            "eventId": f"gift_{msg_id}_{count}",
            "msgId": msg_id,
            "repeatCount": count,
            "repeatEnd": True
        }
        print(f"[Simulation] Sending {indonesian_gift_name} x{count} event to Next.js API...")
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(GIFT_EVENT_URL, json=payload)
                print(f"Response: {resp.status_code} - {resp.text}")
            except Exception as e:
                print(f"Error: {e}")
    else:
        print(f"No mapping found for {gift_name}")

import time

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "gift"
    
    if action == "comment":
        text = sys.argv[2] if len(sys.argv) > 2 else "Halo semuanya!"
        asyncio.run(simulate_comment(text))
    elif action == "streak":
        gift = sys.argv[2] if len(sys.argv) > 2 else "Rose"
        count = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        msg_id = f"streak_{int(time.time())}"
        
        async def run_streak():
            for i in range(1, count + 1):
                await simulate_gift(gift, count=i, msg_id=msg_id)
                await asyncio.sleep(0.5)
        
        asyncio.run(run_streak())
    else:
        # Default to gift simulation (backward compatibility)
        gift = sys.argv[1] if len(sys.argv) > 1 and action != "gift" else "Rose"
        asyncio.run(simulate_gift(gift))
