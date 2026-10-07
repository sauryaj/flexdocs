import { createHash } from 'node:crypto';
import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';

async function teamAudience(tx: Prisma.TransactionClient, organizationId: string) {
  const grants = await tx.organizationDocumentationGrant.findMany({ where: { organizationId },
    select: { userId: true, role: true, updatedAt: true, user: { select: { role: true, name: true, email: true,
      organizationMembers: { where: { organizationId }, select: { id: true } } } } }, orderBy: { userId: 'asc' } });
  return grants.filter(grant => grant.user.organizationMembers.length && hasPermission(grant.user.role as UserRole, 'document.read'))
    .map(grant => ({ id: grant.userId, name: grant.user.name, email: grant.user.email, role: grant.role,
      accountRole: grant.user.role, grantUpdatedAt: grant.updatedAt.toISOString(),
      working: grant.role !== 'reader' && hasPermission(grant.user.role as UserRole, 'document.update') }));
}

export async function previewDocumentOwnership(actorId: string, documentId: string, destinationOrganizationId: string, expectedUpdatedAt?: string, page = 0) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000) throw new DocumentWriteError(400, 'Invalid audience page');
  return prisma.$transaction(async tx => {
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).requestTransfer) throw new DocumentWriteError(404, 'Not found');
    const destinationCapabilities = await resolveDocumentCapabilities({ ...document, ownershipKind: 'organization', organizationId: destinationOrganizationId }, actor, tx);
    if (!destinationCapabilities.requestTransfer) throw new DocumentWriteError(404, 'Not found');
    const destination = await tx.organization.findUnique({ where: { id: destinationOrganizationId }, select: { id: true, name: true } });
    if (!destination) throw new DocumentWriteError(404, 'Not found');
    if (!expectedUpdatedAt) throw new DocumentWriteError(428, 'Reload and provide the current document version');
    if (document.updatedAt.toISOString() !== expectedUpdatedAt) throw new DocumentWriteError(409, 'Document changed; reload before previewing ownership');
    if (document.isArchived) throw new DocumentWriteError(409, 'Return this document to draft before changing ownership');
    if (document.ownershipKind === 'organization' && document.organizationId === destinationOrganizationId) throw new DocumentWriteError(400, 'Document already belongs to this team');
    const audience = await teamAudience(tx, destinationOrganizationId);
    const sourceAudience = document.ownershipKind === 'organization' && document.organizationId ? await teamAudience(tx, document.organizationId) : [];
    const files = await tx.attachment.findMany({ where: { documentId }, select: { id: true, userId: true, storageType: true, size: true, filePath: true }, orderBy: { id: 'asc' } });
    const foreignFiles = document.ownershipKind === 'personal' ? files.filter(file => file.userId !== document.userId).length : 0;
    const revisions = await tx.documentRevision.findMany({ where: { documentId }, select: { id: true, version: true, createdAt: true }, orderBy: { id: 'asc' } });
    const reviews = await tx.documentReview.findMany({ where: { documentId }, select: { id: true, sourceRevisionId: true, decision: true, decidedAt: true }, orderBy: { id: 'asc' } });
    const publications = await tx.documentPublication.findMany({ where: { documentId }, select: { id: true, sourceRevisionId: true, publishedAt: true }, orderBy: { id: 'asc' } });
    const workingCount = audience.filter(member => member.working).length;
    const fingerprint = createHash('sha256').update(JSON.stringify({ actorId, actorRole: actor.role, documentId, updatedAt: expectedUpdatedAt,
      source: { ownershipKind: document.ownershipKind, organizationId: document.organizationId, userId: document.userId,
        responsibleUserId: document.responsibleUserId, folderId: document.folderId, visibility: document.visibility,
        lifecycleState: document.lifecycleState, publishedSnapshotId: document.publishedSnapshotId },
      destination, sourceAudience, audience, files, revisions, reviews, publications })).digest('hex');
    const limit = 25;
    return {
      documentId, updatedAt: expectedUpdatedAt, kind: document.ownershipKind === 'personal' ? 'personal_to_team' : 'team_to_team',
      source: { ownershipKind: document.ownershipKind, organizationId: document.organizationId,
        audiencePolicy: document.ownershipKind === 'organization' ? 'current_explicit_team_grants' :
          document.visibility === 'org' && document.organizationId ? 'owner_and_legacy_organization_policy' : 'personal_owner' },
      destination, fingerprint,
      audience: { items: audience.slice(page * limit, (page + 1) * limit).map(({ id, name, email, role, working }) => ({ id, name, email, role, working })),
        total: audience.length, workingCount, publishedOnlyCount: audience.length - workingCount, page, limit, hasMore: (page + 1) * limit < audience.length },
      exposure: { workingContent: true, revisions: revisions.length, reviews: reviews.length, publications: publications.length, workingFiles: files.length,
        historicalCopiesVisibleToMaintainers: true, readersRequireNewPublication: true },
      effects: { clearFolder: !!document.folderId, clearPublication: !!document.publishedSnapshotId, destinationState: 'draft',
        withdrawPendingReviews: true, ownershipProvenancePreserved: true, sourceTeamAccessRevoked: document.ownershipKind === 'organization' },
      blockers: foreignFiles ? [{ code: 'foreign_personal_attachments', count: foreignFiles,
        message: 'Other uploaders own files on this personal document. Resolve their authorization before conversion.' }] : [],
      requiresExplicitConsent: true,
      executionAvailable: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
