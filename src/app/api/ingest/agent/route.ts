import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      organizationId,
      hostname,
      ipAddress,
      macAddress,
      os,
      cpu,
      ramGb,
      serialNumber,
      status = 'active',
    } = body;

    if (!hostname) {
      return NextResponse.json({ error: 'hostname is required' }, { status: 400 });
    }

    // Find first user and org if not provided
    const adminUser = await prisma.user.findFirst();
    if (!adminUser) {
      return NextResponse.json({ error: 'No admin user registered in system' }, { status: 400 });
    }

    let targetOrgId = organizationId;
    if (!targetOrgId) {
      const firstOrg = await prisma.organization.findFirst();
      targetOrgId = firstOrg?.id;
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: 'No organization found to assign device' }, { status: 400 });
    }

    // Check if server with hostname already exists
    const existing = await prisma.server.findFirst({
      where: { hostname, organizationId: targetOrgId },
    });

    let server;
    if (existing) {
      server = await prisma.server.update({
        where: { id: existing.id },
        data: {
          name: hostname,
          ipAddress: ipAddress || existing.ipAddress,
          os: os || existing.os,
          status,
          notes: `Updated by RMM Ingestion Agent. CPU: ${cpu || 'N/A'}, RAM: ${ramGb ? `${ramGb}GB` : 'N/A'}, MAC: ${macAddress || 'N/A'}, Serial: ${serialNumber || 'N/A'}`,
        },
      });
    } else {
      server = await prisma.server.create({
        data: {
          userId: adminUser.id,
          organizationId: targetOrgId,
          name: hostname,
          hostname,
          ipAddress,
          os,
          status,
          notes: `Ingested by Flexdocs PowerShell Agent. CPU: ${cpu || 'N/A'}, RAM: ${ramGb ? `${ramGb}GB` : 'N/A'}, MAC: ${macAddress || 'N/A'}, Serial: ${serialNumber || 'N/A'}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      serverId: server.id,
      name: server.name,
      message: 'Hardware telemetry successfully ingested into Flexdocs Configurations',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to ingest telemetry' }, { status: 500 });
  }
}
