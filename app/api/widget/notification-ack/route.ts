import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (
      typeof body.notificationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.notificationId)
    ) {
      return NextResponse.json({ error: 'ID notifikasi tidak valid.' }, { status: 400 });
    }

    const updated = await prisma.$executeRaw(Prisma.sql`
      update public.adb_commands
      set metadata = jsonb_set(metadata, '{widgetNotificationAck}', 'true'::jsonb, true)
      where id = ${body.notificationId}::uuid
        and status = 'completed'
        and metadata->>'widgetAckRequired' = 'true'
        and metadata->>'widgetNotificationAck' = 'false'
    `);

    if (updated === 1) return NextResponse.json({ success: true });

    const command = await prisma.adbCommand.findUnique({
      where: { id: body.notificationId },
      select: { status: true, metadata: true },
    });
    const metadata = command?.metadata;
    const metadataObject =
      typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : null;
    if (
      command?.status === 'completed' &&
      metadataObject?.widgetAckRequired === true &&
      metadataObject.widgetNotificationAck === true
    ) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Notifikasi reward tidak ditemukan.' }, { status: 404 });
  } catch (error) {
    console.error('[Widget] Failed to acknowledge ADB reward notification:', error);
    return NextResponse.json({ error: 'Gagal mengonfirmasi notifikasi reward.' }, { status: 500 });
  }
}
