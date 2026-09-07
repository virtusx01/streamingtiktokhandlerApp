import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { getSetting } from '@/lib/db';

let pythonProcess: ChildProcess | null = null;
let lastListenerLog: string = '';
let lastListenerError: string = '';

export async function GET() {
  return NextResponse.json({
    running: pythonProcess !== null && !pythonProcess.killed,
    pid: pythonProcess?.pid || null,
    lastLog: lastListenerLog,
    lastError: lastListenerError
  });
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    if (action === 'start') {
      if (pythonProcess && !pythonProcess.killed) {
        return NextResponse.json({ message: 'Listener already running', pid: pythonProcess.pid });
      }

      lastListenerError = '';
      lastListenerLog = '';

      const rawUsername = getSetting('tiktokUsername', '@onlyvirtus');
      let username = typeof rawUsername === 'string' ? rawUsername.replace(/^@/, '').trim() : 'onlyvirtus';
      if (!username) username = 'onlyvirtus';

      const scriptPath = path.join(process.cwd(), 'main.py');
      const port = process.env.PORT || '3005';
      const baseUrl = process.env.NEXT_BASE_URL || `http://localhost:${port}`;

      try {
        pythonProcess = spawn('python', [scriptPath, username], {
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            NEXT_BASE_URL: baseUrl
          },
          stdio: 'pipe',
          detached: false
        });

        pythonProcess.stdout?.on('data', (data) => {
          const text = data.toString().trim();
          lastListenerLog = text;
          console.log(`[TikTokListener] ${text}`);
        });

        pythonProcess.stderr?.on('data', (data) => {
          const text = data.toString().trim();
          lastListenerError = text;
          console.error(`[TikTokListener ERR] ${text}`);
        });

        pythonProcess.on('exit', (code) => {
          console.log(`[TikTokListener] Process exited with code ${code}`);
          pythonProcess = null;
        });

        pythonProcess.on('error', (err) => {
          console.error(`[TikTokListener Process Error]`, err);
          lastListenerError = err.message;
          pythonProcess = null;
        });

        return NextResponse.json({
          message: 'Listener started',
          pid: pythonProcess.pid,
          username
        });
      } catch (spawnErr: any) {
        lastListenerError = spawnErr.message;
        return NextResponse.json(
          { error: 'Gagal menjalankan listener Python: ' + spawnErr.message },
          { status: 500 }
        );
      }
    }

    if (action === 'stop') {
      if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
        return NextResponse.json({ message: 'Listener stopped' });
      }
      return NextResponse.json({ message: 'Listener not running' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
