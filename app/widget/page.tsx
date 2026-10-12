"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Type, Image as ImageIcon, RotateCcw, RotateCw, X, Volume2, MessageSquare, Mic2, Upload, Zap, Eye, EyeOff, Trash2, Play, Heart, Gift, Crown, UserPlus, Settings } from "lucide-react";

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
        <div className="fixed bottom-3 right-3 z-40 pointer-events-none">
            <button
                type="button"
                onClick={onClick}
                aria-label="Aktifkan audio widget"
                title="Klik untuk mengaktifkan audio widget"
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-500/30 bg-neutral-950/70 px-3 py-2 text-emerald-300 opacity-20 shadow-lg transition hover:opacity-100 focus:opacity-100"
            >
                <Volume2 size={16} />
                <span className="text-[10px] font-bold">Audio</span>
            </button>
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
    giftIcon?: string;
    adbData?: Record<string, unknown> | unknown[] | string | number | boolean | null;
    priority: number; // 0=low (comment, join), 1=medium (like), 2=high (gift)
    prefetchedAudioUrl?: string;
    triggerRewardsEnabled?: boolean;
    rawComment?: string;
    executionDurationMs?: number;
    isTest?: boolean;
    widgetNotificationId?: string;
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
  commentEnabled: true,
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

const LOCAL_STORAGE_KEY = "widgetConfig_v2";
const PENDING_WIDGET_ACKS_KEY = "pendingWidgetNotificationAcks";
const widgetAckRequestsInFlight = new Set<string>();
const widgetAckRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const widgetAckRetryAttempts = new Map<string, number>();

