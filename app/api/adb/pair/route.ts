import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { ip, port, pairingCode } = await req.json();
    
    if (!ip || !port || !pairingCode) {
      return NextResponse.json({ error: "IP, Port, and Pairing Code are required" }, { status: 400 });
    }

    // ADB pair command: adb pair <ip>:<port> <pairingCode>
    const command = `adb pair ${ip}:${port} ${pairingCode}`;
    console.log(`[ADB] Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    // adb pair stdout usually says "Successfully paired to ..."
    if (stdout.includes('Successfully paired')) {
        return NextResponse.json({ success: true, message: stdout.trim() });
    }

    return NextResponse.json({ success: false, error: stderr || stdout });
  } catch (err: any) {
    console.error("ADB Pair Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
