import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { publishSociabuzzEvent } from '@/lib/sociabuzz-events';
import { formatSociabuzzAmount } from '@/lib/sociabuzz-amount';
import { getSetting, setSetting } from '@/lib/db';

export const runtime = 'nodejs';

type JsonObject = Record<string, unknown>;
type PayloadField = { path: string; value: string };

const WEBHOOK_LOGS_KEY = 'sociabuzzWebhookLogs';
const MAX_WEBHOOK_LOGS = 20;
const MAX_PAYLOAD_FIELDS = 32;
const SENSITIVE_PAYLOAD_KEY = /token|secret|authorization|password|cookie|email|phone|mobile/i;
const CUSTOM_PAYLOAD_KEYS = new Set([
  'real_amount', 'real_currency', 'fullname', 'note', 'gif_link', 'from_label',
  'qty', 'traktir_item', 'message', 'uuid', 'recipient_id', 'user_id',
  'amount', 'amount_value', 'nominal', 'donation_amount', 'total', 'value',
  'currency', 'currency_code', 'currencyCode', 'full_name', 'fullName',
  'supporter_name', 'supporterName', 'donor_name', 'donator_name', 'name',
  'username', 'nickname', 'display_name', 'comment', 'supporter_message',
  'supporterMessage', 'gifLink', 'mediaUrl', 'media_url', 'media',
  'image_url', 'imageUrl', 'fromText', 'from_text', 'from_label_text',
  'quantity', 'gift_name', 'item', 'item_name', 'giftName', 'sound_url',
  'soundUrl', 'audio_url', 'audioUrl', 'alert_sound', 'alertSound',
  'notification_sound', 'notificationSound', 'sound', 'audio', 'sound_file',
  'soundFile', 'audio_file', 'audioFile', 'alert_audio', 'alertAudio',
  'alert_sound_url', 'alertSoundUrl', 'notification_audio', 'notificationAudio',
]);

function selectCustomPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 32).map(selectCustomPayload);
  }

  if (value && typeof value === 'object') {
    const selected = Object.entries(value as JsonObject)
      .filter(([key]) => !SENSITIVE_PAYLOAD_KEY.test(key))
      .flatMap(([key, item]) => {
        if (CUSTOM_PAYLOAD_KEYS.has(key)) {
          return [[key, item && typeof item === 'object' ? selectCustomPayload(item) : item]];
        }
        if (!item || typeof item !== 'object') return [];
        const nested = selectCustomPayload(item);
        return Object.keys(nested as JsonObject).length > 0 ? [[key, nested]] : [];
      });
    return Object.fromEntries(selected);
  }

  return value;
}

function summarizePayload(value: unknown): PayloadField[] {
  const fields: PayloadField[] = [];

  function visit(current: unknown, path: string, depth: number) {
    if (fields.length >= MAX_PAYLOAD_FIELDS || depth > 4 || current === null) return;

    if (Array.isArray(current)) {
      current.slice(0, 8).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }

    if (typeof current === 'object') {
      for (const [key, item] of Object.entries(current as JsonObject)) {
        if (SENSITIVE_PAYLOAD_KEY.test(key)) continue;
        visit(item, path ? `${path}.${key}` : key, depth + 1);
        if (fields.length >= MAX_PAYLOAD_FIELDS) break;
      }
      return;
    }

    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      fields.push({ path: path.slice(0, 120), value: String(current).slice(0, 160) });
    }
  }

  visit(value, '', 0);
  return fields;
}

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: 'SociaBuzz webhook callback aktif.',
    method: 'POST',
  });
}

function objectOrEmpty(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function collectNestedObjects(value: unknown, depth = 0, result: JsonObject[] = []): JsonObject[] {
  if (depth > 6 || result.length >= 64 || !value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 16)) collectNestedObjects(item, depth + 1, result);
    return result;
  }

  result.push(value as JsonObject);
  for (const item of Object.values(value as JsonObject)) {
    collectNestedObjects(item, depth + 1, result);
    if (result.length >= 64) break;
  }
  return result;
}

function firstValue(objects: JsonObject[], keys: string[]): unknown {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === 'string' || typeof value === 'number') return value;
    }
  }
  return undefined;
}

