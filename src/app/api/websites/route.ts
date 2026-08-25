import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uptimePercent } from '@/lib/uptime';

/** GET /api/websites — monitored sites with live uptime stats. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get('organizationId') || undefined;
  const sites = await prisma.website.findMany({
    where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: [{ status: 'desc' }, { name: 'asc' }],
  });

  const withUptime = await Promise.all(
    sites.map(async (s) => ({ ...s, uptime24h: await uptimePercent(s.id) })),
  );
  return NextResponse.json(withUptime);
}

/** POST /api/websites — start monitoring a site. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, url, organizationId } = await req.json().catch(() => ({}));
  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
  }
  const parsed = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;

  const site = await prisma.website.create({
    data: { name: name.trim(), url: parsed, organizationId: organizationId || null, userId: user.id },
  });
  return NextResponse.json(site, { status: 201 });
}
