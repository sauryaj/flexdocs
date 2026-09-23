import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  await db.attachment.delete({ where: { id: broken.id } });
  const saved = await db.password.findUnique({ where: { id: passwords[0] } });
  await db.password.update({ where: { id: passwords[0] }, data: { password: '00:00:00' } });
  check((await call(`/organizations/${orgs[0]}/export`, sessions.admin)).status === 422, 'undecryptable secret fails export');
  await db.password.update({ where: { id: passwords[0] }, data: { password: saved.password } });
  const mapping = new Map();
  for (const collection of ['organizations', 'folders', 'documents', 'passwords']) for (const record of exported.body[collection]) mapping.set(record.id, `${suffix}-copy-${mapping.size}`);
  for (const doc of exported.body.documents) for (const revision of doc.revisions) mapping.set(revision.id, `${suffix}-copy-${mapping.size}`);
  const cloned = JSON.parse(JSON.stringify(exported.body), (_key, value) => typeof value === 'string' ? (mapping.get(value) || value) : value);
  cloned.organizations.forEach(org => { org.name += '-roundtrip'; orgs.push(org.id); });
  cloned.documents.forEach(doc => docs.push(doc.id)); cloned.passwords.forEach(p => passwords.push(p.id));
  const restored = await call('/import', sessions.admin, 'POST', { type: 'flexdocs-backup', data: cloned });
  check(restored.status === 200 && restored.body.success && restored.body.imported.revisions > 0, 'portable import restores revisions successfully');
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
  await db.document.deleteMany({ where: { userId: { in: users } } });
  await db.password.deleteMany({ where: { userId: { in: users } } });
  await db.folder.deleteMany({ where: { userId: { in: users } } });
  await db.tag.deleteMany({ where: { userId: { in: users } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.activityLog.deleteMany({ where: { userId: { in: users } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.$disconnect();
}