function firstHttpsUrl(objects: JsonObject[], keys: string[]): string {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const findUrl = (value: unknown, depth: number): string => {
    if (depth > 5 || !value || typeof value !== 'object' || Array.isArray(value)) return '';

    for (const [key, item] of Object.entries(value as JsonObject)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        if (typeof item === 'string') {
          try {
            const url = new URL(item);
            if (url.protocol === 'https:') return url.toString();
          } catch {
            // Ignore non-URL values and inspect nested source fields below.
          }
        }
        if (item && typeof item === 'object') {
          const nestedUrl = findUrl(item, depth + 1);
          if (nestedUrl) return nestedUrl;
          for (const [nestedKey, nestedValue] of Object.entries(item as JsonObject)) {
            if (!['url', 'src', 'link', 'file'].includes(nestedKey.toLowerCase()) || typeof nestedValue !== 'string') continue;
            try {
              const url = new URL(nestedValue);
              if (url.protocol === 'https:') return url.toString();
            } catch {
              continue;
            }
          }
        }
      }

      const nestedUrl = findUrl(item, depth + 1);
      if (nestedUrl) return nestedUrl;
    }
    return '';
  };

  for (const object of objects) {
    const url = findUrl(object, 0);
    if (url) return url;
  }
  return '';
}

function valueAsString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function getPresentedTokenCandidates(req: Request, bodyObject?: unknown): string[] {
  const candidates: string[] = [];

  const collect = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (!candidates.includes(trimmed)) candidates.push(trimmed);
    }
  };

  const authorization = req.headers.get('authorization') || '';
  if (authorization) {
    if (/^(Bearer|Token)\s+/i.test(authorization)) {
      collect(authorization.replace(/^(Bearer|Token)\s+/i, ''));
    }
    collect(authorization);
  }

  const headerNames = [
    'x-webhook-token', 'x-webhook-secret', 'x-sociabuzz-token', 'x-sociabuzz-webhook-token',
    'x-hook-token', 'x-api-key', 'x-token', 'x-signature', 'x-sbwhook', 'sbwhook'
  ];
  for (const name of headerNames) {
    collect(req.headers.get(name));
  }

  const query = new URL(req.url).searchParams;
  collect(query.get('token'));
  collect(query.get('webhook_token'));
  collect(query.get('webhookToken'));
  collect(query.get('api_key'));
  collect(query.get('apikey'));
  collect(query.get('secret'));
  collect(query.get('sbwhook'));

  if (bodyObject && typeof bodyObject === 'object' && !Array.isArray(bodyObject)) {
    const body = bodyObject as Record<string, unknown>;
    collect(body.token);
    collect(body.webhookToken);
    collect(body.webhook_token);
    collect(body.webhook_secret);
    collect(body.api_key);
    collect(body.apiKey);
    collect(body.authorization);
    collect(body.secret);
    collect(body.sbwhook);
  }

  return candidates;
}

function tokenMatches(presentedToken: string, expectedToken: unknown): boolean {
  if (!presentedToken || typeof expectedToken !== 'string' || !expectedToken) return false;
  const presentedBytes = Buffer.from(presentedToken, 'utf8');
  const expectedBytes = Buffer.from(expectedToken, 'utf8');
  return presentedBytes.length === expectedBytes.length && timingSafeEqual(presentedBytes, expectedBytes);
}

function isLegacyHashMatch(presentedToken: string, expectedHash: unknown): boolean {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const presentedHash = createHash('sha256').update(presentedToken).digest();
  const configuredHash = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(presentedHash, configuredHash);
}

