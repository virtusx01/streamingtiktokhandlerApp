"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Type, 
  Settings, 
  Eye, 
  EyeOff, 
  X, 
  Save, 
  Copy, 
  Check, 
  RotateCcw, 
  Bold, 
  Italic, 
  Palette, 
  Sliders,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Tv
} from "lucide-react";

interface TextBerjalanConfig {
  text: string;
  direction: "rtl" | "ltr";
  speed: number; // 1 to 50
  isFullWidth: boolean;
  width: number;
  height: number;
  verticalPos: number; // percentage from top (0 - 100)
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string;
  bgOpacity: number; // 0 to 100
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  loopMode: "continuous" | "full";
  gap: number;
}

const DEFAULT_CONFIG: TextBerjalanConfig = {
  text: "Selamat Datang di Live Streaming Kami! Jangan lupa Follow, Like, dan Share ya guys! ✨ ENJOY THE LIVE! ✨",
  direction: "rtl",
  speed: 12,
  isFullWidth: true,
  width: 900,
  height: 60,
  verticalPos: 50,
  fontSize: 28,
  fontFamily: "Baloo 2",
  fontColor: "#ffffff",
  bold: true,
  italic: false,
  strokeEnabled: true,
  strokeColor: "#000000",
  strokeWidth: 2.5,
  bgColor: "#10b981",
  bgOpacity: 80,
  borderRadius: 8,
  borderWidth: 0,
  borderColor: "#ffffff",
  loopMode: "continuous",
  gap: 120
};

const FONT_OPTIONS = [
  { value: "Baloo 2", label: "Baloo 2 (Bubbly)" },
  { value: "Passion One", label: "Passion One (Heavy)" },
  { value: "Inter", label: "Inter (Modern)" },
  { value: "Roboto", label: "Roboto (Clean)" },
  { value: "Montserrat", label: "Montserrat (Elegant)" },
  { value: "Poppins", label: "Poppins (Rounded)" },
  { value: "sans-serif", label: "Sans Serif" }
];

const LOCAL_STORAGE_KEY = "textBerjalanConfig_v1";

