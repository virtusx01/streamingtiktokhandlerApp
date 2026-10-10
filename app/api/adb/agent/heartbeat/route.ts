import { NextResponse } from 'next/server';
import { isAdbAgentConfigured, isAuthorizedAdbAgent } from '@/lib/adb-agent-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdbAgentConfigured()) {
    return NextResponse.json({ error: 'ADB_AGENT_TOKEN belum dikonfigurasi.' }, { status: 503 });
  }
  if (!isAuthorizedAdbAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (typeof body.agentId !== 'string' || typeof body.connected !== 'boolean' || !Array.isArray(body.devices)) {
      return NextResponse.json({ error: 'Status agent tidak valid.' }, { status: 400 });
    }

    const devices = body.devices.slice(0, 10).flatMap((device: unknown) => {
      if (!device || typeof device !== 'object') return [];
      const value = device as Record<string, unknown>;
      return [{
        serial: typeof value.serial === 'string' ? value.serial.slice(0, 128) : '',
        status: typeof value.status === 'string' ? value.status.slice(0, 32) : '',
        isWireless: Boolean(value.isWireless),
        model: typeof value.model === 'string' ? value.model.slice(0, 128) : 'Unknown Device',
      }];
    });

    await prisma.adbAgent.upsert({
      where: { agentId: body.agentId.slice(0, 128) },
      create: {
        agentId: body.agentId.slice(0, 128),
        lastSeen: new Date(),
        adbConnected: body.connected,
        devices: devices as Prisma.InputJsonArray,
      },
      update: {
        lastSeen: new Date(),
        adbConnected: body.connected,
        devices: devices as Prisma.InputJsonArray,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ADB Agent] Invalid heartbeat:', error);
    return NextResponse.json({ error: 'Format heartbeat tidak valid.' }, { status: 400 });
  }
}
