import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importFromItGlue, parseItGlueCsv } from '@/lib/itglue-import';
import { hasAnyPermission } from '@/lib/rbac';
import { canAccessOrganization } from '@/lib/org-scope';
import { type UserRole } from '@prisma/client';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasAnyPermission(user.role as UserRole, ['document.create', 'password.create'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, type, organizationId } = await req.json();

  if (organizationId && (typeof organizationId !== 'string' || !await canAccessOrganization(user.id, user.role, organizationId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let parsed: Record<string, unknown[]>;

  if (type === 'csv' && typeof data === 'string') {
    parsed = parseItGlueCsv(data);
  } else if (type === 'json' && typeof data === 'object') {
    parsed = data;
  } else {
    return NextResponse.json({ error: 'Invalid format. Use type "csv" or "json"' }, { status: 400 });
  }

  const result = await importFromItGlue(user.id, parsed, organizationId);
  return NextResponse.json(result);
}
