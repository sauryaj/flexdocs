import { expect, it } from 'vitest';
import { publicationManifestSchema, publicationTagsSchema } from '@/lib/publication-manifest';
const file = { attachmentId: 'source', filename: 'file.bin', mimeType: 'application/octet-stream', key: 'a'.repeat(64), sha256: 'a'.repeat(64), size: 1 };
it('accepts exact captured file metadata and empty selections', () => {
  expect(publicationManifestSchema.parse([file])).toEqual([file]);
  expect(publicationManifestSchema.parse([])).toEqual([]);
});
it('rejects ambiguous references, oversized selections and unchecked extra fields', () => {
  for (const manifest of [[file, file], [{ ...file, key: '../outside' }], [{ ...file, sha256: 'b'.repeat(64) }], [{ ...file, filePath: '/private' }], [{ ...file, size: -1 }], Array.from({ length: 11 }, (_, index) => ({ ...file, attachmentId: String(index) })), Array.from({ length: 6 }, (_, index) => ({ ...file, attachmentId: String(index), size: 10 * 1024 * 1024 }))]) expect(publicationManifestSchema.safeParse(manifest).success).toBe(false);
});
it('bounds frozen tag metadata without silently truncating it', () => {
  expect(publicationTagsSchema.safeParse(['valid']).success).toBe(true);
  expect(publicationTagsSchema.safeParse(['x'.repeat(101)]).success).toBe(false);
  expect(publicationTagsSchema.safeParse([42]).success).toBe(false);
});
