import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { resetLikeSession } from '@/lib/db';

let pythonProcess: ChildProcess | null = null;

export async function GET() {
  return NextResponse.json({
    running: pythonProcess !== null && !pythonProcess.killed,
    pid: pythonProcess?.pid
  });
}

export async function POST(req: Request) {
  const { action } = await req.json();

  if (action === 'start') {
    if (pythonProcess && !pythonProcess.killed) {
      return NextResponse.json({ message: 'Listener already running' });
    }

    // Removed: resetLikeSession(); (Ensures data persists across restarts)

    const scriptPath = path.join(process.cwd(), 'main.py');
    pythonProcess = spawn('python', [scriptPath], {
      stdio: 'inherit',
      detached: false
    });

    pythonProcess.on('exit', () => {
      pythonProcess = null;
      console.log('Python listener process exited');
    });

    return NextResponse.json({ message: 'Listener started', pid: pythonProcess.pid });
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
}
