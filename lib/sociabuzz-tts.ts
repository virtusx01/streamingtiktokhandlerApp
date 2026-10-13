const SMALL_NUMBERS = [
  'nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
];

function numberToIndonesianWords(value: bigint): string {
  if (value < BigInt(12)) return SMALL_NUMBERS[Number(value)];
  if (value < BigInt(20)) return `${numberToIndonesianWords(value - BigInt(10))} belas`;
  if (value < BigInt(100)) {
    const tens = value / BigInt(10);
    const remainder = value % BigInt(10);
    return `${numberToIndonesianWords(tens)} puluh${remainder ? ` ${numberToIndonesianWords(remainder)}` : ''}`;
  }
  if (value < BigInt(200)) {
    return `seratus${value > BigInt(100) ? ` ${numberToIndonesianWords(value - BigInt(100))}` : ''}`;
  }
  if (value < BigInt(1000)) {
    const hundreds = value / BigInt(100);
    const remainder = value % BigInt(100);
    return `${numberToIndonesianWords(hundreds)} ratus${remainder ? ` ${numberToIndonesianWords(remainder)}` : ''}`;
  }
  if (value < BigInt(2000)) {
    return `seribu${value > BigInt(1000) ? ` ${numberToIndonesianWords(value - BigInt(1000))}` : ''}`;
  }

  const units = [
    [BigInt(1_000_000_000_000), 'triliun'],
    [BigInt(1_000_000_000), 'miliar'],
    [BigInt(1_000_000), 'juta'],
    [BigInt(1000), 'ribu'],
  ] as const;

  for (const [unit, label] of units) {
    if (value >= unit) {
      const quotient = value / unit;
      const remainder = value % unit;
      return `${numberToIndonesianWords(quotient)} ${label}${remainder ? ` ${numberToIndonesianWords(remainder)}` : ''}`;
    }
  }

  return value.toString();
}

function speakableAmount(amount: string): string {
  const match = /^([A-Z]{3})\s*([0-9][0-9.,]*)$/i.exec(amount.trim());
  if (!match) return amount;

  const currency = match[1].toUpperCase();
  const numericText = match[2];
  const currencyNames: Record<string, { major: string; minor?: string }> = {
    IDR: { major: 'rupiah' },
    MYR: { major: 'ringgit', minor: 'sen' },
    SGD: { major: 'dolar Singapura', minor: 'sen' },
    USD: { major: 'dolar', minor: 'sen' },
    EUR: { major: 'euro', minor: 'sen' },
    GBP: { major: 'pound sterling', minor: 'pence' },
  };
  const names = currencyNames[currency];
  if (!names) return amount;

  const lastSeparatorIndex = Math.max(numericText.lastIndexOf('.'), numericText.lastIndexOf(','));
  const decimalDigits = lastSeparatorIndex < 0 ? 0 : numericText.length - lastSeparatorIndex - 1;
  const hasDecimals = currency !== 'IDR' && decimalDigits > 0 && decimalDigits <= 2;
  const majorDigits = hasDecimals
    ? numericText.slice(0, lastSeparatorIndex).replace(/[.,]/g, '')
    : numericText.replace(/[.,]/g, '');
  const majorAmount = BigInt(majorDigits || '0');
  const parts = [`${numberToIndonesianWords(majorAmount)} ${names.major}`];

  if (hasDecimals && names.minor) {
    const minorDigits = numericText.slice(lastSeparatorIndex + 1).padEnd(2, '0');
    const minorAmount = BigInt(minorDigits);
    if (minorAmount > BigInt(0)) {
      parts.push(`${numberToIndonesianWords(minorAmount)} ${names.minor}`);
    }
  }

  return parts.join(' ');
}

export function buildSociaBuzzSpeechText(amount: string, action: string, supporter: string, message: string): string {
  const spokenAction = action.trim();
  return [
    amount ? speakableAmount(amount) : '',
    spokenAction ? spokenAction.toLocaleLowerCase('id-ID') : '',
    supporter,
    message ? `Pesan: ${message}` : '',
  ].filter(Boolean).join('. ');
}

let activeTtsAudio: HTMLAudioElement | null = null;
let activeTtsObjectUrl: string | null = null;
let cancelActiveTtsAudio: (() => void) | null = null;
let activeTtsController: AbortController | null = null;
let cancelActiveBrowserTts: (() => void) | null = null;
let speechGeneration = 0;

