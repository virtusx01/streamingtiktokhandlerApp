"use client";

import React, { useRef, useEffect, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera } from 'lucide-react';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        setError("Could not access camera. Please ensure permissions are granted.");
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = videoRef.current.videoHeight;
          canvas.width = videoRef.current.videoWidth;
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code) {
            onScan(code.data);
            return; // Stop scanning once we find a code
          }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md aspect-square bg-neutral-900 rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <X size={48} className="text-red-500 mb-4" />
            <p className="text-neutral-400 text-sm font-medium">{error}</p>
            <button 
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition text-xs font-bold"
            >
              CLOSE
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              className="absolute inset-0 w-full h-full object-cover" 
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay UI */}
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
                <div className="w-full h-full border-2 border-emerald-500/50 rounded-lg relative">
                    {/* Corners */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500"></div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500"></div>
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500"></div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500"></div>
                    
                    {/* Scanning Line Animation */}
                    <div className="absolute left-0 right-0 h-0.5 bg-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                </div>
            </div>
          </>
        )}
      </div>
      
      <div className="mt-8 text-center max-w-xs">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-center gap-2">
            <Camera size={20} className="text-emerald-400" /> Scan QR Code
        </h3>
        <p className="text-neutral-500 text-[10px] leading-relaxed uppercase tracking-widest font-bold">
            Point your camera at the Wireless Debugging QR code on your phone.
        </p>
      </div>

      <button 
        onClick={onClose}
        className="mt-10 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all hover:rotate-90"
      >
        <X size={24} />
      </button>

      <style jsx>{`
        @keyframes scan {
            0%, 100% { top: 0%; }
            50% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

export default QRCodeScanner;
