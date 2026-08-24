import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.ipamNetwork.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, cidr, vlanId, notes, organizationId } = await req.json().catch(() => ({}));
  const network = await prisma.ipamNetwork.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(cidr !== undefined ? { cidr: cidr.trim() } : {}),
      ...(vlanId !== undefined ? { vlanId: vlanId ? parseInt(vlanId, 10) : null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
    },
  });
  return NextResponse.json(network);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.ipamNetwork.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.ipamNetwork.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
