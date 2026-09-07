import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSetting } from '@/lib/db';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const rawUsername = getSetting('tiktokUsername', '@onlyvirtus');
    let username = "onlyvirtus";
    if (rawUsername) {
      try {
        const parsed = JSON.parse(rawUsername);
        username = String(parsed).replace(/^@/, '').trim();
      } catch {
        username = String(rawUsername).replace(/^@/, '').trim();
      }
    }

    const scriptPath = path.join(process.cwd(), 'check_live.py');
    const { stdout } = await execAsync(`python "${scriptPath}" "${username}"`, {
      timeout: 8000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    const result = JSON.parse(stdout.trim());
    return NextResponse.json({
      is_live: Boolean(result?.is_live),
      username
    });
  } catch (err: any) {
    // In serverless / cloud or when streamer is offline, gracefully return false
    return NextResponse.json({ is_live: false, error: err.message });
  }
}
