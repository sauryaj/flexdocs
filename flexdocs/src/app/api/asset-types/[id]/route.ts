import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const type = await prisma.flexibleAssetType.findFirst({
    where: { id, userId: user.id },
  });

  if (!type) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(type);
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
  const { name, color, icon, fields } = await req.json();

  const type = await prisma.flexibleAssetType.updateMany({
    where: { id, userId: user.id },
    data: {
      name,
      color,
      icon,
      fields: JSON.stringify(fields),
    },
  });

  return NextResponse.json(type);
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

  await prisma.flexibleAssetType.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ message: 'Deleted' });
}
