import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';
import { buildBackup, ExportIncompleteError } from '@/lib/export';

/** Admin-only. Per-tenant portable snapshot (offboarding). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const org = await prisma.organization.findUnique({ where: { id } });
  const member = org && (await canAccessOrganization(user.id, user.role as 'admin' | 'editor', id));
  if (!org || !member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let bundle;
  try { bundle = await buildBackup({ organizationId: id });
  } catch (error) {
    if (error instanceof ExportIncompleteError) return NextResponse.json({ error: error.message, issues: error.issues }, { status: 422 });
    throw error;
  }
  void auditLog({ userId: user.id, action: 'data.export', resourceType: 'organization', resourceId: id, resourceName: org.name, details: { scope: 'organization' } });

  return NextResponse.json(bundle, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="flexdocs-org-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json"`,
    },
  });
}