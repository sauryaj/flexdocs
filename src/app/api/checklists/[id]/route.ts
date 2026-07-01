import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const checklist = await prisma.checklist.findFirst({
    where: { id, userId: user.id },
    include: { items: { orderBy: { order: 'asc' } }, tags: true },
  });

  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(checklist);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { name, description, category, isComplete, isArchived, dueDate, items, tags } = await req.json();

  const existing = await prisma.checklist.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Update items if provided
  if (items !== undefined) {
    await prisma.checklistItem.deleteMany({ where: { checklistId: id } });
    await prisma.checklistItem.createMany({
      data: items.map((item: any, index: number) => ({
        text: item.text,
        isComplete: item.isComplete || false,
        order: item.order ?? index,
        checklistId: id,
      })),
    });
  }

  const updated = await prisma.checklist.update({
    where: { id },
    data: {
      name,
      description,
      category,
      isComplete,
      isArchived,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: tags !== undefined
        ? {
            set: [],
            connectOrCreate: tags.map((tagName: string) => ({
              where: { name_userId: { name: tagName, userId: user.id } },
              create: { name: tagName, userId: user.id },
            })),
          }
        : undefined,
    },
    include: { items: { orderBy: { order: 'asc' } }, tags: true },
  });

  await auditLog({
    userId: user.id,
    action: isComplete ? 'checklist.complete' : 'checklist.update',
    resourceType: 'checklist',
    resourceId: id,
    resourceName: name,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.checklist.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.checklist.delete({ where: { id } });

  await auditLog({
    userId: user.id,
    action: 'checklist.delete',
    resourceType: 'checklist',
    resourceId: id,
    resourceName: existing.name,
  });

  return NextResponse.json({ message: 'Deleted' });
}
