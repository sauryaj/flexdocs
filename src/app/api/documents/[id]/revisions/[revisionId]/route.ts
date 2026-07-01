import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, revisionId } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const revision = await prisma.documentRevision.findFirst({
    where: { id: revisionId, documentId: id, userId: user.id },
  });

  if (!revision) {
    return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  }

  const latestRevision = await prisma.documentRevision.findFirst({
    where: { documentId: id },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latestRevision?.version || 0) + 1;

  const newRevision = await prisma.documentRevision.create({
    data: {
      documentId: id,
      title: revision.title,
      content: revision.content,
      category: revision.category,
      version: nextVersion,
      message: `Restored from revision v${revision.version}`,
      userId: user.id,
    },
  });

  await prisma.document.update({
    where: { id },
    data: {
      title: revision.title,
      content: revision.content,
      category: revision.category,
    },
  });

  return NextResponse.json(newRevision, { status: 201 });
}
