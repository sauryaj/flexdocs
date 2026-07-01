import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generatePasswordHealth } from '@/lib/password-health';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const health = await generatePasswordHealth(user.id);
  return NextResponse.json(health);
}
