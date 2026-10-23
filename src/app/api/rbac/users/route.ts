import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { administerAccount } from '@/lib/account-administration';
import { DocumentationGrantError } from '@/lib/documentation-grants';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, createdAt: true, emailVerified: true,
      _count: { select: { documents: { where: { deletedAt: null } }, passwords: true, domains: true } },
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

  const { userId, role } = await req.json().catch(() => ({}));
  if (typeof userId !== 'string' || !userId || typeof role !== 'string') return NextResponse.json({ error: 'userId and role required' }, { status: 400 });

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    return NextResponse.json(await administerAccount(user.id, userId, role as 'admin' | 'editor' | 'viewer'));
  } catch (error) {
    if (error instanceof DocumentationGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
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

  try {
    await administerAccount(user.id, userId, null);
  } catch (error) {
    if (error instanceof DocumentationGrantError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ success: true });
}
