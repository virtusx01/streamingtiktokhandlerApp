import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting, setSetting } from '@/lib/db';

const CONFIG_KEY = 'sociabuzzAlertConfig';
const TOKEN_KEY = 'sociabuzzWebhookToken';
const TOKEN_HASH_KEY = 'sociabuzzWebhookTokenHash';
const DEFAULT_HTML = '<div class="cyber-alert"><div class="custom-media" style="background-image:url(\'{{mediaUrl}}\');"></div><div class="cyber-card"><div class="cyber-header"><span class="badge bell-ring">{{amount}}</span><span class="action">{{fromText}}</span><span class="user bell-ring">{{supporter}}</span></div><div class="cyber-msg">{{message}}</div></div></div>';

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
    if (webhookToken !== undefined && webhookToken !== '' &&
      (typeof webhookToken !== 'string' || webhookToken.length < 16 || webhookToken.length > 256)) {
      return NextResponse.json({ error: 'Webhook token harus berisi 16 sampai 256 karakter.' }, { status: 400 });
    }

    setSetting(CONFIG_KEY, { mode, html, css, javascript, durationMs, useCustomSound, customSoundUrl });
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
