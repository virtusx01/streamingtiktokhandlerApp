import { NextRequest, NextResponse } from 'next/server';
import { handleTiktokLiveEventRequest } from '@/app/api/tiktok-live/event/route';

export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  return handleTiktokLiveEventRequest(req);
}
