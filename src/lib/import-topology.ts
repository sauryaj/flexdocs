import { z } from 'zod';

const reference = z.string().min(1).nullable().optional();
const folderSchema = z.object({ id: z.string().min(1), organizationId: reference, parentId: reference });
const documentSchema = z.object({ id: z.string().min(1), organizationId: reference, folderId: reference });

export function validateImportTopology(folders: unknown, documents: unknown): string[] {
  const parsedFolders = z.array(folderSchema).safeParse(folders);
  const parsedDocuments = z.array(documentSchema).safeParse(documents);
  if (!parsedFolders.success || !parsedDocuments.success) return ['Invalid document or folder identifiers in backup'];
  const errors: string[] = [];
  const byId = new Map(parsedFolders.data.map(folder => [folder.id, folder]));
  if (byId.size !== parsedFolders.data.length) errors.push('Duplicate folder identifiers in backup');
  if (new Set(parsedDocuments.data.map(doc => doc.id)).size !== parsedDocuments.data.length) errors.push('Duplicate document identifiers in backup');
  for (const folder of parsedFolders.data) {
    if (!folder.parentId) continue;
    const parent = byId.get(folder.parentId);
    if (!parent) errors.push(`folder ${folder.id}: parent is missing from backup`);
    else if ((parent.organizationId ?? null) !== (folder.organizationId ?? null)) errors.push(`folder ${folder.id}: parent belongs to another organization`);
  }
  const visited = new Set<string>();
  for (const folder of parsedFolders.data) {
    const path = new Set<string>();
    let current: string | null | undefined = folder.id;
    while (current && byId.has(current) && !visited.has(current)) {
      if (path.has(current)) { errors.push(`folder ${current}: parent cycle in backup`); break; }
      path.add(current);
      current = byId.get(current)?.parentId;
    }
    for (const id of path) visited.add(id);
  }
  for (const doc of parsedDocuments.data) {
    if (!doc.folderId) continue;
    const folder = byId.get(doc.folderId);
    if (!folder) errors.push(`document ${doc.id}: folder is missing from backup`);
    else if ((folder.organizationId ?? null) !== (doc.organizationId ?? null)) errors.push(`document ${doc.id}: folder belongs to another organization`);
  }
  return errors;
}
