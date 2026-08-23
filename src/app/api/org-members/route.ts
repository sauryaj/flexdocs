import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId');

  const members = await prisma.organizationMember.findMany({
    where: organizationId ? { organizationId } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    members.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt,
      userId: m.user.id,
      userName: m.user.name,
      userEmail: m.user.email,
      organizationId: m.organization.id,
      organizationName: m.organization.name,
    })),
  );
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, organizationId, role } = await req.json().catch(() => ({}));
  if (!email || !organizationId) {
    return NextResponse.json({ error: 'email and organizationId required' }, { status: 400 });
  }
  if (role && !['client', 'org_admin'].includes(role)) {
    return NextResponse.json({ error: "role must be 'client' or 'org_admin'" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'No user with that email — invite them first' }, { status: 404 });

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  const member = await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId: target.id } },
    update: { role: role || 'client' },
    create: { organizationId, userId: target.id, role: role || 'client' },
    include: {
      user: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
  });

  return NextResponse.json(
    {
      id: member.id,
      role: member.role,
      userName: member.user.name,
      userEmail: member.user.email,
      organizationName: member.organization.name,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'user.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await prisma.organizationMember.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
