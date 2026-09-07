"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Type, Image as ImageIcon, RotateCcw, RotateCw, X, Save, Volume2, MessageSquare, Mic2, Upload, Zap, Eye, EyeOff, Trash2, Play, Heart, Gift, Crown, UserPlus, Settings } from "lucide-react";

interface Element {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; 
  style?: {
    color?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    fontFamily?: string;
    textAlign?: string;
    strokeColor?: string;
    strokeWidth?: number;
    objectFit?: "contain" | "cover" | "fill" | "none";
    verticalAlign?: "top" | "middle" | "bottom";
  };
  eventTypes?: string[]; 
  overrides?: Record<string, {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    objectFit?: "contain" | "cover" | "fill" | "none";
    textAlign?: string;
    verticalAlign?: string;
    content?: string;
  }>;
}

const AudioStatus: React.FC<{ locked: boolean; onClick: () => void }> = ({ locked, onClick }) => {
    if (!locked) return null;
    return (
        <div 
            onClick={onClick}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer group"
        >
            <div className="bg-neutral-900 border border-emerald-500/30 p-8 rounded-3xl shadow-2xl text-center transform transition group-hover:scale-105">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Volume2 size={40} />
                </div>
                <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">Audio Terkunci</h2>
                <p className="text-neutral-400 text-sm mb-6 max-w-[240px]">Browser memblokir suara otomatis. Klik di mana saja untuk mengaktifkan suara widget.</p>
                <button className="px-8 py-3 bg-emerald-500 text-black font-black rounded-xl uppercase tracking-widest text-xs hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20">
                    Aktifkan Suara Sekarang
                </button>
            </div>
        </div>
    );
};

interface NotificationItem {
    id: string;
    type: "gift" | "comment" | "like" | "join" | "follow" | "fan" | "share";
    giftName: string;
    namaHadiah?: string; 
    nickname: string;
    username: string;
    message: string;
    likeCount?: number;
    repeatCount?: number;
    repeatEnd?: boolean;
    msgId?: string;
    adbData?: any;
    priority: number; // 0=low (comment, join), 1=medium (like), 2=high (gift)
    prefetchedAudioUrl?: string;
    triggerRewardsEnabled?: boolean;
    rawComment?: string;
}

interface WidgetConfig {
  voiceOverTemplate: string;
  commentVoiceOverTemplate: string;
  likeVoiceOverTemplate: string;
  joinVoiceOverTemplate: string;
  followVoiceOverTemplate: string;
  fanVoiceOverTemplate: string;
  shareVoiceOverTemplate: string;
  openingSoundUrl: string;
  commentOpeningSoundUrl: string;
  likeOpeningSoundUrl: string;
  followOpeningSoundUrl: string;
  fanOpeningSoundUrl: string;
  shareOpeningSoundUrl: string;
  joinOpeningSoundUrl: string;
  ttsEnabled: boolean;
  useLocalTTS: boolean;
  ttsSpeed: number;
  showChatOverlay: boolean;
  giftVoice: string;
  commentVoice: string;
  likeVoice: string;
  followVoice: string;
  fanVoice: string;
  shareVoice: string;
  giftTtsEnabled: boolean;
  commentTtsEnabled: boolean;
  likeTtsEnabled: boolean;
  joinTtsEnabled: boolean;
  followTtsEnabled: boolean;
  fanTtsEnabled: boolean;
  shareTtsEnabled: boolean;
  giftImageUrl: string;
  commentImageUrl: string;
  likeImageUrl: string;
  joinImageUrl: string;
  followImageUrl: string;
  fanImageUrl: string;
  shareImageUrl: string;
  likeThreshold: number;
  giftEnabled: boolean;
  commentEnabled: boolean;
  likeEnabled: boolean;
  joinEnabled: boolean;
  followEnabled: boolean;
  fanEnabled: boolean;
  shareEnabled: boolean;
  onScreenGiftTemplate: string;
  onScreenLikeTemplate: string;
  onScreenJoinTemplate: string;
  onScreenFollowTemplate: string;
  onScreenFanTemplate: string;
  onScreenShareTemplate: string;
  onScreenCommentTemplate: string;
  tiktokUsername: string;
  triggerRewardsEnabled: boolean;
}

const DEFAULT_CONFIG: WidgetConfig = {
  voiceOverTemplate: "Terimakasih {nickname} sudah kirim {giftname}!",
  commentVoiceOverTemplate: "{nickname} bilang: {comment}",
  likeVoiceOverTemplate: "Wah sudah {likecount} like! Terimakasih {nickname}!",
  joinVoiceOverTemplate: "Halo {nickname}, selamat datang!",
  followVoiceOverTemplate: "Terimakasih {nickname} sudah follow!",
  fanVoiceOverTemplate: "Terimakasih {nickname} sudah menjadi fan!",
  shareVoiceOverTemplate: "Terimakasih {nickname} sudah share live ini!",
  openingSoundUrl: "",
  commentOpeningSoundUrl: "",
  likeOpeningSoundUrl: "",
  followOpeningSoundUrl: "",
  fanOpeningSoundUrl: "",
  shareOpeningSoundUrl: "",
  joinOpeningSoundUrl: "",
  ttsEnabled: true,
  useLocalTTS: true,
  ttsSpeed: 1.1,
  showChatOverlay: true,
  giftVoice: "id-ID-ArdiNeural",
  commentVoice: "id-ID-ArdiNeural",
  likeVoice: "id-ID-GadisNeural",
  followVoice: "id-ID-ArdiNeural",
  fanVoice: "id-ID-ArdiNeural",
  shareVoice: "id-ID-ArdiNeural",
  giftTtsEnabled: true,
  commentTtsEnabled: true,
  likeTtsEnabled: true,
  joinTtsEnabled: true,
  followTtsEnabled: true,
  fanTtsEnabled: true,
  shareTtsEnabled: true,
  shareImageUrl: "",
  likeThreshold: 100,
  giftEnabled: true,
  shareEnabled: true,
  commentEnabled: false,
  giftImageUrl: "",
  commentImageUrl: "",
  likeImageUrl: "",
  joinImageUrl: "",
  followImageUrl: "",
  fanImageUrl: "",
  likeEnabled: true,
  joinEnabled: true,
  followEnabled: true,
  fanEnabled: true,
  onScreenGiftTemplate: "Terimakasih {nickname} sudah mengirim {giftname}!",
  onScreenLikeTemplate: "Wah sudah {likecount} like! Terimakasih {nickname}!",
  onScreenJoinTemplate: "{nickname} bergabung!",
  onScreenFollowTemplate: "{nickname} mengikuti!",
  onScreenFanTemplate: "{nickname} menjadi fan!",
  onScreenShareTemplate: "{nickname} membagikan live!",
  onScreenCommentTemplate: "{nickname} bilang: {comment}",
  tiktokUsername: "@onlyvirtus",
  triggerRewardsEnabled: true,
};

