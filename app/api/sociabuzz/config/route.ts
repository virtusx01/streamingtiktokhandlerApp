import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting, setSetting } from '@/lib/db';

const CONFIG_KEY = 'sociabuzzAlertConfig';
const TOKEN_HASH_KEY = 'sociabuzzWebhookTokenHash';
const DEFAULT_HTML = '<div class="alert"><strong>{{supporter}}</strong><span>mengirim dukungan</span><b>Rp {{amount}}</b><p>{{message}}</p></div>';

function isValidAlertHtml(html: unknown): html is string {
  return typeof html === 'string' &&
    html.length <= 30000 &&
    !/<\s*(script|iframe|object|embed|form|base|meta)\b/i.test(html) &&
    !/\bon[a-z]+\s*=/i.test(html) &&
    !/javascript\s*:/i.test(html) &&
    !/\bsrcdoc\s*=/i.test(html);
}

export async function GET() {
  const config = getSetting(CONFIG_KEY, {});
  const safeConfig = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  return NextResponse.json({
    mode: safeConfig.mode === 'custom' ? 'custom' : 'default',
    html: isValidAlertHtml(safeConfig.html) ? safeConfig.html : DEFAULT_HTML,
    durationMs: Number.isInteger(safeConfig.durationMs) && safeConfig.durationMs >= 1000 && safeConfig.durationMs <= 60000
      ? safeConfig.durationMs
      : 8000,
    webhookTokenConfigured: Boolean(getSetting(TOKEN_HASH_KEY, '')),
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

    const { mode, html, durationMs, webhookToken } = body;
    if (mode !== 'default' && mode !== 'custom') {
      return NextResponse.json({ error: 'Mode alert tidak valid.' }, { status: 400 });
    }
    if (!isValidAlertHtml(html)) {
      return NextResponse.json({ error: 'HTML maksimal 30.000 karakter dan tidak boleh memuat script, event handler, atau iframe.' }, { status: 400 });
    }
    if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 60000) {
      return NextResponse.json({ error: 'Durasi alert harus antara 1 sampai 60 detik.' }, { status: 400 });
    }
    if (webhookToken !== undefined && webhookToken !== '' &&
      (typeof webhookToken !== 'string' || webhookToken.length < 16 || webhookToken.length > 256)) {
      return NextResponse.json({ error: 'Webhook token harus berisi 16 sampai 256 karakter.' }, { status: 400 });
    }

    setSetting(CONFIG_KEY, { mode, html, durationMs });
    if (typeof webhookToken === 'string' && webhookToken.length > 0) {
      setSetting(TOKEN_HASH_KEY, createHash('sha256').update(webhookToken).digest('hex'));
    }

    return NextResponse.json({ success: true, webhookTokenConfigured: Boolean(webhookToken || getSetting(TOKEN_HASH_KEY, '')) });
  } catch (error) {
    console.error('[SociaBuzz] Failed to save alert config:', error);
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi SociaBuzz.' }, { status: 500 });
  }
}
