import { NextResponse } from 'next/server';
import { subscribeToGiftEvents, subscribeToCommentEvents, subscribeToLikeEvents, subscribeToJoinEvents, subscribeToFollowEvents, subscribeToFanEvents, subscribeToShareEvents } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const { signal } = req;

  const stream = new ReadableStream({
    start(controller) {
      const clientId = Math.random().toString(36).substring(7);
      console.log(`[SSE] NEW CLIENT CONNECTED: ${clientId}`);
      let isClosed = false;
      let keepAliveInterval: NodeJS.Timeout | null = null;
      const unsubscribers: (() => void)[] = [];

      const safeCleanup = () => {
        if (isClosed) return;
        isClosed = true;
        console.log(`[SSE] CLIENT DISCONNECTED: ${clientId}`);
        
        for (const unsub of unsubscribers) {
          try { unsub(); } catch (e) {}
        }
        
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }

        try {
          controller.close();
        } catch (e) {}
      };

      // Use Request Signal for more reliable cleanup in Next.js
      signal.addEventListener('abort', () => {
        console.log(`[SSE] Request aborted for ${clientId}`);
        safeCleanup();
      });

      const safeSend = (payload: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          safeCleanup();
        }
      };

      // Subscribe to all events
      unsubscribers.push(subscribeToGiftEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'gift', data })}\n\n`)));
      unsubscribers.push(subscribeToCommentEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'comment', data })}\n\n`)));
      unsubscribers.push(subscribeToLikeEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'like', data })}\n\n`)));
      unsubscribers.push(subscribeToJoinEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'join', data })}\n\n`)));
      unsubscribers.push(subscribeToFollowEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'follow', data })}\n\n`)));
      unsubscribers.push(subscribeToFanEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'fan', data })}\n\n`)));
      unsubscribers.push(subscribeToShareEvents((data) => safeSend(`data: ${JSON.stringify({ type: 'share', data })}\n\n`)));

      // Keep-alive heartbeat (10s for better browser persistence)
      keepAliveInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch (err) {
          console.warn(`[SSE] Keep-alive failed for ${clientId}, cleaning up.`);
          safeCleanup();
        }
      }, 10000);
    },
    cancel() {
      // ReadableStream cancel is less reliable than signal.abort but we keep it here just in case
      console.log("[SSE] Stream cancelled via ReadableStream");
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
