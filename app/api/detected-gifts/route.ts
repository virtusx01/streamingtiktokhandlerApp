import { NextResponse } from 'next/server';
import { addDetectedGift, getDetectedGifts } from '@/lib/db';

export async function GET() {
  try {
    const gifts = getDetectedGifts();
    return NextResponse.json({ gifts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    addDetectedGift(name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
