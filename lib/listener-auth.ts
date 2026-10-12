import { timingSafeEqual } from 'crypto';

export function isAuthorizedTikTokListener(req: Request): boolean {
  const expected = (process.env.TIKTOK_LISTENER_TOKEN || '').trim();
  const authorization = req.headers.get('authorization') || req.headers.get('x-tiktok-listener-token') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization.trim();

  if (!expected) return true;
  if (!supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
