import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

const TYPES = ['license', 'contract', 'saas', 'warranty'];

function serialize(r: {
  id: string;
  name: string;
  vendor: string | null;
  type: string;
  seats: number | null;
  costPerSeat: number | null;
  totalCost: number | null;
  renewsAt: Date;
  autoRenew: boolean;
  notes: string | null;
  organizationId: string | null;
}) {
  return { ...r, renewsAt: r.renewsAt.toISOString() };
}

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const items = await prisma.renewalItem.findMany({
    where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    orderBy: { renewsAt: 'asc' },
    include: { organization: { select: { id: true, name: true } } },
  });

  const now = Date.now();
  return NextResponse.json(
    items.map((r) => ({
      ...serialize(r),
      organizationName: r.organization?.name || null,
      daysUntilRenewal: Math.ceil((r.renewsAt.getTime() - now) / 86400000),
    })),
  );
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, vendor, type, seats, costPerSeat, totalCost, renewsAt, autoRenew, notes, organizationId } = body;
  if (!name || !renewsAt) return NextResponse.json({ error: 'name and renewsAt required' }, { status: 400 });

  const item = await prisma.renewalItem.create({
    data: {
      name,
      vendor: vendor || null,
      type: TYPES.includes(type) ? type : 'license',
      seats: seats ? parseInt(seats) : null,
      costPerSeat: costPerSeat ? parseFloat(costPerSeat) : null,
      totalCost: totalCost ? parseFloat(totalCost) : null,
      renewsAt: new Date(renewsAt),
      autoRenew: autoRenew ?? true,
      notes: notes || null,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });
  return NextResponse.json(serialize(item), { status: 201 });
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const owned = await prisma.renewalItem.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const item = await prisma.renewalItem.update({
    where: { id },
    data: {
      name: rest.name,
      vendor: rest.vendor,
      type: rest.type && TYPES.includes(rest.type) ? rest.type : undefined,
      seats: rest.seats !== undefined ? (rest.seats ? parseInt(rest.seats) : null) : undefined,
      costPerSeat: rest.costPerSeat !== undefined ? (rest.costPerSeat ? parseFloat(rest.costPerSeat) : null) : undefined,
      totalCost: rest.totalCost !== undefined ? (rest.totalCost ? parseFloat(rest.totalCost) : null) : undefined,
      renewsAt: rest.renewsAt ? new Date(rest.renewsAt) : undefined,
      autoRenew: rest.autoRenew,
      notes: rest.notes,
      organizationId: rest.organizationId !== undefined ? rest.organizationId || null : undefined,
    },
  });
  return NextResponse.json(serialize(item));
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await prisma.renewalItem.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}
