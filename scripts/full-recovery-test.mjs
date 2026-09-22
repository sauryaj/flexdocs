import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const prefix = `flexdocs-recovery-${randomBytes(6).toString('hex')}`;
const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
const containers = [];
let networkCreated = false;
const password = randomBytes(24).toString('hex');
const key = randomBytes(32).toString('hex');
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] });
const run = (suffix, args) => {
  const name = `${prefix}-${suffix}`;
  docker(['run', '-d', '--name', name, '--network', prefix, ...args]);
  containers.push(name);
  return name;
};
async function ready(check, description) {
  for (let i = 0; i < 60; i++) {
    try { check(); return; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  throw new Error(`Timed out: ${description}`);
}
const inApp = (name, source) => docker(['exec', '-i', name, 'node', '--input-type=module'], source);
const dbUrl = name => `postgresql://flexdocs:${password}@${name}:5432/flexdocs`;
const appEnv = database => ['-e', `DATABASE_URL=${dbUrl(database)}`, '-e', `ENCRYPTION_KEY=${key}`, '-e', `NEXTAUTH_SECRET=${password}`, '-e', 'NEXTAUTH_URL=http://localhost:3000', '-e', `REDIS_URL=redis://${prefix}-redis:6379`];
const common = `
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
let cookie = '';
async function request(path, method = 'GET', body, status = 200) {
  const response = await fetch('http://localhost:3000/api' + path, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  assert.equal(response.status, status, method + ' ' + path);
  return response;
}
const login = await request('/login', 'POST', { email: 'admin@flexdocs.local', password: ${JSON.stringify(password)} });
cookie = login.headers.get('set-cookie').split(';')[0];
`;
try {
  console.log(`Disposable recovery resources: ${prefix}`);
  docker(['image', 'inspect', process.env.RECOVERY_APP_IMAGE || 'flexdocs-app:latest']);
  docker(['image', 'inspect', process.env.RECOVERY_INIT_IMAGE || 'flexdocs-init:latest']);
  docker(['network', 'create', '--internal', prefix]); networkCreated = true;
  const databaseArgs = ['-e', 'POSTGRES_USER=flexdocs', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=flexdocs', 'postgres:16-alpine'];
  const sourceDb = run('source-db', databaseArgs);
  const targetDb = run('target-db', databaseArgs);
  run('redis', ['redis:7-alpine']);
  for (const database of [sourceDb, targetDb]) await ready(() => docker(['exec', database, 'pg_isready', '-U', 'flexdocs']), database);
  console.log('Seeding an isolated source installation');
  const init = run('init', [...appEnv(sourceDb), '-e', `BOOTSTRAP_ADMIN_PASSWORD=${password}`, process.env.RECOVERY_INIT_IMAGE || 'flexdocs-init:latest']);
  if (docker(['wait', init]).trim() !== '0') throw new Error('Initialization failed: ' + docker(['logs', init]));
  docker(['exec', '-i', sourceDb, 'psql', '-U', 'flexdocs', '-d', 'flexdocs', '-v', 'ON_ERROR_STOP=1'], `INSERT INTO "User" (id, email, name, password, role, "updatedAt") SELECT 'recovery-viewer', 'viewer@recovery.local', 'Recovery viewer', password, 'viewer', now() FROM "User" WHERE email = 'admin@flexdocs.local';`);
  const source = run('source-app', [...appEnv(sourceDb), process.env.RECOVERY_APP_IMAGE || 'flexdocs-app:latest']);
  const waitApp = app => ready(() => inApp(app, "const r=await fetch('http://localhost:3000/api/health');if(!r.ok)process.exit(1)"), app);
  await waitApp(source);
  const fixture = JSON.parse(inApp(source, common + `
const doc = await (await request('/documents', 'POST', { title: 'Recovery fixture', content: 'Original recovery body' }, 201)).json();
await request('/documents/' + doc.id, 'PUT', { content: 'Recovered current body', expectedUpdatedAt: doc.updatedAt });
const bytes = Buffer.from('Synthetic recovery attachment\\n', 'utf8');
const attachment = await (await request('/attachments', 'POST', { documentId: doc.id, filename: 'recovery.txt', mimeType: 'text/plain', data: bytes.toString('base64') }, 201)).json();
const secret = await (await request('/passwords', 'POST', { name: 'Synthetic recovery secret', username: 'test', password: 'synthetic-recovery-secret-only' }, 201)).json();
const backup = await (await request('/backups', 'POST')).json();
const dump = await request('/backups/' + backup.filename + '/download');
writeFileSync('/tmp/recovery.sql', Buffer.from(await dump.arrayBuffer()), { mode: 0o600 });
console.log(JSON.stringify({ document: doc.id, attachment: attachment.id, secret: secret.id }));
`));
  docker(['stop', source]);
  docker(['cp', `${source}:/tmp/recovery.sql`, join(directory, 'recovery.sql')]);
  docker(['cp', `${source}:/app/uploads`, join(directory, 'uploads')]);
  docker(['exec', '-i', targetDb, 'psql', '-U', 'flexdocs', '-d', 'flexdocs', '-v', 'ON_ERROR_STOP=1', '--single-transaction'], readFileSync(join(directory, 'recovery.sql')));
  const target = run('target-app', [...appEnv(targetDb), process.env.RECOVERY_APP_IMAGE || 'flexdocs-app:latest']);
  docker(['cp', `${join(directory, 'uploads')}/.`, `${target}:/app/uploads`]);
  docker(['exec', '-u', '0', target, 'chown', '-R', '1001:1001', '/app/uploads']);
  await waitApp(target);
  console.log(inApp(target, common + `
const fixture = ${JSON.stringify(fixture)};
const doc = await (await request('/documents/' + fixture.document)).json();
assert.equal(doc.content, 'Recovered current body');
const revisions = await (await request('/documents/' + fixture.document + '/revisions')).json();
assert.ok(revisions.some(r => r.content === 'Original recovery body'));
const file = await request('/attachments/' + fixture.attachment);
assert.equal(await file.text(), 'Synthetic recovery attachment\\n');
const revealed = await (await request('/passwords/' + fixture.secret + '/reveal')).json();
assert.equal(revealed.password, 'synthetic-recovery-secret-only');
cookie = '';
await request('/backups', 'GET', undefined, 401);
await request('/documents/' + fixture.document, 'GET', undefined, 401);
const viewerLogin = await request('/login', 'POST', { email: 'viewer@recovery.local', password: ${JSON.stringify(password)} });
cookie = viewerLogin.headers.get('set-cookie').split(';')[0];
await request('/backups', 'GET', undefined, 403);
await request('/documents/' + fixture.document, 'PUT', { content: 'blocked' }, 403);
await request('/documents/' + fixture.document + '/revisions', 'POST', {}, 403);
console.log('PASS restored document, revision history, exact attachment bytes, vault decryption, readiness, and anonymous/viewer access boundaries');
`));
} finally {
  for (const name of containers.reverse()) {
    try { docker(['stop', name]); docker(['rm', '-v', name]); } catch { console.error(`Cleanup required for disposable container: ${name}`); }
  }
  if (networkCreated) try { docker(['network', 'rm', prefix]); } catch { console.error(`Cleanup required for disposable network: ${prefix}`); }
  rmSync(directory, { recursive: true, force: true });
}
