import { NextRequest, NextResponse } from 'next/server';
import { emitGiftEvent, emitCommentEvent, emitLikeEvent, emitJoinEvent, emitFollowEvent, emitFanEvent, emitShareEvent, emitStatusEvent } from '@/lib/events';
import { isAuthorizedTikTokListener } from '@/lib/listener-auth';
import { POST as handleBrowserListener } from '@/app/api/browser-listener/route';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['gift','comment','like','join','follow','fan','share','status']);

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
  try {
    if (!isAuthorizedTikTokListener(req)) {
      return NextResponse.json({ error: 'Token listener tidak valid.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const rawType = typeof body.type === 'string' ? body.type : (typeof body.event === 'string' ? body.event : null);
    const type = rawType ? rawType.toLowerCase() : null;
    const data = body.data ?? (body.payload ?? body);

    if (type === 'frames' || data?.frames) {
      const frames = Array.isArray(data?.frames) ? data.frames : Array.isArray(body.frames) ? body.frames : [];
      const username = typeof data?.username === 'string' ? data.username : (typeof body.username === 'string' ? body.username : '');
      const forwarded = new Request(new URL(req.url), {
        method: 'POST',
        headers: {
          authorization: req.headers.get('authorization') || '',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'frames', username, frames })
      });
      return handleBrowserListener(forwarded);
    }

    if (!type || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'Unsupported or missing type' }, { status: 400 });
    }

    const payload = typeof data === 'object' && data !== null ? data : { raw: data };
    (payload as any).__callbackReceivedAt = Date.now();

    switch (type) {
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/widget/callback] Error processing callback:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
