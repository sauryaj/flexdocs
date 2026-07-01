import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

interface ImportDomain {
  name: string;
  registrar?: string;
  expiresAt?: string;
  notes?: string;
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { domains, organizationId } = await req.json();

  if (!Array.isArray(domains)) {
    return NextResponse.json(
      { error: 'domains must be an array' },
      { status: 400 }
    );
  }

  let createdCount = 0;
  const errors: string[] = [];

  for (const item of domains as ImportDomain[]) {
    if (!item.name || typeof item.name !== 'string') {
      errors.push(`Invalid domain entry: ${JSON.stringify(item)}`);
      continue;
    }

    try {
      await prisma.domain.create({
        data: {
          name: item.name.toLowerCase().trim(),
          registrar: item.registrar || null,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
          notes: item.notes || null,
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
      createdCount++;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        errors.push(`Domain "${item.name}" already exists`);
      } else {
        errors.push(`Failed to create "${item.name}": ${error.message}`);
      }
    }
  }

  await auditLog({
    userId: user.id,
    action: 'domain.create',
    resourceType: 'domain',
    resourceName: 'csv_import',
    details: { createdCount, errorCount: errors.length },
  });

  return NextResponse.json({ createdCount, errors });
}
