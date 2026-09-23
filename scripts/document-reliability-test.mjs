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
    const edited = await call(`/documents/${own.body.id}`, sessions[role], 'PUT', { content: 'changed' });
    check(edited.status === 200, `${role} can update owned document`);
    const folder = await db.folder.create({ data: { name: 'Move test', userId: users.find(u => u.role === role).id } });
    const staleMove = await call(`/documents/${own.body.id}`, sessions[role], 'PUT', { folderId: folder.id, expectedUpdatedAt: own.body.updatedAt });
    check(staleMove.status === 409, `${role} stale folder move rejected`);
    const moved = await call(`/documents/${own.body.id}`, sessions[role], 'PUT', { folderId: folder.id, expectedUpdatedAt: edited.body.updatedAt });
    check(moved.status === 200 && moved.body.folderId === folder.id && moved.body.content === 'changed', `${role} folder move preserves latest content`);
    const root = await call(`/documents/${own.body.id}`, sessions[role], 'PUT', { folderId: null, expectedUpdatedAt: moved.body.updatedAt });
    check(root.status === 200 && root.body.folderId === null && root.body.content === 'changed', `${role} move to root preserves content`);
  }
  const parentFolder = await call('/folders', sessions.admin, 'POST', { name: 'Parent', organizationId: org.id });
  check(parentFolder.status === 201, 'admin creates organization folder');
  const childFolder = await call('/folders', sessions.admin, 'POST', { name: 'Child', parentId: parentFolder.body.id });
  check(childFolder.status === 201 && childFolder.body.organizationId === org.id, 'subfolder inherits parent organization');
  check((await call('/folders', sessions.editor, 'POST', { name: 'Foreign child', parentId: parentFolder.body.id })).status === 404, 'foreign parent folder rejected');
  check((await call('/folders', sessions.editor, 'POST', { name: 'Wrong org', organizationId: otherOrg.id })).status === 403, 'folder creation enforces organization access');
  check((await call('/folders', sessions.admin, 'POST', { name: 'Mismatch', parentId: parentFolder.body.id, organizationId: otherOrg.id })).status === 400, 'subfolder cannot cross organization boundary');
  check((await call('/folders', sessions.admin, 'POST', { name: '   ' })).status === 400, 'blank folder rejected');
  check((await call(`/folders/${parentFolder.body.id}`, sessions.admin, 'PUT', { name: '' })).status === 400, 'blank rename rejected');
  check((await call(`/folders?organizationId=${otherOrg.id}`, sessions.admin)).body.length === 0, 'folder list honors organization filter');
  check((await call('/folders', sessions.editor)).body.every(f => f.id !== parentFolder.body.id), 'folder list hides other owners');
  for (const role of ['viewer', null]) {
    const session = role ? sessions[role] : null;
    check((await call('/folders', session, 'POST', { name: 'Denied' })).status === (role ? 403 : 401), `${role || 'anonymous'} cannot create folders`);
    check((await call(`/folders/${parentFolder.body.id}`, session, 'PUT', { name: 'Denied' })).status === (role ? 403 : 401), `${role || 'anonymous'} cannot rename folders`);
    check((await call(`/folders/${parentFolder.body.id}`, session, 'DELETE')).status === (role ? 403 : 401), `${role || 'anonymous'} cannot delete folders`);
  }
  check((await call(`/folders/${parentFolder.body.id}`, sessions.editor, 'DELETE')).status === 404, 'non-owner cannot delete folder');
  const filed = await call('/documents', sessions.admin, 'POST', { title: 'Keep on folder deletion', folderId: parentFolder.body.id, organizationId: org.id });
  check((await call(`/folders/${parentFolder.body.id}`, sessions.admin, 'PUT', { name: 'Renamed' })).body.name === 'Renamed', 'owner can rename folder');
  check((await call(`/folders/${parentFolder.body.id}`, sessions.admin, 'DELETE')).status === 200, 'owner can delete folder');
  check((await call(`/documents/${filed.body.id}`, sessions.admin)).body.folderId === null, 'folder deletion preserves document at root');
  const survivingChild = await db.folder.findUnique({ where: { id: childFolder.body.id } });
  check(survivingChild?.parentId === null && survivingChild.organizationId === org.id, 'folder deletion preserves subfolder and organization');
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
  const listFolder = await db.folder.create({ data: { userId: users[0].id, name: 'Pagination folder' } });
  const listPrefix = `${suffix}-list-`;
  await db.document.createMany({ data: Array.from({ length: 106 }, (_, index) => ({
    id: `${listPrefix}${String(index).padStart(3, '0')}`, title: `${listPrefix}${index}`,
    content: index === 100 ? 'needle beyond the first fifty' : '',
    userId: users[0].id, organizationId: index === 105 ? otherOrg.id : org.id,
    visibility: index === 102 ? 'private' : 'org',
    isArchived: index === 104, isPinned: index === 103,
    folderId: index === 100 ? listFolder.id : null,
    category: index === 100 ? 'runbook' : 'general',
    createdAt: new Date('2020-01-01'), updatedAt: new Date('2020-01-01'),
  })) });
  const listPath = `/documents?q=${listPrefix}&organizationId=${org.id}&archived=false`;
  const pages = await Promise.all([0, 1, 2].map(page => call(`${listPath}&page=${page}`, sessions.admin)));
  check(pages.every(r => r.status === 200 && r.body.total === 104), 'pagination returns the full filtered count');
  check(pages[0].body.items.length === 50 && pages[1].body.items.length === 50 && pages[2].body.items.length === 4, 'documents beyond fifty are reachable across pages');
  check(new Set(pages.flatMap(r => r.body.items.map(d => d.id))).size === 104, 'equal timestamps paginate without duplicates');
  check(pages[0].body.items[0].isPinned, 'pinned documents sort before unpinned documents');
  check(pages[0].body.hasMore && !pages[2].body.hasMore, 'last page is correctly reported');
  const searchList = await call(`/documents?q=NEEDLE%20BEYOND&organizationId=${org.id}`, sessions.admin);
  check(searchList.body.total === 1 && searchList.body.items[0].id === `${listPrefix}100`, 'case-insensitive search finds body text beyond the first page');
  check((await call(`${listPath}&category=runbook`, sessions.admin)).body.total === 1, 'category filters the full collection');
  check((await call(`${listPath}&folderId=${listFolder.id}`, sessions.admin)).body.total === 1, 'folder filters the full collection');
  check((await call(`${listPath}&folderId=${listFolder.id}&category=general`, sessions.admin)).body.total === 0, 'combined filters intersect');
  check((await call(`/documents?q=${listPrefix}&organizationId=${org.id}`, sessions.admin)).body.total === 105, 'omitting archive filter preserves API compatibility');
  for (const role of ['editor', 'viewer']) {
    const scoped = await call(`/documents?q=${listPrefix}&limit=100`, sessions[role]);
    check(scoped.body.total === 103 && !scoped.body.items.some(d => d.id === `${listPrefix}102` || d.id === `${listPrefix}105`), `${role} list filtering preserves private and organization boundaries`);
    check((await call(`/documents?q=${listPrefix}&organizationId=${otherOrg.id}`, sessions[role])).body.total === 0, `${role} cannot expand access with query filters`);
  }
  check((await call(listPath, null)).status === 401, 'anonymous paginated search blocked');
  check((await call(`/documents?q=${'x'.repeat(501)}`, sessions.admin)).status === 400, 'oversized search rejected');
  console.log(`${checks} reliability checks passed`);
} finally {
  const ids = users.map(u => u.id);
  await db.attachment.deleteMany({ where: { userId: { in: ids } } });
  await db.document.deleteMany({ where: { userId: { in: ids } } });
  await db.folder.deleteMany({ where: { userId: { in: ids } } });
  await db.tag.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await db.organizationMember.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: [org?.id, otherOrg?.id].filter(Boolean) } } });
  await db.$disconnect();
}
