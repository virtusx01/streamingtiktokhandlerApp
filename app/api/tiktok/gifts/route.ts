import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'tiktok_gifts.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json([], { status: 404 });
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (err: any) {
    console.error('Failed to get tiktok gifts:', err);
    return NextResponse.json({ error: 'Failed to read tiktok gifts' }, { status: 500 });
  }
}