function readPendingWidgetAcks(): string[] {
  try {
    const value = localStorage.getItem(PENDING_WIDGET_ACKS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    console.error('[Widget] Failed to read pending notification acknowledgments:', error);
    return [];
  }
}

function persistPendingWidgetAcks(ids: string[]) {
  try {
    localStorage.setItem(PENDING_WIDGET_ACKS_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('[Widget] Failed to persist notification acknowledgment:', error);
  }
}

function submitWidgetNotificationAck(notificationId: string) {
  if (widgetAckRequestsInFlight.has(notificationId)) return;
  const retryTimer = widgetAckRetryTimers.get(notificationId);
  if (retryTimer) {
    clearTimeout(retryTimer);
    widgetAckRetryTimers.delete(notificationId);
  }
  widgetAckRequestsInFlight.add(notificationId);

  void (async () => {
    let succeeded = false;
    try {
      const response = await fetch('/api/widget/notification-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      persistPendingWidgetAcks(readPendingWidgetAcks().filter(id => id !== notificationId));
      widgetAckRetryAttempts.delete(notificationId);
      succeeded = true;
    } catch (error) {
      console.error(`[Widget] Notification acknowledgment failed (${notificationId}):`, error);
    } finally {
      widgetAckRequestsInFlight.delete(notificationId);
    }

    if (!succeeded) {
      const attempts = (widgetAckRetryAttempts.get(notificationId) ?? 0) + 1;
      widgetAckRetryAttempts.set(notificationId, attempts);
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts - 1, 5));
      const timer = setTimeout(() => {
        widgetAckRetryTimers.delete(notificationId);
        submitWidgetNotificationAck(notificationId);
      }, delay);
      widgetAckRetryTimers.set(notificationId, timer);
    }
  })();
}

function acknowledgeWidgetNotification(notificationId?: string) {
  if (!notificationId || typeof window === 'undefined') return;

  const pending = readPendingWidgetAcks();
  if (!pending.includes(notificationId)) {
    pending.push(notificationId);
    persistPendingWidgetAcks(pending);
  }
  submitWidgetNotificationAck(notificationId);
}

export default function WidgetPage() {
  const [elements, setElements] = useState<Element[]>([]);
  const [history, setHistory] = useState<Element[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showEditor, setShowEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGreenScreen, setIsGreenScreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"gift" | "comment" | "like" | "join" | "follow" | "fan" | "share">("gift");
  const [isSaving, setIsSaving] = useState(false);
  const [referenceTab, setReferenceTab] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data && data.authenticated && data.user?.role === 'admin') {
          setIsAdmin(true);
        }
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [activeNotification, setActiveNotification] = useState<NotificationItem | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const notificationQueue = useRef<NotificationItem[]>([]);
  const isProcessingQueue = useRef(false);
  const interruptFlag = useRef(false);
  const activeNotificationRef = useRef<NotificationItem | null>(null);
  const [audioLocked, setAudioLocked] = useState(true);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const browserVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<Element[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const configRef = useRef(config);
  const lastProcessTime = useRef<number>(Date.now());
  const watchdogInterval = useRef<NodeJS.Timeout | null>(null);
  const completedCombosRef = useRef<Set<string>>(new Set());
  const recentGiftKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      browserVoicesRef.current = voices;
      setBrowserVoices(voices);
    };
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

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
                const notificationId = activeNotificationRef.current?.widgetNotificationId;
                isProcessingQueue.current = false;
                setNotifVisible(false);
                setActiveNotification(null);
                activeNotificationRef.current = null;
                setTimeout(() => acknowledgeWidgetNotification(notificationId), 400);
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
        const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        audioContextRef.current = new AudioCtor();
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
  const seenWidgetNotificationIds = useRef<Set<string>>(new Set());
  const lastLikeMilestone = useRef<number>(0);

  useEffect(() => {
    for (const notificationId of readPendingWidgetAcks()) {
      submitWidgetNotificationAck(notificationId);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    if (sseConnection.current) return;

    let reconnectTimer: number | null = null;
    let backoff = 1000;
    const connectSSE = (force = false) => {
      if (sseConnection.current && !force) return;
      const es = new EventSource("/api/events");
      sseConnection.current = es;
      es.onopen = () => {
        console.info("[Widget] Connected to live event stream.");
        backoff = 1000;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      };
      es.onerror = () => {
        console.error(`[Widget] Live event stream error (readyState=${es.readyState}); attempting reconnect in ${backoff}ms.`);
        try { es.close(); } catch (e) {}
        sseConnection.current = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          backoff = Math.min(60000, Math.floor(backoff * 1.8));
          connectSSE(true);
        }, backoff);
      };
      es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        const eventType = payload.type || "unknown";
        if (eventType === 'status' || eventType === 'sociabuzz') {
          return;
        }
        console.info(`[Widget] Received ${eventType} event.`);
        const widgetNotificationId = typeof data.widgetNotificationId === 'string'
          ? data.widgetNotificationId
          : undefined;
        if (widgetNotificationId) {
          if (seenWidgetNotificationIds.current.has(widgetNotificationId)) return;
          seenWidgetNotificationIds.current.add(widgetNotificationId);
          if (seenWidgetNotificationIds.current.size > 500) {
            const oldestIds = seenWidgetNotificationIds.current.values();
            for (let index = 0; index < 100; index++) {
              const oldestId = oldestIds.next().value;
              if (oldestId !== undefined) seenWidgetNotificationIds.current.delete(oldestId);
            }
          }
        }
        const requiresWidgetAck = Boolean(widgetNotificationId);
        const rawEventId = String(data.eventId || data.msgId || data.timestamp || "");
        
        // 1. Absolute Dedup (If eventId is perfectly identical, drop it permanently)
        if (!requiresWidgetAck && data.eventId && processedEventIds.current.has(data.eventId)) {
            console.log(`[Widget] Dropped identical eventId: ${data.eventId}`);
            return;
        }
        if (!requiresWidgetAck && data.eventId) processedEventIds.current.add(data.eventId);
        
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
        if (!requiresWidgetAck && rawEventId && duplicateGuard.current.has(`${payload.type}_${rawEventId}`)) return;
        
        // Register in guard
        if (!requiresWidgetAck && rawEventId) {
            const idKey = `${payload.type}_${rawEventId}`;
            duplicateGuard.current.add(idKey);
            setTimeout(() => duplicateGuard.current.delete(idKey), 10000); // 10s window
        }
 
        if (payload.type === 'like') {
            if (data.isTest || data.isMilestone) {
                addToQueue({ ...payload, likeCount: data.likeCount || config.likeThreshold || 50 });
                return;
            }

            const currentTotal = Number(data.totalLikeCount ?? data.likeCount ?? 1);
            const threshold = Math.max(1, config.likeThreshold || 50);
            const milestone = Math.floor(currentTotal / threshold) * threshold;
            if (milestone > 0 && milestone > lastLikeMilestone.current) {
                lastLikeMilestone.current = milestone;
                addToQueue({ ...payload, likeCount: milestone });
            } else if (config.likeEnabled) {
                addToQueue({ ...payload, likeCount: currentTotal });
            } else if (requiresWidgetAck) {
                acknowledgeWidgetNotification(widgetNotificationId);
            }
            return;
        }

        if (payload.type === 'gift' || payload.type === 'comment' || payload.type === 'join' || payload.type === 'follow' || payload.type === 'fan' || payload.type === 'share') {
          addToQueue(payload);
        }
      } catch (e) {
        console.error("[Widget] Failed to process live event:", e);
      }
    };
    };

    connectSSE();

    return () => {
        try { if (sseConnection.current) { sseConnection.current.close(); sseConnection.current = null; } } catch (e) {}
        if (typeof reconnectTimer !== 'undefined' && reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  // ==========================================
  // CONFIG PERSISTENCE
  // ==========================================
  const loadConfig = async () => {
    let locallySavedElements = elementsRef.current;
    try {
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.config) setConfig(prev => ({ ...DEFAULT_CONFIG, ...parsed.config }));
        if (Array.isArray(parsed.elements)) {
          locallySavedElements = parsed.elements;
          setElements(parsed.elements);
        }
      }
    } catch (e) {
      console.error("[Widget] Failed to load local widget configuration:", e);
    }

    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        const savedElements = Array.isArray(data.widgetConfig?.elements)
          ? data.widgetConfig.elements
          : locallySavedElements;
        setElements(savedElements);
        if (data.rewards) {
          // no-op: rewards payload is intentionally ignored for the visible widget rendering path
        }
        saveToLocalStorage(serverConfig, savedElements);
      }
    } catch (err) {
      console.error("[Widget] Failed to load server widget configuration:", err);
    }
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
  const addToQueue = (evtData: Record<string, unknown> | { type?: string; data?: Record<string, unknown> }) => {
    const currentConfig = configRef.current;
    const rawData = 'data' in evtData && evtData.data && typeof evtData.data === 'object' ? (evtData.data as Record<string, unknown>) : (evtData as Record<string, unknown>);
    const pickString = (key: string, fallback = "") => {
      const value = rawData[key];
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return fallback;
    };
    const pickNumber = (key: string, fallback = 0) => {
      const value = rawData[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const pickBoolean = (key: string, fallback = false) => {
      const value = rawData[key];
      if (typeof value === 'boolean') return value;
      return fallback;
    };
    const eventTypeValue = typeof evtData.type === 'string' ? evtData.type : 'gift';
    const type: NotificationItem['type'] = eventTypeValue === 'gift' || eventTypeValue === 'comment' || eventTypeValue === 'like' || eventTypeValue === 'join' || eventTypeValue === 'follow' || eventTypeValue === 'fan' || eventTypeValue === 'share' ? eventTypeValue : 'gift';

    const nickname = pickString('nickname', pickString('username', 'Viewer'));
    const username = pickString('username', 'Viewer');
    const giftName = pickString('giftName', pickString('namaHadiah', 'Hadiah'));
    const namaHadiah = pickString('namaHadiah', giftName);
    const repeatCount = pickNumber('repeatCount', 1);
    const likeCount = pickNumber('likeCount', 0);
    const msgId = pickString('msgId');
    const widgetNotificationId = pickString('widgetNotificationId');
    const rawComment = pickString('comment', '');
    const triggerRewardsEnabled = pickBoolean('triggerRewardsEnabled', true);
    const isTest = pickBoolean('isTest', false);
    const repeatEnd = rawData.repeatEnd === undefined ? true : Boolean(rawData.repeatEnd);
    const giftIcon = pickString('giftIcon');
    const adbActions = Array.isArray(rawData.actions) ? rawData.actions as Array<Record<string, unknown>> : [];

    let voiceMessage = "";
    let priority = 0;
    if (type === 'comment') {
        voiceMessage = currentConfig.commentVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username).replace(/{comment}/g, rawComment);
        priority = 0;
    } else if (type === 'like') {
        voiceMessage = currentConfig.likeVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username).replace(/{likecount}/g, String(likeCount));
        priority = 1;
    } else if (type === 'join') {
        voiceMessage = currentConfig.joinVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username);
        priority = 0;
    } else if (type === 'follow') {
        voiceMessage = currentConfig.followVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username);
        priority = 0;
    } else if (type === 'fan') {
        voiceMessage = currentConfig.fanVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username);
        priority = 1;
    } else if (type === 'share') {
        voiceMessage = currentConfig.shareVoiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username);
        priority = 1;
    } else {
        voiceMessage = currentConfig.voiceOverTemplate.replace(/{nickname}/g, nickname).replace(/{username}/g, username).replace(/{giftname}/g, namaHadiah).replace(/{repeatcount}/g, String(repeatCount));
        priority = 2;
    }

    const executionDurationMs = adbActions.reduce((sum: number, action: Record<string, unknown>) => {
        const delay = Number(action.delayAfter ?? 0) || 0;
        const typeName = String(action.type ?? '');
        const swipeInner = action.swipe as Record<string, unknown> | undefined;
        if (typeName === 'swipe') return sum + (Math.max(300, Number(swipeInner?.duration ?? 0) || 0) + delay);
        if (typeName === 'click' || typeName === 'keyevent' || typeName === 'text') return sum + 250 + delay;
        return sum + 300 + delay;
    }, 0) || 1200;

    const item: NotificationItem = {
        id: Math.random().toString(36).substr(2, 9), type, giftName, namaHadiah,
        nickname, username, message: voiceMessage,
        likeCount, repeatCount, repeatEnd, msgId: msgId || undefined, giftIcon: giftIcon || undefined,
        adbData: (type === 'gift' || type === 'like') ? (rawData.actions as NotificationItem['adbData']) : null,
        priority, triggerRewardsEnabled: triggerRewardsEnabled, rawComment,
        executionDurationMs,
        isTest,
        widgetNotificationId: widgetNotificationId || undefined,
    };
    const requiresWidgetAck = Boolean(item.widgetNotificationId);

    const queue = notificationQueue.current;
    // MERGE GIFTS (Same User + Same Gift)
    // Prevent duplicate gift events when msgId is missing by using a short-lived composite key.
    if (!requiresWidgetAck && type === 'gift' && !msgId) {
        const key = `${username}::${giftName}::${Math.floor((Number(rawData.timestamp ?? Date.now()) / 5000))}`;
        if (recentGiftKeys.current.has(key)) return;
        recentGiftKeys.current.add(key);
        setTimeout(() => recentGiftKeys.current.delete(key), 5000);
    }

    if (!requiresWidgetAck && type === 'gift' && msgId) {
        const existingIdx = queue.findIndex(q => q.type === 'gift' && q.username === username && q.msgId === msgId);
        if (existingIdx !== -1) {
            queue[existingIdx].repeatCount = repeatCount;
            queue[existingIdx].repeatEnd = repeatEnd;
            return;
        }
        const current = activeNotificationRef.current;
        if (current && current.type === 'gift' && current.username === username && current.msgId === msgId) {
            setActiveNotification(prev => prev ? { ...prev, repeatCount } : null);
            activeNotificationRef.current!.repeatCount = repeatCount;
            return;
        }

        if (completedCombosRef.current.has(msgId)) return;
        completedCombosRef.current.add(msgId);
        setTimeout(() => completedCombosRef.current.delete(msgId), 60000);
    }

    // STRICT LIMITS (Anti-Memory Leak)
    if (priority === 2) {
        if (!requiresWidgetAck && queue.filter(q => q.priority === 2).length > 100) return; // Drop if > 100 gifts
        let insertAt = 0;
        while (insertAt < queue.length && queue[insertAt].priority >= 2) insertAt++;
        queue.splice(insertAt, 0, item);
    } else {
        if (!requiresWidgetAck && queue.length > 150) return; // Drop non-gifts if queue too long
        queue.push(item);
    }

    if (priority === 2 && isProcessingQueue.current) {
        interruptIfLowPriority();
    }

    processQueue();
  };

  const interruptIfLowPriority = () => {
    const current = activeNotificationRef.current;
    if (current && current.priority < 2) {
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

  const speakWithBrowserTTS = (text: string, preferredVoice: string, rate: number) => new Promise<void>(resolve => {
    if (!("speechSynthesis" in window) || !text.trim()) {
      console.error("[Widget] Browser speech synthesis is unavailable or the TTS text is empty.");
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = browserVoicesRef.current.find(candidate => candidate.name === preferredVoice)
      || browserVoicesRef.current.find(candidate => candidate.lang.toLowerCase().startsWith("id"))
      || null;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "id-ID";
    }
    utterance.rate = Math.min(2, Math.max(0.5, rate));

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      console.warn("[Widget] Browser TTS exceeded its playback timeout; cancelling speech.");
      window.speechSynthesis.cancel();
      finish();
    }, Math.min(30000, Math.max(5000, text.length * 180 / utterance.rate)));

    utterance.onend = finish;
    utterance.onerror = event => {
      console.error("[Widget] Browser TTS playback failed:", event.error);
      finish();
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("[Widget] Browser rejected the TTS request:", error);
      finish();
    }
  });

  const processQueue = async () => {
    if (isProcessingQueue.current || notificationQueue.current.length === 0) return;
    isProcessingQueue.current = true;
    interruptFlag.current = false;
    lastProcessTime.current = Date.now();

    const item = notificationQueue.current.shift()!;
    if (!isTypeEnabled(item.type) && !item.isTest) {
        acknowledgeWidgetNotification(item.widgetNotificationId);
        isProcessingQueue.current = false;
        processQueue();
        return;
    }

    activeNotificationRef.current = item;
    setActiveNotification(item);
    setNotifVisible(true);
    const cfg = configRef.current;
    const qLen = notificationQueue.current.length;

    // DYNAMIC THROTTLING
    let displayDuration = 3000;
    let skipMusic = false;
    let skipTTS = false;

    if (qLen > 5 && item.priority < 2) { displayDuration = 1500; skipMusic = true; }
    if (qLen > 15) { displayDuration = 800; skipMusic = true; }
    if (qLen > 30) { displayDuration = 400; skipTTS = item.priority < 2; skipMusic = true; }

    const notificationStartedAt = Date.now();
    const adbHoldDurationMs = Math.max(displayDuration, item.executionDurationMs ?? 1200);

    // TTS LOGIC
    let itemTtsEnabled = true;
    const type = item.type;
    if (type === 'gift') itemTtsEnabled = cfg.giftTtsEnabled !== false;
    else if (type === 'comment') itemTtsEnabled = cfg.commentTtsEnabled !== false;
    else if (type === 'like') itemTtsEnabled = cfg.likeTtsEnabled !== false;
    else if (type === 'join') itemTtsEnabled = cfg.joinTtsEnabled !== false;
    else if (type === 'follow') itemTtsEnabled = cfg.followTtsEnabled !== false;
    else if (type === 'share') itemTtsEnabled = cfg.shareTtsEnabled !== false;
    else if (type === 'fan') itemTtsEnabled = cfg.fanTtsEnabled !== false;

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

    // Browser TTS runs locally and does not request generated audio from the server.
    if (!interruptFlag.current && !skipTTS && cfg.ttsEnabled && itemTtsEnabled) {
        const voiceField = type === "gift" ? cfg.giftVoice
          : type === "comment" ? cfg.commentVoice
          : type === "like" ? cfg.likeVoice
          : type === "join" ? cfg.commentVoice
          : type === "follow" ? cfg.followVoice
          : type === "fan" ? cfg.fanVoice
          : cfg.shareVoice;
        await speakWithBrowserTTS(item.message, voiceField, cfg.ttsSpeed);
    }

    // Keep the visual notification visible for its full minimum lifetime, including sound and TTS playback.
    const totalItemHoldMs = Math.max(adbHoldDurationMs, displayDuration, 1500);
    const remainingHoldMs = totalItemHoldMs - (Date.now() - notificationStartedAt);
    if (!interruptFlag.current && remainingHoldMs > 0) {
      await new Promise(r => setTimeout(r, remainingHoldMs));
    }

    setNotifVisible(false);
    setTimeout(() => {
        acknowledgeWidgetNotification(item.widgetNotificationId);
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
    input.onchange = async (event: Event) => {
        const file = (event.target as HTMLInputElement | null)?.files?.[0];
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

  const renderEventSettings = (label: string, icon: React.ReactNode, soundField: keyof WidgetConfig, voiceField: keyof WidgetConfig, templateField: keyof WidgetConfig, onScreenField: keyof WidgetConfig, ttsToggle: keyof WidgetConfig, imgField: keyof WidgetConfig, enabledField: keyof WidgetConfig, type: string) => (
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
                        <div className="mt-2 rounded-xl border border-white/5 bg-black/20 p-3">
                            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-neutral-500">Variabel yang bisa digunakan</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                {[
                                  ["{nickname}", "Nama tampilan pengguna"],
                                  ["{username}", "Username TikTok"],
                                  ["{giftname}", "Nama hadiah"],
                                  ["{repeatcount}", "Jumlah hadiah"],
                                  ["{likecount}", "Jumlah like"],
                                  ["{comment}", "Isi komentar"],
                                ].map(([token, description]) => (
                                  <div key={token} className="flex flex-wrap items-center gap-1.5 text-[9px]">
                                    <code className="rounded bg-white/5 px-1.5 py-0.5 text-emerald-300">{token}</code>
                                    <span className="text-neutral-500">{description}</span>
                                  </div>
                                ))}
                            </div>
                            <p className="mt-2 text-[8px] text-neutral-600">Variabel yang tidak terkait dengan jenis event akan kosong.</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] text-neutral-600 font-bold uppercase mb-1 block">GIF / Animasi</label>
                        <div className="flex gap-2">
                            <input type="text" value={config[imgField] as string} onChange={(e) => setConfig({...config, [imgField]: e.target.value})} className="flex-1 bg-neutral-900/50 border border-white/5 rounded-full py-2.5 px-4 text-[10px] text-white" />
                            <button onClick={() => handleMediaUpload(imgField)} className="p-2.5 bg-neutral-900 border border-white/5 rounded-full text-emerald-500 hover:bg-emerald-500 hover:text-black transition"><Upload size={14} /></button>
                        </div>
                    </div>
                </div>
                <div className="space-y-3 p-4 bg-neutral-900/40 rounded-3xl border border-white/5">
                    <div>
                        <h5 className="text-[9px] font-black text-neutral-300 uppercase tracking-[0.2em] flex items-center gap-2"><Volume2 size={10} /> SUARA NOTIFIKASI</h5>
                        <p className="mt-1 text-[9px] text-neutral-500">Efek suara yang diputar saat notifikasi muncul.</p>
                    </div>
                    <div className="flex gap-2">
                        <input type="text" value={config[soundField] as string} onChange={(e) => setConfig({...config, [soundField]: e.target.value})} placeholder="URL suara notifikasi (opsional)" className="min-w-0 flex-1 rounded-xl border border-white/5 bg-neutral-900/50 px-3 py-2 text-[10px] text-white" />
                        <button onClick={() => handleMediaUpload(soundField)} className="shrink-0 rounded-xl border border-white/5 bg-neutral-900/50 px-3 text-emerald-500 transition hover:bg-emerald-500 hover:text-black" aria-label="Upload suara notifikasi"><Upload size={14} /></button>
                    </div>
                </div>
                <div className="space-y-4 p-4 bg-neutral-900/40 rounded-3xl border border-white/5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="text-[9px] font-black text-neutral-300 uppercase tracking-[0.2em] flex items-center gap-2"><Mic2 size={10} /> TTS PEMBACA TEKS</h5>
                            <p className="mt-1 text-[9px] text-neutral-500">Dibacakan oleh suara bawaan browser, tanpa meminta audio dari server.</p>
                        </div>
                        <button type="button" aria-label={`TTS ${config[ttsToggle] ? "aktif" : "nonaktif"}`} aria-pressed={Boolean(config[ttsToggle])} onClick={() => setConfig({...config, [ttsToggle]: !config[ttsToggle]})} className={`h-5 w-9 rounded-full relative transition-all ${config[ttsToggle] ? 'bg-emerald-500/80' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config[ttsToggle] ? 'translate-x-4' : 'translate-x-0.5'}`} /></button>
                    </div>
                    <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase text-neutral-500">Teks yang dibacakan TTS</label>
                        <textarea value={config[templateField] as string} onChange={(e) => setConfig({...config, [templateField]: e.target.value})} className="w-full bg-neutral-900/50 border border-white/5 rounded-2xl p-3 text-xs text-white h-16 resize-none" />
                    </div>
                    <label className="block">
                        <span className="mb-1 block text-[9px] font-bold uppercase text-neutral-500">Suara browser</span>
                        <select value={config[voiceField] as string} onChange={(e) => setConfig({...config, [voiceField]: e.target.value})} className="w-full bg-neutral-900/50 border border-white/5 rounded-xl py-2.5 px-3 text-[10px] text-white font-bold">
                            <option value="">Otomatis (bahasa Indonesia)</option>
                            {config[voiceField] && !browserVoices.some(voice => voice.name === config[voiceField]) && <option value={config[voiceField] as string}>{config[voiceField]} (pilihan lama; otomatis jika tidak tersedia)</option>}
                            {browserVoices.map(voice => <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} ({voice.lang})</option>)}
                        </select>
                        {browserVoices.length === 0 && <span className="mt-1 block text-[8px] text-amber-400">Browser belum menyediakan daftar suara. TTS akan memakai suara default jika tersedia.</span>}
                    </label>
                </div>
            </div>
        )}
    </div>
  );

  const selectedElement = elements.find(el => el.id === selectedId);
  const hasDynamicTemplate = (el: Element) =>
    el.type === "text" && /\{(?:nickname|username|giftname|likecount|comment|repeatcount)\}/i.test(getElementState(el).content);
  const showActiveEventElement = (el: Element) => {
    if (showEditor) return true;
    if (!activeNotification || !notifVisible) {
      return (!el.eventTypes || el.eventTypes.length === 0) && !hasDynamicTemplate(el);
    }
    if (!isTypeEnabled(activeNotification.type) && !activeNotification.isTest) return false;
    return !el.eventTypes || el.eventTypes.includes(activeNotification.type);
  };

  return (
    <div className={`fixed inset-0 font-sans transition-colors duration-500 ${isGreenScreen ? "bg-[#00ff00]" : "bg-transparent"}`}>
      {isAdmin && showEditor && (
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
                        <button key={cat.id} onClick={() => setSettingsTab(cat.id as "gift" | "comment" | "like" | "join" | "follow" | "fan" | "share")} className={`flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all ${settingsTab === cat.id ? "bg-white/10 text-white border border-white/10" : "text-neutral-600 hover:bg-white/5"}`}><div className={settingsTab === cat.id ? cat.color : "text-neutral-700"}>{cat.icon}</div><span className="text-[8px] font-black uppercase mt-1 tracking-tighter">{cat.label}</span></button>
                      ))}
                    </div>
                    {settingsTab === "gift" && renderEventSettings("Gift", <Gift size={14} />, "openingSoundUrl", "giftVoice", "voiceOverTemplate", "onScreenGiftTemplate", "giftTtsEnabled", "giftImageUrl", "giftEnabled", "gift")}
                    {settingsTab === "comment" && renderEventSettings("Chat", <MessageSquare size={14} />, "commentOpeningSoundUrl", "commentVoice", "commentVoiceOverTemplate", "onScreenCommentTemplate", "commentTtsEnabled", "commentImageUrl", "commentEnabled", "comment")}
                    {settingsTab === "like" && renderEventSettings("Like", <Heart size={14} />, "likeOpeningSoundUrl", "likeVoice", "likeVoiceOverTemplate", "onScreenLikeTemplate", "likeTtsEnabled", "likeImageUrl", "likeEnabled", "like")}
                    {settingsTab === "join" && renderEventSettings("Join", <UserPlus size={14} />, "joinOpeningSoundUrl", "commentVoice", "joinVoiceOverTemplate", "onScreenJoinTemplate", "joinTtsEnabled", "joinImageUrl", "joinEnabled", "join")}
                    {settingsTab === "follow" && renderEventSettings("Follow", <UserPlus size={14} />, "followOpeningSoundUrl", "followVoice", "followVoiceOverTemplate", "onScreenFollowTemplate", "followTtsEnabled", "followImageUrl", "followEnabled", "follow")}
                    {settingsTab === "fan" && renderEventSettings("Fan", <Crown size={14} />, "fanOpeningSoundUrl", "fanVoice", "fanVoiceOverTemplate", "onScreenFanTemplate", "fanTtsEnabled", "fanImageUrl", "fanEnabled", "fan")}
                    {settingsTab === "share" && renderEventSettings("Share", <Zap size={14} />, "shareOpeningSoundUrl", "shareVoice", "shareVoiceOverTemplate", "onScreenShareTemplate", "shareTtsEnabled", "shareImageUrl", "shareEnabled", "share")}
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
             const isVisible = showActiveEventElement(el);
             return (
              <div key={el.id} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, el.id, "move"); }} style={{ left: state.x, top: state.y, width: state.width, height: state.height, position: 'absolute', zIndex: 10, outline: (showEditor && selectedId === el.id) ? '2px solid #10b981' : 'none', opacity: isVisible ? 1 : 0, transition: 'opacity 0.4s ease-in-out' }}>
                {el.type === "text" ? (
                    <div style={{ ...el.style, width: '100%', height: '100%', display: 'flex', alignItems: state.verticalAlign === 'top' ? 'flex-start' : state.verticalAlign === 'bottom' ? 'flex-end' : 'center', justifyContent: state.textAlign === 'left' ? 'flex-start' : state.textAlign === 'right' ? 'flex-end' : 'center', textAlign: state.textAlign as "left" | "center" | "right" | undefined, WebkitTextStroke: (el.style?.strokeWidth) ? `${el.style.strokeWidth}px ${el.style.strokeColor || '#000000'}` : undefined, paintOrder: 'stroke fill' }}>
                        {(() => {
                            let t = state.content;
                            if (activeNotification) {
                                t = activeNotification.type === 'gift' ? config.onScreenGiftTemplate : activeNotification.type === 'comment' ? config.onScreenCommentTemplate : activeNotification.type === 'like' ? config.onScreenLikeTemplate : activeNotification.type === 'join' ? config.onScreenJoinTemplate : activeNotification.type === 'follow' ? config.onScreenFollowTemplate : activeNotification.type === 'fan' ? config.onScreenFanTemplate : activeNotification.type === 'share' ? config.onScreenShareTemplate : state.content;
                                return t.replace(/{nickname}/g, activeNotification.nickname).replace(/{username}/g, activeNotification.username).replace(/{giftname}/g, activeNotification.namaHadiah || "").replace(/{likecount}/g, String(activeNotification.likeCount || "")).replace(/{comment}/g, activeNotification.rawComment || "").replace(/{repeatcount}/g, String(activeNotification.repeatCount || 1));
                            }
                            return t;
                        })()}
                    </div>
                ) : (
                    (() => {
                        let src = state.content;
                        if (activeNotification) {
                            const catImg = config[`${activeNotification.type}ImageUrl` as keyof WidgetConfig] as string | undefined;
                            if (catImg && !el.overrides?.[activeNotification.type]?.content) src = catImg;
                        }
                        if (!src && showEditor) return <div className="w-full h-full border border-dashed border-white/20 flex items-center justify-center text-[10px] text-white/20">DYNAMIC IMAGE</div>;
                        return src ? <img src={src} className="w-full h-full" style={{ objectFit: state.objectFit as "contain" | "cover" | "fill" | "none" | undefined }} /> : null;
                    })()
                )}
                {showEditor && selectedId === el.id && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full cursor-se-resize" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, el.id, "resize"); }} />}
              </div>
           );
        })}
      </div>
      {isAdmin && (
        <button onClick={() => setShowEditor(!showEditor)} className="fixed bottom-6 right-6 p-4 bg-black/40 text-white rounded-full backdrop-blur-md opacity-30 hover:opacity-100 transition z-[200]">{showEditor ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      )}
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;700;800&family=Passion+One:wght@400;900&display=swap'); body { background: transparent !important; overflow: hidden; }`}</style>
    </div>
  );
}
