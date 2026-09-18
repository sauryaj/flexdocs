import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rotatePassword } from '@/lib/password-rotation';

/** Manual rotate: owner of the credential, or admin/editor staff who can view it. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.password.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = entry.userId === user.id;
  const isStaff = user.role === 'admin' || user.role === 'editor';
  const orgMember = entry.organizationId
    ? await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: entry.organizationId, userId: user.id } },
      })
        .then((m) => !!m)
        .catch(() => false)
    : false;
  if (!isOwner && !(isStaff && orgMember)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await rotatePassword(id, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}