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
  const asset = await prisma.flexibleAsset.findFirst({
    where: { id, userId: user.id },
    include: { tags: true },
  });

  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(asset);
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
  const { name, assetType, fields, notes, isArchived, tags } = await req.json();

  const existing = await prisma.flexibleAsset.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.flexibleAsset.update({
    where: { id },
    data: {
      name,
      assetType,
      fields: JSON.stringify(fields),
      notes,
      isArchived,
    },
  });

  if (tags !== undefined) {
    await prisma.$executeRaw`DELETE FROM _FlexibleAssetToTag WHERE A = ${id}`;
    for (const tagName of tags) {
      const tag = await prisma.tag.upsert({
        where: { name_userId: { name: tagName, userId: user.id } },
        update: {},
        create: { name: tagName, userId: user.id },
      });
      await prisma.$executeRaw`INSERT INTO _FlexibleAssetToTag (A, B) VALUES (${id}, ${tag.id})`;
    }
  }

  const updated = await prisma.flexibleAsset.findFirst({
    where: { id },
    include: { tags: true },
  });

  await auditLog({
    userId: user.id,
    action: 'asset.update',
    resourceType: 'asset',
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

  const existing = await prisma.flexibleAsset.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.flexibleAsset.delete({ where: { id } });

  await auditLog({
    userId: user.id,
    action: 'asset.delete',
    resourceType: 'asset',
    resourceId: id,
    resourceName: existing.name,
  });

  return NextResponse.json({ message: 'Deleted' });
}
