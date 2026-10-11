import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { emitSociabuzzEvent } from '@/lib/events';
import { getSetting } from '@/lib/db';

export const runtime = 'nodejs';

type JsonObject = Record<string, unknown>;

function objectOrEmpty(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
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

function valueAsString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function getPresentedToken(req: Request): string {
  const authorization = req.headers.get('authorization') || '';
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return req.headers.get('x-webhook-token') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-sociabuzz-token') ||
    req.headers.get('x-hook-token') ||
    req.headers.get('x-api-key') ||
    '';
}

function tokenMatches(presentedToken: string, expectedHash: unknown): boolean {
  if (!presentedToken || typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const presentedHash = createHash('sha256').update(presentedToken).digest();
  const configuredHash = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(presentedHash, configuredHash);
}

export async function POST(req: Request) {
  const expectedHash = getSetting('sociabuzzWebhookTokenHash', '');
  if (!expectedHash) {
    return NextResponse.json({ error: 'Webhook SociaBuzz belum dikonfigurasi oleh admin.' }, { status: 503 });
  }
  if (!tokenMatches(getPresentedToken(req), expectedHash)) {
    return NextResponse.json({ error: 'Webhook token tidak valid.' }, { status: 401 });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > 32768) {
      return NextResponse.json({ error: 'Payload webhook melebihi batas 32 KB.' }, { status: 413 });
    }

    const parsedBody: unknown = JSON.parse(rawBody);
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
    const objects = [root, data, donation, event, supporterData, amountData, donationAmountData];
    const amount = valueAsString(
      firstValue(objects, ['amount', 'amount_value', 'nominal', 'donation_amount', 'total', 'value']),
      '0',
      80,
    );
    const supporter = valueAsString(
      firstValue(objects, ['supporter_name', 'supporterName', 'donor_name', 'donator_name', 'name', 'username', 'nickname', 'display_name']),
      'Supporter',
      120,
    );
    const message = valueAsString(
      firstValue(objects, ['message', 'note', 'comment', 'supporter_message', 'supporterMessage']),
      '',
      2000,
    );
    const mediaUrl = valueAsString(
      firstValue(objects, ['mediaUrl', 'media_url', 'media']),
      '',
      2000,
    );

    emitSociabuzzEvent({ amount, supporter, message, mediaUrl, timestamp: Date.now() });
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    console.error('[SociaBuzz] Invalid webhook payload:', error);
    return NextResponse.json({ error: 'Payload webhook harus berupa JSON yang valid.' }, { status: 400 });
  }
}
