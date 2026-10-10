import { timingSafeEqual } from 'crypto';

export function isAuthorizedTikTokListener(req: Request): boolean {
  const expected = process.env.TIKTOK_LISTENER_TOKEN;
  const authorization = req.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
