import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const MAX_PER_TYPE = 10;

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const contains = { contains: q };

  const [documents, passwords, domains, assets, checklists] = await Promise.all([
    prisma.document.findMany({
      where: {
        userId: user.id,
        OR: [{ title: contains }, { content: contains }],
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.password.findMany({
      where: {
        userId: user.id,
        OR: [{ name: contains }, { username: contains }, { url: contains }],
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.domain.findMany({
      where: {
        userId: user.id,
        OR: [{ name: contains }, { registrar: contains }],
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.flexibleAsset.findMany({
      where: {
        userId: user.id,
        OR: [{ name: contains }, { assetType: contains }],
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.checklist.findMany({
      where: {
        userId: user.id,
        OR: [{ name: contains }, { description: contains }],
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    documents,
    passwords,
    domains,
    assets,
    checklists,
  });
}
