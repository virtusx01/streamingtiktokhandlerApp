import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting } from '@/lib/db';
import { publishSociabuzzEvent } from '@/lib/sociabuzz-events';

export const runtime = 'nodejs';

type WebhookLog = {
  id: string;
  mapped: Record<string, unknown>;
  payloadFields: unknown;
};

function isWebhookLog(value: unknown): value is WebhookLog {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    (value as Record<string, unknown>).mapped !== null &&
    typeof (value as Record<string, unknown>).mapped === 'object' &&
    !Array.isArray((value as Record<string, unknown>).mapped);
}

function readString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function readHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Permintaan replay tidak valid.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Permintaan replay tidak valid.' }, { status: 400 });
  }
  const logId = (body as Record<string, unknown>).logId;
  if (typeof logId !== 'string' || logId.length > 80) {
    return NextResponse.json({ error: 'ID log webhook tidak valid.' }, { status: 400 });
  }

  try {
    const storedLogs: unknown = getSetting('sociabuzzWebhookLogs', []);
    const logs = Array.isArray(storedLogs) ? storedLogs : [];
    const log = logs.find((entry): entry is WebhookLog => isWebhookLog(entry) && entry.id === logId);
    if (!log) {
      return NextResponse.json({ error: 'Log webhook tidak ditemukan.' }, { status: 404 });
    }

    const mapped = log.mapped;
    const amount = readString(mapped.amount, '0', 80);
    const supporter = readString(mapped.supporter, 'Supporter', 120);
    const message = readString(mapped.message, '', 2000);
    const mediaUrl = readHttpsUrl(mapped.mediaUrl);
    const shareUrl = readHttpsUrl(mapped.shareUrl);
    const soundUrl = readHttpsUrl(mapped.soundUrl);
    const fromText = readString(mapped.fromText, 'mengirim', 80);
    const isNsfw = mapped.isNsfw === true;

    await publishSociabuzzEvent({
      amount,
      supporter,
      message,
      mediaUrl,
      shareUrl,
      soundUrl,
      fromText,
      isNsfw,
      isReplay: true,
      timestamp: Date.now(),
      raw: {
        amount,
        supporter,
        message,
        mediaUrl,
        shareUrl,
        soundUrl,
        fromText,
        isNsfw,
        payload: { fields: log.payloadFields },
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SociaBuzz] Failed to read or replay webhook log:', error);
    return NextResponse.json({ error: 'Gagal membaca atau memutar ulang alert dari log webhook.' }, { status: 503 });
  }
}
