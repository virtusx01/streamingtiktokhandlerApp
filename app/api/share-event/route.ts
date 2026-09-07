import { NextResponse } from 'next/server';
import { emitShareEvent } from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';
import { updateGiveawayShare } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const shareData = await req.json();

    // Server-side Deduplication
    if (isDuplicate(shareData.eventId, 5000)) {
        console.warn(`[API] Dropping duplicate Share Event (ID: ${shareData.eventId})`);
        return NextResponse.json({ success: true, duplicated: true });
    }

    console.log("📢 Received Share Event:", shareData);

    // Notify Widget and Dashboard via SSE
    emitShareEvent(shareData);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Share Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
