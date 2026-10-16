'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Copy, LoaderCircle, RefreshCw, Save, Settings, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { buildSociaBuzzSpeechText, cancelSociaBuzzSpeech, speakSociaBuzzAlert } from '@/lib/sociabuzz-tts';

type AlertConfig = {
  mode: 'default' | 'custom';
  html: string;
  css: string;
  javascript: string;
  durationMs: number;
  useCustomSound: boolean;
  customSoundUrl: string;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  webhookTokenConfigured: boolean;
};

type ResponsiveVoiceOption = {
  name: string;
  flag: string;
  lang: string;
  gender: string;
  provider: string | null;
  isByok: boolean;
  deprecated: boolean;
};

type AlertData = {
  amount: string;
  supporter: string;
  message: string;
  mediaUrl: string;
  shareUrl?: string;
  isNsfw?: boolean;
  soundUrl?: string;
  fromText?: string;
  raw?: {
    amount: string | number | null;
    supporter: string | number | null;
    message: string | number | null;
    mediaUrl: string | number | null;
    shareUrl?: string | null;
    isNsfw?: boolean | null;
    soundUrl?: string | null;
    fromText: string | number | null;
    payload: unknown;
  };
};

type WebhookLog = {
  id: string;
  receivedAt: string;
  eventType: string;
  payloadFields: { path: string; value: string }[];
  mapped: AlertData;
};

type AudioStatus = 'locked' | 'ready' | 'checking' | 'playing' | 'speaking' | 'error';

type SociaBuzzOverlayOptions = {
  colorName: string;
  alphaName: number;
  colorNote: string;
  alphaNote: number;
  colorFrom: string;
  alphaFrom: number;
  mediashareActive: boolean;
  mediashareTTS: boolean;
  font: string;
  mediashareNSFW: boolean;
  customized: {
    name: boolean;
    note: boolean;
    from: boolean;
    font: boolean;
  };
};

