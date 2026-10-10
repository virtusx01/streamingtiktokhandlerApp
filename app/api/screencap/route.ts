import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminActionRequest } from '@/lib/adb-queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SCREENSHOT_TIMEOUT_MS = 25000;
const SCREENSHOT_POLL_INTERVAL_MS = 500;
const MAX_SCREENSHOT_BASE64_LENGTH = 16 * 1024 * 1024;

export async function GET(req: Request) {
  if (!(await isAdminActionRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let commandId: string;
  try {
    const agent = await prisma.adbAgent.findFirst({ orderBy: { lastSeen: 'desc' } });
    if (!agent || !agent.adbConnected || Date.now() - agent.lastSeen.getTime() >= 30000) {
      return NextResponse.json({ error: 'ADB agent atau perangkat HP sedang offline.' }, { status: 503 });
    }

    const command = await prisma.adbCommand.create({
      data: {
        actions: [{ type: 'screencap' }],
        metadata: { eventType: 'screencap' },
      },
      select: { id: true },
    });
    commandId = command.id;
  } catch (error) {
    console.error('[ADB Screencap] Failed to queue screenshot request:', error);
    return NextResponse.json({ error: 'Gagal meminta screenshot dari ADB agent.' }, { status: 503 });
  }

  const deadline = Date.now() + SCREENSHOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const command = await prisma.adbCommand.findUnique({
        where: { id: commandId },
        select: { status: true, result: true },
      });

      if (command?.status === 'failed') {
        const result = command.result;
        const error = result && typeof result === 'object' && 'error' in result
          ? String(result.error)
          : 'Agent gagal mengambil screenshot dari HP.';
        return NextResponse.json({ error }, { status: 502 });
      }

      if (command?.status === 'completed') {
        const result = command.result;
        const screenshot = result && typeof result === 'object' && 'screenshot' in result
          ? result.screenshot
          : null;
        if (
          typeof screenshot !== 'string' ||
          screenshot.length === 0 ||
          screenshot.length > MAX_SCREENSHOT_BASE64_LENGTH ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(screenshot)
        ) {
          return NextResponse.json({ error: 'Agent mengembalikan screenshot dengan format tidak valid.' }, { status: 502 });
        }

        const image = Buffer.from(screenshot, 'base64');
        if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
          return NextResponse.json({ error: 'Agent mengembalikan file yang bukan screenshot PNG.' }, { status: 502 });
        }

        return new NextResponse(image, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store, max-age=0',
          },
        });
      }
    } catch (error) {
      console.error('[ADB Screencap] Failed to read screenshot result:', error);
      return NextResponse.json({ error: 'Gagal membaca hasil screenshot dari agent.' }, { status: 503 });
    }

    await new Promise(resolve => setTimeout(resolve, SCREENSHOT_POLL_INTERVAL_MS));
  }

  try {
    await prisma.adbCommand.updateMany({
      where: { id: commandId, status: 'queued' },
      data: { status: 'failed', completedAt: new Date() },
    });
  } catch (error) {
    console.error('[ADB Screencap] Failed to expire screenshot request:', error);
  }

  return NextResponse.json(
    { error: 'Agent tidak merespons permintaan screenshot dalam 25 detik.' },
    { status: 504 },
  );
}
