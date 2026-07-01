import { prisma } from './prisma';
import logger from './logger';

interface ChangeDetectionResult {
  changes: { type: string; field: string; oldValue: unknown; newValue: unknown; summary: string }[];
}

function compareObjects(oldObj: Record<string, unknown>, newObj: Record<string, unknown>, ignoreFields: string[] = []): ChangeDetectionResult {
  const changes: ChangeDetectionResult['changes'] = [];

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        type: typeof oldVal === 'undefined' ? 'created' : typeof newVal === 'undefined' ? 'deleted' : 'updated',
        field: key,
        oldValue: oldVal,
        newValue: newVal,
        summary: `${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`,
      });
    }
  }

  return { changes };
}

export async function detectServerChanges(userId: string, orgId?: string) {
  const servers = await prisma.server.findMany({
    where: { userId, ...(orgId ? { organizationId: orgId } : {}) },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes: any[] = [];

  for (const server of servers) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const hostname = (await execAsync(`hostname -s 2>/dev/null || hostname`)).stdout.trim();

      const os = (await execAsync(`cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"'`)).stdout.trim();
      const cpuCores = parseInt((await execAsync(`nproc 2>/dev/null || echo ${server.cpuCores || 1}`)).stdout.trim()) || server.cpuCores || 1;
      const ramKb = parseInt((await execAsync(`grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}'`)).stdout.trim()) || 0;
      const ramGB = Math.round(ramKb / 1048576) || server.ramGB || 0;

      const oldData = {
        hostname: server.hostname,
        os: server.os,
        cpuCores: server.cpuCores,
        ramGB: server.ramGB,
        status: server.status,
      };

      const newData = {
        hostname: hostname || server.hostname,
        os: os || server.os,
        cpuCores,
        ramGB,
        status: 'active',
      };

      const { changes: fieldChanges } = compareObjects(oldData, newData, ['hostname']);

      if (fieldChanges.length > 0) {
        for (const change of fieldChanges) {
          const infraChange = await prisma.infraChange.create({
            data: {
              resourceType: 'server',
              resourceId: server.id,
              changeType: change.type,
              field: change.field,
              oldValue: JSON.stringify(change.oldValue),
              newValue: JSON.stringify(change.newValue),
              summary: `Server ${server.name}: ${change.summary}`,
              organizationId: orgId || null,
              userId,
            },
          });
          changes.push(infraChange);
        }

        await prisma.server.update({
          where: { id: server.id },
          data: {
            os: newData.os,
            cpuCores: newData.cpuCores,
            ramGB: newData.ramGB,
            status: newData.status,
          },
        });
      }
    } catch (err) {
      logger.error('Server change detection failed', { serverId: server.id, error: String(err) });
    }
  }

  return changes;
}

export async function detectCloudChanges(userId: string, orgId?: string) {
  const resources = await prisma.cloudResource.findMany({
    where: { userId, ...(orgId ? { organizationId: orgId } : {}) },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes: any[] = [];

  for (const resource of resources) {
    try {
      const currentMeta = JSON.parse(resource.metadata || '{}');
      const oldStatus = resource.status;

      const newStatus = 'active';

      if (oldStatus !== newStatus) {
        const change = await prisma.infraChange.create({
          data: {
            resourceType: 'cloud',
            resourceId: resource.id,
            changeType: 'status_changed',
            field: 'status',
            oldValue: oldStatus,
            newValue: newStatus,
            summary: `Cloud resource ${resource.name}: status ${oldStatus} → ${newStatus}`,
            organizationId: orgId || null,
            userId,
          },
        });
        changes.push(change);

        await prisma.cloudResource.update({
          where: { id: resource.id },
          data: { status: newStatus },
        });
      }
    } catch (err) {
      logger.error('Cloud change detection failed', { resourceId: resource.id, error: String(err) });
    }
  }

  return changes;
}

export async function getRecentChanges(userId: string, orgId?: string, limit: number = 50) {
  return prisma.infraChange.findMany({
    where: {
      userId,
      ...(orgId ? { organizationId: orgId } : {}),
    },
    orderBy: { detectedAt: 'desc' },
    take: limit,
  });
}

export async function acknowledgeChange(changeId: string, userId: string) {
  return prisma.infraChange.update({
    where: { id: changeId },
    data: { acknowledged: true, acknowledgedAt: new Date() },
  });
}
