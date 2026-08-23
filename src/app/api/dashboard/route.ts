import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDaysUntilExpiry } from '@/lib/utils';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const where = {
    userId: user.id,
    ...(organizationId ? { organizationId } : {}),
  };

  const [docCount, passCount, domainCount, domains, recentDocs, recentPasswords, recentActivity] =
    await Promise.all([
      prisma.document.count({ where }),
      prisma.password.count({ where }),
      prisma.domain.count({ where }),
      prisma.domain.findMany({
        where,
        orderBy: { expiresAt: 'asc' },
        take: 5,
      }),
      prisma.document.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      prisma.password.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      prisma.activityLog.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 13 * 86400000) },
        },
        select: { createdAt: true },
      }),
    ]);

  const expiringDomains = domains.filter(
    (d) => d.expiresAt && getDaysUntilExpiry(d.expiresAt) < 30
  );

  const dayLabels: string[] = [];
  const buckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key);
    buckets.set(key, 0);
  }
  for (const a of recentActivity) {
    const key = a.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const activityTrend = dayLabels.map((key) => ({
    date: key.slice(5),
    count: buckets.get(key) || 0,
  }));

  return NextResponse.json({
    docCount,
    passCount,
    domainCount,
    expiringDomains,
    recentDocs,
    recentPasswords,
    activityTrend,
  });
}
