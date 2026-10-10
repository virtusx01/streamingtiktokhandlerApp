import base64
import ctypes
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from ctypes import wintypes
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from urllib.parse import urlparse
from urllib.request import urlopen


APP_NAME = "TikTok ADB Agent"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
AGENT_SCRIPT = Path(__file__).resolve().with_name("adb_agent.py")
CONFIG_DIR = Path(os.environ.get("APPDATA", Path.home())) / "TikTokADBBridge"
CONFIG_PATH = CONFIG_DIR / "config.json"
RENDER_DEFAULT = "https://tiktoklistener.onrender.com"


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _windows_protect(data: bytes, unprotect: bool = False) -> bytes:
    if os.name != "nt":
        raise OSError("Penyimpanan token terenkripsi hanya didukung di Windows.")

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    source_buffer = ctypes.create_string_buffer(data)
    source = DataBlob(
        len(data),
        ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    destination = DataBlob()
    function = crypt32.CryptUnprotectData if unprotect else crypt32.CryptProtectData
    function.argtypes = [
        ctypes.POINTER(DataBlob),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(DataBlob),
    ]
    function.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p

    if not function(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(destination)):
        raise ctypes.WinError(ctypes.get_last_error())

    try:
        return ctypes.string_at(destination.pbData, destination.cbData)
    finally:
        kernel32.LocalFree(destination.pbData)


def encrypt_token(token: str) -> str:
    protected = _windows_protect(token.encode("utf-8"))
    return base64.b64encode(protected).decode("ascii")


def decrypt_token(value: str) -> str:
    protected = base64.b64decode(value, validate=True)
    return _windows_protect(protected, unprotect=True).decode("utf-8")


class AdbAgentGui:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("780x620")
        self.root.minsize(680, 540)
        self.messages: queue.Queue[tuple[str, str]] = queue.Queue()
        self.process: subprocess.Popen[str] | None = None
        self.reader_thread: threading.Thread | None = None
        self.closing = False

        self.render_url = tk.StringVar(value=os.environ.get("RENDER_APP_URL", RENDER_DEFAULT))
        default_adb = os.environ.get("ADB_PATH") or shutil.which("adb") or "adb"
        self.adb_path = tk.StringVar(value=default_adb)
        self.token = tk.StringVar(value=os.environ.get("ADB_AGENT_TOKEN", ""))
        self.remember_token = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value="Belum terhubung")

        self._load_config()
        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.after(150, self._poll_messages)

    def _load_config(self) -> None:
        if not CONFIG_PATH.exists():
            return

        try:
            config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            self.render_url.set(config.get("render_url") or self.render_url.get())
            self.adb_path.set(config.get("adb_path") or self.adb_path.get())
            protected = config.get("token_dpapi")
            if protected and not self.token.get():
                self.token.set(decrypt_token(protected))
        except (OSError, ValueError, TypeError):
            messagebox.showwarning(
                APP_NAME,
                "Konfigurasi tersimpan tidak dapat dibaca. Isi URL dan token lagi.",
            )

    def _build_ui(self) -> None:
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(3, weight=1)
        main = ttk.Frame(self.root, padding=18)
        main.grid(row=0, column=0, sticky="nsew")
        main.columnconfigure(1, weight=1)
        main.rowconfigure(5, weight=1)
        self.root.rowconfigure(0, weight=1)

        ttk.Label(main, text="Koneksi TikTok → Android", font=("", 16, "bold")).grid(
            row=0, column=0, columnspan=3, sticky="w"
        )
        ttk.Label(
            main,
            text="Listener berjalan di Render. Agent ringan ini meneruskan aksi ke HP lewat ADB USB.",
            wraplength=720,
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(5, 16))

        ttk.Label(main, text="URL Render").grid(row=2, column=0, sticky="w", pady=5)
        ttk.Entry(main, textvariable=self.render_url).grid(
            row=2, column=1, columnspan=2, sticky="ew", pady=5
        )

        ttk.Label(main, text="ADB Agent Token").grid(row=3, column=0, sticky="w", pady=5)
        self.token_entry = ttk.Entry(main, textvariable=self.token, show="*")
        self.token_entry.grid(row=3, column=1, columnspan=2, sticky="ew", pady=5)

        ttk.Label(main, text="Lokasi adb.exe").grid(row=4, column=0, sticky="w", pady=5)
        ttk.Entry(main, textvariable=self.adb_path).grid(row=4, column=1, sticky="ew", pady=5)
        ttk.Button(main, text="Pilih...", command=self._browse_adb).grid(
            row=4, column=2, sticky="e", padx=(8, 0), pady=5
        )

        controls = ttk.Frame(main)
        controls.grid(row=5, column=0, columnspan=3, sticky="new", pady=(12, 8))
        self.check_button = ttk.Button(controls, text="Cek HP USB", command=self._check_adb)
        self.check_button.pack(side="left")
        self.render_check_button = ttk.Button(
            controls, text="Cek status Render", command=self._check_render_status
        )
        self.render_check_button.pack(side="left", padx=(8, 0))
        self.start_button = ttk.Button(controls, text="Sambungkan agent", command=self._start_agent)
        self.start_button.pack(side="left", padx=8)
        self.stop_button = ttk.Button(
            controls, text="Hentikan", command=self._stop_agent, state="disabled"
        )
        self.stop_button.pack(side="left")
        ttk.Checkbutton(
            controls,
            text="Ingat token terenkripsi di Windows",
            variable=self.remember_token,
        ).pack(side="left", padx=(16, 0))

        ttk.Label(main, textvariable=self.status, font=("", 10, "bold")).grid(
            row=6, column=0, columnspan=3, sticky="w", pady=(6, 8)
        )
        ttk.Label(main, text="Log").grid(row=7, column=0, columnspan=3, sticky="w")

        log_frame = ttk.Frame(main)
        log_frame.grid(row=8, column=0, columnspan=3, sticky="nsew")
        main.rowconfigure(8, weight=1)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        self.log = tk.Text(log_frame, height=12, wrap="word", state="disabled")
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log.yview)
        self.log.configure(yscrollcommand=scrollbar.set)
        self.log.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        ttk.Label(
            main,
            text="Jangan bagikan token. Pastikan USB debugging aktif dan izinkan koneksi di layar HP.",
            wraplength=720,
        ).grid(row=9, column=0, columnspan=3, sticky="w", pady=(10, 0))

    def _append_log(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _browse_adb(self) -> None:
        selected = filedialog.askopenfilename(
            title="Pilih Android Debug Bridge",
            filetypes=[("ADB executable", "adb.exe"), ("Executable", "*.exe")],
        )
        if selected:
            self.adb_path.set(selected)

    def _resolved_adb(self) -> str | None:
        value = self.adb_path.get().strip()
        if Path(value).is_file():
            return value
        return shutil.which(value)

    def _check_adb(self) -> None:
        adb = self._resolved_adb()
        if not adb:
            messagebox.showerror(APP_NAME, "adb tidak ditemukan. Pilih lokasi adb.exe.")
            return

        self.check_button.configure(state="disabled")
        self.status.set("Memeriksa perangkat USB...")
        threading.Thread(target=self._check_adb_worker, args=(adb,), daemon=True).start()

    def _check_adb_worker(self, adb: str) -> None:
        try:
            result = subprocess.run(
                [adb, "devices", "-l"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip() or "adb devices gagal.")

            connected = []
            unauthorized = []
            for line in result.stdout.splitlines()[1:]:
                parts = line.split()
                if len(parts) < 2:
                    continue
                if parts[1] == "device":
                    model = next(
                        (part.split(":", 1)[1].replace("_", " ") for part in parts[2:] if part.startswith("model:")),
                        "Android device",
                    )
                    connected.append(f"{model} ({parts[0]})")
                elif parts[1] == "unauthorized":
                    unauthorized.append(parts[0])

            if connected:
                self.messages.put(("adb", "HP tersambung: " + ", ".join(connected)))
            elif unauthorized:
                self.messages.put(
                    ("adb", "HP terdeteksi tetapi belum diizinkan. Buka layar HP dan setujui USB debugging.")
                )
            else:
                self.messages.put(
                    ("adb", "Belum ada HP. Cek kabel data, USB debugging, lalu tekan Cek HP USB lagi.")
                )
        except (OSError, subprocess.SubprocessError, RuntimeError) as error:
            self.messages.put(("adb", f"Gagal memeriksa ADB: {error}"))

    def _check_render_status(self) -> None:
        url = self.render_url.get().strip().rstrip("/")
        parsed_url = urlparse(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            messagebox.showerror(APP_NAME, "Masukkan URL Render yang valid dan diawali https://.")
            return

        self.render_check_button.configure(state="disabled")
        self.status.set("Memeriksa status agent di Render...")
        threading.Thread(target=self._check_render_worker, args=(url,), daemon=True).start()

    def _check_render_worker(self, url: str) -> None:
        try:
            with urlopen(f"{url}/api/adb/status", timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
            if data.get("agentOnline") and data.get("connected"):
                devices = data.get("devices") or []
                labels = [
                    device.get("model") or device.get("serial") or "Android device"
                    for device in devices
                ]
                detail = ", ".join(labels) if labels else "perangkat tersambung"
                self.messages.put(("render", f"Render: agent online, HP tersambung ({detail})."))
            elif data.get("agentOnline"):
                self.messages.put(("render", "Render: agent online, tetapi HP belum terdeteksi ADB."))
            else:
                self.messages.put(("render", "Render aktif, tetapi agent laptop belum online."))
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.messages.put(("render", f"Gagal memeriksa Render: {error}"))

    def _save_config(self, url: str, adb: str, token: str) -> None:
        config = {"render_url": url, "adb_path": adb}
        if self.remember_token.get():
            config["token_dpapi"] = encrypt_token(token)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")

    def _start_agent(self) -> None:
        if self.process and self.process.poll() is None:
            return

        url = self.render_url.get().strip().rstrip("/")
        parsed_url = urlparse(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            messagebox.showerror(APP_NAME, "Masukkan URL Render yang valid dan diawali https://.")
            return

        token = self.token.get().strip()
        if not token:
            messagebox.showerror(APP_NAME, "ADB Agent Token wajib diisi.")
            return

        adb = self._resolved_adb()
        if not adb:
            messagebox.showerror(APP_NAME, "adb tidak ditemukan. Pilih lokasi adb.exe.")
            return

        try:
            self._save_config(url, adb, token)
        except OSError as error:
            messagebox.showerror(APP_NAME, f"Gagal menyimpan konfigurasi aman: {error}")
            return

        env = os.environ.copy()
        env.update(
            {
                "RENDER_APP_URL": url,
                "ADB_AGENT_TOKEN": token,
                "ADB_PATH": adb,
                "PYTHONUNBUFFERED": "1",
            }
        )
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        try:
            self.process = subprocess.Popen(
                [sys.executable, str(AGENT_SCRIPT)],
                cwd=PROJECT_ROOT,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                creationflags=creationflags,
            )
        except OSError as error:
            self.process = None
            messagebox.showerror(APP_NAME, f"Tidak dapat menjalankan agent: {error}")
            return

        self.status.set("Agent berjalan; menunggu koneksi ke Render dan HP...")
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self._append_log("Agent dimulai. Tunggu heartbeat pertama untuk melihat status koneksi.")
        self.reader_thread = threading.Thread(target=self._read_agent_output, daemon=True)
        self.reader_thread.start()

    def _read_agent_output(self) -> None:
        process = self.process
        if not process or not process.stdout:
            return

        for line in process.stdout:
            self.messages.put(("log", line.rstrip()))
        return_code = process.wait()
        self.messages.put(("exit", str(return_code)))

    def _stop_agent(self) -> None:
        process = self.process
        if not process or process.poll() is not None:
            self._set_stopped()
            return

        self.stop_button.configure(state="disabled")
        self.status.set("Menghentikan agent...")
        threading.Thread(target=self._stop_worker, args=(process,), daemon=True).start()

    def _stop_worker(self, process: subprocess.Popen[str]) -> None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        self.messages.put(("stopped", "Agent dihentikan."))

    def _set_stopped(self) -> None:
        self.process = None
        self.status.set("Agent berhenti")
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")

    def _poll_messages(self) -> None:
        while True:
            try:
                kind, text = self.messages.get_nowait()
            except queue.Empty:
                break

            if kind == "log":
                self._append_log(text)
                if "Agent ADB aktif" in text:
                    self.status.set("Agent berjalan; menghubungkan ke Render...")
                elif "Aksi ADB gagal" in text or "Koneksi ke Render bermasalah" in text:
                    self.status.set("Agent berjalan, ada masalah. Lihat log.")
            elif kind == "adb":
                self.status.set(text)
                self._append_log(text)
                self.check_button.configure(state="normal")
            elif kind == "render":
                self.status.set(text)
                self._append_log(text)
                self.render_check_button.configure(state="normal")
            elif kind in ("exit", "stopped"):
                self._append_log(text if kind == "stopped" else f"Agent keluar (kode {text}).")
                self._set_stopped()

        if not self.closing:
            self.root.after(150, self._poll_messages)

    def close(self) -> None:
        self.closing = True
        process = self.process
        if process and process.poll() is None:
            process.terminate()
        self.root.destroy()


def main() -> None:
    if os.name != "nt":
        raise SystemExit("GUI ini dibuat untuk Windows.")
    root = tk.Tk()
    AdbAgentGui(root)
    root.mainloop()


if __name__ == "__main__":
    main()
