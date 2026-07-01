import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { randomBytes } from 'crypto';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const invitations = await prisma.invitation.findMany({
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(invitations);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, role } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role: role || 'editor',
      token,
      invitedById: user.id,
      expiresAt,
    },
  });

  // TODO: Send invitation email here
  // await sendInvitationEmail(email, token);

  return NextResponse.json(invitation, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.invite')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await prisma.invitation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
