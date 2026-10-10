import { NextResponse } from 'next/server';
import { isAdbAgentConfigured, isAuthorizedAdbAgent } from '@/lib/adb-agent-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isAdbAgentConfigured()) {
    return NextResponse.json({ error: 'ADB_AGENT_TOKEN belum dikonfigurasi.' }, { status: 503 });
  }
  if (!isAuthorizedAdbAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = req.headers.get('x-adb-agent-id')?.slice(0, 128) || 'adb-agent';
  try {
    const rows = await prisma.$queryRaw<Array<{ command: unknown }>>(
      Prisma.sql`select public.claim_adb_command(${agentId}) as command`,
    );
    const command = rows[0]?.command;
    if (!command) return new Response(null, { status: 204 });
    return NextResponse.json({ command });
  } catch (error) {
    console.error('[ADB Agent] Failed to claim command:', error);
    return NextResponse.json({ error: 'Gagal mengambil antrean ADB.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAdbAgentConfigured()) {
    return NextResponse.json({ error: 'ADB_AGENT_TOKEN belum dikonfigurasi.' }, { status: 503 });
  }
  if (!isAuthorizedAdbAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (typeof body.commandId !== 'string' || typeof body.success !== 'boolean') {
      return NextResponse.json({ error: 'commandId dan success wajib diisi.' }, { status: 400 });
    }

    if (
      body.screenshot !== undefined &&
      (typeof body.screenshot !== 'string' || body.screenshot.length > 16 * 1024 * 1024)
    ) {
      return NextResponse.json({ error: 'Screenshot tidak valid atau terlalu besar.' }, { status: 400 });
    }

    const result = {
      output: typeof body.output === 'string' ? body.output.slice(0, 4000) : '',
      error: typeof body.error === 'string' ? body.error.slice(0, 2000) : '',
      ...(typeof body.screenshot === 'string' ? { screenshot: body.screenshot } : {}),
    };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.commandId)) {
      return NextResponse.json({ error: 'commandId tidak valid.' }, { status: 400 });
    }

    const updated = await prisma.adbCommand.updateMany({
      where: { id: body.commandId, status: 'processing' },
      data: {
        status: body.success ? 'completed' : 'failed',
        result: result as Prisma.InputJsonObject,
        completedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Perintah tidak ditemukan atau sudah diproses.' }, { status: 409 });
    }

    if (updated.count !== 1) {
      console.error(`[ADB Agent] Unexpected number of updated commands: ${updated.count}`);
      return NextResponse.json({ error: 'Gagal menyimpan hasil aksi ADB.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ADB Agent] Invalid command result:', error);
    return NextResponse.json({ error: 'Format hasil aksi tidak valid.' }, { status: 400 });
  }
}
