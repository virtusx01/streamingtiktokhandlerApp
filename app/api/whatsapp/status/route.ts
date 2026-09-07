import { NextResponse } from 'next/server';
import { getWAStatus, initWhatsApp, disconnectWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = getWAStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'connect';

    if (action === 'connect') {
      initWhatsApp().catch(e => console.error('[WA API] init error:', e));
      return NextResponse.json({ success: true, message: 'Inisialisasi koneksi WhatsApp dimulai' });
    } else if (action === 'disconnect') {
      await disconnectWhatsApp();
      return NextResponse.json({ success: true, message: 'WhatsApp berhasil diputus' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
