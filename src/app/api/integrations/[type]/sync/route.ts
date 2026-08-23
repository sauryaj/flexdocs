import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { runTenantSync } from '@/lib/tenant-sync';

/** POST /api/integrations/[type]/sync — runs the tenant sync and stores a snapshot. */
export async function POST(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type } = await params;
  const integration = await prisma.integration.findUnique({
    where: { userId_type: { userId: user.id, type } },
  });
  if (!integration) {
    return NextResponse.json({ error: `No ${type} integration configured` }, { status: 404 });
  }

  const result = await runTenantSync(type, {
    tenantId: integration.tenantId,
    clientId: integration.clientId,
    clientSecret: integration.clientSecret,
    serviceAccountEmail: integration.serviceAccountEmail,
    privateKey: integration.privateKey,
    adminEmail: integration.adminEmail,
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastSyncAt: new Date(),
      lastStatus: result.ok ? 'ok' : 'error',
      lastError: result.ok ? null : result.error || 'unknown error',
      usersSnapshot: result.ok && result.users ? JSON.stringify(result.users) : undefined,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const licenseSummary = (result as { licenseSummary?: unknown }).licenseSummary;
  return NextResponse.json({
    ok: true,
    userCount: result.users?.length ?? 0,
    licenseSummary,
    syncedAt: new Date().toISOString(),
  });
}
