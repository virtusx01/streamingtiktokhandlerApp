"use client";

import { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, Heart, Gift, UserPlus, Sparkles, Smile, Eye, EyeOff, Settings, X, Zap, Candy, IceCream, 
  GripVertical, Palette, Settings2, Bell, Maximize, Crown, Layout, History, Save, Volume2 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CommentConfig {
  theme: "modern" | "minimalist" | "clean" | "bubblegum" | "peach" | "custom";
  borderRadius: number;
  maxComments: number;
  position?: { x: number; y: number };
  // Alert Settings
  commentEnabled: boolean;
  commentTtsEnabled: boolean;
  commentVoice: string;
  commentVoiceOverTemplate: string;
  commentOpeningSoundUrl: string;
  ttsSpeed: number;
  // Display & Chroma Settings
  isVisible: boolean;
  chromaColor: string;
  // Custom Styles
  customFontFamily: string;
  customFontSize: number;
  customFontWeight: string;
  customTextColor: string;
  customUsernameColor: string;
  customBgColor: string;
  customBgOpacity: number;
  customBorderColor: string;
  customBorderWidth: number;
  customShadowColor: string;
  customShadowBlur: number;
  customShadowOpacity: number;
  customTextStrokeColor: string;
  customTextStrokeWidth: number;
  tiktokUsername: string;
}

const FONTS = [
  "Inter", "Roboto", "Poppins", "Montserrat", "Open Sans", "Comic Sans MS", "Fredoka One", "Luckiest Guy", "Chakra Petch"
];

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex || hex === 'transparent') return 'transparent';
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const VOICE_OPTIONS = [
  { value: "id-ID-ArdiNeural", label: "Ardi (Pria)" },
  { value: "id-ID-GadisNeural", label: "Gadis (Wanita)" },
];

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

