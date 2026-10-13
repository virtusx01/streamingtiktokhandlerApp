import { NextResponse } from 'next/server';
import { getResponsiveVoiceClient } from '@/lib/responsivevoice-server';

export const dynamic = 'force-dynamic';

type VoiceOptions = {
  name: string;
  flag: string;
  lang: string;
  gender: string;
  provider: string | null;
  isByok: boolean;
  deprecated: boolean;
}[];

let cachedVoices: VoiceOptions | null = null;
let cachedAt = 0;
let voicesRequest: Promise<VoiceOptions> | null = null;
const VOICE_CACHE_MS = 10 * 60 * 1000;

export async function GET() {
  if (!process.env.RESPONSIVEVOICE_API_KEY?.trim() || !process.env.RESPONSIVEVOICE_API_SECRET?.trim()) {
    return NextResponse.json(
      { configured: false, voices: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    if (!cachedVoices || Date.now() - cachedAt >= VOICE_CACHE_MS) {
      voicesRequest ??= getResponsiveVoiceClient()
        .getVoices()
        .then(({ voices }) => voices.map(voice => ({
          name: voice.name,
          flag: voice.flag,
          lang: voice.lang,
          gender: voice.gender,
          provider: voice.provider ?? null,
          isByok: voice.isByok === true,
          deprecated: voice.deprecated === true,
        })).sort((left, right) => left.lang.localeCompare(right.lang) || left.name.localeCompare(right.name)))
        .then(voices => {
          cachedVoices = voices;
          cachedAt = Date.now();
          return voices;
        })
        .finally(() => {
          voicesRequest = null;
        });
      await voicesRequest;
    }

    return NextResponse.json(
      { configured: true, voices: cachedVoices },
      { headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('[SociaBuzz] ResponsiveVoice voice list request failed:', error);
    return NextResponse.json(
      { configured: true, error: 'Gagal memuat daftar suara ResponsiveVoice.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
