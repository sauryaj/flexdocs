import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status } = await request.json().catch(() => ({}));

  const access = await prisma.emergencyAccess.findFirst({
    where: { id, userId: user.id },
    include: { trustedUser: { select: { name: true, email: true } } },
  });
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (status === 'approved') {
    const now = new Date();
    await prisma.emergencyAccess.update({
      where: { id },
      data: {
        status: 'pending',
        accessGranted: true,
        requestAt: now,
        grantAt: new Date(now.getTime() + access.delayHours * 60 * 60 * 1000),
      },
    });

    await createNotification({
      userId: access.trustedUserId,
      type: 'emergency',
      title: 'Emergency access approved',
      message: `${user.name || user.email} approved your emergency access request. Access will be granted after the delay window.`,
      severity: 'warning',
      link: '/dashboard/settings/emergency-access',
    });
  } else if (status === 'revoked') {
    await prisma.emergencyAccess.update({
      where: { id },
      data: { status: 'revoked', requestAt: null, grantAt: null, accessGranted: false },
    });

    await createNotification({
      userId: access.trustedUserId,
      type: 'emergency',
      title: 'Emergency access revoked',
      message: `Your emergency access to ${user.name || user.email}'s account was revoked.`,
      severity: 'info',
      link: '/dashboard/settings/emergency-access',
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await prisma.emergencyAccess.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}