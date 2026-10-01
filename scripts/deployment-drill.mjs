import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(join(tmpdir(), 'flexdocs-deployment-'));
const project = `flexdocs-deployment-${randomBytes(6).toString('hex')}`;
const baseline = process.env.DEPLOYMENT_BASE_REF || '92cd7fdffe7243ee9d4c87b3abc28fb1ee2861e7';
const password = randomBytes(24).toString('hex');
const newPassword = randomBytes(24).toString('hex');
const key = randomBytes(32).toString('hex');
const previous = join(directory, 'previous');
const installation = join(directory, 'installation');
const started = Date.now();
mkdirSync(previous);
mkdirSync(join(installation, 'scripts'), { recursive: true });
const environment = { ...process.env, COMPOSE_PROJECT_NAME: project, COMPOSE_FILE: join(installation, 'compose.json'),
  DB_PASSWORD: password, BOOTSTRAP_ADMIN_PASSWORD: password, ENCRYPTION_KEY: key, NEXTAUTH_SECRET: password,
  NEXTAUTH_URL: 'http://localhost:3000', PORT: '0', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  AI_API_KEY: '', AI_BASE_URL: '', MAINTENANCE_ON_BOOT: 'false' };
const capture = (command, args, options = {}) => execFileSync(command, args, {
  cwd: installation, env: environment, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const compose = (...args) => capture('bash', ['scripts/compose.sh', ...args]);
async function runScript(name, label) {
  console.log(label);
  const log = join(directory, `${name}-${Date.now()}.log`);
  const descriptor = openSync(log, 'w', 0o600);
  try {
    await new Promise((done, reject) => {
      const child = spawn('bash', [`scripts/${name}.sh`], { cwd: installation, env: environment, stdio: ['ignore', descriptor, descriptor] });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? done() : reject(new Error(`${label} failed (${code}); log: ${log}`)));
    });
  } finally { closeSync(descriptor); }
}
let base;
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, expected, `${method} ${path}`);
  return response;
}
async function login(secret = password) {
  const response = await request('/login', 'POST', { email: 'admin@flexdocs.local', password: secret });
  cookie = response.headers.get('set-cookie').split(';')[0];
}
function appUrl() {
  const binding = compose('port', 'app', '3000').trim().split('\n')[0];
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  base = `http://${binding}`;
}
let config;
function useSource(context, bootstrap = password) {
  for (const service of ['app', 'init']) {
    config.services[service].build.context = context;
    config.services[service].image = `${project}-${service}:drill`;
  }
  config.services.init.environment.BOOTSTRAP_ADMIN_PASSWORD = bootstrap;
  writeFileSync(environment.COMPOSE_FILE, JSON.stringify(config), { mode: 0o600 });
}
let configured = false;
let success = false;
try {
  const archive = capture('git', ['archive', '--format=tar', baseline], { cwd: root, encoding: null });
  capture('tar', ['-xf', '-', '-C', previous], { input: archive });
  for (const script of ['compose', 'setup', 'update', 'database-backup', 'wait-for-health']) {
    copyFileSync(join(root, 'scripts', `${script}.sh`), join(installation, 'scripts', `${script}.sh`));
  }
  writeFileSync(join(installation, '.env'), `PORT=0\nNEXTAUTH_URL=http://localhost:3000\n`, { mode: 0o600 });
  const configurationEnvironment = { ...environment, COMPOSE_FILE: join(root, 'docker-compose.yml') };
  config = JSON.parse(capture('bash', ['scripts/compose.sh', 'config', '--format', 'json'], { cwd: root, env: configurationEnvironment }));
  config.name = project;
  config.services.db.ports = [];
  config.services.redis.ports = [];
  config.services.app.ports = [{ target: 3000, published: '0', host_ip: '127.0.0.1', protocol: 'tcp' }];
  for (const [name, volume] of Object.entries(config.volumes)) volume.name = `${project}_${name}`;
  for (const [name, network] of Object.entries(config.networks || {})) network.name = `${project}_${name}`;
  useSource(previous);
  configured = true;
  console.log(`Isolated deployment project: ${project}; baseline: ${baseline}`);
  await runScript('setup', 'Install baseline into empty disposable volumes');
  appUrl();
  await login();
  const doc = await (await request('/documents', 'POST', { title: 'Upgrade fixture', content: 'Before upgrade', tags: ['upgrade'], visibility: 'private' }, 201)).json();
  await request(`/documents/${doc.id}`, 'PUT', { content: 'Preserve current content', expectedUpdatedAt: doc.updatedAt });
  const bytes = Buffer.from('Exact upgrade attachment bytes\n');
  const attachment = await (await request('/attachments', 'POST', { documentId: doc.id, filename: 'upgrade.txt', mimeType: 'text/plain', data: bytes.toString('base64') }, 201)).json();
  const secret = await (await request('/passwords', 'POST', { name: 'Upgrade vault fixture', password: 'synthetic-upgrade-secret', username: 'test' }, 201)).json();
  const trashed = await (await request('/documents', 'POST', { title: 'Keep in Trash', content: 'Trashed content' }, 201)).json();
  await request(`/documents/${trashed.id}`, 'DELETE');
  const envBefore = readFileSync(join(installation, '.env'), 'utf8');
  useSource(root, newPassword);
  await runScript('update', 'Upgrade populated installation to the current source');
  appUrl();
  cookie = '';
  await login();
  const current = await (await request(`/documents/${doc.id}`)).json();
  assert.equal(current.content, 'Preserve current content');
  assert.equal(current.visibility, 'private');
  assert.ok(current.tags.some(tag => tag.name === 'upgrade'));
  const revisions = await (await request(`/documents/${doc.id}/revisions`)).json();
  assert.ok(revisions.some(revision => revision.content === 'Before upgrade'));
  assert.deepEqual(Buffer.from(await (await request(`/attachments/${attachment.id}`)).arrayBuffer()), bytes);
  assert.equal((await (await request(`/passwords/${secret.id}/reveal`)).json()).password, 'synthetic-upgrade-secret');
  assert.ok((await (await request('/documents?trash=true')).json()).items.some(item => item.id === trashed.id));
  await request(`/documents/${trashed.id}`, 'GET', undefined, 404);
  cookie = '';
  await request('/login', 'POST', { email: 'admin@flexdocs.local', password: newPassword }, 401);
  await request(`/documents/${doc.id}`, 'GET', undefined, 401);
  assert.equal(readFileSync(join(installation, '.env'), 'utf8'), envBefore);
  const backups = readdirSync(join(installation, 'backups')).filter(name => name.endsWith('.sql'));
  assert.equal(backups.length, 1);
  assert.ok(readFileSync(join(installation, 'backups', backups[0]), 'utf8').includes('Preserve current content'));
  console.log('PASS upgrade preserves content, tags, privacy, history, attachment bytes, vault decryption, Trash, credentials, configuration, and a pre-upgrade SQL backup');
  compose('down', '--volumes', '--remove-orphans');
  useSource(root);
  await runScript('setup', 'Install current source into new empty disposable volumes');
  appUrl();
  cookie = '';
  await login();
  await request(`/documents/${doc.id}`, 'GET', undefined, 404);
  await request('/health');
  console.log(`PASS fresh current installation; total drill duration ${Math.round((Date.now() - started) / 1000)} seconds`);
  success = true;
} finally {
  if (configured) {
    try { compose('down', '--volumes', '--rmi', 'local', '--remove-orphans'); }
    catch { console.error(`Cleanup failed for disposable project ${project}; configuration retained at ${installation}`); success = false; process.exitCode = 1; }
    for (const service of ['app', 'init']) {
      try { capture('docker', ['image', 'rm', `${project}-${service}:drill`]); } catch { /* Already removed or still referenced; never force-remove. */ }
    }
  }
  if (success) rmSync(directory, { recursive: true, force: true });
  else console.error(`Drill diagnostics retained at ${directory}`);
}
