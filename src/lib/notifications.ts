import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export type NotificationType =
  | 'domain_expiring'
  | 'cert_expiring'
  | 'breach'
  | 'maintenance'
  | 'system'
  | 'share'
  | 'emergency'
  | 'webhook';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  link?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        severity: params.severity || 'info',
        link: params.link || null,
      },
    });
  } catch (error) {
    // Don't let notification failures break the app
    logger.error('Notification create error', { error });
  }
}

export async function createNotificationForAllUsers(
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<void> {
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: params.type,
        title: params.title,
        message: params.message,
        severity: params.severity || 'info',
        link: params.link || null,
      })),
    });
  } catch (error) {
    logger.error('Notification broadcast error', { error });
  }
}

export async function getNotifications(userId: string, limit = 50) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { notifications, unreadCount };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const where: any = { userId };
  if (ids && ids.length > 0) {
    where.id = { in: ids };
  }
  return prisma.notification.updateMany({ where, data: { read: true } });
}

export async function deleteNotifications(userId: string, ids?: string[]) {
  const where: any = { userId };
  if (ids && ids.length > 0) {
    where.id = { in: ids };
  }
  return prisma.notification.deleteMany({ where });
}