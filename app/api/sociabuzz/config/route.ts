import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting, setSetting } from '@/lib/db';

const CONFIG_KEY = 'sociabuzzAlertConfig';
const TOKEN_KEY = 'sociabuzzWebhookToken';
const TOKEN_HASH_KEY = 'sociabuzzWebhookTokenHash';
const DEFAULT_HTML = '<div class="cyber-alert"><div class="custom-media" style="background-image:url(\'{{mediaUrl}}\');"></div><div class="cyber-card"><div class="cyber-header"><span class="badge bell-ring">{{amount}}</span><span class="action">{{fromText}}</span><span class="user bell-ring">{{supporter}}</span></div><div class="cyber-msg">{{message}}</div></div></div>';
const DEFAULT_TTS_VOICE = process.env.RESPONSIVEVOICE_API_KEY?.trim() && process.env.RESPONSIVEVOICE_API_SECRET?.trim()
  ? `responsive:${encodeURIComponent('Indonesian Female')}`
  : 'browser:default';

function isValidAlertHtml(html: unknown): html is string {
  return typeof html === 'string' &&
    html.length <= 30000 &&
    !/<\s*(script|iframe|object|embed|form|base|meta)\b/i.test(html) &&
    !/\bon[a-z]+\s*=/i.test(html) &&
    !/javascript\s*:/i.test(html) &&
    !/\bsrcdoc\s*=/i.test(html);
}

function isValidAlertCss(css: unknown): css is string {
  return typeof css === 'string' &&
    css.length <= 30000 &&
    !/<\s*\/?\s*(script|iframe|object|embed|form|base|meta)\b/i.test(css);
}

function isValidAlertJavascript(javascript: unknown): javascript is string {
  return typeof javascript === 'string' && javascript.length <= 15000;
}

export async function GET() {
  const config = getSetting(CONFIG_KEY, {});
  const safeConfig = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const savedCustomSoundUrl = typeof safeConfig.customSoundUrl === 'string' ? safeConfig.customSoundUrl : '';
  const customSoundUrl = savedCustomSoundUrl.startsWith('/uploads/')
    ? `/api${savedCustomSoundUrl}`
    : savedCustomSoundUrl.length <= 2048
      ? savedCustomSoundUrl
      : '';
  return NextResponse.json({
    mode: safeConfig.mode === 'custom' ? 'custom' : 'default',
    html: isValidAlertHtml(safeConfig.html) ? safeConfig.html : DEFAULT_HTML,
    css: isValidAlertCss(safeConfig.css) ? safeConfig.css : '',
    javascript: isValidAlertJavascript(safeConfig.javascript) ? safeConfig.javascript : '',
    durationMs: Number.isInteger(safeConfig.durationMs) && safeConfig.durationMs >= 1000 && safeConfig.durationMs <= 60000
      ? safeConfig.durationMs
      : 8000,
    useCustomSound: safeConfig.useCustomSound === true,
    customSoundUrl,
    ttsVoice: typeof safeConfig.ttsVoice === 'string' && safeConfig.ttsVoice.length <= 300
      ? safeConfig.ttsVoice
      : DEFAULT_TTS_VOICE,
    ttsRate: typeof safeConfig.ttsRate === 'number' && Number.isFinite(safeConfig.ttsRate) && safeConfig.ttsRate >= 0.5 && safeConfig.ttsRate <= 2
      ? safeConfig.ttsRate
      : 1,
    ttsPitch: typeof safeConfig.ttsPitch === 'number' && Number.isFinite(safeConfig.ttsPitch) && safeConfig.ttsPitch >= 0 && safeConfig.ttsPitch <= 2
      ? safeConfig.ttsPitch
      : 1,
    webhookTokenConfigured: Boolean(
      process.env.SOCIABUZZ_WEBHOOK_TOKEN ||
      getSetting(TOKEN_KEY, '') ||
      getSetting(TOKEN_HASH_KEY, ''),
    ),
  });
}

