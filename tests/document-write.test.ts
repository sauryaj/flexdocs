import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Document, type Prisma } from '@prisma/client';
import { documentUpdateSchema, DocumentWriteError, snapshotDocument, withDocumentWrite } from '@/lib/document-write';
import { prisma } from '@/lib/prisma';

const authMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

const document = { id: 'doc', userId: 'owner', title: 'Title', content: 'Current text', category: 'general', updatedAt: new Date('2026-01-01T00:00:00Z') } as Document;
const tx = {
  $queryRaw: vi.fn(),
  document: { findFirst: vi.fn(), update: vi.fn() },
  documentRevision: { findFirst: vi.fn(), create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.document.findFirst.mockResolvedValue(document);
  tx.documentRevision.findFirst.mockResolvedValue(null);
  Object.assign(prisma, { $transaction: vi.fn(async callback => callback(tx)) });
});

describe('document validation and recovery', () => {
  it('rejects invalid payloads before database writes', () => {
    for (const value of [null, { title: ' ' }, { content: 42 }, { tags: 'tag' }, { reviewDate: 'invalid' }, { visibility: 'public' }]) {
      expect(documentUpdateSchema.safeParse(value).success).toBe(false);
    }
  });
  it('deduplicates tag names and preserves absent fields', () => {
    expect(documentUpdateSchema.parse({ tags: ['a', ' a ', 'b'] })).toEqual({ tags: ['a', 'b'] });
    expect(documentUpdateSchema.parse({ isPinned: true })).toEqual({ isPinned: true });
  });
  it('rejects stale edits without executing the writer', async () => {
    const write = vi.fn();
    await expect(withDocumentWrite('doc', 'owner', '2025-01-01T00:00:00.000Z', write)).rejects.toMatchObject({ status: 409 });
    expect(write).not.toHaveBeenCalled();
  });
  it('rejects documents not owned by the writer', async () => {
    tx.document.findFirst.mockResolvedValue(null);
    await expect(withDocumentWrite('doc', 'other', undefined, vi.fn())).rejects.toBeInstanceOf(DocumentWriteError);
    expect(tx.document.findFirst).toHaveBeenCalledWith({ where: { id: 'doc', userId: 'other' } });
  });
  it('keeps the parent locked in the transaction used for the write', async () => {
    const write = vi.fn().mockResolvedValue('saved');
    expect(await withDocumentWrite('doc', 'owner', document.updatedAt.toISOString(), write)).toBe('saved');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(tx, document);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);
  });
  it('does not throttle snapshots of rapid edits or title-only changes', async () => {
    tx.documentRevision.findFirst.mockResolvedValue({ version: 4, title: 'Old title', content: document.content, category: document.category, createdAt: new Date() });
    await snapshotDocument(tx as unknown as Prisma.TransactionClient, document, 'before overwrite');
    expect(tx.documentRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 5, title: document.title, content: document.content }) });
  });
  it('skips only a snapshot that already preserves all versioned fields', async () => {
    tx.documentRevision.findFirst.mockResolvedValue({ ...document, version: 4 });
    await snapshotDocument(tx as unknown as Prisma.TransactionClient, document, 'before overwrite');
    expect(tx.documentRevision.create).not.toHaveBeenCalled();
  });
});

describe('revision endpoint authorization', () => {
  it.each(['admin', 'editor'])('allows %s to reach ownership verification', async role => {
    authMock.mockResolvedValue({ id: 'owner', role });
    tx.document.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/documents/[id]/revisions/route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: 'doc' }) });
    expect(response.status).toBe(404);
  });
  it.each([null, { id: 'owner', role: 'viewer' }])('blocks unauthorized revision creation and restore: %j', async user => {
    authMock.mockResolvedValue(user);
    const create = await import('@/app/api/documents/[id]/revisions/route');
    const restore = await import('@/app/api/documents/[id]/revisions/[revisionId]/restore/route');
    const params = Promise.resolve({ id: 'doc', revisionId: 'rev' });
    for (const handler of [create.POST, restore.POST]) {
      const response = await handler(new Request('http://localhost', { method: 'POST', body: '{}' }), { params });
      expect(response.status).toBe(user ? 403 : 401);
    }
    expect(tx.document.update).not.toHaveBeenCalled();
  });
});

describe('document read access', () => {
  it('keeps private owner documents visible while constraining shared access', async () => {
    const { documentReadWhere } = await import('@/lib/document-access');
    expect(documentReadWhere('owner', { mode: 'limited', orgIds: ['allowed'] })).toEqual({ OR: [
      { userId: 'owner' }, { organizationId: { in: ['allowed'] }, visibility: 'org', isArchived: false },
    ] });
    expect(documentReadWhere('viewer', { mode: 'limited', orgIds: [] })).toEqual({ OR: [
      { userId: 'viewer' }, { organizationId: { in: ['__none__'] }, visibility: 'org', isArchived: false },
    ] });
  });
});

it('advances the conflict token even for writes within the same millisecond', async () => {
  const { nextDocumentTimestamp } = await import('@/lib/document-write');
  const future = { ...document, updatedAt: new Date(Date.now() + 10000) };
  expect(nextDocumentTimestamp(future).getTime()).toBe(future.updatedAt.getTime() + 1);
});
