import { afterEach, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runWorkflow(options: { failure?: string; setup?: boolean; legacy?: boolean; makeTarget?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'flexdocs-deploy-'));
  directories.push(directory);
  mkdirSync(join(directory, 'scripts'));
  mkdirSync(join(directory, 'bin'));
  for (const name of ['compose.sh', 'setup.sh', 'update.sh', 'database-backup.sh', 'wait-for-health.sh']) {
    copyFileSync(join(process.cwd(), 'scripts', name), join(directory, 'scripts', name));
  }
  copyFileSync(join(process.cwd(), 'Makefile'), join(directory, 'Makefile'));
  writeFileSync(join(directory, '.env'), 'PORT=8181\n');
  const fakeDocker = `#!/bin/bash
if [[ "$*" == "compose version" ]]; then exit ${options.legacy ? 1 : 0}; fi
if [[ "$1" == compose ]]; then shift; fi
if [[ "$1" == info ]]; then exit 0; fi
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [[ "$*" == "$MOCK_FAILURE" ]]; then exit 1; fi
case "$*" in
  'exec -T db pg_dump -U flexdocs flexdocs') printf 'synthetic database dump' ;;
  'port app 3000') printf '0.0.0.0:8181\\n' ;;
esac
`;
  for (const name of ['docker', 'docker-compose']) writeFileSync(join(directory, 'bin', name), fakeDocker, { mode: 0o755 });
  writeFileSync(join(directory, 'bin', 'curl'), `#!/bin/bash
printf 'readiness\\n' >> "$MOCK_LOG"
if [[ "$MOCK_FAILURE" == readiness ]]; then exit 7; fi
printf 200
`, { mode: 0o755 });
  const result = spawnSync(options.makeTarget ? 'make' : 'bash', options.makeTarget ? [options.makeTarget] : [`scripts/${options.setup ? 'setup' : 'update'}.sh`], {
    cwd: directory, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, CONFIRM_DELETE_DATA: '', PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
      MOCK_LOG: join(directory, 'calls'), MOCK_FAILURE: options.failure || '', HEALTH_ATTEMPTS: '1', HEALTH_INTERVAL_SECONDS: '0' },
  });
  let calls: string[] = [];
  try { calls = readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n'); } catch { /* A guarded command should not reach Docker. */ }
  let backups: string[] = [];
  try { backups = readdirSync(join(directory, 'backups')); } catch { /* Preflight failure does not create backups. */ }
  return { ...result, calls, backups, environment: readFileSync(join(directory, '.env'), 'utf8') };
}

const upgradeSteps = ['config --quiet', 'exec -T db pg_dump -U flexdocs flexdocs', 'build init app', 'run --rm init', 'up -d redis', 'up -d --no-deps app', 'port app 3000', 'readiness'];

it('upgrades only after backup and freshly built migrations succeed', () => {
  const result = runWorkflow();
  expect(result.status).toBe(0);
  expect(result.calls).toEqual(upgradeSteps);
  expect(result.backups).toHaveLength(1);
  expect(result.backups[0]).toMatch(/\.sql$/);
  expect(result.environment).toBe('PORT=8181\n');
});

it.each(upgradeSteps.slice(0, 6))('stops an upgrade when %s fails', failure => {
  const result = runWorkflow({ failure });
  expect(result.status).not.toBe(0);
  expect(result.calls).toEqual(upgradeSteps.slice(0, upgradeSteps.indexOf(failure) + 1));
  expect(result.stderr).toContain('Update stopped during');
  expect(result.stdout).not.toContain('Update completed successfully');
  expect(result.backups.some(name => name.endsWith('.partial'))).toBe(false);
});

it('fails the upgrade when readiness fails', () => {
  const result = runWorkflow({ failure: 'readiness' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('readiness verification');
  expect(result.stdout).not.toContain('Update completed successfully');
});

it('runs setup migrations from the newly built initializer and preserves existing configuration', () => {
  const result = runWorkflow({ setup: true });
  expect(result.status).toBe(0);
  expect(result.calls).toEqual(['config --quiet', 'build init app', 'up -d db redis', 'run --rm init', 'up -d --no-deps app', 'port app 3000', 'readiness']);
  expect(result.environment).toBe('PORT=8181\n');
  expect(result.stdout).toContain('8181');
});

it('stops setup before app startup when migrations fail', () => {
  const result = runWorkflow({ setup: true, failure: 'run --rm init' });
  expect(result.status).not.toBe(0);
  expect(result.calls).not.toContain('up -d --no-deps app');
});

it('uses the same upgrade flow on legacy Compose', () => {
  const result = runWorkflow({ legacy: true });
  expect(result.status).toBe(0);
  expect(result.calls).toEqual(upgradeSteps);
});

it.each(['clean', 'reset'])('guards destructive make %s before reaching Docker', makeTarget => {
  const result = runWorkflow({ makeTarget });
  expect(result.status).not.toBe(0);
  expect(result.calls).toEqual([]);
  expect(result.stdout).toContain('CONFIRM_DELETE_DATA=yes');
});

it('routes make rebuild through the backup and migration workflow', () => {
  const result = runWorkflow({ makeTarget: 'rebuild' });
  expect(result.status).toBe(0);
  expect(result.calls).toEqual(upgradeSteps);
});
