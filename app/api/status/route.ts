import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { listenerStatus } from '@/lib/listener-state';
import { WebcastPushConnection } from 'tiktok-live-connector';

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
    if (!username) username = listenerStatus.username || 'onlyvirtus';

    // If listener is connected to this user right now, it's definitely LIVE
    const isListenerMatching = listenerStatus.username.toLowerCase() === username.toLowerCase();
    if (listenerStatus.running && listenerStatus.connected && isListenerMatching) {
      return NextResponse.json({
        is_live: true,
        connected: true,
        username,
        roomId: listenerStatus.roomId,
        statusText: listenerStatus.statusText || `Terhubung ke Live @${username}`
      });
    }

    // Check live status directly using tiktok-live-connector (Pure Node.js, zero Python)
    try {
      const conn = new WebcastPushConnection(username);
      const isLive = await conn.fetchIsLive();

      return NextResponse.json({
        is_live: Boolean(isLive),
        connected: isListenerMatching && Boolean(listenerStatus.connected),
        username,
        statusText: isLive
          ? `Live sedang berlangsung`
          : (isListenerMatching && listenerStatus.statusText ? listenerStatus.statusText : 'Offline')
      });
    } catch {
      return NextResponse.json({
        is_live: Boolean(listenerStatus.isLive),
        connected: isListenerMatching && Boolean(listenerStatus.connected),
        username,
        statusText: isListenerMatching && listenerStatus.statusText ? listenerStatus.statusText : 'Offline'
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      is_live: Boolean(listenerStatus.isLive),
      connected: Boolean(listenerStatus.connected),
      username: listenerStatus.username || 'onlyvirtus',
      statusText: listenerStatus.statusText || 'Offline',
      error: err.message
    });
  }
}
