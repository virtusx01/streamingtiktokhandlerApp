import { NextResponse } from 'next/server';
import { emitJoinEvent } from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Server-side Deduplication
    if (isDuplicate(data.eventId, 5000)) {
        return NextResponse.json({ success: true, duplicated: true });
    }

    console.log(`[API] Received Join Event from ${data.nickname || data.username}`);
    
    // Emit the event so the SSE route can pick it up
    emitJoinEvent(data);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing join event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process join event' },
      { status: 500 }
    );
  }
}
