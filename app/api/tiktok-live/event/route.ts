import { NextRequest, NextResponse } from 'next/server';
import {
  emitGiftEvent,
  emitCommentEvent,
  emitLikeEvent,
  emitJoinEvent,
  emitFollowEvent,
  emitFanEvent,
  emitShareEvent,
  emitStatusEvent,
} from '@/lib/events';
import { isAuthorizedTikTokListener } from '@/lib/listener-auth';
import { POST as handleBrowserListener } from '@/app/api/browser-listener/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['gift', 'comment', 'like', 'join', 'follow', 'fan', 'share', 'status', 'frames']);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getType(body: Record<string, unknown>) {
  const rawType = typeof body.type === 'string' ? body.type : typeof body.event === 'string' ? body.event : null;
  return rawType ? rawType.toLowerCase() : null;
}

export async function handleTiktokLiveEventRequest(req: NextRequest) {
  try {
    if (!isAuthorizedTikTokListener(req)) {
      return NextResponse.json({ error: 'Token listener tidak valid.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType = getType(body as Record<string, unknown>);
    const data = (body as Record<string, unknown>).data ?? (body as Record<string, unknown>).payload ?? body;

    if (eventType === 'frames' || (isObject(data) && 'frames' in data)) {
      const frames = Array.isArray(data?.frames) ? data.frames : Array.isArray((body as any).frames) ? (body as any).frames : [];
      const username = typeof data?.username === 'string' ? data.username : typeof (body as any).username === 'string' ? (body as any).username : '';
      const forwarded = new Request(new URL(req.url), {
        method: 'POST',
        headers: {
          authorization: req.headers.get('authorization') || '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'frames', username, frames }),
      });
      return handleBrowserListener(forwarded);
    }

    if (!eventType || !ALLOWED_TYPES.has(eventType)) {
      return NextResponse.json({ error: 'Unsupported or missing type' }, { status: 400 });
    }

    const payload = isObject(data) ? { ...data } : { raw: data };
    (payload as Record<string, unknown>).__callbackReceivedAt = Date.now();

    switch (eventType) {
      case 'gift':
        emitGiftEvent(payload);
        break;
      case 'comment':
        emitCommentEvent(payload);
        break;
      case 'like':
        emitLikeEvent(payload);
        break;
      case 'join':
        emitJoinEvent(payload);
        break;
      case 'follow':
        emitFollowEvent(payload);
        break;
      case 'fan':
        emitFanEvent(payload);
        break;
      case 'share':
        emitShareEvent(payload);
        break;
      case 'status':
        emitStatusEvent(payload);
        break;
      default:
        return NextResponse.json({ error: 'Unhandled type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, type: eventType });
  } catch (err: any) {
    console.error('[api/tiktok-live/event] Error processing event:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  return handleTiktokLiveEventRequest(req);
}