const CALLBACK_URL = 'https://tiktoklistener.onrender.com/sociabuzz/callback';
const DEFAULT_HTML = '<div class="cyber-alert">{{mediaMarkup}}<div class="cyber-card"><div class="cyber-header"><span class="badge bell-ring">{{amount}}</span><span class="action">{{fromText}}</span><span class="user bell-ring">{{supporter}}</span></div><div class="cyber-msg">{{message}}</div></div></div>';
const DEFAULT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=Rajdhani:wght@600;700&display=swap');
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:'Rajdhani',sans-serif;color:#fff;background:transparent}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;background:transparent;overflow:hidden}
.cyber-alert{display:flex;flex-direction:column;justify-content:center;align-items:center;max-width:480px;width:100%;margin:0 auto;font-family:'Rajdhani',sans-serif;animation:cyberPop .4s cubic-bezier(.18,.89,.32,1.28) forwards}
.custom-media{width:220px;height:180px;margin:0 auto 12px auto;background-size:contain;background-repeat:no-repeat;background-position:center;display:block;animation:randomShuffleMedia 25s infinite steps(1);border-radius:16px;box-shadow:0 16px 35px rgba(0,0,0,.35)}
.custom-video{width:220px;height:180px;margin:0 auto 12px auto;object-fit:contain;display:block;border-radius:16px;box-shadow:0 16px 35px rgba(0,0,0,.35)}
.cyber-card{position:relative;width:100%;background:transparent;padding:0 15px;color:#fff;text-align:center;box-sizing:border-box}
.cyber-header{font-family:'Orbitron',sans-serif;font-size:1.1rem;margin-bottom:12px;text-transform:uppercase;display:flex;align-items:center;justify-content:center;flex-wrap:wrap}
.badge{background:#00ffcc;color:#0b0f19;padding:5px 12px;font-weight:900;border-radius:4px;display:inline-block;margin-right:4px;border:1.5px solid #000}
.action{color:#fff;font-size:.95rem;font-weight:700;margin:0 4px;letter-spacing:1px;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
.user{color:#ff007f;font-weight:900;display:inline-block;margin-left:4px;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
.cyber-msg{font-size:1.25rem;font-weight:700;color:#fff;line-height:1.4;border:none;padding-top:4px;word-break:break-word;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000}
.bell-ring{animation:bellShake 2s ease-in-out infinite}
@keyframes randomShuffleMedia{0%,33.32%{background-image:url('https://xkslvfdguwvrhxetbmyw.supabase.co/storage/v1/object/public/assets/c-d-kompilasi-final.webp')}}
@keyframes cyberPop{0%{transform:scale(.7) translateY(30px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
@keyframes bellShake{0%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-12deg)}15%{transform:rotate(10deg)}20%{transform:rotate(-8deg)}25%{transform:rotate(4deg)}30%{transform:rotate(0)}100%{transform:rotate(0)}}`;
const SHARE_MEDIA_BRIDGE = `(() => {
  const isSocialUrl = value => {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === 'https:' && (
        host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') ||
        host === 'tiktok.com' || host.endsWith('.tiktok.com') ||
        host === 'instagram.com' || host.endsWith('.instagram.com')
      );
    } catch {
      return false;
    }
  };

  const getShareUrl = () => {
    const data = window.sociabuzz || {};
    if (isSocialUrl(data.shareUrl)) return data.shareUrl;
    const text = typeof data.message === 'string' ? data.message : '';
    return text.split(' ').map(value => value.trim())
      .map(value => value.replace(/[.,!?;:]+$/, ''))
      .find(value => value.startsWith('https://') && isSocialUrl(value)) || '';
  };

  const createEmbedUrl = shareUrl => {
    const url = new URL(shareUrl);
    const host = url.hostname.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const pathVideoId = ['shorts', 'embed', 'live'].includes(pathParts[0])
        ? pathParts[1]
        : host === 'youtu.be' ? pathParts[0] : '';
      const videoId = url.searchParams.get('v') || pathVideoId || '';
      return videoId
        ? 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&mute=1&playsinline=1&enablejsapi=1'
        : '';
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const videoIndex = pathParts.indexOf('video');
      const videoId = videoIndex >= 0 ? pathParts[videoIndex + 1] || '' : '';
      return videoId
        ? 'https://www.tiktok.com/player/v1/' + encodeURIComponent(videoId) + '?autoplay=1&muted=1&loop=1&controls=1'
        : '';
    }
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      const mediaTypeIndex = pathParts.findIndex(part => ['reel', 'p', 'tv'].includes(part));
      const mediaType = mediaTypeIndex >= 0 ? pathParts[mediaTypeIndex] : '';
      const shortcode = mediaTypeIndex >= 0 ? pathParts[mediaTypeIndex + 1] : '';
      return mediaType && shortcode
        ? 'https://www.instagram.com/' + mediaType + '/' + encodeURIComponent(shortcode) + '/embed/?autoplay=1&muted=1'
        : '';
    }
    return '';
  };

  const loadYouTubeApi = () => {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (window.sociabuzzYouTubeApiPromise) return window.sociabuzzYouTubeApiPromise;
    window.sociabuzzYouTubeApiPromise = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === 'function') previousReady();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error('YouTube IFrame API did not initialize.'));
      };
      script.addEventListener('error', () => reject(new Error('Could not load YouTube IFrame API.')), { once: true });
      document.head.appendChild(script);
    });
    return window.sociabuzzYouTubeApiPromise;
  };

  const showSharePlayer = () => {
    const shareUrl = getShareUrl();
    const options = window.sociabuzz?.overlayOptions || {};
    if (!shareUrl || !options.mediashareActive ||
        (window.sociabuzz?.isNsfw === true && !options.mediashareNSFW)) return;

    let container = document.querySelector('.custom-media');
    if (!container) {
      const media = document.querySelector('.custom-video');
      container = document.createElement('div');
      container.className = 'custom-media';
      if (media) media.replaceWith(container);
      else {
        const card = document.querySelector('.cyber-card');
        if (card) card.before(container);
        else document.body.prepend(container);
      }
    }

    container.replaceChildren();
    container.style.backgroundImage = 'none';
    container.style.animation = 'none';
    container.style.width = 'min(100%, 480px)';
    container.style.height = '270px';
    container.style.aspectRatio = '16 / 9';

    const playerUrl = createEmbedUrl(shareUrl);
    const link = document.createElement('a');
    link.href = shareUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Buka media yang dibagikan';
    link.style.cssText = 'display:block;margin-top:6px;color:#fff;text-align:center;text-decoration:underline;font:12px sans-serif';

    if (!playerUrl) {
      container.appendChild(link);
      return;
    }

    const frame = document.createElement('iframe');
    frame.src = playerUrl;
    frame.dataset.sociabuzzSharePlayer = 'true';
    frame.title = 'Media yang dibagikan';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'width:100%;height:100%;border:0;border-radius:12px;background:transparent';
    const isYouTubePlayer = new URL(playerUrl).hostname === 'www.youtube.com';
    let playerReady = false;
    let userRequestedPlayback = false;
    let youTubePlayer = null;
    const handlePlayerMessage = event => {
      if (event.source === frame.contentWindow && event.origin === 'https://www.tiktok.com' &&
          event.data?.['x-tiktok-player'] === true) {
        if (event.data.type === 'onPlayerReady') {
          frame.contentWindow?.postMessage(
            { type: 'play', value: '', 'x-tiktok-player': true },
            'https://www.tiktok.com'
          );
        } else if (event.data.type === 'onPlayerError') {
          link.textContent = 'Video tidak bisa diputar di embed — buka media';
          container.replaceChildren(link);
        }
      }
    };
    if (!isYouTubePlayer) {
      activePlayerMessageHandler = handlePlayerMessage;
      window.addEventListener('message', handlePlayerMessage);
    }
    frame.addEventListener('load', () => {
      if (!isYouTubePlayer) {
        window.setTimeout(() => {
          const status = container.querySelector('[data-sociabuzz-player-status]');
          if (status) status.remove();
        }, 1000);
      }
    }, { once: true });
    frame.addEventListener('error', () => {
      if (!isYouTubePlayer) window.removeEventListener('message', handlePlayerMessage);
      link.textContent = 'Player dibatasi platform — buka media';
      container.replaceChildren(link);
    }, { once: true });
    const status = document.createElement('span');
    status.dataset.sociabuzzPlayerStatus = 'true';
    status.textContent = 'Memuat video yang dibagikan...';
    status.style.cssText = 'position:absolute;z-index:1;color:#fff;font:12px sans-serif;pointer-events:none';
    container.style.position = 'relative';
    container.append(frame, status, link);
    if (isYouTubePlayer) {
      const videoId = new URL(playerUrl).pathname.split('/').filter(Boolean).pop();
      const poster = document.createElement('button');
      poster.type = 'button';
      poster.dataset.sociabuzzVideoPoster = 'true';
      poster.setAttribute('aria-label', 'Putar video YouTube');
      poster.style.cssText = 'position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;border:0;border-radius:12px;background:#111;cursor:pointer;overflow:hidden';
      const thumbnail = document.createElement('img');
      thumbnail.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId || '') + '/hqdefault.jpg';
      thumbnail.alt = '';
      thumbnail.style.cssText = 'width:100%;height:100%;object-fit:cover';
      thumbnail.addEventListener('error', () => thumbnail.remove(), { once: true });
      const playIcon = document.createElement('span');
      playIcon.textContent = '▶';
      playIcon.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:68px;height:48px;border-radius:14px;background:#f03;color:white;font:32px/48px sans-serif;text-align:center;box-shadow:0 2px 8px #0008';
      poster.append(thumbnail, playIcon);
      poster.addEventListener('click', () => {
        userRequestedPlayback = true;
        if (playerReady) youTubePlayer?.playVideo();
      }, { once: true });
      container.appendChild(poster);
      void loadYouTubeApi().then(YT => {
        if (!frame.isConnected) return;
        youTubePlayer = new YT.Player(frame, {
          events: {
            onReady: event => {
              playerReady = true;
              event.target.mute();
              if (userRequestedPlayback || frame.src.includes('autoplay=1')) event.target.playVideo();
            },
            onStateChange: event => {
              if (event.data !== 1) return;
              poster.remove();
              status.remove();
            },
            onError: () => {
              status.textContent = 'Video tidak dapat diputar — gunakan tautan di bawah';
            },
          },
        });
      }).catch(error => {
        console.error('[SociaBuzz] YouTube player could not be initialized:', error);
        status.textContent = 'Player tidak tersedia — klik tautan untuk membuka video';
      });
    }
  };

  let activePlayerMessageHandler = null;
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'sociabuzz:tts-finished') {
      showSharePlayer();
    } else if (event.data?.type === 'sociabuzz:alert-hide') {
      if (activePlayerMessageHandler) {
        window.removeEventListener('message', activePlayerMessageHandler);
        activePlayerMessageHandler = null;
      }
      window.sociabuzzYouTubeApiPromise = null;
      document.querySelector('.custom-media')?.replaceChildren();
    }
  });
})();`;

const DEFAULT_OVERLAY_OPTIONS: SociaBuzzOverlayOptions = {
  colorName: '#ff007f',
  alphaName: 1,
  colorNote: '#ffffff',
  alphaNote: 1,
  colorFrom: '#ffffff',
  alphaFrom: 1,
  mediashareActive: true,
  mediashareTTS: true,
  font: '',
  mediashareNSFW: false,
  customized: { name: false, note: false, from: false, font: false },
};

function parseOverlayColor(value: string | null, fallback: string): string {
  return value && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value) ? value : fallback;
}

function parseOverlayAlpha(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const alpha = Number(value);
  return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : fallback;
}

function parseOverlayToggle(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function readSociaBuzzOverlayOptions(): SociaBuzzOverlayOptions {
  if (typeof window === 'undefined') return DEFAULT_OVERLAY_OPTIONS;
  const params = new URLSearchParams(window.location.search);
  const font = params.get('font')?.trim() ?? '';
  const validFont = /^[A-Za-z0-9 +_-]{1,50}:[1-9]00$/.test(font);
  return {
    colorName: parseOverlayColor(params.get('colorName'), DEFAULT_OVERLAY_OPTIONS.colorName),
    alphaName: parseOverlayAlpha(params.get('alphaName'), DEFAULT_OVERLAY_OPTIONS.alphaName),
    colorNote: parseOverlayColor(params.get('colorNote'), DEFAULT_OVERLAY_OPTIONS.colorNote),
    alphaNote: parseOverlayAlpha(params.get('alphaNote'), DEFAULT_OVERLAY_OPTIONS.alphaNote),
    colorFrom: parseOverlayColor(params.get('colorFrom'), DEFAULT_OVERLAY_OPTIONS.colorFrom),
    alphaFrom: parseOverlayAlpha(params.get('alphaFrom'), DEFAULT_OVERLAY_OPTIONS.alphaFrom),
    mediashareActive: parseOverlayToggle(params.get('mediashareActive'), DEFAULT_OVERLAY_OPTIONS.mediashareActive),
    mediashareTTS: parseOverlayToggle(params.get('mediashareTTS'), DEFAULT_OVERLAY_OPTIONS.mediashareTTS),
    font: validFont ? font : '',
    mediashareNSFW: parseOverlayToggle(params.get('mediashareNSFW'), DEFAULT_OVERLAY_OPTIONS.mediashareNSFW),
    customized: {
      name: params.has('colorName') || params.has('alphaName'),
      note: params.has('colorNote') || params.has('alphaNote'),
      from: params.has('colorFrom') || params.has('alphaFrom'),
      font: validFont,
    },
  };
}

function overlayColor(color: string, alpha: number): string {
  const hex = color.slice(1);
  const expanded = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex;
  const [red, green, blue] = [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function renderHtml(template: string, alert: AlertData) {
  const safeMediaUrl = escapeHtml(alert.mediaUrl);
  const isVideo = /^https:\/\//i.test(alert.mediaUrl) && /\.(mp4|webm|m4v|mov)(?:$|[?#])/i.test(alert.mediaUrl);
  const mediaMarkup = isVideo
    ? `<video class="custom-video" src="${safeMediaUrl}" autoplay muted playsinline loop></video>`
    : `<div class="custom-media" style="background-image:url('${safeMediaUrl}');"></div>`;
  return template.replace(/\{\{\s*(supporter|amount|message|mediaUrl|mediaMarkup|fromText|from_text)\s*\}\}/g, (_match, key: string) => {
    if (key === 'mediaMarkup') return mediaMarkup;
    const safeKey = key === 'from_text' ? 'fromText' : key;
    const value = alert[safeKey as keyof AlertData] ?? (safeKey === 'fromText' ? 'mengirim' : '');
    return escapeHtml(String(value));
  });
}

function createDocument(
  html: string,
  css: string,
  javascript: string,
  alert: AlertData,
  soundUrl: string,
  overlayOptions: SociaBuzzOverlayOptions,
) {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const safeSoundValue = JSON.stringify(soundUrl)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const resolvedJavascript = javascript.replace(/\{\{\s*sound\s*\}\}/g, safeSoundValue);
  const safeJavascript = resolvedJavascript.replace(/<\/script/gi, '<\\/script');
  const safeRawData = JSON.stringify({
    ...(alert.raw ?? {}),
    amount: alert.amount,
    supporter: alert.supporter,
    message: alert.message,
    mediaUrl: alert.mediaUrl,
    shareUrl: alert.shareUrl ?? '',
    isNsfw: alert.isNsfw === true,
    soundUrl: alert.soundUrl ?? null,
    fromText: alert.fromText ?? 'mengirim',
    sound: soundUrl,
    overlayOptions,
    payload: alert.raw?.payload ?? null,
  })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const fontMatch = /^([A-Za-z0-9 +_-]{1,50}):([1-9]00)$/.exec(overlayOptions.font);
  const fontFamily = fontMatch ? fontMatch[1] : '';
  const fontWeight = fontMatch ? fontMatch[2] : '';
  const fontLink = fontFamily
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${new URLSearchParams({
        family: `${fontFamily}:wght@${fontWeight}`,
        display: 'swap',
      })}">`
    : '';
  const themeStyle = `<style>
    ${overlayOptions.customized.name ? `.user,#sender{color:${overlayColor(overlayOptions.colorName, overlayOptions.alphaName)}!important}` : ''}
    ${overlayOptions.customized.note ? `.cyber-msg,.message,#message{color:${overlayColor(overlayOptions.colorNote, overlayOptions.alphaNote)}!important}` : ''}
    ${overlayOptions.customized.from ? `.action,.dari,#from{color:${overlayColor(overlayOptions.colorFrom, overlayOptions.alphaFrom)}!important}` : ''}
    ${fontFamily ? `html,body,.cyber-alert,.cyber-card,.cyber-header,.badge,.action,.user,.cyber-msg{font-family:'${fontFamily}',sans-serif!important;font-weight:${fontWeight}!important}` : ''}
  </style>`;
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: blob:; media-src https: data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; script-src 'unsafe-inline' https://www.youtube.com; connect-src https://www.youtube.com https://youtube.com https://*.youtube.com https://youtubei.googleapis.com https://*.googlevideo.com https://*.ytimg.com https://www.tiktok.com https://*.tiktok.com https://*.tiktokcdn.com https://www.instagram.com https://*.instagram.com https://*.cdninstagram.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com; object-src 'none'; form-action 'none'; base-uri 'none'">
    ${fontLink}<style>${safeCss}</style>${themeStyle}</head><body>${html}
    <script>window.sociabuzz = ${safeRawData}; window.sociabuzzData = window.sociabuzz;</script>
    <script>(() => {
      const originalPlay = HTMLMediaElement.prototype.play;
      const trackedAudios = new Set();
      let soundStopped = false;
      let soundSequence = 0;
      HTMLMediaElement.prototype.play = function(...args) {
        if (!(this instanceof HTMLAudioElement)) return originalPlay.apply(this, args);
        if (soundStopped) return Promise.reject(new DOMException('Donation sound fallback started.', 'AbortError'));
        trackedAudios.add(this);
        const soundId = Date.now().toString() + '-' + (++soundSequence);
        window.parent.postMessage({ type: 'sociabuzz:sound-start', soundId }, '*');
        let settled = false;
        const finish = (played) => {
          if (settled) return;
          settled = true;
          trackedAudios.delete(this);
          window.parent.postMessage({ type: 'sociabuzz:sound-end', soundId, played }, '*');
        };
        let playback;
        try {
          playback = originalPlay.apply(this, args);
        } catch (error) {
          finish(false);
          throw error;
        }
        this.addEventListener('ended', () => finish(true), { once: true });
        this.addEventListener('error', () => finish(false), { once: true });
        this.addEventListener('pause', () => finish(false), { once: true });
        playback.then(
          () => window.parent.postMessage({ type: 'sociabuzz:sound-ready', soundId }, '*'),
          () => finish(false)
        );
        return playback;
      };
      window.addEventListener('message', event => {
        if (event.source !== window.parent || event.data?.type !== 'sociabuzz:sound-stop') return;
        soundStopped = true;
        trackedAudios.forEach(audio => audio.pause());
      });
    })();</script>
    <script>${safeJavascript}</script>
    <script>${SHARE_MEDIA_BRIDGE}</script></body></html>`;
}

