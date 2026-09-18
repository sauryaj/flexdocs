import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const { name, description, category, priority, active, fields, organizationId } = body;

  const existing = await prisma.serviceRequestTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (fields !== undefined) {
    if (!Array.isArray(fields)) return NextResponse.json({ error: 'fields must be an array' }, { status: 400 });
    for (const f of fields) {
      if (!f?.key || !f?.label) return NextResponse.json({ error: 'each field needs key and label' }, { status: 400 });
    }
  }

  const template = await prisma.serviceRequestTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(description !== undefined ? { description: String(description) } : {}),
      ...(category !== undefined ? { category: String(category) } : {}),
      ...(priority !== undefined ? { priority: String(priority) } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
      ...(fields !== undefined ? { fields: JSON.stringify(fields) } : {}),
      ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
    },
  });
  return NextResponse.json(template);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await prisma.serviceRequestTemplate.delete({ where: { id } }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}