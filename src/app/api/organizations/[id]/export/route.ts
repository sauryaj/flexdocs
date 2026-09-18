import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';
import { buildBackup } from '@/lib/export';

/** Staff-only. Per-tenant portable snapshot (offboarding). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'editor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const org = await prisma.organization.findUnique({ where: { id } });
  const member = org && (await canAccessOrganization(user.id, user.role as 'admin' | 'editor', id));
  if (!org || !member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bundle = await buildBackup({ organizationId: id });
  void auditLog({ userId: user.id, action: 'data.export', resourceType: 'organization', resourceId: id, resourceName: org.name, details: { scope: 'organization' } });

  return NextResponse.json(bundle, {
    headers: {
      'Content-Disposition': `attachment; filename="flexdocs-org-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json"`,
    },
  });
}