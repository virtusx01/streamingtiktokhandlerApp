import { NextRequest, NextResponse } from 'next/server';
import { emitGiftEvent, emitCommentEvent, emitLikeEvent, emitJoinEvent, emitFollowEvent, emitFanEvent, emitShareEvent, emitStatusEvent } from '@/lib/events';

export const runtime = 'edge';

const ALLOWED_TYPES = new Set(['gift','comment','like','join','follow','fan','share','status']);

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Accept either { type: 'gift', data: { ... } } or a raw payload with 'type' at root
    const type = (typeof body.type === 'string' ? body.type.toLowerCase() : (typeof body.event === 'string' ? body.event.toLowerCase() : null));
    const data = body.data ?? (body.payload ?? body);

    if (!type || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'Unsupported or missing type' }, { status: 400 });
    }

    // Basic hygiene: ensure data is an object
    const payload = typeof data === 'object' && data !== null ? data : { raw: data };

    // Attach received-at timestamp for traceability
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
