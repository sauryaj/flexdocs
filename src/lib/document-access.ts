import { type Prisma } from '@prisma/client';
import { type OrgScope, scopeOrgWhere } from '@/lib/org-scope';

export function documentReadWhere(userId: string, scope: OrgScope): Prisma.DocumentWhereInput {
  return { deletedAt: null, OR: [
    { userId },
    { ...(scope.mode === 'all' ? { organizationId: { not: null } } : scopeOrgWhere(scope)), visibility: 'org', isArchived: false },
  ] };
}
