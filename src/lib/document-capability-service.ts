import { type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { documentCapabilities, type DocumentContext, type ActorContext } from '@/lib/document-capabilities';

export async function resolveDocumentCapabilities(
  document: DocumentContext,
  actor: Pick<ActorContext, 'id' | 'role'>,
  db: Pick<Prisma.TransactionClient, 'organizationMember'> = prisma,
) {
  if (document.ownershipKind !== 'organization' || !document.organizationId) return documentCapabilities(document, actor);
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: document.organizationId, userId: actor.id } },
    select: { organization: { select: { documentationGrants: {
      where: { userId: actor.id }, select: { organizationId: true, role: true },
    } } } },
  });
  return documentCapabilities(document, {
    ...actor,
    memberOfOrganization: !!membership,
    grant: membership?.organization.documentationGrants[0] ?? null,
  });
}
