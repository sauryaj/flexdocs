import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const pages = await prisma.statusPage.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      components: { orderBy: { position: 'asc' } },
      incidents: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(pages);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, isPublic, organizationId, components } = await req.json();

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const page = await prisma.statusPage.create({
    data: {
      name,
      slug,
      description,
      isPublic: isPublic ?? false,
      organizationId: organizationId || null,
      userId: user.id,
      components: components?.length
        ? {
            create: components.map((c: any, i: number) => ({
              name: c.name,
              status: c.status || 'operational',
              position: c.position ?? i,
            })),
          }
        : undefined,
    },
    include: { components: true },
  });

  return NextResponse.json(page, { status: 201 });
}
