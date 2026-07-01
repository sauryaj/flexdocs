import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashApiKey } from '@/lib/api-keys';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

interface IngestPayload {
  source: string;
  module: 'servers' | 'network' | 'cloud' | 'maintenance' | 'status';
  records: Record<string, unknown>[];
  organizationId?: string;
}

export async function POST(req: Request) {
  const rl = await checkRateLimit(`ingest:${req.headers.get('x-forwarded-for') || 'unknown'}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const authHeader = req.headers.get('x-api-key');
  if (!authHeader) {
    return NextResponse.json({ error: 'X-API-Key header required' }, { status: 401 });
  }

  const apiKeyHash = hashApiKey(authHeader);
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: { key: apiKeyHash },
  });
  if (!apiKeyRecord) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const userId = apiKeyRecord.userId;
  const payload: IngestPayload = await req.json();

  if (!payload.source || !payload.module || !Array.isArray(payload.records)) {
    return NextResponse.json({ error: 'source, module, records[] required' }, { status: 400 });
  }

  if (payload.records.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 records per request' }, { status: 400 });
  }

  // Validate organizationId exists
  if (payload.organizationId) {
    const org = await prisma.organization.findFirst({
      where: { id: payload.organizationId },
    });
    if (!org) {
      return NextResponse.json({ error: 'Invalid organization' }, { status: 400 });
    }
  }

  const created = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < payload.records.length; i++) {
    const r = payload.records[i];
    try {
      let item: unknown;
      const meta = { source: payload.source, ingestedAt: new Date().toISOString(), ...r };

      switch (payload.module) {
        case 'servers':
          item = await prisma.server.create({
            data: {
              name: (r.name as string) || (r.hostname as string) || `Server ${i + 1}`,
              hostname: r.hostname as string,
              ipAddress: (r.ip_address as string) || (r.ip as string),
              os: r.os as string,
              osVersion: r.os_version as string,
              cpu: r.cpu as string,
              cpuCores: r.cpu_cores ? parseInt(r.cpu_cores as string) : null,
              ramGB: r.ram_gb ? parseFloat(r.ram_gb as string) : null,
              storageGB: r.storage_gb ? parseFloat(r.storage_gb as string) : null,
              status: (r.status as string) || 'active',
              location: r.location as string,
              notes: `Ingested from ${payload.source}`,
              organizationId: payload.organizationId || null,
              userId,
            },
          });
          break;

        case 'network':
          item = await prisma.networkDocument.create({
            data: {
              name: (r.name as string) || `Network ${i + 1}`,
              type: (r.type as string) || 'ip-schema',
              content: JSON.stringify(meta),
              notes: `Ingested from ${payload.source}`,
              organizationId: payload.organizationId || null,
              userId,
            },
          });
          break;

        case 'cloud':
          item = await prisma.cloudResource.create({
            data: {
              name: (r.name as string) || `Resource ${i + 1}`,
              provider: (r.provider as string) || 'aws',
              service: (r.service as string) || 'unknown',
              resourceId: r.resource_id as string,
              region: r.region as string,
              status: (r.status as string) || 'active',
              cost: r.cost ? parseFloat(r.cost as string) : null,
              cloudTags: JSON.stringify(r.tags || {}),
              notes: `Ingested from ${payload.source}`,
              organizationId: payload.organizationId || null,
              userId,
            },
          });
          break;

        case 'maintenance':
          item = await prisma.maintenanceWindow.create({
            data: {
              name: (r.name as string) || `Maintenance ${i + 1}`,
              description: r.description as string,
              startTime: new Date((r.start_time as string) || Date.now()),
              endTime: new Date((r.end_time as string) || Date.now() + 3600000),
              status: (r.status as string) || 'scheduled',
              priority: (r.priority as string) || 'medium',
              impact: r.impact as string,
              organizationId: payload.organizationId || null,
              userId,
            },
          });
          break;

        default:
          errors.push({ index: i, error: `Unknown module: ${payload.module}` });
          continue;
      }

      if (item) created.push(item);
    } catch (err: unknown) {
      errors.push({ index: i, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await prisma.activityLog.create({
    data: {
      action: 'ingest',
      resourceType: payload.module,
      userId,
      details: JSON.stringify({
        source: payload.source,
        total: payload.records.length,
        created: created.length,
        errors: errors.length,
      }),
    },
  });

  return NextResponse.json({
    source: payload.source,
    total: payload.records.length,
    created: created.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  });
}
