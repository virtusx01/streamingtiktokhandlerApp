import { NextResponse } from 'next/server';
import {
  deserializeWebSocketMessage,
  simplifyObject,
  type WebcastEventMessage
} from 'tiktok-live-connector';
import {
  emitCommentEvent,
  emitFollowEvent,
  emitJoinEvent,
  emitShareEvent,
  emitStatusEvent
} from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';
import { setSetting } from '@/lib/db';
import { listenerStatus, updateListenerStatus } from '@/lib/listener-state';
import { isAuthorizedTikTokListener } from '@/lib/listener-auth';
import { tiktokNodeListener } from '@/lib/tiktok-node-listener';
import { POST as processGiftEvent } from '@/app/api/gift-event/route';
import { POST as processLikeEvent } from '@/app/api/like-event/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supportedMessageTypes = new Set([
  'WebcastChatMessage',
  'WebcastMemberMessage',
  'WebcastGiftMessage',
  'WebcastLikeMessage',
  'WebcastSocialMessage'
]);

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function updateBridgeStatus(username: string, connected: boolean, statusText: string) {
  const updated = updateListenerStatus({
    running: connected,
    connected,
    isLive: connected,
    username,
    statusText
  });

  setSetting('listener_running', String(connected));
  setSetting('listener_connected', String(connected));
  setSetting('listener_is_live', String(connected));
  setSetting('listener_username', username);
  setSetting('listener_status_text', statusText);
  setSetting('listener_last_heartbeat', String(Date.now()));
  emitStatusEvent(updated);
  return updated;
}

async function forwardToEventRoute(
  handler: (request: Request) => Promise<Response>,
  originalRequest: Request,
  payload: Record<string, unknown>
) {
  const response = await handler(new Request(originalRequest.url, {
    method: 'POST',
    headers: {
      Authorization: originalRequest.headers.get('authorization') || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }));
  if (!response.ok) {
    throw new Error(`Event handler returned HTTP ${response.status}.`);
  }
}

async function processFrame(frameBase64: string, request: Request) {
  const decodedFrame = await deserializeWebSocketMessage(Buffer.from(frameBase64, 'base64'));
  const messages = decodedFrame.protoMessageFetchResult?.messages || [];

  for (const message of messages) {
    if (!message.decodedData || !supportedMessageTypes.has(message.type)) continue;
    const messageType = message.type as keyof WebcastEventMessage;
    const eventData = objectValue(simplifyObject(messageType, message.decodedData.data));
    const uniqueId = stringValue(eventData.uniqueId, 'viewer');
    const nickname = stringValue(eventData.nickname, uniqueId || 'Viewer');
    const messageId = stringValue(eventData.msgId, `${Date.now()}-${Math.random()}`);

    if (message.type === 'WebcastChatMessage') {
      const eventId = `comment_${messageId}`;
      if (!isDuplicate(eventId, 5000)) {
        emitCommentEvent({
          comment: stringValue(eventData.comment),
          nickname,
          username: uniqueId,
          images: [],
          eventId
        });
      }
      continue;
    }

    if (message.type === 'WebcastGiftMessage') {
      const giftDetails = objectValue(eventData.giftDetails);
      const giftName = stringValue(eventData.giftName, stringValue(giftDetails.giftName, 'Hadiah'));
      const giftId = stringValue(eventData.giftId, '0');
      const repeatCount = Number(eventData.repeatCount || 1);
      const eventId = `gift_${uniqueId}_${stringValue(eventData.groupId, messageId)}_${repeatCount}`;
      await forwardToEventRoute(processGiftEvent, request, {
        giftName,
        nickname,
        username: uniqueId,
        repeatCount,
        repeatEnd: Boolean(eventData.repeatEnd),
        eventId,
        msgId: stringValue(eventData.groupId, messageId),
        giftId,
        giftIcon: stringValue(eventData.giftPictureUrl),
        timestamp: Date.now()
      });
      continue;
    }

    if (message.type === 'WebcastLikeMessage') {
      await forwardToEventRoute(processLikeEvent, request, {
        likeCount: Number(eventData.likeCount || eventData.totalLikeCount || 1),
        nickname,
        username: uniqueId,
        eventId: `like_${uniqueId}_${messageId}`
      });
      continue;
    }

    if (message.type === 'WebcastMemberMessage') {
      const eventId = `join_${messageId}`;
      if (!isDuplicate(eventId, 5000)) emitJoinEvent({ nickname, username: uniqueId, eventId });
      continue;
    }

    const displayType = stringValue(eventData.displayType).toLowerCase();
    const eventId = `social_${messageId}`;
    if (isDuplicate(eventId, 5000)) continue;
    if (displayType.includes('follow')) {
      emitFollowEvent({ nickname, username: uniqueId, eventId: `follow_${messageId}` });
    } else if (displayType.includes('share')) {
      emitShareEvent({ nickname, username: uniqueId, eventId: `share_${messageId}` });
    }
  }
}

export async function POST(req: Request) {
  if (!isAuthorizedTikTokListener(req)) {
    return NextResponse.json({ error: 'Token listener tidak valid.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const username = String(body.username || listenerStatus.username || '').replace(/^@/, '').trim();
    if (!username) return NextResponse.json({ error: 'Username TikTok wajib diisi.' }, { status: 400 });

    if (action === 'start') {
      if (tiktokNodeListener.isActive()) await tiktokNodeListener.stop();
      const status = updateBridgeStatus(username, true, `Mendengarkan tab TikTok LIVE @${username}`);
      return NextResponse.json({ ok: true, status });
    }

    if (action === 'heartbeat') {
      const status = updateBridgeStatus(username, true, `Mendengarkan tab TikTok LIVE @${username}`);
      return NextResponse.json({ ok: true, status });
    }

    if (action === 'stop') {
      const status = updateBridgeStatus(username, false, String(body.statusText || 'Listener browser dihentikan.'));
      return NextResponse.json({ ok: true, status });
    }

    if (action !== 'frames' || !Array.isArray(body.frames) || body.frames.length > 12) {
      return NextResponse.json({ error: 'Permintaan frame tidak valid.' }, { status: 400 });
    }

    let totalEncodedBytes = 0;
    for (const frame of body.frames) {
      if (
        typeof frame !== 'string' ||
        frame.length === 0 ||
        frame.length > 1400000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(frame)
      ) {
        return NextResponse.json({ error: 'Format frame WebSocket tidak valid.' }, { status: 400 });
      }
      totalEncodedBytes += frame.length;
    }
    if (totalEncodedBytes > 2500000) {
      return NextResponse.json({ error: 'Batch frame melebihi batas ukuran.' }, { status: 413 });
    }

    updateBridgeStatus(username, true, `Menerima event dari tab TikTok LIVE @${username}`);
    for (const frame of body.frames) {
      await processFrame(frame, req);
    }
    return NextResponse.json({ ok: true, processed: body.frames.length });
  } catch (error) {
    console.error('[BrowserListener] Failed to process TikTok LIVE frames:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memproses frame TikTok.' },
      { status: 500 }
    );
  }
}
