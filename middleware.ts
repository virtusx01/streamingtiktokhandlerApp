import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'super_secret_virtus_admin_key_2026_tiktok_app_secure'
);

// Paths that bypass authentication
const PUBLIC_PREFIXES = [
  '/_next',
  '/favicon.ico',
  '/uploads',
  '/api/auth/login',
  '/api/auth/logout',
  // Allow internal scripts/listeners/webhooks to communicate without browser cookies
  '/api',
  // Public stream overlays (settings button hidden if not admin)
  '/widget',
  '/comment'
];

async function isValidAdmin(token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload && payload.role === 'admin';
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1. Allow public static assets and API routes
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Also allow static files with common extensions
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|json)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('admin_session')?.value;
  const isAuth = await isValidAdmin(token);

  // 2. If visiting /login:
  if (pathname === '/login') {
    if (isAuth) {
      // Already logged in, redirect to home
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // 3. For ALL other pages: require admin authentication
  if (!isAuth) {
    const redirectUrl = new URL('/login', req.url);
    if (pathname !== '/') {
      redirectUrl.searchParams.set('from', pathname + search);
    }
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files with extensions
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
