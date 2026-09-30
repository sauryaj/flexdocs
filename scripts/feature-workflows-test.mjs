import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';

if (process.env.DOCUMENT_TEST_ISOLATED !== '1') throw new Error('Requires DOCUMENT_TEST_ISOLATED=1 and a disposable database');
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://localhost:3101';
const suffix = `features-${Date.now()}`;
const password = 'Feature-workflows-test-only!';
const users = [], orgs = [], docs = [], passwords = [], relationships = [], uploads = [];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; console.log(`PASS ${message}`); };
async function call(path, cookie, method = 'GET', body) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
let adminCookie;
try {
  const hash = await bcrypt.hash(password, 10);
  const sessions = {};
  for (const role of ['admin', 'editor', 'viewer']) {
    const user = await db.user.create({ data: { name: suffix, email: `${suffix}-${role}@example.invalid`, password: hash, role } });
    users.push(user.id);
    const login = await call('/login', null, 'POST', { email: user.email, password });
    check(login.status === 200, `${role} login`); sessions[role] = login.cookie;
  }
  adminCookie = sessions.admin;
  for (const name of [suffix, `${suffix}-outside`]) orgs.push((await db.organization.create({ data: { name } })).id);
  await db.organizationMember.createMany({ data: users.slice(1).map(userId => ({ userId, organizationId: orgs[0] })) });
  async function document(cookie, title, organizationId, visibility = 'private') {
    const result = await call('/documents', cookie, 'POST', { title: `${suffix}-${title}`, content: 'original', organizationId, visibility });
    check(result.status === 201, `create ${title}`); docs.push(result.body.id); return result.body;
  }
  const shared = await document(sessions.admin, 'shared', orgs[0], 'org');
  const outside = await document(sessions.admin, 'outside', orgs[1], 'org');
  await document(sessions.admin, 'unassigned');
  const own = await document(sessions.editor, 'own-private');
  async function mcp(cookie, name, args) {
    const result = await call('/mcp', cookie, 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    check(result.status === 200, `MCP ${name} responds successfully`);
    return JSON.parse(result.body.result.content[0].text);
  }
  const team = await db.document.create({ data: { userId: users[2], organizationId: orgs[0], ownershipKind: 'organization', lifecycleState: 'draft', title: suffix, content: 'unpublished team body' } });
  docs.push(team.id);
  const revision = await db.documentRevision.create({ data: { documentId: team.id, userId: users[1], version: 1, title: suffix, content: 'published team body', category: 'general' } });
  const snapshot = await db.documentPublication.create({ data: { documentId: team.id, sourceRevisionId: revision.id, title: suffix, content: 'published team body', category: 'general', publisherId: users[1], tags: [] } });
  await db.document.update({ where: { id: team.id }, data: { publishedSnapshotId: snapshot.id } });
  const incompatibleExport = await call(`/organizations/${orgs[0]}/export`, sessions.admin);
  check(incompatibleExport.status === 422 && incompatibleExport.body.issues.some(issue => issue.includes('cannot preserve ownership/publication state')), 'portable export refuses lossy team publication backup');
  check((await call(`/documents/${team.id}`, sessions.viewer)).status === 404, 'team provenance owner without grant cannot read');
  await db.organizationDocumentationGrant.createMany({ data: [{ userId: users[2], organizationId: orgs[0], role: 'reader' }, { userId: users[1], organizationId: orgs[0], role: 'contributor' }] });
  const publishedDetail = await call(`/documents/${team.id}`, sessions.viewer);
  check(publishedDetail.status === 200 && publishedDetail.body.content === 'published team body' && publishedDetail.body.canEdit === false && !('publishedSnapshot' in publishedDetail.body), 'HTTP reader receives safe frozen representation');
  check((await mcp(sessions.viewer, 'flexdocs_get_document', { id: team.id })).content === 'published team body', 'MCP reader receives frozen representation');
  const teamResults = await call('/documents?q=published%20team%20body&limit=1', sessions.viewer);
  check(teamResults.status === 200 && teamResults.body.total === 1 && teamResults.body.items[0].id === team.id && teamResults.body.items[0].content === 'published team body', 'reader list matches frozen content and counts');
  check((await call('/documents?q=unpublished%20team%20body', sessions.viewer)).body.total === 0, 'reader search cannot match unpublished content');
  check((await call('/documents?q=unpublished%20team%20body', sessions.editor)).body.items[0]?.id === team.id, 'contributor search matches working content');
  check((await call('/documents?q=published%20team%20body', sessions.admin)).body.total === 0, 'global admin list cannot discover team content without grant');
  const globalPublished = await call('/search?q=published%20team%20body', sessions.viewer);
  check(globalPublished.body.groups.find(group => group.type === 'documents')?.items.some(item => item.id === team.id), 'global search discovers frozen publication');
  const globalHidden = await call('/search?q=unpublished%20team%20body', sessions.viewer);
  check(!globalHidden.body.groups.find(group => group.type === 'documents')?.items.some(item => item.id === team.id), 'global search cannot match working team body for reader');
  check(!(await mcp(sessions.viewer, 'flexdocs_search', { query: 'unpublished' })).documents.some(item => item.id === team.id), 'MCP search cannot match working team body for reader');
  check((await mcp(sessions.viewer, 'flexdocs_search', { query: 'published' })).documents.some(item => item.id === team.id && item.excerpt === 'published team body'), 'MCP search returns frozen excerpt');
  check((await mcp(sessions.viewer, 'flexdocs_org_pulse', { organizationId: orgs[0] })).documents === 2, 'MCP counts include authorized publication');
  await db.document.update({ where: { id: team.id }, data: { title: 'unpublished title only' } });
  for (const role of ['viewer', 'editor']) {
    const portal = await call('/portal/summary', sessions[role]);
    check(portal.status === 200 && portal.body.kb.find(item => item.id === team.id)?.title === suffix, `${role} portal shows frozen title rather than working draft`);
  }
  check((await call(`/documents/${team.id}`, sessions.editor)).body.content === 'unpublished team body', 'HTTP contributor receives working representation');
  check((await call(`/documents/${team.id}`, sessions.admin)).status === 404, 'HTTP global admin without grant cannot read team document');
  check((await mcp(sessions.admin, 'flexdocs_get_document', { id: team.id })).error === 'not found', 'MCP global admin without grant cannot read team document');
  check((await call(`/documents/${team.id}`, null)).status === 401, 'anonymous team document read blocked');
  await db.organizationDocumentationGrant.deleteMany({ where: { organizationId: orgs[0] } });
  check((await call(`/documents/${team.id}`, sessions.viewer)).status === 404, 'HTTP grant revocation blocks subsequent read');
  await db.document.update({ where: { id: team.id }, data: { publishedSnapshotId: null } });
  await db.documentPublication.delete({ where: { id: snapshot.id } });
  await db.document.delete({ where: { id: team.id } });
  const mcpFixtures = [];
  for (const data of [
    { visibility: 'private' },
    { visibility: 'org', isArchived: true },
    { visibility: 'org', deletedAt: new Date() },
  ]) mcpFixtures.push(await db.document.create({ data: { userId: users[1], organizationId: orgs[0], title: suffix, content: 'MCP protected fixture', ...data } }));
  for (const role of ['admin', 'viewer']) {
    for (const doc of mcpFixtures) check((await mcp(sessions[role], 'flexdocs_get_document', { id: doc.id })).error === 'not found', `${role} MCP cannot read another owner's private, archived, or trashed document (${doc.id})`);
    check((await mcp(sessions[role], 'flexdocs_org_pulse', { organizationId: orgs[0] })).documents === 1, `${role} MCP counts only readable active documents`);
    const found = await mcp(sessions[role], 'flexdocs_search', { query: suffix, organizationId: orgs[0] });
    check(found.documents.length === 1 && found.documents[0].id === shared.id, `${role} MCP search filters private, archived, trashed and other-org documents`);
  }
  check((await mcp(sessions.admin, 'flexdocs_get_document', { id: own.id })).error === 'not found', 'admin MCP cannot read another owner private unassigned document');
  check((await mcp(sessions.editor, 'flexdocs_get_document', { id: mcpFixtures[1].id })).id === mcpFixtures[1].id, 'owner MCP can read own archived document');
  check((await mcp(sessions.editor, 'flexdocs_search', { query: suffix })).documents.some(doc => doc.id === own.id), 'member MCP search includes own private document');
  check((await mcp(sessions.viewer, 'flexdocs_get_document', { id: outside.id })).error === 'not found', 'viewer MCP cannot read another organization document');
  check((await mcp(sessions.viewer, 'flexdocs_search', { query: suffix, organizationId: orgs[1] })).documents.length === 0, 'member MCP requested organization intersects access');
  check((await call('/mcp', null, 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'flexdocs_get_document', arguments: { id: shared.id } } })).status === 401, 'anonymous MCP document access blocked');
  await db.document.deleteMany({ where: { id: { in: mcpFixtures.map(doc => doc.id) } } });
  async function keyRequest(key, name, args = {}, method = 'tools/call') {
    const response = await fetch(`${base}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key, Cookie: sessions.admin }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { name, arguments: args } }) });
    return { status: response.status, body: await response.json() };
  }
  const key = `fd_${randomBytes(32).toString('hex')}`;
  const keyRecord = await db.apiKey.create({ data: { name: suffix, key: createHash('sha256').update(key).digest('hex'), userId: users[2], permissions: 'document.read' } });
  check((await keyRequest(key, 'flexdocs_get_document', { id: shared.id })).body.result.isError === false, 'document key reads permitted shared document');
  check((await keyRequest(key, 'flexdocs_get_document', { id: outside.id })).body.result.isError === true, 'document key cannot bypass organization scope');
  check((await keyRequest(key, 'flexdocs_get_document', { id: own.id })).body.result.isError === true, 'document key cannot bypass private ownership');
  for (const name of ['flexdocs_search', 'flexdocs_list_orgs', 'flexdocs_org_pulse']) check((await keyRequest(key, name, { query: suffix, organizationId: orgs[0] })).status === 403, `document-only key cannot invoke ${name}`);
  check((await keyRequest(key, '', {}, 'tools/list')).body.result.tools.map(tool => tool.name).join(',') === 'flexdocs_get_document', 'MCP advertises only authorized tools');
  await db.apiKey.update({ where: { id: keyRecord.id }, data: { permissions: 'read' } });
  check((await keyRequest(key, 'flexdocs_search', { query: suffix })).status === 200, 'legacy read key retains MCP search access');
  await db.apiKey.update({ where: { id: keyRecord.id }, data: { permissions: '' } });
  check((await keyRequest(key, 'flexdocs_get_document', { id: shared.id })).status === 403, 'empty key permissions fail closed');
  await db.apiKey.update({ where: { id: keyRecord.id }, data: { permissions: 'read', expiresAt: new Date(Date.now() - 1000) } });
  check((await keyRequest(key, 'flexdocs_get_document', { id: shared.id })).status === 401, 'expired key cannot fall back to valid admin cookie');
  await db.apiKey.update({ where: { id: keyRecord.id }, data: { expiresAt: null, isActive: false } });
  check((await keyRequest(key, 'flexdocs_get_document', { id: shared.id })).status === 401, 'revoked key cannot fall back to valid admin cookie');
  await db.apiKey.delete({ where: { id: keyRecord.id } });
  for (const visible of [false, true]) {
    const result = await call('/passwords', sessions.admin, 'POST', { name: `${suffix}-${visible ? 'visible' : 'hidden'}`, username: 'synthetic', password: 'synthetic-export-secret', organizationId: orgs[0], clientVisible: visible });
    check(result.status === 201, 'create scoped credential'); passwords.push(result.body.id);
  }
  for (const role of ['editor', 'viewer']) {
    const search = await call(`/search?q=${suffix}`, sessions[role]);
    check(search.status === 200, `${role} search`);
    const group = type => search.body.groups.find(g => g.type === type)?.items || [];
    check(group('passwords').some(p => p.id === passwords[1]) && !group('passwords').some(p => p.id === passwords[0]), `${role} cannot search hidden credential metadata`);
    check(group('documents').some(d => d.id === shared.id) && !group('documents').some(d => d.id === outside.id), `${role} search respects organization visibility`);
    if (role === 'editor') check(group('documents').some(d => d.id === own.id), 'owner private document remains searchable');
  }
  const relation = await call('/relationships', sessions.admin, 'POST', { sourceType: 'document', sourceId: shared.id, targetType: 'password', targetId: passwords[1] });
  check(relation.status === 201 && relation.body.name === 'related_to', 'link without optional name succeeds'); relationships.push(relation.body.id);
  for (const targetId of [passwords[0]]) {
    const hidden = await call('/relationships', sessions.admin, 'POST', { sourceType: 'document', sourceId: shared.id, targetType: 'password', targetId });
    relationships.push(hidden.body.id);
  }
  const outsideRelation = await call('/relationships', sessions.admin, 'POST', { sourceType: 'document', sourceId: shared.id, targetType: 'document', targetId: outside.id });
  relationships.push(outsideRelation.body.id);
  check((await call(`/relationships?entityType=document&entityId=${shared.id}`, sessions.viewer)).body.length === 1, 'relationship list hides inaccessible endpoints');
  check(!(await call('/relationships', sessions.viewer)).body.some(r => r.id === outsideRelation.body.id), 'global relationship list hides cross-org endpoints');
  check((await call(`/relationships?entityType=document&entityId=${outside.id}`, sessions.viewer)).status === 404, 'inaccessible relationship source is hidden');
  check((await call('/relationships', sessions.editor, 'POST', { sourceType: 'document', sourceId: own.id, targetType: 'document', targetId: outside.id })).status === 404, 'editor cannot link outside organization');
  check((await call(`/relationships/${outsideRelation.body.id}`, sessions.editor, 'DELETE')).status === 404, 'editor cannot unlink inaccessible endpoints');
  check((await call('/relationships', sessions.viewer, 'POST', { sourceType: 'document', sourceId: shared.id, targetType: 'password', targetId: passwords[1] })).status === 403, 'viewer cannot create links');
  check((await call('/relationships', null)).status === 401, 'anonymous relationships blocked');
  const file = await call('/attachments', sessions.admin, 'POST', { documentId: shared.id, filename: 'fixture.txt', mimeType: 'text/plain', data: Buffer.from('portable file bytes').toString('base64') });
  check(file.status === 201, 'create portable attachment'); uploads.push(file.body.id);
  const multipartBytes = Buffer.from([0, 255, 128, 10]);
  async function multipart(cookie, documentId) {
    const form = new FormData();
    form.set('documentId', documentId);
    form.set('file', new File([multipartBytes], 'multipart.bin'));
    return fetch(`${base}/api/attachments`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form });
  }
  const multipartResponse = await multipart(sessions.admin, shared.id);
  const multipartFile = await multipartResponse.json();
  check(multipartResponse.status === 201 && multipartFile.size === 4 && !('filePath' in multipartFile), 'multipart upload stores bytes without exposing storage path');
  uploads.push(multipartFile.id);
  const download = await fetch(`${base}/api/attachments/${multipartFile.id}`, { headers: { Cookie: sessions.admin } });
  check(download.status === 200 && Buffer.from(await download.arrayBuffer()).equals(multipartBytes), 'multipart upload downloads exact binary bytes');
  check((await multipart(sessions.editor, shared.id)).status === 404, 'non-owner cannot upload to shared document');
  check((await multipart(sessions.viewer, shared.id)).status === 403, 'viewer multipart upload denied');
  check((await multipart(null, shared.id)).status === 401, 'anonymous multipart upload denied');
  check((await call(`/attachments/${multipartFile.id}`, sessions.editor, 'DELETE')).status === 404, 'non-owner cannot delete attachment');
  check((await call(`/attachments/${multipartFile.id}`, sessions.viewer, 'DELETE')).status === 403, 'viewer cannot delete attachment');
  check((await call(`/attachments/${multipartFile.id}`, null, 'DELETE')).status === 401, 'anonymous cannot delete attachment');
  const removedUpload = await call(`/attachments/${multipartFile.id}`, sessions.admin, 'DELETE');
  check(removedUpload.status === 200 && removedUpload.body.cleanupPending === false, 'owner deletion confirms storage cleanup');
  await call(`/documents/${shared.id}`, sessions.admin, 'PUT', { content: 'updated portable body', expectedUpdatedAt: shared.updatedAt });
  for (const role of ['editor', 'viewer', null]) {
    check((await call(`/organizations/${orgs[0]}/export`, role ? sessions[role] : null)).status === (role ? 403 : 401), `${role || 'anonymous'} cannot export decrypted organization snapshot`);
  }
  await call(`/documents/${shared.id}`, sessions.admin, 'DELETE');
  const exported = await call(`/organizations/${orgs[0]}/export`, sessions.admin);
  check(exported.status === 200, 'admin scoped export');
  check(!!exported.body.documents[0].deletedAt, 'portable export retains Trash state');
  await call(`/documents/${shared.id}/restore`, sessions.admin, 'POST');
  check(exported.body.documents.length === 1 && exported.body.documents[0].id === shared.id, 'export excludes unassigned and other-org documents');
  check(!exported.body.relationships.some(r => r.targetId === outside.id), 'export excludes cross-boundary relationships');
  check(exported.body.documents[0].revisions.some(r => r.content === 'original'), 'export contains revision history');
  check(exported.body.documents[0].attachments[0].data === Buffer.from('portable file bytes').toString('base64'), 'export includes attachment bytes');
  const broken = await db.attachment.create({ data: { userId: users[0], documentId: shared.id, filename: 'missing.txt', mimeType: 'text/plain', size: 1, storageType: 'filesystem', filePath: '/missing-features-file' } });
  const incomplete = await call(`/organizations/${orgs[0]}/export`, sessions.admin);
  check(incomplete.status === 422 && incomplete.body.issues.some(i => i.includes(broken.id)), 'missing file produces explicit export error');
  check((await call(`/attachments/${broken.id}`, sessions.admin)).status === 404, 'missing attachment file returns controlled not-found response');
  await db.attachment.delete({ where: { id: broken.id } });
  const emptyFile = await db.attachment.create({ data: { userId: users[0], documentId: shared.id, filename: 'empty.txt', mimeType: 'text/plain', size: 0, storageType: 'base64', data: '' } });
  const emptyDownload = await fetch(`${base}/api/attachments/${emptyFile.id}`, { headers: { Cookie: sessions.admin } });
  check(emptyDownload.status === 200 && (await emptyDownload.arrayBuffer()).byteLength === 0, 'valid empty attachment downloads successfully');
  check(emptyDownload.headers.get('cache-control') === 'private, no-store' && emptyDownload.headers.get('x-content-type-options') === 'nosniff', 'attachment responses disable caching and content sniffing');
  check((await call(`/attachments/${emptyFile.id}`, sessions.viewer)).status === 404, 'legacy attachment stays private to uploader');
  check((await call(`/attachments/${emptyFile.id}`, null)).status === 401, 'anonymous attachment download blocked');
  await db.attachment.delete({ where: { id: emptyFile.id } });
  const saved = await db.password.findUnique({ where: { id: passwords[0] } });
  await db.password.update({ where: { id: passwords[0] }, data: { password: '00:00:00' } });
  check((await call(`/organizations/${orgs[0]}/export`, sessions.admin)).status === 422, 'undecryptable secret fails export');
  await db.password.update({ where: { id: passwords[0] }, data: { password: saved.password } });
  const mapping = new Map();
  for (const collection of ['organizations', 'folders', 'documents', 'passwords']) for (const record of exported.body[collection]) mapping.set(record.id, `${suffix}-copy-${mapping.size}`);
  for (const doc of exported.body.documents) for (const revision of doc.revisions) mapping.set(revision.id, `${suffix}-copy-${mapping.size}`);
  const cloned = JSON.parse(JSON.stringify(exported.body), (_key, value) => typeof value === 'string' ? (mapping.get(value) || value) : value);
  cloned.tags.push('__proto__', 'constructor');
  cloned.documents[0].tagNames = [...(cloned.documents[0].tagNames || []), '__proto__', 'constructor'];
  cloned.organizations.forEach(org => { org.name += '-roundtrip'; orgs.push(org.id); });
  cloned.documents.forEach(doc => docs.push(doc.id)); cloned.passwords.forEach(p => passwords.push(p.id));
  const malformedHistory = { ...cloned, documents: cloned.documents.map((doc, index) => index ? doc : { ...doc, revisions: [null] }) };
  for (const previewOnly of [true, false]) {
    const rejected = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: malformedHistory, preview: previewOnly });
    const report = previewOnly ? rejected.body.preview : rejected.body;
    check(rejected.status === 200 && (previewOnly ? report.valid === false : report.success === false) && report.errors.some(error => error.includes('revisions')), `malformed revision rejected before writes (preview=${previewOnly})`);
  }
  check(await db.document.count({ where: { id: cloned.documents[0].id } }) === 0, 'malformed nested history leaves no partially imported document');
  const preview = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: cloned, preview: true });
  check(preview.status === 200 && preview.body.preview.valid && preview.body.preview.counts.documents === cloned.documents.length, 'portable preview validates and counts source documents');
  check(await db.document.count({ where: { id: cloned.documents[0].id } }) === 0, 'portable preview does not create documents');
  for (const role of ['editor', 'viewer', null]) check((await call('/import', role ? sessions[role] : null, 'POST', { type: 'flexdocs-backup', data: cloned, preview: true })).status === (role ? 403 : 401), `${role || 'anonymous'} cannot preview administrator import`);
  const restored = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: cloned });
  check(restored.status === 200 && restored.body.success && restored.body.imported.revisions > 0, 'portable import restores revisions successfully');
  const importedTagDocument = await db.document.findUnique({ where: { id: cloned.documents[0].id }, include: { tags: true } });
  check(['__proto__', 'constructor'].every(name => importedTagDocument.tags.some(tag => tag.name === name)), 'portable import preserves prototype-like tag names');
  const restoredDoc = cloned.documents[0];
  check((await call(`/documents/${restoredDoc.id}`, sessions.admin)).status === 404, 'portable import does not reactivate trashed document');
  check((await call('/documents?trash=true', sessions.admin)).body.items.some(d => d.id === restoredDoc.id), 'imported trashed document is recoverable');
  check((await call(`/documents/${restoredDoc.id}/restore`, sessions.admin, 'POST')).status === 200, 'imported Trash can be restored');
  check((await call(`/documents/${restoredDoc.id}`, sessions.admin)).body.content === 'updated portable body', 'roundtrip preserves document body');
  const restoredFiles = await db.attachment.findMany({ where: { documentId: restoredDoc.id } });
  uploads.push(...restoredFiles.map(a => a.id));
  check(restoredFiles.length === 1 && restoredFiles[0].size === Buffer.byteLength('portable file bytes'), 'roundtrip restores attachment');
  check((await call(`/passwords/${cloned.passwords[0].id}/reveal`, sessions.admin)).body.password === 'synthetic-export-secret', 'roundtrip re-encrypts vault secret');
  const invalidImport = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: { schema: 'flexdocs-backup', version: 1 } });
  check(invalidImport.status === 200 && invalidImport.body.success === false, 'malformed backup is reported without server error');
  const cycleId = `${suffix}-cycle`;
  const cycleBundle = { ...cloned, folders: [{ id: cycleId, name: 'Invalid cycle', parentId: cycleId }], documents: [] };
  const cycleImport = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: cycleBundle });
  check(cycleImport.status === 200 && cycleImport.body.success === false && cycleImport.body.errors.some(error => error.includes('cycle')), 'cyclic folder import rejected during preflight');
  check(await db.folder.count({ where: { id: cycleId } }) === 0 && Object.keys(cycleImport.body.imported).length === 0, 'topology preflight failure writes no records');
  check((await call('/import', sessions.viewer, 'POST', { type: 'itglue', data: [{ name: 'blocked' }] })).status === 403, 'legacy import cannot bypass viewer role');
  check((await call('/import', sessions.editor, 'POST', { type: 'documents', format: 'json', data: [{ title: 'blocked' }], organizationId: orgs[1] })).status === 403, 'import cannot bypass organization scope');
  for (const role of ['editor', 'viewer', null]) check((await call('/rbac/invitations', role ? sessions[role] : null, 'POST', { email: `${suffix}@example.invalid`, role: 'viewer' })).status === (role ? 403 : 401), `${role || 'anonymous'} cannot invite users`);
  async function invite(email, role = 'viewer') {
    const result = await call('/rbac/invitations', sessions.admin, 'POST', { email, role, organizationId: orgs[0] });
    check(result.status === 201 && result.body.invitationUrl, 'create invitation with secure link');
    return { ...result.body, token: new URLSearchParams(new URL(result.body.invitationUrl).hash.slice(1)).get('token') };
  }
  const invitedEmail = `${suffix}-invited@example.invalid`;
  const invite1 = await invite(invitedEmail);
  check((await db.invitation.findUnique({ where: { id: invite1.id } })).token !== invite1.token, 'invitation bearer token stored hashed');
  check(!(await call('/rbac/invitations', sessions.admin)).body.some(i => 'token' in i), 'invitation listing does not return tokens');
  const invite2 = await invite(invitedEmail);
  check((await call('/invitations/accept', null, 'POST', { token: invite1.token, name: 'New user', password })).status === 410, 'resend invalidates previous link');
  const accept = await call('/invitations/accept', null, 'POST', { token: invite2.token, name: 'New user', password });
  check(accept.status === 200 && accept.cookie, 'new user accepts invitation and receives session');
  const newUser = await db.user.findUnique({ where: { email: invitedEmail } }); users.push(newUser.id);
  check(newUser.role === 'viewer' && Boolean(await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgs[0], userId: newUser.id } } })), 'invited role and organization applied');
  check((await call('/invitations/accept', null, 'POST', { token: invite2.token, name: 'Reuse', password })).status === 410, 'invitation cannot be reused');
  const expired = await invite(`${suffix}-expired@example.invalid`);
  await db.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
  check((await call('/invitations/accept', null, 'POST', { token: expired.token, name: 'Expired', password })).status === 410, 'expired invitation rejected');
  const revoked = await invite(`${suffix}-revoked@example.invalid`);
  await call(`/rbac/invitations?id=${revoked.id}`, sessions.admin, 'DELETE');
  check((await call('/invitations/accept', null, 'POST', { token: revoked.token, name: 'Revoked', password })).status === 410, 'revoked invitation rejected');
  const existing = await invite(`${suffix}-editor@example.invalid`, 'viewer');
  check((await call('/invitations/accept', null, 'POST', { token: existing.token })).status === 401, 'existing account requires signed-in identity');
  check((await call('/invitations/accept', sessions.viewer, 'POST', { token: existing.token })).status === 401, 'different signed-in account cannot claim invitation');
  check((await call('/invitations/accept', sessions.editor, 'POST', { token: existing.token })).status === 200, 'invited existing account can accept');
  check((await db.user.findUnique({ where: { id: users[1] } })).role === 'editor', 'existing account role is preserved');
  const racing = await invite(`${suffix}-racing@example.invalid`);
  const attempts = await Promise.all([1, 2].map(() => call('/invitations/accept', null, 'POST', { token: racing.token, name: 'Concurrent invite', password })));
  check(attempts.filter(r => r.status === 200).length === 1 && attempts.filter(r => r.status === 410).length === 1, 'concurrent invitation acceptance has exactly one winner');
  console.log(`${checks} feature workflow checks passed`);
} finally {
  users.push(...(await db.user.findMany({ where: { email: { startsWith: suffix } }, select: { id: true } })).map(u => u.id));
  for (const id of uploads) if (adminCookie) await call(`/attachments/${id}`, adminCookie, 'DELETE').catch(() => {});
  await db.invitation.deleteMany({ where: { email: { startsWith: suffix } } });
  await db.relationship.deleteMany({ where: { OR: [{ id: { in: relationships.filter(Boolean) } }, { sourceId: { in: docs } }, { targetId: { in: docs } }] } });
  await db.attachment.deleteMany({ where: { userId: { in: users } } });
  await db.document.updateMany({ where: { userId: { in: users } }, data: { publishedSnapshotId: null } });
  await db.documentPublication.deleteMany({ where: { publisherId: { in: users } } });
  await db.organizationDocumentationGrant.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.document.deleteMany({ where: { userId: { in: users } } });
  await db.password.deleteMany({ where: { userId: { in: users } } });
  await db.folder.deleteMany({ where: { userId: { in: users } } });
  await db.tag.deleteMany({ where: { userId: { in: users } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.apiKey.deleteMany({ where: { userId: { in: users } } });
  await db.activityLog.deleteMany({ where: { userId: { in: users } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.$disconnect();
}
