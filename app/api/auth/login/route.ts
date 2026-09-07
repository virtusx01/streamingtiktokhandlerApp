import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, signAdminToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    const result = await authenticateAdmin(username, password);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error || 'Username atau password salah' },
        { status: 401 }
      );
    }

    const token = await signAdminToken({
      username: result.user.username,
      role: result.user.role
    });

    const response = NextResponse.json({
      success: true,
      user: result.user,
      message: 'Login admin berhasil'
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: 'admin_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan pada server saat login' },
      { status: 500 }
    );
  }
}
