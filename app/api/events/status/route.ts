import { NextResponse } from 'next/server';
import { EventEmitter } from 'events';

export const dynamic = 'force-dynamic';

export async function GET() {
  const globalWithEmitter = global as typeof globalThis & {
    __tiktok_emitter?: EventEmitter;
  };

  const emitter = globalWithEmitter.__tiktok_emitter;
  const giftListeners = emitter?.listenerCount('gift_event') || 0;
  const commentListeners = emitter?.listenerCount('comment_event') || 0;

  return NextResponse.json({
    connected: giftListeners > 0,
    listeners: {
        gift: giftListeners,
        comment: commentListeners
    }
  });
}
