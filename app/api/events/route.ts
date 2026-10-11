import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { subscribeToGiftEvents, subscribeToCommentEvents, subscribeToLikeEvents, subscribeToJoinEvents, subscribeToFollowEvents, subscribeToFanEvents, subscribeToShareEvents, subscribeToStatusEvents, subscribeToSociabuzzEvents } from '@/lib/events';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const isAdmin = await isAdminActionRequest(req);
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

      const sendEvent = (type: string, data: unknown) => {
        let eventData = data;
        if (data && typeof data === 'object') {
          const {
            actions: _actions,
            adbCommandId: _adbCommandId,
            adbStartToken: _adbStartToken,
            ...publicData
          } = data as Record<string, unknown>;
          eventData = publicData;
        }
        safeSend(`data: ${JSON.stringify({ type, data: eventData, isAdmin })}\n\n`);
      };

      // Subscribe to all events
      unsubscribers.push(subscribeToGiftEvents((data) => sendEvent('gift', data)));
      unsubscribers.push(subscribeToCommentEvents((data) => sendEvent('comment', data)));
      unsubscribers.push(subscribeToLikeEvents((data) => sendEvent('like', data)));
      unsubscribers.push(subscribeToJoinEvents((data) => sendEvent('join', data)));
      unsubscribers.push(subscribeToFollowEvents((data) => sendEvent('follow', data)));
      unsubscribers.push(subscribeToFanEvents((data) => sendEvent('fan', data)));
      unsubscribers.push(subscribeToShareEvents((data) => sendEvent('share', data)));
      unsubscribers.push(subscribeToStatusEvents((data) => sendEvent('status', data)));
      unsubscribers.push(subscribeToSociabuzzEvents((data) => sendEvent('sociabuzz', data)));

      void (async () => {
        try {
          const pendingNotifications = await prisma.$queryRaw<Array<{
            id: string;
            type: string;
            data: unknown;
          }>>(Prisma.sql`
            select
              id::text as id,
              metadata->'widgetEvent'->>'type' as type,
              metadata->'widgetEvent'->'data' as data
            from public.adb_commands
            where status = 'completed'
              and metadata @> '{"widgetAckRequired": true, "widgetNotificationAck": false}'::jsonb
            order by completed_at asc
          `);

          for (const notification of pendingNotifications) {
            if (
              (notification.type === 'gift' || notification.type === 'like') &&
              typeof notification.data === 'object' &&
              notification.data !== null &&
              !Array.isArray(notification.data)
            ) {
              sendEvent(notification.type, {
                ...(notification.data as Record<string, unknown>),
                widgetNotificationId: notification.id,
              });
            }
          }
        } catch (error) {
          console.error('[SSE] Failed to replay pending ADB reward notifications:', error);
        }
      })();

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
