import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

export async function inspectAttachmentStorage(root: string, records: { id: string; filePath: string | null }[], now = Date.now()) {
  const configuredRoot = resolve(root);
  const canonicalRoot = await realpath(root);
  const files = new Map<string, number>();
  const skippedSymlinks: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) skippedSymlinks.push(relative(canonicalRoot, path));
      else if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.set(path, (await lstat(path)).mtimeMs);
    }
  };
  await walk(canonicalRoot);
  const referenced = new Set<string>();
  const missing: string[] = [];
  const outsideRoot: string[] = [];
  for (const record of records) {
    if (!record.filePath) { missing.push(record.id); continue; }
    const configuredRelative = relative(configuredRoot, resolve(record.filePath));
    const insideConfiguredRoot = configuredRelative !== '..' && !configuredRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(configuredRelative);
    const path = insideConfiguredRoot ? join(canonicalRoot, configuredRelative) : resolve(record.filePath);
    const rel = relative(canonicalRoot, path);
    if (rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || rel === '..' || isAbsolute(rel)) {
      outsideRoot.push(record.id); continue;
    }
    referenced.add(path);
    if (!files.has(path)) missing.push(record.id);
  }
  const unreferenced = [...files].filter(([path]) => !referenced.has(path)).map(([path, modified]) => ({
    path: relative(canonicalRoot, path), olderThan24Hours: now - modified >= 86_400_000,
  }));
  return { scannedFiles: files.size, scannedRecords: records.length, missing, outsideRoot, skippedSymlinks, unreferenced };
}
