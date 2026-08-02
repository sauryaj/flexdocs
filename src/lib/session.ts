import { cookies } from 'next/headers';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const COOKIE_NAME = 'flexdocs_session';
const SESSION_TTL_DAYS = 7;
const MAX_SESSIONS_PER_USER = 10;

function getSigningKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET or NEXTAUTH_SECRET must be set');
  }
  return Buffer.from(secret);
}

// Signed token format: "<randomToken>.<hmacSignature>"
export function createSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(token).digest('hex');
  return `${token}.${sig}`;
}

export function verifySessionToken(signed: string): string | null {
  const [token, sig] = signed.split('.');
  if (!token || !sig) return null;
  const expected = crypto.createHmac('sha256', getSigningKey()).update(token).digest('hex');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return token;
}

export function createSessionCookieValue(token: string): string {
  const sig = crypto.createHmac('sha256', getSigningKey()).update(token).digest('hex');
  return `${token}.${sig}`;
}

export async function createSession(userId: string, ip?: string | null, userAgent?: string | null) {
  // Cap the number of active sessions per user (revoke oldest first)
  const count = await prisma.session.count({ where: { userId } });
  if (count >= MAX_SESSIONS_PER_USER) {
    const oldest = await prisma.session.findMany({
      where: { userId },
      orderBy: { lastActive: 'asc' },
      take: count - MAX_SESSIONS_PER_USER + 1,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: oldest.map((s) => s.id) } } });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: {
      userId,
      token,
      ip: ip || null,
      userAgent: userAgent || null,
    },
  });

  return { session, cookieValue: createSessionCookieValue(token) };
}

export async function destroySession(cookieValue?: string) {
  const raw = cookieValue || (await getSessionCookieValue());
  const token = verifySessionToken(raw || '');
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
}

async function getSessionCookieValue(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  };
}

export { COOKIE_NAME };
