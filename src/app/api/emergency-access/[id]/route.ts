import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status } = await request.json().catch(() => ({}));

  const access = await prisma.emergencyAccess.findFirst({
    where: { id, userId: user.id },
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
  } else if (status === 'revoked') {
    await prisma.emergencyAccess.update({
      where: { id },
      data: { status: 'revoked', requestAt: null, grantAt: null, accessGranted: false },
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