import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await prisma.emergencyAccess.findMany({
    where: { userId: user.id },
    include: { trustedUser: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const granted = await prisma.emergencyAccess.findMany({
    where: { trustedUserId: user.id, status: 'active' },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ owned: access, granted });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email, delayHours } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  // Find the trusted user
  const trustedUser = await prisma.user.findUnique({ where: { email } });
  if (!trustedUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (trustedUser.id === user.id) return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });

  const existing = await prisma.emergencyAccess.findFirst({
    where: { userId: user.id, trustedUserId: trustedUser.id },
  });
  if (existing) return NextResponse.json({ error: 'Already configured' }, { status: 409 });

  const access = await prisma.emergencyAccess.create({
    data: {
      userId: user.id,
      trustedUserId: trustedUser.id,
      delayHours: delayHours || 24,
    },
    include: { trustedUser: { select: { id: true, name: true, email: true } } },
  });

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
