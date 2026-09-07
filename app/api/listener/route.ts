import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { getSetting, setSetting } from '@/lib/db';
import { listenerStatus, updateListenerStatus } from '@/lib/listener-state';
import { emitStatusEvent } from '@/lib/events';
import { getPythonCommand } from '@/lib/python-runner';

let pythonProcess: ChildProcess | null = null;
let lastListenerLog: string = '';
let lastListenerError: string = '';

export async function GET() {
  const isRunning = pythonProcess !== null && !pythonProcess.killed;
  updateListenerStatus({
    running: isRunning,
    lastLog: lastListenerLog,
    lastError: lastListenerError
  });

  return NextResponse.json({
    running: isRunning,
    pid: pythonProcess?.pid || null,
    lastLog: lastListenerLog,
    lastError: lastListenerError,
    status: listenerStatus
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // Handle internal status reports from main.py
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

      // If user passed a username, persist it
      setSetting('tiktokUsername', `@${targetUsername}`);

      // If already running with same username
      if (pythonProcess && !pythonProcess.killed) {
        if (listenerStatus.username.toLowerCase() === targetUsername.toLowerCase() && !body.forceRestart) {
          return NextResponse.json({
            message: 'Listener already running',
            pid: pythonProcess.pid,
            username: targetUsername,
            status: listenerStatus
          });
        }
        // Different username requested: kill previous process first
        try {
          pythonProcess.kill();
        } catch (e) {}
        pythonProcess = null;
      }

      lastListenerError = '';
      lastListenerLog = '';

      const pythonCmd = getPythonCommand();
      if (!pythonCmd) {
        const errorMsg = `Runtime Python tidak ditemukan di sistem ini (ENOENT). Jika Anda membuka website ini melalui Netlify/Cloud Hosting, server cloud tidak memiliki Python untuk menjalankan listener. Silakan jalankan listener di PC lokal Anda dengan perintah: python main.py ${targetUsername}`;
        lastListenerError = errorMsg;
        updateListenerStatus({
          running: false,
          connected: false,
          isLive: false,
          statusText: 'Server Cloud: Jalankan main.py di PC lokal'
        });
        emitStatusEvent(listenerStatus);
        return NextResponse.json(
          { error: errorMsg, isCloudServerless: true },
          { status: 400 }
        );
      }

      const scriptPath = path.join(process.cwd(), 'main.py');
      const port = process.env.PORT || '3005';
      const baseUrl = process.env.NEXT_BASE_URL || `http://localhost:${port}`;

      try {
        pythonProcess = spawn(pythonCmd, [scriptPath, targetUsername], {
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            NEXT_BASE_URL: baseUrl
          },
          stdio: 'pipe',
          detached: false
        });

        updateListenerStatus({
          running: true,
          connected: false,
          isLive: false,
          username: targetUsername,
          statusText: `Menghubungkan ke @${targetUsername}...`
        });
        emitStatusEvent(listenerStatus);

        pythonProcess.stdout?.on('data', (data) => {
          const text = data.toString().trim();
          if (text) {
            lastListenerLog = text;
            console.log(`[TikTokListener] ${text}`);
          }
        });

        pythonProcess.stderr?.on('data', (data) => {
          const text = data.toString().trim();
          if (text) {
            lastListenerError = text;
            console.error(`[TikTokListener ERR] ${text}`);
          }
        });

        pythonProcess.on('exit', (code) => {
          console.log(`[TikTokListener] Process exited with code ${code}`);
          pythonProcess = null;
          updateListenerStatus({
            running: false,
            connected: false,
            isLive: false,
            statusText: `Listener berhenti (kode: ${code})`
          });
          emitStatusEvent(listenerStatus);
        });

        pythonProcess.on('error', (err: any) => {
          console.error(`[TikTokListener Process Error]`, err);
          let msg = err.message;
          if (err.code === 'ENOENT' || err.message?.includes('ENOENT')) {
            msg = `Runtime Python tidak ditemukan di sistem (ENOENT). Pastikan Python terinstall dan terdaftar di PATH, atau jalankan main.py dari terminal lokal.`;
          }
          lastListenerError = msg;
          pythonProcess = null;
          updateListenerStatus({
            running: false,
            connected: false,
            isLive: false,
            statusText: `Error: ${msg}`
          });
          emitStatusEvent(listenerStatus);
        });

        return NextResponse.json({
          message: 'Listener started',
          pid: pythonProcess.pid,
          username: targetUsername,
          status: listenerStatus
        });
      } catch (spawnErr: any) {
        lastListenerError = spawnErr.message;
        updateListenerStatus({
          running: false,
          connected: false,
          isLive: false,
          statusText: `Gagal start: ${spawnErr.message}`
        });
        return NextResponse.json(
          { error: 'Gagal menjalankan listener Python: ' + spawnErr.message },
          { status: 500 }
        );
      }
    }

    if (action === 'stop') {
      if (pythonProcess) {
        try {
          pythonProcess.kill();
        } catch (e) {}
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
