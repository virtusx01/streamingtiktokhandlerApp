"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, X, RefreshCw } from "lucide-react";

interface ScreencapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCoordinate: (x: number, y: number) => void;
}

export default function ScreencapModal({ isOpen, onClose, onSelectCoordinate }: ScreencapModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchScreencap();
    } else {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }
  }, [isOpen]);

  const fetchScreencap = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/screencap?t=" + Date.now());
      if (!res.ok) throw new Error("Failed to fetch screencap");
      const blob = await res.blob();
      setImageUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      alert("Failed to capture screen. Ensure ADB is connected and authorized.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    
    // Calculate the percentage of where the user clicked vs the displayed image size
    const rect = img.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    // Multiply by natural width/height to get actual device coordinates
    const actualX = Math.round(xRatio * img.naturalWidth);
    const actualY = Math.round(yRatio * img.naturalHeight);

    onSelectCoordinate(actualX, actualY);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative flex flex-col items-center max-h-full max-w-full">
        <button 
          onClick={onClose}
          className="absolute -top-12 -right-4 md:right-0 p-2 text-white hover:text-red-400 z-10 transition bg-neutral-800 rounded-full"
        >
          <X size={24} />
        </button>
        
        <div className="bg-neutral-900 border border-neutral-800 p-2 rounded-xl relative overflow-hidden group shadow-2xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center w-[300px] h-[600px] text-neutral-400">
              <Loader2 className="animate-spin mb-4 text-emerald-500" size={40} />
              <p>Fetching device screen using ADB...</p>
            </div>
          ) : imageUrl ? (
            <div className="relative group">
              <img 
                ref={imageRef}
                src={imageUrl} 
                className="max-h-[85vh] object-contain rounded-lg cursor-crosshair"
                alt="Device Screen"
                onClick={handleImageClick}
              />
              <button 
                onClick={(e) => { e.stopPropagation(); fetchScreencap(); }}
                className="absolute top-4 right-4 bg-black/60 p-2 rounded-md text-white hover:bg-neutral-700 transition"
                title="Refresh image"
              >
                <RefreshCw size={18} />
              </button>
              <div className="absolute inset-0 pointer-events-none border-2 border-transparent group-hover:border-emerald-500/50 transition duration-300 rounded-lg"></div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-full text-white text-sm pointer-events-none whitespace-nowrap flex items-center shadow-lg border border-neutral-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                Click anywhere to set coordinates
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
