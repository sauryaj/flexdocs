import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.DOCUMENT_TEST_ISOLATED !== '1') throw new Error('Run only against a disposable seeded database with DOCUMENT_TEST_ISOLATED=1');
const base = process.env.TEST_BASE_URL || 'http://localhost:3101';
const db = new PrismaClient();
const suffix = `docs-test-${Date.now()}`;
const users = [];
let org;
let otherOrg;
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log(`PASS ${message}`); }
async function call(path, cookie, method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  const password = await bcrypt.hash('Documentation-test-only-123!', 10);
  const sessions = {};
  for (const role of ['admin', 'editor', 'viewer']) {
    const user = await db.user.create({ data: { email: `${suffix}-${role}@example.invalid`, name: `Documentation test ${role}`, password, role } });
    users.push(user);
    const login = await call('/login', null, 'POST', { email: user.email, password: 'Documentation-test-only-123!' });
    check(login.status === 200, `${role} login`);
    sessions[role] = login.cookie;
  }
  for (const role of ['editor', 'viewer']) {
    check((await call('/backups', sessions[role])).status === 403, `${role} cannot list database backups`);
    check((await call('/backups/flexdocs-backup-2026.sql/download', sessions[role])).status === 403, `${role} cannot download database backups`);
  }
  org = await db.organization.create({ data: { name: suffix } });
  otherOrg = await db.organization.create({ data: { name: `${suffix}-other` } });
  await db.organizationMember.createMany({ data: users.filter(u => u.role !== 'admin').map(u => ({ userId: u.id, organizationId: org.id })) });
  const outside = await call('/documents', sessions.admin, 'POST', { title: 'Outside scope', organizationId: otherOrg.id, visibility: 'org' });
  check((await call(`/documents/${outside.body.id}`, sessions.viewer)).status === 404, 'other organization document hidden');
  check(!(await call('/documents', sessions.viewer)).body.items.some(d => d.id === outside.body.id), 'other organization absent from list');
  const create = await call('/documents', sessions.admin, 'POST', { title: 'Initial', content: 'A', tags: ['same', 'same'], organizationId: org.id, visibility: 'org' });
  check(create.status === 201 && create.body.tags.length === 1, 'atomic creation deduplicates tags');
  const id = create.body.id;
  for (const role of ['admin', 'editor', 'viewer']) {
    check((await call(`/documents/${id}`, sessions[role])).status === 200, `${role} can read shared document`);
  }
  check((await call(`/documents/${id}`, null)).status === 401, 'anonymous read blocked');
  check((await call('/documents?page=bad&limit=bad', sessions.admin)).status === 200, 'invalid pagination safe');
  const shared = await call(`/documents/${id}`, sessions.viewer);
  check(shared.body.canEdit === false, 'viewer receives read-only document');
  check((await call('/documents', sessions.editor, 'POST', { title: 'Wrong org', organizationId: otherOrg.id })).status === 403, 'out-of-scope organization rejected');
  for (const role of ['admin', 'editor']) {
    const own = await call('/documents', sessions[role], 'POST', { title: `${role} own doc`, content: 'owned' });
    check(own.status === 201, `${role} can create`);
    check((await call('/documents', sessions[role])).body.items.some(d => d.id === own.body.id), `${role} can find own private document`);
    check((await call(`/documents/${own.body.id}`, sessions[role], 'PUT', { content: 'changed' })).status === 200, `${role} can update owned document`);
  }
  let current = create.body;
  for (const content of ['B', 'C', 'D']) {
    const result = await call(`/documents/${id}`, sessions.admin, 'PUT', { content, expectedUpdatedAt: current.updatedAt });
    check(result.status === 200, `rapid save ${content}`); current = result.body;
  }
  const history = await call(`/documents/${id}/revisions`, sessions.admin);
  check(['A', 'B', 'C'].every(content => history.body.some(r => r.content === content)), 'rapid overwrites remain recoverable');
  const stale = await call(`/documents/${id}`, sessions.admin, 'PUT', { content: 'stale', expectedUpdatedAt: create.body.updatedAt });
  check(stale.status === 409, 'stale tab rejected');
  const races = await Promise.all(['race-one', 'race-two'].map(content => call(`/documents/${id}`, sessions.admin, 'PUT', { content, expectedUpdatedAt: current.updatedAt })));
  check(races.filter(r => r.status === 200).length === 1 && races.filter(r => r.status === 409).length === 1, 'concurrent same-version writes have exactly one winner');
  for (const role of ['viewer', null]) {
    for (const path of [`/documents/${id}/revisions`, `/documents/${id}/revisions/${history.body[0].id}/restore`]) {
      check((await call(path, role ? sessions[role] : null, 'POST', {})).status === (role ? 403 : 401), `${role || 'anonymous'} revision mutation blocked`);
    }
  }
  check((await call(`/documents/${id}/revisions`, sessions.editor, 'POST', {})).status === 404, 'non-owner cannot modify revision');
  const before = await call(`/documents/${id}`, sessions.admin);
  const restored = await call(`/documents/${id}/revisions/${history.body.find(r => r.content === 'A').id}/restore`, sessions.admin, 'POST', undefined, { 'If-Unmodified-Since-Version': before.body.updatedAt });
  check(restored.status === 201 && restored.body.content === 'A', 'restore alias restores selected version');
  const afterHistory = await call(`/documents/${id}/revisions`, sessions.admin);
  check(afterHistory.body.some(r => r.content === before.body.content), 'restore preserves overwritten content');
  check(new Set(afterHistory.body.map(r => r.version)).size === afterHistory.body.length, 'revision versions remain unique');
  check((await call(`/documents/${id}`, sessions.admin, 'PUT', { title: ' ' })).status === 400, 'invalid title rejected');
  check((await call(`/documents/${id}`, sessions.admin, 'PUT', { reviewDate: 'bad' })).status === 400, 'invalid date rejected');
  check((await call(`/documents/${id}`, sessions.admin, 'PUT', { folderId: 'missing' })).status === 404, 'missing folder rejected');
  await call(`/documents/${id}`, sessions.admin, 'PUT', { isArchived: true });
  check((await call(`/documents/${id}`, sessions.viewer)).status === 404, 'archived shared document hidden');
  await call(`/documents/${id}`, sessions.admin, 'PUT', { visibility: 'private' });
  check((await call(`/documents/${id}`, sessions.viewer)).status === 404, 'private document hidden from organization members');
  const copy = await call(`/documents/${id}/duplicate`, sessions.admin, 'POST');
  check(copy.status === 201 && await db.documentRevision.count({ where: { documentId: copy.body.id } }) === 1, 'duplicate has atomic initial history');
  check((await call('/documents/bulk', sessions.admin, 'POST', { action: 'delete', ids: [copy.body.id] })).status === 200, 'bulk delete handles relations without invalid SQL');
  check(!!(await db.document.findUnique({ where: { id: copy.body.id } }))?.deletedAt, 'bulk deletion preserves document in Trash');
  check(await db.documentRevision.count({ where: { documentId: copy.body.id } }) === 1, 'bulk deletion retains revision history');
  const trashDoc = await call('/documents', sessions.admin, 'POST', { title: `${suffix}-trash`, content: 'Keep this content', organizationId: org.id, visibility: 'org', tags: ['recover-me'] });
  const trashId = trashDoc.body.id;
  const attachment = await db.attachment.create({ data: { documentId: trashId, userId: users[0].id, filename: 'retained.txt', mimeType: 'text/plain', size: 8, data: Buffer.from('retained').toString('base64') } });
  for (const role of ['viewer', null]) {
    check((await call(`/documents/${trashId}`, role ? sessions[role] : null, 'DELETE')).status === (role ? 403 : 401), `${role || 'anonymous'} cannot trash document`);
    check((await call(`/documents/${trashId}/restore`, role ? sessions[role] : null, 'POST')).status === (role ? 403 : 401), `${role || 'anonymous'} cannot restore document`);
  }
  check((await call(`/documents/${trashId}`, sessions.editor, 'DELETE')).status === 404, 'non-owner cannot trash shared document');
  check((await call(`/documents/${trashId}`, sessions.admin, 'DELETE')).status === 200, 'owner moves document to Trash');
  check((await call(`/documents/${trashId}`, sessions.admin)).status === 404, 'trashed document hidden from normal detail');
  check((await call(`/documents/${trashId}`, sessions.admin, 'PUT', { content: 'overwrite trash' })).status === 404, 'trashed document cannot be edited');
  check((await call(`/documents/${trashId}/duplicate`, sessions.admin, 'POST')).status === 404, 'trashed document cannot be duplicated');
  check(!(await call('/documents', sessions.admin)).body.items.some(d => d.id === trashId), 'trashed document absent from active list');
  check((await call('/documents?trash=true', sessions.admin)).body.items.some(d => d.id === trashId), 'owner can list Trash');
  check(!(await call('/documents?trash=true', sessions.editor)).body.items.some(d => d.id === trashId), 'Trash hidden from other users');
  check(!(await call(`/search?q=${suffix}-trash`, sessions.admin)).body.groups.some(g => g.type === 'documents' && g.items.some(d => d.id === trashId)), 'Trash excluded from search');
  check(!(await call(`/organizations/${org.id}`, sessions.admin)).body.documents.some(d => d.id === trashId), 'Trash excluded from nested organization documents');
  check((await call(`/portal/kb/${trashId}`, sessions.viewer)).status === 404, 'Trash excluded from knowledge base');
  check((await call(`/attachments/${attachment.id}`, sessions.admin)).status === 404, 'trashed attachment cannot be downloaded');
  check((await call(`/attachments/${attachment.id}`, sessions.admin, 'DELETE')).status === 404, 'trashed attachment protected from deletion');
  check((await call(`/documents/${trashId}/restore`, sessions.editor, 'POST')).status === 404, 'non-owner cannot restore');
  const restoreRaces = await Promise.all([1, 2].map(() => call(`/documents/${trashId}/restore`, sessions.admin, 'POST')));
  check(restoreRaces.filter(r => r.status === 200).length === 1 && restoreRaces.filter(r => r.status === 404).length === 1, 'concurrent restore has exactly one winner');
  const recovered = await call(`/documents/${trashId}`, sessions.admin);
  check(recovered.body.content === 'Keep this content' && recovered.body.tags.some(t => t.name === 'recover-me'), 'restore retains content and tags');
  check(recovered.body.visibility === 'private', 'restore does not republish shared article');
  check((await call(`/documents/${trashId}/revisions`, sessions.admin)).body.length === 1, 'restore retains history');
  check((await fetch(`${base}/api/attachments/${attachment.id}`, { headers: { Cookie: sessions.admin } })).status === 200, 'restore makes attachment downloadable again');
  const editorDoc = await call('/documents', sessions.editor, 'POST', { title: 'Editor trash fixture' });
  check((await call(`/documents/${editorDoc.body.id}`, sessions.editor, 'DELETE')).status === 200, 'editor can trash own document');
  check((await call(`/documents/${editorDoc.body.id}/restore`, sessions.editor, 'POST')).status === 200, 'editor can restore own document');
  console.log(`${checks} reliability checks passed`);
} finally {
  const ids = users.map(u => u.id);
  await db.attachment.deleteMany({ where: { userId: { in: ids } } });
  await db.document.deleteMany({ where: { userId: { in: ids } } });
  await db.tag.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await db.organizationMember.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: [org?.id, otherOrg?.id].filter(Boolean) } } });
  await db.$disconnect();
}
