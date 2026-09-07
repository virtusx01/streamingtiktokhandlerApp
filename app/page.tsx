"use client";

import { useState, useEffect, useRef } from "react";
import TriggerConfigurator, { RewardConfig } from "@/components/ui/TriggerConfigurator";
import { Save, Plus, Smartphone, Zap, FolderOpen, Trash2, Download, Gift, Edit2, Check, MessageSquare, Camera, UserPlus, Heart, Layout, ExternalLink, Info } from "lucide-react";
import QRCodeScanner from "@/components/ui/QRCodeScanner";

interface AppConfig {
  tiktokUsername: string;
  autoStartListener: boolean;
  ttsSpeed?: number;
  ttsEnabled?: boolean;
  useLocalTTS?: boolean;
  commentVoiceOverTemplate?: string;
  commentVoice?: string;
  commentOpeningSoundUrl?: string;
  commentEnabled?: boolean;
  commentTtsEnabled?: boolean;
  widgetConfig: {
    elements: any[];
    openingSoundUrl?: string | null;
    messageTemplate?: string;
    ttsEnabled: boolean;
    likeThreshold: number;
    milestoneMode?: 'individual' | 'global';
  };
  commentConfig: {
    theme: "modern" | "minimalist" | "clean";
    borderRadius: number;
    maxComments: number;
    showIcons?: boolean;
  };
  rewards: Record<string, RewardConfig>;
  adbMode?: "usb" | "wireless";
  adbIP?: string;
  adbPort?: string;
  triggerRewardsEnabled: boolean;
}