const VOICE_OPTIONS = [
  { value: "id-ID-ArdiNeural", label: "Ardi (Pria)" },
  { value: "id-ID-GadisNeural", label: "Gadis (Wanita)" },
];

const LOCAL_STORAGE_KEY = "widgetConfig_v2";

export default function WidgetPage() {
  const [elements, setElements] = useState<Element[]>([]);
  const [history, setHistory] = useState<Element[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showEditor, setShowEditor] = useState(false);
  const [isGreenScreen, setIsGreenScreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"gift" | "comment" | "like" | "join" | "follow" | "fan" | "share">("gift");
  const [rewards, setRewards] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [referenceTab, setReferenceTab] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [activeNotification, setActiveNotification] = useState<NotificationItem | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const notificationQueue = useRef<NotificationItem[]>([]);
  const isProcessingQueue = useRef(false);
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const [audioLocked, setAudioLocked] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Element[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const prefetchedTTS = useRef<Map<string, AudioBuffer>>(new Map());
  const activePrefetches = useRef<number>(0);
  const configRef = useRef(config);
  const lastProcessTime = useRef<number>(Date.now());
  const watchdogInterval = useRef<NodeJS.Timeout | null>(null);
  const completedCombosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const fonts = ["Baloo 2", "Open Sans", "Inter", "Roboto", "Passion One"];

  // ==========================================
  // WATCHDOG TIMER (Auto-Recovery)
  // ==========================================
  useEffect(() => {
    watchdogInterval.current = setInterval(() => {
        if (isProcessingQueue.current) {
            const timeSinceLastUpdate = Date.now() - lastProcessTime.current;
            if (timeSinceLastUpdate > 30000) { // 30 seconds stuck
                console.warn("⚠️ [WATCHDOG] Queue stuck for 30s. Force resetting...");
                isProcessingQueue.current = false;
                setNotifVisible(false);
                setActiveNotification(null);
                processQueue();
            }
        }
    }, 5000);

    return () => {
        if (watchdogInterval.current) clearInterval(watchdogInterval.current);
    };
  }, []);

  // ==========================================
  // AUDIO CONTEXT UNLOCK & AUTO-START
  // ==========================================
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const tryUnlock = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          gainNode.gain.value = 0;
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.start(0);
          oscillator.stop(ctx.currentTime + 0.1);

          if (silentAudioRef.current) {
            silentAudioRef.current.play().catch(() => {});
          }

          setAudioLocked(false);
          console.log("[AUDIO] Context resumed.");
        } catch (e) {
          setAudioLocked(true);
        }
      } else if (ctx.state === 'running') {
        setAudioLocked(false);
      }
    };

    tryUnlock();
    const events = ["click", "touchstart", "focus", "keydown", "mousedown"];
    const handler = () => tryUnlock();
    events.forEach(e => window.addEventListener(e, handler));
    document.addEventListener("visibilitychange", tryUnlock);

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      document.removeEventListener("visibilitychange", tryUnlock);
    };
  }, []);

  // ==========================================
  // SSE CONNECTION
  // ==========================================
  const sseConnection = useRef<EventSource | null>(null);
  const duplicateGuard = useRef<Set<string>>(new Set());
  const processedEventIds = useRef<Set<string>>(new Set()); // Permanent dedup for exact event IDs
  const lastLikeMilestone = useRef<number>(0);

  useEffect(() => {
    loadConfig();
    if (sseConnection.current) return;

    const eventSource = new EventSource("/api/events");
    sseConnection.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        const rawEventId = String(data.eventId || data.msgId || data.giftId || data.timestamp || "");
        const contentHash = `${data.username}_${data.giftName || data.comment || ""}_${data.repeatCount || 1}`;
        
        // 1. Absolute Dedup (If eventId is perfectly identical, drop it permanently)
        if (data.eventId && processedEventIds.current.has(data.eventId)) {
            console.log(`[Widget] Dropped identical eventId: ${data.eventId}`);
            return;
        }
        if (data.eventId) processedEventIds.current.add(data.eventId);
        
        // Clean up permanent cache to avoid memory leaks (keep last 500)
        if (processedEventIds.current.size > 500) {
             const iterator = processedEventIds.current.values();
             for (let i = 0; i < 100; i++) {
                 const nextVal = iterator.next().value;
                 if (nextVal !== undefined) {
                     processedEventIds.current.delete(nextVal);
                 } else {
                     break;
                 }
             }
        }

        // 2. Primary Dedup (Event ID fallback for 10s)
        if (rawEventId && duplicateGuard.current.has(`${payload.type}_${rawEventId}`)) return;
        
        // 3. Secondary Dedup (Content Hash - 3s window)
        const contentDedupId = `${payload.type}_content_${contentHash}`;
        if (duplicateGuard.current.has(contentDedupId)) {
            console.log(`[Widget] Dropped content duplicate: ${contentDedupId}`);
            return;
        }

        // Register in guard
        if (rawEventId) {
            const idKey = `${payload.type}_${rawEventId}`;
            duplicateGuard.current.add(idKey);
            setTimeout(() => duplicateGuard.current.delete(idKey), 10000); // 10s window
        }
        
        duplicateGuard.current.add(contentDedupId);
        setTimeout(() => duplicateGuard.current.delete(contentDedupId), 3000); // 3s window for content match
 
        if (payload.type === 'like') {
            if (data.isTest) {
                addToQueue({ ...payload, isMilestone: true, likeCount: config.likeThreshold || 50 });
                return;
            }
            if (data.isMilestone) {
                addToQueue(payload);
            } else {
                const currentTotal = data.likeCount || 0;
                const threshold = config.likeThreshold || 100;
                const milestone = Math.floor(currentTotal / threshold) * threshold;
                if (milestone > 0 && milestone > lastLikeMilestone.current) {
                    lastLikeMilestone.current = milestone;
                    addToQueue({ ...payload, likeCount: milestone });
                }
            }
            return;
        }

        addToQueue(payload);
      } catch (e) {}
    };

    return () => {
        if (sseConnection.current === eventSource) {
           eventSource.close();
           sseConnection.current = null;
        }
    };
  }, []);

  // ==========================================
  // CONFIG PERSISTENCE
  // ==========================================
  const loadConfig = async () => {
    try {
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.config) setConfig(prev => ({ ...DEFAULT_CONFIG, ...parsed.config }));
        if (parsed.elements && Array.isArray(parsed.elements)) setElements(parsed.elements);
      }
    } catch (e) {}

    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.widgetConfig) {
        const serverConfig: WidgetConfig = {
          voiceOverTemplate: data.voiceOverTemplate || data.widgetConfig.voiceOverTemplate || DEFAULT_CONFIG.voiceOverTemplate,
          commentVoiceOverTemplate: data.commentVoiceOverTemplate || data.widgetConfig.commentVoiceOverTemplate || DEFAULT_CONFIG.commentVoiceOverTemplate,
          likeVoiceOverTemplate: data.likeVoiceOverTemplate || data.widgetConfig.likeVoiceOverTemplate || DEFAULT_CONFIG.likeVoiceOverTemplate,
          joinVoiceOverTemplate: data.joinVoiceOverTemplate || data.widgetConfig.joinVoiceOverTemplate || DEFAULT_CONFIG.joinVoiceOverTemplate,
          followVoiceOverTemplate: data.followVoiceOverTemplate || data.widgetConfig.followVoiceOverTemplate || DEFAULT_CONFIG.followVoiceOverTemplate,
          fanVoiceOverTemplate: data.fanVoiceOverTemplate || data.widgetConfig.fanVoiceOverTemplate || DEFAULT_CONFIG.fanVoiceOverTemplate,
          shareVoiceOverTemplate: data.shareVoiceOverTemplate || data.widgetConfig.shareVoiceOverTemplate || DEFAULT_CONFIG.shareVoiceOverTemplate,
          openingSoundUrl: data.openingSoundUrl || data.widgetConfig.openingSoundUrl || "",
          commentOpeningSoundUrl: data.commentOpeningSoundUrl || data.widgetConfig.commentOpeningSoundUrl || "",
          likeOpeningSoundUrl: data.likeOpeningSoundUrl || data.widgetConfig.likeOpeningSoundUrl || "",
          followOpeningSoundUrl: data.followOpeningSoundUrl || data.widgetConfig.followOpeningSoundUrl || "",
          fanOpeningSoundUrl: data.fanOpeningSoundUrl || data.widgetConfig.fanOpeningSoundUrl || "",
          shareOpeningSoundUrl: data.shareOpeningSoundUrl || data.widgetConfig.shareOpeningSoundUrl || "",
          joinOpeningSoundUrl: data.joinOpeningSoundUrl || data.widgetConfig.joinOpeningSoundUrl || "",
          ttsEnabled: data.ttsEnabled ?? data.widgetConfig.ttsEnabled ?? DEFAULT_CONFIG.ttsEnabled,
          useLocalTTS: data.useLocalTTS ?? data.widgetConfig.useLocalTTS ?? DEFAULT_CONFIG.useLocalTTS,
          ttsSpeed: data.ttsSpeed ?? data.widgetConfig.ttsSpeed ?? DEFAULT_CONFIG.ttsSpeed,
          showChatOverlay: false,
          giftVoice: data.giftVoice || data.widgetConfig.giftVoice || DEFAULT_CONFIG.giftVoice,
          commentVoice: data.commentVoice || data.widgetConfig.commentVoice || DEFAULT_CONFIG.commentVoice,
          likeVoice: data.likeVoice || data.widgetConfig.likeVoice || DEFAULT_CONFIG.likeVoice,
          followVoice: data.followVoice || data.widgetConfig.followVoice || DEFAULT_CONFIG.followVoice,
          fanVoice: data.fanVoice || data.widgetConfig.fanVoice || DEFAULT_CONFIG.fanVoice,
          shareVoice: data.shareVoice || data.widgetConfig.shareVoice || DEFAULT_CONFIG.shareVoice,
          giftTtsEnabled: data.giftTtsEnabled ?? data.widgetConfig.giftTtsEnabled ?? DEFAULT_CONFIG.giftTtsEnabled,
          commentTtsEnabled: data.commentTtsEnabled ?? data.widgetConfig.commentTtsEnabled ?? DEFAULT_CONFIG.commentTtsEnabled,
          likeTtsEnabled: data.likeTtsEnabled ?? data.widgetConfig.likeTtsEnabled ?? DEFAULT_CONFIG.likeTtsEnabled,
          joinTtsEnabled: data.joinTtsEnabled ?? data.widgetConfig.joinTtsEnabled ?? DEFAULT_CONFIG.joinTtsEnabled,
          followTtsEnabled: data.followTtsEnabled ?? data.widgetConfig.followTtsEnabled ?? DEFAULT_CONFIG.followTtsEnabled,
          fanTtsEnabled: data.fanTtsEnabled ?? data.widgetConfig.fanTtsEnabled ?? DEFAULT_CONFIG.fanTtsEnabled,
          shareTtsEnabled: data.shareTtsEnabled ?? data.widgetConfig.shareTtsEnabled ?? DEFAULT_CONFIG.shareTtsEnabled,
          giftImageUrl: data.widgetConfig.giftImageUrl || "",
          commentImageUrl: data.widgetConfig.commentImageUrl || "",
          likeImageUrl: data.widgetConfig.likeImageUrl || "",
          joinImageUrl: data.widgetConfig.joinImageUrl || "",
          followImageUrl: data.widgetConfig.followImageUrl || "",
          fanImageUrl: data.widgetConfig.fanImageUrl || "",
          shareImageUrl: data.widgetConfig.shareImageUrl || "",
          likeThreshold: data.widgetConfig.likeThreshold ?? DEFAULT_CONFIG.likeThreshold,
          giftEnabled: data.giftEnabled ?? data.widgetConfig.giftEnabled ?? DEFAULT_CONFIG.giftEnabled,
          commentEnabled: data.commentEnabled ?? data.widgetConfig.commentEnabled ?? DEFAULT_CONFIG.commentEnabled,
          likeEnabled: data.likeEnabled ?? data.widgetConfig.likeEnabled ?? DEFAULT_CONFIG.likeEnabled,
          joinEnabled: data.joinEnabled ?? data.widgetConfig.joinEnabled ?? DEFAULT_CONFIG.joinEnabled,
          followEnabled: data.followEnabled ?? data.widgetConfig.followEnabled ?? DEFAULT_CONFIG.followEnabled,
          fanEnabled: data.fanEnabled ?? data.widgetConfig.fanEnabled ?? DEFAULT_CONFIG.fanEnabled,
          shareEnabled: data.shareEnabled ?? data.widgetConfig.shareEnabled ?? DEFAULT_CONFIG.shareEnabled,
          onScreenGiftTemplate: data.onScreenGiftTemplate || data.widgetConfig.onScreenGiftTemplate || DEFAULT_CONFIG.onScreenGiftTemplate,
          onScreenLikeTemplate: data.onScreenLikeTemplate || data.widgetConfig.onScreenLikeTemplate || DEFAULT_CONFIG.onScreenLikeTemplate,
          onScreenJoinTemplate: data.onScreenJoinTemplate || data.widgetConfig.onScreenJoinTemplate || DEFAULT_CONFIG.onScreenJoinTemplate,
          onScreenFollowTemplate: data.onScreenFollowTemplate || data.widgetConfig.onScreenFollowTemplate || DEFAULT_CONFIG.onScreenFollowTemplate,
          onScreenFanTemplate: data.onScreenFanTemplate || data.widgetConfig.onScreenFanTemplate || DEFAULT_CONFIG.onScreenFanTemplate,
          onScreenShareTemplate: data.onScreenShareTemplate || data.widgetConfig.onScreenShareTemplate || DEFAULT_CONFIG.onScreenShareTemplate,
          onScreenCommentTemplate: data.onScreenCommentTemplate || data.widgetConfig.onScreenCommentTemplate || DEFAULT_CONFIG.onScreenCommentTemplate,
          tiktokUsername: data.tiktokUsername || DEFAULT_CONFIG.tiktokUsername,
          triggerRewardsEnabled: data.triggerRewardsEnabled ?? DEFAULT_CONFIG.triggerRewardsEnabled,
        };
        setConfig(serverConfig);
        if (data.widgetConfig.elements) setElements(data.widgetConfig.elements);
        if (data.rewards) setRewards(data.rewards);
        saveToLocalStorage(serverConfig, data.widgetConfig.elements || []);
      }
    } catch (err) {}
  };

  const saveToLocalStorage = (cfg: WidgetConfig, els: Element[]) => {
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ config: cfg, elements: els })); } catch (e) {}
  };

  const saveConfig = async () => {
    setIsSaving(true);
    saveToLocalStorage(config, elements);
    try {
      const res = await fetch("/api/config");
      const current = await res.json();
      const updated = {
        ...current,
        tiktokUsername: config.tiktokUsername,
        ttsEnabled: config.ttsEnabled,
        ttsSpeed: config.ttsSpeed,
        useLocalTTS: config.useLocalTTS,
        giftEnabled: config.giftEnabled,
        giftTtsEnabled: config.giftTtsEnabled,
        giftVoice: config.giftVoice,
        voiceOverTemplate: config.voiceOverTemplate,
        openingSoundUrl: config.openingSoundUrl,
        commentEnabled: config.commentEnabled,
        commentTtsEnabled: config.commentTtsEnabled,
        commentVoice: config.commentVoice,
        commentVoiceOverTemplate: config.commentVoiceOverTemplate,
        commentOpeningSoundUrl: config.commentOpeningSoundUrl,
        likeEnabled: config.likeEnabled,
        likeTtsEnabled: config.likeTtsEnabled,
        likeVoice: config.likeVoice,
        likeVoiceOverTemplate: config.likeVoiceOverTemplate,
        likeOpeningSoundUrl: config.likeOpeningSoundUrl,
        joinEnabled: config.joinEnabled,
        joinTtsEnabled: config.joinTtsEnabled,
        joinVoiceOverTemplate: config.joinVoiceOverTemplate,
        joinOpeningSoundUrl: config.joinOpeningSoundUrl,
        followEnabled: config.followEnabled,
        followTtsEnabled: config.followTtsEnabled,
        followVoice: config.followVoice,
        followVoiceOverTemplate: config.followVoiceOverTemplate,
        followOpeningSoundUrl: config.followOpeningSoundUrl,
        fanEnabled: config.fanEnabled,
        fanTtsEnabled: config.fanTtsEnabled,
        fanVoice: config.fanVoice,
        fanVoiceOverTemplate: config.fanVoiceOverTemplate,
        fanOpeningSoundUrl: config.fanOpeningSoundUrl,
        shareEnabled: config.shareEnabled,
        shareTtsEnabled: config.shareTtsEnabled,
        shareVoice: config.shareVoice,
        shareVoiceOverTemplate: config.shareVoiceOverTemplate,
        shareOpeningSoundUrl: config.shareOpeningSoundUrl,
        widgetConfig: { ...current.widgetConfig, ...config, elements: elements }
      };
      await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    } catch (err) { alert("Save failed"); } finally { setIsSaving(false); }
  };

  // ==========================================
  // NOTIFICATION QUEUE SYSTEM (PRIORITY & EXTREME LOAD)
  // ==========================================
  const addToQueue = (evtData: any) => {
    const currentConfig = configRef.current;
    const type = evtData.type || 'gift';
    const data = evtData.data || evtData;

    let voiceMessage = "";
    let priority = 0;
    let voiceModel = currentConfig.commentVoice;

    if (type === 'comment') {
        voiceMessage = currentConfig.commentVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer").replace(/{comment}/g, data.comment || "");
        priority = 0;
    } else if (type === 'like') {
        voiceMessage = currentConfig.likeVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer").replace(/{likecount}/g, String(data.likeCount || 0));
        priority = 1;
        voiceModel = currentConfig.likeVoice;
    } else if (type === 'join') {
        voiceMessage = currentConfig.joinVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer");
        priority = 0;
    } else if (type === 'follow') {
        voiceMessage = currentConfig.followVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer");
        priority = 0;
        voiceModel = currentConfig.followVoice;
    } else if (type === 'fan') {
        voiceMessage = currentConfig.fanVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer");
        priority = 1;
        voiceModel = currentConfig.fanVoice;
    } else if (type === 'share') {
        voiceMessage = currentConfig.shareVoiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer");
        priority = 1;
        voiceModel = currentConfig.shareVoice;
    } else {
        voiceMessage = currentConfig.voiceOverTemplate.replace(/{nickname}/g, data.nickname || "Viewer").replace(/{username}/g, data.username || "Viewer").replace(/{giftname}/g, data.namaHadiah || data.giftName || "Hadiah").replace(/{repeatcount}/g, String(data.repeatCount || 1));
        priority = 2;
        voiceModel = currentConfig.giftVoice;
    }

    const item: NotificationItem = {
        id: Math.random().toString(36).substr(2, 9), type, giftName: data.giftName || "", namaHadiah: data.namaHadiah || data.giftName || "Hadiah",
        nickname: data.nickname || data.username || "Viewer", username: data.username || "Viewer", message: voiceMessage,
        likeCount: data.likeCount, repeatCount: data.repeatCount || 1, repeatEnd: data.repeatEnd ?? true, msgId: data.msgId,
        adbData: (type === 'gift' || type === 'like') ? data.actions : null, priority, triggerRewardsEnabled: data.triggerRewardsEnabled ?? true, rawComment: data.comment || ""
    };

    const queue = notificationQueue.current;
    // MERGE GIFTS (Same User + Same Gift)
    if (type === 'gift' && data.msgId) {
        const existingIdx = queue.findIndex(q => q.type === 'gift' && q.username === data.username && q.msgId === data.msgId);
        if (existingIdx !== -1) {
            queue[existingIdx].repeatCount = data.repeatCount;
            queue[existingIdx].repeatEnd = data.repeatEnd;
            return;
        }
        const current = activeNotificationRef.current;
        if (current && current.type === 'gift' && current.username === data.username && current.msgId === data.msgId) {
            setActiveNotification(prev => prev ? { ...prev, repeatCount: data.repeatCount } : null);
            activeNotificationRef.current!.repeatCount = data.repeatCount;
            return;
        }

        // If not in queue or active, check if we already processed this combo recently
        if (completedCombosRef.current.has(data.msgId)) {
            // It's a late update for a combo we already finished displaying. Drop it to prevent duplicate notifications.
            return;
        }
        
        // New combo, track it so we don't duplicate later
        completedCombosRef.current.add(data.msgId);
        setTimeout(() => completedCombosRef.current.delete(data.msgId), 60000); // 1 minute memory
    }

    // STRICT LIMITS (Anti-Memory Leak)
    if (priority === 2) {
        if (queue.filter(q => q.priority === 2).length > 100) return; // Drop if > 100 gifts
        let insertAt = 0;
        while (insertAt < queue.length && queue[insertAt].priority >= 2) insertAt++;
        queue.splice(insertAt, 0, item);
    } else {
        if (queue.length > 150) return; // Drop non-gifts if queue too long
        queue.push(item);
    }

    // DYNAMIC PREFETCH (Skip low priority under load)
    const qLen = queue.length;
    let shouldPrefetch = true;
    if (qLen > 10 && priority === 0) shouldPrefetch = false;
    if (qLen > 20 && priority === 1) shouldPrefetch = false;

    if (currentConfig.ttsEnabled && shouldPrefetch) {
        prefetchTTSAudio(item.id, voiceMessage, voiceModel);
    }

    if (priority === 2 && isProcessingQueue.current) {
        interruptIfLowPriority();
    }

    processQueue();
  };

  const interruptFlag = useRef(false);
  const activeNotificationRef = useRef<NotificationItem | null>(null);

  const interruptIfLowPriority = () => {
    const current = activeNotificationRef.current;
    if (current && current.priority < 2) {
        if (currentAudioSource.current) {
            try { currentAudioSource.current.stop(); } catch (e) {}
            currentAudioSource.current = null;
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        interruptFlag.current = true;
    }
  };

  const isTypeEnabled = (type: string) => {
    const cfg = configRef.current;
    if (type === 'gift') return cfg.giftEnabled !== false;
    if (type === 'comment') return cfg.commentEnabled !== false;
    if (type === 'like') return cfg.likeEnabled !== false;
    if (type === 'join') return cfg.joinEnabled !== false;
    if (type === 'follow') return cfg.followEnabled !== false;
    if (type === 'fan') return cfg.fanEnabled !== false;
    if (type === 'share') return cfg.shareEnabled !== false;
    return true;
  };

  const prefetchTTSAudio = async (itemId: string, text: string, voice: string) => {
    const currentConfig = configRef.current;
    if (!currentConfig.useLocalTTS || activePrefetches.current >= 3) return;
    activePrefetches.current++;
    try {
      const url = `/api/tts?text=${encodeURIComponent(text)}&speed=${currentConfig.ttsSpeed}&voice=${encodeURIComponent(voice)}`;
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (!audioContextRef.current) audioContextRef.current = new AudioContext();
        const buf = await audioContextRef.current.decodeAudioData(ab);
        prefetchedTTS.current.set(itemId, buf);
      }
    } catch (e) {} finally { activePrefetches.current--; }
  };

  const processQueue = async () => {
    if (isProcessingQueue.current || notificationQueue.current.length === 0) return;
    isProcessingQueue.current = true;
    interruptFlag.current = false;
    lastProcessTime.current = Date.now();

    const item = notificationQueue.current.shift()!;
    if (!isTypeEnabled(item.type)) {
        isProcessingQueue.current = false;
        processQueue();
        return;
    }

    activeNotificationRef.current = item;
    setActiveNotification(item);
    const cfg = configRef.current;
    const qLen = notificationQueue.current.length;

    // DYNAMIC THROTTLING
    let displayDuration = 3000;
    let skipMusic = false;
    let skipTTS = false;

    if (qLen > 5 && item.priority < 2) { displayDuration = 1500; skipMusic = true; }
    if (qLen > 15) { displayDuration = 800; skipMusic = true; }
    if (qLen > 30) { displayDuration = 400; skipTTS = item.priority < 2; skipMusic = true; }

    // TTS LOGIC
    let ttsBuffer: AudioBuffer | null = null;
    let itemTtsEnabled = true;
    const type = item.type;
    if (type === 'gift') itemTtsEnabled = cfg.giftTtsEnabled !== false;
    else if (type === 'comment') itemTtsEnabled = cfg.commentTtsEnabled !== false;
    else if (type === 'like') itemTtsEnabled = cfg.likeTtsEnabled !== false;
    else if (type === 'join') itemTtsEnabled = cfg.joinTtsEnabled !== false;
    else if (type === 'follow') itemTtsEnabled = cfg.followTtsEnabled !== false;
    else if (type === 'share') itemTtsEnabled = cfg.shareTtsEnabled !== false;
    else if (type === 'fan') itemTtsEnabled = cfg.fanTtsEnabled !== false;

    if (cfg.ttsEnabled && itemTtsEnabled && !skipTTS) {
        if (prefetchedTTS.current.has(item.id)) {
            ttsBuffer = prefetchedTTS.current.get(item.id)!;
            prefetchedTTS.current.delete(item.id);
        } else if (item.priority === 2) {
            // Wait up to 2s for high priority gift TTS
            for(let i=0; i<20; i++) {
                if (prefetchedTTS.current.has(item.id)) { ttsBuffer = prefetchedTTS.current.get(item.id)!; break; }
                await new Promise(r => setTimeout(r, 100));
            }
        }
    }

    setNotifVisible(true);

    // OPENING SOUND
    let soundUrl = "";
    if (type === "gift") soundUrl = cfg.openingSoundUrl;
    else if (type === "like") soundUrl = cfg.likeOpeningSoundUrl;
    else if (type === "comment") soundUrl = cfg.commentOpeningSoundUrl;
    else if (type === "join") soundUrl = cfg.joinOpeningSoundUrl;
    else if (type === "follow") soundUrl = cfg.followOpeningSoundUrl;
    else if (type === "fan") soundUrl = cfg.fanOpeningSoundUrl;
    else if (type === "share") soundUrl = cfg.shareOpeningSoundUrl;

    if (soundUrl && !skipMusic && !interruptFlag.current) {
        await Promise.race([
            playSound(soundUrl),
            new Promise(r => setTimeout(r, 15000)) // Safety timeout
        ]);
    }

    // TTS PLAYBACK
    if (ttsBuffer && !interruptFlag.current) {
        await playAudioBuffer(ttsBuffer);
    } else if (!interruptFlag.current && !ttsBuffer && !skipTTS && cfg.ttsEnabled && itemTtsEnabled) {
        // Fallback for missing buffer
        await new Promise(r => setTimeout(r, displayDuration));
    } else if (!interruptFlag.current) {
        await new Promise(r => setTimeout(r, displayDuration));
    }

    setNotifVisible(false);
    setTimeout(() => {
        setActiveNotification(null);
        activeNotificationRef.current = null;
        isProcessingQueue.current = false;
        processQueue();
    }, 400);
  };

  const playSound = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(true);
      audio.play().catch(() => resolve(true));
      setTimeout(() => resolve(true), 12000);
    });
  };

  const playAudioBuffer = (buffer: AudioBuffer): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const ctx = audioContextRef.current;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      currentAudioSource.current = src;
      src.onended = () => { currentAudioSource.current = null; resolve(true); };
      src.start(0);
    });
  };

  const getElementState = (el: Element, type?: string) => {
    const ov = type ? el.overrides?.[type] : null;
    return {
        x: ov?.x ?? el.x, y: ov?.y ?? el.y, width: ov?.width ?? el.width, height: ov?.height ?? el.height,
        objectFit: (ov?.objectFit ?? el.style?.objectFit) || "contain", textAlign: (ov?.textAlign ?? el.style?.textAlign) || "center",
        verticalAlign: (ov?.verticalAlign ?? el.style?.verticalAlign) || "middle", content: ov?.content ?? el.content
    };
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, action: "move" | "resize") => {
    if (!showEditor) return;
    e.preventDefault();
    setSelectedId(id);
    setIsDragging(true);
    setShowGuides(true);
    const startX = e.clientX, startY = e.clientY;
    const el = elements.find(item => item.id === id);
    if (!el) return;
    const state = getElementState(el, settingsTab);
    const initial = { x: state.x, y: state.y, w: state.width, h: state.height };

    const move = (me: MouseEvent) => {
        const dx = me.clientX - startX, dy = me.clientY - startY;
        setElements(prev => prev.map(item => {
            if (item.id !== id) return item;
            const newX = action === "move" ? initial.x + dx : initial.x;
            const newY = action === "move" ? initial.y + dy : initial.y;
            const newW = action === "resize" ? Math.max(20, initial.w + dx) : initial.w;
            const newH = action === "resize" ? Math.max(20, initial.h + dy) : initial.h;
            if (settingsTab) {
                return { ...item, overrides: { ...item.overrides, [settingsTab]: { ...item.overrides?.[settingsTab], x: newX, y: newY, width: newW, height: newH } } };
            }
            return { ...item, x: newX, y: newY, width: newW, height: newH };
        }));
    };
    const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        setIsDragging(false);
        setShowGuides(false);
        saveToHistory(elementsRef.current);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const saveToHistory = useCallback((newEls: Element[]) => {
    const next = history.slice(0, historyIndex + 1);
    next.push([...newEls]);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, [history, historyIndex]);

  const undo = () => { if (historyIndex > 0) { setElements(history[historyIndex - 1]); setHistoryIndex(historyIndex - 1); } };
  const redo = () => { if (historyIndex < history.length - 1) { setElements(history[historyIndex + 1]); setHistoryIndex(historyIndex + 1); } };

  const addElement = (type: "text" | "image") => {
    const newEl: Element = {
      id: Math.random().toString(36).substr(2, 9), type, x: 200, y: 200, width: type === "text" ? 300 : 200, height: type === "text" ? 60 : 200,
      content: type === "text" ? "{nickname}" : "", eventTypes: ["gift", "comment", "like", "join", "follow", "fan", "share"],
      style: type === "text" ? { color: "#ffffff", fontSize: 28, fontFamily: "Baloo 2", textAlign: "center" } : undefined
    };
    setElements([...elements, newEl]);
    saveToHistory([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const deleteElement = (id: string) => {
    const next = elements.filter(el => el.id !== id);
    setElements(next);
    saveToHistory(next);
    setSelectedId(null);
  };

  const updateElement = (id: string, updates: Partial<Element>) => {
    setElements(prev => prev.map(el => {
        if (el.id !== id) return el;
        if (settingsTab) {
            const { x, y, width, height, style, content, ...rest } = updates;
            const ov = { ...el.overrides?.[settingsTab], x: x ?? el.overrides?.[settingsTab]?.x, y: y ?? el.overrides?.[settingsTab]?.y, width: width ?? el.overrides?.[settingsTab]?.width, height: height ?? el.overrides?.[settingsTab]?.height, content: content ?? el.overrides?.[settingsTab]?.content };
            if (style) {
                if (style.objectFit) ov.objectFit = style.objectFit;
                if (style.textAlign) ov.textAlign = style.textAlign;
                if (style.verticalAlign) ov.verticalAlign = style.verticalAlign;
            }
            if (content !== undefined) {
                if (el.type === "image") setConfig(p => ({ ...p, [`${settingsTab}ImageUrl`]: content }));
                else if (el.type === "text") setConfig(p => ({ ...p, [`onScreen${settingsTab.charAt(0).toUpperCase() + settingsTab.slice(1)}Template`]: content }));
            }
            return { ...el, ...rest, style: style ? { ...el.style, ...style } : el.style, overrides: { ...el.overrides, [settingsTab]: ov } };
        }
        return { ...el, ...updates };
    }));
  };

  const triggerTestEvent = (type: string) => {
    fetch("/api/test-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
  };

  const handleMediaUpload = (field: keyof WidgetConfig) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.gif,audio/*';
    input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.url) setConfig(p => ({ ...p, [field]: data.url }));
        } catch (err) {}
    };
    input.click();
  };

  const renderEventSettings = (label: string, icon: any, soundField: keyof WidgetConfig, voiceField: keyof WidgetConfig, templateField: keyof WidgetConfig, onScreenField: keyof WidgetConfig, hints: string[], ttsToggle: keyof WidgetConfig, imgField: keyof WidgetConfig, enabledField: keyof WidgetConfig, type: string) => (
    <div className="space-y-6">
        <div className="flex justify-end"><button onClick={() => triggerTestEvent(type)} className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-white hover:bg-white/10 transition"><Play size={10} fill="currentColor" /> TEST</button></div>
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${config[enabledField] ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-neutral-900/40 border-white/5 opacity-60'}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${config[enabledField] ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-500'}`}>{icon}</div>
                <div><h4 className="text-[11px] font-black uppercase tracking-wider text-white">{label}</h4><p className="text-[9px] text-neutral-500 font-medium">{config[enabledField] ? 'Aktif' : 'Nonaktif'}</p></div>
            </div>
            <div onClick={() => setConfig({...config, [enabledField]: !config[enabledField]})} className={`w-11 h-6 rounded-full relative transition-all cursor-pointer ${config[enabledField] ? 'bg-emerald-500' : 'bg-neutral-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config[enabledField] ? 'translate-x-6' : 'translate-x-1'}`} /></div>
        </div>
        {config[enabledField] && (
            <div className="space-y-5">
                <div className="space-y-4 p-4 bg-neutral-900/40 rounded-3xl border border-white/5">
                    <h5 className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2"><Eye size={10} /> TAMPILAN VISUAL</h5>
                    <div>
                        <label className="text-[9px] text-neutral-600 font-bold uppercase mb-1 block">Teks Layar</label>
                        <textarea value={config[onScreenField] as string} onChange={(e) => setConfig({...config, [onScreenField]: e.target.value})} className="w-full bg-neutral-900/50 border border-white/5 rounded-2xl p-3 text-xs text-white h-16 resize-none transition-all" />
                        <div className="flex flex-wrap gap-1 mt-1">{hints.map(v => <span key={v} className="text-[8px] bg-white/5 text-neutral-500 px-2 py-0.5 rounded-md border border-white/5">{v}</span>)}</div>
                    </div>
                    <div>
                        <label className="text-[9px] text-neutral-600 font-bold uppercase mb-1 block">GIF / Animasi</label>
                        <div className="flex gap-2">
                            <input type="text" value={config[imgField] as string} onChange={(e) => setConfig({...config, [imgField]: e.target.value})} className="flex-1 bg-neutral-900/50 border border-white/5 rounded-full py-2.5 px-4 text-[10px] text-white" />
                            <button onClick={() => handleMediaUpload(imgField)} className="p-2.5 bg-neutral-900 border border-white/5 rounded-full text-emerald-500 hover:bg-emerald-500 hover:text-black transition"><Upload size={14} /></button>
                        </div>
                    </div>
                </div>
                <div className="space-y-4 p-4 bg-neutral-900/40 rounded-3xl border border-white/5">
                    <div className="flex items-center justify-between">
                        <h5 className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2"><Volume2 size={10} /> SUARA & TTS</h5>
                        <div onClick={() => setConfig({...config, [ttsToggle]: !config[ttsToggle]})} className={`w-9 h-5 rounded-full relative transition-all cursor-pointer ${config[ttsToggle] ? 'bg-emerald-500/80' : 'bg-neutral-800'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config[ttsToggle] ? 'translate-x-4' : 'translate-x-0.5'}`} /></div>
                    </div>
                    <div><textarea value={config[templateField] as string} onChange={(e) => setConfig({...config, [templateField]: e.target.value})} className="w-full bg-neutral-900/50 border border-white/5 rounded-2xl p-3 text-xs text-white h-16 resize-none" /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleMediaUpload(soundField)} className="py-2.5 bg-neutral-900/50 border border-white/5 rounded-xl text-emerald-500 text-[10px] font-black hover:bg-emerald-500 hover:text-black transition uppercase">Upload Sound</button>
                        <select value={config[voiceField] as string} onChange={(e) => setConfig({...config, [voiceField]: e.target.value})} className="bg-neutral-900/50 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] text-white font-bold">{VOICE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
                    </div>
                </div>
            </div>
        )}
    </div>
  );

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className={`fixed inset-0 font-sans transition-colors duration-500 ${isGreenScreen ? "bg-[#00ff00]" : "bg-transparent"}`}>
      {showEditor && (
        <>
            <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-3 bg-neutral-950/80 backdrop-blur-md p-3 rounded-2xl border border-white/5">
                <div className="flex gap-2 border-r border-white/10 pr-3"><button onClick={() => addElement("text")} className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition"><Type size={20} /></button><button onClick={() => addElement("image")} className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition"><ImageIcon size={20} /></button></div>
                <div className="flex gap-2"><button onClick={undo} className="p-2 hover:bg-white/5 text-neutral-400 rounded-xl"><RotateCcw size={18} /></button><button onClick={redo} className="p-2 hover:bg-white/5 text-neutral-400 rounded-xl"><RotateCw size={18} /></button></div>
                <div className="ml-auto flex gap-3"><button onClick={() => setIsGreenScreen(!isGreenScreen)} className={`p-2 rounded-xl transition flex items-center gap-2 ${isGreenScreen ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white'}`}><Zap size={18} />{isGreenScreen && <span className="text-[10px] font-bold uppercase">CHROMA</span>}</button><button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-xl transition ${showSettings ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white'}`}><Settings size={20} /></button><button onClick={saveConfig} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2">{isSaving ? 'SAVING...' : 'SAVE'}</button></div>
            </div>

            {showSettings && (
                <div className="absolute top-20 right-4 w-[340px] z-50 bg-neutral-950/90 backdrop-blur-2xl border border-white/10 p-5 rounded-[2rem] max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-6"><h3 className="text-xs font-black text-emerald-500 tracking-[0.2em] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />WIDGET CORE</h3><button onClick={() => setShowSettings(false)} className="text-neutral-600 hover:text-white transition"><X size={16} /></button></div>
                    <div className="grid grid-cols-3 gap-2 mb-6 p-2 bg-neutral-900/30 rounded-3xl border border-white/5">
                      {[
                        { id: "gift", icon: <Gift size={16} />, color: "text-pink-400", label: "Gift" }, { id: "comment", icon: <MessageSquare size={16} />, color: "text-blue-400", label: "Chat" }, { id: "like", icon: <Heart size={16} />, color: "text-red-400", label: "Like" }, { id: "join", icon: <UserPlus size={16} />, color: "text-amber-400", label: "Join" }, { id: "follow", icon: <UserPlus size={16} />, color: "text-indigo-400", label: "Follow" }, { id: "fan", icon: <Crown size={16} />, color: "text-purple-400", label: "Fan" }, { id: "share", icon: <Zap size={16} />, color: "text-emerald-400", label: "Share" },
                      ].map((cat) => (
                        <button key={cat.id} onClick={() => setSettingsTab(cat.id as any)} className={`flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all ${settingsTab === cat.id ? "bg-white/10 text-white border border-white/10" : "text-neutral-600 hover:bg-white/5"}`}><div className={settingsTab === cat.id ? cat.color : "text-neutral-700"}>{cat.icon}</div><span className="text-[8px] font-black uppercase mt-1 tracking-tighter">{cat.label}</span></button>
                      ))}
                    </div>
                    {settingsTab === "gift" && renderEventSettings("Gift", <Gift size={14} />, "openingSoundUrl", "giftVoice", "voiceOverTemplate", "onScreenGiftTemplate", ["{nickname}", "{giftname}"], "giftTtsEnabled", "giftImageUrl", "giftEnabled", "gift")}
                    {settingsTab === "comment" && renderEventSettings("Chat", <MessageSquare size={14} />, "commentOpeningSoundUrl", "commentVoice", "commentVoiceOverTemplate", "onScreenCommentTemplate", ["{nickname}", "{comment}"], "commentTtsEnabled", "commentImageUrl", "commentEnabled", "comment")}
                    {settingsTab === "like" && renderEventSettings("Like", <Heart size={14} />, "likeOpeningSoundUrl", "likeVoice", "likeVoiceOverTemplate", "onScreenLikeTemplate", ["{nickname}", "{likecount}"], "likeTtsEnabled", "likeImageUrl", "likeEnabled", "like")}
                    {settingsTab === "join" && renderEventSettings("Join", <UserPlus size={14} />, "joinOpeningSoundUrl", "commentVoice", "joinVoiceOverTemplate", "onScreenJoinTemplate", ["{nickname}"], "joinTtsEnabled", "joinImageUrl", "joinEnabled", "join")}
                    {settingsTab === "follow" && renderEventSettings("Follow", <UserPlus size={14} />, "followOpeningSoundUrl", "followVoice", "followVoiceOverTemplate", "onScreenFollowTemplate", ["{nickname}"], "followTtsEnabled", "followImageUrl", "followEnabled", "follow")}
                    {settingsTab === "fan" && renderEventSettings("Fan", <Crown size={14} />, "fanOpeningSoundUrl", "fanVoice", "fanVoiceOverTemplate", "onScreenFanTemplate", ["{nickname}"], "fanTtsEnabled", "fanImageUrl", "fanEnabled", "fan")}
                    {settingsTab === "share" && renderEventSettings("Share", <Zap size={14} />, "shareOpeningSoundUrl", "shareVoice", "shareVoiceOverTemplate", "onScreenShareTemplate", ["{nickname}"], "shareTtsEnabled", "shareImageUrl", "shareEnabled", "share")}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="flex items-center justify-between p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10"><div className="flex items-center gap-3"><Mic2 size={16} className="text-emerald-400" /><div><p className="text-xs font-bold text-white">Global TTS</p></div></div><div onClick={() => setConfig({...config, ttsEnabled: !config.ttsEnabled})} className={`w-11 h-6 rounded-full relative transition-all cursor-pointer ${config.ttsEnabled ? 'bg-emerald-500' : 'bg-neutral-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config.ttsEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></div></div>
                        {config.ttsEnabled && <div className="px-1"><label className="text-[10px] text-neutral-500 font-bold uppercase mb-2 block">Speed ({config.ttsSpeed}x)</label><input type="range" min="0.5" max="2.0" step="0.1" value={config.ttsSpeed} onChange={(e) => setConfig({...config, ttsSpeed: parseFloat(e.target.value)})} className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" /></div>}
                    </div>
                </div>
            )}

            {selectedElement && (
                <div className="absolute bottom-20 left-4 z-50 bg-neutral-950/90 backdrop-blur-2xl border border-white/10 p-4 rounded-2xl w-80">
                    <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-emerald-500 uppercase">{selectedElement.type === "text" ? "Edit Text" : "Edit Image"}</span><div className="flex gap-2"><button onClick={() => deleteElement(selectedElement.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-lg"><Trash2 size={14} /></button><button onClick={() => setSelectedId(null)} className="p-1.5 bg-white/5 text-neutral-400 rounded-lg"><X size={14} /></button></div></div>
                    {selectedElement.type === "text" ? (
                        <div className="space-y-3">
                            <textarea value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-xs text-white h-16 outline-none" />
                            <div className="grid grid-cols-3 gap-2">
                                <input type="color" value={selectedElement.style?.color || "#ffffff"} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, color: e.target.value } })} className="w-full h-8 bg-transparent" />
                                <input type="number" value={selectedElement.style?.fontSize || 28} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, fontSize: Number(e.target.value) } })} className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white" />
                                <select value={selectedElement.style?.fontFamily || "Baloo 2"} onChange={(e) => updateElement(selectedElement.id, { style: { ...selectedElement.style, fontFamily: e.target.value } })} className="w-full bg-neutral-900 border border-neutral-800 rounded p-1.5 text-[10px] text-white">{fonts.map(f => <option key={f} value={f}>{f}</option>)}</select>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <input type="text" value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-white" />
                            <button onClick={() => updateElement(selectedElement.id, { content: "" })} className="w-full py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400 text-[10px] font-bold">✨ DYNAMIC GIF MODE</button>
                        </div>
                    )}
                </div>
            )}
        </>
      )}

      <AudioStatus locked={audioLocked} onClick={() => audioContextRef.current?.resume().then(() => setAudioLocked(false))} />
      <audio ref={silentAudioRef} src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" loop autoPlay style={{ display: 'none' }} />

      <div ref={canvasRef} className="w-full h-full relative" onClick={() => showEditor && setSelectedId(null)}>
        {elements.map(el => {
             const state = getElementState(el, activeNotification?.type || settingsTab);
             const isVisible = showEditor || (activeNotification && notifVisible && isTypeEnabled(activeNotification.type) && (!el.eventTypes || el.eventTypes.includes(activeNotification.type)));
             return (
              <div key={el.id} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, el.id, "move"); }} style={{ left: state.x, top: state.y, width: state.width, height: state.height, position: 'absolute', zIndex: 10, outline: (showEditor && selectedId === el.id) ? '2px solid #10b981' : 'none', opacity: isVisible ? 1 : 0, transition: 'opacity 0.4s ease-in-out' }}>
                {el.type === "text" ? (
                    <div style={{ ...el.style, width: '100%', height: '100%', display: 'flex', alignItems: state.verticalAlign === 'top' ? 'flex-start' : state.verticalAlign === 'bottom' ? 'flex-end' : 'center', justifyContent: state.textAlign === 'left' ? 'flex-start' : state.textAlign === 'right' ? 'flex-end' : 'center', textAlign: state.textAlign as any, WebkitTextStroke: (el.style?.strokeWidth) ? `${el.style.strokeWidth}px ${el.style.strokeColor || '#000000'}` : undefined, paintOrder: 'stroke fill' }}>
                        {(() => {
                            const type = activeNotification?.type || settingsTab;
                            let t = state.content;
                            if (activeNotification) {
                                t = activeNotification.type === 'gift' ? config.onScreenGiftTemplate : activeNotification.type === 'comment' ? config.onScreenCommentTemplate : activeNotification.type === 'like' ? config.onScreenLikeTemplate : activeNotification.type === 'join' ? config.onScreenJoinTemplate : activeNotification.type === 'follow' ? config.onScreenFollowTemplate : activeNotification.type === 'fan' ? config.onScreenFanTemplate : activeNotification.type === 'share' ? config.onScreenShareTemplate : state.content;
                                return t.replace(/{nickname}/g, activeNotification.nickname).replace(/{username}/g, activeNotification.username).replace(/{giftname}/g, activeNotification.namaHadiah || "").replace(/{likecount}/g, String(activeNotification.likeCount || "")).replace(/{comment}/g, activeNotification.rawComment || "").replace(/{repeatcount}/g, String(activeNotification.repeatCount || 1));
                            }
                            return t.replace(/{nickname}/g, "User").replace(/{giftname}/g, "Gift").replace(/{repeatcount}/g, "1");
                        })()}
                    </div>
                ) : (
                    (() => {
                        let src = state.content;
                        if (activeNotification) {
                            const catImg = (config as any)[`${activeNotification.type}ImageUrl`];
                            if (catImg && !el.overrides?.[activeNotification.type]?.content) src = catImg;
                        }
                        if (!src && showEditor) return <div className="w-full h-full border border-dashed border-white/20 flex items-center justify-center text-[10px] text-white/20">DYNAMIC IMAGE</div>;
                        return src ? <img src={src} className="w-full h-full" style={{ objectFit: state.objectFit as any }} /> : null;
                    })()
                )}
                {showEditor && selectedId === el.id && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full cursor-se-resize" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, el.id, "resize"); }} />}
              </div>
           );
        })}
      </div>
      <button onClick={() => setShowEditor(!showEditor)} className="fixed bottom-6 right-6 p-4 bg-black/40 text-white rounded-full backdrop-blur-md opacity-30 hover:opacity-100 transition z-[200]">{showEditor ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;700;800&family=Passion+One:wght@400;900&display=swap'); body { background: transparent !important; overflow: hidden; }`}</style>
    </div>
  );
}
