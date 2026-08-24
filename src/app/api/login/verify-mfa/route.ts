import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/totp';
import { checkRateLimit, rateLimitResponse, clearFailedLogins, checkAccountLockout, recordFailedLogin } from '@/lib/rate-limit';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { auditLog } from '@/lib/audit';

export async function POST(req: Request) {
  const rl = await checkRateLimit(`verify-mfa:${req.headers.get('x-forwarded-for') || 'unknown'}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and 2FA code are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const lockout = await checkAccountLockout(`mfa:${normalizedEmail}`);
    if (lockout.locked) {
      return NextResponse.json(
        { error: 'Account locked due to too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(lockout.retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.mfaSecret || !user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled for this user' }, { status: 400 });
    }

    const isValid = verifyToken(user.mfaSecret, code.trim());
    if (!isValid) {
      await recordFailedLogin(`mfa:${normalizedEmail}`);
      await auditLog({
        userId: user.id,
        action: 'auth.attempt.failed',
        resourceType: 'user',
        resourceId: user.id,
        resourceName: user.email,
        details: { reason: 'invalid_mfa_code' },
        ip,
        userAgent,
      });
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
    }

    await clearFailedLogins(`mfa:${normalizedEmail}`);
    const { cookieValue } = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      message: 'MFA Verification successful',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    response.cookies.set('flexdocs_session', cookieValue, sessionCookieOptions());

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
