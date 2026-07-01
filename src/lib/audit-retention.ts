import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export async function getRetentionDays(): Promise<number> {
  const config = await prisma.auditLogRetention.findFirst();
  return config?.daysToKeep || 365;
}

export async function setRetentionDays(days: number): Promise<void> {
  const existing = await prisma.auditLogRetention.findFirst();
  if (existing) {
    await prisma.auditLogRetention.update({
      where: { id: existing.id },
      data: { daysToKeep: days, updatedAt: new Date() },
    });
  } else {
    await prisma.auditLogRetention.create({
      data: { daysToKeep: days },
    });
  }
}

export async function purgeOldAuditLogs(): Promise<{ deleted: number }> {
  const daysToKeep = await getRetentionDays();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.activityLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  await prisma.auditLogRetention.updateMany({
    data: { lastPurgeAt: new Date() },
  });

  logger.info('Audit log retention purge completed', {
    daysToKeep,
    cutoffDate: cutoffDate.toISOString(),
    deleted: result.count,
  });

  return { deleted: result.count };
}
