import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRecentChanges, acknowledgeChange, detectServerChanges, detectCloudChanges } from '@/lib/change-detection';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('organizationId') || undefined;
  const limit = parseInt(searchParams.get('limit') || '50');

  const changes = await getRecentChanges(user.id, orgId, limit);

  return NextResponse.json(changes);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, changeId, organizationId } = await req.json();

  if (action === 'acknowledge') {
    const change = await acknowledgeChange(changeId, user.id);
    return NextResponse.json(change);
  }

  if (action === 'detect') {
    const [serverChanges, cloudChanges] = await Promise.allSettled([
      detectServerChanges(user.id, organizationId || undefined),
      detectCloudChanges(user.id, organizationId || undefined),
    ]);

    const allChanges = [
      ...(serverChanges.status === 'fulfilled' ? serverChanges.value : []),
      ...(cloudChanges.status === 'fulfilled' ? cloudChanges.value : []),
    ];

    return NextResponse.json({
      detected: allChanges.length,
      changes: allChanges,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
