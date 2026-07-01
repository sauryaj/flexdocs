import * as cron from 'node-cron';
import { prisma } from './prisma';
import { discoverEc2, discoverS3, discoverRds, fetchCosts } from './aws-discovery';
import { discoverServer } from './ssh-discovery';
import { discoverDockerHost, discoverDockerContainers } from './docker-k8s-discovery';
import logger from './logger';

const activeJobs = new Map<string, cron.ScheduledTask>();

function parseCronResult(result: any): string {
  return JSON.stringify({
    created: result.created?.length || 0,
    updated: result.updated || 0,
    errors: result.errors || 0,
    timestamp: new Date().toISOString(),
  });
}

async function runCloudDiscovery(scanId: string, config: any, userId: string, orgId?: string) {
  const resources: any[] = [];
  const errors: string[] = [];

  try {
    const creds = config.credentials;
    const [ec2, s3, rds] = await Promise.allSettled([
      discoverEc2(creds),
      discoverS3(creds),
      discoverRds(creds),
    ]);

    if (ec2.status === 'fulfilled') resources.push(...ec2.value);
    if (s3.status === 'fulfilled') resources.push(...s3.value);
    if (rds.status === 'fulfilled') resources.push(...rds.value);

    if (ec2.status === 'rejected') errors.push(`EC2: ${ec2.reason}`);
    if (s3.status === 'rejected') errors.push(`S3: ${s3.reason}`);
    if (rds.status === 'rejected') errors.push(`RDS: ${rds.reason}`);
  } catch (err: any) {
    errors.push(err.message);
  }

  const created = [];
  for (const resource of resources) {
    try {
      const existing = await prisma.cloudResource.findFirst({
        where: { userId, resourceId: resource.resourceId },
      });
      if (!existing) {
        const item = await prisma.cloudResource.create({
          data: {
            name: resource.name,
            provider: resource.provider,
            service: resource.service,
            resourceId: resource.resourceId,
            region: resource.region,
            status: resource.status,
            cloudTags: JSON.stringify(resource.metadata),
            metadata: JSON.stringify(resource.metadata),
            organizationId: orgId || null,
            userId,
          },
        });
        created.push(item);
      }
    } catch (err: any) {
      errors.push(`Create ${resource.name}: ${err.message}`);
    }
  }

  return { created, updated: 0, errors: errors.length, errorDetails: errors };
}

