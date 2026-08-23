import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMutedNotificationTypes, setMutedNotificationTypes, NOTIFICATION_TYPES } from '@/lib/notifications';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mutedTypes = await getMutedNotificationTypes(user.id);
  return NextResponse.json({ mutedTypes, availableTypes: NOTIFICATION_TYPES });
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { types } = await req.json().catch(() => ({}));
  if (!Array.isArray(types)) {
    return NextResponse.json({ error: 'types array required' }, { status: 400 });
  }

  const mutedTypes = await setMutedNotificationTypes(user.id, types);
  return NextResponse.json({ mutedTypes });
}
