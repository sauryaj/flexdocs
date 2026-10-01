import { execFile } from 'child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync, renameSync, chmodSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import logger from '@/lib/logger';

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const configuredRetention = Number(process.env.BACKUP_RETENTION_DAYS || '30');
const BACKUP_RETENTION_DAYS = Number.isFinite(configuredRetention) && configuredRetention > 0 ? configuredRetention : 30;

let activeBackup: Promise<string> | undefined;

export function createBackup(): Promise<string> {
  if (activeBackup) return activeBackup;
  activeBackup = runBackup().finally(() => { activeBackup = undefined; });
  return activeBackup;
}

async function runBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `flexdocs-backup-${timestamp}-${randomUUID()}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  mkdirSync(BACKUP_DIR, { recursive: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const partialPath = `${filepath}.partial`;
  logger.info('Starting database backup', { filename });
  try {
    // pg_dump expands connection URLs only via --dbname; keep the password out of argv.
    const connection = new URL(dbUrl);
    for (const option of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size']) connection.searchParams.delete(option);
    const password = connection.searchParams.get('password') ?? decodeURIComponent(connection.password);
    connection.password = '';
    connection.searchParams.delete('password');
    writeFileSync(partialPath, '', { flag: 'wx', mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      execFile('pg_dump', ['--dbname', connection.toString(), '-F', 'p', '-f', partialPath], {
        env: { ...process.env, PGPASSWORD: password }, timeout: 30 * 60 * 1000,
      }, error => error ? reject(error) : resolve());
    });
    if (statSync(partialPath).size === 0) throw new Error('Database backup was empty');
    chmodSync(partialPath, 0o600);
    renameSync(partialPath, filepath);
  } catch {
    try { unlinkSync(partialPath); } catch { /* pg_dump may fail before creating a file. */ }
    throw new Error('Database backup failed; no completed backup was published');
  }
  logger.info('Backup completed', { filename, size: statSync(filepath).size });

  cleanupOldBackups();
  return filepath;
}

function cleanupOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR).filter(f => /^flexdocs-backup-[0-9a-fTZ.-]+\.sql$/.test(f));
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86400000;

    for (const file of files) {
      const stat = statSync(join(BACKUP_DIR, file));
      if (stat.mtimeMs < cutoff) {
        unlinkSync(join(BACKUP_DIR, file));
        logger.info('Deleted old backup', { file });
      }
    }
  } catch (err) {
    logger.error('Backup cleanup failed', { error: err });
  }
}

export function listBackups(): Array<{ name: string; size: number; created: string }> {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    return readdirSync(BACKUP_DIR)
      .filter(f => /^flexdocs-backup-[0-9a-fTZ.-]+\.sql$/.test(f))
      .map(name => {
        const stat = statSync(join(BACKUP_DIR, name));
        return { name, size: stat.size, created: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
  } catch {
    return [];
  }
}
