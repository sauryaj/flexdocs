import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const shared = await prisma.passwordShare.findMany({
    where: {
      OR: [
        { sharedWithId: user.id },
        { sharedById: user.id },
      ],
    },
    include: {
      password: { select: { id: true, name: true, username: true } },
      sharedWith: { select: { id: true, name: true, email: true } },
      sharedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter out expired shares
  const now = new Date();
  const active = shared.filter((s) => !s.expiresAt || s.expiresAt > now);

  return NextResponse.json(active);
}

export async function POST(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { passwordId, email, permission, expiresInHours } = await request.json();

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const password = await prisma.password.findFirst({
    where: { id: passwordId, userId: user.id },
  });
  if (!password) {
    return NextResponse.json({ error: 'Password not found' }, { status: 404 });
  }

  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  const share = await prisma.passwordShare.upsert({
    where: { passwordId_sharedWithId: { passwordId, sharedWithId: targetUser.id } },
    update: { permission, expiresAt },
    create: {
      passwordId,
      sharedWithId: targetUser.id,
      sharedById: user.id,
      permission,
      expiresAt,
    },
    include: {
      sharedWith: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(share, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { shareId } = await request.json();
  await prisma.passwordShare.deleteMany({
    where: { id: shareId, OR: [{ sharedWithId: user.id }, { sharedById: user.id }] },
  });

  return NextResponse.json({ success: true });
}
