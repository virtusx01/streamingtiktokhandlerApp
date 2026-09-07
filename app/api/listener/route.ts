import { NextResponse } from 'next/server';
import { ChildProcess } from 'child_process';
import { getSetting, setSetting } from '@/lib/db';
import { listenerStatus, updateListenerStatus } from '@/lib/listener-state';
import { emitStatusEvent } from '@/lib/events';
import { tiktokNodeListener } from '@/lib/tiktok-node-listener';

let pythonProcess: ChildProcess | null = null;
let lastListenerLog: string = '';
let lastListenerError: string = '';

export async function GET() {
  const isNodeActive = tiktokNodeListener.isActive();
  const isPythonRunning = pythonProcess !== null && !pythonProcess.killed;
  const isRunning = isNodeActive || isPythonRunning;

  updateListenerStatus({
    running: isRunning,
    lastLog: lastListenerLog,
    lastError: lastListenerError
  });

  return NextResponse.json({
    running: isRunning,
    engine: isNodeActive ? 'nodejs' : (isPythonRunning ? 'python' : 'idle'),
    status: listenerStatus
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // Handle internal status reports (e.g. from Python fallback if used)
    if (action === 'report_status') {
      const updated = updateListenerStatus({
        connected: Boolean(body.connected),
        isLive: Boolean(body.isLive),
        username: body.username || listenerStatus.username,
        roomId: body.roomId || listenerStatus.roomId,
        statusText: body.statusText || (body.connected ? 'Terhubung' : 'Standby'),
      });
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

      // Stop any legacy python process if running
      if (pythonProcess && !pythonProcess.killed) {
        try {
          pythonProcess.kill();
        } catch {}
        pythonProcess = null;
      }

      lastListenerError = '';
      lastListenerLog = '';

      // Start the pure Node.js / JavaScript TikTok Live listener
      // No Python binary required! Zero extra RAM/CPU overhead on laptop!
      try {
        await tiktokNodeListener.start(targetUsername);

        return NextResponse.json({
          message: 'Listener Node.js started',
          engine: 'nodejs',
          username: targetUsername,
          status: listenerStatus
        });
      } catch (err: any) {
        lastListenerError = err.message;
        updateListenerStatus({
          running: false,
          connected: false,
          isLive: false,
          statusText: `Gagal start: ${err.message}`
        });
        emitStatusEvent(listenerStatus);

        return NextResponse.json(
          { error: 'Gagal menjalankan listener: ' + err.message },
          { status: 500 }
        );
      }
    }

    if (action === 'stop') {
      // Stop Node.js listener
      await tiktokNodeListener.stop();

      // Also stop Python process if any
      if (pythonProcess) {
        try {
          pythonProcess.kill();
        } catch {}
        pythonProcess = null;
      }

      updateListenerStatus({
        running: false,
        connected: false,
        isLive: false,
        statusText: 'Listener dihentikan.'
      });
      emitStatusEvent(listenerStatus);

      return NextResponse.json({ message: 'Listener stopped', status: listenerStatus });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
