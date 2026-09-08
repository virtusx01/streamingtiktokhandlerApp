import { NextResponse } from 'next/server';
import { getWAStatus, initWhatsApp, disconnectWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = getWAStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      status: 'DISCONNECTED',
      qrCodeUrl: null,
      phoneNumber: null,
      userName: null,
      error: err?.message || 'Error checking WA status'
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'connect';

    if (action === 'connect') {
      const currentStatus = getWAStatus();
      if (currentStatus.status === 'CONNECTED') {
        return NextResponse.json({
          success: true,
          message: `WhatsApp sudah terhubung (${currentStatus.phoneNumber || 'Aktif'})`,
          ...currentStatus
        });
      }

      try {
        initWhatsApp().catch(e => console.warn('[WA API] Background init error:', e?.message || e));
      } catch (initErr: any) {
        console.warn('[WA API] Init sync error:', initErr?.message || initErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Inisialisasi koneksi WhatsApp dimulai, silakan tunggu QR Code...',
        status: 'CONNECTING'
      });
    } else if (action === 'disconnect') {
      try {
        await disconnectWhatsApp();
      } catch {}
      return NextResponse.json({ success: true, message: 'WhatsApp berhasil diputus', status: 'DISCONNECTED' });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
