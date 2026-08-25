import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.location.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, address, city, state, country, notes, organizationId } = await req.json().catch(() => ({}));
  if (organizationId !== undefined && organizationId && !(await canAccessOrganization(user.id, user.role, organizationId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(city !== undefined ? { city: city || null } : {}),
      ...(state !== undefined ? { state: state || null } : {}),
      ...(country !== undefined ? { country: country || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
    },
  });
  return NextResponse.json(location);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.location.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.location.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
