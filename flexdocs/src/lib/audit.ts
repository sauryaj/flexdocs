import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.profile.update'
  | 'document.create'
  | 'document.update'
  | 'document.delete'
  | 'document.view'
  | 'document.move'
  | 'password.create'
  | 'password.update'
  | 'password.delete'
  | 'password.view'
  | 'password.copy'
  | 'domain.create'
  | 'domain.update'
  | 'domain.delete'
  | 'domain.view'
  | 'folder.create'
  | 'folder.update'
  | 'folder.delete'
  | 'tag.create'
  | 'tag.delete'
  | 'asset.create'
  | 'asset.update'
  | 'asset.delete'
  | 'checklist.create'
  | 'checklist.update'
  | 'checklist.complete'
  | 'checklist.delete'
  | 'auth.attempt.failed';

interface LogEntry {
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

export async function auditLog(entry: LogEntry): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: entry.userId || null,
        action: entry.action,
        resourceType: entry.resourceType || null,
        resourceId: entry.resourceId || null,
        resourceName: entry.resourceName || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ip: entry.ip || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (error) {
    // Don't let audit logging failures break the app
    logger.error('Audit log error', { error });
  }
}

export async function getAuditLogs(params: {
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (params.userId) where.userId = params.userId;
  if (params.resourceType) where.resourceType = params.resourceType;
  if (params.resourceId) where.resourceId = params.resourceId;
  if (params.action) where.action = params.action;

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit || 50,
      skip: params.offset || 0,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { logs, total };
}
