import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { sendEmergencyAccessEmail } from '@/lib/email';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const owned = await prisma.emergencyAccess.findMany({
    where: { userId: user.id },
    include: { trustedUser: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const granted = await prisma.emergencyAccess.findMany({
    where: { trustedUserId: user.id, status: 'active' },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const map = (a: { id: string; accessType: string; requestReason: string | null; delayHours: number; status: string; grantAt: Date | null; createdAt: Date; updatedAt: Date }, target: { id: string; name: string | null; email: string }, userId: string) => ({
    id: a.id,
    userId,
    userName: target.name || undefined,
    userEmail: target.email || undefined,
    accessType: (a.accessType as 'view' | 'edit' | 'admin') || 'view',
    delayDays: Math.floor(a.delayHours / 24),
    delayHours: a.delayHours % 24,
    status: a.status,
    requestReason: a.requestReason || undefined,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.grantAt ? a.grantAt.toISOString() : undefined,
    updatedAt: a.updatedAt.toISOString(),
  });

  return NextResponse.json([
    ...owned.map((a) => map(a, a.trustedUser, a.userId)),
    ...granted.map((a) => map(a, a.user, a.userId)),
  ]);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, email, accessType, delayDays, delayHours, requestReason } = await req.json();

  const identifier = userId || email;
  if (!identifier) return NextResponse.json({ error: 'User ID or email required' }, { status: 400 });

  // Find the trusted user
  const trustedUser = identifier.includes('@')
    ? await prisma.user.findUnique({ where: { email: identifier } })
    : await prisma.user.findUnique({ where: { id: identifier } });
  if (!trustedUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (trustedUser.id === user.id) return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });

  const existing = await prisma.emergencyAccess.findFirst({
    where: { userId: user.id, trustedUserId: trustedUser.id },
  });
  if (existing) return NextResponse.json({ error: 'Already configured' }, { status: 409 });

  const delay = ((delayDays || 0) * 24 + (delayHours || 0)) || 24;

  const access = await prisma.emergencyAccess.create({
    data: {
      userId: user.id,
      trustedUserId: trustedUser.id,
      accessType: ['view', 'edit', 'admin'].includes(accessType) ? accessType : 'view',
      requestReason: requestReason || null,
      delayHours: delay,
      status: 'pending',
    },
    include: { trustedUser: { select: { id: true, name: true, email: true } } },
  });

  await createNotification({
    userId: trustedUser.id,
    type: 'emergency',
    title: 'Emergency access request',
    message: `${user.name || user.email} has requested emergency access to their account (granted after ${delay} hour${delay !== 1 ? 's' : ''}).`,
    severity: 'info',
    link: '/dashboard/settings/emergency-access',
  });

  sendEmergencyAccessEmail(trustedUser.email, user.name || user.email, 'requested', delay).catch(() => {});

  return NextResponse.json(access, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const access = await prisma.emergencyAccess.findFirst({
    where: { id, userId: user.id },
  });
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.emergencyAccess.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
