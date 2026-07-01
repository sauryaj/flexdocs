import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuditLogs } from '@/lib/audit';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const resourceType = searchParams.get('resourceType') || undefined;
  const action = searchParams.get('action') || undefined;

  const result = await getAuditLogs({
    userId: user.id,
    resourceType,
    action,
    limit,
    offset,
  });

  return NextResponse.json(result);
}
