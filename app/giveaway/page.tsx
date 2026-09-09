'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';

interface Participant {
  username: string;
  nickname: string;
  profile_picture: string | null;
  has_followed: number;
  has_shared: number;
  has_commented: number;
  has_wa_group?: number;
  wa_member_tag?: string | null;
  wa_phone?: string | null;
  is_eligible: number;
  is_tester: number;
  registered_at: string;
  last_updated: string;
}

interface WaMember {
  jid: string;
  group_jid: string;
  phone: string;
  member_tag: string;
  push_name: string;
  role: string;
  has_absen: number;
  absen_at?: string | null;
  last_seen?: string | null;
}

interface Stats {
  real: { total: number; eligible: number; hasFollowed: number; hasShared: number; hasCommented: number; hasWaGroup?: number };
  tester: { total: number; eligible: number };
}

const WHEEL_COLORS = [
  '#2563EB', '#DC2626', '#16A34A', '#CA8A04', '#7C3AED',
  '#EA580C', '#0891B2', '#DB2777', '#4F46E5', '#059669',
  '#D97706', '#9333EA', '#E11D48', '#2563EB', '#0D9488',
];

// ─── Web Audio API Sound Synthesizer for Wheel of Names ───────────────────────
class WheelAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted() {
    return this.isMuted;
  }

  // Ticking sound when wheel passes pins
  public playTick(speedRatio: number = 0.5) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      // Realistic mechanical pin click
      const freq = 650 + Math.min(speedRatio, 1) * 350;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.022);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.025);
    } catch {
      // Audio context might be restricted before first gesture
    }
  }

  // Triumphant Fanfare & Cheering sound when winner is revealed
  public playWinnerFanfare() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // 1. Triumphant Fanfare arpeggio chords: C5, E5, G5, C6 + E6 harmony
      const notes = [
        { f: 523.25, time: 0, dur: 0.18 },
        { f: 659.25, time: 0.14, dur: 0.18 },
        { f: 783.99, time: 0.28, dur: 0.28 },
        { f: 1046.50, time: 0.52, dur: 1.2 },
        { f: 1318.51, time: 0.52, dur: 1.2 },
      ];

      notes.forEach(({ f, time, dur }) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.24, now + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });

      // 2. Synthesize celebratory crowd cheer / applause noise
      const bufferSize = this.ctx.sampleRate * 2.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.Q.setValueAtTime(1.4, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now + 0.25);
      noiseGain.gain.linearRampToValueAtTime(0.16, now + 0.65);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      whiteNoise.start(now + 0.25);
      whiteNoise.stop(now + 2.3);
    } catch (e) {
      console.error(e);
    }
  }
}

const wheelAudio = new WheelAudioSynthesizer();

// ─── Trigger Wheel of Names Full Confetti Blast ──────────────────────────────
export const triggerWheelOfNamesConfetti = () => {
  const duration = 5000;
  const animationEnd = Date.now() + duration;
  const colors = ['#2563EB', '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#FCD34D'];

  // Initial center blast
  confetti({
    particleCount: 110,
    spread: 100,
    origin: { y: 0.6 },
    colors,
    zIndex: 99999,
  });

  const frame = () => {
    // Left side cannon
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors,
      zIndex: 99999,
    });
    // Right side cannon
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors,
      zIndex: 99999,
    });

    if (Date.now() < animationEnd) {
      requestAnimationFrame(frame);
    }
  };

  requestAnimationFrame(frame);
};

