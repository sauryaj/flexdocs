import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, rateLimitResponse, checkAccountLockout, recordFailedLogin, clearFailedLogins } from '@/lib/rate-limit';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { auditLog } from '@/lib/audit';

export async function POST(req: Request) {
  const rl = await checkRateLimit(`login:${req.headers.get('x-forwarded-for') || 'unknown'}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const lockout = await checkAccountLockout(`email:${normalizedEmail}`);
    if (lockout.locked) {
      return NextResponse.json(
        { error: 'Account locked due to too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(lockout.retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.password) {
      await recordFailedLogin(`email:${normalizedEmail}`);
      await auditLog({
        action: 'auth.attempt.failed',
        resourceType: 'user',
        details: { email: normalizedEmail },
        ip,
        userAgent,
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      const updated = await recordFailedLogin(`email:${normalizedEmail}`);
      await auditLog({
        userId: user.id,
        action: 'auth.attempt.failed',
        resourceType: 'user',
        resourceId: user.id,
        resourceName: user.email,
        details: { reason: 'invalid_password' },
        ip,
        userAgent,
      });
      if (updated.locked) {
        return NextResponse.json(
          { error: 'Account locked due to too many failed attempts. Try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(updated.retryAfterMs / 1000)) } }
        );
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await clearFailedLogins(`email:${normalizedEmail}`);

    if (user.mfaEnabled) {
      return NextResponse.json({
        requiresMfa: true,
        email: user.email,
        message: 'MFA authentication required',
      });
    }

    const { cookieValue } = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    response.cookies.set('flexdocs_session', cookieValue, sessionCookieOptions());

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
