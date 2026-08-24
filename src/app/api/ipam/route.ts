import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function cidrContains(cidr: string, ip: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr || '32', 10);
  const toInt = (s: string) =>
    s.split('.').reduce((acc, o) => (acc << 8) + (parseInt(o, 10) || 0), 0) >>> 0;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(range) || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(range) & mask) === (toInt(ip) & mask);
}

function cidrTotal(bitsStr: string | undefined): number {
  const bits = parseInt(bitsStr || '32', 10);
  return 2 ** (32 - Math.min(32, Math.max(0, bits)));
}

/** GET /api/ipam — networks with computed utilization from server IPs. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get('organizationId') || undefined;

  const [networks, servers] = await Promise.all([
    prisma.ipamNetwork.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.server.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, name: true, ipAddress: true },
    }),
  ]);

  return NextResponse.json(
    networks.map((n) => {
      const [range, bitsStr] = n.cidr.split('/');
      const hosts = servers.filter((s) => s.ipAddress && cidrContains(n.cidr, s.ipAddress));
      return {
        ...n,
        range,
        prefix: bitsStr || '32',
        totalAddresses: cidrTotal(bitsStr),
        usedAddresses: hosts.length,
        hosts,
      };
    }),
  );
}

/** POST /api/ipam — create a network. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, cidr, vlanId, notes, organizationId } = await req.json().catch(() => ({}));
  if (!name?.trim() || !cidr?.trim()) {
    return NextResponse.json({ error: 'name and cidr are required' }, { status: 400 });
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(cidr.trim())) {
    return NextResponse.json({ error: 'cidr must be in CIDR form, e.g. 192.168.1.0/24' }, { status: 400 });
  }

  const network = await prisma.ipamNetwork.create({
    data: {
      name: name.trim(),
      cidr: cidr.trim(),
      vlanId: vlanId ? parseInt(vlanId, 10) : null,
      notes: notes || null,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });
  return NextResponse.json(network, { status: 201 });
}
