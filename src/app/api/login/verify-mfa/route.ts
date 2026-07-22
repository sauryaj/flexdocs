import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/totp';

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and 2FA code are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.mfaSecret || !user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled for this user' }, { status: 400 });
    }

    const isValid = verifyToken(user.mfaSecret, code.trim());
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
    }

    const response = NextResponse.json({
      message: 'MFA Verification successful',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    // Set Session Cookie
    response.cookies.set('flexdocs_session', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
