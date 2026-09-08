import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { listenerStatus } from '@/lib/listener-state';
import { WebcastPushConnection } from 'tiktok-live-connector';

interface LiveCacheEntry {
  isLive: boolean;
  statusText: string;
  timestamp: number;
}

const liveCache = new Map<string, LiveCacheEntry>();
const CACHE_TTL_MS = 15000; // 15 seconds cache to avoid TikTok 429 rate limit

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paramUser = searchParams.get('username');

    let username = paramUser ? paramUser.replace(/^@/, '').trim() : '';
    if (!username) {
      const rawUsername = getSetting('tiktokUsername', '@onlyvirtus');
      if (rawUsername) {
        try {
          const parsed = JSON.parse(rawUsername);
          username = String(parsed).replace(/^@/, '').trim();
        } catch {
          username = String(rawUsername).replace(/^@/, '').trim();
        }
      }
    }
    if (!username) username = (listenerStatus.username || 'onlyvirtus').replace(/^@/, '');

    const isListenerMatching = (listenerStatus.username || '').toLowerCase().replace(/^@/, '') === username.toLowerCase();

    // 1. If local listener is active and connected to this user right now
    if (listenerStatus.running && listenerStatus.connected && isListenerMatching) {
      return NextResponse.json({
        is_live: true,
        connected: true,
        username,
        roomId: listenerStatus.roomId,
        statusText: listenerStatus.statusText || `Terhubung ke Live @${username}`
      });
    }

    // 2. Check if Supabase shows active connection from local runner daemon (cloud/serverless view)
    const cloudRunning = getSetting('listener_running', 'false') === 'true';
    const cloudHeartbeat = Number(getSetting('listener_last_heartbeat', '0'));
    const isHeartbeatFresh = Date.now() - cloudHeartbeat < 60000;

    if (cloudRunning && isHeartbeatFresh) {
      const cloudUser = getSetting('listener_username', '').replace(/^@/, '').toLowerCase();
      if (!cloudUser || cloudUser === username.toLowerCase()) {
        const cloudConnected = getSetting('listener_connected', 'false') === 'true';
        const cloudIsLive = getSetting('listener_is_live', 'false') === 'true';
        const cloudStatusText = getSetting('listener_status_text', '');

        return NextResponse.json({
          is_live: cloudIsLive,
          connected: cloudConnected,
          username,
          statusText: cloudStatusText || (cloudConnected ? `Terhubung ke Live @${username}` : `@${username} sedang Standby`)
        });
      }
    }

    // 3. If listener is running locally
    if (listenerStatus.running && isListenerMatching) {
      return NextResponse.json({
        is_live: Boolean(listenerStatus.isLive),
        connected: Boolean(listenerStatus.connected),
        username,
        roomId: listenerStatus.roomId,
        statusText: listenerStatus.statusText || (listenerStatus.connected ? `Terhubung ke Live @${username}` : `@${username} sedang Standby`)
      });
    }

    // 4. Check cache before issuing external request
    const cached = liveCache.get(username.toLowerCase());
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return NextResponse.json({
        is_live: cached.isLive,
        connected: false,
        username,
        statusText: cached.statusText
      });
    }

    // 5. Query TikTok Live Connector
    try {
      const conn = new WebcastPushConnection(username);
      const isLive = await conn.fetchIsLive();
      const statusText = isLive ? `Live sedang berlangsung` : `@${username} sedang Offline`;

      liveCache.set(username.toLowerCase(), {
        isLive: Boolean(isLive),
        statusText,
        timestamp: Date.now()
      });

      return NextResponse.json({
        is_live: Boolean(isLive),
        connected: false,
        username,
        statusText
      });
    } catch {
      return NextResponse.json({
        is_live: false,
        connected: false,
        username,
        statusText: `@${username} sedang Offline`
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      is_live: false,
      connected: false,
      username: 'onlyvirtus',
      statusText: 'Offline',
      error: err?.message
    });
  }
}