export default function CommentPage() {
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [config, setConfig] = useState<CommentConfig>({
    theme: "modern",
    borderRadius: 24,
    maxComments: 15,
    position: { x: 0, y: 0 },
    commentEnabled: true,
    commentTtsEnabled: true,
    commentVoice: "id-ID-ArdiNeural",
    commentVoiceOverTemplate: "{nickname} bilang: {message}",
    commentOpeningSoundUrl: "",
    ttsSpeed: 1.0,
    isVisible: true,
    chromaColor: "transparent",
    customFontFamily: "Inter",
    customFontSize: 15,
    customFontWeight: "600",
    customTextColor: "#ffffff",
    customUsernameColor: "#10b981",
    customBgColor: "#000000",
    customBgOpacity: 0.8,
    customBorderColor: "rgba(255,255,255,0.1)",
    customBorderWidth: 1,
    customShadowColor: "rgba(0,0,0,0.5)",
    customShadowBlur: 10,
    customShadowOpacity: 0.5,
    customTextStrokeColor: "#000000",
    customTextStrokeWidth: 0,
    tiktokUsername: "@onlyvirtus"
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'display' | 'style' | 'alerts' | 'layout'>('display');
  const [isSaving, setIsSaving] = useState(false);
  const [audioLocked, setAudioLocked] = useState(true);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const sseConnection = useRef<EventSource | null>(null);
  const duplicateGuard = useRef<Set<string>>(new Set());
  
  // Audio & Notification Queue
  const audioContextRef = useRef<AudioContext | null>(null);
  const notificationQueue = useRef<any[]>([]);
  const isProcessingQueue = useRef(false);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ==========================================
  // AUDIO CONTEXT UNLOCK & AUTO-START
  // ==========================================
  useEffect(() => {
    const tryUnlock = async () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
          
          // Verify with a silent play via Web Audio
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          gainNode.gain.value = 0;
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.start(0);
          oscillator.stop(ctx.currentTime + 0.1);

          // Also try to play the silent <img>/audio hack
          if (silentAudioRef.current) {
            silentAudioRef.current.play().catch(() => {});
          }

          setAudioLocked(false);
          console.log("[AUDIO-COMMENT] Context resumed successfully.");
        } catch (e) {
          console.warn("[AUDIO-COMMENT] Auto-resume blocked by browser policy.");
          setAudioLocked(true);
        }
      } else if (ctx.state === 'running') {
        setAudioLocked(false);
      }
    };

    // 1. Initial attempt
    tryUnlock();

    // 2. Automated "Default Click" simulation
    setTimeout(() => {
        document.body.click();
        console.log("[AUDIO-COMMENT] Programmatic body click attempted.");
    }, 1000);

    // 3. Persistent event-based triggers
    const events = ["click", "touchstart", "focus", "keydown", "mousedown"];
    const handler = () => {
      tryUnlock();
    };

    events.forEach(e => window.addEventListener(e, handler));
    document.addEventListener("visibilitychange", tryUnlock);

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      document.removeEventListener("visibilitychange", tryUnlock);
    };
  }, []);

  // Fetch config on mount
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.commentConfig) {
        setConfig(prev => ({ 
          ...prev, 
          ...data.commentConfig, 
          tiktokUsername: data.tiktokUsername || prev.tiktokUsername,
          commentVoiceOverTemplate: data.commentVoiceOverTemplate || data.commentConfig.commentVoiceOverTemplate || prev.commentVoiceOverTemplate,
          commentVoice: data.commentVoice || data.commentConfig.commentVoice || prev.commentVoice,
          commentOpeningSoundUrl: data.commentOpeningSoundUrl || data.commentConfig.commentOpeningSoundUrl || prev.commentOpeningSoundUrl,
          ttsSpeed: data.ttsSpeed ?? data.commentConfig.ttsSpeed ?? prev.ttsSpeed,
          commentEnabled: data.commentEnabled ?? data.commentConfig.commentEnabled ?? prev.commentEnabled,
          commentTtsEnabled: data.commentTtsEnabled ?? data.commentConfig.commentTtsEnabled ?? prev.commentTtsEnabled
        }));
      }
    } catch (e) {}
  };

  const saveConfig = async (newConfig: CommentConfig) => {
    setIsSaving(true);
    try {
      // Send at top level for global synchronization
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          commentConfig: newConfig,
          tiktokUsername: newConfig.tiktokUsername,
          commentVoiceOverTemplate: newConfig.commentVoiceOverTemplate,
          commentVoice: newConfig.commentVoice,
          commentOpeningSoundUrl: newConfig.commentOpeningSoundUrl,
          ttsSpeed: newConfig.ttsSpeed,
          commentEnabled: newConfig.commentEnabled,
          commentTtsEnabled: newConfig.commentTtsEnabled
        }),
      });
      setConfig(newConfig);
    } catch (e) {
      console.error("Failed to save config", e);
    } finally {
      setIsSaving(false);
    }
  };

  const triggerTestComment = async (isSticker = false) => {
    try {
      await fetch("/api/test-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "comment", comment: isSticker ? "sticker" : "" }),
      });
    } catch (e) {}
  };

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(fetchConfig, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDragEnd = (_: any, info: any) => {
    const currentPos = config.position || { x: 0, y: 0 };
    const newPos = { 
      x: currentPos.x + info.offset.x, 
      y: currentPos.y + info.offset.y 
    };
    saveConfig({ ...config, position: newPos });
  };

  useEffect(() => {
    if (sseConnection.current) return;

    const eventSource = new EventSource("/api/events");
    sseConnection.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Filter: only show comments and gifts
        if (payload.type !== "comment" && payload.type !== "gift") return;

        const data = payload.data || payload;
        
        const eventId = data.eventId || data.msgId || data.giftId || data.timestamp || Date.now();
        const dedupId = `${payload.type}_${eventId}_${data.username}`;
        
        if (duplicateGuard.current.has(dedupId)) return;
        
        duplicateGuard.current.add(dedupId);
        setTimeout(() => duplicateGuard.current.delete(dedupId), 5000);

        setChatHistory(prev => {
          const newHistory = [...prev, { ...payload, id: dedupId }].slice(-config.maxComments);
          return newHistory;
        });

        // Trigger Alert Logic for Comments
        if (payload.type === "comment" && configRef.current.commentEnabled) {
          addToQueue(payload);
        }
      } catch (e) {}
    };

    return () => {
        if (sseConnection.current === eventSource) {
           eventSource.close();
           sseConnection.current = null;
        }
    };
  }, [config.maxComments]);

  const getThemeStyles = (itemType: string) => {
    const { theme, borderRadius } = config;
    const base = "flex flex-col gap-1.5 shadow-xl overflow-hidden transition-colors duration-300 pointer-events-auto";
    const brStyle = { borderRadius: `${borderRadius}px` };

    if (theme === "minimalist") {
      return {
        container: `${base} bg-blue-50/95 border-2 border-blue-200 p-3.5`,
        name: "text-blue-600 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5",
        text: "text-blue-900 text-[14px] font-bold leading-tight break-words",
        icon: <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />,
        style: brStyle,
        ornament: <Sparkles size={10} className="text-blue-300 ml-auto" />
      };
    }

    if (theme === "bubblegum") {
      return {
        container: `${base} bg-gradient-to-r from-pink-400/95 to-purple-400/95 p-4 border-2 border-white/50 shadow-pink-500/30`,
        name: "text-white font-black text-[12px] italic tracking-tight flex items-center gap-2 drop-shadow-sm",
        text: "text-white text-[15px] font-bold leading-tight break-words drop-shadow-md",
        icon: <Candy size={14} className="text-pink-100" />,
        style: brStyle,
        ornament: <Heart size={12} className="text-pink-200 fill-pink-200 ml-auto" />
      };
    }

    if (theme === "peach") {
      return {
        container: `${base} bg-orange-50/95 p-4 border-b-4 border-orange-200 shadow-orange-100`,
        name: "text-orange-500 font-bold text-[11px] uppercase tracking-widest flex items-center gap-2",
        text: "text-orange-900/80 text-[15px] font-semibold leading-tight break-words",
        icon: <IceCream size={14} className="text-orange-300" />,
        style: brStyle,
        ornament: null
      };
    }

    if (theme === "clean") {
      return {
        container: `${base} bg-white/98 p-4 border border-neutral-100`,
        name: "text-neutral-500 font-bold text-[10px] uppercase tracking-widest",
        text: "text-neutral-800 text-[15px] font-medium leading-tight break-words",
        icon: null,
        style: brStyle,
        ornament: null
      };
    }

    if ((theme as string) === "custom") {
      const shadowValue = `0 ${config.customShadowBlur / 2}px ${config.customShadowBlur}px ${config.customShadowColor}`;
      return {
        container: `overflow-hidden shadow-xl border overflow-hidden pointer-events-auto`,
        name: "flex items-center gap-2 mb-0.5",
        text: "leading-tight break-words",
        icon: null,
        style: { 
          borderRadius: `${borderRadius}px`,
          fontFamily: config.customFontFamily,
          backgroundColor: hexToRgba(config.customBgColor, config.customBgOpacity),
          borderColor: config.customBorderColor,
          borderWidth: `${config.customBorderWidth}px`,
          boxShadow: shadowValue,
          padding: '1rem'
        },
        nameStyle: {
          color: config.customUsernameColor,
          fontSize: `${config.customFontSize - 4}px`,
          fontWeight: 900,
          textTransform: 'uppercase' as any,
          letterSpacing: '0.05em',
          WebkitTextStroke: `${config.customTextStrokeWidth}px ${config.customTextStrokeColor}`
        },
        textStyle: {
          color: config.customTextColor,
          fontSize: `${config.customFontSize}px`,
          fontWeight: config.customFontWeight as any,
          WebkitTextStroke: `${config.customTextStrokeWidth}px ${config.customTextStrokeColor}`
        },
        ornament: null
      };
    }

    return {
      container: `${base} bg-neutral-900/90 backdrop-blur-md p-4 border border-white/10`,
      name: "text-emerald-400 font-black text-[11px] uppercase tracking-wider flex items-center gap-2 mb-1",
      text: "text-white text-[15px] font-medium leading-tight break-words pl-3.5 border-l-2 border-white/10",
      icon: <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />,
      style: brStyle,
      ornament: null,
      nameStyle: {},
      textStyle: {}
    };
  };

  // ==========================================
  // CORE: NOTIFICATION QUEUE & TTS
  // ==========================================
  const addToQueue = (item: any) => {
    notificationQueue.current.push(item);
    processQueue();
  };

  const processQueue = async () => {
    if (isProcessingQueue.current || notificationQueue.current.length === 0) return;
    isProcessingQueue.current = true;

    const item = notificationQueue.current.shift()!;
    const data = item.data || item;
    const currentConfig = configRef.current;

    try {
      // 1. Play Opening Sound if exists
      if (currentConfig.commentOpeningSoundUrl) {
        await playSound(currentConfig.commentOpeningSoundUrl);
      }

      // 2. TTS Voice Over
      if (currentConfig.commentTtsEnabled) {
        const isSticker = data.images && data.images.length > 0;
        
        if (!isSticker) {
          const nickname = data.nickname || data.username || "Viewer";
          const message = data.comment || "";
          const template = currentConfig.commentVoiceOverTemplate || "{nickname} bilang: {message}";
          const ttsText = template.replace("{nickname}", nickname).replace("{message}", message);
          await playTTS(ttsText, currentConfig.commentVoice, currentConfig.ttsSpeed);
        }
      }
    } catch (e) {
      console.error("Alert processing failed", e);
    } finally {
      isProcessingQueue.current = false;
      setTimeout(processQueue, 500);
    }
  };

  const playSound = (url: string) => {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.play().catch(reject);
    });
  };

  const playTTS = async (text: string, voice: string, speed: number) => {
    try {
      const url = `/api/tts?text=${encodeURIComponent(text)}&speed=${speed}&voice=${encodeURIComponent(voice)}`;
      const response = await fetch(url);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const buffer = await ctx.decodeAudioData(arrayBuffer);
      
      return new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => resolve();
        source.start(0);
        
        // Safety timeout in case onended never fires
        setTimeout(() => resolve(), 10000);
      });
    } catch (e) {
      console.error("TTS failed", e);
    }
  };

  const handleSoundUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) saveConfig({ ...config, commentOpeningSoundUrl: data.url });
        } catch (err) { alert("Upload failed"); }
    };
    input.click();
  };

  return (
    <div 
      className="fixed inset-0 font-sans overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: config.chromaColor }}
    >
      {/* Draggable Area */}
      <motion.div 
        drag
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={{ x: config.position?.x || 0, y: config.position?.y || 0 }}
        className={`absolute bottom-10 left-10 w-full max-w-[450px] cursor-grab active:cursor-grabbing group transition-opacity duration-500 ${config.isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
      >
        <div className="relative">
          <div 
            ref={chatContainerRef}
            className={`flex flex-col gap-2 transition-opacity duration-500 ${chatHistory.length >= 5 ? 'h-[600px]' : 'h-auto'}`}
          >
            <AnimatePresence initial={false}>
              {chatHistory.map((item, idx) => {
                const data = item.data || item;
                const nickname = data.nickname || data.username || "Viewer";
                const styles = getThemeStyles(item.type);
                
                return (
                  <motion.div
                    key={item.id || idx}
                    layout
                    initial={{ scale: 0.6, opacity: 0, x: -50 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    style={styles.style}
                    className={`${styles.container} ${chatHistory.length >= 5 ? 'flex-1 min-h-0' : 'h-auto flex-none'} justify-center`}
                  >
                    {item.type === 'gift' ? (
                      <div className="flex items-center gap-3 w-full">
                        <div className="relative group">
                          {data.giftIcon ? (
                            <motion.img 
                              src={data.giftIcon} 
                              className="w-12 h-12 object-contain drop-shadow-lg" 
                              initial={{ scale: 0.5, rotate: -15 }}
                              animate={{ scale: 1.1, rotate: 0 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            />
                          ) : (
                            <div className="bg-gradient-to-br from-pink-500 to-rose-600 p-2.5 rounded-xl text-white shadow-lg animate-bounce">
                              <Gift size={18} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-pink-500 text-[10px] uppercase leading-none mb-1">{nickname}</span>
                          <span className={`text-sm font-bold ${['clean', 'peach', 'minimalist'].includes(config.theme) ? 'text-neutral-800' : 'text-white'}`}>Kirim {data.namaHadiah || data.giftName}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center">
                        <div className={styles.name} style={styles.nameStyle}>
                          {styles.icon && <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>{styles.icon}</motion.div>}
                          {nickname}
                          {styles.ornament}
                        </div>
                        {data.comment && <span className={styles.text} style={styles.textStyle}>{data.comment}</span>}
                        {data.images && data.images.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1 justify-center">
                            {data.images.map((img: string, i: number) => (
                              <motion.img 
                                key={i} src={img} 
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="max-h-12 w-auto rounded-md object-contain bg-white/5" 
                                alt="sticker"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Floating Controls Overlay */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-[100]">
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              className="bg-neutral-950/95 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-2xl w-[520px] overflow-hidden flex"
              style={{ height: '580px' }}
            >
              {/* Sidebar Navigation */}
              <div className="w-[72px] bg-black/40 border-r border-white/5 flex flex-col items-center py-8 gap-8">
                {[
                  { id: 'display', icon: Palette, color: 'text-blue-500' },
                  { id: 'style', icon: Settings2, color: 'text-emerald-500' },
                  { id: 'alerts', icon: Bell, color: 'text-pink-500' },
                  { id: 'layout', icon: Maximize, color: 'text-orange-500' },
                ].map((tab) => {
                   const Icon = tab.icon as any;
                   const isActive = activeTab === tab.id;
                   return (
                     <button
                       key={tab.id}
                       onClick={() => setActiveTab(tab.id as any)}
                       className={`relative p-3 rounded-2xl transition-all duration-300 group ${
                         isActive ? 'bg-white/10 text-white' : 'text-neutral-600 hover:text-neutral-400 hover:bg-white/5'
                       }`}
                     >
                        <Icon size={22} className={isActive ? tab.color : ''} />
                        {isActive && (
                          <motion.div 
                            layoutId="activeTabGlow" 
                            className="absolute -right-[1px] top-2 bottom-2 w-[3px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                          />
                        )}
                        <span className="absolute left-[75px] bg-neutral-800 text-white text-[9px] font-black uppercase px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none tracking-widest whitespace-nowrap z-50 shadow-xl border border-white/5">
                          {tab.id}
                        </span>
                     </button>
                   );
                })}
              </div>

              {/* Content Area */}
              <div className="flex-1 flex flex-col h-full bg-black/10">
                <div className="p-7 flex items-center justify-between border-b border-white/5">
                   <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${
                         activeTab === 'display' ? 'bg-blue-500' : 
                         activeTab === 'style' ? 'bg-emerald-500' :
                         activeTab === 'alerts' ? 'bg-pink-500' : 'bg-orange-500'
                      }`} />
                      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">
                        {activeTab === 'display' ? 'Visual & Tema' : 
                         activeTab === 'style' ? 'Gaya Kustom' :
                         activeTab === 'alerts' ? 'Notifikasi TTS' : 'Layout & Antarmuka'}
                      </h2>
                   </div>
                   <button onClick={() => setShowSettings(false)} className="p-2.5 hover:bg-white/5 rounded-2xl transition-colors text-neutral-500 hover:text-white">
                      <X size={18} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
                  <div className="space-y-10 pb-10">
                    {activeTab === 'display' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                        <section>
                          <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-5">Pilihan Tema Preset</label>
                          <div className="grid grid-cols-2 gap-3">
                            {["modern", "minimalist", "clean", "bubblegum", "peach", "custom"].map((t) => (
                              <button
                                key={t}
                                onClick={() => saveConfig({ ...config, theme: t as any })}
                                className={`py-3.5 text-[10px] font-black uppercase rounded-2xl border transition-all duration-500 flex items-center justify-center gap-2.5 ${
                                  config.theme === t 
                                    ? "bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-500/30 scale-[1.02]" 
                                    : "bg-white/5 border-white/5 text-neutral-500 hover:border-white/10 hover:bg-white/10"
                                }`}
                              >
                                {t === 'modern' && <Sparkles size={12} />}
                                {t === 'bubblegum' && <Candy size={12} />}
                                {t}
                              </button>
                            ))}
                          </div>
                        </section>

                        <section className="space-y-5">
                           <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-1">Overlay Visibility</label>
                           <div className="flex items-center justify-between p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-colors cursor-pointer group" onClick={() => saveConfig({...config, isVisible: !config.isVisible})}>
                              <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl transition-all duration-500 ${config.isVisible ? 'bg-blue-500/20 text-blue-400' : 'bg-neutral-800 text-neutral-600'}`}>
                                  {config.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                                </div>
                                <div>
                                   <span className="text-[10px] font-black text-white uppercase tracking-wider block">Status Tampilan</span>
                                   <span className="text-[8px] font-bold text-neutral-500 uppercase">{config.isVisible ? 'Terlihat di Live' : 'Tersembunyi'}</span>
                                </div>
                              </div>
                              <div className={`w-12 h-6 rounded-full relative transition-all duration-500 ${config.isVisible ? 'bg-blue-600' : 'bg-neutral-800'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-500 shadow-md ${config.isVisible ? 'translate-x-7' : 'translate-x-1'}`} />
                              </div>
                           </div>
                        </section>

                        <section className="space-y-5">
                           <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-1">Chroma Key Warna</label>
                           <div className="grid grid-cols-2 gap-3">
                            {[
                              { name: "Transparent", color: "transparent" },
                              { name: "Green Screen", color: "#00FF00" },
                              { name: "Blue Screen", color: "#0000FF" },
                              { name: "Pure Black", color: "#000000" }
                            ].map((cp) => (
                              <button
                                key={cp.name}
                                onClick={() => saveConfig({ ...config, chromaColor: cp.color })}
                                className={`p-4 rounded-2xl border text-[9px] font-black uppercase transition-all duration-500 flex items-center gap-4 ${
                                  config.chromaColor === cp.color 
                                    ? "bg-white text-black border-white shadow-2xl scale-[1.02]" 
                                    : "bg-white/5 border-white/5 text-neutral-500 hover:border-white/10"
                                }`}
                              >
                                <div className="w-5 h-5 rounded-full border border-black/10 shadow-inner" style={{ backgroundColor: cp.color === 'transparent' ? '#1a1a1a' : cp.color }} />
                                {cp.name}
                              </button>
                            ))}
                           </div>
                        </section>
                      </div>
                    )}

                    {activeTab === 'style' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                         {(config.theme as string) !== 'custom' ? (
                           <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[40px] text-center space-y-5">
                              <Settings2 size={32} className="mx-auto text-emerald-400 opacity-40" />
                              <div className="space-y-1">
                                <h3 className="text-xs font-black text-white uppercase tracking-widest">Fitur Terkunci</h3>
                                <p className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest leading-relaxed">Aktifkan Tema "Custom" untuk Mengatur Font & Warna Secara Bebas</p>
                              </div>
                              <button onClick={() => saveConfig({...config, theme: 'custom'})} className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-[10px] font-black text-white rounded-2xl uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20">Buka Pengaturan</button>
                           </div>
                         ) : (
                           <>
                              <section className="space-y-6">
                                <div className="space-y-4">
                                  <label className="text-[9px] text-neutral-500 font-black uppercase tracking-widest block">Tipografi</label>
                                  <select 
                                    value={config.customFontFamily}
                                    onChange={(e) => saveConfig({...config, customFontFamily: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-xs text-white font-black outline-none focus:border-emerald-500/30 transition-colors uppercase tracking-widest"
                                  >
                                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-5">
                                  <div className="space-y-3">
                                    <label className="text-[9px] text-neutral-500 font-black uppercase tracking-widest block">Font Size ({config.customFontSize}px)</label>
                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                      <input type="range" min="10" max="40" value={config.customFontSize} onChange={(e) => saveConfig({...config, customFontSize: parseInt(e.target.value)})} className="w-full accent-emerald-500" />
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <label className="text-[9px] text-neutral-500 font-black uppercase tracking-widest block">Thickness</label>
                                    <select value={config.customFontWeight} onChange={(e) => saveConfig({...config, customFontWeight: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-xs text-white font-black outline-none uppercase tracking-widest">
                                      {["400", "500", "600", "700", "800", "900"].map(w => <option key={w} value={w}>{w}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </section>

                              <section className="space-y-5 pt-10 border-t border-white/5">
                                <label className="text-[9px] text-neutral-500 font-black uppercase tracking-widest block mb-1">Palet Warna Teks</label>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white/5 p-4 rounded-3xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-[8px] font-black text-neutral-500 block mb-3 uppercase tracking-widest text-center">Chat Text</span>
                                    <div className="flex flex-col items-center gap-2">
                                      <input type="color" value={config.customTextColor} onChange={(e) => saveConfig({...config, customTextColor: e.target.value})} className="w-full h-10 rounded-xl cursor-pointer bg-transparent border-none" />
                                      <span className="text-[9px] font-mono font-bold text-white/30 uppercase">{config.customTextColor}</span>
                                    </div>
                                  </div>
                                  <div className="bg-white/5 p-4 rounded-3xl border border-white/5 hover:border-white/10 transition-colors">
                                    <span className="text-[8px] font-black text-neutral-500 block mb-3 uppercase tracking-widest text-center">Username</span>
                                    <div className="flex flex-col items-center gap-2">
                                      <input type="color" value={config.customUsernameColor} onChange={(e) => saveConfig({...config, customUsernameColor: e.target.value})} className="w-full h-10 rounded-xl cursor-pointer bg-transparent border-none" />
                                      <span className="text-[9px] font-mono font-bold text-white/30 uppercase">{config.customUsernameColor}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 space-y-5 shadow-inner">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Latar Belakang Box</span>
                                    <input type="color" value={config.customBgColor || "#000000"} onChange={(e) => saveConfig({...config, customBgColor: e.target.value})} className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-none shadow-xl" />
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex justify-between text-[9px] font-black text-neutral-500 uppercase tracking-widest">
                                      <span>Transparansi</span>
                                      <span className="text-emerald-500">{Math.round(config.customBgOpacity * 100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.05" value={config.customBgOpacity} onChange={(e) => saveConfig({...config, customBgOpacity: parseFloat(e.target.value)})} className="w-full accent-emerald-500" />
                                  </div>
                                </div>
                              </section>

                              <section className="space-y-5 pt-10 border-t border-white/5">
                                 <label className="text-[9px] text-neutral-500 font-black uppercase tracking-widest block mb-1">Outline & Shadow</label>
                                 <div className="grid grid-cols-1 gap-4">
                                    <div className="bg-white/5 p-5 rounded-[28px] border border-white/5 space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-[9px] font-black text-white uppercase tracking-wider">Stroke Background</span>
                                          <span className="text-[8px] font-bold text-neutral-600 uppercase">Ketebalan: {config.customBorderWidth}px</span>
                                        </div>
                                        <input type="color" value={(config.customBorderColor || "rgba(255,255,255,0.1)").startsWith('rgba') ? '#ffffff' : (config.customBorderColor || "#ffffff")} onChange={(e) => saveConfig({...config, customBorderColor: e.target.value})} className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-none shadow-lg" />
                                      </div>
                                      <input type="range" min="0" max="10" value={config.customBorderWidth} onChange={(e) => saveConfig({...config, customBorderWidth: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
                                    </div>

                                    <div className="bg-white/5 p-5 rounded-[28px] border border-white/5 space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-[9px] font-black text-white uppercase tracking-wider">Shadow Glow</span>
                                          <span className="text-[8px] font-bold text-neutral-600 uppercase">Intensitas: {config.customShadowBlur}px</span>
                                        </div>
                                        <input type="color" value={(config.customShadowColor || "rgba(0,0,0,0.5)").startsWith('rgba') ? '#000000' : (config.customShadowColor || "#000000")} onChange={(e) => saveConfig({...config, customShadowColor: e.target.value})} className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-none shadow-lg" />
                                      </div>
                                      <input type="range" min="0" max="40" value={config.customShadowBlur} onChange={(e) => saveConfig({...config, customShadowBlur: parseInt(e.target.value)})} className="w-full accent-purple-500" />
                                    </div>

                                    <div className="bg-white/5 p-5 rounded-[28px] border border-white/5 space-y-4">
                                       <div className="flex items-center justify-between">
                                         <div className="flex flex-col gap-0.5">
                                           <span className="text-[9px] font-black text-white uppercase tracking-wider">Text Outline</span>
                                           <span className="text-[8px] font-bold text-neutral-600 uppercase">Tebal: {config.customTextStrokeWidth}px</span>
                                         </div>
                                         <input type="color" value={config.customTextStrokeColor || "#000000"} onChange={(e) => saveConfig({...config, customTextStrokeColor: e.target.value})} className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-none shadow-lg" />
                                       </div>
                                       <input type="range" min="0" max="5" step="0.5" value={config.customTextStrokeWidth} onChange={(e) => saveConfig({...config, customTextStrokeWidth: parseFloat(e.target.value)})} className="w-full accent-pink-500" />
                                    </div>
                                 </div>
                              </section>
                           </>
                         )}
                      </div>
                    )}

                    {activeTab === 'alerts' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                         <section className="space-y-5">
                            <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-1">Sistem Notifikasi</label>
                            <div className={`p-6 rounded-[32px] border transition-all duration-700 ${config.commentEnabled ? 'bg-pink-600/10 border-pink-500/30' : 'bg-neutral-900 border-white/5 opacity-50'}`} onClick={() => saveConfig({...config, commentEnabled: !config.commentEnabled})}>
                               <div className="flex items-center justify-between cursor-pointer">
                                 <div className="flex items-center gap-5">
                                    <div className={`p-4 rounded-2xl shadow-xl transition-all duration-500 ${config.commentEnabled ? 'bg-pink-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-500'}`}>
                                       <Zap size={22} />
                                    </div>
                                    <div>
                                       <h4 className="text-[11px] font-black text-white uppercase tracking-[0.1em]">Alert Komentar</h4>
                                       <p className="text-[8px] text-pink-500/70 font-black uppercase mt-0.5">{config.commentEnabled ? 'Mesin TTS Siap Memproses' : 'Semua Alert Dimatikan'}</p>
                                    </div>
                                 </div>
                                 <div className={`w-14 h-7 rounded-full relative transition-all duration-500 ${config.commentEnabled ? 'bg-pink-600' : 'bg-neutral-800'}`}>
                                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-500 shadow-lg ${config.commentEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                                 </div>
                               </div>
                            </div>
                         </section>

                         {config.commentEnabled && (
                           <section className="space-y-8 animate-in slide-in-from-top-6 duration-700">
                              <div className="space-y-4">
                                 <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-1">TTS Voice Template</label>
                                    <div className="flex items-center gap-3 bg-neutral-900/50 p-1.5 rounded-xl border border-white/5">
                                       <span className="text-[8px] font-black text-neutral-500 uppercase ml-2">TTS ON</span>
                                       <div onClick={() => saveConfig({...config, commentTtsEnabled: !config.commentTtsEnabled})} className={`w-10 h-5 rounded-full relative transition-all duration-300 cursor-pointer ${config.commentTtsEnabled ? 'bg-emerald-600' : 'bg-neutral-800'}`}>
                                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 ${config.commentTtsEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                                       </div>
                                    </div>
                                 </div>
                                 <div className="relative group">
                                    <textarea 
                                       value={config.commentVoiceOverTemplate}
                                       onChange={(e) => saveConfig({...config, commentVoiceOverTemplate: e.target.value})}
                                       className="w-full bg-black/40 border border-white/5 rounded-[32px] p-6 text-sm text-white focus:outline-none focus:ring-4 focus:ring-pink-500/10 h-32 resize-none transition-all font-bold leading-relaxed shadow-inner"
                                       placeholder="{nickname} bilang: {message}"
                                    />
                                    <div className="absolute bottom-4 right-4 flex gap-2">
                                       {['{nickname}', '{message}'].map(tag => (
                                         <button key={tag} onClick={() => {
                                            const newVal = config.commentVoiceOverTemplate + tag;
                                            saveConfig({...config, commentVoiceOverTemplate: newVal});
                                         }} className="text-[8px] font-black bg-neutral-900 hover:bg-white hover:text-black text-neutral-500 px-3 py-1.5 rounded-xl border border-white/5 transition-all uppercase tracking-widest">{tag}</button>
                                       ))}
                                    </div>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-5">
                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black text-neutral-600 uppercase tracking-widest block ml-2">Audio Pembuka</label>
                                    <button 
                                       onClick={handleSoundUpload}
                                       className="w-full py-5 bg-pink-600/10 border border-pink-500/20 rounded-3xl text-pink-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-pink-600 hover:text-white transition-all shadow-xl shadow-pink-500/5 group"
                                    >
                                       <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                                       {config.commentOpeningSoundUrl ? 'Ganti Sound' : 'Upload Sound'}
                                    </button>
                                 </div>
                                 <div className="space-y-3">
                                    <label className="text-[9px] font-black text-neutral-600 uppercase tracking-widest block ml-2">Suara Karakter</label>
                                    <div className="relative">
                                       <select 
                                          value={config.commentVoice}
                                          onChange={(e) => saveConfig({...config, commentVoice: e.target.value})}
                                          className="w-full bg-neutral-900 border border-white/5 rounded-3xl py-5 px-5 text-[10px] font-black text-white outline-none cursor-pointer appearance-none hover:bg-neutral-800 transition-colors uppercase tracking-widest shadow-xl"
                                       >
                                          {VOICE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                       </select>
                                    </div>
                                 </div>
                              </div>

                              <div className="bg-white/5 p-7 rounded-[40px] border border-white/5 space-y-5">
                                 <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                       <div className="p-2 bg-pink-500/20 rounded-xl text-pink-500">
                                          <Zap size={14} />
                                       </div>
                                       <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Kecepatan Bicara</span>
                                    </div>
                                    <span className="text-pink-400 font-mono font-bold text-xs">{config.ttsSpeed}x</span>
                                 </div>
                                 <input 
                                    type="range" min="0.5" max="2.0" step="0.1"
                                    value={config.ttsSpeed}
                                    onChange={(e) => saveConfig({ ...config, ttsSpeed: parseFloat(e.target.value) })}
                                    className="w-full accent-pink-600"
                                 />
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-6">
                                <button onClick={() => triggerTestComment(false)} className="flex items-center justify-center gap-3 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white text-[10px] font-black py-5 rounded-[24px] transition-all border border-blue-500/30 uppercase tracking-[0.2em] shadow-lg shadow-blue-500/5">
                                  <MessageSquare size={16} /> Test Chat
                                </button>
                                <button onClick={() => triggerTestComment(true)} className="flex items-center justify-center gap-3 bg-pink-600/10 hover:bg-pink-600 text-pink-400 hover:text-white text-[10px] font-black py-5 rounded-[24px] transition-all border border-pink-500/30 uppercase tracking-[0.2em] shadow-lg shadow-pink-500/5">
                                  <Crown size={18} /> Test Gift
                                </button>
                              </div>
 
                              {/* Global Settings Addon */}
                              <div className="pt-6 border-t border-white/5 space-y-4">
                                <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block ml-1">Global Settings</label>
                                <div className="bg-neutral-900/40 p-5 rounded-[28px] border border-white/5 space-y-3">
                                   <div className="flex flex-col gap-1">
                                      <span className="text-[9px] font-black text-white uppercase tracking-wider">TikTok Username (@)</span>
                                      <input 
                                        type="text" 
                                        value={config.tiktokUsername} 
                                        onChange={(e) => setConfig({...config, tiktokUsername: e.target.value})}
                                        onBlur={() => saveConfig(config)}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500/30 transition-all font-bold"
                                        placeholder="@username"
                                      />
                                   </div>
                                </div>
                              </div>
                           </section>
                         )}
                      </div>
                    )}

                    {activeTab === 'layout' && (
                      <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                        <section className="space-y-6">
                           <div className="bg-white/5 p-8 rounded-[40px] border border-white/5 space-y-6 shadow-inner">
                              <div className="flex justify-between items-center">
                                 <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Lengkungan Box</span>
                                    <span className="text-[8px] font-bold text-neutral-600 uppercase">Border Radius Widget</span>
                                 </div>
                                 <span className="px-3 py-1 bg-orange-600/20 text-orange-400 text-[10px] font-black rounded-lg">{config.borderRadius}px</span>
                              </div>
                              <input 
                                type="range" min="0" max="60" 
                                value={config.borderRadius}
                                onChange={(e) => saveConfig({ ...config, borderRadius: parseInt(e.target.value) })}
                                className="w-full accent-orange-500"
                              />
                           </div>

                           <div className="bg-white/5 p-8 rounded-[40px] border border-white/5 space-y-6 shadow-inner">
                              <div className="flex justify-between items-center">
                                 <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Riwayat Maksimal</span>
                                    <span className="text-[8px] font-bold text-neutral-600 uppercase">Jumlah Chat yang Disimpan</span>
                                 </div>
                                 <span className="px-3 py-1 bg-orange-600/20 text-orange-400 text-[10px] font-black rounded-lg">{config.maxComments} Chat</span>
                              </div>
                              <input 
                                type="range" min="3" max="50" 
                                value={config.maxComments}
                                onChange={(e) => saveConfig({ ...config, maxComments: parseInt(e.target.value) })}
                                className="w-full accent-orange-500"
                              />
                           </div>
                        </section>

                        <section className="pt-10 border-t border-white/5 space-y-5">
                           <button 
                            onClick={async () => {
                              const reset = { ...config, position: { x: 0, y: 0 } };
                              saveConfig(reset);
                            }}
                            className="w-full py-5 bg-orange-600/10 border border-orange-500/30 rounded-3xl text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-orange-600 hover:text-white transition-all shadow-2xl shadow-orange-500/10 group"
                           >
                              <History size={16} className="group-hover:rotate-[-45deg] transition-transform" /> 
                              Reset Posisi Overlay
                           </button>
                           <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                              <p className="text-[9px] text-neutral-500 text-center font-bold uppercase leading-relaxed tracking-wider">Tip: Klik dan Tarik area komentar di layar untuk mengubah posisi secara bebas.</p>
                           </div>
                        </section>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Global Status Bar */}
                <div className="p-5 bg-black/40 border-t border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse" />
                      <span className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.2em]">Server Live Stream Connected</span>
                   </div>
                   {isSaving && (
                      <motion.div 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2"
                      >
                         <Save size={12} className="animate-spin" /> Sedang Menyimpan...
                      </motion.div>
                   )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-6 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-700 border group ${showSettings ? 'bg-white text-black border-white rotate-90 scale-110' : 'bg-neutral-900/90 backdrop-blur-md text-white border-white/10 hover:border-white/40 hover:scale-110 hover:shadow-blue-500/10'}`}
        >
          {showSettings ? <X size={24} /> : <Settings size={24} className="group-hover:rotate-90 transition-transform duration-700" />}
        </button>
      </div>

      {/* Audio Locked Overlay */}
      <AudioStatus locked={audioLocked} onClick={() => {
          if (audioContextRef.current) {
              audioContextRef.current.resume().then(() => setAudioLocked(false)).catch(() => {});
          }
      }} />

      {/* Silent Audio Loop for Auto-Unlock HACK */}
      <audio 
        ref={silentAudioRef}
        src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" 
        loop 
        muted={false}
        autoPlay 
        style={{ display: 'none' }} 
      />

      <style jsx global>{`
        @keyframes spin-slow-mod {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow-mod {
          animation: spin-slow-mod 8s linear infinite;
        }
        ::selection {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
