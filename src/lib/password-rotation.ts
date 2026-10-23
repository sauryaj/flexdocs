import { randomInt } from 'node:crypto';
import { Client } from 'ssh2';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

const DEFAULT_ROTATION_WINDOW_DAYS = 90;

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*_-+=';
export function generatePassword(length = 24): string {
  if (!Number.isInteger(length) || length < 4 || length > 1024) {
    throw new Error('Password length must be an integer between 4 and 1024');
  }
  const groups = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '!@#$%^&*_-+='];
  const characters = groups.map(group => group[randomInt(group.length)]);
  while (characters.length < length) characters.push(CHARS[randomInt(CHARS.length)]);
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join('');
}

/** Apply the new secret on a remote Linux host over SSH and report whether the change landed. */
export async function applyViaSsh(opts: {
  host: string;
  port: number;
  username: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const conn = new Client();
  await new Promise<void>((resolve, reject) => {
    conn
      .on('ready', () => resolve())
      .on('error', (err) => reject(err))
      .connect({
        host: opts.host,
        port: opts.port,
        username: opts.username,
        password: opts.currentPassword,
        readyTimeout: 10000,
      });
  });

  const exec = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream
          .on('close', (code: number) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${out}`))))
          .on('data', (d: Buffer) => (out += d.toString()))
          .stderr.on('data', (d: Buffer) => (out += d.toString()));
      });
    });

  try {
    await exec(`printf '%s:%s\n' '${opts.username.replace(/'/g, "'\\''")}' '${opts.newPassword.replace(/'/g, "'\\''")}' | chpasswd 2>/dev/null || (echo '${opts.newPassword.replace(/'/g, "'\\''")}' | passwd --stdin ${opts.username.replace(/'/g, "'\\''")}) 2>/dev/null`);
  } finally {
    conn.end();
  }
}

export interface RotateResult {
  ok: boolean;
  message: string;
}

/**
 * Rotate a single password. Generates a new secret, applies it remotely when an SSH target
 * is configured, then archives the previous value and recalculates expiry. On remote
 * failure the stored secret is left untouched.
 */
export async function rotatePassword(passwordId: string, actorId?: string): Promise<RotateResult> {
  const entry = await prisma.password.findUnique({ where: { id: passwordId } });
  if (!entry) return { ok: false, message: 'Password not found' };

  const current = (() => {
    try {
      return decrypt(entry.password);
    } catch {
      return '';
    }
  })();
  const next = generatePassword(24);

  if (entry.rotationEnabled && entry.rotationMethod === 'ssh') {
    if (!entry.rotationTarget || !entry.rotationUsername) {
      return { ok: false, message: 'Rotation enabled with SSH but no target host / username configured' };
    }
    try {
      await applyViaSsh({
        host: entry.rotationTarget,
        port: entry.rotationPort || 22,
        username: entry.rotationUsername,
        currentPassword: current,
        newPassword: next,
      });
    } catch (err: any) {
      const message = `SSH rotation failed on ${entry.rotationTarget}: ${err?.message || err}`;
      await createNotification({
        userId: entry.userId,
        type: 'system',
        title: 'Password rotation failed',
        message,
        severity: 'danger',
        link: `/dashboard/passwords/${entry.id}`,
      });
      void auditLog({ userId: actorId || entry.userId, action: 'password.rotate', resourceType: 'password', resourceId: entry.id, resourceName: entry.name, details: { ok: false, reason: String(err?.message || err) } });
      return { ok: false, message };
    }
  }

  const rotationDays = entry.rotationDays && entry.rotationDays > 0 ? entry.rotationDays : DEFAULT_ROTATION_WINDOW_DAYS;
  const wasHandled = entry.rotationEnabled ? entry.rotationMethod === 'manual' || entry.rotationMethod === 'ssh' : false;

  await prisma.$transaction([
    prisma.password.update({
      where: { id: entry.id },
      data: {
        password: encrypt(next),
        lastRotatedAt: new Date(),
        expiresAt: new Date(Date.now() + rotationDays * 86400000),
      },
    }),
    prisma.passwordHistory.create({
      data: {
        passwordId: entry.id,
        oldPassword: entry.password,
        newPassword: encrypt(next),
        userId: actorId || entry.userId,
        reason: wasHandled ? 'rotation' : 'manual',
      },
    }),
  ]);

  await createNotification({
    userId: entry.userId,
    type: 'system',
    title: 'Password rotated',
    message: `"${entry.name}" was rotated${entry.rotationTarget ? ` and applied on ${entry.rotationTarget}` : ' — update it in the target system manually'}.`,
    severity: 'success',
    link: `/dashboard/passwords/${entry.id}`,
  });
  void auditLog({ userId: actorId || entry.userId, action: 'password.rotate', resourceType: 'password', resourceId: entry.id, resourceName: entry.name, details: { ok: true, method: entry.rotationEnabled ? entry.rotationMethod : 'manual' } });

  return { ok: true, message: 'Rotated' };
}

/** Cron entry point: rotate every enabled password whose expiry has passed. */
export async function rotateOverduePasswords(): Promise<{ rotated: number; failed: number }> {
  const now = new Date();
  const overdue = await prisma.password.findMany({
    where: { rotationEnabled: true, expiresAt: { not: null, lte: now } },
  });

  let rotated = 0;
  let failed = 0;
  for (const p of overdue) {
    const r = await rotatePassword(p.id);
    if (r.ok) rotated++;
    else failed++;
  }
  if (overdue.length > 0 || rotated > 0) console.log(`[rotation] ${rotated} rotated, ${failed} failed`);
  return { rotated, failed };
}