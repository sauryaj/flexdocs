import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';
import { LocalImmutableFileStore, PUBLICATION_OBJECT_DIRECTORY } from '@/lib/immutable-file-store';

const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'flexdocs-working-file-')); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('reads exact legacy bytes and rejects corrupt encodings and sizes', async () => {
  const file = { storageType: 'base64', data: 'AP8B', size: 3, filePath: null };
  expect(await readWorkingAttachmentBytes(file, '/tmp')).toEqual(Buffer.from([0, 255, 1]));
  await expect(readWorkingAttachmentBytes({ ...file, data: 'invalid!' }, '/tmp')).rejects.toMatchObject({ status: 409 });
  await expect(readWorkingAttachmentBytes({ ...file, size: 2 }, '/tmp')).rejects.toMatchObject({ status: 409 });
  await expect(readWorkingAttachmentBytes({ ...file, size: 10 * 1024 * 1024 + 1 }, '/tmp')).rejects.toMatchObject({ status: 413 });
});

it('bounds filesystem reads and rejects outside-root paths, symlinks and missing files', async () => {
  const root = await fixture(); const other = await fixture(); const path = join(root, 'file');
  await writeFile(path, Buffer.from([0, 255, 1])); await writeFile(join(other, 'file'), 'outside'); await symlink(path, join(root, 'link'));
  const file = { storageType: 'filesystem', data: null, size: 3, filePath: path };
  expect(await readWorkingAttachmentBytes(file, root)).toEqual(Buffer.from([0, 255, 1]));
  await expect(readWorkingAttachmentBytes({ ...file, size: 2 }, root)).rejects.toMatchObject({ status: 409 });
  await expect(readWorkingAttachmentBytes({ ...file, filePath: join(other, 'file') }, root)).rejects.toMatchObject({ status: 409 });
  await expect(readWorkingAttachmentBytes({ ...file, filePath: join(root, 'link') }, root)).rejects.toMatchObject({ status: 409 });
  await expect(readWorkingAttachmentBytes({ ...file, filePath: join(root, 'missing') }, root)).rejects.toThrow();
});

it('verifies content-addressed working objects, including same-length corruption', async () => {
  const root = await fixture(); const store = new LocalImmutableFileStore(root); const reference = await store.put(Buffer.from('original'));
  const file = { storageType: 'filesystem', data: null, size: reference.size, filePath: join(root, PUBLICATION_OBJECT_DIRECTORY, reference.key) };
  expect(await readWorkingAttachmentBytes(file, root)).toEqual(Buffer.from('original'));
  await writeFile(file.filePath, 'corrupt!');
  await expect(readWorkingAttachmentBytes(file, root)).rejects.toMatchObject({ status: 409 });
});
