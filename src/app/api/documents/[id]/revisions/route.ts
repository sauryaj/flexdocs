import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const revisions = await prisma.documentRevision.findMany({
    where: { documentId: id, userId: user.id },
    orderBy: { version: 'desc' },
  });

  return NextResponse.json(revisions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { title, content, category, message } = await req.json();

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const latestRevision = await prisma.documentRevision.findFirst({
    where: { documentId: id },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latestRevision?.version || 0) + 1;

  const revision = await prisma.documentRevision.create({
    data: {
      documentId: id,
      title: title ?? document.title,
      content: content ?? document.content,
      category: category ?? document.category,
      version: nextVersion,
      message: message || null,
      userId: user.id,
    },
  });

  await prisma.document.update({
    where: { id },
    data: {
      title: title ?? document.title,
      content: content ?? document.content,
      category: category ?? document.category,
    },
  });

  return NextResponse.json(revision, { status: 201 });
}
