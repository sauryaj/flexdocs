import { validateImportTopology } from './import-topology';

export const requiredImportCollections = ['organizations', 'members', 'folders', 'documents', 'passwords', 'domains', 'sslCertificates', 'assets', 'assetTypes', 'checklists', 'tickets', 'relationships', 'tags'] as const;
const optionalCollections = ['checklistItems', 'renewals', 'servers', 'ipamNetworks', 'contacts', 'locations', 'websites'] as const;

export function previewBackup(value: unknown) {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  const warnings = [
    'Counts describe records in the file, not predicted new records. Existing IDs and other uniqueness conflicts may be skipped.',
    'Supported owned records are assigned to the importing administrator. Organization memberships in the file may be restored for existing accounts.',
    'Import can partially succeed. This preview checks structure and folder relationships; database constraints, individual field values and file writes are checked during execution.',
    'A retry does not repair every partially imported record. Review the result before retrying. Keep the original file.',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, counts, errors: ['Unsupported backup format'], warnings };
  const bundle = value as Record<string, unknown>;
  if (bundle.schema !== 'flexdocs-backup' || bundle.version !== 1) errors.push('Unsupported backup format');
  for (const key of [...requiredImportCollections, ...optionalCollections]) {
    const collection = bundle[key];
    if (collection === undefined && optionalCollections.includes(key as typeof optionalCollections[number])) continue;
    if (!Array.isArray(collection)) errors.push(`Invalid or missing collection: ${key}`);
    else {
      counts[key] = collection.length;
      if (collection.some(item => key === 'tags' ? typeof item !== 'string' : !item || typeof item !== 'object' || Array.isArray(item))) errors.push(`Invalid records in collection: ${key}`);
    }
  }
  if (!errors.length) errors.push(...validateImportTopology(bundle.folders, bundle.documents));
  return { valid: errors.length === 0, counts, errors, warnings };
}

export type ImportPreview = ReturnType<typeof previewBackup>;
