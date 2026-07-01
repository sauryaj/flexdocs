import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { type UserRole } from '@prisma/client';

export type Permission =
  | 'document.create'
  | 'document.read'
  | 'document.update'
  | 'document.delete'
  | 'password.create'
  | 'password.read'
  | 'password.update'
  | 'password.delete'
  | 'domain.create'
  | 'domain.read'
  | 'domain.update'
  | 'domain.delete'
  | 'asset.create'
  | 'asset.read'
  | 'asset.update'
  | 'asset.delete'
  | 'checklist.create'
  | 'checklist.read'
  | 'checklist.update'
  | 'checklist.delete'
  | 'settings.read'
  | 'settings.update'
  | 'user.invite'
  | 'user.manage'
  | 'apikey.create'
  | 'apikey.read'
  | 'apikey.delete'
  | 'webhook.create'
  | 'webhook.read'
  | 'webhook.delete'
  | 'audit.read'
  | 'backup.create'
  | 'backup.read'
  | 'report.read'
  | 'report.export'
  | 'organization.create'
  | 'organization.read'
  | 'organization.update'
  | 'organization.delete';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'document.create', 'document.read', 'document.update', 'document.delete',
    'password.create', 'password.read', 'password.update', 'password.delete',
    'domain.create', 'domain.read', 'domain.update', 'domain.delete',
    'asset.create', 'asset.read', 'asset.update', 'asset.delete',
    'checklist.create', 'checklist.read', 'checklist.update', 'checklist.delete',
    'settings.read', 'settings.update',
    'user.invite', 'user.manage',
    'apikey.create', 'apikey.read', 'apikey.delete',
    'webhook.create', 'webhook.read', 'webhook.delete',
    'audit.read', 'backup.create', 'backup.read',
    'report.read', 'report.export',
    'organization.create', 'organization.read', 'organization.update', 'organization.delete',
  ],
  editor: [
    'document.create', 'document.read', 'document.update', 'document.delete',
    'password.create', 'password.read', 'password.update', 'password.delete',
    'domain.create', 'domain.read', 'domain.update', 'domain.delete',
    'asset.create', 'asset.read', 'asset.update', 'asset.delete',
    'checklist.create', 'checklist.read', 'checklist.update', 'checklist.delete',
    'settings.read',
    'apikey.read',
    'webhook.create', 'webhook.read',
    'audit.read',
    'report.read', 'report.export',
    'organization.read',
  ],
  viewer: [
    'document.read',
    'password.read',
    'domain.read',
    'asset.read',
    'checklist.read',
    'settings.read',
    'apikey.read',
    'webhook.read',
    'audit.read',
    'report.read',
    'organization.read',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function requirePermission(permission: Permission) {
  return async function checkPerm() {
    const user = await auth();
    if (!user) throw new Error('Unauthorized');
    if (!hasPermission(user.role as UserRole, permission)) {
      throw new Error(`Forbidden: requires ${permission}`);
    }
    return user;
  };
}

export async function getUserWithRole(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
}

export { UserRole };
