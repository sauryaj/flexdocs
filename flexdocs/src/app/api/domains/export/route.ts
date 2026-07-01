import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const domains = await prisma.domain.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { tags: true },
    orderBy: { name: 'asc' },
  });

  const headers = [
    'name',
    'registrar',
    'nameservers',
    'expiresAt',
    'autoRenew',
    'status',
    'notes',
    'tags',
    'createdAt',
    'updatedAt',
  ];

  const csvRows = [headers.join(',')];

  for (const domain of domains) {
    const row = [
      `"${domain.name}"`,
      `"${domain.registrar || ''}"`,
      `"${domain.nameservers || ''}"`,
      `"${domain.expiresAt ? domain.expiresAt.toISOString() : ''}"`,
      `"${domain.autoRenew}"`,
      `"${domain.status}"`,
      `"${(domain.notes || '').replace(/"/g, '""')}"`,
      `"${domain.tags.map((t) => t.name).join(';')}"`,
      `"${domain.createdAt.toISOString()}"`,
      `"${domain.updatedAt.toISOString()}"`,
    ];
    csvRows.push(row.join(','));
  }

  const csv = csvRows.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="domains-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
