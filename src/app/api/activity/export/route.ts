import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv';
  const type = searchParams.get('type') || 'all';

  const where: Record<string, unknown> = {};
  if (type !== 'all') where.action = type;

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  if (format === 'json') {
    return NextResponse.json(logs);
  }

  const headers = ['Timestamp', 'Action', 'Resource Type', 'Resource Name', 'IP', 'Details'];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.action,
    log.resourceType || '',
    log.resourceName || '',
    log.ip || '',
    log.details || '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
