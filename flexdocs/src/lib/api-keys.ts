import { prisma } from '@/lib/prisma';
import { randomBytes, createHash } from 'crypto';
import { hasPermission, type Permission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export function generateApiKey(): { key: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const prefixed = `fd_${raw}`;
  const hash = createHash('sha256').update(prefixed).digest('hex');
  return { key: prefixed, hash };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(key: string) {
  if (!key.startsWith('fd_')) return null;

  const hash = hashApiKey(key);
  const apiKey = await prisma.apiKey.findUnique({
    where: { key: hash },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });

  if (!apiKey || !apiKey.isActive) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    permissions: apiKey.permissions.split(',') as Permission[],
    userId: apiKey.user.id,
    user: apiKey.user,
  };
}

export function apiKeyHasPermission(
  permissions: Permission[],
  required: Permission
): boolean {
  return permissions.includes(required);
}

export function apiKeyHasAnyPermission(
  permissions: Permission[],
  required: Permission[]
): boolean {
  return required.some((p) => permissions.includes(p));
}

export async function extractAuth(req: Request) {
  // Check API key first
  const apiKeyHeader = req.headers.get('x-api-key');
  if (apiKeyHeader) {
    const keyData = await validateApiKey(apiKeyHeader);
    if (keyData) {
      return {
        type: 'apikey' as const,
        userId: keyData.userId,
        user: keyData.user,
        permissions: keyData.permissions,
      };
    }
    return null;
  }

  // Fall back to session auth
  const { auth } = await import('@/lib/auth');
  const user = await auth();
  if (user?.id) {
    return {
      type: 'session' as const,
      userId: user.id,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      permissions: null as Permission[] | null, // session uses role-based
    };
  }

  return null;
}

export async function requireAuth(req: Request, permission?: Permission) {
  const authData = await extractAuth(req);
  if (!authData) {
    throw new Error('Unauthorized');
  }

  if (permission) {
    if (authData.type === 'apikey') {
      if (!apiKeyHasPermission(authData.permissions, permission)) {
        throw new Error(`Forbidden: requires ${permission}`);
      }
    } else {
      if (!hasPermission(authData.user.role as UserRole, permission)) {
        throw new Error(`Forbidden: requires ${permission}`);
      }
    }
  }

  return authData;
}
