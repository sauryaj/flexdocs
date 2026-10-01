import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { DocumentWriteError } from '@/lib/document-write';
import { type ImmutableFileStore } from '@/lib/immutable-file-store';
import { publicationManifestSchema, publicationTagsSchema } from '@/lib/publication-manifest';

async function publishedContext(actorId: string, documentId: string) {
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    const document = await tx.document.findUnique({ where: { id: documentId }, include: { publishedSnapshot: true } });
    if (!actor || !hasPermission(actor.role, 'document.read') || !document || document.deletedAt || document.isArchived || !document.publishedSnapshot) throw new DocumentWriteError(404, 'Not found');
    const capabilities = await resolveDocumentCapabilities({ ...document, hasPublishedSnapshot: true }, actor, tx);
    let allowed = capabilities.readPublished;
    if (!allowed && document.ownershipKind === 'personal' && document.visibility === 'org' && document.organizationId) {
      const scope = await getOrgScope(actor.id, actor.role, tx);
      allowed = scope.mode === 'all' || scope.orgIds.includes(document.organizationId);
    }
    if (!allowed || document.publishedSnapshot.documentId !== document.id) throw new DocumentWriteError(404, 'Not found');
    const files = publicationManifestSchema.safeParse(document.publishedSnapshot.attachmentManifest);
    const tags = publicationTagsSchema.safeParse(document.publishedSnapshot.tags);
    if (!files.success || !tags.success) throw new DocumentWriteError(503, 'Published metadata is unavailable; check publication integrity');
    return { documentId: document.id, organizationId: document.organizationId, snapshot: document.publishedSnapshot, files: files.data, tags: tags.data };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readPublishedDocument(actorId: string, documentId: string) {
  const context = await publishedContext(actorId, documentId);
  return { documentId: context.documentId, snapshotId: context.snapshot.id, organizationId: context.organizationId,
    title: context.snapshot.title, content: context.snapshot.content, category: context.snapshot.category,
    tags: context.tags, publishedAt: context.snapshot.publishedAt,
    attachments: context.files.map(({ attachmentId, filename, mimeType, size }) => ({ attachmentId, filename, mimeType, size })) };
}

export async function readPublishedFile(actorId: string, documentId: string, snapshotId: string, attachmentId: string, storage: ImmutableFileStore) {
  const context = await publishedContext(actorId, documentId);
  if (context.snapshot.id !== snapshotId) throw new DocumentWriteError(404, 'Not found');
  const reference = context.files.find(file => file.attachmentId === attachmentId);
  if (!reference) throw new DocumentWriteError(404, 'Not found');
  let bytes: Buffer;
  try { bytes = await storage.read(reference); }
  catch { throw new DocumentWriteError(503, 'Published file is unavailable; check storage integrity'); }
  // Revalidate after storage I/O so revocation or publication replacement during the read cannot serve stale access.
  const current = await publishedContext(actorId, documentId);
  if (current.snapshot.id !== snapshotId) throw new DocumentWriteError(404, 'Not found');
  return { bytes, filename: reference.filename, mimeType: reference.mimeType, size: reference.size };
}
