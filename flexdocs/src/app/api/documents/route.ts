import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { tags: true, folder: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.document.count({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);

  return NextResponse.json({ items: documents, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, content, category, folderId, organizationId, tags } = await req.json();

  const document = await prisma.document.create({
    data: {
      title, content: content || '',
      category: category || 'general',
      folderId: folderId || null,
      organizationId: organizationId || null, userId: user.id,
      tags: tags?.length
        ? {
            connectOrCreate: tags.map((tag: string) => ({
              where: { name_userId: { name: tag, userId: user.id } },
              create: { name: tag, userId: user.id },
            })),
          }
        : undefined,
    },
    include: { tags: true },
  });

  await prisma.documentRevision.create({
    data: {
      documentId: document.id, title: document.title, content: document.content,
      category: document.category, version: 1, message: 'Initial version', userId: user.id,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
