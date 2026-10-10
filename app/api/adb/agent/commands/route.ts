import { NextResponse } from 'next/server';
import { isAdbAgentConfigured, isAuthorizedAdbAgent } from '@/lib/adb-agent-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!isAdbAgentConfigured()) {
    return NextResponse.json({ error: 'ADB_AGENT_TOKEN belum dikonfigurasi.' }, { status: 503 });
  }
  if (!isAuthorizedAdbAgent(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = req.headers.get('x-adb-agent-id')?.slice(0, 128) || 'adb-agent';
  const { data, error } = await supabaseAdmin.rpc('claim_adb_command', { p_agent_id: agentId });
  if (error) {
    console.error('[ADB Agent] Failed to claim command:', error.message);
    return NextResponse.json({ error: 'Gagal mengambil antrean ADB.' }, { status: 500 });
  }

  if (!data) return new Response(null, { status: 204 });
  return NextResponse.json({ command: data });
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

    const result = {
      output: typeof body.output === 'string' ? body.output.slice(0, 4000) : '',
      error: typeof body.error === 'string' ? body.error.slice(0, 2000) : '',
    };
    const { data, error } = await supabaseAdmin
      .from('adb_commands')
      .update({
        status: body.success ? 'completed' : 'failed',
        result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.commandId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[ADB Agent] Failed to report command result:', error.message);
      return NextResponse.json({ error: 'Gagal menyimpan hasil aksi ADB.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Perintah tidak ditemukan atau sudah diproses.' }, { status: 409 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ADB Agent] Invalid command result:', error);
    return NextResponse.json({ error: 'Format hasil aksi tidak valid.' }, { status: 400 });
  }
}
