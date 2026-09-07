import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSetting } from '@/lib/db';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const rawUsername = getSetting('tiktokUsername');
    let username = "@onlyvirtus";
    if (rawUsername) {
        try {
            username = JSON.parse(rawUsername);
        } catch {
            username = rawUsername;
        }
    }
    const pythonPath = 'python'; // Or path to python executable
    const scriptPath = path.join(process.cwd(), 'check_live.py');
    
    const { stdout } = await execAsync(`${pythonPath} ${scriptPath} ${username}`);
    const result = JSON.parse(stdout.trim());
    
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Status check error:", err);
    return NextResponse.json({ is_live: false, error: err.message }, { status: 500 });
  }
}