export default function SociabuzzPage() {
  const [config, setConfig] = useState<AlertConfig>({
    mode: 'default',
    html: DEFAULT_HTML,
    css: DEFAULT_CSS,
    javascript: '',
    durationMs: 8000,
    useCustomSound: false,
    customSoundUrl: '',
    ttsVoice: 'browser:default',
    ttsRate: 1,
    ttsPitch: 1,
    webhookTokenConfigured: false,
  });
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [visible, setVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webhookToken, setWebhookToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingWebhookLogs, setLoadingWebhookLogs] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [testError, setTestError] = useState('');
  const [testingAlert, setTestingAlert] = useState(false);
  const [uploadingCustomSound, setUploadingCustomSound] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('locked');
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [audioStatusMessage, setAudioStatusMessage] = useState('Mencoba mengaktifkan suara otomatis...');
  const [responsiveVoices, setResponsiveVoices] = useState<ResponsiveVoiceOption[]>([]);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [responsiveVoiceConfigured, setResponsiveVoiceConfigured] = useState(false);
  const [loadingTtsVoices, setLoadingTtsVoices] = useState(false);
  const [ttsVoiceError, setTtsVoiceError] = useState('');
  const [ttsVoiceSearch, setTtsVoiceSearch] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alertFrameRef = useRef<HTMLIFrameElement>(null);
  const customSoundInputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef(config);
  const audioUnlockedRef = useRef(false);
  const alertQueueRef = useRef<AlertData[]>([]);
  const processingAlertRef = useRef(false);
  const processAlertQueueRef = useRef<() => void>(() => {});
  const alertTimerRef = useRef<number | null>(null);
  const scriptSoundTrackerRef = useRef<{
    started: boolean;
    completedSuccessfully: boolean;
    pendingSoundIds: Set<string>;
    completionTimeout: number | null;
    resolve: (played: boolean) => void;
    startTimeout: number;
    playbackTimeout: number;
  } | null>(null);
  const callbackUrl = webhookToken.trim()
    ? `${CALLBACK_URL}?token=${encodeURIComponent(webhookToken.trim())}`
    : CALLBACK_URL;
  const displayedCallbackUrl = webhookToken.trim()
    ? `${CALLBACK_URL}?token=********`
    : CALLBACK_URL;

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  }, []);

  const unlockAudio = useCallback(() => {
    try {
      void getAudioContext().resume()
        .then(() => {
          const context = audioContextRef.current;
          if (context) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            gain.gain.value = 0;
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.05);
          }
          audioUnlockedRef.current = true;
          setAudioStatus('ready');
          setAudioStatusMessage('Audio siap');
          processAlertQueueRef.current();
        })
        .catch((audioError: unknown) => {
          if (audioError instanceof DOMException && audioError.name === 'NotAllowedError') {
            setAudioStatus('locked');
            setAudioStatusMessage('Browser menunggu sentuhan pertama untuk mengizinkan audio');
            return;
          }
          console.error('[SociaBuzz] Audio could not be enabled:', audioError);
          setAudioStatus('error');
          setAudioStatusMessage('Audio gagal diaktifkan — sentuh layar untuk mencoba lagi');
        });
    } catch (audioError) {
      console.error('[SociaBuzz] Audio could not be initialized:', audioError);
      setAudioStatus('error');
      setAudioStatusMessage('Audio gagal diaktifkan — sentuh layar untuk mencoba lagi');
    }
  }, [getAudioContext]);

  useEffect(() => {
    const unlockFromGesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-audio-unlock]')) return;
      unlockAudio();
    };

    unlockAudio();
    document.addEventListener('pointerdown', unlockFromGesture, { capture: true, once: true });
    document.addEventListener('keydown', unlockFromGesture, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', unlockFromGesture, true);
      document.removeEventListener('keydown', unlockFromGesture, true);
    };
  }, [unlockAudio]);

  const playDefaultAlertSound = useCallback(async () => {
    const context = getAudioContext();
    if (context.state !== 'running') await context.resume();

    const notes = [880, 1174.66, 1567.98];
    const startAt = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.13;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.38);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.4);
    });
    await new Promise(resolve => window.setTimeout(resolve, 650));
  }, [getAudioContext]);

  const playFallbackDonationSound = useCallback(async () => {
    setAudioStatus('checking');
    setAudioStatusMessage('Suara donasi tidak siap — memutar suara fallback...');
    try {
      await playDefaultAlertSound();
      setAudioStatus('playing');
      setAudioStatusMessage('Suara fallback selesai');
      return true;
    } catch (audioError) {
      console.error('[SociaBuzz] Fallback donation sound failed:', audioError);
      setAudioStatus('error');
      setAudioStatusMessage('Suara donasi dan suara fallback gagal diputar');
      return false;
    }
  }, [playDefaultAlertSound]);

  const prepareAlertAudio = useCallback((url: string) => new Promise<HTMLAudioElement>((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 1;
    audioRef.current = audio;
    setAudioStatus('checking');
    setAudioProgress(0);
    setAudioStatusMessage('Memeriksa dan memuat suara donasi...');

    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('progress', updateProgress);
      audio.removeEventListener('error', onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        if (audioRef.current === audio) audioRef.current = null;
        audio.src = '';
        reject(error);
      } else {
        resolve(audio);
      }
    };
    const onReady = () => {
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        updateProgress();
        finish();
      }
    };
    const updateProgress = () => {
      const duration = audio.duration;
      const bufferedEnd = audio.buffered.length ? audio.buffered.end(audio.buffered.length - 1) : 0;
      if (Number.isFinite(duration) && duration > 0) {
        setAudioProgress(Math.min(99, Math.round((bufferedEnd / duration) * 100)));
      } else {
        setAudioProgress(null);
      }
    };
    const onError = () => finish(new Error(`Browser gagal memuat file suara (${audio.error?.message || 'format atau URL tidak didukung'}).`));
    const timeout = window.setTimeout(() => finish(new Error('Pemeriksaan suara timeout setelah 20 detik. Periksa URL dan koneksi file audio.')), 20000);

    audio.addEventListener('canplay', onReady);
    audio.addEventListener('canplaythrough', onReady);
    audio.addEventListener('progress', updateProgress);
    audio.addEventListener('error', onError);
    audio.src = url;
    audio.load();
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) onReady();
  }), []);

  const playPreparedAudio = useCallback((audio: HTMLAudioElement) => new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (playedToEnd: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) audioRef.current = null;
      setAudioProgress(null);
      resolve(playedToEnd);
    };
    const onError = () => {
      console.error('[SociaBuzz] Donation sound failed during playback:', audio.error?.message || 'Unknown audio error');
      setAudioStatus('error');
      setAudioStatusMessage('Suara gagal diputar — periksa file audio');
      finish(false);
    };
    const onEnded = () => finish(true);
    const updateProgress = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioProgress(Math.min(100, Math.round((audio.currentTime / audio.duration) * 100)));
      }
    };
    const timeout = window.setTimeout(() => {
      console.error('[SociaBuzz] Donation sound playback timed out; stopping audio.');
      audio.pause();
      setAudioStatus('error');
      setAudioStatusMessage('Suara berhenti karena melewati batas playback');
      finish(false);
    }, 120000);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    setAudioStatus('playing');
    setAudioStatusMessage('Suara donasi sedang diputar');
    setAudioProgress(0);
    void audio.play().then(() => {
      audioUnlockedRef.current = true;
    }).catch((audioError: unknown) => {
      console.error('[SociaBuzz] Donation sound playback was rejected:', audioError);
      setAudioStatus('error');
      setAudioStatusMessage('Suara gagal diputar; klik ikon audio untuk mengaktifkan');
      finish(false);
    });
  }), []);

  const processAlertQueue = useCallback(async () => {
    if (processingAlertRef.current || alertQueueRef.current.length === 0) return;

    processingAlertRef.current = true;
    const nextAlert = alertQueueRef.current.shift()!;
    const currentConfig = configRef.current;
    const overlayOptions = readSociaBuzzOverlayOptions();
    const scriptHandlesSound = currentConfig.mode === 'custom' && /\{\{\s*sound\s*\}\}/.test(currentConfig.javascript);
    const scriptSoundSelected = scriptHandlesSound && currentConfig.useCustomSound && Boolean(currentConfig.customSoundUrl);
    const mediaAudioUrl = /\.(mp3|wav|ogg|m4a|aac|mp4|webm|m4v|mov)(?:$|[?#])/i.test(nextAlert.mediaUrl)
      ? nextAlert.mediaUrl
      : undefined;
    const soundUrl = scriptHandlesSound
      ? undefined
      : currentConfig.useCustomSound
        ? currentConfig.customSoundUrl
        : nextAlert.soundUrl || mediaAudioUrl;
    const scriptSoundPlayback = scriptSoundSelected
      ? new Promise<boolean>(resolve => {
          const finish = (played: boolean) => {
            const tracker = scriptSoundTrackerRef.current;
            if (!tracker) return;
            window.clearTimeout(tracker.startTimeout);
            window.clearTimeout(tracker.playbackTimeout);
            if (tracker.completionTimeout !== null) window.clearTimeout(tracker.completionTimeout);
            scriptSoundTrackerRef.current = null;
            alertFrameRef.current?.contentWindow?.postMessage({ type: 'sociabuzz:sound-stop' }, '*');
            resolve(played);
          };
          const startTimeout = window.setTimeout(() => finish(false), 15000);
          const playbackTimeout = window.setTimeout(() => finish(false), 60000);
          scriptSoundTrackerRef.current = {
            started: false,
            completedSuccessfully: false,
            pendingSoundIds: new Set(),
            completionTimeout: null,
            resolve: finish,
            startTimeout,
            playbackTimeout,
          };
        })
      : Promise.resolve(true);
    const preparedAudioPromise = soundUrl
      ? prepareAlertAudio(soundUrl).then(audio => audio).catch(audioError => {
          console.error('[SociaBuzz] Donation sound could not be prepared:', audioError);
          setAudioStatus('error');
          setAudioStatusMessage(audioError instanceof Error ? audioError.message : 'File suara gagal dimuat');
          return null;
        })
      : Promise.resolve(null);
    let soundFailed = false;

    setAlert(nextAlert);
    setVisible(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    let soundPlayback: Promise<void>;
    if (soundUrl) {
      soundPlayback = preparedAudioPromise.then(async preparedAudio => {
        if (!preparedAudio) {
          soundFailed = !(await playFallbackDonationSound());
          return;
        }
        setAudioStatus('ready');
        setAudioStatusMessage('Suara siap — notifikasi sedang tampil');
        const playedToEnd = await playPreparedAudio(preparedAudio);
        if (!playedToEnd) soundFailed = !(await playFallbackDonationSound());
      });
    } else if (scriptSoundSelected) {
      setAudioStatus('checking');
      setAudioStatusMessage('Memuat suara custom dari JavaScript...');
      soundPlayback = scriptSoundPlayback.then(async played => {
        if (!played) soundFailed = !(await playFallbackDonationSound());
      });
    } else if (!currentConfig.useCustomSound && !scriptHandlesSound) {
      setAudioStatus('playing');
      setAudioStatusMessage('Suara donasi sedang diputar');
      setAudioProgress(0);
      soundPlayback = playDefaultAlertSound()
        .then(() => {
          soundFailed = false;
        })
        .catch((audioError: unknown) => {
          console.error('[SociaBuzz] Default donation sound failed:', audioError);
          soundFailed = true;
          setAudioStatus('error');
          setAudioStatusMessage('Audio gagal diputar — klik ikon audio untuk mencoba lagi');
        })
        .finally(() => setAudioProgress(null));
    } else {
      soundPlayback = currentConfig.useCustomSound
        ? playFallbackDonationSound().then(fallbackPlayed => {
            soundFailed = !fallbackPlayed;
          })
        : Promise.resolve();
    }

    try {
      const minimumVisibleTime = new Promise<void>(resolve => {
        alertTimerRef.current = window.setTimeout(resolve, currentConfig.durationMs);
      });
      const template = currentConfig.mode === 'custom' ? currentConfig.html : DEFAULT_HTML;
      const actionHtml = /<[^>]*class=["'][^"']*\baction\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(template)?.[1] ?? '';
      const actionText = actionHtml && !/\{\{[^}]+\}\}/.test(actionHtml)
        ? actionHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()
        : nextAlert.fromText || 'mengirim';
      const speechText = buildSociaBuzzSpeechText(nextAlert.amount, actionText, nextAlert.supporter, nextAlert.message);
      const speechPlayback = soundPlayback.then(async () => {
        if ((nextAlert.shareUrl && !overlayOptions.mediashareTTS) || !speechText) return;
        setAudioStatus('speaking');
        setAudioStatusMessage('Membacakan notifikasi donasi...');
        try {
          const voice = await speakSociaBuzzAlert(
            speechText,
            currentConfig.ttsVoice || 'browser:default',
            currentConfig.ttsRate ?? 1,
            currentConfig.ttsPitch ?? 1,
          );
          setAudioStatusMessage(`TTS selesai (${voice})`);
        } catch (speechError) {
          soundFailed = true;
          console.error('[SociaBuzz] Donation TTS failed:', speechError);
          setAudioStatus('error');
          setAudioStatusMessage('TTS gagal — periksa izin suara browser');
        }
      });
      const shareMediaVisibleTime = speechPlayback.then(() => {
        if (!overlayOptions.mediashareActive || !nextAlert.shareUrl ||
            (nextAlert.isNsfw === true && !overlayOptions.mediashareNSFW)) return Promise.resolve();
        alertFrameRef.current?.contentWindow?.postMessage({ type: 'sociabuzz:tts-finished' }, '*');
        return new Promise<void>(resolve => window.setTimeout(resolve, currentConfig.durationMs));
      });
      await Promise.all([speechPlayback, minimumVisibleTime, shareMediaVisibleTime]);
    } catch (queueError) {
      soundFailed = true;
      console.error('[SociaBuzz] Alert playback failed:', queueError);
    } finally {
      if (alertTimerRef.current !== null) {
        window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = null;
      }
      alertFrameRef.current?.contentWindow?.postMessage({ type: 'sociabuzz:alert-hide' }, '*');
      setVisible(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setAudioProgress(null);
      if (!soundFailed && audioUnlockedRef.current) {
        setAudioStatus('ready');
        setAudioStatusMessage('Audio siap');
      }
      processingAlertRef.current = false;
      if (alertQueueRef.current.length > 0) void processAlertQueue();
    }
  }, [playDefaultAlertSound, playFallbackDonationSound, playPreparedAudio, prepareAlertAudio]);

  useEffect(() => {
    processAlertQueueRef.current = () => { void processAlertQueue(); };
  }, [processAlertQueue]);

  useEffect(() => {
    const handleScriptSoundMessage = (event: MessageEvent) => {
      if (event.source !== alertFrameRef.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const tracker = scriptSoundTrackerRef.current;
      const soundId = typeof event.data.soundId === 'string' ? event.data.soundId : '';
      if (!tracker || !soundId) return;
      if (event.data.type === 'sociabuzz:sound-start') {
        tracker.started = true;
        window.clearTimeout(tracker.startTimeout);
        if (tracker.completionTimeout !== null) {
          window.clearTimeout(tracker.completionTimeout);
          tracker.completionTimeout = null;
        }
        tracker.pendingSoundIds.add(soundId);
        setAudioStatus('checking');
        setAudioStatusMessage('Menunggu file suara custom dimuat...');
      } else if (event.data.type === 'sociabuzz:sound-ready') {
        setAudioStatus('playing');
        setAudioStatusMessage('Suara donasi custom sedang diputar');
      } else if (event.data.type === 'sociabuzz:sound-end') {
        tracker.pendingSoundIds.delete(soundId);
        tracker.completedSuccessfully ||= event.data.played === true;
        if (!tracker.pendingSoundIds.size) {
          tracker.completionTimeout = window.setTimeout(
            () => tracker.resolve(tracker.completedSuccessfully),
            500,
          );
        }
      }
    };
    window.addEventListener('message', handleScriptSoundMessage);
    return () => window.removeEventListener('message', handleScriptSoundMessage);
  }, []);

  useEffect(() => {
    void fetch('/api/sociabuzz/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Gagal memuat konfigurasi alert.');
        const data = await response.json();
        configRef.current = data;
        setConfig(data);
      })
      .catch((loadError: unknown) => {
        console.error('[SociaBuzz] Config load failed:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Gagal memuat konfigurasi.');
      });

    void fetch('/api/auth/me')
      .then((response) => response.json())
      .then((data) => setIsAdmin(Boolean(data?.authenticated && data?.user?.role === 'admin')))
      .catch(() => setIsAdmin(false));

    const source = new EventSource('/api/events');
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== 'sociabuzz') return;
        const data = payload.data as Partial<AlertData>;
        const incomingAlert: AlertData = {
          amount: typeof data.amount === 'string' ? data.amount : '0',
          supporter: typeof data.supporter === 'string' ? data.supporter : 'Supporter',
          message: typeof data.message === 'string' ? data.message : '',
          mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : '',
          shareUrl: typeof data.shareUrl === 'string' ? data.shareUrl : undefined,
          isNsfw: data.isNsfw === true,
          soundUrl: typeof data.soundUrl === 'string' ? data.soundUrl : undefined,
          fromText: typeof data.fromText === 'string' ? data.fromText : 'mengirim',
          raw: data.raw,
        };
        alertQueueRef.current.push(incomingAlert);
        processAlertQueueRef.current();
      } catch (parseError) {
        console.error('[SociaBuzz] Could not parse incoming event:', parseError);
      }
    };
    source.onerror = (event) => console.warn('[SociaBuzz] Event stream connection issue:', event);
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    let active = true;
    setLoadingTtsVoices(true);
    setTtsVoiceError('');

    const updateBrowserVoices = () => {
      if (active && 'speechSynthesis' in window) {
        setBrowserVoices(window.speechSynthesis.getVoices());
      }
    };
    updateBrowserVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', updateBrowserVoices);

    void fetch('/api/sociabuzz/tts/voices', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Gagal memuat suara ResponsiveVoice.');
        if (!active) return;
        setResponsiveVoiceConfigured(result.configured === true);
        setResponsiveVoices(Array.isArray(result.voices) ? result.voices : []);
        if (result.error) setTtsVoiceError(result.error);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setTtsVoiceError(loadError instanceof Error ? loadError.message : 'Gagal memuat pilihan suara.');
      })
      .finally(() => {
        if (active) setLoadingTtsVoices(false);
      });

    return () => {
      active = false;
      window.speechSynthesis?.removeEventListener('voiceschanged', updateBrowserVoices);
    };
  }, [settingsOpen]);

  useEffect(() => () => {
    if (alertTimerRef.current !== null) window.clearTimeout(alertTimerRef.current);
    if (scriptSoundTrackerRef.current) {
      window.clearTimeout(scriptSoundTrackerRef.current.startTimeout);
      window.clearTimeout(scriptSoundTrackerRef.current.playbackTimeout);
      if (scriptSoundTrackerRef.current.completionTimeout !== null) {
        window.clearTimeout(scriptSoundTrackerRef.current.completionTimeout);
      }
      scriptSoundTrackerRef.current = null;
    }
    audioRef.current?.pause();
    cancelSociaBuzzSpeech();
    void audioContextRef.current?.close().catch((audioError: unknown) => {
      console.error('[SociaBuzz] Audio context could not be closed:', audioError);
    });
  }, []);

  const previewHtml = useMemo(() => {
    if (!alert) return '';
    const template = config.mode === 'custom' ? config.html : DEFAULT_HTML;
    const css = config.mode === 'custom' ? config.css : DEFAULT_CSS;
    const javascript = config.mode === 'custom' ? config.javascript : '';
    const scriptHandlesSound = config.mode === 'custom' && /\{\{\s*sound\s*\}\}/.test(javascript);
    const selectedSoundUrl = config.useCustomSound ? config.customSoundUrl : '';
    const templateData = config.mode === 'custom' && alert.raw
      ? {
          ...alert,
          supporter: alert.raw.supporter == null ? alert.supporter : String(alert.raw.supporter),
          message: alert.raw.message == null ? alert.message : String(alert.raw.message),
          mediaUrl: alert.raw.mediaUrl == null ? alert.mediaUrl : String(alert.raw.mediaUrl),
          soundUrl: alert.raw.soundUrl == null ? alert.soundUrl : String(alert.raw.soundUrl),
          fromText: alert.raw.fromText == null ? alert.fromText : String(alert.raw.fromText),
        }
      : alert;
    return createDocument(
      renderHtml(template, templateData),
      css,
      javascript,
      alert,
      scriptHandlesSound ? selectedSoundUrl : '',
      readSociaBuzzOverlayOptions(),
    );
  }, [alert, config.css, config.html, config.javascript, config.mode, config.useCustomSound, config.customSoundUrl]);

  const copyDefaultToCustom = () => {
    setConfig((current) => ({
      ...current,
      mode: 'custom',
      html: DEFAULT_HTML,
      css: DEFAULT_CSS,
      javascript: '',
    }));
  };

  const saveSettings = useCallback(async () => {
    if (config.useCustomSound && !config.customSoundUrl) {
      setError('Pilih file suara custom sebelum mengaktifkan suara custom.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/sociabuzz/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, webhookToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan pengaturan.');
      setConfig((current) => ({ ...current, webhookTokenConfigured: result.webhookTokenConfigured }));
      setWebhookToken('');
      setSettingsOpen(false);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }, [config, webhookToken]);

  const uploadCustomSound = async (file?: File) => {
    if (!file) return;
    if (!(file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name))) {
      setError('File harus berupa audio (MP3, WAV, OGG, M4A, AAC, atau WebM).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Ukuran file suara maksimal 15 MB.');
      return;
    }

    setUploadingCustomSound(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') {
        throw new Error(result.error || 'Gagal mengunggah file suara.');
      }
      setConfig(current => ({ ...current, customSoundUrl: result.url }));
    } catch (uploadError) {
      console.error('[SociaBuzz] Custom sound upload failed:', uploadError);
      setError(uploadError instanceof Error ? uploadError.message : 'Gagal mengunggah file suara.');
    } finally {
      setUploadingCustomSound(false);
      if (customSoundInputRef.current) customSoundInputRef.current.value = '';
    }
  };

  const loadWebhookLogs = useCallback(async () => {
    setLoadingWebhookLogs(true);
    try {
      const response = await fetch('/api/sociabuzz/logs', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal memuat log webhook.');
      setWebhookLogs(Array.isArray(result.logs) ? result.logs : []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat log webhook.');
    } finally {
      setLoadingWebhookLogs(false);
    }
  }, []);

  useEffect(() => {
    if (settingsOpen && isAdmin) void loadWebhookLogs();
  }, [settingsOpen, isAdmin, loadWebhookLogs]);

  const copyCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      console.error('[SociaBuzz] Could not copy callback URL:', copyError);
      setError('Gagal menyalin URL callback.');
    }
  };

  const testAlert = async () => {
    setTestingAlert(true);
    setTestError('');
    unlockAudio();
    try {
      const response = await fetch('/api/sociabuzz/test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal mengirim test alert.');
    } catch (testAlertError) {
      console.error('[SociaBuzz] Test alert failed:', testAlertError);
      setTestError(testAlertError instanceof Error ? testAlertError.message : 'Gagal mengirim test alert.');
    } finally {
      setTestingAlert(false);
    }
  };

  const normalizedVoiceSearch = ttsVoiceSearch.trim().toLocaleLowerCase();
  const visibleResponsiveVoices = responsiveVoices.filter(voice =>
    `${voice.name} ${voice.lang} ${voice.gender} ${voice.provider ?? ''}`.toLocaleLowerCase().includes(normalizedVoiceSearch),
  );
  const visibleBrowserVoices = browserVoices.filter(voice =>
    `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLocaleLowerCase().includes(normalizedVoiceSearch),
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-transparent">
      <style jsx global>{`html, body { background: transparent !important; overflow: hidden; }`}</style>
      {alert && (
        <iframe
          ref={alertFrameRef}
          title="SociaBuzz alert"
          sandbox="allow-scripts allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          srcDoc={previewHtml}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
      )}
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => void testAlert()}
            disabled={testingAlert}
            className="fixed bottom-5 left-5 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-slate-800 disabled:opacity-60"
          >
            {testingAlert ? 'Mengirim...' : 'Test Alert'}
          </button>
          {testError && <p role="alert" className="fixed bottom-16 left-5 max-w-xs rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-200">{testError}</p>}
          <button
            type="button"
            aria-label="Pengaturan SociaBuzz"
            onClick={() => setSettingsOpen(true)}
            className="fixed bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-violet-300/30 bg-slate-950/90 text-violet-200 shadow-xl backdrop-blur hover:bg-violet-950"
          >
            <Settings size={19} />
          </button>
        </>
      )}
      <div className="fixed bottom-5 left-1/2 z-40 w-[min(92vw,360px)] -translate-x-1/2">
        <button
          type="button"
          onClick={unlockAudio}
          data-audio-unlock
          aria-label={audioStatusMessage}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold shadow-lg backdrop-blur ${
            audioStatus === 'error'
              ? 'border-red-300/40 bg-red-950/90 text-red-100'
              : audioStatus === 'locked'
                ? 'border-amber-300/40 bg-slate-950/90 text-amber-100'
                : 'border-emerald-300/30 bg-slate-950/85 text-emerald-100'
          }`}
        >
          {audioStatus === 'checking' || audioStatus === 'playing' || audioStatus === 'speaking'
            ? <LoaderCircle size={16} className="shrink-0 animate-spin" />
            : audioStatus === 'ready'
              ? <Volume2 size={16} className="shrink-0" />
              : <VolumeX size={16} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{audioStatusMessage}</span>
          {audioProgress !== null && <span className="shrink-0 tabular-nums">{audioProgress}%</span>}
        </button>
        {(audioStatus === 'checking' || audioStatus === 'playing' || audioStatus === 'speaking') && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
            <div
              className={`h-full rounded-full bg-emerald-400 transition-[width] duration-150 ${audioProgress === null ? 'w-1/3 animate-pulse' : ''}`}
              style={audioProgress === null ? undefined : { width: `${audioProgress}%` }}
            />
          </div>
        )}
      </div>
      {settingsOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <section className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <header className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">Pengaturan SociaBuzz Alert</h1>
                <p className="mt-1 text-xs text-slate-400">Kode custom berjalan di iframe sandbox terisolasi; JavaScript tidak dapat mengakses halaman utama.</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Tutup pengaturan" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">Mode alert</label>
                <p className="mb-3 text-xs leading-5 text-slate-400">
                  TTS otomatis membaca nominal, aksi, nama, dan pesan setelah suara donasi selesai. ResponsiveVoice dipakai jika API key dikonfigurasi; jika tidak, browser menggunakan suara TTS bawaannya. Teks donasi dikirim ke penyedia TTS saat ResponsiveVoice aktif.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['default', 'custom'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConfig((current) => ({ ...current, mode }))}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${config.mode === mode ? 'border-violet-400 bg-violet-500/20 text-violet-100' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {config.mode === 'custom' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold"><Code2 size={16} /> Kode alert custom</h2>
                      <p className="mt-1 text-xs text-slate-400">HTML, CSS, dan JavaScript ditampilkan dan dapat diedit di sini.</p>
                    </div>
                    <button
                      type="button"
                      onClick={copyDefaultToCustom}
                      className="flex items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20"
                    >
                      <Copy size={14} /> Salin template &amp; style default
                    </button>
                  </div>

                  <div>
                    <label htmlFor="sociabuzz-html" className="mb-2 block text-xs font-semibold text-emerald-200">HTML</label>
                    <textarea
                      id="sociabuzz-html"
                      value={config.html}
                      onChange={(event) => setConfig((current) => ({ ...current, html: event.target.value }))}
                      rows={8}
                      spellCheck={false}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-5 text-emerald-100 outline-none focus:border-violet-400"
                    />
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                        Placeholder <code>{'{{amount}}'}</code> menyertakan mata uang jika tersedia, misalnya <code>MYR2.44</code> atau <code>IDR3000</code>. Payload asli tetap tersedia di <code>window.sociabuzz.payload</code>.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="sociabuzz-css" className="mb-2 block text-xs font-semibold text-cyan-200">CSS</label>
                    <textarea
                      id="sociabuzz-css"
                      value={config.css}
                      onChange={(event) => setConfig((current) => ({ ...current, css: event.target.value }))}
                      rows={12}
                      spellCheck={false}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-5 text-cyan-100 outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label htmlFor="sociabuzz-javascript" className="mb-2 block text-xs font-semibold text-amber-200">JavaScript</label>
                    <textarea
                      id="sociabuzz-javascript"
                      value={config.javascript}
                      onChange={(event) => setConfig((current) => ({ ...current, javascript: event.target.value }))}
                      rows={8}
                      spellCheck={false}
                      placeholder={'// Data tersedia di window.sociabuzz, termasuk shareUrl, overlayOptions, dan payload.\nconst { amount, supporter, message, shareUrl, payload, overlayOptions } = window.sociabuzz;\n\n// {{sound}} menjadi URL suara custom atau "" jika suara tidak dipilih.\nconst soundUrl = {{sound}};\nif (soundUrl) new Audio(soundUrl).play().catch(console.error);\n\nconst amountEl = document.querySelector("#amount");\nif (amountEl) amountEl.textContent = String(amount ?? "");'}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-5 text-amber-100 outline-none focus:border-violet-400"
                    />
                    <p className="mt-2 text-xs leading-5 text-amber-200/80">
                      Data media yang dibagikan tersedia di <code>window.sociabuzz.shareUrl</code>; player YouTube, TikTok, atau Instagram akan otomatis menggantikan <code>.custom-media</code> setelah TTS selesai. URL payload yang dikenali juga tersedia di <code>window.sociabuzz.payload</code>. <code>{'{{sound}}'}</code> menjadi URL suara custom jika toggle suara aktif dan file dipilih, atau string kosong jika tidak ada. Saat token ini dipakai, suara diserahkan ke JavaScript agar tidak diputar dua kali. Data <code>window.sociabuzz</code> mencakup <code>amount</code>, <code>supporter</code>, <code>message</code>, <code>shareUrl</code>, <code>overlayOptions</code>, <code>sound</code>, dan <code>payload</code> tanpa field token/kontak. Parameter MediaShare dari query URL dapat mengatur warna, opacity, font, TTS, embed, dan izin konten bertanda NSFW. JavaScript berjalan di iframe sandbox; jalankan hanya kode yang kamu percaya.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="sociabuzz-duration" className="mb-2 block text-sm font-semibold">Durasi alert (detik)</label>
                <input
                  id="sociabuzz-duration"
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(config.durationMs / 1000)}
                  onChange={(event) => setConfig((current) => ({ ...current, durationMs: Number(event.target.value) * 1000 }))}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
              </div>

              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><Volume2 size={16} /> Suara donasi</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Aktifkan untuk memakai file suara pilihanmu, bukan suara atau media audio dari payload SociaBuzz.</p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={config.useCustomSound}
                      onChange={(event) => setConfig(current => ({ ...current, useCustomSound: event.target.checked }))}
                      className="h-4 w-4 accent-violet-500"
                    />
                    Gunakan suara custom
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="URL file suara donasi custom"
                    value={config.customSoundUrl}
                    onChange={(event) => setConfig(current => ({ ...current, customSoundUrl: event.target.value }))}
                    placeholder="URL file audio atau unggah file"
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                  <input
                    ref={customSoundInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
                    className="hidden"
                    onChange={(event) => void uploadCustomSound(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => customSoundInputRef.current?.click()}
                    disabled={uploadingCustomSound}
                    className="flex items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-60"
                  >
                    {uploadingCustomSound ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploadingCustomSound ? 'Mengunggah...' : 'Pilih file'}
                  </button>
                  {config.customSoundUrl && (
                    <button
                      type="button"
                      onClick={() => setConfig(current => ({ ...current, customSoundUrl: '' }))}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {config.useCustomSound && !config.customSoundUrl && (
                  <p role="alert" className="mt-2 text-xs text-amber-300">Pilih file suara terlebih dahulu sebelum menyimpan.</p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">Format audio umum, maksimal 15 MB. Suara custom hanya diputar ketika toggle aktif.</p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Suara TTS donasi</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    TTS dimulai setelah suara donasi selesai. API TTS aplikasi dapat dipakai tanpa login pengguna. ResponsiveVoice memakai API key dan secret server-to-server di environment server, bukan verifikasi URL/site code browser; secret tidak dikirim ke browser.
                  </p>
                </div>
                <label htmlFor="sociabuzz-tts-search" className="mb-2 mt-4 block text-xs font-semibold">Cari suara berdasarkan nama, bahasa, atau penyedia</label>
                <input
                  id="sociabuzz-tts-search"
                  type="search"
                  value={ttsVoiceSearch}
                  onChange={event => setTtsVoiceSearch(event.target.value)}
                  placeholder="Contoh: Indonesian, female, en-US"
                  className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
                <label htmlFor="sociabuzz-tts-voice" className="sr-only">Pilih suara TTS</label>
                <select
                  id="sociabuzz-tts-voice"
                  value={config.ttsVoice}
                  onChange={event => setConfig(current => ({ ...current, ttsVoice: event.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400"
                >
                  <option value="browser:default">Suara bawaan browser (Indonesia)</option>
                  {config.ttsVoice.startsWith('responsive:') &&
                    !responsiveVoices.some(voice => `responsive:${encodeURIComponent(voice.name)}` === config.ttsVoice) && (
                      <option value={config.ttsVoice}>Suara ResponsiveVoice tersimpan (tidak ada di katalog saat ini)</option>
                    )}
                  {config.ttsVoice.startsWith('browser:') &&
                    config.ttsVoice !== 'browser:default' &&
                    !browserVoices.some(voice => `browser:${encodeURIComponent(voice.voiceURI)}` === config.ttsVoice) && (
                      <option value={config.ttsVoice}>Suara browser tersimpan (tidak tersedia di perangkat ini)</option>
                    )}
                  {visibleResponsiveVoices.length > 0 && (
                    <optgroup label={`ResponsiveVoice (${visibleResponsiveVoices.length})`}>
                      {visibleResponsiveVoices.map(voice => (
                        <option
                          key={`${voice.name}:${voice.lang}`}
                          value={`responsive:${encodeURIComponent(voice.name)}`}
                          disabled={voice.deprecated}
                        >
                          {voice.flag} {voice.name} · {voice.lang} · {voice.gender === 'f' ? 'female' : 'male'}
                          {voice.provider ? ` · ${voice.provider}` : ''}
                          {voice.isByok ? ' · BYOK' : ''}
                          {voice.deprecated ? ' · deprecated' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {visibleBrowserVoices.length > 0 && (
                    <optgroup label={`Suara tersedia di browser (${visibleBrowserVoices.length})`}>
                      {visibleBrowserVoices.map(voice => (
                        <option key={voice.voiceURI} value={`browser:${encodeURIComponent(voice.voiceURI)}`}>
                          {voice.name} · {voice.lang}{voice.default ? ' · default' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">
                    Kecepatan: {config.ttsRate.toFixed(1)}×
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={config.ttsRate}
                      onChange={event => setConfig(current => ({ ...current, ttsRate: Number(event.target.value) }))}
                      className="mt-2 w-full accent-violet-500"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Pitch: {config.ttsPitch.toFixed(1)}×
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={config.ttsPitch}
                      onChange={event => setConfig(current => ({ ...current, ttsPitch: Number(event.target.value) }))}
                      className="mt-2 w-full accent-violet-500"
                    />
                  </label>
                </div>
                {loadingTtsVoices && <p className="mt-2 text-xs text-violet-200">Memuat katalog suara...</p>}
                {!responsiveVoiceConfigured && (
                  <p className="mt-2 text-xs leading-5 text-amber-200">
                    Kredensial server ResponsiveVoice belum tersedia; TTS akan tetap berjalan menggunakan suara browser. Atur <code>RESPONSIVEVOICE_API_KEY</code> dan <code>RESPONSIVEVOICE_API_SECRET</code> di environment server untuk mengaktifkan katalog dan TTS ResponsiveVoice.
                  </p>
                )}
                {ttsVoiceError && <p role="alert" className="mt-2 text-xs text-red-300">{ttsVoiceError}</p>}
                {responsiveVoiceConfigured && responsiveVoices.length === 0 && !loadingTtsVoices && (
                  <p className="mt-2 text-xs text-amber-200">Katalog ResponsiveVoice kosong atau belum berhasil dimuat. Pilihan suara browser tetap tersedia.</p>
                )}
              </section>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <label htmlFor="sociabuzz-token" className="mb-2 block text-sm font-semibold">Webhook token</label>
                <p className="mb-3 text-xs leading-5 text-slate-400">Masukkan token yang sama dengan pengaturan webhook SociaBuzz. Token disimpan sebagai teks biasa agar dapat dicocokkan langsung; batasi akses ke database dan URL callback.</p>
                <input
                  id="sociabuzz-token"
                  type="password"
                  autoComplete="new-password"
                  value={webhookToken}
                  onChange={(event) => setWebhookToken(event.target.value)}
                  placeholder={config.webhookTokenConfigured ? 'Token sudah tersimpan — isi hanya jika ingin mengganti' : 'Masukkan token webhook'}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-cyan-200">{displayedCallbackUrl}</code>
                  <button type="button" onClick={copyCallbackUrl} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800">
                    <Copy size={14} /> {copied ? 'Tersalin' : 'Salin URL'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Isi token yang sama di atas lalu salin URL untuk parameter token URL. URL salinan memuat token pada parameter <code>?token=</code>; jaga URL tersebut tetap privat.</p>
              </div>

              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Log payload webhook</h2>
                    <p className="mt-1 text-xs text-slate-400">Maksimal 20 webhook valid terakhir. Token dan field sensitif dikecualikan.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadWebhookLogs()}
                    disabled={loadingWebhookLogs}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={loadingWebhookLogs ? 'animate-spin' : ''} />
                    Muat ulang
                  </button>
                </div>
                {webhookLogs.length === 0 ? (
                  <p className="rounded-lg bg-black/30 px-3 py-4 text-center text-xs text-slate-500">
                    {loadingWebhookLogs ? 'Memuat log...' : 'Belum ada webhook valid yang tercatat.'}
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {webhookLogs.map((log) => (
                      <details key={log.id} className="rounded-lg border border-slate-800 bg-black/30 p-3">
                        <summary className="cursor-pointer text-xs text-slate-200">
                          <span className="font-semibold">{log.mapped?.supporter || 'Supporter'}</span>
                          <span className="text-slate-400"> · {log.mapped?.amount || '0'} · {log.eventType}</span>
                          <time className="mt-1 block text-[10px] text-slate-500">
                            {new Date(log.receivedAt).toLocaleString()}
                          </time>
                        </summary>
                        <div className="mt-3 space-y-3 text-xs">
                          <div>
                            <p className="mb-1 font-semibold text-violet-200">Hasil mapping alert</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-slate-300">{JSON.stringify(log.mapped, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-cyan-200">Field payload diterima</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-slate-300">{JSON.stringify(log.payloadFields, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>

              {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

              <footer className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Batal</button>
                <button type="button" onClick={() => void saveSettings()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60">
                  {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Simpan
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
