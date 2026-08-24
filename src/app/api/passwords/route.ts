import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const scope = await getOrgScope(user.id, user.role);
  const orgWhere = scopeOrgWhere(scope, organizationId);
  const where =
    scope.mode === 'limited'
      ? orgWhere
      : { userId: user.id, ...(organizationId ? { organizationId } : {}) };

  const passwords = await prisma.password.findMany({
    where,
    include: { tags: true },
    orderBy: { updatedAt: 'desc' },
    skip: page * limit,
    take: limit,
  });

  const total = await prisma.password.count({ where });

  // Metadata only — never ship decrypted secrets in list responses.
  // Secrets are fetched on-demand via GET /api/passwords/[id]/reveal.
  const sanitized = passwords.map((p) => ({
    ...p,
    password: undefined,
    totpSecret: undefined,
    hasPassword: !!p.password,
    hasTotp: !!p.totpSecret,
    customFields: JSON.parse(p.customFields || '[]'),
  }));

  return NextResponse.json({ items: sanitized, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'password.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
