import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { listenerStatus, updateListenerStatus } from '@/lib/listener-state';
import { emitStatusEvent } from '@/lib/events';
import { tiktokNodeListener } from '@/lib/tiktok-node-listener';

interface GlobalListenerHolder {
  __last_listener_log?: string;
  __last_listener_error?: string;
}
const globalHolder = global as unknown as GlobalListenerHolder;

export async function GET() {
  const isNodeActive = tiktokNodeListener.isActive();
  const isFreshLocalStatus = Boolean(listenerStatus.running && (Date.now() - listenerStatus.updatedAt < 25000));
  const isRunningLocally = isNodeActive || isFreshLocalStatus;

  if (isRunningLocally) {
    updateListenerStatus({
      running: true,
      lastLog: globalHolder.__last_listener_log || '',
      lastError: globalHolder.__last_listener_error || ''
    });

    // Update heartbeat in settings
    setSetting('listener_running', 'true');
    setSetting('listener_connected', String(Boolean(listenerStatus.connected)));
    setSetting('listener_is_live', String(Boolean(listenerStatus.isLive)));
    setSetting('listener_username', listenerStatus.username || 'onlyvirtus');
    setSetting('listener_status_text', listenerStatus.statusText || '');
    setSetting('listener_last_heartbeat', String(Date.now()));

    return NextResponse.json({
      running: true,
      engine: isNodeActive ? 'nodejs' : 'local_runner',
      status: listenerStatus
    });
  }

  // If not running in this local process (e.g. running on Cloud / Netlify serverless)
  const cloudRunning = getSetting('listener_running', 'false') === 'true';
  const cloudHeartbeat = Number(getSetting('listener_last_heartbeat', '0'));
  const isHeartbeatFresh = Date.now() - cloudHeartbeat < 60000;

  if (cloudRunning && isHeartbeatFresh) {
    const cloudConnected = getSetting('listener_connected', 'false') === 'true';
    const cloudIsLive = getSetting('listener_is_live', 'false') === 'true';
    const cloudUser = getSetting('listener_username', getSetting('tiktokUsername', '@onlyvirtus')).replace(/^@/, '');
    const cloudStatusText = getSetting('listener_status_text', 'TikTok listener aktif; menunggu LIVE');

    const syncedState = {
      running: true,
      connected: cloudConnected,
      isLive: cloudIsLive,
      username: cloudUser,
      statusText: cloudStatusText,
      updatedAt: cloudHeartbeat
    };

    updateListenerStatus(syncedState);

    return NextResponse.json({
      running: true,
      engine: 'remote_daemon',
      status: syncedState
    });
  }

  updateListenerStatus({
    running: false,
    connected: false,
    isLive: false,
    lastLog: globalHolder.__last_listener_log || '',
    lastError: globalHolder.__last_listener_error || ''
  });

  return NextResponse.json({
    running: false,
    engine: 'idle',
    status: listenerStatus
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // Handle status reports from main.py or background runners
    if (action === 'report_status') {
      const isLive = Boolean(body.isLive);
      const isConnected = Boolean(body.connected);
      const username = body.username ? String(body.username).replace(/^@/, '') : listenerStatus.username;
      const roomId = body.roomId || listenerStatus.roomId || '';
      const statusText = body.statusText || (isConnected ? `Terhubung ke Live @${username}` : 'Standby');

      const updated = updateListenerStatus({
        running: body.running !== undefined ? Boolean(body.running) : true,
        connected: isConnected,
        isLive,
        username,
        roomId,
        statusText,
      });

      // Synchronize to Supabase settings for cross-environment awareness
      setSetting('listener_running', 'true');
      setSetting('listener_connected', String(isConnected));
      setSetting('listener_is_live', String(isLive));
      setSetting('listener_username', username);
      setSetting('listener_room_id', String(roomId));
      setSetting('listener_status_text', statusText);
      setSetting('listener_last_heartbeat', String(Date.now()));

      emitStatusEvent(updated);
      return NextResponse.json({ ok: true, status: updated });
    }

    if (action === 'start') {
      let targetUsername = body.username ? String(body.username).replace(/^@/, '').trim() : '';
      if (!targetUsername) {
        const rawUsername = getSetting('tiktokUsername', '@onlyvirtus');
        targetUsername = typeof rawUsername === 'string' ? rawUsername.replace(/^@/, '').trim() : 'onlyvirtus';
      }
      if (!targetUsername) targetUsername = 'onlyvirtus';

      // Persist chosen username
      setSetting('tiktokUsername', `@${targetUsername}`);
      setSetting('listener_running', 'true');
      setSetting('listener_connected', 'false');
      setSetting('listener_is_live', 'false');
      setSetting('listener_username', targetUsername);
      setSetting('listener_status_text', `Menghubungkan ke TikTok @${targetUsername}...`);
      setSetting('listener_last_heartbeat', String(Date.now()));

      // Stop any existing node listener before restarting
      if (tiktokNodeListener.isActive()) {
        try {
          await tiktokNodeListener.stop();
        } catch {}
      }

      globalHolder.__last_listener_error = '';
      globalHolder.__last_listener_log = '';

      try {
        await tiktokNodeListener.start(targetUsername);

        return NextResponse.json({
          message: 'TikTok listener started with tiktok-live-connector',
          engine: 'nodejs',
          username: targetUsername,
          status: listenerStatus
        });
      } catch (err: any) {
        console.warn('[TikTokListener] Node.js listener failed:', err.message);
        globalHolder.__last_listener_error = err.message;
        return NextResponse.json(
          { error: `Listener TikTok gagal dimulai: ${err.message}` },
          { status: 500 }
        );
      }
    }

    if (action === 'stop') {
      await tiktokNodeListener.stop();

      updateListenerStatus({
        running: false,
        connected: false,
        isLive: false,
        statusText: 'Listener dihentikan.'
      });

      setSetting('listener_running', 'false');
      setSetting('listener_connected', 'false');
      setSetting('listener_is_live', 'false');
      setSetting('listener_status_text', 'Listener dihentikan.');
      setSetting('listener_last_heartbeat', String(Date.now()));

      emitStatusEvent(listenerStatus);

      return NextResponse.json({ message: 'Listener stopped', status: listenerStatus });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
