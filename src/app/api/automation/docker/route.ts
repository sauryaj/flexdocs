import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { discoverDockerHost, discoverDockerContainers } from '@/lib/docker-k8s-discovery';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hosts = await prisma.dockerHost.findMany({
    where: { userId: user.id },
    include: { containersList: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(hosts);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint, organizationId } = await req.json();

  try {
    const hostInfo = await discoverDockerHost(endpoint || undefined);
    const containers = await discoverDockerContainers(endpoint || undefined);

    const existingHost = await prisma.dockerHost.findFirst({
      where: { userId: user.id, name: hostInfo.name },
    });

    let host: any;
    if (existingHost) {
      host = await prisma.dockerHost.update({
        where: { id: existingHost.id },
        data: {
          status: 'active',
          version: hostInfo.version,
          containers: hostInfo.containers,
          images: hostInfo.images,
          networks: hostInfo.networks,
          volumes: hostInfo.volumes,
          metadata: JSON.stringify(hostInfo.metadata),
          lastScanAt: new Date(),
        },
      });
    } else {
      host = await prisma.dockerHost.create({
        data: {
          name: hostInfo.name,
          endpoint: endpoint || '/var/run/docker.sock',
          type: hostInfo.type,
          status: 'active',
          version: hostInfo.version,
          containers: hostInfo.containers,
          images: hostInfo.images,
          networks: hostInfo.networks,
          volumes: hostInfo.volumes,
          metadata: JSON.stringify(hostInfo.metadata),
          lastScanAt: new Date(),
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
    }

    await prisma.dockerContainer.deleteMany({ where: { hostId: host.id } });
    for (const container of containers) {
      await prisma.dockerContainer.create({
        data: {
          hostId: host.id,
          containerId: container.containerId,
          name: container.name,
          image: container.image,
          status: container.status,
          state: container.state,
          ports: JSON.stringify(container.ports),
          networkMode: container.networkMode,
          ip: container.ip,
          mounts: JSON.stringify(container.mounts),
        },
      });
    }

    const updatedHost = await prisma.dockerHost.findUnique({
      where: { id: host.id },
      include: { containersList: true },
    });

    return NextResponse.json(updatedHost);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOENT')) {
      return NextResponse.json(
        { error: `Docker socket not found. Ensure Docker is running. Searched: /var/run/docker.sock, ~/.colima/default/docker.sock, ~/.docker/run/docker.sock` },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
