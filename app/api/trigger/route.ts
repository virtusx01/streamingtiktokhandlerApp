import { NextResponse } from 'next/server';
import { enqueueAdbActions, isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting } from '@/lib/db';

export async function POST(req: Request) {
  try {
    if (!(await isAdminActionRequest(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    if (!getSetting('triggerRewardsEnabled', true)) {
      return NextResponse.json({ error: 'Aksi reward sedang dinonaktifkan.' }, { status: 409 });
    }

    const actions = data.actions || data;
    const commandId = await enqueueAdbActions(Array.isArray(actions) ? actions : [actions], {
      eventType: 'manual',
    });
    return NextResponse.json({ success: true, queued: true, commandId }, { status: 202 });
  } catch (err: any) {
    console.error("Trigger Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
