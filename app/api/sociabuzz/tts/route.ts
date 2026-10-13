import { NextResponse } from 'next/server';
import { getResponsiveVoiceClient } from '@/lib/responsivevoice-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_TEXT_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 60;
const requestsByAddress = new Map<string, { count: number; resetAt: number }>();

function getClientAddress(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedAddresses = forwardedFor?.split(',').map(address => address.trim()).filter(Boolean);
  return forwardedAddresses?.at(-1) || request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(address: string): boolean {
  const now = Date.now();
  if (requestsByAddress.size > 1000) {
    for (const [savedAddress, limit] of requestsByAddress) {
      if (limit.resetAt <= now) requestsByAddress.delete(savedAddress);
    }
    while (requestsByAddress.size > 1000) {
      const oldestAddress = requestsByAddress.keys().next();
      if (oldestAddress.done) break;
      requestsByAddress.delete(oldestAddress.value);
    }
  }
  const current = requestsByAddress.get(address);
  if (!current || current.resetAt <= now) {
    requestsByAddress.set(address, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_REQUESTS;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return NextResponse.json({ error: 'Permintaan TTS terlalu besar.' }, { status: 413 });
  }

  if (isRateLimited(getClientAddress(request))) {
    return NextResponse.json(
      { error: 'Batas permintaan TTS tercapai. Coba lagi sebentar.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
    );
  }

  if (!process.env.RESPONSIVEVOICE_API_KEY?.trim() || !process.env.RESPONSIVEVOICE_API_SECRET?.trim()) {
    return NextResponse.json(
      { error: 'ResponsiveVoice belum dikonfigurasi; gunakan suara browser.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Format permintaan TTS tidak valid.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Format permintaan TTS tidak valid.' }, { status: 400 });
  }

  const { text, voice, rate, pitch } = body as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Teks TTS harus berisi 1 sampai ${MAX_TEXT_LENGTH} karakter.` }, { status: 400 });
  }
  if (typeof voice !== 'string' || !voice.trim() || voice.length > 200) {
    return NextResponse.json({ error: 'Pilihan suara tidak valid.' }, { status: 400 });
  }
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.5 || rate > 2) {
    return NextResponse.json({ error: 'Kecepatan suara harus antara 0,5 dan 2.' }, { status: 400 });
  }
  if (typeof pitch !== 'number' || !Number.isFinite(pitch) || pitch < 0 || pitch > 2) {
    return NextResponse.json({ error: 'Nada suara harus antara 0 dan 2.' }, { status: 400 });
  }

  try {
    const audio = await getResponsiveVoiceClient().synthesize({
      text: text.trim(),
      voice: voice.trim(),
      rate,
      pitch,
      format: 'mp3',
    });
    const bytes = await audio.blob.arrayBuffer();
    return new Response(bytes, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[SociaBuzz] ResponsiveVoice synthesis failed:', error);
    return NextResponse.json(
      { error: 'ResponsiveVoice gagal membuat audio; suara browser akan digunakan.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
