import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { getRetentionDays, setRetentionDays, purgeOldAuditLogs } from '@/lib/audit-retention';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'audit.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const daysToKeep = await getRetentionDays();
  const config = await prisma.auditLogRetention.findFirst();

  return NextResponse.json({
    daysToKeep,
    lastPurgeAt: config?.lastPurgeAt || null,
  });
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'audit.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { daysToKeep } = await req.json();
  if (typeof daysToKeep !== 'number' || daysToKeep < 1) {
    return NextResponse.json({ error: 'Invalid daysToKeep' }, { status: 400 });
  }

  await setRetentionDays(daysToKeep);
  return NextResponse.json({ daysToKeep });
}

export async function POST() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'audit.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await purgeOldAuditLogs();
  return NextResponse.json(result);
}
