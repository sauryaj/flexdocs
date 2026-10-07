import { expect, it } from 'vitest';
import { folderCreateSchema, folderUpdateSchema } from '@/lib/folder-input';

it('normalizes names and preserves partial updates', () => {
  expect(folderCreateSchema.parse({ name: '  Runbooks  ' }).name).toBe('Runbooks');
  expect(folderUpdateSchema.parse({ color: '#abcdef' })).toEqual({ color: '#abcdef' });
});

it.each([{ name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 'Valid', color: 'red' }, { name: 'Valid', parentId: 10 }, null])('rejects malformed folder input %j', value => {
  expect(folderCreateSchema.safeParse(value).success).toBe(false);
});

it('does not allow hierarchy changes through the rename endpoint', () => {
  expect(folderUpdateSchema.parse({ name: 'Renamed', parentId: 'foreign', userId: 'other' })).toEqual({ name: 'Renamed' });
});
