import { NextResponse } from 'next/server';
import { registerWaAbsenManual } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { username, nickname, phone } = await req.json();
    if (!username) {
      return NextResponse.json({ success: false, error: 'Username / Member Tag wajib diisi' }, { status: 400 });
    }

    const result = registerWaAbsenManual(username, nickname, phone);
    return NextResponse.json({
      success: true,
      message: `Peserta @${result.username} berhasil didaftarkan dari WhatsApp!`,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
