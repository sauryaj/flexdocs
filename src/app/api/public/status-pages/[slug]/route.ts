import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.statusPage.findFirst({
    where: { slug, isPublic: true },
    include: {
      components: { orderBy: { position: 'asc' }, select: { id: true, name: true, status: true } },
      incidents: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, description: true, status: true, createdAt: true } },
    },
  });

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(page);
}