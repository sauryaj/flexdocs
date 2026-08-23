import { prisma } from './prisma';

export type OrgScope = { mode: 'all' } | { mode: 'limited'; orgIds: string[] };

/**
 * Admins see every organization. Anyone who is a member of at least one org
 * is limited to those orgs (that's the client-portal contract). Editors with
 * no memberships retain legacy staff-wide access; everyone else sees nothing shared.
 */
export async function getOrgScope(userId: string, role?: string): Promise<OrgScope> {
  if (role === 'admin') return { mode: 'all' };
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  if (memberships.length > 0) {
    return { mode: 'limited', orgIds: memberships.map((m) => m.organizationId) };
  }
  if (role === 'editor') return { mode: 'all' };
  return { mode: 'limited', orgIds: [] };
}

/** Prisma `where` fragment constraining a query to the scope's organizations. */
export function scopeOrgWhere(
  scope: OrgScope,
  requestedOrganizationId?: string | null,
): { organizationId?: string | { in: string[] } | null } {
  if (scope.mode === 'all') {
    return requestedOrganizationId ? { organizationId: requestedOrganizationId } : {};
  }
  const allowed = requestedOrganizationId
    ? scope.orgIds.filter((id) => id === requestedOrganizationId)
    : scope.orgIds;
  return { organizationId: allowed.length > 0 ? { in: allowed } : { in: ['__none__'] } };
}

/** True when the user may read data belonging to this organization. */
export async function canAccessOrganization(
  userId: string,
  role: string | undefined,
  organizationId: string,
): Promise<boolean> {
  const scope = await getOrgScope(userId, role);
  if (scope.mode === 'all') return true;
  return scope.orgIds.includes(organizationId);
}
