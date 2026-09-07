import { NextResponse } from 'next/server';
import { getGiveawayVideoUrl, setGiveawayVideoUrl } from '@/lib/db';

export async function GET() {
  try {
    const videoUrl = getGiveawayVideoUrl();
    return NextResponse.json({ success: true, videoUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { videoUrl } = await req.json();
    setGiveawayVideoUrl(videoUrl || '');
    return NextResponse.json({ success: true, videoUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
