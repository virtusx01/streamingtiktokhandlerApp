import { NextResponse } from 'next/server';
import { emitSociabuzzEvent } from '@/lib/events';
import { isAdminActionRequest } from '@/lib/adb-queue';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  emitSociabuzzEvent({
    amount: '25000',
    supporter: 'Supporter Test',
    message: 'Semangat terus stream-nya!',
    mediaUrl: 'https://example.com/media.mp4',
    fromText: 'mengirim',
    isTest: true,
    timestamp: Date.now(),
  });

  return NextResponse.json({ success: true });
}