export async function POST(req: Request) {
  const expectedTokens = [...new Set([
    process.env.SOCIABUZZ_WEBHOOK_TOKEN,
    getSetting('sociabuzzWebhookToken', ''),
  ].filter((token): token is string => typeof token === 'string' && token.length > 0))];
  const legacyTokenHash = getSetting('sociabuzzWebhookTokenHash', '');
  if (expectedTokens.length === 0 && !legacyTokenHash) {
    return NextResponse.json({ error: 'Webhook SociaBuzz belum dikonfigurasi oleh admin.' }, { status: 503 });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > 32768) {
      return NextResponse.json({ error: 'Payload webhook melebihi batas 32 KB.' }, { status: 413 });
    }

    let parsedBody: unknown = {};
    const contentType = req.headers.get('content-type') || '';
    if (rawBody.trim()) {
      if (contentType.includes('application/x-www-form-urlencoded')) {
        parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
      } else {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = {};
        }
      }
    }

    const tokenCandidates = getPresentedTokenCandidates(req, parsedBody);
    const isValid = tokenCandidates.some(candidate =>
      expectedTokens.some(expectedToken => tokenMatches(candidate, expectedToken)) ||
      (legacyTokenHash && isLegacyHashMatch(candidate, legacyTokenHash))
    );
    if (!isValid) {
      return NextResponse.json({ error: 'Webhook token tidak valid.' }, { status: 401 });
    }

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Payload webhook harus berupa object JSON.' }, { status: 400 });
    }

    const root = objectOrEmpty(parsedBody);
    const data = objectOrEmpty(root.data);
    const donation = objectOrEmpty(root.donation);
    const event = objectOrEmpty(root.event);
    const supporterData = objectOrEmpty(root.supporter);
    const amountData = objectOrEmpty(root.amount);
    const donationAmountData = objectOrEmpty(donation.amount);
    const objects = [...new Set([
      root,
      data,
      donation,
      event,
      supporterData,
      amountData,
      donationAmountData,
      ...collectNestedObjects(root),
    ])];

    const realAmount = firstValue(objects, ['real_amount', 'amount', 'amount_value', 'nominal', 'donation_amount', 'total', 'value']);
    const realCurrency = firstValue(objects, ['real_currency', 'currency', 'currency_code', 'currencyCode']);
    const qty = firstValue(objects, ['qty', 'quantity']);
    const traktirItem = firstValue(objects, ['traktir_item', 'gift_name', 'item', 'item_name', 'giftName']);
    const formattedAmount = formatSociabuzzAmount(
      realAmount,
      realCurrency,
      qty,
      traktirItem,
      firstValue(objects, ['amount', 'amount_value', 'nominal', 'donation_amount', 'total', 'value']),
    );

    const supporter = valueAsString(
      firstValue(objects, ['fullname', 'full_name', 'fullName', 'supporter_name', 'supporterName', 'donor_name', 'donator_name', 'name', 'username', 'nickname', 'display_name']),
      'Supporter',
      120,
    );
    const message = valueAsString(
      firstValue(objects, ['note', 'message', 'comment', 'supporter_message', 'supporterMessage']),
      '',
      2000,
    );
    const mediaUrl = valueAsString(
      firstValue(objects, ['gif_link', 'gifLink', 'mediaUrl', 'media_url', 'media', 'image_url', 'imageUrl']),
      '',
      2000,
    );
    const soundUrl = firstHttpsUrl(objects, [
      'sound_url', 'soundUrl', 'audio_url', 'audioUrl', 'alert_sound', 'alertSound',
      'notification_sound', 'notificationSound', 'sound', 'audio', 'sound_file',
      'soundFile', 'audio_file', 'audioFile', 'alert_audio', 'alertAudio',
      'alert_sound_url', 'alertSoundUrl', 'notification_audio', 'notificationAudio',
    ]);
    const fromText = valueAsString(
      firstValue(objects, ['from_label', 'fromText', 'from_text', 'from_label_text']),
      'mengirim',
      80,
    );

    const receivedAt = new Date().toISOString();
    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt,
      eventType: valueAsString(firstValue(objects, ['event_type', 'eventType', 'type', 'action']), 'donation', 80),
      payloadFields: summarizePayload(parsedBody),
      mapped: { amount: formattedAmount, supporter, message, mediaUrl, soundUrl, fromText },
    };
    const existingLogs: unknown = getSetting(WEBHOOK_LOGS_KEY, []);
    const logs = Array.isArray(existingLogs) ? existingLogs : [];
    setSetting(WEBHOOK_LOGS_KEY, [logEntry, ...logs].slice(0, MAX_WEBHOOK_LOGS));

    const rawAlert = {
      amount: formattedAmount,
      supporter: firstValue(objects, ['fullname', 'full_name', 'fullName', 'supporter_name', 'supporterName', 'donor_name', 'donator_name', 'name', 'username', 'nickname', 'display_name']) ?? null,
      message: firstValue(objects, ['note', 'message', 'comment', 'supporter_message', 'supporterMessage']) ?? null,
      mediaUrl: firstValue(objects, ['gif_link', 'gifLink', 'mediaUrl', 'media_url', 'media', 'image_url', 'imageUrl']) ?? null,
      soundUrl: soundUrl || null,
      fromText: firstValue(objects, ['from_label', 'fromText', 'from_text', 'from_label_text']) ?? null,
      payload: selectCustomPayload(parsedBody),
    };

    try {
      await publishSociabuzzEvent({
        amount: formattedAmount,
        supporter,
        message,
        mediaUrl,
        soundUrl,
        fromText,
        raw: rawAlert,
        timestamp: Date.now(),
      });
    } catch (eventError) {
      console.error('[SociaBuzz] Failed to queue webhook donation:', eventError);
      return NextResponse.json({ error: 'Gagal meneruskan notifikasi donasi ke widget.' }, { status: 503 });
    }
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    console.error('[SociaBuzz] Invalid webhook payload:', error);
    return NextResponse.json({ error: 'Payload webhook harus berupa JSON yang valid.' }, { status: 400 });
  }
}
