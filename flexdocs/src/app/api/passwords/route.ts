import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [passwords, total] = await Promise.all([
    prisma.password.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { tags: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.password.count({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);

  const decrypted = passwords.map((p) => ({
    ...p,
    password: decrypt(p.password),
    totpSecret: p.totpSecret ? decrypt(p.totpSecret) : null,
    customFields: JSON.parse(p.customFields || '[]'),
  }));

  return NextResponse.json({ items: decrypted, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    name, username, password, url, notes, category, organizationId, tags,
    rotationDays, totpSecret, totpIssuer, totpPeriod, totpDigits,
    customFields, autofillSelector, autofillNotes,
  } = await req.json();

  const now = new Date();
  const expiresAt = rotationDays
    ? new Date(now.getTime() + rotationDays * 24 * 60 * 60 * 1000)
    : null;

  const passwordEntry = await prisma.password.create({
    data: {
      name, username, password: encrypt(password), url, notes,
      category: category || 'general',
      organizationId: organizationId || null, userId: user.id,
      rotationDays: rotationDays || null, expiresAt, lastRotatedAt: now,
      totpSecret: totpSecret ? encrypt(totpSecret) : null,
      totpIssuer: totpIssuer || null,
      totpPeriod: totpPeriod || 30,
      totpDigits: totpDigits || 6,
      customFields: JSON.stringify(customFields || []),
      autofillSelector: autofillSelector || null,
      autofillNotes: autofillNotes || null,
      tags: tags?.length
        ? {
            connectOrCreate: tags.map((tag: string) => ({
              where: { name_userId: { name: tag, userId: user.id } },
              create: { name: tag, userId: user.id },
            })),
          }
        : undefined,
    },
    include: { tags: true },
  });

  await prisma.passwordHistory.create({
    data: {
      passwordId: passwordEntry.id,
      oldPassword: encrypt(''),
      newPassword: encrypt(password),
      userId: user.id,
      reason: 'creation',
    },
  });

  await auditLog({
    userId: user.id,
    action: 'password.create',
    resourceType: 'password',
    resourceId: passwordEntry.id,
    resourceName: name,
  });

  return NextResponse.json(
    { ...passwordEntry, password, customFields: customFields || [] },
    { status: 201 }
  );
}
