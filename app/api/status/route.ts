import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getSetting } from '@/lib/db';
import { listenerStatus } from '@/lib/listener-state';
import { getPythonCommand } from '@/lib/python-runner';

const execAsync = promisify(exec);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paramUser = searchParams.get('username');

    let username = paramUser ? paramUser.replace(/^@/, '').trim() : '';
    if (!username) {
      const rawUsername = getSetting('tiktokUsername', '@onlyvirtus');
      if (rawUsername) {
        try {
          const parsed = JSON.parse(rawUsername);
          username = String(parsed).replace(/^@/, '').trim();
        } catch {
          username = String(rawUsername).replace(/^@/, '').trim();
        }
      }
    }
    if (!username) username = listenerStatus.username || 'onlyvirtus';

    // If Python listener is connected to this user right now, it's definitely LIVE
    const isListenerMatching = listenerStatus.username.toLowerCase() === username.toLowerCase();
    if (listenerStatus.running && listenerStatus.connected && isListenerMatching) {
      return NextResponse.json({
        is_live: true,
        connected: true,
        username,
        roomId: listenerStatus.roomId,
        statusText: listenerStatus.statusText || `Terhubung ke Live @${username}`
      });
    }

    const pythonCmd = getPythonCommand();
    if (!pythonCmd) {
      return NextResponse.json({
        is_live: Boolean(listenerStatus.isLive),
        connected: Boolean(listenerStatus.connected),
        username,
        statusText: isListenerMatching && listenerStatus.statusText ? listenerStatus.statusText : 'Offline',
        note: 'Serverless runtime tanpa Python'
      });
    }

    const scriptPath = path.join(process.cwd(), 'check_live.py');
    const { stdout } = await execAsync(`"${pythonCmd}" "${scriptPath}" "${username}"`, {
      timeout: 8000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    const result = JSON.parse(stdout.trim());
    const isLive = Boolean(result?.is_live);

    return NextResponse.json({
      is_live: isLive,
      connected: isListenerMatching && Boolean(listenerStatus.connected),
      username,
      statusText: isLive ? `Live sedang berlangsung` : (isListenerMatching ? listenerStatus.statusText : 'Offline')
    });
  } catch (err: any) {
    return NextResponse.json({
      is_live: Boolean(listenerStatus.isLive),
      connected: Boolean(listenerStatus.connected),
      username: listenerStatus.username || 'onlyvirtus',
      statusText: listenerStatus.statusText || 'Offline',
      error: err.message
    });
  }
}