export default function Home() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRewardName, setNewRewardName] = useState("");
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [listenerRunning, setListenerRunning] = useState(false);
  const [listenerConnected, setListenerConnected] = useState(false);
  const [listenerDetail, setListenerDetail] = useState<string>("");
  const hasAttemptedAutoStartListener = useRef(false);
  // Preset management
  const [presets, setPresets] = useState<{ id: number; name: string; created_at: string }[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState<string | null>(null);
  const [editedPresetName, setEditedPresetName] = useState("");
  // Detected gifts from TikTok
  const [detectedGifts, setDetectedGifts] = useState<{ name: string; count: number }[]>([]);
  // Full curated TikTok gift library
  const [tiktokGifts, setTiktokGifts] = useState<{ name: string; category: string }[]>([]);
  const [widgetConnected, setWidgetConnected] = useState(false);
  const [widgetListenerCount, setWidgetListenerCount] = useState(0);
  const [adbStatus, setAdbStatus] = useState<{ connected: boolean; devices: any[] }>({ connected: false, devices: [] });
  const [connectingAdb, setConnectingAdb] = useState(false);
  const [pairingAdb, setPairingAdb] = useState(false);
  const [caddyRunning, setCaddyRunning] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [liveEvents, setLiveEvents] = useState<{ id: string; type: string; nickname: string; detail: string; timestamp: number }[]>([]);
  const hasAttemptedAutoConnect = useRef(false);

  useEffect(() => {
    fetchConfig();
    checkLiveStatus();
    checkListenerStatus();
    fetchPresets();
    fetchDetectedGifts();
    fetchTiktokGifts();
    checkWidgetStatus();
    checkAdbStatus();
    checkCaddyStatus();
    const interval = setInterval(() => {
        checkLiveStatus();
        checkListenerStatus();
        fetchDetectedGifts();
        checkWidgetStatus();
        checkAdbStatus();
        checkCaddyStatus();
    }, 5000); 
    return () => clearInterval(interval);
  }, []);

  // SSE Listener for Dashboard Notifications & Live Status Sync
  useEffect(() => {
    const eventSource = new EventSource("/api/events");
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = payload.type;
        const data = payload.data || payload;
        
        if (type === 'status') {
          if (data.isLive !== undefined) setIsLive(Boolean(data.isLive));
          if (data.connected !== undefined) setListenerConnected(Boolean(data.connected));
          if (data.running !== undefined) setListenerRunning(Boolean(data.running));
          if (data.statusText) setListenerDetail(data.statusText);
          return;
        }

        // We only show high-value events in the dashboard feed (gift, share, follow, like-milestone)
        if (!['gift', 'share', 'follow', 'like'].includes(type)) return;

        let detail = "";
        if (type === 'gift') detail = `sent ${data.namaHadiah || data.giftName}`;
        else if (type === 'share') detail = "shared the live!";
        else if (type === 'follow') detail = "started following!";
        else if (type === 'like') detail = `reached ${data.likeCount} likes!`;

        const newEvent = {
          id: data.eventId || Math.random().toString(36).substr(2, 9),
          type,
          nickname: data.nickname || data.username || "Viewer",
          detail,
          timestamp: Date.now()
        };

        setLiveEvents(prev => [newEvent, ...prev].slice(0, 10)); // Keep last 10
      } catch (e) {}
    };

    return () => eventSource.close();
  }, []);

  // Auto-reconnect logic
  useEffect(() => {
    if (config && !adbStatus.connected && config.adbMode === "wireless" && config.adbIP && !hasAttemptedAutoConnect.current) {
        console.log("[ADB] Attempting auto-reconnect to:", config.adbIP);
        hasAttemptedAutoConnect.current = true;
        handleAdbConnect();
    }
  }, [config, adbStatus.connected]);


  const checkListenerStatus = async () => {
    try {
      const res = await fetch("/api/listener");
      const data = await res.json();
      setListenerRunning(Boolean(data?.running));
      if (data?.status) {
        setListenerConnected(Boolean(data.status.connected));
        if (data.status.statusText) {
          setListenerDetail(data.status.statusText);
        }
        if (data.status.isLive !== undefined) {
          setIsLive(Boolean(data.status.isLive));
        }
      }
      
      if (config?.autoStartListener && !data?.running && !hasAttemptedAutoStartListener.current) {
        hasAttemptedAutoStartListener.current = true;
        handleListenerAction("start");
      }
    } catch (err) {
      console.error("Failed to check listener status", err);
    }
  };

  const handleListenerAction = async (action: "start" | "stop", overrideUser?: string) => {
    try {
      const targetUser = overrideUser || config?.tiktokUsername || 'onlyvirtus';
      const res = await fetch("/api/listener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action,
          username: targetUser,
          forceRestart: true 
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setListenerRunning(action === "start");
        if (action === "start") {
          setListenerDetail(`Menghubungkan ke ${targetUser}...`);
        } else {
          setListenerConnected(false);
          setIsLive(false);
          setListenerDetail("Listener dihentikan.");
        }
        setTimeout(() => {
          checkListenerStatus();
          checkLiveStatus();
        }, 1200);
      } else if (data?.error) {
        alert("Gagal mengontrol listener: " + data.error);
      }
    } catch (err: any) {
      console.error("Listener action failed", err);
    }
  };

  const checkLiveStatus = async (overrideUser?: string) => {
    try {
      const user = overrideUser || config?.tiktokUsername || 'onlyvirtus';
      const cleanUser = user.replace(/^@/, '').trim();
      const res = await fetch(`/api/status?username=${encodeURIComponent(cleanUser)}`);
      const data = await res.json();
      if (data.is_live !== undefined) {
        setIsLive(Boolean(data.is_live));
      }
      if (data.connected !== undefined && data.connected) {
        setListenerConnected(true);
      }
      if (data.statusText && !listenerDetail) {
        setListenerDetail(data.statusText);
      }
    } catch (err) {
      console.error("Failed to check status", err);
    }
  };

  const handleSaveAndConnectUsername = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      await handleListenerAction("start", config.tiktokUsername);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      
      // Ensure defaults for all fields
      setConfig({
        tiktokUsername: "@onlyvirtus",
        autoStartListener: true,
        adbMode: "usb",
        adbIP: "",
        adbPort: "5555",
        commentConfig: {
          theme: "modern",
          borderRadius: 24,
          maxComments: 15
        },
        widgetConfig: {
          elements: [],
          ttsEnabled: true,
          likeThreshold: 100,
          milestoneMode: 'global',
          ...(data?.widgetConfig || {})
        },
        triggerRewardsEnabled: true,
        rewards: {},
        ...(data || {})
      });
    } catch (err) {
      console.warn("Using default configuration:", err);
      setConfig({
        tiktokUsername: "@onlyvirtus",
        autoStartListener: true,
        adbMode: "usb",
        adbIP: "",
        adbPort: "5555",
        commentConfig: {
          theme: "modern",
          borderRadius: 24,
          maxComments: 15
        },
        widgetConfig: {
          elements: [],
          ttsEnabled: true,
          likeThreshold: 100,
          milestoneMode: 'global'
        },
        triggerRewardsEnabled: true,
        rewards: {}
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save");
      alert("Configuration saved successfully!");
    } catch (err) {
      alert("Error saving: " + err);
    } finally {
      setSaving(false);
    }
  };

  const addReward = () => {
    if (!newRewardName.trim() || !config) return;
    if (config.rewards[newRewardName]) {
      alert("Reward already exists!");
      return;
    }

    const defaultAction = {
      type: "click" as const, x: 500, y: 500, keycode: null, swipe: null, inputParams: null, delayAfter: 500
    };

    const defaultReward: RewardConfig = {
      actions: [defaultAction]
    };

    setConfig({
      ...config,
      rewards: { ...config.rewards, [newRewardName]: defaultReward }
    });
    setNewRewardName("");
  };

  const updateReward = (key: string, newConfig: RewardConfig) => {
    if (!config) return;
    setConfig({
      ...config,
      rewards: { ...config.rewards, [key]: newConfig }
    });
  };

  const removeReward = (key: string) => {
    if (!config) return;
    const { [key]: removed, ...rest } = config.rewards;
    setConfig({ ...config, rewards: rest });
  };

  // ==========================================
  // PRESET MANAGEMENT
  // ==========================================
  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/reward-presets');
      const data = await res.json();
      setPresets(data.presets || []);
    } catch (err) {
      console.error('Failed to fetch presets', err);
    }
  };

  const saveAsPreset = async () => {
    if (!newPresetName.trim() || !config) return;
    try {
      await fetch('/api/reward-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', name: newPresetName.trim() })
      });
      setActivePresetName(newPresetName.trim());
      setNewPresetName('');
      fetchPresets();
      alert(`Preset "${newPresetName.trim()}" saved!`);
    } catch (err) {
      alert('Failed to save preset');
    }
  };

  const updateActivePreset = async () => {
    if (!activePresetName || !config) return;
    try {
      await fetch('/api/reward-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', name: activePresetName })
      });
      alert(`Preset "${activePresetName}" updated!`);
    } catch (err) {
      alert('Failed to update preset');
    }
  };

  const renamePreset = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setEditingPresetName(null);
      return;
    }
    try {
      await fetch('/api/reward-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldName, newName: newName.trim() })
      });
      if (activePresetName === oldName) setActivePresetName(newName.trim());
      setEditingPresetName(null);
      fetchPresets();
    } catch (err) {
      alert('Failed to rename preset');
    }
  };

  const loadPreset = async (name: string) => {
    if (!config) return;
    try {
      const res = await fetch('/api/reward-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load', name })
      });
      const data = await res.json();
      if (data.rewards) {
        setConfig({ ...config, rewards: data.rewards });
        setActivePresetName(name);
        alert(`Preset "${name}" loaded!`);
      }
    } catch (err) {
      alert('Failed to load preset');
    }
  };

  const deletePreset = async (name: string) => {
    if (!confirm(`Hapus preset "${name}"?`)) return;
    try {
      await fetch(`/api/reward-presets?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (activePresetName === name) setActivePresetName(null);
      fetchPresets();
    } catch (err) {
      alert('Failed to delete preset');
    }
  };

  const handleRenameReward = async (oldName: string, newName: string) => {
    if (!config) return;
    try {
      const res = await fetch("/api/rewards/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
      if (!res.ok) throw new Error("Rename failed on server");

      // Update local state
      const newRewards = { ...config.rewards };
      const rewardConfig = newRewards[oldName];
      delete newRewards[oldName];
      newRewards[newName] = rewardConfig;
      
      setConfig({ ...config, rewards: newRewards });
    } catch (err: any) {
      alert("Failed to rename: " + err.message);
    }
  };

  const fetchDetectedGifts = async () => {
    try {
      const res = await fetch('/api/detected-gifts');
      const data = await res.json();
      setDetectedGifts(Array.isArray(data?.gifts) ? data.gifts : []);
    } catch (err: any) {
      console.error("Failed to fetch detected gifts", err);
      setDetectedGifts([]);
    }
  };

  const fetchTiktokGifts = async () => {
    try {
      const res = await fetch('/api/tiktok/gifts');
      const data = await res.json();
      setTiktokGifts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to fetch curated gifts", err);
      setTiktokGifts([]);
    }
  };

  const checkWidgetStatus = async () => {
    try {
      const res = await fetch('/api/events/status');
      const data = await res.json();
      setWidgetConnected(!!data?.connected);
      setWidgetListenerCount(data?.listeners?.gift || 0);
    } catch (e) {}
  };

  const triggerTestEvent = async () => {
    try {
      await fetch('/api/test-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftName: "Rose" })
      });
    } catch (e) {
      alert("Test failed");
    }
  };

  const checkAdbStatus = async () => {
    try {
      const res = await fetch('/api/adb/status');
      const data = await res.json();
      setAdbStatus({
        connected: Boolean(data?.connected),
        devices: Array.isArray(data?.devices) ? data.devices : []
      });
    } catch (e) {
      setAdbStatus({ connected: false, devices: [] });
    }
  };

  const handleAdbConnect = async () => {
    if (!config?.adbIP || !config?.adbPort) return;
    setConnectingAdb(true);
    try {
      const res = await fetch('/api/adb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: config.adbIP, port: config.adbPort })
      });
      const data = await res.json();
      if (data.success) {
        // alert("ADB Connected Successfully!"); // Silent success for auto-connect
        checkAdbStatus();
      } else {
        if (!hasAttemptedAutoConnect.current) alert("Connection failed: " + data.error);
      }
    } catch (e) {
      console.error("Failed to connect to ADB");
    } finally {
      setConnectingAdb(false);
    }
  };

  const handleAdbPair = async () => {
    if (!config?.adbIP || !config?.adbPort || !pairingCode) {
        alert("IP, Port, and Pairing Code are required for pairing!");
        return;
    }
    setPairingAdb(true);
    try {
      const res = await fetch('/api/adb/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: config.adbIP, port: config.adbPort, pairingCode })
      });
      const data = await res.json();
      if (data.success) {
        alert("Successfully paired! Now you can connect.");
        setPairingCode("");
      } else {
        alert("Pairing failed: " + data.error);
      }
    } catch (e) {
      alert("Failed to pair with ADB");
    } finally {
      setPairingAdb(false);
    }
  };

  const handleQRScan = (data: string) => {
    // Android Wireless Debugging QR Format: WIFI:T:ADB;S:<name>;P:<password>;;
    // or sometimes just the port and password if scanned from specific screens.
    console.log("[QR] Scanned data:", data);
    
    if (data.startsWith("WIFI:T:ADB;")) {
        const parts = data.split(';');
        let port = "";
        let password = "";
        
        parts.forEach(part => {
            if (part.startsWith("P:")) {
                // Could be port or password depending on sequence
                const val = part.substring(2);
                if (val.length === 6 && !isNaN(Number(val))) {
                    password = val;
                } else {
                    port = val;
                }
            }
        });

        if (port || password) {
            setConfig(prev => prev ? { ...prev, adbPort: port || prev.adbPort, adbMode: "wireless" } : null);
            if (password) setPairingCode(password);
            setShowScanner(false);
            alert("QR Code parsed! Please verify IP and press Pair or Connect.");
            return;
        }
    }
    
    // Fallback for simple IP:PORT or just PORT
    const match = data.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
    if (match) {
        setConfig(prev => prev ? { ...prev, adbIP: match[1], adbPort: match[2], adbMode: "wireless" } : null);
        setShowScanner(false);
    } else if (!isNaN(Number(data)) && data.length <= 5) {
        setConfig(prev => prev ? { ...prev, adbPort: data, adbMode: "wireless" } : null);
        setShowScanner(false);
    } else {
        alert("Scanned non-ADB QR: " + data);
    }
  };

  const handleAdbDisconnect = async () => {
    try {
      await fetch('/api/adb/disconnect', { method: 'POST' });
      checkAdbStatus();
    } catch (e) {}
  };

  const checkCaddyStatus = async () => {
    try {
      const res = await fetch("/api/caddy");
      const data = await res.json();
      setCaddyRunning(data.running);
    } catch (err) {
      console.error("Failed to check Caddy status", err);
    }
  };

  const handleCaddyAction = async (action: "start" | "stop" | "force_stop") => {
    try {
      const res = await fetch("/api/caddy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      }
      checkCaddyStatus();
    } catch (err) {
      console.error("Caddy action failed", err);
    }
  };

  if (loading || !config) return (
    <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-bold">
      Loading Dashboard...
    </div>
  );

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-12 font-sans selection:bg-emerald-500/30">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                <Smartphone size={28} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Scrcpy Live Engine</h1>
            </div>
            <p className="text-neutral-400 max-w-lg leading-relaxed text-sm">
              Connect TikTok Live to Android ADB actions. Configure rewards to trigger taps, swipes, and more.
            </p>
          </div>
          <button 
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            <Save size={18} /> {saving ? "Saving..." : "Save Config"}
          </button>
        </header>

        {/* Live Activity Feed */}
        <section className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="flex items-center justify-between px-6 py-3 bg-neutral-800/30 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Live Activity Feed</span>
              </div>
              <span className="text-[8px] font-bold text-neutral-600 uppercase">Real-time engagement</span>
            </div>
            <div className="p-2 max-h-[160px] overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {liveEvents.length === 0 ? (
                <div className="col-span-full py-8 text-center text-neutral-600 text-[10px] font-medium italic">
                  Waiting for live events...
                </div>
              ) : (
                liveEvents.map((ev) => (
                  <div 
                    key={ev.id} 
                    className="flex items-center gap-3 bg-neutral-950/50 border border-white/5 p-3 rounded-xl animate-in zoom-in-95 duration-300"
                  >
                    <div className={`p-2 rounded-lg ${
                      ev.type === 'gift' ? 'bg-purple-500/10 text-purple-400' :
                      ev.type === 'share' ? 'bg-emerald-500/10 text-emerald-400' :
                      ev.type === 'follow' ? 'bg-indigo-500/10 text-indigo-400' :
                      'bg-pink-500/10 text-pink-400'
                    }`}>
                      {ev.type === 'gift' && <Gift size={14} />}
                      {ev.type === 'share' && <Zap size={14} />}
                      {ev.type === 'follow' && <UserPlus size={14} />}
                      {ev.type === 'like' && <Heart size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{ev.nickname}</p>
                      <p className="text-[9px] text-neutral-500 truncate">{ev.detail}</p>
                    </div>
                    <span className="text-[8px] text-neutral-700 font-mono">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Widget Access Section */}
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Layout size={20} className="text-emerald-400" /> Overlay Widgets
              </h2>
              <div className="flex bg-black/40 p-1 rounded-full border border-white/5">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse m-1" title="Systems Active" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <a 
                href="/widget" 
                target="_blank" 
                className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-2xl hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all group/item"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover/item:scale-110 transition-transform">
                    <Zap size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white">Broadcast Widget</p>
                    <p className="text-[10px] text-neutral-500">Notifikasi, GIF, & TTS Alerts</p>
                  </div>
                </div>
                <ExternalLink size={14} className="text-neutral-700 group-hover/item:text-emerald-500 transition-colors" />
              </a>

              <a 
                href="/comment" 
                target="_blank" 
                className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-2xl hover:bg-blue-500/5 hover:border-blue-500/20 transition-all group/item"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl group-hover/item:scale-110 transition-transform">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white">Comment Widget</p>
                    <p className="text-[10px] text-neutral-500">Chat Stream & Sticker Overlay</p>
                  </div>
                </div>
                <ExternalLink size={14} className="text-neutral-700 group-hover/item:text-blue-500 transition-colors" />
              </a>
            </div>

            <div className="mt-4 p-3 bg-neutral-950/50 rounded-xl border border-white/5 flex items-start gap-2">
              <div className="p-1 bg-amber-500/10 text-amber-500 rounded mt-0.5">
                <Info size={10} />
              </div>
              <p className="text-[9px] text-neutral-500 leading-relaxed font-medium">
                Gunakan URL ini di OBS atau TikTok Live Studio sebagai <span className="text-neutral-300">Browser Source</span>. Pisahkan antarmuka untuk performa terbaik.
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl relative overflow-hidden">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-6">
              <Zap size={20} className="text-emerald-400" /> Connection
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2 flex items-center justify-between">
                  <span>TikTok Username</span>
                  <div className="flex items-center gap-2">
                    {isLive ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE
                      </span>
                    ) : listenerRunning ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        STANDBY
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        OFFLINE
                      </span>
                    )}
                  </div>
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={config.tiktokUsername}
                    onChange={(e) => setConfig({ ...config, tiktokUsername: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveAndConnectUsername();
                      }
                    }}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none transition font-mono text-sm"
                    placeholder="e.g. @username"
                  />
                  <button
                    onClick={handleSaveAndConnectUsername}
                    disabled={saving}
                    className="px-4 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold text-xs rounded-lg transition flex items-center gap-1.5 whitespace-nowrap"
                    title="Simpan username dan hubungkan listener"
                  >
                    <Check size={14} /> Hubungkan
                  </button>
                </div>
                {listenerDetail && (
                  <p className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1.5 bg-neutral-950/70 p-2 rounded-lg border border-neutral-800/80">
                    <span className="text-neutral-500">ℹ️ Status:</span> 
                    <span className="text-neutral-300 font-medium">{listenerDetail}</span>
                  </p>
                )}
              </div>

              {/* ADB Connection Section */}
              <div className="pt-4 border-t border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium">Device Debugging</div>
                  <div className="flex bg-neutral-950 p-1 rounded-full border border-neutral-800">
                    <button 
                      onClick={() => setConfig({ ...config!, adbMode: "usb" })}
                      className={`px-3 py-1 text-[10px] font-bold rounded-full transition ${config.adbMode !== "wireless" ? "bg-emerald-500 text-black" : "text-neutral-500"}`}
                    >
                      USB
                    </button>
                    <button 
                      onClick={() => setConfig({ ...config!, adbMode: "wireless" })}
                      className={`px-3 py-1 text-[10px] font-bold rounded-full transition ${config.adbMode === "wireless" ? "bg-emerald-500 text-black" : "text-neutral-500"}`}
                    >
                      WIRELESS
                    </button>
                  </div>
                </div>

                {config.adbMode === "wireless" && (
                  <div className="space-y-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">IP Address</label>
                            <input 
                                type="text" 
                                value={config.adbIP || ""}
                                onChange={(e) => setConfig({ ...config!, adbIP: e.target.value })}
                                placeholder="192.168.1.5"
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        <div className="w-24">
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">Port</label>
                            <input 
                                type="text" 
                                value={config.adbPort || ""}
                                onChange={(e) => setConfig({ ...config!, adbPort: e.target.value })}
                                placeholder="5555"
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        <div className="self-end pb-0.5">
                            <button 
                                onClick={() => setShowScanner(true)}
                                className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-emerald-400 transition border border-neutral-700"
                                title="Scan QR Code"
                            >
                                <Camera size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">Pairing Code (6 digits)</label>
                            <input 
                                type="text" 
                                value={pairingCode}
                                onChange={(e) => setPairingCode(e.target.value)}
                                placeholder="123456"
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-white focus:border-emerald-500/50 outline-none"
                            />
                        </div>
                        <div className="flex gap-1 self-end pb-0.5">
                            <button 
                                onClick={handleAdbPair}
                                disabled={pairingAdb || !pairingCode}
                                className="px-3 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold rounded-lg border border-emerald-500/20 transition disabled:opacity-30"
                            >
                                {pairingAdb ? "..." : "PAIR"}
                            </button>
                            <button 
                                onClick={handleAdbConnect}
                                disabled={connectingAdb}
                                className="px-3 py-2 bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-bold rounded-lg transition disabled:opacity-50"
                            >
                                <Check size={14} />
                            </button>
                        </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      ADB Connection
                      {adbStatus?.connected && adbStatus?.devices?.[0] && (
                        <span className="text-[10px] text-emerald-400 opacity-60">({adbStatus.devices[0]?.model || "Device"})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${adbStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-neutral-800"}`}></div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        {adbStatus?.connected ? "Connected" : "Disconnected"}
                        {adbStatus?.devices?.[0]?.isWireless ? " (Wireless)" : ""}
                      </div>
                    </div>
                  </div>
                  {adbStatus.connected && (
                    <button 
                      onClick={handleAdbDisconnect}
                      className="text-neutral-600 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                <div>
                  <div className="text-sm font-medium">TikTok Listener</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    {listenerConnected ? "Terhubung ke Live" : listenerRunning ? "Active (Standby)" : "Stopped"}
                  </div>
                </div>
                <button 
                  onClick={() => handleListenerAction(listenerRunning ? "stop" : "start")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${listenerRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"}`}
                >
                  {listenerRunning ? "Stop" : "Start"}
                </button>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Reward Actions (ADB)
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-extrabold ${config.triggerRewardsEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-500"}`}>
                      {config.triggerRewardsEnabled ? "ENABLED" : "PAUSED"}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    {config.triggerRewardsEnabled ? "Automatic actions are active" : "Notifications only, no ADB actions"}
                  </div>
                </div>
                <button 
                  onClick={() => setConfig({ ...config, triggerRewardsEnabled: !config.triggerRewardsEnabled })}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${config.triggerRewardsEnabled ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
                >
                  {config.triggerRewardsEnabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                <div className="flex-1">
                  <div className="text-sm font-medium">Notification Widget</div>
                  <div className={`text-[10px] uppercase tracking-wider font-bold ${widgetListenerCount > 1 ? "text-amber-500" : "text-neutral-500"}`}>
                    {widgetConnected ? `Connected (${widgetListenerCount})` : "Not Open"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={triggerTestEvent}
                        className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded border border-amber-500/20 transition"
                    >
                        ⚡ TEST TRIGGER
                    </button>
                    <div className={`w-2.5 h-2.5 rounded-full ${widgetConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-neutral-800"}`}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl">
             <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-emerald-400">
               Widget Editor
             </h2>
             <div className="space-y-4">
                <p className="text-xs text-neutral-400 leading-tight">
                  Configure notification appearance, message templates, and sounds in the standalone editor.
                </p>
                <div className="flex flex-col gap-3">
                   <a 
                    href="/widget" 
                    target="_blank"
                    className="flex items-center justify-center gap-2 bg-neutral-850 hover:bg-neutral-800 text-white text-sm font-bold py-3 rounded-xl transition border border-neutral-700 shadow-lg"
                   >
                     🚀 OPEN WIDGET EDITOR
                   </a>
                   
                     <div className="mt-2 p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                       <div className="text-[10px] text-neutral-500 font-bold uppercase mb-2">TikTok Studio Link</div>
                       <code className="text-[10px] bg-neutral-900 p-2 rounded block text-emerald-400/80 break-all select-all border border-emerald-500/5">http://localhost.aa/widget</code>
                       <p className="text-[8px] text-neutral-500 mt-2 italic">*Requires Caddy & HOSTS file mapping.</p>
                     </div>

                   <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] text-neutral-500 font-bold uppercase">Caddy Unified Proxy</div>
                        <div className={`w-1.5 h-1.5 rounded-full ${caddyRunning ? "bg-emerald-500 animate-pulse" : "bg-neutral-800"}`}></div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-neutral-400">{caddyRunning ? "Running (Port 80)" : "Stopped"}</div>
                        <div className="flex items-center gap-1.5">
                            <button 
                                onClick={() => handleCaddyAction(caddyRunning ? "stop" : "start")}
                                className={`px-3 py-1 rounded-md text-[10px] font-bold transition ${caddyRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}
                            >
                                {caddyRunning ? "STOP" : "START"}
                            </button>
                            <button 
                                onClick={() => handleCaddyAction("force_stop")}
                                title="Paksa Matikan Semua Caddy jika error port terpakai"
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1"
                            >
                                ⚡ FIX CADDY
                            </button>
                        </div>
                    </div>
                  </div>

                   <div className="bg-neutral-950 p-2 rounded-lg border border-neutral-800">
                    <label className="block text-[10px] text-neutral-500 font-bold uppercase mb-1">Auto-Start on Boot</label>
                    <select 
                      value={config.autoStartListener ? "yes" : "no"}
                      onChange={(e) => setConfig({ ...config, autoStartListener: e.target.value === "yes" })}
                      className="w-full bg-transparent text-xs text-white outline-none"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
             </div>
          </div>
        </section>


        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Reward Triggers</h2>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={newRewardName}
                onChange={(e) => setNewRewardName(e.target.value)}
                placeholder="Gift Name (e.g. Rose)"
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm max-w-[150px] focus:border-emerald-500/50 outline-none"
              />
              <button 
                onClick={addReward}
                className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition flex-shrink-0"
              >
                <Plus size={20} className="text-emerald-400" />
              </button>
            </div>
          </div>

          {/* Detected Gifts from TikTok */}
          {detectedGifts.length > 0 && (
            <div className="mb-4 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Gift size={16} className="text-purple-400" />
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Gift Terdeteksi dari TikTok</span>
              </div>
              <p className="text-[10px] text-neutral-500 mb-2">Klik untuk menambahkan sebagai reward trigger:</p>
              <div className="flex flex-wrap gap-2">
                {detectedGifts
                  .filter(g => !config.rewards[g.name])
                  .map(g => (
                    <button
                      key={g.name}
                      onClick={() => {
                        const defaultAction = {
                          type: "click" as const, x: 500, y: 500, keycode: null, swipe: null, inputParams: null, delayAfter: 500
                        };
                        setConfig({
                          ...config,
                          rewards: { ...config.rewards, [g.name]: { actions: [defaultAction] } }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-lg text-xs hover:bg-purple-500/20 transition"
                    >
                      <Plus size={10} />
                      {g.name}
                      <span className="text-[8px] text-purple-500/60">({g.count}×)</span>
                    </button>
                  ))}
                {detectedGifts.filter(g => config.rewards[g.name]).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detectedGifts.filter(g => config.rewards[g.name]).map(g => (
                      <span key={g.name} className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/60 rounded-lg text-[10px]">
                        ✓ {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Curated Gift Library */}
          {tiktokGifts.length > 0 && (
            <div className="mb-4 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={16} className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Library Hadiah TikTok (Siap Pakai)</span>
              </div>
              <p className="text-[10px] text-neutral-500 mb-2">Pilih hadiah populer untuk ditambahkan:</p>
              <div className="space-y-3">
                {["Populer", "Menengah", "Sultan"].map(cat => (
                  <div key={cat} className="space-y-1">
                    <div className="text-[9px] text-neutral-600 font-bold uppercase">{cat}</div>
                    <div className="flex flex-wrap gap-2">
                      {tiktokGifts
                        .filter(g => g.category === cat && !config.rewards[g.name])
                        .map(g => (
                          <button
                            key={g.name}
                            onClick={() => {
                              const defaultAction = {
                                type: "click" as const, x: 500, y: 500, keycode: null, swipe: null, inputParams: null, delayAfter: 500
                              };
                              setConfig({
                                ...config,
                                rewards: { ...config.rewards, [g.name]: { actions: [defaultAction] } }
                              });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/80 rounded-lg text-[10px] hover:bg-emerald-500/10 transition"
                          >
                            <Plus size={10} />
                            {g.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Special Events Library */}
          <div className="mb-6 p-6 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4">
               <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold animate-pulse">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                 TERHUBUNG KE NOTIF LIKE
               </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                <Zap size={24} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Like Milestone Trigger</h3>
                <p className="text-xs text-neutral-500">Pemicu aksi otomatis setiap kelipatan jumlah like tercapai.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-3 uppercase font-bold tracking-widest">Aktivasi</p>
                  {!config.rewards["Like Milestone"] ? (
                    <button
                      onClick={() => {
                        const defaultAction = {
                          type: "click" as const, x: 500, y: 500, keycode: null, swipe: null, inputParams: null, delayAfter: 500
                        };
                        setConfig({
                          ...config,
                          rewards: { ...config.rewards, ["Like Milestone"]: { actions: [defaultAction] } }
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition group w-full justify-center"
                    >
                      <Plus size={16} className="group-hover:scale-125 transition" />
                      AKTIFKAN LIKE MILESTONE
                    </button>
                  ) : (
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                         <Check size={18} /> Aktif & Siap
                       </div>
                       <button 
                        onClick={() => {
                          const newRewards = { ...config.rewards };
                          delete newRewards["Like Milestone"];
                          setConfig({ ...config, rewards: newRewards });
                        }}
                        className="text-[10px] font-bold text-red-500/50 hover:text-red-500 transition"
                       >
                         NONAKTIFKAN
                       </button>
                    </div>
                  )}
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-3 uppercase font-bold tracking-widest">Threshold (Target Like)</p>
                  <div className="relative">
                    <input 
                      type="number"
                      value={config.widgetConfig.likeThreshold || 100}
                      onChange={(e) => setConfig({
                        ...config,
                        widgetConfig: { ...config.widgetConfig, likeThreshold: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-amber-400 focus:border-amber-500/50 outline-none pr-12 font-mono"
                    />
                    <span className="absolute right-3 top-2.5 text-[10px] text-neutral-600 font-bold">LIKES</span>
                  </div>
                  <p className="text-[9px] text-neutral-600 mt-2 italic">Aksi dipicu setiap {config.widgetConfig.likeThreshold || 100} Like.</p>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                  <p className="text-[10px] text-neutral-500 mb-3 uppercase font-bold tracking-widest">Mode Milestone</p>
                  <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800">
                    <button 
                      onClick={() => setConfig({
                        ...config,
                        widgetConfig: { ...config.widgetConfig, milestoneMode: 'global' }
                      })}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition ${config.widgetConfig.milestoneMode !== 'individual' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "text-neutral-500 hover:text-neutral-300"}`}
                    >
                      SEMUA ORANG
                    </button>
                    <button 
                      onClick={() => setConfig({
                        ...config,
                        widgetConfig: { ...config.widgetConfig, milestoneMode: 'individual' }
                      })}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition ${config.widgetConfig.milestoneMode === 'individual' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "text-neutral-500 hover:text-neutral-300"}`}
                    >
                      PER ORANG
                    </button>
                  </div>
                  <p className="text-[9px] text-neutral-600 mt-2 italic">
                    {config.widgetConfig.milestoneMode === 'individual' 
                      ? "Target dihitung per individu." 
                      : "Target dihitung akumulasi semua user."}
                  </p>
                </div>
              </div>

              {config.rewards["Like Milestone"] && (
                <div className="bg-neutral-950/50 rounded-xl border border-neutral-800/50 p-1">
                   <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Konfigurasi Aksi ADB</span>
                   </div>
                   <TriggerConfigurator 
                      giftName="Like Milestone"
                      config={config.rewards["Like Milestone"]}
                      onChange={(newC) => updateReward("Like Milestone", newC)}
                      onRemove={() => {}} // Handle empty or use global remove
                      testEndpoint="/api/like-event"
                      testPayloadExtras={{ isMilestone: true, type: 'like' }}
                    />
                </div>
              )}
            </div>
          </div>

          {/* Preset Management Bar */}
          <div className="mb-6 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen size={16} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Config Presets</span>
              {activePresetName && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Aktif: {activePresetName}</span>
              )}
            </div>
            
            {/* Existing presets */}
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {presets.map(p => (
                  <div key={p.id} className={`flex items-center gap-1.5 text-xs rounded-lg border transition ${
                    activePresetName === p.name 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                  }`}>
                    {editingPresetName === p.name ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <input 
                          type="text"
                          value={editedPresetName}
                          onChange={(e) => setEditedPresetName(e.target.value)}
                          className="bg-neutral-900 border border-emerald-500/50 rounded px-1.5 py-0.5 text-[10px] text-white outline-none w-24"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renamePreset(p.name, editedPresetName);
                            if (e.key === 'Escape') setEditingPresetName(null);
                          }}
                        />
                        <button onClick={() => renamePreset(p.name, editedPresetName)} className="text-emerald-400 hover:text-emerald-300">
                           <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={() => loadPreset(p.name)}
                          className="flex items-center gap-1.5 px-3 py-2 hover:text-white transition"
                        >
                          <Download size={12} />
                          {p.name}
                        </button>
                        <button 
                          onClick={() => { setEditingPresetName(p.name); setEditedPresetName(p.name); }}
                          className="text-neutral-600 hover:text-emerald-400 transition"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={() => deletePreset(p.name)}
                          className="pr-2 text-red-500/50 hover:text-red-400 transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Save / Update Actions */}
            <div className="space-y-3">
              {activePresetName && (
                <button 
                  onClick={updateActivePreset}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold py-2.5 rounded-lg border border-emerald-500/20 transition"
                >
                  <Save size={14} /> UPDATE PRESET "{activePresetName}"
                </button>
              )}
              
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Simpan sebagai preset baru..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:border-amber-500/50 outline-none"
                />
                <button 
                  onClick={saveAsPreset}
                  disabled={!newPresetName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition disabled:opacity-30"
                >
                  <Plus size={12} /> Simpan Baru
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(config.rewards).length === 0 ? (
              <div className="col-span-1 md:col-span-2 text-center p-12 border border-dashed border-neutral-800 rounded-xl text-neutral-500">
                No rewards configured yet.
              </div>
            ) : (
              Object.entries(config.rewards)
                .filter(([name]) => name !== "Like Milestone")
                .map(([giftName, rewardConfig]) => (
                <TriggerConfigurator 
                  key={giftName}
                  giftName={giftName}
                  config={rewardConfig}
                  availableSuggestions={Array.from(new Set([
                    ...detectedGifts.map(g => g.name),
                    ...tiktokGifts.map(g => g.name)
                  ])).filter(n => n !== giftName && !config.rewards[n])}
                  onChange={(newC) => updateReward(giftName, newC)}
                  onRemove={() => removeReward(giftName)}
                  onRename={handleRenameReward}
                />
              ))
            )}
          </div>
        </section>

        {showScanner && (
            <QRCodeScanner 
                onScan={handleQRScan}
                onClose={() => setShowScanner(false)}
            />
        )}
      </div>
    </main>
  );
}
