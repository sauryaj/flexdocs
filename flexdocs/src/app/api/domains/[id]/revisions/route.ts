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

  const domain = await prisma.domain.findFirst({
    where: { id, userId: user.id },
  });

  if (!domain) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const revisions = await prisma.domainRevision.findMany({
    where: { domainId: id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(revisions);
}
