import { SignJWT, jwtVerify } from 'jose';
import { supabaseAdmin } from './supabase';

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'super_secret_virtus_admin_key_2026_tiktok_app_secure'
);

const DEFAULT_ADMIN_USER = process.env.ADMIN_USERNAME || 'virtusx01';
const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || '@Almigty007';

export interface AdminPayload {
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function signAdminToken(payload: { username: string; role: string }): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 days session
    .sign(JWT_SECRET);
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<{ success: boolean; user?: { username: string; role: string }; error?: string }> {
  const cleanUser = (username || '').trim();
  const cleanPass = (password || '').trim();

  if (!cleanUser || !cleanPass) {
    return { success: false, error: 'Username dan password wajib diisi.' };
  }

  // 1. Direct check with configured credentials
  if (cleanUser === DEFAULT_ADMIN_USER && cleanPass === DEFAULT_ADMIN_PASS) {
    return {
      success: true,
      user: { username: DEFAULT_ADMIN_USER, role: 'admin' }
    };
  }

  // 2. Query Supabase admin_users table
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('username', cleanUser)
      .single();

    if (!error && data && data.password === cleanPass) {
      return {
        success: true,
        user: { username: data.username, role: data.role || 'admin' }
      };
    }
  } catch (err: any) {
    console.error('Supabase admin check error:', err.message);
  }

  return { success: false, error: 'Username atau password salah.' };
}
