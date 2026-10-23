import { expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalImmutableFileStore, PUBLICATION_OBJECT_DIRECTORY } from '@/lib/immutable-file-store';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';

it('preserves empty/binary bytes, atomically deduplicates concurrent copies and cleans temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flexdocs-immutable-'));
  try {
    const storage = new LocalImmutableFileStore(root);
    for (const bytes of [Buffer.alloc(0), Buffer.from([0, 255, 13, 10, 128])]) {
      const copies = await Promise.all(Array.from({ length: 12 }, () => storage.put(bytes)));
      expect(new Set(copies.map(copy => copy.key)).size).toBe(1);
      expect(await storage.read(copies[0])).toEqual(bytes);
      expect((await stat(join(root, PUBLICATION_OBJECT_DIRECTORY, copies[0].key))).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(join(root, PUBLICATION_OBJECT_DIRECTORY))).toHaveLength(2);
    const mutable = Buffer.from('before');
    const pending = storage.put(mutable);
    mutable.fill(0);
    expect(await storage.read(await pending)).toEqual(Buffer.from('before'));
  } finally { await rm(root, { recursive: true }); }
});

it('rejects corruption without overwriting existing bytes, invalid paths and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flexdocs-immutable-'));
  try {
    const storage = new LocalImmutableFileStore(root);
    const reference = await storage.put(Buffer.from('original'));
    const path = join(root, PUBLICATION_OBJECT_DIRECTORY, reference.key);
    await writeFile(path, 'tampered');
    await expect(storage.read(reference)).rejects.toThrow('integrity');
    await expect(storage.put(Buffer.from('original'))).rejects.toThrow('integrity');
    expect(await readFile(path, 'utf8')).toBe('tampered');
    expect(await readdir(join(root, PUBLICATION_OBJECT_DIRECTORY))).toEqual([reference.key]);
    await expect(storage.read({ ...reference, key: '../outside' })).rejects.toThrow('Invalid');
    await expect(storage.put(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))).rejects.toThrow('10 MiB');
    await expect(storage.read({ ...reference, key: 'a'.repeat(64), sha256: 'a'.repeat(64) })).rejects.toThrow();
  } finally { await rm(root, { recursive: true }); }
});

it('rejects symlink storage directories and objects without following them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flexdocs-immutable-'));
  const outside = await mkdtemp(join(tmpdir(), 'flexdocs-immutable-external-'));
  try {
    await symlink(outside, join(root, PUBLICATION_OBJECT_DIRECTORY));
    await expect(new LocalImmutableFileStore(root).put(Buffer.from('private'))).rejects.toThrow('symlink');
    expect(await readdir(outside)).toEqual([]);
    await rm(join(root, PUBLICATION_OBJECT_DIRECTORY));
    const storage = new LocalImmutableFileStore(root);
    const reference = await storage.put(Buffer.from('original'));
    const object = join(root, PUBLICATION_OBJECT_DIRECTORY, reference.key);
    await rm(object);
    await writeFile(join(outside, 'target'), 'original');
    await symlink(join(outside, 'target'), object);
    await expect(storage.read(reference)).rejects.toThrow();
    await expect(storage.put(Buffer.from('original'))).rejects.toThrow();
    expect(await readFile(join(outside, 'target'), 'utf8')).toBe('original');
  } finally { await rm(root, { recursive: true }); await rm(outside, { recursive: true }); }
});
