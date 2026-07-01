import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashApiKey } from '@/lib/api-keys';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import logger from '@/lib/logger';

interface AgentReport {
  apiKey: string;
  hostname: string;
  os: string;
  osVersion: string;
  cpu: string;
  cpuCores: number;
  ramGB: number;
  storageGB: number;
  storageType: string;
  ipAddress: string;
  macAddress?: string;
  uptime: number;
  loadAverage: number[];
  diskUsage: { mount: string; used: number; total: number; percent: number }[];
  runningServices: string[];
  networkInterfaces: { name: string; ip: string; mac: string }[];
}

export async function POST(req: Request) {
  const rl = await checkRateLimit(`agent:${req.headers.get('x-forwarded-for') || 'unknown'}`);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  try {
    const report: AgentReport = await req.json();

    if (!report.apiKey || !report.hostname) {
      return NextResponse.json({ error: 'apiKey and hostname required' }, { status: 400 });
    }

    const apiKeyHash = hashApiKey(report.apiKey);
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { key: apiKeyHash },
      include: { user: true },
    });

    if (!apiKeyRecord) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const userId = apiKeyRecord.userId;

    let server = await prisma.server.findFirst({
      where: { userId, hostname: report.hostname },
    });

    const serverData = {
      name: report.hostname,
      hostname: report.hostname,
      ipAddress: report.ipAddress,
      macAddress: report.macAddress,
      os: report.os,
      osVersion: report.osVersion,
      cpu: report.cpu,
      cpuCores: report.cpuCores,
      ramGB: report.ramGB,
      storageGB: report.storageGB,
      storageType: report.storageType,
      status: 'active',
    };

    if (server) {
      server = await prisma.server.update({ where: { id: server.id }, data: serverData });
    } else {
      server = await prisma.server.create({
        data: { ...serverData, userId, notes: `Auto-registered by agent at ${new Date().toISOString()}` },
      });
    }

    const metadata = {
      uptime: report.uptime,
      loadAverage: report.loadAverage,
      diskUsage: report.diskUsage,
      runningServices: report.runningServices,
      networkInterfaces: report.networkInterfaces,
      lastReport: new Date().toISOString(),
    };

    await prisma.networkDocument.upsert({
      where: { id: `agent-${server.id}` },
      create: {
        id: `agent-${server.id}`,
        name: `Agent Report: ${report.hostname}`,
        type: 'ip-schema',
        content: JSON.stringify(metadata),
        notes: 'Auto-reported by server agent',
        userId,
      },
      update: { content: JSON.stringify(metadata) },
    });

    return NextResponse.json({ ok: true, serverId: server.id });
  } catch (err: unknown) {
    logger.error('Agent report failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
