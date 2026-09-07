import { NextResponse } from 'next/server';
import { emitFanEvent } from '@/lib/events';
import { isDuplicate } from '@/lib/dedup';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Server-side Deduplication
    if (isDuplicate(data.eventId, 5000)) {
        return NextResponse.json({ success: true, duplicated: true });
    }

    console.log(`[API] Received Fan Event from ${data.nickname || data.username}`);
    
    emitFanEvent(data);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing fan event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process fan event' },
      { status: 500 }
    );
  }
}
