import { prisma } from '@/lib/prisma';
import { documentReadWhere } from '@/lib/document-access';
import { type OrgScope, scopeOrgWhere } from '@/lib/org-scope';

export const entityTypes = ['document', 'password', 'domain', 'asset', 'server', 'checklist', 'ssl', 'network', 'organization'] as const;
export type EntityType = typeof entityTypes[number];

export async function accessibleEntity(type: string, id: string, userId: string, scope: OrgScope, write = false): Promise<string | null> {
  const org = scopeOrgWhere(scope);
  switch (type) {
    case 'document': return (await prisma.document.findFirst({ where: { deletedAt: null, id, ...(write ? { userId } : documentReadWhere(userId, scope)) }, select: { title: true } }))?.title ?? null;
    case 'password': return (await prisma.password.findFirst({ where: { id, ...(write || scope.mode === 'all' ? { userId } : { OR: [{ userId }, { ...org, clientVisible: true }] }) }, select: { name: true } }))?.name ?? null;
    case 'checklist': return (await prisma.checklist.findFirst({ where: { id, ...(write ? { userId } : { OR: [{ userId }, { ...org, organizationId: scope.mode === 'all' ? { not: null } : org.organizationId }] }) }, select: { name: true } }))?.name ?? null;
    case 'domain': return (await prisma.domain.findFirst({ where: { id, ...org }, select: { name: true } }))?.name ?? null;
    case 'asset': return (await prisma.flexibleAsset.findFirst({ where: { id, ...org }, select: { name: true } }))?.name ?? null;
    case 'server': return (await prisma.server.findFirst({ where: { id, ...org }, select: { name: true } }))?.name ?? null;
    case 'ssl': return (await prisma.sslCertificate.findFirst({ where: { id, ...org }, select: { hostname: true } }))?.hostname ?? null;
    case 'network': return (await prisma.networkDocument.findFirst({ where: { id, ...org }, select: { name: true } }))?.name ?? null;
    case 'organization': return (await prisma.organization.findFirst({ where: { id: scope.mode === 'all' || scope.orgIds.includes(id) ? id : '__none__' }, select: { name: true } }))?.name ?? null;
    default: return null;
  }
}
