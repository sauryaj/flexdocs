import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { extractAuth } from '@/lib/api-keys';

export async function GET() {
  const authData = await extractAuth(new Request('http://localhost', { headers: {} }));
  if (!authData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (authData.type === 'apikey') {
    if (!hasPermission(authData.user.role, 'user.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    if (!hasPermission(authData.user.role, 'user.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const roleStats = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
  });

  return NextResponse.json(roleStats);
}
