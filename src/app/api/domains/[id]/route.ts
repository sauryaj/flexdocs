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
    include: { tags: true },
  });

  if (!domain) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(domain);
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
  const { name, registrar, nameservers, expiresAt, autoRenew, status, notes, tags } = await req.json();

  const existing = await prisma.domain.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.domain.update({
    where: { id },
    data: {
      name,
      registrar,
      nameservers,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      autoRenew,
      status,
      notes,
    },
  });

  if (tags !== undefined) {
    await prisma.$executeRaw`DELETE FROM _DomainToTag WHERE A = ${id}`;
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
          prisma.$executeRaw`INSERT INTO _DomainToTag (A, B) VALUES (${id}, ${tag.id})`
        )
      );
    }
  }

  const updated = await prisma.domain.findFirst({
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

  const existing = await prisma.domain.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.domain.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
