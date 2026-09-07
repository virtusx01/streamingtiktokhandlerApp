import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let caddyProcess: ChildProcess | null = null;

export async function GET() {
  const isRunning = caddyProcess !== null && !caddyProcess.killed;
  return NextResponse.json({
    running: isRunning,
  });
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json();

    if (action === 'start') {
      if (caddyProcess && !caddyProcess.killed) {
        return NextResponse.json({ message: 'Caddy is already running' });
      }

      // Start Caddy
      caddyProcess = spawn('caddy', ['run', '--config', 'Caddyfile'], {
        cwd: process.cwd(),
        shell: true,
        detached: false // Keep it attached so it dies if the parent dies, or use true if we want it to persist. 
        // For Next.js dev server, better to keep it attached or handle cleanup.
      });

      // Handle standard error to capture failures (like port 80 already in use)
      let startupError = '';
      caddyProcess.stderr?.on('data', (data) => {
        const msg = data.toString();
        console.error('Caddy Error Output:', msg);
        startupError += msg;
      });

      caddyProcess.stdout?.on('data', (data) => {
        console.log('Caddy Output:', data.toString());
      });

      caddyProcess.on('exit', (code) => {
        console.log(`Caddy process exited with code ${code}`);
        caddyProcess = null;
      });

      // Give it a second to see if it immediately crashes
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          if (caddyProcess && !caddyProcess.killed) {
            resolve(NextResponse.json({ message: 'Caddy started successfully' }));
          } else {
            resolve(NextResponse.json({ error: 'Caddy failed to start. ' + startupError }, { status: 500 }));
          }
        }, 1500);
      });
    }

    if (action === 'stop' || action === 'force_stop') {
      try {
        if (caddyProcess) {
          caddyProcess.kill('SIGKILL');
          caddyProcess = null;
        }
        // Force kill all running caddy.exe processes on Windows system-wide
        const execSync = require('child_process').execSync;
        try {
          execSync('taskkill /F /IM caddy.exe', { stdio: 'ignore' });
        } catch (e) {}

        return NextResponse.json({ message: 'Semua proses Caddy berhasil dihentikan total (Force Stopped)' });
      } catch (e: any) {
        return NextResponse.json({ message: 'Caddy stopped', error: e.message });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
