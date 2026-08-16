import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getNotifications, markNotificationsRead, deleteNotifications } from '@/lib/notifications';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await getNotifications(user.id, 100);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids } = await req.json().catch(() => ({}));
  await markNotificationsRead(user.id, Array.isArray(ids) ? ids : undefined);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',') : undefined;
  await deleteNotifications(user.id, ids);
  return NextResponse.json({ success: true });
}