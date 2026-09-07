import { NextResponse } from 'next/server';
import { emitFollowEvent } from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';
import { updateGiveawayFollow } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Server-side Deduplication
    if (isDuplicate(data.eventId, 5000)) {
        return NextResponse.json({ success: true, duplicated: true });
    }

    console.log(`[API] Received Follow Event from ${data.nickname || data.username}`);

    emitFollowEvent(data);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing follow event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process follow event' },
      { status: 500 }
    );
  }
}
