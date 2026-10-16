import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFAULT_PROFILE_ID = '8913094574';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId') || DEFAULT_PROFILE_ID;
  const configuredProfileId = process.env.SOCIABUZZ_MEDIA_SHARE_PROFILE_ID || DEFAULT_PROFILE_ID;

  if (!/^\d{4,20}$/.test(profileId) || profileId !== configuredProfileId) {
    return NextResponse.json({ error: 'SociaBuzz MediaShare profile ID is invalid.' }, { status: 400 });
  }

  const clientId = `${profileId}_mediashare`;

  try {
    const authUrl = new URL('https://sociabuzz.com/pro/ably/auth');
    authUrl.searchParams.set('clientId', clientId);
    const response = await fetch(authUrl, { cache: 'no-store' });
    if (!response.ok) {
      console.error(`[SociaBuzz] Ably auth request failed with status ${response.status}.`);
      return NextResponse.json({ error: 'SociaBuzz MediaShare authorization is unavailable.' }, { status: 502 });
    }

    const tokenRequest: unknown = await response.json();
    if (
      !tokenRequest ||
      typeof tokenRequest !== 'object' ||
      !('keyName' in tokenRequest) ||
      typeof tokenRequest.keyName !== 'string' ||
      !('nonce' in tokenRequest) ||
      typeof tokenRequest.nonce !== 'string' ||
      !('mac' in tokenRequest) ||
      typeof tokenRequest.mac !== 'string' ||
      !('clientId' in tokenRequest) ||
      tokenRequest.clientId !== clientId ||
      !('timestamp' in tokenRequest) ||
      typeof tokenRequest.timestamp !== 'number'
    ) {
      console.error('[SociaBuzz] Ably auth endpoint returned an invalid token request.');
      return NextResponse.json({ error: 'SociaBuzz returned invalid MediaShare authorization.' }, { status: 502 });
    }

    return NextResponse.json(tokenRequest, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[SociaBuzz] Ably auth request failed:', error);
    return NextResponse.json({ error: 'Could not authorize the SociaBuzz MediaShare stream.' }, { status: 502 });
  }
}
