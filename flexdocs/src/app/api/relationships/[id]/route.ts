import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const relationship = await prisma.relationship.findUnique({
    where: { id },
  });

  if (!relationship) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.relationship.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
