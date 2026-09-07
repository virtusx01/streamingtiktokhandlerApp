import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { ip, port } = await req.json();
    
    if (!ip || !port) {
      return NextResponse.json({ error: "IP and Port are required" }, { status: 400 });
    }

    const command = `adb connect ${ip}:${port}`;
    console.log(`[ADB] Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    // adb connect stdout usually says "already connected to" or "connected to"
    if (stdout.includes('connected to') || stdout.includes('already connected')) {
        return NextResponse.json({ success: true, message: stdout.trim() });
    }

    return NextResponse.json({ success: false, error: stderr || stdout });
  } catch (err: any) {
    console.error("ADB Connect Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
