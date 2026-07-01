import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchCosts } from '@/lib/aws-discovery';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('organizationId') || undefined;
  const period = searchParams.get('period') || undefined;
  const provider = searchParams.get('provider') || undefined;

  const where: any = { userId: user.id };
  if (orgId) where.organizationId = orgId;
  if (period) where.period = period;
  if (provider) where.provider = provider;

  const entries = await prisma.costEntry.findMany({
    where,
    orderBy: { fetchedAt: 'desc' },
    take: 500,
  });

  const budgets = await prisma.costBudget.findMany({
    where: { userId: user.id, ...(orgId ? { organizationId: orgId } : {}) },
  });

  const totalCost = entries.reduce((sum, e) => sum + e.amount, 0);

  const byService: Record<string, number> = {};
  for (const entry of entries) {
    byService[entry.service] = (byService[entry.service] || 0) + entry.amount;
  }

  return NextResponse.json({
    entries,
    budgets,
    totalCost: Math.round(totalCost * 100) / 100,
    byService,
    entryCount: entries.length,
  });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, credentials, organizationId, name, provider, service, monthlyLimit, alertThreshold } = await req.json();

  if (action === 'fetch') {
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = now.toISOString().split('T')[0];

    const costs = await fetchCosts(credentials, startDate, endDate);
    const created = [];

    for (const cost of costs) {
      const item = await prisma.costEntry.create({
        data: {
          provider: 'aws',
          service: cost.service,
          amount: cost.amount,
          period: cost.period,
          periodType: 'monthly',
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
      created.push(item);
    }

    return NextResponse.json({ fetched: costs.length, created: created.length });
  }

  if (action === 'create-budget') {
    const budget = await prisma.costBudget.create({
      data: {
        name: name || 'Budget',
        provider: provider || null,
        service: service || null,
        monthlyLimit,
        alertThreshold: alertThreshold || 80,
        organizationId: organizationId || null,
        userId: user.id,
      },
    });
    return NextResponse.json(budget);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
