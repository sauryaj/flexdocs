import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

const TYPES = ['m365', 'google'];

function serialize(i: {
  id: string;
  type: string;
  name: string;
  tenantId: string | null;
  clientId: string | null;
  serviceAccountEmail: string | null;
  adminEmail: string | null;
  lastSyncAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  usersSnapshot: string | null;
}) {
  const users = i.usersSnapshot ? (JSON.parse(i.usersSnapshot) as unknown[]) : [];
  return {
    id: i.id,
    type: i.type,
    name: i.name,
    tenantId: i.tenantId,
    clientId: i.clientId,
    serviceAccountEmail: i.serviceAccountEmail,
    adminEmail: i.adminEmail,
    lastSyncAt: i.lastSyncAt?.toISOString() || null,
    lastStatus: i.lastStatus,
    lastError: i.lastError,
    userCount: users.length,
  };
}

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await prisma.integration.findMany({ where: { userId: user.id } });
  return NextResponse.json(items.map(serialize));
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { type, name, tenantId, clientId, clientSecret, serviceAccountEmail, privateKey, adminEmail } = body;
  if (!TYPES.includes(type)) return NextResponse.json({ error: `type must be ${TYPES.join(' | ')}` }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const data = {
    type,
    name,
    tenantId: type === 'm365' ? tenantId || null : null,
    clientId: type === 'm365' ? clientId || null : null,
    clientSecret: clientSecret ? encrypt(clientSecret) : undefined,
    serviceAccountEmail: type === 'google' ? serviceAccountEmail || null : null,
    privateKey: privateKey ? encrypt(privateKey) : undefined,
    adminEmail: type === 'google' ? adminEmail || null : null,
    userId: user.id,
  };

  const integration = await prisma.integration.upsert({
    where: { userId_type: { userId: user.id, type } },
    update: {
      name: data.name,
      tenantId: data.tenantId,
      clientId: data.clientId,
      ...(clientSecret ? { clientSecret: data.clientSecret as string } : {}),
      serviceAccountEmail: data.serviceAccountEmail,
      ...(privateKey ? { privateKey: data.privateKey as string } : {}),
      adminEmail: data.adminEmail,
    },
    create: {
      ...data,
      clientSecret: data.clientSecret ?? null,
      privateKey: data.privateKey ?? null,
    },
  });

  return NextResponse.json(serialize(integration));
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });

  await prisma.integration.deleteMany({ where: { userId: user.id, type } });
  return NextResponse.json({ success: true });
}
