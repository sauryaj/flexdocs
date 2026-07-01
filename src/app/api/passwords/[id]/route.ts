import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const password = await prisma.password.findFirst({
    where: { id, userId: user.id },
    include: { tags: true },
  });

  if (!password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await auditLog({
    userId: user.id,
    action: 'password.view',
    resourceType: 'password',
    resourceId: id,
    resourceName: password.name,
  });

  return NextResponse.json({
    ...password,
    password: decrypt(password.password),
    totpSecret: password.totpSecret ? decrypt(password.totpSecret) : null,
    customFields: JSON.parse(password.customFields || '[]'),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const {
    name, username, password, url, notes, category, isFavorite, tags,
    rotationDays, totpSecret, totpIssuer, totpPeriod, totpDigits,
    customFields, autofillSelector, autofillNotes,
  } = await req.json();

  const existing = await prisma.password.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const passwordChanged = password && decrypt(existing.password) !== password;
  const now = new Date();

  // Calculate new expiry if rotation changed
  let expiresAt = existing.expiresAt;
  if (rotationDays !== undefined && rotationDays !== existing.rotationDays) {
    expiresAt = rotationDays ? new Date(now.getTime() + rotationDays * 24 * 60 * 60 * 1000) : null;
  } else if (passwordChanged && existing.rotationDays) {
    expiresAt = new Date(now.getTime() + existing.rotationDays * 24 * 60 * 60 * 1000);
  }

  await prisma.password.update({
    where: { id },
    data: {
      name,
      username,
      password: password ? encrypt(password) : undefined,
      url,
      notes,
      category,
      isFavorite,
      rotationDays: rotationDays !== undefined ? rotationDays : undefined,
      expiresAt,
      lastRotatedAt: passwordChanged ? now : undefined,
      totpSecret: totpSecret !== undefined ? (totpSecret ? encrypt(totpSecret) : null) : undefined,
      totpIssuer: totpIssuer !== undefined ? totpIssuer : undefined,
      totpPeriod: totpPeriod || undefined,
      totpDigits: totpDigits || undefined,
      customFields: customFields !== undefined ? JSON.stringify(customFields) : undefined,
      autofillSelector: autofillSelector !== undefined ? autofillSelector : undefined,
      autofillNotes: autofillNotes !== undefined ? autofillNotes : undefined,
    },
  });

  // Track password change in history
  if (passwordChanged) {
    await prisma.passwordHistory.create({
      data: {
        passwordId: id,
        oldPassword: existing.password,
        newPassword: encrypt(password),
        userId: user.id,
        reason: 'manual',
      },
    });
  }

  if (tags !== undefined) {
    await prisma.$executeRaw`DELETE FROM _PasswordToTag WHERE A = ${id}`;
    if (tags.length > 0) {
      const tagResults = await Promise.all(
        tags.map((tagName: string) =>
          prisma.tag.upsert({
            where: { name_userId: { name: tagName, userId: user.id } },
            update: {},
            create: { name: tagName, userId: user.id },
          })
        )
      );
      await Promise.all(
        tagResults.map((tag) =>
          prisma.$executeRaw`INSERT INTO _PasswordToTag (A, B) VALUES (${id}, ${tag.id})`
        )
      );
    }
  }

  const updated = await prisma.password.findFirst({
    where: { id },
    include: { tags: true },
  });

  await auditLog({
    userId: user.id,
    action: 'password.update',
    resourceType: 'password',
    resourceId: id,
    resourceName: name,
  });

  return NextResponse.json({
    ...updated!,
    password: decrypt(updated!.password),
    totpSecret: updated!.totpSecret ? decrypt(updated!.totpSecret) : null,
    customFields: JSON.parse(updated!.customFields || '[]'),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.password.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.password.delete({ where: { id } });

  await auditLog({
    userId: user.id,
    action: 'password.delete',
    resourceType: 'password',
    resourceId: id,
    resourceName: existing.name,
  });

  return NextResponse.json({ message: 'Deleted' });
}
