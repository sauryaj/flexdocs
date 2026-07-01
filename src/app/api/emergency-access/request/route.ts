import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Find the emergency access where user is the trusted contact
  const access = await prisma.emergencyAccess.findFirst({
    where: { id, trustedUserId: user.id, status: 'active' },
  });
  if (!access) return NextResponse.json({ error: 'Not found or not active' }, { status: 404 });

  // Request access
  const now = new Date();
  const grantAt = new Date(now.getTime() + access.delayHours * 60 * 60 * 1000);

  const updated = await prisma.emergencyAccess.update({
    where: { id },
    data: {
      requestAt: now,
      grantAt,
      status: 'pending',
    },
  });

  return NextResponse.json(updated);
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action } = await req.json(); // action: "approve" | "deny"
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  // Find the emergency access where user is the owner
  const access = await prisma.emergencyAccess.findFirst({
    where: { id, userId: user.id },
  });
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'approve') {
    await prisma.emergencyAccess.update({
      where: { id },
      data: { accessGranted: true, status: 'active' },
    });
  } else if (action === 'deny') {
    await prisma.emergencyAccess.update({
      where: { id },
      data: { requestAt: null, grantAt: null, status: 'active' },
    });
  }

  return NextResponse.json({ success: true });
}
