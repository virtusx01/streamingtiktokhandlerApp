import json
import os
import re
import shlex
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid


BASE_URL = os.environ.get("RENDER_APP_URL", "").rstrip("/")
TOKEN = os.environ.get("ADB_AGENT_TOKEN", "")
ADB_PATH = os.environ.get("ADB_PATH", "adb")
POLL_INTERVAL = 1.5
HEARTBEAT_INTERVAL = 10
AGENT_ID = f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"


def request(path, method="GET", payload=None, timeout=30):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "X-ADB-Agent-ID": AGENT_ID,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Server returned HTTP {error.code}: {raw[:500]}") from error


def adb_devices():
    result = subprocess.run(
        [ADB_PATH, "devices", "-l"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "adb devices gagal")

    devices = []
    for line in result.stdout.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2 or parts[1] != "device":
            continue
        details = dict(
            part.split(":", 1) for part in parts[2:] if ":" in part
        )
        devices.append(
            {
                "serial": parts[0],
                "status": parts[1],
                "isWireless": "." in parts[0] and ":" in parts[0],
                "model": details.get("model", "Unknown Device").replace("_", " "),
            }
        )
    return devices


def run_action(action):
    kind = action["type"]
    if kind == "click":
        args = ["shell", "input", "tap", str(action["x"]), str(action["y"])]
    elif kind == "keyevent":
        keycode = str(action["keycode"])
        if not (keycode.isdigit() and int(keycode) <= 288) and not re.fullmatch(r"KEYCODE_[A-Z0-9_]+", keycode):
            raise ValueError("Android keycode tidak valid")
        args = ["shell", "input", "keyevent", keycode]
    elif kind == "swipe":
        swipe = action["swipe"]
        args = [
            "shell", "input", "swipe",
            str(swipe["startX"]), str(swipe["startY"]),
            str(swipe["endX"]), str(swipe["endY"]),
            str(swipe["duration"]),
        ]
    elif kind == "text":
        text = action["inputParams"].replace(" ", "%s")
        args = ["shell", "input", "text", shlex.quote(text)]
    else:
        raise ValueError(f"Tipe aksi tidak didukung: {kind}")

    result = subprocess.run(
        [ADB_PATH, *args],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "ADB command gagal")
    if action.get("delayAfter", 0):
        time.sleep(action["delayAfter"] / 1000)


def execute(command):
    actions = command.get("actions")
    if not isinstance(actions, list) or not actions or len(actions) > 20:
        raise ValueError("Daftar aksi dari server tidak valid")

    for action in actions:
        if not isinstance(action, dict):
            raise ValueError("Format aksi dari server tidak valid")
        run_action(action)


def main():
    if not BASE_URL.startswith(("https://", "http://")):
        raise SystemExit("Atur RENDER_APP_URL ke URL service Render.")
    if not TOKEN:
        raise SystemExit("Atur ADB_AGENT_TOKEN dengan token yang sama seperti di Render.")

    print(f"Agent ADB aktif untuk {BASE_URL} (ID: {AGENT_ID})")
    next_heartbeat = 0
    while True:
        try:
            if time.monotonic() >= next_heartbeat:
                try:
                    devices = adb_devices()
                except (OSError, subprocess.SubprocessError, RuntimeError) as error:
                    print(f"Status ADB belum tersedia: {error}")
                    devices = []
                request(
                    "/api/adb/agent/heartbeat",
                    method="POST",
                    payload={
                        "agentId": AGENT_ID,
                        "connected": bool(devices),
                        "devices": devices,
                    },
                )
                next_heartbeat = time.monotonic() + HEARTBEAT_INTERVAL

            status, data = request("/api/adb/agent/commands", timeout=10)
            if status == 204 or not data or not data.get("command"):
                time.sleep(POLL_INTERVAL)
                continue

            command = data["command"]
            success = True
            error_text = ""
            try:
                execute(command)
                print(f"Aksi ADB selesai: {command.get('id')}")
            except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError, RuntimeError) as error:
                success = False
                error_text = str(error)
                print(f"Aksi ADB gagal ({command.get('id')}): {error_text}")

            request(
                "/api/adb/agent/commands",
                method="POST",
                payload={
                    "commandId": command.get("id"),
                    "success": success,
                    "output": "ADB actions executed" if success else "",
                    "error": error_text,
                },
            )
        except (urllib.error.URLError, TimeoutError, RuntimeError, OSError) as error:
            print(f"Koneksi ke Render bermasalah: {error}")
            time.sleep(5)


if __name__ == "__main__":
    main()
