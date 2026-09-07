import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // We capture the screen using ADB exec-out screencap to avoid binary corruption on Windows
    const { stdout, stderr } = await execAsync('adb exec-out screencap -p', { 
        encoding: 'buffer', 
        maxBuffer: 1024 * 1024 * 15 // Increased to 15MB for high-res screens
    });
    
    if (stderr && stderr.toString().includes('error')) {
      return NextResponse.json({ error: stderr.toString() }, { status: 500 });
    }

    return new NextResponse(stdout, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to capture screen' }, { status: 500 });
  }
}
