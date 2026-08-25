import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkWebsite, uptimePercent } from '@/lib/uptime';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.website.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, url, organizationId } = await req.json().catch(() => ({}));
  const site = await prisma.website.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(url !== undefined ? { url: /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}` } : {}),
      ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
    },
  });
  return NextResponse.json(site);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.website.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.website.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

/** POST /api/websites/[id]/check — run an on-demand uptime check. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.website.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await checkWebsite(id);
  const site = await prisma.website.findUnique({ where: { id } });
  return NextResponse.json({ ...result, status: site?.status, uptime24h: await uptimePercent(id) });
}
