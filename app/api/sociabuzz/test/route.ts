import { NextResponse } from 'next/server';
import { isAdminActionRequest } from '@/lib/adb-queue';
import { publishSociabuzzEvent } from '@/lib/sociabuzz-events';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mediaShare = new URL(req.url).searchParams.get('mediaShare') === '1';

  try {
    await publishSociabuzzEvent({
      amount: '25000',
      supporter: 'Supporter Test',
      message: mediaShare ? 'Ini adalah test alert MediaShare.' : 'Semangat terus stream-nya!',
      ...(mediaShare ? { shareUrl: 'https://www.youtube.com/watch?v=fTKqtvXjkvo' } : {}),
      fromText: 'mengirim',
      isTest: true,
      timestamp: Date.now(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SociaBuzz] Failed to queue test alert:', error);
    return NextResponse.json({ error: 'Gagal meneruskan test alert ke widget.' }, { status: 503 });
  }
}
