import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generatePasswordHealth } from '@/lib/password-health';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get('organizationId');

  const health = await generatePasswordHealth(user.id, organizationId);
  return NextResponse.json(health);
}