// ─── Improved Spin Wheel (Wheel of Names Style) ───────────────────────────────
function SpinWheel({
  participants,
  onWinner,
  mode,
  soundMuted,
  onToggleSound,
  size = 340,
  onExpand,
}: {
  participants: Participant[];
  onWinner: (p: Participant) => void;
  mode: 'real' | 'tester';
  soundMuted: boolean;
  onToggleSound: () => void;
  size?: number;
  onExpand?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const animRef = useRef<number>(0);
  const isSpinningRef = useRef(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [pointerTick, setPointerTick] = useState(false);
  const [activeColor, setActiveColor] = useState<string>(WHEEL_COLORS[0]);

  const n = participants.length;
  const slice = n > 0 ? (Math.PI * 2) / n : 0;
  const isBig = size >= 500;

  // Pointer is at right = 0 rad (3 o'clock)
  const getSegmentAtPointer = (rotation: number): number => {
    if (n === 0) return -1;
    const angleFromZero = ((0 - rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(angleFromZero / slice) % n;
  };

  const drawWheel = useCallback((
    rotation: number,
    speed: number = 0,
    winnerIdx: number | null = null,
    tickFlash: number = 0,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - (isBig ? 22 : 16);

    ctx.clearRect(0, 0, W, H);

    if (n === 0) {
      // Empty wheel
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const emptyGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      emptyGrad.addColorStop(0, 'rgba(139,92,246,0.15)');
      emptyGrad.addColorStop(1, 'rgba(139,92,246,0.05)');
      ctx.fillStyle = emptyGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(139,92,246,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `bold ${isBig ? '18px' : '14px'} Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada peserta', cx, cy - 8);
      ctx.fillText('eligible di pool ini', cx, cy + (isBig ? 16 : 12));
      return;
    }

    const currentSeg = getSegmentAtPointer(rotation);
    const normalizedSpeed = Math.min(speed, 1);

    // ── Outer speed glow ──────────────────────────────────────────────────────
    if (normalizedSpeed > 0.01) {
      ctx.save();
      const glowAlpha = normalizedSpeed * 0.9;
      const glowColor = mode === 'tester' ? `rgba(16,185,129,${glowAlpha * 0.7})` : `rgba(37,99,235,${glowAlpha * 0.7})`;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isBig ? 28 : 20) + normalizedSpeed * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = isBig ? 4 : 3;
      ctx.stroke();
      ctx.restore();
    }

    // ── Slices ────────────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const startAngle = rotation + i * slice;
      const endAngle = startAngle + slice;
      const isActive = i === currentSeg;
      const isWinner = winnerIdx !== null && i === winnerIdx;
      const baseColor = WHEEL_COLORS[i % WHEEL_COLORS.length];

      ctx.save();

      // Winner gold glow
      if (isWinner && speed < 0.005) {
        ctx.shadowColor = '#FCD34D';
        ctx.shadowBlur = isBig ? 32 : 24;
      }

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();

      if (isWinner && speed < 0.005) {
        // Gold radial gradient for winner
        const grad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
        grad.addColorStop(0, '#FEF3C7');
        grad.addColorStop(0.35, '#FCD34D');
        grad.addColorStop(0.7, '#F59E0B');
        grad.addColorStop(1, baseColor);
        ctx.fillStyle = grad;
      } else if (isActive && normalizedSpeed < 0.08) {
        // Highlight current segment when slow
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, baseColor);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = baseColor;
      }

      // Slight darken when spinning fast
      ctx.globalAlpha = normalizedSpeed > 0.5 ? 0.82 : 1.0;
      ctx.fill();
      ctx.restore();

      // Segment border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = isBig ? 2 : 1.5;
      ctx.stroke();
      ctx.restore();

      // ── Text — only visible when slow ──────────────────────────────────────
      if (normalizedSpeed < 0.12) {
        const textOpacity = Math.max(0, 1 - normalizedSpeed * 9);
        ctx.save();
        ctx.globalAlpha = textOpacity;
        ctx.translate(cx, cy);
        ctx.rotate(startAngle + slice / 2);

        // Format nama dan nomor belakang 4 terakhir (misal: "Sayang ·9226" atau "Pasha ·9892")
        let label = participants[i].nickname || participants[i].username;
        if (participants[i].wa_phone) {
          const phDigits = participants[i].wa_phone!.replace(/\D/g, '');
          const l4 = phDigits.length >= 4 ? phDigits.slice(-4) : '';
          if (l4 && !label.includes(l4)) {
            label = `${label} ·${l4}`;
          }
        }
        const maxLen = n > 10 ? (isBig ? 20 : 15) : (isBig ? 24 : 18);
        const displayLabel = label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
        const fontSize = Math.max(isBig ? 11 : 8, Math.min(isBig ? 20 : 13, (R * 0.38) / Math.max(1, Math.sqrt(n))));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillText(displayLabel, R - (isBig ? 18 : 14), fontSize / 3);
        ctx.restore();
      }
    }

    // ── Tick flash overlay ────────────────────────────────────────────────────
    if (tickFlash > 0) {
      ctx.save();
      ctx.globalAlpha = tickFlash * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }

    // ── Center cap (Clean plain white - Wheel of Names style) ───────────────────
    const capR = isBig ? 54 : 38;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = isBig ? 16 : 12;
    ctx.beginPath();
    ctx.arc(cx, cy, capR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, capR, 0, Math.PI * 2);
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = isBig ? 4 : 3;
    ctx.stroke();
  }, [participants, n, slice, mode, isBig]);

  useEffect(() => {
    const seg = getSegmentAtPointer(rotationRef.current);
    if (seg >= 0 && seg < n) {
      setActiveColor(WHEEL_COLORS[seg % WHEEL_COLORS.length]);
    }
    drawWheel(rotationRef.current);
  }, [participants, drawWheel, n]);

  const spin = () => {
    if (isSpinningRef.current || n === 0) return;

    // ① Pre-determine winner
    const winnerIndex = Math.floor(Math.random() * n);

    // ② Calculate exact rotation so winner lands on pointer at 3 o'clock (0 radians)
    const targetAngle = 0 - (winnerIndex + 0.5) * slice;
    const normalizedTarget = ((targetAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const currentNorm = ((rotationRef.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const diff = ((normalizedTarget - currentNorm) + Math.PI * 2) % (Math.PI * 2);
    const minSpins = 7 + Math.floor(Math.random() * 4);
    const totalRotation = minSpins * Math.PI * 2 + diff;
    const startRotation = rotationRef.current;

    // ③ Duration varies with spin count
    const duration = 5500 + Math.random() * 2000;

    isSpinningRef.current = true;
    setIsSpinning(true);

    let startTime: number | null = null;
    let lastSeg = getSegmentAtPointer(rotationRef.current);
    let tickFlash = 0;

    // Quintic ease-out: very fast start, dramatic deceleration
    const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuint(rawProgress);

      rotationRef.current = startRotation + totalRotation * easedProgress;

      // Speed for visual effects (0 = stopped, 1 = max)
      const instantSpeed = 5 * Math.pow(1 - rawProgress, 4);

      // ── Tick detection & mechanical audio ─────────────────────────
      const seg = getSegmentAtPointer(rotationRef.current);
      if (seg !== lastSeg) {
        tickFlash = 1.0;
        setPointerTick(prev => !prev);
        if (seg >= 0 && seg < n) {
          setActiveColor(WHEEL_COLORS[seg % WHEEL_COLORS.length]);
        }
        wheelAudio.playTick(instantSpeed);
        lastSeg = seg;
      }
      tickFlash = Math.max(0, tickFlash - 0.18);

      drawWheel(rotationRef.current, instantSpeed, null, tickFlash);

      if (rawProgress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        // ④ Spring wobble phase
        startSpring(startRotation + totalRotation, winnerIndex);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  const startSpring = (finalRotation: number, winnerIndex: number) => {
    const springStart = performance.now();
    const springDuration = 700;
    const amplitude = 0.022; // radians of overshoot

    const animateSpring = (ts: number) => {
      const t = Math.min((ts - springStart) / springDuration, 1);
      // Damped spring: e^(-kt) * cos(ωt)
      const spring = amplitude * Math.exp(-t * 9) * Math.cos(t * 22);
      rotationRef.current = finalRotation + spring;

      const seg = getSegmentAtPointer(rotationRef.current);
      if (seg >= 0 && seg < n) {
        setActiveColor(WHEEL_COLORS[seg % WHEEL_COLORS.length]);
      }

      // Show winner glow in second half of spring
      drawWheel(rotationRef.current, 0, t > 0.4 ? winnerIndex : null, 0);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animateSpring);
      } else {
        rotationRef.current = finalRotation;
        drawWheel(finalRotation, 0, winnerIndex, 0);
        setActiveColor(WHEEL_COLORS[winnerIndex % WHEEL_COLORS.length]);
        isSpinningRef.current = false;
        setIsSpinning(false);

        // ── Trigger Wheel of Names Winner Effects ───────────────────
        wheelAudio.playWinnerFanfare();
        triggerWheelOfNamesConfetti();
        onWinner(participants[winnerIndex]);
      }
    };

    animRef.current = requestAnimationFrame(animateSpring);
  };

  useEffect(() => () => { cancelAnimationFrame(animRef.current); }, []);

  const modeColor = mode === 'tester' ? '#10B981' : '#2563EB';
  const canSpin = !isSpinning && n > 0;

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Top action controls: Sound, Fullscreen expand, and Mode badge (only in normal mode) */}
      {!isBig && (
        <div className="flex items-center justify-between w-full px-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleSound}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{
                background: soundMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                border: `1px solid ${soundMuted ? 'rgba(239, 68, 68, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`,
                color: soundMuted ? '#F87171' : '#60A5FA',
              }}
              title="Toggle Efek Suara Wheel of Names"
            >
              <span>{soundMuted ? '🔇' : '🔊'}</span>
              <span>{soundMuted ? 'Mute' : 'Suara ON'}</span>
            </button>

            {onExpand && (
              <button
                onClick={onExpand}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1.5 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  boxShadow: '0 0 14px rgba(37, 99, 235, 0.4)',
                }}
                title="Perbesar Roda Menjadi Pop-up Layar Penuh"
              >
                <span>⛶</span>
                <span>Perbesar Roda</span>
              </button>
            )}
          </div>

          <span className="text-xs text-gray-400 font-medium">
            {mode === 'tester' ? '🧪 Mode Tester' : '🎯 Mode Undian Real'}
          </span>
        </div>
      )}

      {/* Wheel with pointer on the right side - 100% centered with SPIN button */}
      <div
        className="relative flex items-center justify-center select-none"
        style={{ width: size, height: size }}
      >
        {/* Wheel of Names 3D Arrow Pointer on the right (overlapping wheel rim, stationary) */}
        <div
          className="absolute z-20 pointer-events-none select-none"
          style={{
            right: isBig ? -24 : -18,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        >
          <svg
            viewBox="0 0 46 36"
            className={isBig ? 'w-16 h-13' : 'w-12 h-10'}
            style={{
              filter: `drop-shadow(-4px 4px 8px rgba(0,0,0,0.65)) drop-shadow(0 0 10px ${activeColor}99)`,
              transition: 'filter 0.15s ease',
            }}
          >
            <defs>
              {/* Top facet highlight gradient */}
              <linearGradient id={`topFacetGrad-${isBig ? 'big' : 'norm'}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
              </linearGradient>
              {/* Bottom facet shadow gradient */}
              <linearGradient id={`bottomFacetGrad-${isBig ? 'big' : 'norm'}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
              </linearGradient>
              {/* Center ridge specular highlight */}
              <linearGradient id={`ridgeGrad-${isBig ? 'big' : 'norm'}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Main Base 3D Arrow pointing left into the wheel */}
            <polygon
              points="2,18 44,2 34,18 44,34"
              fill={activeColor}
              style={{ transition: 'fill 0.1s ease' }}
            />

            {/* Top Facet (Upper triangle) */}
            <polygon
              points="2,18 44,2 34,18"
              fill={`url(#topFacetGrad-${isBig ? 'big' : 'norm'})`}
            />

            {/* Bottom Facet (Lower triangle) */}
            <polygon
              points="2,18 34,18 44,34"
              fill={`url(#bottomFacetGrad-${isBig ? 'big' : 'norm'})`}
            />

            {/* Center Ridge Highlight Line (Tip to Notch) */}
            <line
              x1="2"
              y1="18"
              x2="34"
              y2="18"
              stroke={`url(#ridgeGrad-${isBig ? 'big' : 'norm'})`}
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* Top Outer Bevel Edge Highlight */}
            <line
              x1="2"
              y1="18"
              x2="44"
              y2="2"
              stroke="rgba(255, 255, 255, 0.75)"
              strokeWidth="1.3"
              strokeLinecap="round"
            />

            {/* Bottom Outer Shadow Edge */}
            <line
              x1="2"
              y1="18"
              x2="44"
              y2="34"
              stroke="rgba(0, 0, 0, 0.45)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />

            {/* Back Notch Border */}
            <polyline
              points="44,2 34,18 44,34"
              fill="none"
              stroke="rgba(0, 0, 0, 0.35)"
              strokeWidth="1.2"
            />
          </svg>
        </div>

        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="rounded-full cursor-pointer select-none"
          onClick={() => { if (canSpin) spin(); }}
          title="Klik roda untuk memutar!"
          style={{
            filter: isSpinning
              ? `drop-shadow(0 0 ${isBig ? '36px' : '28px'} ${modeColor}88)`
              : `drop-shadow(0 0 ${isBig ? '22px' : '16px'} ${modeColor}44)`,
            transition: 'filter 0.3s ease',
          }}
        />
      </div>

      {/* SPIN button */}
      <button
        onClick={spin}
        disabled={!canSpin}
        className={`relative ${isBig ? 'px-16 py-5 text-2xl' : 'px-12 py-4 text-xl'} rounded-2xl font-black text-white overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed select-none`}
        style={{
          background: canSpin
            ? `linear-gradient(135deg, ${modeColor}, ${mode === 'tester' ? '#059669' : '#1D4ED8'})`
            : 'linear-gradient(135deg, #374151, #1F2937)',
          boxShadow: canSpin ? `0 0 36px ${modeColor}88, 0 4px 20px rgba(0,0,0,0.4)` : 'none',
          transform: canSpin ? 'scale(1)' : 'scale(0.97)',
          letterSpacing: '0.05em',
        }}
      >
        {/* Shimmer layer */}
        {canSpin && (
          <span
            className="absolute inset-0 opacity-30"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)',
              animation: 'shimmer 2.5s infinite',
            }}
          />
        )}
        <span className="relative z-10">
          {isSpinning ? '⏳ Memutar…' : n === 0 ? 'Pool Kosong' : '🎰  S P I N !'}
        </span>
      </button>

      <p className={isBig ? 'text-base' : 'text-sm'} style={{ color: n === 0 ? '#EF4444' : '#9CA3AF' }}>
        {n === 0 ? 'Tambah peserta terlebih dahulu' : `${n} peserta dalam pool ini (Klik roda atau tombol SPIN)`}
      </p>
    </div>
  );
}

// ─── Winner Modal (Wheel of Names + Manual TikTok Input) ─────────────────────
function WinnerModal({
  winner,
  onClose,
  onRemove,
  isDuplicate = false,
}: {
  winner: Participant | null;
  onClose: () => void;
  onRemove: () => void;
  isDuplicate?: boolean;
}) {
  const [tiktokInput, setTiktokInput] = useState('');
  const [tiktokSaved, setTiktokSaved] = useState('');
  const [savingTiktok, setSavingTiktok] = useState(false);
  const [tiktokError, setTiktokError] = useState('');

  // Reset input saat winner berubah
  useEffect(() => {
    const existingTag = winner?.wa_member_tag || '';
    setTiktokInput(existingTag ? `@${existingTag}` : '');
    setTiktokSaved(existingTag || '');
    setTiktokError('');
  }, [winner?.username]);

  if (!winner) return null;

  const isTest = !!winner.is_tester;
  const isWaParticipant = (winner.username || '').startsWith('wa_');
  const displayName = winner.nickname || winner.username || 'Pemenang';
  const resolvedTiktok = tiktokSaved || (winner.wa_member_tag || '');
  const cleanTiktok = resolvedTiktok.replace(/^@/, '');
  const tiktokUrl = cleanTiktok ? `https://www.tiktok.com/@${cleanTiktok}` : '';

  const handleSaveTiktok = async () => {
    const clean = tiktokInput.replace(/^@/, '').trim().toLowerCase();
    if (!clean) { setTiktokError('Masukkan username TikTok terlebih dahulu'); return; }
    setSavingTiktok(true);
    setTiktokError('');
    try {
      const res = await fetch('/api/giveaway/winner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: winner.username, tiktokUsername: clean }),
      });
      const data = await res.json();
      if (data.success) {
        setTiktokSaved(clean);
        setTiktokInput(`@${clean}`);
      } else {
        setTiktokError(data.error || 'Gagal menyimpan');
      }
    } catch {
      setTiktokError('Error menyimpan username TikTok');
    } finally {
      setSavingTiktok(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        animation: 'backdropFade 0.25s ease',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl shadow-2xl transition-all"
        style={{
          background: '#212529',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 50px rgba(37, 99, 235, 0.35)',
          animation: 'winnerPop 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="bg-[#2563EB] px-6 py-3.5 flex items-center justify-between">
          <span className="text-white font-bold text-lg md:text-xl tracking-tight">
            🎉 Kita punya pemenang!
          </span>
          <div className="flex items-center gap-2">
            {isDuplicate && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/30 text-amber-200 border border-amber-400/50">
                ⚠️ USERNAME DOUBLE
              </span>
            )}
            {isTest && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                🧪 TESTER
              </span>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-7 md:p-10 flex flex-col items-center text-center">
          {/* Winner Name - Huge */}
          <div
            className="text-4xl md:text-6xl font-light text-white mb-2 tracking-wide break-words max-w-full select-all"
            style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
          >
            {displayName}
          </div>

          {/* Phone hint */}
          {winner.wa_phone && (
            <div className="text-gray-400 text-sm mb-5">
              📱 {winner.wa_phone}
            </div>
          )}

          {/* --- TikTok Input Section --- */}
          {isWaParticipant && !tiktokSaved ? (
            // Belum ada TikTok username → tampilkan form input
            <div className="w-full mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-amber-300 text-sm font-semibold mb-3 flex items-center gap-2 justify-center">
                <span>🏷️</span>
                <span>Minta pemenang sebutkan Username TikTok-nya:</span>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tiktokInput}
                  onChange={e => setTiktokInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveTiktok()}
                  placeholder="@username_tiktok"
                  autoFocus
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-black/40 border border-white/20 text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/40"
                  style={{ fontFamily: 'monospace' }}
                />
                <button
                  onClick={handleSaveTiktok}
                  disabled={savingTiktok}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-400 transition-all disabled:opacity-60 whitespace-nowrap"
                >
                  {savingTiktok ? '...' : '✓ Simpan'}
                </button>
              </div>
              {tiktokError && (
                <p className="text-red-400 text-xs mt-2">{tiktokError}</p>
              )}
            </div>
          ) : tiktokSaved || resolvedTiktok ? (
            // Sudah ada TikTok username → tampilkan link verifikasi
            <div className="w-full mb-6 flex flex-col items-center gap-3">
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg text-cyan-300 hover:text-cyan-200 font-semibold transition-colors inline-flex items-center gap-1.5 group"
              >
                <span className="group-hover:underline">@{cleanTiktok}</span>
                <span className="text-sm">↗</span>
              </a>
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #FF0050 0%, #00F2FE 100%)',
                  boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)',
                }}
              >
                <span>🔍 Verifikasi Profil TikTok (@{cleanTiktok})</span>
                <span className="text-base">↗</span>
              </a>
              {/* Option to edit */}
              <button
                onClick={() => { setTiktokSaved(''); setTiktokInput(`@${cleanTiktok}`); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1"
              >
                ✏️ Ubah username TikTok
              </button>
            </div>
          ) : (
            // Participant biasa tanpa wa_ prefix → tampilkan TikTok link langsung
            <div className="flex flex-col items-center gap-3 mb-6">
              <a
                href={`https://www.tiktok.com/@${winner.username.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg text-cyan-300 hover:text-cyan-200 font-semibold transition-colors inline-flex items-center gap-1.5 group"
              >
                <span className="group-hover:underline">@{winner.username.replace(/^@/, '')}</span>
                <span className="text-sm">↗</span>
              </a>
              <a
                href={`https://www.tiktok.com/@${winner.username.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #FF0050 0%, #00F2FE 100%)',
                  boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)',
                }}
              >
                <span>🔍 Verifikasi Profil TikTok</span>
                <span className="text-base">↗</span>
              </a>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 w-full pt-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Tutup
            </button>
            <button
              onClick={onRemove}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] transition-all shadow-md hover:shadow-blue-500/40 active:scale-95"
            >
              Hapus dari Pool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Participant Row ───────────────────────────────────────────────────────
const BadgeCheck = ({ ok }: { ok: boolean }) => (
  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
    style={{
      background: ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.12)',
      color: ok ? '#22C55E' : '#EF4444',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.25)'}`,
    }}>
    {ok ? '✓' : '✗'}
  </span>
);

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function GiveawayPage() {
  const [realParticipants, setRealParticipants]       = useState<Participant[]>([]);
  const [eligibleReal, setEligibleReal]               = useState<Participant[]>([]);
  const [testerParticipants, setTesterParticipants]   = useState<Participant[]>([]);
  const [eligibleTesters, setEligibleTesters]         = useState<Participant[]>([]);
  const [duplicates, setDuplicates]                   = useState<{ member_tag: string; count: number; members: any[] }[]>([]);
  const [stats, setStats]                             = useState<Stats>({
    real:   { total: 0, eligible: 0, hasFollowed: 0, hasShared: 0, hasCommented: 0 },
    tester: { total: 0, eligible: 0 },
  });

  const [winner, setWinner]                   = useState<Participant | null>(null);
  const [realWinHistory, setRealWinHistory]   = useState<Participant[]>([]);
  const [testerWinHistory, setTesterWinHistory] = useState<Participant[]>([]);
  const [wheelMode, setWheelMode]             = useState<'real' | 'tester'>('real');
  const [activeTab, setActiveTab]   = useState<'wheel' | 'peserta' | 'tester' | 'whatsapp'>('wheel');
  const [soundMuted, setSoundMuted]           = useState(false);
  const [isBigModalOpen, setIsBigModalOpen]   = useState(false);

  const [testerName, setTesterName]       = useState('');
  const [testerNick, setTesterNick]       = useState('');
  const [testerLoading, setTesterLoading] = useState(false);

  const [searchReal, setSearchReal]       = useState('');
  const [searchTester, setSearchTester]   = useState('');

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [videoUrl, setVideoUrl]           = useState('');
  const [savingUrl, setSavingUrl]         = useState(false);
  const [currentTime, setCurrentTime]     = useState<Date>(new Date());

  // WhatsApp Integration States
  const [waStatus, setWaStatus]           = useState<'DISCONNECTED' | 'CONNECTING' | 'SCAN_QR' | 'CONNECTED'>('DISCONNECTED');
  const [waQrCode, setWaQrCode]           = useState<string | null>(null);
  const [waPhone, setWaPhone]             = useState<string | null>(null);
  const [waUserName, setWaUserName]       = useState<string | null>(null);
  const [waGroups, setWaGroups]           = useState<{ id: string; subject: string; size: number }[]>([]);
  const [targetWaGroup, setTargetWaGroup] = useState<string>('');
  const [isWaMandatory, setIsWaMandatory] = useState<boolean>(false);
  const [waSyncing, setWaSyncing]         = useState<boolean>(false);
  const [waActionLoading, setWaActionLoading] = useState<boolean>(false);
  const [manualWaTag, setManualWaTag]     = useState<string>('');
  const [manualWaNick, setManualWaNick]   = useState<string>('');
  const [manualWaPhone, setManualWaPhone] = useState<string>('');
  const [manualWaLoading, setManualWaLoading] = useState<boolean>(false);
  const [waAllMembers, setWaAllMembers]   = useState<WaMember[]>([]);
  const [searchWaMembers, setSearchWaMembers] = useState<string>('');

  // WhatsApp Chat Import States
  const [importChatText, setImportChatText]         = useState<string>('');
  const [importFileName, setImportFileName]         = useState<string>('');
  const [importLoading, setImportLoading]           = useState<boolean>(false);
  const [importResult, setImportResult]             = useState<any | null>(null);
  const [showImportPasteArea, setShowImportPasteArea] = useState<boolean>(false);

  // Quick Member Tag Import States (Nama & Tag seperti di Screenshot Info Grup WA)
  const [showMemberTagModal, setShowMemberTagModal] = useState<boolean>(false);
  const [memberTagImportText, setMemberTagImportText] = useState<string>('');
  const [memberTagImportLoading, setMemberTagImportLoading] = useState<boolean>(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      if (data.success) {
        setWaStatus(data.status);
        setWaQrCode(data.qrCodeUrl);
        setWaPhone(data.phoneNumber);
        setWaUserName(data.userName);
      }
    } catch (e) {
      console.error('[WA Status Fetch]', e);
    }
  }, []);

  const fetchWaSettingsAndGroups = useCallback(async (refresh = false) => {
    try {
      const [settingsRes, groupsRes] = await Promise.all([
        fetch('/api/whatsapp/settings'),
        fetch(`/api/whatsapp/groups${refresh ? '?refresh=1' : ''}`),
      ]);
      const [sData, gData] = await Promise.all([settingsRes.json(), groupsRes.json()]);
      if (sData.success) {
        setIsWaMandatory(!!sData.isMandatory);
      }
      if (gData.success) {
        setWaGroups(gData.groups || []);
        const chosen = gData.targetGroup || (gData.groups && gData.groups[0] ? gData.groups[0].id : '');
        setTargetWaGroup(chosen);
      }
    } catch (e) {
      console.error('[WA Groups/Settings Fetch]', e);
    }
  }, []);

  const handleConnectWa = async () => {
    setWaActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Memulai koneksi WhatsApp, silakan tunggu...');
        fetchWaStatus();
        fetchWaSettingsAndGroups(true);
      } else {
        showToast(data.error || 'Gagal memulai koneksi WhatsApp', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Gagal terhubung ke server WhatsApp', 'error');
    } finally {
      setWaActionLoading(false);
    }
  };

  const handleDisconnectWa = async () => {
    if (!confirm('Putuskan koneksi WhatsApp? Anda harus scan QR lagi nanti.')) return;
    setWaActionLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Koneksi WhatsApp diputus');
        fetchWaStatus();
      }
    } catch {
      showToast('Gagal memutus koneksi', 'error');
    } finally {
      setWaActionLoading(false);
    }
  };

  const handleSelectWaGroup = async (groupJid: string) => {
    setTargetWaGroup(groupJid);
    const selectedGroupObj = waGroups.find(g => g.id === groupJid);
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupJid, subject: selectedGroupObj?.subject }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Target grup WhatsApp disimpan!');
        handleSyncWaMembers(groupJid);
      }
    } catch {
      showToast('Gagal menyimpan grup target', 'error');
    }
  };

  const handleToggleWaMandatory = async () => {
    const nextVal = !isWaMandatory;
    setIsWaMandatory(nextVal);
    try {
      const res = await fetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMandatory: nextVal, resync: true }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(nextVal ? 'Syarat WA diaktifkan (Wajib)' : 'Syarat WA dinonaktifkan (Opsional)');
        fetchAll();
      }
    } catch {
      showToast('Gagal mengubah pengaturan', 'error');
    }
  };

  const handleSyncWaMembers = async (groupJidOverride?: string) => {
    const target = groupJidOverride || targetWaGroup;
    if (!target) {
      showToast('Pilih grup WhatsApp target terlebih dahulu', 'error');
      return;
    }
    setWaSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 detik max client timeout

    try {
      const res = await fetch('/api/whatsapp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupJid: target }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.success) {
        if (data.duplicates) setDuplicates(data.duplicates);
        const dupWarning = (data.duplicates && data.duplicates.length > 0)
          ? ` • ⚠️ ${data.duplicates.length} Username Double!`
          : '';
        const eligibleTxt = data.eligibleCount !== undefined ? ` • ${data.eligibleCount} Peserta Masuk Undian` : '';
        const absenTxt = data.absenCount !== undefined ? ` (${data.absenCount} Absen terdeteksi)` : '';
        showToast(`✅ Sinkronisasi sukses! ${data.count} anggota grup diperiksa${absenTxt}${eligibleTxt}${dupWarning}.`);
        fetchAll();
      } else {
        showToast(data.error || 'Gagal sinkronisasi anggota', 'error');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        showToast('Sinkronisasi selesai menggunakan data tersimpan', 'success');
        fetchAll();
      } else {
        showToast('Error sinkronisasi anggota grup', 'error');
      }
    } finally {
      setWaSyncing(false);
    }
  };

  const handleManualWaRegister = async () => {
    if (!manualWaTag.trim()) {
      showToast('Masukkan Username TikTok / Member Tag', 'error');
      return;
    }
    setManualWaLoading(true);
    try {
      const res = await fetch('/api/whatsapp/absen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: manualWaTag.trim(),
          nickname: manualWaNick.trim() || undefined,
          phone: manualWaPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Peserta WhatsApp berhasil ditambahkan!');
        setManualWaTag('');
        setManualWaNick('');
        setManualWaPhone('');
        fetchAll();
      } else {
        showToast(data.error || 'Gagal mendaftarkan peserta', 'error');
      }
    } catch {
      showToast('Error mendaftarkan peserta', 'error');
    } finally {
      setManualWaLoading(false);
    }
  };

  const handleImportChat = async () => {
    if (!importChatText.trim()) {
      showToast('Pilih file .txt atau tempel riwayat chat terlebih dahulu', 'error');
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/whatsapp/import-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatText: importChatText,
          targetGroup: targetWaGroup || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data);
        showToast(`✅ ${data.message}`);
        fetchAll();
      } else {
        showToast(data.error || 'Gagal memproses import chat', 'error');
      }
    } catch (e: any) {
      showToast('Error memproses import chat: ' + (e?.message || e), 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportChatText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImportMemberTags = async () => {
    if (!memberTagImportText.trim()) {
      showToast('Tempel daftar nama & member tag terlebih dahulu', 'error');
      return;
    }
    setMemberTagImportLoading(true);
    try {
      const res = await fetch('/api/whatsapp/import-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: memberTagImportText,
          targetGroup: targetWaGroup || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message}`);
        setShowMemberTagModal(false);
        setMemberTagImportText('');
        if (data.members) {
          setWaAllMembers(data.members);
        }
        fetchAll();
      } else {
        showToast(data.error || 'Gagal mengimpor daftar member tag', 'error');
      }
    } catch (e: any) {
      showToast('Error mengimpor member tag: ' + (e?.message || e), 'error');
    } finally {
      setMemberTagImportLoading(false);
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/giveaway/config');
      const data = await res.json();
      if (data.success && data.videoUrl !== undefined) {
        setVideoUrl(data.videoUrl);
      }
    } catch (e) { console.error(e); }
  }, []);

  const saveVideoUrl = async () => {
    setSavingUrl(true);
    try {
      const res = await fetch('/api/giveaway/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('URL Video berhasil disimpan!');
      } else {
        showToast('Gagal menyimpan URL Video', 'error');
      }
    } catch {
      showToast('Error menyimpan URL', 'error');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleToggleRequirement = async (username: string, field: 'has_followed' | 'has_shared' | 'has_commented' | 'has_wa_group', currentValue: number) => {
    try {
      const res = await fetch('/api/giveaway/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, field, value: currentValue ? 0 : 1 }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAll();
      } else {
        showToast('Gagal mengupdate status', 'error');
      }
    } catch {
      showToast('Error toggle status', 'error');
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [resReal, resEReal, resTester, resETester, resWaMembers] = await Promise.all([
        fetch('/api/giveaway/participants?mode=real&filter=all'),
        fetch('/api/giveaway/participants?mode=real&filter=eligible'),
        fetch('/api/giveaway/participants?mode=tester&filter=all'),
        fetch('/api/giveaway/participants?mode=tester&filter=eligible'),
        fetch('/api/whatsapp/sync'),
      ]);
      const [dReal, dEReal, dTester, dETester, dWaMembers] = await Promise.all([
        resReal.json(), resEReal.json(), resTester.json(), resETester.json(), resWaMembers.json(),
      ]);
      if (dReal.success) {
        setRealParticipants(dReal.participants);
        setStats(dReal.stats);
        if (dReal.duplicates) setDuplicates(dReal.duplicates);
      }
      if (dEReal.success) setEligibleReal(dEReal.participants);
      if (dTester.success) setTesterParticipants(dTester.participants);
      if (dETester.success) setEligibleTesters(dETester.participants);
      if (dWaMembers.success && Array.isArray(dWaMembers.members)) {
        setWaAllMembers(dWaMembers.members);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchConfig();
    fetchWaStatus();
    fetchWaSettingsAndGroups();
    // Auto-sync peserta dimatikan. Hanya WA status yang refresh otomatis (6 detik).
    const waId = setInterval(fetchWaStatus, 6000);
    const clockId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(waId);
      clearInterval(clockId);
    };
  }, [fetchAll, fetchConfig, fetchWaStatus, fetchWaSettingsAndGroups]);

  const handleWinner = (p: Participant) => {
    setWinner(p);
    if (wheelMode === 'tester') {
      setTesterWinHistory(prev => [p, ...prev]);
    } else {
      setRealWinHistory(prev => [p, ...prev]);
    }
  };

  const handleRemoveWinner = async () => {
    if (!winner) return;
    try {
      await fetch('/api/giveaway/winner', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: winner.username }),
      });
      showToast(`${winner.nickname} dihapus dari pool`);
      setWinner(null);
      fetchAll();
    } catch { showToast('Gagal menghapus peserta', 'error'); }
  };

  const handleAddTester = async () => {
    if (!testerName.trim() || !testerNick.trim()) {
      showToast('Username dan nickname wajib diisi', 'error'); return;
    }
    setTesterLoading(true);
    try {
      const res = await fetch('/api/giveaway/tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testerName, nickname: testerNick }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Tester "${data.participant.nickname}" ditambahkan!`);
        setTesterName(''); setTesterNick('');
        fetchAll();
      } else { showToast(data.error || 'Gagal', 'error'); }
    } catch { showToast('Error', 'error'); }
    finally { setTesterLoading(false); }
  };

  const handleQuickAdd = async () => {
    const testers = [
      { u: 'user_alpha', n: 'Alpha Tester' }, { u: 'user_beta', n: 'Beta Tester' },
      { u: 'user_gamma', n: 'Gamma Tester' }, { u: 'user_delta', n: 'Delta Tester' },
      { u: 'user_epsilon', n: 'Epsilon Tester' },
    ];
    for (const t of testers) {
      await fetch('/api/giveaway/tester', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: t.u, nickname: t.n }),
      });
    }
    showToast('5 tester berhasil ditambahkan!');
    fetchAll();
  };

  const handleSingleDelete = async (username: string, nickname: string) => {
    if (!confirm(`Hapus peserta "${nickname}" (@${username}) dari data real?`)) return;
    try {
      await fetch('/api/giveaway/winner', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      showToast(`Peserta "${nickname}" dihapus`);
      fetchAll();
    } catch {
      showToast('Gagal menghapus peserta', 'error');
    }
  };

  const handleResetTesters = async () => {
    if (!confirm('Reset semua data tester? Ini tidak bisa dibatalkan!')) return;
    await fetch('/api/giveaway/participants?mode=tester', { method: 'DELETE' });
    showToast('Data tester direset');
    fetchAll();
  };

  const handleResetReal = async () => {
    if (!confirm('Reset semua data peserta real? Ini tidak bisa dibatalkan!')) return;
    await fetch('/api/giveaway/participants?mode=real', { method: 'DELETE' });
    showToast('Data peserta real direset');
    fetchAll();
  };

  const periodStart = new Date('2026-09-06T00:00:00+07:00');
  const periodEnd   = new Date('2026-09-08T23:59:59+07:00');
  const msLeft      = periodEnd.getTime() - currentTime.getTime();
  const inPeriod    = currentTime >= periodStart && msLeft > 0;

  const formatTimeLeft = (ms: number) => {
    if (ms <= 0) return '0 dtk';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours} jam ${minutes} mnt ${seconds} dtk`;
    }
    if (minutes > 0) {
      return `${minutes} mnt ${seconds} dtk`;
    }
    return `${seconds} dtk`;
  };

  const filteredReal = (realParticipants || []).filter(p => {
    if (!p) return false;
    const q = (searchReal || '').toLowerCase();
    const nick = (p.nickname || '').toLowerCase();
    const user = (p.username || '').toLowerCase();
    return nick.includes(q) || user.includes(q);
  });
  const filteredTesters = (testerParticipants || []).filter(p => {
    if (!p) return false;
    const q = (searchTester || '').toLowerCase();
    const nick = (p.nickname || '').toLowerCase();
    const user = (p.username || '').toLowerCase();
    return nick.includes(q) || user.includes(q);
  });

  const wheelPool = wheelMode === 'tester' ? eligibleTesters : eligibleReal;

  const COLORS = WHEEL_COLORS;

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(135deg, #0a0a18 0%, #0f1629 50%, #0a0a22 100%)', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes winnerPop {
          from { opacity: 0; transform: scale(0.7) translateY(30px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes confettiFloat {
          from { transform: translateY(0) rotate(0deg); opacity: 0.6; }
          to   { transform: translateY(-14px) rotate(12deg); opacity: 1; }
        }
        @keyframes shimmer {
          from { background-position: -200% center; }
          to   { background-position: 200% center; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastSlide {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .tab-active {
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.18)) !important;
          border-color: rgba(139,92,246,0.45) !important;
          color: white !important;
        }
        .tab-tester-active {
          background: linear-gradient(135deg, rgba(16,185,129,0.22), rgba(5,150,105,0.16)) !important;
          border-color: rgba(16,185,129,0.45) !important;
          color: white !important;
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'linear-gradient(135deg,#059669,#047857)' : 'linear-gradient(135deg,#DC2626,#B91C1C)',
            animation: 'toastSlide 0.3s ease',
          }}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      <WinnerModal
        winner={winner}
        onClose={() => setWinner(null)}
        onRemove={handleRemoveWinner}
        isDuplicate={Boolean(
          winner &&
          duplicates &&
          duplicates.some(d => {
            const dTag = (d?.member_tag || '').replace(/^@/, '').trim().toLowerCase();
            const wUser = (winner.username || '').replace(/^@/, '').trim().toLowerCase();
            return dTag === wUser;
          })
        )}
      />

      {/* ── Big Wheel Modal (Pop-up Layar Penuh Fokus Roda Saja) ── */}
      {isBigModalOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-hidden"
          style={{
            background: 'rgba(5, 7, 18, 0.92)',
            backdropFilter: 'blur(16px)',
            animation: 'backdropFade 0.25s ease',
          }}
          onClick={() => setIsBigModalOpen(false)}
        >
          {/* Tombol Close di Pojok Kanan Atas */}
          <button
            onClick={() => setIsBigModalOpen(false)}
            className="fixed top-5 right-5 z-50 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-2xl transition-all hover:scale-110 flex items-center justify-center text-xl font-bold backdrop-blur-md cursor-pointer select-none"
            title="Tutup Mode Layar Penuh (✕)"
          >
            ✕
          </button>

          {/* Roda Bersih di Tengah Layar */}
          <div
            className="flex flex-col items-center justify-center my-auto select-none"
            onClick={e => e.stopPropagation()}
          >
            <SpinWheel
              key={`big-modal-${wheelMode}`}
              participants={wheelPool}
              onWinner={handleWinner}
              mode={wheelMode}
              soundMuted={soundMuted}
              onToggleSound={() => {
                setSoundMuted(prev => {
                  const next = !prev;
                  wheelAudio.setMuted(next);
                  return next;
                });
              }}
              size={540}
            />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="text-center mb-8" style={{ animation: 'fadeUp 0.5s ease' }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3 text-sm font-medium"
            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)' }}>
            <span className={`w-2 h-2 rounded-full ${inPeriod ? 'bg-green-400' : 'bg-red-400'}`}
              style={{ boxShadow: inPeriod ? '0 0 7px #4ade80' : '0 0 7px #f87171', animation: inPeriod ? 'pulse 1.5s infinite' : 'none' }} />
            {inPeriod ? `🔴 LIVE  •  Sisa ${formatTimeLeft(msLeft)} (s/d 8 Sept, 23:59 WIB)` : currentTime < periodStart ? '⏳ Belum dimulai (Mulai 6 Sept)' : '⛔ Periode berakhir (8 Sept, 23:59 WIB)'}
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-2"
            style={{ background: 'linear-gradient(135deg, #C4B5FD 0%, #F9A8D4 50%, #FCD34D 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🎁 Giveaway @onlyvirtus
          </h1>
          <p className="text-gray-400">6 – 8 September 2026 (s/d 23:59 WIB)  •  Undian Spin Wheel</p>
        </div>

        {/* ── Requirements Section (Khusus Absen WA & Member Tag) ── */}
        <div className="rounded-2xl p-4 mb-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <span className="text-3xl">🟢</span>
              <div>
                <p className="font-bold text-sm text-emerald-400">1. Ketik &quot;ABSEN&quot; di Grup WhatsApp</p>
                <p className="text-xs text-gray-300">
                  Kirim chat <code>ABSEN</code> di grup WhatsApp resmi antara <strong>6 – 8 September 2026</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <span className="text-3xl">🏷️</span>
              <div>
                <p className="font-bold text-sm text-blue-400">2. Member Tag WA = Username TikTok</p>
                <p className="text-xs text-gray-300">
                  Ganti Member Tag di grup WA sesuai Username TikTok Anda. Saat menang undian, username TikTok langsung diklik &amp; dicek!
                </p>
              </div>
            </div>
          </div>

          {/* WhatsApp Status Banner & Fast Sync */}
          <div className="pt-3 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400">🟢 WhatsApp Bot:</span>
              <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[11px] ${
                waStatus === 'CONNECTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : waStatus === 'SCAN_QR'
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 animate-pulse'
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}>
                {waStatus === 'CONNECTED' ? `Online (${waPhone || 'Bot Terhubung'})` : waStatus === 'SCAN_QR' ? 'Scan QR Diperlukan' : 'Terputus'}
              </span>
              {targetWaGroup && (
                <span className="text-gray-400">
                  • Target: <strong className="text-white">{waGroups.find(g => g.id === targetWaGroup)?.subject || targetWaGroup?.split?.('@')?.[0] || targetWaGroup}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('whatsapp')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/10 hover:bg-white/15 transition-all flex items-center gap-1.5"
              >
                <span>⚙️</span>
                <span>Pengaturan WA & QR</span>
              </button>
              {waStatus === 'CONNECTED' && targetWaGroup && (
                <button
                  onClick={() => handleSyncWaMembers()}
                  disabled={waSyncing}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{waSyncing ? '⏳' : '🔄'}</span>
                  <span>{waSyncing ? 'Sinkronisasi…' : 'Sync Member Tag'}</span>
                </button>
              )}
            </div>
          </div>

          {/* TikTok Video URL setting */}
          <div className="pt-3 border-t border-white/10 flex flex-col md:flex-row items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 whitespace-nowrap">
              <span>🔗 URL Video Giveaway TikTok:</span>
            </div>
            <input
              type="text"
              placeholder="https://www.tiktok.com/@onlyvirtus/video/..."
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              className="flex-1 w-full px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={saveVideoUrl}
              disabled={savingUrl}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {savingUrl ? '⏳ Simpan…' : '💾 Simpan Link Video'}
            </button>
          </div>
        </div>

        {/* ── Stats — Real & Tester side by side ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Real stats */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" style={{ boxShadow: '0 0 6px #a78bfa' }} />
              <span className="text-sm font-semibold text-purple-300 uppercase tracking-wide">Peserta Real</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Peserta', v: stats.real.total, color: '#A78BFA' },
                { label: 'Member Tag WA', v: stats.real.hasWaGroup || 0, color: '#10B981' },
                { label: 'Masuk Undian', v: stats.real.eligible, color: '#34D399' },
              ].map((s, i) => (
                <div key={i} className="text-center rounded-xl py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.v}</div>
                  <div className="text-xs text-gray-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tester stats */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #34d399' }} />
              <span className="text-sm font-semibold text-emerald-300 uppercase tracking-wide">Data Tester</span>
              <span className="ml-auto text-xs text-gray-500 italic">Terpisah dari data real</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Total Tester', v: stats.tester.total, color: '#6EE7B7' },
                { label: 'Eligible', v: stats.tester.eligible, color: '#34D399' },
              ].map((s, i) => (
                <div key={i} className="text-center rounded-xl py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.v}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">Data tester tidak bercampur dengan peserta real</p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-6 p-1 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {([
            { id: 'wheel', label: '🎰 Spin Wheel' },
            { id: 'peserta', label: '📋 Peserta Real' },
            { id: 'tester', label: '🧪 Tester' },
            { id: 'whatsapp', label: '🟢 WhatsApp Bot' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 border ${
                activeTab === tab.id
                  ? (tab.id === 'tester' ? 'tab-tester-active' : tab.id === 'whatsapp' ? 'tab-tester-active' : 'tab-active')
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════ SPIN WHEEL TAB ══════════════ */}
        {activeTab === 'wheel' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl p-6 flex flex-col items-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

              {/* Mode toggle */}
              <div className="flex w-full mb-6 p-1 rounded-xl gap-1"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={() => setWheelMode('real')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200"
                  style={wheelMode === 'real'
                    ? { background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }
                    : { color: '#6B7280' }}>
                  🎯 Real  <span className="ml-1 opacity-70">({eligibleReal.length})</span>
                </button>
                <button onClick={() => setWheelMode('tester')}
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200"
                  style={wheelMode === 'tester'
                    ? { background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', boxShadow: '0 0 16px rgba(5,150,105,0.5)' }
                    : { color: '#6B7280' }}>
                  🧪 Tester  <span className="ml-1 opacity-70">({eligibleTesters.length})</span>
                </button>
              </div>

              {wheelMode === 'tester' && (
                <div className="w-full mb-4 px-3 py-2 rounded-xl text-xs text-center font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', color: '#6EE7B7' }}>
                  🧪 Mode Tester — hasil undian tidak mempengaruhi data real
                </div>
              )}

              <SpinWheel
                key={wheelMode}
                participants={wheelPool}
                onWinner={handleWinner}
                mode={wheelMode}
                soundMuted={soundMuted}
                onToggleSound={() => {
                  setSoundMuted(prev => {
                    const next = !prev;
                    wheelAudio.setMuted(next);
                    return next;
                  });
                }}
                onExpand={() => setIsBigModalOpen(true)}
              />
            </div>

            {/* Win History */}
            <div className="rounded-3xl p-6"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-yellow-300">🏆 Riwayat Pemenang</h2>
                <div className="ml-auto flex items-center gap-2">
                  {(wheelMode === 'tester' ? testerWinHistory : realWinHistory).length > 0 && (
                    <button
                      onClick={() => {
                        if (wheelMode === 'tester') {
                          setTesterWinHistory([]);
                          showToast('Riwayat tester dibersihkan');
                        } else {
                          setRealWinHistory([]);
                          showToast('Riwayat pemenang real dibersihkan');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all flex items-center gap-1"
                      title="Bersihkan riwayat pemenang (tanpa menghapus data peserta)"
                    >
                      <span>🗑️</span>
                      <span>Hapus Riwayat</span>
                    </button>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full font-semibold"
                    style={wheelMode === 'tester'
                      ? { background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }
                      : { background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }}>
                    {wheelMode === 'tester' ? '🧪 Tester' : '🎯 Real'}
                  </span>
                </div>
              </div>
              {(wheelMode === 'tester' ? testerWinHistory : realWinHistory).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-gray-600">
                  <span className="text-5xl mb-3">🎲</span>
                  <p className="font-medium">Belum ada pemenang</p>
                  <p className="text-sm mt-1">Putar roda untuk mulai!</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {(wheelMode === 'tester' ? testerWinHistory : realWinHistory).map((w, i) => (
                    <div key={i}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{
                        background: i === 0 ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
                        border: i === 0 ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.05)',
                        animation: 'fadeUp 0.35s ease',
                      }}>
                      <span className="text-base font-black w-7 text-center"
                        style={{ color: i === 0 ? '#FCD34D' : '#374151' }}>#{i + 1}</span>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>
                        {(w.nickname || w.username || "?")[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{w.nickname}</p>
                        <p className="text-xs text-gray-500 truncate">@{w.username}</p>
                      </div>
                      {w.is_tester ? (
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'rgba(16,185,129,0.2)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}>
                          TEST
                        </span>
                      ) : i === 0 ? (
                        <span className="text-yellow-400 text-xl flex-shrink-0">👑</span>
                      ) : null}
                      <button
                        onClick={() => {
                          if (wheelMode === 'tester') {
                            setTesterWinHistory(prev => prev.filter((_, idx) => idx !== i));
                          } else {
                            setRealWinHistory(prev => prev.filter((_, idx) => idx !== i));
                          }
                        }}
                        className="text-gray-500 hover:text-red-400 p-1 text-xs transition-colors rounded"
                        title="Hapus dari riwayat ini"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ PESERTA REAL TAB ══════════════ */}
        {activeTab === 'peserta' && (
          <div className="rounded-3xl p-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #10b981' }} />
              <h2 className="text-lg font-bold text-emerald-300">Daftar Peserta Giveaway (WhatsApp Absen)</h2>
            </div>

            {/* DUPLICATE WARNING BANNER */}
            {duplicates.length > 0 && (
              <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <div className="flex items-center gap-2 font-bold text-sm mb-2">
                  <span className="text-xl">⚠️</span>
                  <span>PERINGATAN: Terdeteksi {duplicates.length} Username TikTok yang Double di Grup WA!</span>
                </div>
                <div className="space-y-1.5 pl-6 text-xs text-amber-200/90">
                  {duplicates.map((dup, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono bg-amber-500/20 px-2 py-0.5 rounded font-bold">
                        @{dup.member_tag}
                      </span>
                      <span>digunakan oleh <strong>{dup.count} nomor</strong>:</span>
                      <span className="text-gray-300">
                        {dup.members.map(m => `${m.push_name || 'Member'} (+${m.phone})`).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <input type="text" placeholder="🔍 Cari username / nama peserta…" value={searchReal}
                onChange={e => setSearchReal(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <button onClick={handleResetReal}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white hover:opacity-80 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#7F1D1D,#991B1B)', border: '1px solid rgba(239,68,68,0.3)' }}>
                🗑️ Reset Peserta Real
              </button>
            </div>

            {filteredReal.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <span className="text-5xl">📭</span>
                <p className="mt-3 font-medium">Belum ada peserta real</p>
                <p className="text-sm mt-1">Peserta masuk otomatis saat pasang Member Tag dan ketik ABSEN di grup WhatsApp</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide">
                      <th className="text-left py-3 px-3 text-gray-400">Peserta (TikTok Profile)</th>
                      <th className="text-left py-3 px-3 text-emerald-400">🟢 Member Tag WA</th>
                      <th className="text-left py-3 px-3 text-gray-400">Kontak WA</th>
                      <th className="text-center py-3 px-2 text-yellow-400">Status Undian</th>
                      <th className="text-right py-3 px-3 text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReal.map((p, i) => {
                      const cleanUser = (p?.username || '').replace(/^@/, '');
                      const isDup = Boolean(
                        duplicates &&
                        duplicates.some(d => {
                          const dTag = (d?.member_tag || '').replace(/^@/, '').trim().toLowerCase();
                          const pUser = cleanUser.trim().toLowerCase();
                          return dTag === pUser;
                        })
                      );
                      return (
                        <tr key={p.username || i} className={`border-b border-white/5 transition-colors ${isDup ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-white/5'}`}
                          style={{ animation: `fadeUp ${0.1 + i * 0.025}s ease` }}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>
                                {((p?.nickname || p?.username || "?")[0] || "?").toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <a
                                  href={`https://www.tiktok.com/@${cleanUser}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium truncate max-w-[160px] text-white hover:text-cyan-300 hover:underline flex items-center gap-1 group"
                                  title={`Buka profil TikTok @${cleanUser}`}
                                >
                                  <span>{p?.nickname || cleanUser}</span>
                                  <span className="text-[10px] text-gray-400 group-hover:text-cyan-300">↗</span>
                                </a>
                                <a
                                  href={`https://www.tiktok.com/@${cleanUser}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 text-xs truncate hover:text-cyan-400 block"
                                >
                                  @{cleanUser}
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleRequirement(p.username, 'has_wa_group', p.has_wa_group || 0)}
                                title={p.has_wa_group ? 'Absen terverifikasi (Klik untuk toggle manual)' : 'Belum absen (Klik untuk aktifkan)'}
                                className="cursor-pointer hover:scale-110 transition-transform"
                              >
                                <BadgeCheck ok={!!p.has_wa_group} />
                              </button>
                              <span className="font-mono text-xs font-semibold text-emerald-300">
                                {p.wa_member_tag ? `@${(p.wa_member_tag || '').replace(/^@/, '')}` : `@${cleanUser}`}
                              </span>
                              {isDup && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                  ⚠️ DOUBLE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs text-gray-300">
                            <div>{p.wa_phone ? (p.wa_phone.startsWith('+') ? p.wa_phone : `+${p.wa_phone}`) : '-'}</div>
                            <div className="text-[11px] text-gray-500">{p.nickname}</div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{
                                background: p.is_eligible ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.12)',
                                color: p.is_eligible ? '#22C55E' : '#EF4444',
                                border: `1px solid ${p.is_eligible ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.25)'}`,
                              }}>
                              {p.is_eligible ? '✅ Eligible' : '⏳ Belum Absen'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-gray-600 text-xs">
                            <div className="flex items-center justify-end gap-2">
                              <a
                                href={`https://www.tiktok.com/@${cleanUser}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-cyan-400 transition-colors"
                                title="Buka profil TikTok"
                              >
                                TikTok ↗
                              </a>
                              <button
                                onClick={() => handleSingleDelete(p.username, p.nickname)}
                                title="Hapus peserta ini"
                                className="p-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TESTER TAB ══════════════ */}
        {activeTab === 'tester' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Add tester form */}
            <div className="rounded-3xl p-6"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <h2 className="text-lg font-bold text-emerald-300">Tambah Peserta Tester</h2>
              </div>
              <p className="text-gray-500 text-xs mb-5">
                Data tester <strong className="text-gray-400">terpisah sepenuhnya</strong> dari peserta real.
                Spin wheel harus diset ke mode 🧪 Tester untuk menggunakan pool ini.
              </p>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Username</label>
                  <input type="text" placeholder="contoh: virtus123" value={testerName}
                    onChange={e => setTesterName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Nickname</label>
                  <input type="text" placeholder="contoh: Virtus Gamer" value={testerNick}
                    onChange={e => setTesterNick(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTester()}
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <button onClick={handleAddTester} disabled={testerLoading}
                  className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                  {testerLoading ? '⏳ Menambahkan…' : '➕ Tambah Tester'}
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={handleQuickAdd}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                  style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  🚀 Quick Add 5 Tester
                </button>
                <button onClick={handleResetTesters}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-80"
                  style={{ background: 'rgba(127,29,29,0.5)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  🗑️ Reset Tester
                </button>
              </div>
            </div>

            {/* Tester list */}
            <div className="rounded-3xl p-6"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="text-lg font-bold mb-3 text-emerald-300">Daftar Tester ({testerParticipants.length})</h2>
              <input type="text" placeholder="🔍 Cari tester…" value={searchTester}
                onChange={e => setSearchTester(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 mb-3"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />

              {filteredTesters.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  <span className="text-4xl">🧪</span>
                  <p className="mt-2 text-sm">Belum ada tester</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {filteredTesters.map((p, i) => (
                    <div key={p.username} className="flex items-center gap-2.5 p-2.5 rounded-xl"
                      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                        {(p.nickname || p.username || "?")[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate text-white">{p.nickname}</p>
                        <p className="text-xs text-gray-500 truncate">@{p.username}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'rgba(16,185,129,0.2)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}>
                        ✅ Eligible
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ WHATSAPP BOT TAB ══════════════ */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Panel 1: Status & Scan QR */}
            <div className="rounded-3xl p-6"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-lg font-bold text-emerald-300">Koneksi WhatsApp Bot</h2>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  waStatus === 'CONNECTED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : waStatus === 'SCAN_QR'
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}>
                  {waStatus === 'CONNECTED' ? '🟢 Terhubung' : waStatus === 'SCAN_QR' ? '🟡 Perlu Scan' : '🔴 Terputus'}
                </span>
              </div>

              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Bot berjalan secara lokal via WhatsApp Multi-Device (seperti WhatsApp Web di laptop).
                Akun WhatsApp Anda tetap aman dan berfungsi normal di smartphone.
              </p>

              {/* Status Display or QR Code */}
              {waStatus === 'CONNECTED' ? (
                <div className="p-6 rounded-2xl text-center space-y-3"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-300 mx-auto flex items-center justify-center text-3xl">
                    ✓
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">WhatsApp Siap Digunakan</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Nomor: <strong className="text-emerald-300">+{waPhone || '-'}</strong> {waUserName ? `(${waUserName})` : ''}
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleDisconnectWa}
                      disabled={waActionLoading}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all"
                    >
                      {waActionLoading ? 'Memutuskan…' : 'Putuskan Perangkat (Logout)'}
                    </button>
                  </div>
                </div>
              ) : waStatus === 'SCAN_QR' && waQrCode ? (
                <div className="flex flex-col items-center p-6 rounded-2xl bg-black/40 border border-white/10 space-y-4">
                  <div className="p-3 bg-white rounded-xl shadow-2xl">
                    <img src={waQrCode} alt="WhatsApp QR Code" className="w-56 h-56 block rounded" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-yellow-300">📱 Buka WhatsApp di HP Anda:</p>
                    <p className="text-[11px] text-gray-400">
                      Pengaturan / Titik 3 $\rightarrow$ <strong>Perangkat Tertaut</strong> $\rightarrow$ <strong>Tautkan Perangkat</strong> $\rightarrow$ Scan QR di atas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="text-4xl">📱</div>
                  <div>
                    <p className="font-semibold text-sm text-gray-300">WhatsApp Belum Terhubung</p>
                    <p className="text-xs text-gray-500 mt-1">Klik tombol di bawah untuk memunculkan QR Code</p>
                  </div>
                  <button
                    onClick={handleConnectWa}
                    disabled={waActionLoading}
                    className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    {waActionLoading ? '⏳ Menghubungkan…' : '🚀 Hubungkan WhatsApp (Scan QR)'}
                  </button>
                </div>
              )}
            </div>

            {/* Panel 2: Grup Target & Sinkronisasi Member Tag */}
            <div className="rounded-3xl p-6 flex flex-col justify-between"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full bg-blue-400" />
                  <h2 className="text-lg font-bold text-blue-300">Target Grup & Member Tag</h2>
                </div>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                  Pilih grup WhatsApp komunitas Anda. Sistem mencocokkan <strong className="text-white">Member Tag</strong> setiap anggota dengan <strong className="text-white">Username TikTok</strong> peserta giveaway.
                </p>

                {/* Warning jika ada username ganda */}
                {duplicates.length > 0 && (
                  <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs">
                    <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-200">
                      <span>⚠️</span>
                      <span>Terdeteksi {duplicates.length} Username TikTok Double:</span>
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-100/90 pl-1">
                      {duplicates.map((d, i) => (
                        <li key={i}>
                          <strong className="font-mono">@{d.member_tag}</strong> ({d.count} akun): {d.members.map(m => `+${m.phone}`).join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pilih Grup Target */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                      Pilih Grup WhatsApp Target
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={targetWaGroup}
                        onChange={e => handleSelectWaGroup(e.target.value)}
                        disabled={waStatus !== 'CONNECTED' || waGroups.length === 0}
                        className="flex-1 px-4 py-2.5 rounded-xl text-white bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      >
                        <option value="" className="bg-gray-900 text-gray-400">
                          {waStatus !== 'CONNECTED' ? '-- Hubungkan WA Terlebih Dahulu --' : waGroups.length === 0 ? '-- Tidak Ada Grup Ditemukan --' : '-- Pilih Grup WhatsApp --'}
                        </option>
                        {waGroups.map(g => (
                          <option key={g.id} value={g.id} className="bg-gray-900 text-white">
                            {g.subject} ({g.size} member)
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => fetchWaSettingsAndGroups(true)}
                        disabled={waStatus !== 'CONNECTED'}
                        title="Segarkan daftar grup WhatsApp"
                        className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                      >
                        🔄
                      </button>
                    </div>
                  </div>

                  {/* Toggle: Wajib Member Tag Grup untuk Menang */}
                  <div className="p-4 rounded-xl flex items-center justify-between gap-4"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <p className="text-sm font-bold text-white">Wajibkan Join Grup & Member Tag?</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Jika aktif, peserta HANYA bisa eligible (masuk undian) jika sudah join grup WA dan mengisi Member Tag sesuai Username TikTok.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleWaMandatory}
                      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                        isWaMandatory ? 'bg-emerald-500' : 'bg-gray-700'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        isWaMandatory ? 'right-0.5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tombol Action Sinkronisasi Data Member Tag */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleSyncWaMembers()}
                    disabled={waSyncing || waStatus !== 'CONNECTED' || !targetWaGroup}
                    className="flex-1 py-3 rounded-xl font-bold text-xs sm:text-sm text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
                  >
                    <span>{waSyncing ? '⏳' : '📥'}</span>
                    <span>{waSyncing ? 'Menyinkronkan…' : 'Tarik Otomatis (WhatsApp)'}</span>
                  </button>

                  <button
                    onClick={() => setShowMemberTagModal(true)}
                    className="py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-sky-200 transition-all hover:bg-sky-500/20 flex items-center justify-center gap-2"
                    style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.35)' }}
                  >
                    <span>✍️</span>
                    <span>Tempel List Tag Grup</span>
                  </button>
                </div>

                {/* Modal Cepat Tempel Daftar Nama & Member Tag */}
                {showMemberTagModal && (
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div
                      className="w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4"
                      style={{ background: '#111827', border: '1px solid rgba(56,189,248,0.3)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🏷️</span>
                          <h3 className="font-bold text-white text-base">Input / Tempel Daftar Member Tag Grup</h3>
                        </div>
                        <button
                          onClick={() => setShowMemberTagModal(false)}
                          className="text-gray-400 hover:text-white p-1 rounded-lg"
                        >
                          ✕
                        </button>
                      </div>

                      <p className="text-xs text-gray-300 leading-relaxed">
                        Salin daftar nama &amp; tag anggota langsung dari WhatsApp (atau ketik Nama dan Tag di baris berikutnya).
                      </p>

                      <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 text-[11px] text-gray-400 font-mono">
                        <div className="text-sky-400 font-bold mb-0.5">💡 Contoh format:</div>
                        <div>Lecii ValoM</div>
                        <div className="text-emerald-400">ramadhan1929</div>
                        <div>Nextaro</div>
                        <div className="text-emerald-400">bgtaro</div>
                        <div>redplek</div>
                        <div className="text-emerald-400">nbil2705</div>
                        <div className="text-gray-500 mt-1">atau format 1 baris: <code>redplek - nbil2705</code></div>
                      </div>

                      <textarea
                        rows={8}
                        placeholder={`Lecii ValoM\nramadhan1929\n\nNextaro\nbgtaro\n\nredplek\nnbil2705\n\n~?!\nOkimcats\n+62 813-2107-498`}
                        value={memberTagImportText}
                        onChange={e => setMemberTagImportText(e.target.value)}
                        className="w-full px-3.5 py-3 rounded-2xl text-xs font-mono text-white placeholder-gray-600 bg-white/5 border border-white/10 focus:outline-none focus:border-sky-500 resize-y"
                      />

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          onClick={() => setShowMemberTagModal(false)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                        >
                          Batal
                        </button>
                        <button
                          onClick={handleImportMemberTags}
                          disabled={memberTagImportLoading || !memberTagImportText.trim()}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                          style={{ background: 'linear-gradient(135deg, #0284C7, #0369A1)' }}
                        >
                          <span>{memberTagImportLoading ? '⏳' : '💾'}</span>
                          <span>{memberTagImportLoading ? 'Menyimpan…' : 'Simpan Semua Member Tag'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabel Semua Member Grup WA */}
                {waAllMembers.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                        📋 Semua Member Grup ({waAllMembers.length})
                      </span>
                      <span className="text-xs text-gray-500">
                        {waAllMembers.filter(m => m.has_absen).length} sudah ABSEN •{' '}
                        {waAllMembers.filter(m => m.has_absen && m.member_tag && /^[a-z0-9._]+$/.test(m.member_tag)).length} valid tag
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="🔍 Cari nama / nomor / member tag…"
                      value={searchWaMembers}
                      onChange={e => setSearchWaMembers(e.target.value)}
                      className="w-full mb-2 px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide">
                            <th className="text-left py-2 px-3 text-gray-400">#</th>
                            <th className="text-left py-2 px-3 text-gray-400">Nama WA</th>
                            <th className="text-left py-2 px-3 text-gray-400">Nomor WA</th>
                            <th className="text-left py-2 px-3 text-emerald-400">Member Tag (TikTok)</th>
                            <th className="text-center py-2 px-3 text-yellow-400">ABSEN</th>
                            <th className="text-left py-2 px-3 text-gray-500">Tag Valid?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {waAllMembers
                            .filter(m => {
                              if (!searchWaMembers) return true;
                              const q = searchWaMembers.toLowerCase();
                              return (
                                (m.push_name || '').toLowerCase().includes(q) ||
                                (m.phone || '').includes(q) ||
                                (m.member_tag || '').toLowerCase().includes(q)
                              );
                            })
                            .map((m, i) => {
                              const tag = (m.member_tag || '').replace(/^@/, '').trim().toLowerCase();
                              const isValidTag = tag.length >= 2 && /^[a-z0-9._]+$/.test(tag);
                              const hasAbsen = !!m.has_absen;
                              return (
                                <tr key={m.jid || i}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                  <td className="py-2 px-3 text-gray-600">{i + 1}</td>
                                  <td className="py-2 px-3 text-white">
                                    {m.push_name
                                      ? m.push_name.replace(/^~/, '')
                                      : <span className="text-gray-600 italic">-</span>}
                                    {m.role === 'admin' && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300">ADMIN</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-gray-400">
                                    {m.phone ? (m.phone.startsWith('+') ? m.phone : `+${m.phone}`) : '-'}
                                  </td>
                                  <td className="py-2 px-3">
                                    {tag ? (
                                      <a
                                        href={`https://www.tiktok.com/@${tag}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`font-mono font-semibold hover:underline ${
                                          isValidTag ? 'text-emerald-300 hover:text-emerald-200' : 'text-red-400 hover:text-red-300'
                                        }`}
                                      >
                                        @{tag}
                                      </a>
                                    ) : (
                                      <span className="text-gray-600 italic">Belum diisi</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {hasAbsen ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ ABSEN</span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-700/50 text-gray-500 border border-gray-700">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    {tag ? (
                                      isValidTag ? (
                                        <span className="text-emerald-400 font-bold">✓ Valid</span>
                                      ) : (
                                        <span className="text-red-400 font-bold" title="Username mengandung huruf besar atau karakter tidak valid">✗ Invalid</span>
                                      )
                                    ) : (
                                      <span className="text-gray-600">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Form Verifikasi / Input Absen Manual */}
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    <span className="text-xs font-bold text-gray-300">Input / Verifikasi Absen Manual</span>
                    <span className="text-[10px] text-gray-500 ml-auto">Bila member chat sebelum bot jalan</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Username TikTok / Tag (contoh: hykeoony)"
                      value={manualWaTag}
                      onChange={e => setManualWaTag(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="Nama di WA (contoh: Bal)"
                      value={manualWaNick}
                      onChange={e => setManualWaNick(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="Nomor WA (contoh: +62 895-3521-73090)"
                      value={manualWaPhone}
                      onChange={e => setManualWaPhone(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleManualWaRegister}
                    disabled={manualWaLoading || !manualWaTag.trim()}
                    className="w-full py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    <span>{manualWaLoading ? '⏳' : '✅'}</span>
                    <span>{manualWaLoading ? 'Menyimpan…' : 'Daftarkan Absen Member ke Giveaway'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

            {/* Panel 3: Import Chat WhatsApp (.txt) - Deteksi ABSEN & Member Tag */}
            <div
              className="rounded-3xl p-6 transition-all"
              style={{
                background: 'rgba(14, 165, 233, 0.04)',
                border: '1px solid rgba(14, 165, 233, 0.22)',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center text-xl flex-shrink-0">
                    📥
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-sky-300 flex items-center gap-2">
                      <span>Import Chat WhatsApp (.txt)</span>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-500/30">
                        Deteksi Absen &amp; Tag Otomatis
                      </span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Ekspor chat dari WhatsApp HP berupa file <strong className="text-white">.txt</strong>, lalu import di sini. Sistem akan otomatis mendeteksi siapa yang sudah ketik <strong className="text-emerald-300">ABSEN</strong>, mencocokkan nomor / nama kontak ke grup, dan memverifikasi <strong className="text-sky-300">Member Tag (Username TikTok)</strong>.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowImportPasteArea(!showImportPasteArea)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <span>{showImportPasteArea ? '📂 Mode Upload File' : '✍️ Tempel Teks Manual'}</span>
                </button>
              </div>

              {/* Format Guide Box */}
              <div className="p-3 mb-4 rounded-xl bg-black/40 border border-white/10 text-xs text-gray-400 font-mono">
                <div className="text-[11px] text-sky-400 font-sans font-bold mb-1">
                  💡 Format chat WhatsApp yang didukung:
                </div>
                <div className="text-[11px] text-gray-300 space-y-0.5">
                  <div>9/8/26, 4:36 PM - +62 878-0576-2442: ABSEN</div>
                  <div>9/8/26, 4:36 PM - Kirei: ABSEN</div>
                  <div>9/8/26, 4:37 PM - Keony: ABSEN @hykeoony</div>
                </div>
                <div className="text-[10px] text-gray-500 font-sans mt-1">
                  * Nama kontak (seperti <em>Kirei</em>) ataupun nomor telepon langsung dideteksi &amp; dicocokkan ke anggota grup.
                </div>
              </div>

              {/* Upload Dropzone OR Manual Textarea */}
              {!showImportPasteArea ? (
                <div className="mb-4">
                  <label
                    htmlFor="wa-chat-file-upload"
                    className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                      importFileName
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-sky-500/30 hover:border-sky-500/60 bg-sky-500/5 hover:bg-sky-500/10'
                    }`}
                  >
                    <input
                      id="wa-chat-file-upload"
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="text-3xl mb-2">{importFileName ? '📄' : '📁'}</div>
                    {importFileName ? (
                      <div className="text-center">
                        <p className="text-sm font-bold text-emerald-300">File Terpilih: {importFileName}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {importChatText.split('\n').length} baris terbaca • Klik untuk mengganti file
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-bold text-gray-200">
                          Klik untuk memilih file <span className="text-sky-300">.txt</span> export chat WhatsApp
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          WhatsApp &rarr; Obrolan Grup &rarr; Lainnya &rarr; Ekspor Chat (Tanpa Media)
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              ) : (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Tempel isi chat WhatsApp di bawah ini:</span>
                    <span>{importChatText ? `${importChatText.split('\n').length} baris` : '0 baris'}</span>
                  </div>
                  <textarea
                    rows={6}
                    placeholder="9/8/26, 4:36 PM - +62 878-0576-2442: ABSEN&#10;9/8/26, 4:36 PM - Kirei: ABSEN"
                    value={importChatText}
                    onChange={e => setImportChatText(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-xs font-mono bg-black/50 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
              )}

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleImportChat}
                  disabled={importLoading || !importChatText.trim()}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 flex-1 shadow-lg shadow-sky-900/20 cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #0284C7, #0369A1)' }}
                >
                  <span>{importLoading ? '⏳' : '⚡'}</span>
                  <span>{importLoading ? 'Menganalisis Riwayat Chat…' : 'Analisis Chat & Sinkronkan Absen Sekarang'}</span>
                </button>

                {importChatText && (
                  <button
                    onClick={() => {
                      setImportChatText('');
                      setImportFileName('');
                      setImportResult(null);
                    }}
                    className="px-4 py-3 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Results Display */}
              {importResult && (
                <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                      <p className="text-[11px] text-gray-400 font-semibold uppercase">Total Pesan</p>
                      <p className="text-xl font-bold text-white mt-1">{importResult.totalMessages}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <p className="text-[11px] text-emerald-300 font-semibold uppercase">Absen Terdeteksi</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">{importResult.totalAbsenDetected}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                      <p className="text-[11px] text-blue-300 font-semibold uppercase">Cocok dg Grup</p>
                      <p className="text-xl font-bold text-blue-400 mt-1">{importResult.matchedWithGroupCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-center">
                      <p className="text-[11px] text-teal-300 font-semibold uppercase">TikTok Valid (Peserta)</p>
                      <p className="text-xl font-bold text-teal-300 mt-1">{importResult.newlyVerifiedCount}</p>
                    </div>
                  </div>

                  {/* Summary Banner */}
                  <div className="p-3.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sky-100">{importResult.message}</p>
                      {importResult.missingTagCount > 0 && (
                        <p className="text-[11px] text-yellow-300/90 mt-1">
                          ⚠️ Perhatian: Ada {importResult.missingTagCount} kontak yang sudah ABSEN tetapi Member Tag (Username TikTok)-nya belum terisi. Klik tombol &quot;Isi Tag&quot; di tabel bawah untuk melengkapinya.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Table of Processed Absen Items */}
                  {importResult.results && importResult.results.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                          📋 Rincian Pengirim yang Terdeteksi ABSEN ({importResult.results.length})
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-xl max-h-80 overflow-y-auto" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-gray-900 border-b border-white/10 text-[11px] uppercase tracking-wide">
                            <tr>
                              <th className="text-left py-2.5 px-3 text-gray-400">#</th>
                              <th className="text-left py-2.5 px-3 text-white">Pengirim Chat</th>
                              <th className="text-left py-2.5 px-3 text-gray-400">Nomor WA</th>
                              <th className="text-left py-2.5 px-3 text-sky-300">Member Tag (TikTok)</th>
                              <th className="text-left py-2.5 px-3 text-gray-400">Status Tag</th>
                              <th className="text-left py-2.5 px-3 text-gray-400">Isi Chat</th>
                              <th className="text-center py-2.5 px-3 text-gray-400">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.results.map((item: any, idx: number) => (
                              <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="py-2.5 px-3 text-gray-500">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-semibold text-white">
                                  {item.sender}
                                  {item.senderType === 'contact_name' && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-normal bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      Kontak
                                    </span>
                                  )}
                                  {item.senderType === 'phone' && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-normal bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      Nomor
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-gray-400">
                                  {item.phone || '-'}
                                </td>
                                <td className="py-2.5 px-3">
                                  {item.memberTag ? (
                                    <a
                                      href={`https://www.tiktok.com/@${item.memberTag}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`font-mono font-semibold hover:underline ${
                                        item.isValidTag ? 'text-emerald-300' : 'text-red-400'
                                      }`}
                                    >
                                      @{item.memberTag}
                                    </a>
                                  ) : (
                                    <span className="text-yellow-400/80 italic">Belum ada tag</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {item.status === 'VERIFIED' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      ✓ Valid (Masuk Giveaway)
                                    </span>
                                  ) : item.status === 'INVALID_TAG' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30" title="Username mengandung huruf besar atau spasi">
                                      ✗ Tag Tidak Valid
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                                      ⚠️ Butuh Tag TikTok
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-gray-400 max-w-[160px] truncate" title={item.messageText}>
                                  {item.messageText}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {item.status !== 'VERIFIED' ? (
                                    <button
                                      onClick={() => {
                                        setManualWaTag(item.memberTag || (item.senderType === 'contact_name' ? item.sender.toLowerCase().replace(/[^a-z0-9._]/g, '') : ''));
                                        setManualWaNick(item.sender);
                                        setManualWaPhone(item.phone || (item.senderType === 'phone' ? item.sender : ''));
                                        showToast('Data dimasukkan ke form absen manual di bawah');
                                      }}
                                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors cursor-pointer"
                                    >
                                      ✏️ Isi Tag
                                    </button>
                                  ) : (
                                    <span className="text-emerald-400 text-xs">✓</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-10 text-gray-700 text-xs">
          <p>Giveaway @onlyvirtus • 6–8 September 2026 (s/d 23:59 WIB) • Refresh manual</p>
        </div>
      </div>
    </div>
  );
}