async function runNetworkScan(scanId: string, config: any, userId: string, orgId?: string) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const cidr = config.cidr;
  const ips: string[] = [];
  const parts = cidr.split('/');
  if (parts.length === 2) {
    const [base, prefix] = parts;
    const prefixLen = parseInt(prefix);
    if (prefixLen >= 24 && prefixLen <= 30) {
      const baseParts = base.split('.').map(Number);
      const numHosts = Math.pow(2, 32 - prefixLen) - 2;
      for (let i = 1; i <= Math.min(numHosts, 254); i++) {
        const ip = [...baseParts];
        ip[3] = (baseParts[3] & ~((1 << (32 - prefixLen)) - 1)) + i;
        ips.push(ip.join('.'));
      }
    }
  }

  const created = [];
  const errors: string[] = [];

  for (const ip of ips.slice(0, 100)) {
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 2 ${ip} 2>/dev/null && echo "UP" || echo "DOWN"`);
      if (stdout.includes('UP')) {
        const { stdout: hostname } = await execAsync(`dig -x ${ip} +short 2>/dev/null || echo ""`);
        const item = await prisma.networkDocument.create({
          data: {
            name: `Scan: ${hostname.trim().replace(/\.$/, '') || ip}`,
            type: 'ip-schema',
            content: JSON.stringify({ ip, hostname: hostname.trim().replace(/\.$/, '') }),
            notes: `Auto-scanned at ${new Date().toISOString()}`,
            organizationId: orgId || null,
            userId,
          },
        });
        created.push(item);
      }
    } catch (err: any) {
      errors.push(`${ip}: ${err.message}`);
    }
  }

  return { created, updated: 0, errors: errors.length, errorDetails: errors };
}

async function runSshDiscovery(scanId: string, config: any, userId: string, orgId?: string) {
  const targets = config.targets || [];
  const created = [];
  const errors: string[] = [];

  for (const target of targets) {
    try {
      const specs = await discoverServer(target);
      const existing = await prisma.server.findFirst({
        where: { userId, hostname: specs.hostname },
      });

      if (existing) {
        await prisma.server.update({
          where: { id: existing.id },
          data: {
            os: specs.os,
            osVersion: specs.osVersion,
            cpu: specs.cpu,
            cpuCores: specs.cpuCores,
            ramGB: specs.ramGB,
            storageGB: specs.storageGB,
            ipAddress: specs.ipAddress,
            status: 'active',
          },
        });
      } else {
        const item = await prisma.server.create({
          data: {
            name: specs.hostname,
            hostname: specs.hostname,
            ipAddress: specs.ipAddress,
            os: specs.os,
            osVersion: specs.osVersion,
            cpu: specs.cpu,
            cpuCores: specs.cpuCores,
            ramGB: specs.ramGB,
            storageGB: specs.storageGB,
            status: 'active',
            notes: `SSH discovered at ${new Date().toISOString()}`,
            organizationId: orgId || null,
            userId,
          },
        });
        created.push(item);
      }
    } catch (err: any) {
      errors.push(`${target.host}: ${err.message}`);
    }
  }

  return { created, updated: 0, errors: errors.length, errorDetails: errors };
}

async function runDockerDiscovery(scanId: string, config: any, userId: string, orgId?: string) {
  const endpoint = config.endpoint || '/var/run/docker.sock';
  const created: any[] = [];
  const errors: string[] = [];

  try {
    const hostInfo = await discoverDockerHost(endpoint);
    const containers = await discoverDockerContainers(endpoint);

    const existingHost = await prisma.dockerHost.findFirst({
      where: { userId, name: hostInfo.name },
    });

    let hostId: string;
    if (existingHost) {
      const updated = await prisma.dockerHost.update({
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
      hostId = updated.id;
    } else {
      const host = await prisma.dockerHost.create({
        data: {
          name: hostInfo.name,
          endpoint,
          type: hostInfo.type,
          status: 'active',
          version: hostInfo.version,
          containers: hostInfo.containers,
          images: hostInfo.images,
          networks: hostInfo.networks,
          volumes: hostInfo.volumes,
          metadata: JSON.stringify(hostInfo.metadata),
          lastScanAt: new Date(),
          organizationId: orgId || null,
          userId,
        },
      });
      hostId = host.id;
      created.push(host);
    }

    await prisma.dockerContainer.deleteMany({ where: { hostId } });
    for (const container of containers) {
      await prisma.dockerContainer.create({
        data: {
          hostId,
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
  } catch (err: any) {
    errors.push(err.message);
  }

  return { created, updated: 0, errors: errors.length, errorDetails: errors };
}

async function runCostSync(scanId: string, config: any, userId: string, orgId?: string) {
  const creds = config.credentials;
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = now.toISOString().split('T')[0];

  const costs = await fetchCosts(creds, startDate, endDate);
  const created = [];
  const errors: string[] = [];

  for (const cost of costs) {
    try {
      const item = await prisma.costEntry.create({
        data: {
          provider: 'aws',
          service: cost.service,
          amount: cost.amount,
          period: cost.period,
          periodType: 'monthly',
          organizationId: orgId || null,
          userId,
        },
      });
      created.push(item);
    } catch (err: any) {
      errors.push(`${cost.service}: ${err.message}`);
    }
  }

  return { created, updated: 0, errors: errors.length, errorDetails: errors };
}

export async function startScheduledScan(scanId: string) {
  const scan = await prisma.scheduledScan.findUnique({ where: { id: scanId } });
  if (!scan || !scan.isActive) return;

  const job = cron.schedule(scan.cronExpression, async () => {
    const run = await prisma.scanRun.create({
      data: { scanId, status: 'running' },
    });

    const startTime = Date.now();
    try {
      const config = JSON.parse(scan.config);
      let result: any;

      switch (scan.type) {
        case 'cloud-discovery':
          result = await runCloudDiscovery(scanId, config, scan.userId, scan.organizationId || undefined);
          break;
        case 'network-scan':
          result = await runNetworkScan(scanId, config, scan.userId, scan.organizationId || undefined);
          break;
        case 'ssh-discovery':
          result = await runSshDiscovery(scanId, config, scan.userId, scan.organizationId || undefined);
          break;
        case 'docker-discover':
          result = await runDockerDiscovery(scanId, config, scan.userId, scan.organizationId || undefined);
          break;
        case 'cost-sync':
          result = await runCostSync(scanId, config, scan.userId, scan.organizationId || undefined);
          break;
        default:
          result = { created: [], errors: 1, errorDetails: [`Unknown scan type: ${scan.type}`] };
      }

      await prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result: parseCronResult(result),
          duration: Date.now() - startTime,
        },
      });

      await prisma.scheduledScan.update({
        where: { id: scanId },
        data: { lastRunAt: new Date(), lastResult: parseCronResult(result) },
      });
    } catch (err: any) {
      await prisma.scanRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: err.message,
          duration: Date.now() - startTime,
        },
      });
    }
  });

  activeJobs.set(scanId, job);
}

export async function stopScheduledScan(scanId: string) {
  const job = activeJobs.get(scanId);
  if (job) {
    job.stop();
    activeJobs.delete(scanId);
  }
}

export async function initializeAllScans() {
  const scans = await prisma.scheduledScan.findMany({ where: { isActive: true } });
  for (const scan of scans) {
    await startScheduledScan(scan.id);
  }
  logger.info(`Initialized ${scans.length} scheduled scans`);
}