export async function POST(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Konfigurasi tidak valid.' }, { status: 400 });
    }

    const {
      mode,
      html,
      css = '',
      javascript = '',
      durationMs,
      useCustomSound = false,
      customSoundUrl = '',
      ttsVoice = DEFAULT_TTS_VOICE,
      ttsRate = 1,
      ttsPitch = 1,
      webhookToken,
    } = body;
    if (mode !== 'default' && mode !== 'custom') {
      return NextResponse.json({ error: 'Mode alert tidak valid.' }, { status: 400 });
    }
    if (!isValidAlertHtml(html)) {
      return NextResponse.json({ error: 'HTML maksimal 30.000 karakter dan tidak boleh memuat script, event handler, atau iframe.' }, { status: 400 });
    }
    if (!isValidAlertCss(css)) {
      return NextResponse.json({ error: 'CSS harus berupa teks maksimal 30.000 karakter dan tidak boleh memuat tag HTML aktif.' }, { status: 400 });
    }
    if (!isValidAlertJavascript(javascript)) {
      return NextResponse.json({ error: 'JavaScript harus berupa teks maksimal 15.000 karakter.' }, { status: 400 });
    }
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 60000) {
      return NextResponse.json({ error: 'Durasi alert harus antara 1 sampai 60 detik.' }, { status: 400 });
    }
    if (typeof useCustomSound !== 'boolean') {
      return NextResponse.json({ error: 'Pengaturan suara custom tidak valid.' }, { status: 400 });
    }
    if (
      typeof customSoundUrl !== 'string' ||
      customSoundUrl.length > 2048 ||
      (customSoundUrl !== '' && !(
        /^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(customSoundUrl) ||
        /^https:\/\/[^\s]+$/i.test(customSoundUrl)
      ))
    ) {
      return NextResponse.json({ error: 'URL suara harus berupa file unggahan atau URL HTTPS yang valid.' }, { status: 400 });
    }
    if (useCustomSound && !customSoundUrl) {
      return NextResponse.json({ error: 'Pilih file suara custom sebelum mengaktifkannya.' }, { status: 400 });
    }
    if (
      typeof ttsVoice !== 'string' ||
      ttsVoice.length > 300 ||
      (ttsVoice !== 'browser:default' && !/^(?:browser|responsive):.+$/.test(ttsVoice))
    ) {
      return NextResponse.json({ error: 'Pilihan suara TTS tidak valid.' }, { status: 400 });
    }
    if (typeof ttsRate !== 'number' || !Number.isFinite(ttsRate) || ttsRate < 0.5 || ttsRate > 2) {
      return NextResponse.json({ error: 'Kecepatan TTS harus antara 0,5 dan 2.' }, { status: 400 });
    }
    if (typeof ttsPitch !== 'number' || !Number.isFinite(ttsPitch) || ttsPitch < 0 || ttsPitch > 2) {
      return NextResponse.json({ error: 'Nada TTS harus antara 0 dan 2.' }, { status: 400 });
    }
    if (webhookToken !== undefined && webhookToken !== '' &&
      (typeof webhookToken !== 'string' || webhookToken.length < 16 || webhookToken.length > 256)) {
      return NextResponse.json({ error: 'Webhook token harus berisi 16 sampai 256 karakter.' }, { status: 400 });
    }

    setSetting(CONFIG_KEY, { mode, html, css, javascript, durationMs, useCustomSound, customSoundUrl, ttsVoice, ttsRate, ttsPitch });
    if (typeof webhookToken === 'string' && webhookToken.length > 0) {
      setSetting(TOKEN_KEY, webhookToken);
      setSetting(TOKEN_HASH_KEY, '');
    }

    return NextResponse.json({
      success: true,
      webhookTokenConfigured: Boolean(
        process.env.SOCIABUZZ_WEBHOOK_TOKEN ||
        webhookToken ||
        getSetting(TOKEN_KEY, '') ||
        getSetting(TOKEN_HASH_KEY, ''),
      ),
    });
  } catch (error) {
    console.error('[SociaBuzz] Failed to save alert config:', error);
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi SociaBuzz.' }, { status: 500 });
  }
}
