import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs: unknown = getSetting('sociabuzzWebhookLogs', []);
  return NextResponse.json({
    logs: Array.isArray(logs) ? logs.slice(0, 20) : [],
  });
}
