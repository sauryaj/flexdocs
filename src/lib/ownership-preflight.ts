import { validateImportTopology } from '@/lib/import-topology';

interface FolderRecord { id: string; userId: string; organizationId: string | null; parentId: string | null }
interface DocumentRecord { id: string; userId: string; organizationId: string | null; folderId: string | null; visibility: string; isArchived: boolean; deletedAt: Date | null }

export function ownershipPreflight(folders: FolderRecord[], documents: DocumentRecord[]) {
  const errors = validateImportTopology(folders, documents).map(error => error.replaceAll('backup', 'installation'));
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const lifecycleCounts = { draft: 0, published: 0, archived: 0, trashed: 0 };
  for (const folder of folders) {
    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    if (parent && parent.userId !== folder.userId) errors.push(`folder ${folder.id}: parent belongs to another owner`);
  }
  for (const doc of documents) {
    if (doc.visibility !== 'private' && doc.visibility !== 'org') errors.push(`document ${doc.id}: unknown visibility`);
    if (doc.visibility === 'org' && !doc.organizationId) errors.push(`document ${doc.id}: shared document has no organization`);
    const folder = doc.folderId ? byId.get(doc.folderId) : undefined;
    if (folder && folder.userId !== doc.userId) errors.push(`document ${doc.id}: folder belongs to another owner`);
    const state = doc.deletedAt ? 'trashed' : doc.isArchived ? 'archived' : doc.visibility === 'org' && doc.organizationId ? 'published' : 'draft';
    lifecycleCounts[state]++;
  }
  return { ready: errors.length === 0, documents: documents.length, folders: folders.length,
    lifecycleCounts, errors, warning: 'Read-only compatibility preflight. Counts describe proposed legacy mapping, not migrated states. No ownership, publication or audience changes are applied.' };
}
