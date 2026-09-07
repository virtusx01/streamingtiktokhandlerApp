import { NextResponse } from 'next/server';
import { emitCommentEvent } from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';
import { updateGiveawayComment } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const commentData = await req.json();
    
    // Server-side Deduplication
    if (isDuplicate(commentData.eventId, 5000)) {
        console.warn(`[API] Dropping duplicate Comment Event (ID: ${commentData.eventId})`);
        return NextResponse.json({ success: true, duplicated: true });
    }

    console.log("💬 Received Comment Event:", commentData);

    // Notify Widget via SSE
    emitCommentEvent(commentData);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Comment Event Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
