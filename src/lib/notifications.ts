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

export const NOTIFICATION_TYPES: NotificationType[] = [
  'domain_expiring',
  'cert_expiring',
  'breach',
  'maintenance',
  'system',
  'share',
  'emergency',
  'webhook',
];

export async function getMutedNotificationTypes(userId: string): Promise<NotificationType[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mutedNotificationTypes: true },
  });
  return ((user?.mutedNotificationTypes || []) as NotificationType[]).filter((t) =>
    NOTIFICATION_TYPES.includes(t),
  );
}

export async function setMutedNotificationTypes(userId: string, types: string[]): Promise<NotificationType[]> {
  const valid = types.filter((t): t is NotificationType =>
    (NOTIFICATION_TYPES as string[]).includes(t),
  );
  await prisma.user.update({
    where: { id: userId },
    data: { mutedNotificationTypes: Array.from(new Set(valid)) },
  });
  return Array.from(new Set(valid));
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const muted = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { mutedNotificationTypes: true },
    });
    if (muted?.mutedNotificationTypes?.includes(params.type)) return;
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
    const users = await prisma.user.findMany({
      where: { NOT: { mutedNotificationTypes: { has: params.type } } },
      select: { id: true },
    });
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