function decodeVoiceId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function speakWithBrowserVoice(text: string, voiceId: string, rate: number, pitch: number): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.reject(new Error('TTS browser tidak tersedia.'));
  }

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoiceURI = voiceId.startsWith('browser:')
      ? decodeVoiceId(voiceId.slice('browser:'.length))
      : '';
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.voiceURI === selectedVoiceURI);
    utterance.voice = selectedVoice ?? null;
    const timeout = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      reject(new Error('Browser TTS timeout.'));
    }, 120000);
    utterance.lang = selectedVoice?.lang || 'id-ID';
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onerror = event => {
      window.clearTimeout(timeout);
      if (cancelActiveBrowserTts === cancel) cancelActiveBrowserTts = null;
      reject(new Error(`Browser TTS gagal: ${event.error}`));
    };
    const cancel = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    cancelActiveBrowserTts = cancel;
    utterance.onend = () => {
      window.clearTimeout(timeout);
      if (cancelActiveBrowserTts === cancel) cancelActiveBrowserTts = null;
      resolve();
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      window.clearTimeout(timeout);
      if (cancelActiveBrowserTts === cancel) cancelActiveBrowserTts = null;
      reject(error);
    }
  });
}

function speakWithResponsiveVoice(text: string, voice: string, rate: number, pitch: number): Promise<void> {
  const controller = new AbortController();
  activeTtsController = controller;
  return fetch('/api/sociabuzz/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, rate, pitch }),
    cache: 'no-store',
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error || `ResponsiveVoice request failed (${response.status}).`);
    }

    const audioBlob = await response.blob();
    if (!audioBlob.size) throw new Error('ResponsiveVoice returned an empty audio file.');
    const objectUrl = URL.createObjectURL(audioBlob);
    activeTtsObjectUrl = objectUrl;
    const audio = new Audio(objectUrl);
    activeTtsAudio = audio;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        audio.pause();
        finish(new Error('ResponsiveVoice playback timeout.'));
      }, 120000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (activeTtsAudio === audio) activeTtsAudio = null;
        if (activeTtsObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          activeTtsObjectUrl = null;
        }
        if (cancelActiveTtsAudio === cancel) cancelActiveTtsAudio = null;
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onEnded = () => finish();
      const onError = () => finish(new Error('ResponsiveVoice audio playback failed.'));
      const cancel = () => finish();

      cancelActiveTtsAudio = cancel;
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      void audio.play().catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('ResponsiveVoice audio playback was blocked.'));
      });
    });
  }).finally(() => {
    if (activeTtsController === controller) activeTtsController = null;
  });
}

export async function speakSociaBuzzAlert(
  text: string,
  voiceId: string,
  rate: number,
  pitch: number,
): Promise<'ResponsiveVoice' | 'browser'> {
  const generation = speechGeneration;
  if (voiceId.startsWith('responsive:')) {
    const voiceName = decodeVoiceId(voiceId.slice('responsive:'.length));
    try {
      if (!voiceName) throw new Error('ResponsiveVoice voice selection is invalid.');
      await speakWithResponsiveVoice(text, voiceName, rate, pitch);
      return 'ResponsiveVoice';
    } catch (error) {
      if (generation !== speechGeneration) return 'browser';
      console.warn('[SociaBuzz] ResponsiveVoice unavailable; using browser TTS:', error);
    }
  }

  if (generation !== speechGeneration) return 'browser';
  await speakWithBrowserVoice(text, voiceId, rate, pitch);
  return 'browser';
}

export function cancelSociaBuzzSpeech(): void {
  if (typeof window === 'undefined') return;
  speechGeneration += 1;
  activeTtsController?.abort();
  activeTtsController = null;
  cancelActiveBrowserTts?.();
  cancelActiveBrowserTts = null;
  activeTtsAudio?.pause();
  cancelActiveTtsAudio?.();
  activeTtsAudio = null;
  if (activeTtsObjectUrl) {
    URL.revokeObjectURL(activeTtsObjectUrl);
    activeTtsObjectUrl = null;
  }
  window.speechSynthesis?.cancel();
}
