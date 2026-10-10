import { NextResponse } from 'next/server';
import { enqueueAdbActions, isAdminActionRequest } from '@/lib/adb-queue';
import { getSetting } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { emitGiftEvent } from '@/lib/events';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    if (!(await isAdminActionRequest(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const commandId = new URL(req.url).searchParams.get('commandId');
    if (!commandId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commandId)) {
      return NextResponse.json({ error: 'ID perintah tidak valid.' }, { status: 400 });
    }

    const command = await prisma.adbCommand.findUnique({
      where: { id: commandId },
      select: { status: true, metadata: true, result: true },
    });
    if (!command || !command.metadata || typeof command.metadata !== 'object' ||
      !('eventType' in command.metadata) || command.metadata.eventType !== 'manual_test') {
      return NextResponse.json({ error: 'Perintah uji tidak ditemukan.' }, { status: 404 });
    }

    const result = command.result;
    const resultObject = result && typeof result === 'object' ? result : null;
    const error = resultObject && 'error' in resultObject ? resultObject.error : null;

    return NextResponse.json({
      status: command.status,
      ...(command.status === 'failed' ? { error: error || 'Agent gagal menjalankan aksi ADB.' } : {}),
    });
  } catch (error) {
    console.error('[ADB Test] Failed to read command status:', error);
    return NextResponse.json({ error: 'Gagal membaca status aksi ADB.' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    if (!(await isAdminActionRequest(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    if (!getSetting('triggerRewardsEnabled', true)) {
      return NextResponse.json({ error: 'Aksi reward sedang dinonaktifkan.' }, { status: 409 });
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return NextResponse.json({ error: 'Payload aksi tidak valid.' }, { status: 400 });
    }

    const agent = await prisma.adbAgent.findFirst({ orderBy: { lastSeen: 'desc' } });
    if (!agent || !agent.adbConnected || Date.now() - agent.lastSeen.getTime() >= 30000) {
      return NextResponse.json({ error: 'Agent ADB atau HP sedang offline. Hubungkan agent sebelum menguji reward.' }, { status: 503 });
    }

    const actions = data.actions;
    const commandId = await enqueueAdbActions(Array.isArray(actions) ? actions : [actions], {
      eventType: 'manual_test',
      rewardName: typeof data.rewardName === 'string' ? data.rewardName.slice(0, 128) : 'Reward',
    });
    const rewardName = typeof data.rewardName === 'string' ? data.rewardName.slice(0, 128) : 'Reward';
    const eventId = `adb-test-${randomUUID()}`;
    emitGiftEvent({
      eventId,
      msgId: eventId,
      giftName: rewardName,
      namaHadiah: rewardName,
      displayGiftName: rewardName,
      nickname: 'Test Reward',
      username: 'adb_reward_test',
      repeatCount: 1,
      repeatEnd: true,
      timestamp: Date.now(),
      isTest: true,
      triggerRewardsEnabled: true,
    });

    return NextResponse.json({
      success: true,
      queued: true,
      commandId,
      notificationSent: true,
      device: Array.isArray(agent.devices) && agent.devices.length > 0
        ? (agent.devices[0] && typeof agent.devices[0] === 'object' && 'model' in agent.devices[0]
          ? String(agent.devices[0].model)
          : 'Android device')
        : 'Android device',
    }, { status: 202 });
  } catch (err: unknown) {
    console.error("Trigger Event Error:", err);
    const message = err instanceof Error ? err.message : 'Gagal mengantrekan aksi ADB.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
