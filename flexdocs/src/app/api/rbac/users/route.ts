import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, createdAt: true, emailVerified: true,
      _count: { select: { documents: true, passwords: true, domains: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(users);
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: 'userId and role required' }, { status: 400 });

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ success: true });
}
