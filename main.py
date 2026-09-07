import sys
import io
import asyncio
import subprocess
import os
import json
import time
from collections import deque
import httpx

# Fix Windows console encoding and asyncio event loop policy
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent, DisconnectEvent, LiveEndEvent,
    GiftEvent, CommentEvent, LikeEvent, JoinEvent, FollowEvent, SubscribeEvent, ShareEvent
)
from TikTokLive.client.errors import (
    UserOfflineError, UserNotFoundError, InitialCursorMissingError,
    AlreadyConnectedError, WebsocketURLMissingError
)

# VERSION: 3.0 (Robust Standby Loop + Client Factory + Live Status Sync)

seen_event_ids = deque(maxlen=100)

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
        except:
            pass
    return "onlyvirtus"

TIKTOK_USERNAME = get_username_sync()
BASE_URL = os.environ.get("NEXT_BASE_URL", "http://localhost:3005")

# Endpoints
GIFT_EVENT_URL = f"{BASE_URL}/api/gift-event"
COMMENT_EVENT_URL = f"{BASE_URL}/api/comment-event"
LIKE_EVENT_URL = f"{BASE_URL}/api/like-event"
JOIN_EVENT_URL = f"{BASE_URL}/api/join-event"
FOLLOW_EVENT_URL = f"{BASE_URL}/api/follow-event"
FAN_EVENT_URL = f"{BASE_URL}/api/fan-event"
SHARE_EVENT_URL = f"{BASE_URL}/api/share-event"
STATUS_REPORT_URL = f"{BASE_URL}/api/listener"

http_client = httpx.AsyncClient(timeout=8.0)

def safe_get(obj, attr, fallback=None):
    try:
        return getattr(obj, attr, fallback)
    except (AttributeError, Exception):
        return fallback

async def safe_post(url, payload, event_type="Event"):
    try:
        response = await http_client.post(url, json=payload, timeout=8.0)
        return response
    except httpx.ConnectError:
        # Backend not running or still starting
        pass
    except Exception as e:
        print(f"⚠️ [API Warning] Failed to send {event_type}: {e}", flush=True)
    return None

async def report_listener_status(is_live: bool, connected: bool, status_text: str = "", room_id: str = ""):
    payload = {
        "action": "report_status",
        "isLive": is_live,
        "connected": connected,
        "username": TIKTOK_USERNAME,
        "roomId": str(room_id),
        "statusText": status_text,
        "timestamp": int(time.time() * 1000)
    }
    await safe_post(STATUS_REPORT_URL, payload, "Status Report")

def extract_images(event):
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
    except:
        pass
    return list(set(images))

def create_client(username: str) -> TikTokLiveClient:
    """Create a brand new client instance to avoid corrupted state across reconnects."""
    client = TikTokLiveClient(unique_id=username)

    @client.on(ConnectEvent)
    async def on_connect(event: ConnectEvent):
        room_id = safe_get(event, "room_id", "")
        print("=======================================", flush=True)
        print(f"📡 TERHUBUNG KE LIVE TIKTOK @{username} (Room: {room_id})", flush=True)
        print("=======================================", flush=True)
        await report_listener_status(
            is_live=True,
            connected=True,
            status_text=f"Terhubung ke Live @{username}",
            room_id=str(room_id)
        )

    @client.on(DisconnectEvent)
    async def on_disconnect(event: DisconnectEvent):
        print(f"🔌 Terputus dari Live @{username}. Standby menghubungkan kembali...", flush=True)
        await report_listener_status(
            is_live=False,
            connected=False,
            status_text=f"Terputus dari @{username}. Standby..."
        )

    @client.on(LiveEndEvent)
    async def on_live_end(event: LiveEndEvent):
        print(f"🛑 Live streaming @{username} telah berakhir.", flush=True)
        await report_listener_status(
            is_live=False,
            connected=False,
            status_text=f"Live @{username} telah berakhir."
        )

    @client.on(GiftEvent)
    async def on_gift(event: GiftEvent):
        try:
            gift_obj = safe_get(event, "gift")
            if not gift_obj:
                return

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
            
            combo_identifier = group_id or msg_id or f"{safe_get(gift_obj, 'id')}_{int(time.time())}"
            unique_combo_id = f"{unique_id}_{combo_identifier}"
            event_id = f"gift_{unique_combo_id}_{repeat_count}"
            
            if event_id in seen_event_ids:
                return
            seen_event_ids.append(event_id)

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
            
            await safe_post(GIFT_EVENT_URL, payload, "Gift")
            status = " [Streak End]" if repeat_end else " [Spamming...]"
            print(f"🎁 GIFT DETECTED: '{gift_name}' [x{repeat_count}] dari {nickname} (@{unique_id}){status}", flush=True)
        except Exception as e:
            print(f"![Error Gift] {e}", flush=True)

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
            if event_id in seen_event_ids:
                return
            seen_event_ids.append(event_id)

            payload = {
                "comment": comment_text,
                "nickname": nickname,
                "username": unique_id,
                "images": images,
                "eventId": event_id
            }
            await safe_post(COMMENT_EVENT_URL, payload, "Comment")
            print(f"💬 COMMENT: {nickname}: {comment_text}", flush=True)
        except Exception as e:
            pass

    @client.on(LikeEvent)
    async def on_like(event: LikeEvent):
        try:
            user_obj = safe_get(event, "user")
            nickname = safe_get(user_obj, "nickname", "Viewer")
            unique_id = safe_get(user_obj, "unique_id", "viewer")
            total_likes = safe_get(event, "total", safe_get(event, "like_count", 0))
            if total_likes == 0:
                return
            
            payload = {
                "likeCount": total_likes,
                "nickname": nickname, 
                "username": unique_id,
                "eventId": f"like_{unique_id}_{int(time.time() * 1000)}"
            }
            await safe_post(LIKE_EVENT_URL, payload, "Like")
        except Exception as e:
            pass

    @client.on(JoinEvent)
    async def on_join(event: JoinEvent):
        try:
            user_obj = safe_get(event, "user")
            unique_id = safe_get(user_obj, "unique_id", "viewer")
            event_id = f"join_{unique_id}_{int(time.time() / 30)}"
            if event_id in seen_event_ids:
                return
            seen_event_ids.append(event_id)

            payload = {
                "nickname": safe_get(user_obj, "nickname", "Viewer"),
                "username": unique_id,
                "eventId": event_id
            }
            await safe_post(JOIN_EVENT_URL, payload, "Join")
        except Exception as e:
            pass

    @client.on(FollowEvent)
    async def on_follow(event: FollowEvent):
        try:
            user_obj = safe_get(event, "user")
            unique_id = safe_get(user_obj, "unique_id", "viewer")
            event_id = f"follow_{unique_id}"
            if event_id in seen_event_ids:
                return
            seen_event_ids.append(event_id)

            payload = {
                "nickname": safe_get(user_obj, "nickname", "Viewer"),
                "username": unique_id,
                "eventId": event_id
            }
            await safe_post(FOLLOW_EVENT_URL, payload, "Follow")
        except Exception as e:
            pass

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
        except Exception as e:
            pass

    @client.on(ShareEvent)
    async def on_share(event: ShareEvent):
        try:
            user_obj = safe_get(event, "user")
            unique_id = safe_get(user_obj, "unique_id", "viewer")
            event_id = f"share_{unique_id}_{int(time.time() / 10)}"
            if event_id in seen_event_ids:
                return
            seen_event_ids.append(event_id)

            payload = {
                "nickname": safe_get(user_obj, "nickname", "Viewer"),
                "username": unique_id,
                "eventId": event_id
            }
            await safe_post(SHARE_EVENT_URL, payload, "Share")
        except Exception as e:
            pass

    return client

