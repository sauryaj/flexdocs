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
  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { tags: true, folder: true },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(document);
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
  const { title, content, category, folderId, isPinned, isArchived, tags } = await req.json();

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.document.update({
    where: { id },
    data: {
      title,
      content,
      category,
      folderId: folderId || null,
      isPinned,
      isArchived,
    },
  });

  if (tags !== undefined) {
    await prisma.$executeRaw`DELETE FROM _DocumentToTag WHERE A = ${id}`;
    if (tags.length > 0) {
      const tagResults = await Promise.all(
        tags.map((tagName: string) =>
          prisma.tag.upsert({
            where: { name_userId: { name: tagName, userId: user.id } },
            update: {},
            create: { name: tagName, userId: user.id },
          })
        )
      );
      await Promise.all(
        tagResults.map((tag) =>
          prisma.$executeRaw`INSERT INTO _DocumentToTag (A, B) VALUES (${id}, ${tag.id})`
        )
      );
    }
  }

  const updated = await prisma.document.findFirst({
    where: { id },
    include: { tags: true },
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

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.document.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
