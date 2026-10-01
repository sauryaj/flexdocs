import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function checkHealth(options: { failures?: number; binding?: string; legacy?: boolean; make?: boolean; missing?: boolean; status?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'flexdocs-health-'));
  directories.push(directory);
  writeFileSync(join(directory, 'docker'), `#!/bin/bash
if [[ "$*" == "compose version" ]]; then exit ${options.legacy ? 1 : 0}; fi
if [[ "$*" == "compose port app 3000" ]]; then
  ${options.missing ? 'exit 1' : 'printf "%s\\n" "$MOCK_BINDING"'}
  exit 0
fi
exit 1
`, { mode: 0o755 });
  writeFileSync(join(directory, 'docker-compose'), '#!/bin/bash\nprintf "%s\\n" "$MOCK_BINDING"\n', { mode: 0o755 });
  writeFileSync(join(directory, 'curl'), `#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_LOG"
count=0
if [[ -f "$MOCK_COUNT" ]]; then read -r count < "$MOCK_COUNT"; fi
count=$((count+1))
printf '%s\\n' "$count" > "$MOCK_COUNT"
if ((count <= MOCK_FAILURES)); then exit 22; fi
printf '%s' "$MOCK_STATUS"
`, { mode: 0o755 });
  const result = spawnSync(options.make ? 'make' : 'bash', options.make ? ['health'] : ['scripts/wait-for-health.sh'], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, HEALTH_ATTEMPTS: '2', HEALTH_INTERVAL_SECONDS: '0',
      MOCK_BINDING: options.binding || '0.0.0.0:8080', MOCK_FAILURES: String(options.failures || 0),
      MOCK_STATUS: String(options.status || 200),
      MOCK_LOG: join(directory, 'requests'), MOCK_COUNT: join(directory, 'count') },
  });
  let requests = '';
  try { requests = readFileSync(join(directory, 'requests'), 'utf8'); } catch { /* No request when there is no published port. */ }
  return { ...result, requests };
}

it('uses the actual published port instead of the default or shell PORT', () => {
  const result = checkHealth();
  expect(result.status).toBe(0);
  expect(result.requests).toContain('http://127.0.0.1:8080/api/health');
  expect(result.requests).toContain('--max-time 5');
});

it('waits through transient unavailability', () => {
  const result = checkHealth({ failures: 1 });
  expect(result.status).toBe(0);
  expect(result.requests.trim().split('\n')).toHaveLength(2);
});

it('fails after exhausted readiness attempts', () => {
  const result = checkHealth({ failures: 3 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('did not become ready');
  expect(result.stdout).not.toContain('App is ready');
});

it('propagates failure through make health', () => {
  expect(checkHealth({ make: true, failures: 3 }).status).not.toBe(0);
});

it.each([302, 503])('rejects HTTP %s rather than reporting readiness', status => {
  expect(checkHealth({ status }).status).toBe(1);
});

it('fails when the app has no published port', () => {
  const result = checkHealth({ missing: true });
  expect(result.status).toBe(1);
  expect(result.requests).toBe('');
});

it('supports legacy Compose installations', () => {
  expect(checkHealth({ legacy: true }).status).toBe(0);
});

it('uses IPv6 loopback for an IPv6 wildcard binding', () => {
  expect(checkHealth({ binding: '[::]:8080' }).requests).toContain('http://[::1]:8080/api/health');
});
