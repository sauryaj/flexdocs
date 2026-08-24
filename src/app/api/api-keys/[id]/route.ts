import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.apiKey.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
