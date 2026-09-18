import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { buildBackup } from '@/lib/export';

/** Admin-only. Full portable backup (all tenants + secrets, decrypted for portability). */
export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const bundle = await buildBackup();
  void auditLog({ userId: user.id, action: 'data.export', resourceType: 'backup', resourceName: 'full', details: { scope: 'full', records: Object.fromEntries(Object.entries(bundle).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])) } });

  return NextResponse.json(bundle, {
    headers: {
      'Content-Disposition': `attachment; filename="flexdocs-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}