export default function TextBerjalanPage() {
  const [config, setConfig] = useState<TextBerjalanConfig>(DEFAULT_CONFIG);
  const [showEditor, setShowEditor] = useState(false);
  const [isGreenScreen, setIsGreenScreen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load configuration from local storage & API
  useEffect(() => {
    const loadConfig = async () => {
      // 1. Quick load from localStorage for instant display
      try {
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localData) {
          const parsed = JSON.parse(localData);
          setConfig(prev => ({ ...DEFAULT_CONFIG, ...parsed }));
        }
      } catch (e) {}

      // 2. Fetch from DB config API for source alignment
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          if (data.textBerjalanConfig && Object.keys(data.textBerjalanConfig).length > 0) {
            setConfig(prev => ({ ...DEFAULT_CONFIG, ...data.textBerjalanConfig }));
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.textBerjalanConfig));
          }
        }
      } catch (err) {
        console.error("Failed to fetch config from API", err);
      } finally {
        setMounted(true);
      }
    };

    loadConfig();
  }, []);

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      // Save to local storage
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));

      // Save to database via API
      const res = await fetch("/api/config");
      if (res.ok) {
        const current = await res.json();
        const updated = {
          ...current,
          textBerjalanConfig: config
        };
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated)
        });
      }
      
      setTimeout(() => setIsSaving(false), 600);
    } catch (e) {
      setIsSaving(false);
      alert("Gagal menyimpan konfigurasi.");
    }
  };

  const resetConfig = async () => {
    if (window.confirm("Apakah Anda yakin ingin menyetel ulang konfigurasi ke default?")) {
      setConfig(DEFAULT_CONFIG);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
      
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const current = await res.json();
          const updated = {
            ...current,
            textBerjalanConfig: DEFAULT_CONFIG
          };
          await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });
        }
      } catch (e) {}
    }
  };

  const copyWidgetUrl = () => {
    try {
      const url = `${window.location.origin}/textberjalan`;
      navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      alert("Gagal menyalin URL.");
    }
  };

  // Helper to resolve background style
  const getBgStyle = () => {
    if (config.bgOpacity === 0) return "transparent";
    
    let cleanHex = config.bgColor.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map(c => c + c).join("");
    }
    const opacityHex = Math.round(config.bgOpacity * 2.55)
      .toString(16)
      .padStart(2, "0");
    return `#${cleanHex}${opacityHex}`;
  };

  // Calculate dynamic duration. Higher speed number = shorter duration.
  // We baseline at speed = 10 -> duration = 30 seconds for a standard scroll length
  const duration = Math.max(1, 400 / config.speed);

  if (!mounted) {
    return <div className="fixed inset-0 bg-transparent" />;
  }

  return (
    <div className={`fixed inset-0 font-sans transition-colors duration-500 overflow-hidden ${isGreenScreen ? "bg-[#00ff00]" : "bg-transparent"}`}>
      {/* Dynamic Keyframes & Global Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;700;800&family=Passion+One:wght@400;900&family=Inter:wght@400;600;800&family=Roboto:wght@400;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;600;800&display=swap');
        
        @keyframes marquee-rtl {
          0% { left: 100%; transform: translate3d(0, -50%, 0); }
          100% { left: 0%; transform: translate3d(-100%, -50%, 0); }
        }
        
        @keyframes marquee-ltr {
          0% { left: 0%; transform: translate3d(-100%, -50%, 0); }
          100% { left: 100%; transform: translate3d(0, -50%, 0); }
        }
        
        @keyframes marquee-continuous-rtl {
          0% { transform: translate3d(0, -50%, 0); }
          100% { transform: translate3d(-33.3333%, -50%, 0); }
        }
        
        @keyframes marquee-continuous-ltr {
          0% { transform: translate3d(-33.3333%, -50%, 0); }
          100% { transform: translate3d(0, -50%, 0); }
        }
        
        .animate-scroll-rtl {
          position: absolute;
          top: 50%;
          will-change: transform, left;
          animation: marquee-rtl ${duration}s linear infinite;
        }
        
        .animate-scroll-ltr {
          position: absolute;
          top: 50%;
          will-change: transform, left;
          animation: marquee-ltr ${duration}s linear infinite;
        }
        
        .animate-scroll-continuous-rtl {
          position: absolute;
          left: 0;
          top: 50%;
          display: flex;
          width: max-content;
          will-change: transform;
          animation: marquee-continuous-rtl ${duration}s linear infinite;
        }
        
        .animate-scroll-continuous-ltr {
          position: absolute;
          left: 0;
          top: 50%;
          display: flex;
          width: max-content;
          will-change: transform;
          animation: marquee-continuous-ltr ${duration}s linear infinite;
        }
        
        body {
          background: transparent !important;
          overflow: hidden;
        }
      `}} />

      {/* Editor UI Header */}
      {showEditor && (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-3 bg-neutral-950/85 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-xs font-black text-white uppercase tracking-wider">Mode Pengaturan Teks Berjalan</h1>
          </div>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button 
            onClick={() => setIsGreenScreen(!isGreenScreen)} 
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
              isGreenScreen ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "bg-white/5 text-neutral-300 border border-white/5 hover:bg-white/10"
            }`}
          >
            <Tv size={12} /> Chroma Key
          </button>
          <button 
            onClick={copyWidgetUrl} 
            className="px-3 py-1.5 bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1.5"
          >
            {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {isCopied ? "Tersalin!" : "Salin URL OBS"}
          </button>
        </div>
      )}

      {/* Marquee Output Container */}
      <div 
        style={{
          position: "absolute",
          left: config.isFullWidth ? "0" : "50%",
          top: `${config.verticalPos}%`,
          transform: `translate(${config.isFullWidth ? "0px" : "-50%"}, -50%)`,
          width: config.isFullWidth ? "100%" : `${config.width}px`,
          height: `${config.height}px`,
          backgroundColor: getBgStyle(),
          borderRadius: `${config.borderRadius}px`,
          borderWidth: `${config.borderWidth}px`,
          borderColor: config.borderColor,
          borderStyle: config.borderWidth > 0 ? "solid" : "none",
          outline: showEditor ? "2px dashed #10b981" : "none",
          outlineOffset: "4px",
        }}
        className="relative overflow-hidden transition-[outline] duration-300 shadow-lg"
      >
        <div className="w-full h-full relative">
          {config.loopMode === "continuous" ? (
            <div 
              key={`cont-${config.direction}-${config.speed}-${config.text}-${config.fontSize}-${config.fontFamily}-${config.strokeEnabled}-${config.strokeWidth}-${config.fontColor}-${config.gap}`}
              className={config.direction === "rtl" ? "animate-scroll-continuous-rtl" : "animate-scroll-continuous-ltr"}
              style={{
                color: config.fontColor,
                fontSize: `${config.fontSize}px`,
                fontFamily: config.fontFamily,
                fontWeight: config.bold ? "bold" : "normal",
                fontStyle: config.italic ? "italic" : "normal",
                textShadow: config.strokeEnabled 
                  ? `-${config.strokeWidth}px -${config.strokeWidth}px 0 ${config.strokeColor},  
                      ${config.strokeWidth}px -${config.strokeWidth}px 0 ${config.strokeColor},
                     -${config.strokeWidth}px  ${config.strokeWidth}px 0 ${config.strokeColor},
                      ${config.strokeWidth}px  ${config.strokeWidth}px 0 ${config.strokeColor}`
                  : "none",
                display: "flex",
                whiteSpace: "nowrap"
              }}
            >
              <span style={{ paddingRight: `${config.gap}px` }}>{config.text}</span>
              <span style={{ paddingRight: `${config.gap}px` }} aria-hidden="true">{config.text}</span>
              <span style={{ paddingRight: `${config.gap}px` }} aria-hidden="true">{config.text}</span>
            </div>
          ) : (
            <div 
              key={`full-${config.direction}-${config.speed}-${config.text}-${config.fontSize}-${config.fontFamily}-${config.strokeEnabled}-${config.strokeWidth}-${config.fontColor}`}
              className={config.direction === "rtl" ? "animate-scroll-rtl" : "animate-scroll-ltr"}
              style={{
                color: config.fontColor,
                fontSize: `${config.fontSize}px`,
                fontFamily: config.fontFamily,
                fontWeight: config.bold ? "bold" : "normal",
                fontStyle: config.italic ? "italic" : "normal",
                textShadow: config.strokeEnabled 
                  ? `-${config.strokeWidth}px -${config.strokeWidth}px 0 ${config.strokeColor},  
                      ${config.strokeWidth}px -${config.strokeWidth}px 0 ${config.strokeColor},
                     -${config.strokeWidth}px  ${config.strokeWidth}px 0 ${config.strokeColor},
                      ${config.strokeWidth}px  ${config.strokeWidth}px 0 ${config.strokeColor}`
                  : "none",
                whiteSpace: "nowrap"
              }}
            >
              {config.text}
            </div>
          )}
        </div>
      </div>

      {/* Settings Side Panel Drawer */}
      {showEditor && (
        <div className="absolute right-0 top-0 bottom-0 w-[400px] z-50 bg-neutral-950/90 backdrop-blur-2xl border-l border-white/10 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <Settings size={18} />
              </div>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">Pengaturan Widget</h2>
                <p className="text-[10px] text-neutral-500 font-medium">Kustomisasi teks berjalan Anda</p>
              </div>
            </div>
            <button 
              onClick={() => setShowEditor(false)} 
              className="text-neutral-500 hover:text-white transition p-1.5 hover:bg-white/5 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Text Input */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block">Isi Teks Berjalan</label>
              <textarea 
                value={config.text} 
                onChange={(e) => setConfig({ ...config, text: e.target.value })} 
                className="w-full bg-neutral-900/50 border border-white/10 rounded-2xl p-4 text-xs text-white h-24 resize-none outline-none focus:border-emerald-500/50 transition-all font-medium"
                placeholder="Masukkan teks di sini..."
              />
            </div>

            {/* Arah & Kecepatan */}
            <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-5 space-y-5">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders size={12} /> Arah & Kecepatan
              </h3>

              {/* Direction selector */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-neutral-500 uppercase block">Arah Gerak</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950/50 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setConfig({ ...config, direction: "rtl" })} 
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      config.direction === "rtl" 
                        ? "bg-white/10 text-white shadow-md border border-white/5" 
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    <ArrowLeft size={14} /> Kanan ke Kiri
                  </button>
                  <button 
                    onClick={() => setConfig({ ...config, direction: "ltr" })} 
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      config.direction === "ltr" 
                        ? "bg-white/10 text-white shadow-md border border-white/5" 
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Kiri ke Kanan <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Speed Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Kecepatan ({config.speed})</span>
                  <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-black">
                    {config.speed < 10 ? "Lambat" : config.speed > 25 ? "Cepat" : "Sedang"}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="50" 
                  step="1"
                  value={config.speed} 
                  onChange={(e) => setConfig({ ...config, speed: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Loop Mode Selector */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <span className="text-[9px] font-bold text-neutral-500 uppercase block">Mode Animasi</span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950/50 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setConfig({ ...config, loopMode: "continuous" })} 
                    className={`flex items-center justify-center py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      config.loopMode === "continuous" 
                        ? "bg-emerald-500 text-black shadow-md font-bold" 
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Loop Menerus
                  </button>
                  <button 
                    onClick={() => setConfig({ ...config, loopMode: "full" })} 
                    className={`flex items-center justify-center py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      config.loopMode === "full" 
                        ? "bg-emerald-500 text-black shadow-md font-bold" 
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Tunggu Habis
                  </button>
                </div>
              </div>

              {/* Loop Spacing Gap Slider */}
              {config.loopMode === "continuous" && (
                <div className="space-y-2 border-t border-white/5 pt-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase">Jarak Antar Teks (Gap)</span>
                    <span className="text-[10px] font-mono font-bold text-white">{config.gap}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="20" 
                    max="800" 
                    step="10"
                    value={config.gap} 
                    onChange={(e) => setConfig({ ...config, gap: Number(e.target.value) })} 
                    className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* Ukuran & Posisi */}
            <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-5 space-y-5">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders size={12} /> Ukuran & Posisi
              </h3>

              {/* Full Width Toggle */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div>
                  <span className="text-[9px] font-bold text-neutral-400 uppercase block">Lebar Penuh (100%)</span>
                  <span className="text-[8px] text-neutral-600 font-medium">Teks berjalan membentang sepanjang layar</span>
                </div>
                <div 
                  onClick={() => setConfig({ ...config, isFullWidth: !config.isFullWidth })} 
                  className={`w-11 h-6 rounded-full relative transition-all cursor-pointer ${
                    config.isFullWidth ? "bg-emerald-500" : "bg-neutral-800"
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.isFullWidth ? "translate-x-6" : "translate-x-1"
                  }`} />
                </div>
              </div>

              {/* Width Slider (if not full width) */}
              {!config.isFullWidth && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase">Lebar Container</span>
                    <span className="text-[10px] font-mono font-bold text-white">{config.width}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="200" 
                    max="1920" 
                    step="10"
                    value={config.width} 
                    onChange={(e) => setConfig({ ...config, width: Number(e.target.value) })} 
                    className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              )}

              {/* Height Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Tinggi Container</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.height}px</span>
                </div>
                <input 
                  type="range" 
                  min="30" 
                  max="300" 
                  step="5"
                  value={config.height} 
                  onChange={(e) => setConfig({ ...config, height: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Vertical Position (Top Offset) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Posisi Vertikal Layar</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.verticalPos}%</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="95" 
                  step="1"
                  value={config.verticalPos} 
                  onChange={(e) => setConfig({ ...config, verticalPos: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>

            {/* Konfigurasi Teks */}
            <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-5 space-y-5">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Type size={12} /> Tipografi Teks
              </h3>

              {/* Font Family */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-neutral-500 uppercase block">Jenis Huruf (Font)</span>
                <select 
                  value={config.fontFamily} 
                  onChange={(e) => setConfig({ ...config, fontFamily: e.target.value })} 
                  className="w-full bg-neutral-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white font-bold outline-none focus:border-emerald-500/50"
                >
                  {FONT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-neutral-950">{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Ukuran Huruf</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.fontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="12" 
                  max="120" 
                  step="1"
                  value={config.fontSize} 
                  onChange={(e) => setConfig({ ...config, fontSize: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Font Color Picker */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-500 uppercase">Warna Teks</span>
                <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-mono font-bold text-neutral-400">{config.fontColor.toUpperCase()}</span>
                  <input 
                    type="color" 
                    value={config.fontColor} 
                    onChange={(e) => setConfig({ ...config, fontColor: e.target.value })} 
                    className="w-7 h-6 rounded cursor-pointer border-none bg-transparent"
                  />
                </div>
              </div>

              {/* Bold & Italic Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => setConfig({ ...config, bold: !config.bold })} 
                  className={`flex items-center justify-center gap-2 py-2 border rounded-xl text-xs font-black transition-all ${
                    config.bold 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-neutral-900 border-white/5 text-neutral-500 hover:text-neutral-400"
                  }`}
                >
                  <Bold size={14} /> Bold
                </button>
                <button 
                  onClick={() => setConfig({ ...config, italic: !config.italic })} 
                  className={`flex items-center justify-center gap-2 py-2 border rounded-xl text-xs font-black transition-all ${
                    config.italic 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-neutral-900 border-white/5 text-neutral-500 hover:text-neutral-400"
                  }`}
                >
                  <Italic size={14} /> Italic
                </button>
              </div>
            </div>

            {/* Stroke / Border Outlines */}
            <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-5 space-y-5">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Palette size={12} /> Outline Teks (Stroke)
              </h3>

              {/* Stroke Enabled Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-neutral-400 uppercase block">Aktifkan Stroke</span>
                  <span className="text-[8px] text-neutral-600 font-medium">Beri garis tepi pada huruf agar terbaca</span>
                </div>
                <div 
                  onClick={() => setConfig({ ...config, strokeEnabled: !config.strokeEnabled })} 
                  className={`w-11 h-6 rounded-full relative transition-all cursor-pointer ${
                    config.strokeEnabled ? "bg-emerald-500" : "bg-neutral-800"
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.strokeEnabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </div>
              </div>

              {config.strokeEnabled && (
                <div className="space-y-4 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                  {/* Stroke Width */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-neutral-500 uppercase">Tebal Stroke</span>
                      <span className="text-[10px] font-mono font-bold text-white">{config.strokeWidth}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="10" 
                      step="0.5"
                      value={config.strokeWidth} 
                      onChange={(e) => setConfig({ ...config, strokeWidth: Number(e.target.value) })} 
                      className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Stroke Color Picker */}
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-neutral-500 uppercase">Warna Stroke</span>
                    <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-white/5">
                      <span className="text-[10px] font-mono font-bold text-neutral-400">{config.strokeColor.toUpperCase()}</span>
                      <input 
                        type="color" 
                        value={config.strokeColor} 
                        onChange={(e) => setConfig({ ...config, strokeColor: e.target.value })} 
                        className="w-7 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Background & Frame Style */}
            <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-5 space-y-5">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Palette size={12} /> Desain Frame & Latar
              </h3>

              {/* Background Color Picker */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-500 uppercase">Warna Latar</span>
                <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-mono font-bold text-neutral-400">{config.bgColor.toUpperCase()}</span>
                  <input 
                    type="color" 
                    value={config.bgColor} 
                    onChange={(e) => setConfig({ ...config, bgColor: e.target.value })} 
                    className="w-7 h-6 rounded cursor-pointer border-none bg-transparent"
                  />
                </div>
              </div>

              {/* Background Opacity */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Transparansi Latar</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.bgOpacity}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="5"
                  value={config.bgOpacity} 
                  onChange={(e) => setConfig({ ...config, bgOpacity: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Border Radius */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Sudut Frame (Radius)</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.borderRadius}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="60" 
                  step="1"
                  value={config.borderRadius} 
                  onChange={(e) => setConfig({ ...config, borderRadius: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Border Width */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Tebal Garis Tepi Frame</span>
                  <span className="text-[10px] font-mono font-bold text-white">{config.borderWidth}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="10" 
                  step="1"
                  value={config.borderWidth} 
                  onChange={(e) => setConfig({ ...config, borderWidth: Number(e.target.value) })} 
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Border Color */}
              {config.borderWidth > 0 && (
                <div className="flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Warna Garis Tepi Frame</span>
                  <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-white/5">
                    <span className="text-[10px] font-mono font-bold text-neutral-400">{config.borderColor.toUpperCase()}</span>
                    <input 
                      type="color" 
                      value={config.borderColor} 
                      onChange={(e) => setConfig({ ...config, borderColor: e.target.value })} 
                      className="w-7 h-6 rounded cursor-pointer border-none bg-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/5 bg-neutral-950/60 grid grid-cols-2 gap-3">
            <button 
              onClick={resetConfig} 
              className="py-3 bg-neutral-900 border border-white/5 hover:bg-neutral-800 hover:text-white text-neutral-400 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={12} /> Reset
            </button>
            <button 
              onClick={saveConfig} 
              className="py-3 bg-emerald-500 text-black hover:bg-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/15 transition-all flex items-center justify-center gap-1.5"
            >
              <Save size={12} /> {isSaving ? "Disimpan..." : "Simpan"}
            </button>
          </div>

        </div>
      )}

      {/* Floating Toggle Editor Button (Bottom-Right) */}
      <button 
        onClick={() => setShowEditor(!showEditor)} 
        className="fixed bottom-6 right-6 p-4 bg-black/40 hover:bg-black/70 text-white rounded-full backdrop-blur-md border border-white/10 opacity-40 hover:opacity-100 transition duration-300 z-[200] shadow-xl hover:scale-105"
        title="Toggle Pengaturan Teks Berjalan"
      >
        {showEditor ? <EyeOff size={22} /> : <Eye size={22} />}
      </button>
    </div>
  );
}