async def listen_loop():
    print(f"🚀 LISTENER STARTING untuk @{TIKTOK_USERNAME} (Backend: {BASE_URL})", flush=True)
    await report_listener_status(
        is_live=False,
        connected=False,
        status_text=f"Memulai koneksi ke @{TIKTOK_USERNAME}..."
    )

    while True:
        client = create_client(TIKTOK_USERNAME)
        try:
            print(f"🔄 Menghubungkan ke @{TIKTOK_USERNAME}...", flush=True)
            await report_listener_status(
                is_live=False,
                connected=False,
                status_text=f"Menghubungkan ke @{TIKTOK_USERNAME}..."
            )
            # await client.start() initiates websocket connection to live room
            await client.start()
        except UserOfflineError as e:
            print(f"⏳ @{TIKTOK_USERNAME} sedang Offline. Standby mengecek ulang dalam 10 detik...", flush=True)
            await report_listener_status(
                is_live=False,
                connected=False,
                status_text=f"@{TIKTOK_USERNAME} sedang Offline. Standby..."
            )
            await asyncio.sleep(10)
        except UserNotFoundError as e:
            print(f"❌ Akun TikTok @{TIKTOK_USERNAME} tidak ditemukan / belum pernah Live. Mengecek ulang dalam 15 detik...", flush=True)
            await report_listener_status(
                is_live=False,
                connected=False,
                status_text=f"Akun @{TIKTOK_USERNAME} tidak ditemukan / belum pernah Live."
            )
            await asyncio.sleep(15)
        except asyncio.CancelledError:
            print("🛑 Listener dibatalkan.", flush=True)
            await report_listener_status(
                is_live=False,
                connected=False,
                status_text="Listener dimatikan."
            )
            break
        except Exception as e:
            err_name = type(e).__name__
            err_msg = str(e)
            if "offline" in err_msg.lower():
                print(f"⏳ @{TIKTOK_USERNAME} sedang Offline. Standby...", flush=True)
                await report_listener_status(
                    is_live=False,
                    connected=False,
                    status_text=f"@{TIKTOK_USERNAME} Offline. Standby..."
                )
            else:
                print(f"⚠️ Info ({err_name}): {err_msg}. Mencoba lagi dalam 10 detik...", flush=True)
                await report_listener_status(
                    is_live=False,
                    connected=False,
                    status_text=f"{err_name}: {err_msg[:45]}"
                )
            await asyncio.sleep(10)
        finally:
            try:
                if client.connected:
                    await client.disconnect()
            except Exception:
                pass
            try:
                await client.close()
            except Exception:
                pass

if __name__ == '__main__':
    try:
        asyncio.run(listen_loop())
    except KeyboardInterrupt:
        print("🛑 Listener dihentikan via KeyboardInterrupt.", flush=True)
