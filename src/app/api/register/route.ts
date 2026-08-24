import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createSession, sessionCookieOptions, COOKIE_NAME } from '@/lib/session';

export async function POST(req: Request) {
  const rl = await checkRateLimit(`register:${req.headers.get('x-forwarded-for') || 'unknown'}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  try {
    const { name, email, password } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'viewer' },
    });

    // Log the new user straight in so registration isn't a dead end
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const { cookieValue } = await createSession(user.id, ip, userAgent);
    const res = NextResponse.json({ message: 'User created', userId: user.id }, { status: 201 });
    res.cookies.set(COOKIE_NAME, cookieValue, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
