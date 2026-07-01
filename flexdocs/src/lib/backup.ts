import { execSync } from 'child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import logger from '@/lib/logger';

const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);

export function createBackup(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `flexdocs-backup-${timestamp}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  mkdirSync(BACKUP_DIR, { recursive: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const url = new URL(dbUrl);
  const host = url.hostname;
  const port = url.port || '5432';
  const database = url.pathname.slice(1);
  const username = url.username;
  const password = url.password;

  const cmd = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -F p -f "${filepath}"`;

  logger.info('Starting database backup', { filename });
  execSync(cmd, { stdio: 'pipe' });
  logger.info('Backup completed', { filename, size: statSync(filepath).size });

  cleanupOldBackups();
  return filepath;
}

function cleanupOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith('flexdocs-backup-'));
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
      .filter(f => f.startsWith('flexdocs-backup-'))
      .map(name => {
        const stat = statSync(join(BACKUP_DIR, name));
        return { name, size: stat.size, created: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
  } catch {
    return [];
  }
}
