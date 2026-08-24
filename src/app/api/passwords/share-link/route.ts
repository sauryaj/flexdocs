import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

// In-memory or database token store for secure password quickshare links
const tokenStore = new Map<
  string,
  {
    passwordId: string;
    expiresAt: number;
    oneTimeOnly: boolean;
    views: number;
  }
>();

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'password.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { passwordId, durationHours = 24, oneTimeOnly = true } = await req.json();

  if (!passwordId) {
    return NextResponse.json({ error: 'Password ID required' }, { status: 400 });
  }

  const password = await prisma.password.findUnique({
    where: { id: passwordId },
  });

  if (!password) {
    return NextResponse.json({ error: 'Password not found' }, { status: 404 });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + durationHours * 3600 * 1000;

  tokenStore.set(token, {
    passwordId,
    expiresAt,
    oneTimeOnly,
    views: 0,
  });

  const origin = req.headers.get('origin') || 'http://localhost:3000';
  const shareUrl = `${origin}/share/${token}`;

  return NextResponse.json({
    token,
    shareUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    oneTimeOnly,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const record = tokenStore.get(token);

  if (!record) {
    return NextResponse.json({ error: 'Share link invalid or expired' }, { status: 404 });
  }

  if (Date.now() > record.expiresAt) {
    tokenStore.delete(token);
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
  }

  const password = await prisma.password.findUnique({
    where: { id: record.passwordId },
    select: {
      name: true,
      username: true,
      password: true,
      url: true,
      notes: true,
    },
  });

  if (!password) {
    tokenStore.delete(token);
    return NextResponse.json({ error: 'Credential no longer exists' }, { status: 404 });
  }

  record.views += 1;

  if (record.oneTimeOnly) {
    tokenStore.delete(token);
  }

  return NextResponse.json({
    name: password.name,
    username: password.username,
    password: decrypt(password.password),
    url: password.url,
    notes: password.notes,
    burned: record.oneTimeOnly,
  });
}
