type ResponsiveVoiceOptions = {
  rate: number;
  onend: () => void;
  onerror: (error?: unknown) => void;
};

type ResponsiveVoiceApi = {
  cancel?: () => void;
  init: (options: { apiKey: string }) => void;
  speak: (text: string, voice: string, options: ResponsiveVoiceOptions) => void;
};

declare global {
  interface Window {
    responsiveVoice?: ResponsiveVoiceApi;
  }
}

const RESPONSIVEVOICE_SCRIPT_ID = 'sociabuzz-responsivevoice-sdk';
let responsiveVoicePromise: Promise<ResponsiveVoiceApi> | null = null;

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

function loadResponsiveVoice(): Promise<ResponsiveVoiceApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('TTS hanya tersedia di browser.'));
  const apiKey = process.env.NEXT_PUBLIC_RESPONSIVEVOICE_API_KEY?.trim();
  if (!apiKey) return Promise.reject(new Error('ResponsiveVoice API key belum dikonfigurasi.'));
  if (window.responsiveVoice) {
    window.responsiveVoice.init({ apiKey });
    return Promise.resolve(window.responsiveVoice);
  }
  if (responsiveVoicePromise) return responsiveVoicePromise;

  responsiveVoicePromise = new Promise<ResponsiveVoiceApi>((resolve, reject) => {
    let script = document.getElementById(RESPONSIVEVOICE_SCRIPT_ID) as HTMLScriptElement | null;
    const timeout = window.setTimeout(() => reject(new Error('ResponsiveVoice SDK load timeout.')), 15000);
    const onLoad = () => {
      window.clearTimeout(timeout);
      if (!window.responsiveVoice) {
        reject(new Error('ResponsiveVoice SDK dimuat tetapi API tidak tersedia.'));
        return;
      }
      try {
        window.responsiveVoice.init({ apiKey });
      } catch (error) {
        reject(error);
        return;
      }
      resolve(window.responsiveVoice);
    };
    const onError = () => {
      window.clearTimeout(timeout);
      reject(new Error('Gagal memuat ResponsiveVoice SDK.'));
    };

    if (script) {
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      return;
    }

    script = document.createElement('script');
    script.id = RESPONSIVEVOICE_SCRIPT_ID;
    script.src = 'https://cdn.responsivevoice.org/sdk/latest/responsivevoice.js';
    script.async = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  }).catch(error => {
    responsiveVoicePromise = null;
    throw error;
  });

  return responsiveVoicePromise;
}

function speakWithResponsiveVoice(text: string): Promise<void> {
  return loadResponsiveVoice().then(voice => new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('ResponsiveVoice TTS timeout.')), 120000);
    const finish = (error?: unknown) => {
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };

    try {
      voice.speak(text, 'Indonesian Female', {
        rate: 1,
        onend: () => finish(),
        onerror: error => finish(error || new Error('ResponsiveVoice gagal membacakan teks.')),
      });
    } catch (error) {
      finish(error);
    }
  }));
}

function speakWithBrowserVoice(text: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.reject(new Error('TTS ResponsiveVoice dan browser tidak tersedia.'));
  }

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const timeout = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      reject(new Error('Browser TTS timeout.'));
    }, 120000);
    utterance.lang = 'id-ID';
    utterance.rate = 1;
    utterance.onend = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    utterance.onerror = event => {
      window.clearTimeout(timeout);
      reject(new Error(`Browser TTS gagal: ${event.error}`));
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

export async function speakSociaBuzzAlert(text: string): Promise<'ResponsiveVoice' | 'browser'> {
  if (process.env.NEXT_PUBLIC_RESPONSIVEVOICE_API_KEY?.trim()) {
    try {
      await speakWithResponsiveVoice(text);
      return 'ResponsiveVoice';
    } catch (error) {
      console.warn('[SociaBuzz] ResponsiveVoice unavailable; using browser TTS:', error);
    }
  }
  await speakWithBrowserVoice(text);
  return 'browser';
}

export function cancelSociaBuzzSpeech(): void {
  if (typeof window === 'undefined') return;
  window.responsiveVoice?.cancel?.();
  window.speechSynthesis?.cancel();
}
