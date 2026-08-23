import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { runDailyMaintenance } from '@/lib/maintenance-jobs';

export async function POST() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const summary = await runDailyMaintenance();
  return NextResponse.json({ ok: true, summary });
}
