import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkDomain } from '@/lib/domain-monitor';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { domainId, all } = await req.json();

  if (all) {
    // Check all domains for this user
    const domains = await prisma.domain.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const results = [];
    for (const d of domains) {
      const result = await checkDomain(d.id);
      results.push(result);
    }

    return NextResponse.json({
      total: domains.length,
      results,
    });
  }

  if (!domainId) {
    return NextResponse.json({ error: 'domainId or all required' }, { status: 400 });
  }

  const domain = await prisma.domain.findFirst({
    where: { id: domainId, userId: user.id },
  });
  if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await checkDomain(domainId);
  return NextResponse.json(result);
}
