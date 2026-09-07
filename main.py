import sys
import io
import asyncio
import subprocess

# Fix Windows console encoding for Unicode emojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from TikTokLive import TikTokLiveClient
from TikTokLive.events import ConnectEvent, GiftEvent, CommentEvent, LikeEvent, JoinEvent, FollowEvent, SubscribeEvent, ShareEvent

import httpx
import time
import os
import json
from collections import deque

# VERSION: 2.7 (Unicode safe + Dynamic Username + Resilient Connection)

# Local cache to prevent redundant event reporting (last 100 IDs)
seen_event_ids = deque(maxlen=100)

# ==========================================
# CONFIGURATION
# ==========================================
def get_username_sync():
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].strip().lstrip('@')
    db_path = os.path.join(os.path.dirname(__file__), 'data', 'app.db')
    if os.path.exists(db_path):
        import sqlite3
        try:
            conn = sqlite3.connect(db_path, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = 'tiktokUsername'")
            row = cursor.fetchone()
            conn.close()
            if row:
                val = json.loads(row[0]) if isinstance(row[0], str) and (row[0].startswith('"') or row[0].startswith('{')) else row[0]
                return str(val).strip().lstrip('@')
        except: pass
    return "onlyvirtus"

TIKTOK_USERNAME = get_username_sync()
BASE_URL = os.environ.get("NEXT_BASE_URL", "http://localhost:3005")

# Helper for "BetterProto" safety
def safe_get(obj, attr, fallback=None):
    try:
        return getattr(obj, attr, fallback)
    except (AttributeError, Exception):
        return fallback

# API Endpoints
GIFT_EVENT_URL = f"{BASE_URL}/api/gift-event"
COMMENT_EVENT_URL = f"{BASE_URL}/api/comment-event"
LIKE_EVENT_URL = f"{BASE_URL}/api/like-event"
JOIN_EVENT_URL = f"{BASE_URL}/api/join-event"
FOLLOW_EVENT_URL = f"{BASE_URL}/api/follow-event"
FAN_EVENT_URL = f"{BASE_URL}/api/fan-event"
SHARE_EVENT_URL = f"{BASE_URL}/api/share-event"

# SHARED SESSION FOR EFFICIENCY
http_client = httpx.AsyncClient(timeout=5.0)

async def safe_post(url, payload, event_type="Event"):
    """Centralized HTTP POST with error handling and logging."""
    try:
        # Increased timeout to 10s for reliability under load
        response = await http_client.post(url, json=payload, timeout=10.0)
        if response.status_code != 200:
            print(f"⚠️ [API Error] {event_type} failed with status {response.status_code}")
        return response
    except httpx.ConnectError:
        print(f"❌ [Connection Error] Backend unreachable at {url}")
    except Exception as e:
        print(f"⚠️ [API Warning] Failed to send {event_type}: {e}")
    return None

client: TikTokLiveClient = TikTokLiveClient(unique_id=TIKTOK_USERNAME)

@client.on(ConnectEvent)
async def on_connect(event: ConnectEvent):
    print("=======================================")
    print(f"📡 STANDBY MODE ACTIVE - Waiting for Gifts...")
    print(f"📡 Connected to @{event.unique_id}")
    print("=======================================")

@client.on(GiftEvent)
async def on_gift(event: GiftEvent):
    try:
        gift_obj = safe_get(event, "gift")
        if not gift_obj: return

        gift_name = safe_get(gift_obj, "name") or safe_get(safe_get(gift_obj, "info"), "name", "Unknown")
        user_obj = safe_get(event, "user")
        nickname = safe_get(user_obj, "nickname", "Viewer")
        unique_id = safe_get(user_obj, "unique_id", "viewer")

        msg_id = safe_get(event, "msg_id") 
        if not msg_id:
            msg = safe_get(event, "msg")
            common = safe_get(msg, "common")
            msg_id = safe_get(common, "msg_id")
            
        group_id = safe_get(gift_obj, "group_id") or safe_get(gift_obj, "combo_id")
        repeat_count = safe_get(gift_obj, "repeat_count", 1)
        repeat_end = safe_get(gift_obj, "repeat_end", 1)
        
        # Determine consistent identifiers for deduplication
        # Prioritize group_id/combo_id for gifts because msg_id can sometimes be unique per update in a streak
        group_id = safe_get(gift_obj, "group_id") or safe_get(gift_obj, "combo_id")
        
        # Create a unique combo identifier (Prioritize group_id for streak consistency)
        combo_identifier = group_id or msg_id or f"{safe_get(gift_obj, 'id')}_{int(time.time())}"
        unique_combo_id = f"{unique_id}_{combo_identifier}"
        
        # Event ID for internal Python deduplication (includes repeat_count to allow streak updates)
        event_id = f"gift_{unique_combo_id}_{repeat_count}"
        
        if event_id in seen_event_ids:
            return
        seen_event_ids.append(event_id)

        # Construct payload
        payload = {
            "giftName": gift_name,
            "nickname": nickname,
            "username": unique_id,
            "repeatCount": repeat_count,
            "repeatEnd": bool(repeat_end),
            "eventId": event_id,
            "msgId": unique_combo_id,
            "giftId": safe_get(gift_obj, "id"),
            "giftIcon": safe_get(safe_get(gift_obj, "image"), "url_list", [None])[0],
            "timestamp": int(time.time() * 1000)
        }
        
        # Notify backend
        await safe_post(GIFT_EVENT_URL, payload, "Gift")
        status = " [Streak End]" if repeat_end else " [Spamming...]"
        print(f"🎁 GIFT DETECTED: '{gift_name}' [x{repeat_count}] from {nickname}{status}")
                
    except Exception as e:
        print(f"![Error Gift] {e}")

def extract_images(event):
    """Safely extract emoji/sticker URLs from event."""
    images = []
    try:
        emojis = safe_get(event, "emojis")
        if emojis:
            for emoji in emojis:
                img_obj = safe_get(emoji, "image")
                url_list = safe_get(img_obj, "url_list")
                if url_list and len(url_list) > 0:
                    images.append(url_list[0])
        
        sticker = safe_get(event, "sticker")
        if sticker:
            img_obj = safe_get(sticker, "image")
            url_list = safe_get(img_obj, "url_list")
            if url_list and len(url_list) > 0:
                images.append(url_list[0])
    except: pass
    return list(set(images))

@client.on(CommentEvent)
async def on_comment(event: CommentEvent):
    try:
        user_obj = safe_get(event, "user")
        nickname = safe_get(user_obj, "nickname", "Viewer")
        unique_id = safe_get(user_obj, "unique_id", "viewer")
        comment_text = safe_get(event, "comment", "")
        images = extract_images(event)
        
        msg_id = safe_get(event, "msg_id") or f"c_{int(time.time() * 1000)}"
        event_id = f"comment_{msg_id}"
        if event_id in seen_event_ids: return
        seen_event_ids.append(event_id)

        payload = {
            "comment": comment_text, "nickname": nickname, "username": unique_id,
            "images": images, "eventId": event_id
        }
        await safe_post(COMMENT_EVENT_URL, payload, "Comment")
    except: pass

@client.on(LikeEvent)
async def on_like(event: LikeEvent):
    try:
        user_obj = safe_get(event, "user")
        nickname = safe_get(user_obj, "nickname", "Viewer")
        unique_id = safe_get(user_obj, "unique_id", "viewer")
        total_likes = safe_get(event, "total", safe_get(event, "like_count", 0))
        if total_likes == 0: return
        
        payload = {
            "likeCount": total_likes, "nickname": nickname, 
            "username": unique_id, "eventId": f"like_{unique_id}_{int(time.time() * 1000)}"
        }
        await safe_post(LIKE_EVENT_URL, payload, "Like")
    except: pass

@client.on(JoinEvent)
async def on_join(event: JoinEvent):
    try:
        user_obj = safe_get(event, "user")
        unique_id = safe_get(user_obj, "unique_id", "viewer")
        event_id = f"join_{unique_id}_{int(time.time() / 30)}" # Throttled Join
        if event_id in seen_event_ids: return
        seen_event_ids.append(event_id)

        payload = {
            "nickname": safe_get(user_obj, "nickname", "Viewer"),
            "username": unique_id, "eventId": event_id
        }
        await safe_post(JOIN_EVENT_URL, payload, "Join")
    except: pass

@client.on(FollowEvent)
async def on_follow(event: FollowEvent):
    try:
        user_obj = safe_get(event, "user")
        unique_id = safe_get(user_obj, "unique_id", "viewer")
        event_id = f"follow_{unique_id}"
        if event_id in seen_event_ids: return
        seen_event_ids.append(event_id)

        payload = {
            "nickname": safe_get(user_obj, "nickname", "Viewer"),
            "username": unique_id, "eventId": event_id
        }
        await safe_post(FOLLOW_EVENT_URL, payload, "Follow")
    except: pass

@client.on(SubscribeEvent)
async def on_subscribe(event: SubscribeEvent):
    try:
        user_obj = safe_get(event, "user")
        payload = {
            "nickname": safe_get(user_obj, "nickname", "Viewer"),
            "username": safe_get(user_obj, "unique_id", "viewer"),
            "eventId": f"fan_{time.time()}"
        }
        await safe_post(FAN_EVENT_URL, payload, "Fan")
    except: pass

@client.on(ShareEvent)
async def on_share(event: ShareEvent):
    try:
        user_obj = safe_get(event, "user")
        unique_id = safe_get(user_obj, "unique_id", "viewer")
        event_id = f"share_{unique_id}_{int(time.time() / 10)}"
        if event_id in seen_event_ids: return
        seen_event_ids.append(event_id)

        payload = {
            "nickname": safe_get(user_obj, "nickname", "Viewer"),
            "username": unique_id, "eventId": event_id
        }
        await safe_post(SHARE_EVENT_URL, payload, "Share")
    except: pass

if __name__ == '__main__':
    print(f"🚀 LISTENER STARTING for @{TIKTOK_USERNAME} (Backend: {BASE_URL})...")
    while True:
        try:
            client.run()
        except KeyboardInterrupt:
            print("🛑 Listener dihentikan.")
            break
        except Exception as e:
            err_name = type(e).__name__
            if "Offline" in err_name or "offline" in str(e).lower():
                print(f"⏳ @{TIKTOK_USERNAME} sedang Offline. Standby mengecek ulang dalam 15 detik...")
                time.sleep(15)
            else:
                print(f"⚠️ Status listener ({err_name}): {e}. Mencoba kembali dalam 10 detik...")
                time.sleep(10)
