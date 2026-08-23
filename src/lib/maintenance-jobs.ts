import { prisma } from './prisma';
import logger from './logger';
import { createNotification } from './notifications';
import { sendPasswordRotationReminder } from './email';
import { checkAllDomains } from './domain-monitor';

const ROTATION_DAYS = 90;
const STALE_DAYS = 30;
const VERY_STALE_DAYS = 90;
const DEDUPE_WINDOW_DAYS = 7;

export interface MaintenanceSummary {
  domainAlerts: number;
  sslAlerts: number;
  rotationReminders: number;
  stalenessDigests: number;
}

async function wasNotifiedRecently(userId: string, title: string, link: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86400000);
  const existing = await prisma.notification.findFirst({
    where: { userId, title, link, createdAt: { gte: since } },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Domains: WHOIS refresh + expiry alerts (notifications + emails)
 * are handled inside checkAllDomains/domain-monitor.
 */
async function runDomainExpirySweep(): Promise<number> {
  const results = await checkAllDomains();
  return results.filter((r) => r.expiryAlert).length;
}

/**
 * SSL certificates expiring within 30 days -> in-app notification + dedupe.
 */
async function runSslCertSweep(): Promise<number> {
  const horizon = new Date(Date.now() + 30 * 86400000);
  const certs = await prisma.sslCertificate.findMany({
    where: { validTo: { lte: horizon, gte: new Date(0) } },
    include: { user: { select: { id: true, email: true } } },
  });

  let alerted = 0;
  for (const cert of certs) {
    if (!cert.validTo) continue;
    const days = Math.ceil((cert.validTo.getTime() - Date.now()) / 86400000);
    if (days < 0 || days > 30) continue;

    const title = `SSL certificate expiring`;
    const link = '/dashboard/ssl';
    if (await wasNotifiedRecently(cert.userId, title, `${link}?host=${encodeURIComponent(cert.hostname)}`)) {
      continue;
    }

    await createNotification({
      userId: cert.userId,
      type: 'cert_expiring',
      title,
      message: `${cert.hostname} certificate expires in ${days} day${days === 1 ? '' : 's'} (${cert.validTo.toISOString().slice(0, 10)}).`,
      severity: days <= 7 ? 'danger' : 'warning',
      link,
    });
    alerted++;
  }
  return alerted;
}

/**
 * Passwords untouched for 90+ days -> rotation reminder email + notification.
 */
async function runRotationReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - ROTATION_DAYS * 86400000);
  const passwords = await prisma.password.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      userId: true,
      user: { select: { email: true } },
    },
    take: 500,
  });

  let sent = 0;
  for (const p of passwords) {
    const title = 'Password rotation reminder';
    const link = `/dashboard/passwords/${p.id}`;
    if (await wasNotifiedRecently(p.userId, title, link)) continue;

    const ageDays = Math.floor((Date.now() - p.updatedAt.getTime()) / 86400000);
    await createNotification({
      userId: p.userId,
      type: 'system',
      title,
      message: `${p.name} hasn't been updated in ${ageDays} days. Consider rotating it.`,
      severity: 'info',
      link,
    });

    if (p.user.email) {
      await sendPasswordRotationReminder(p.user.email, p.name, p.updatedAt.toISOString().slice(0, 10));
    }
    sent++;
  }
  return sent;
}

/**
 * Config inventory going stale: one digest per user whose Servers
 * haven't been updated in 30+ days.
 */
async function runStalenessDigest(): Promise<number> {
  const cutoff30 = new Date(Date.now() - STALE_DAYS * 86400000);
  const cutoff90 = new Date(Date.now() - VERY_STALE_DAYS * 86400000);

  const users = await prisma.user.findMany({ select: { id: true } });

  let digests = 0;
  for (const u of users) {
    const [stale30, veryStale] = await Promise.all([
      prisma.server.count({ where: { userId: u.id, updatedAt: { lt: cutoff30 } } }),
      prisma.server.count({ where: { userId: u.id, updatedAt: { lt: cutoff90 } } }),
    ]);
    if (stale30 === 0) continue;

    const title = 'Configuration data going stale';
    const link = '/dashboard/configurations';
    if (await wasNotifiedRecently(u.id, title, link)) continue;

    await createNotification({
      userId: u.id,
      type: 'system',
      title,
      message:
        `${stale30} configuration${stale30 === 1 ? '' : 's'} not updated in ${STALE_DAYS}+ days` +
        (veryStale > 0 ? ` (${veryStale} older than ${VERY_STALE_DAYS} days)` : '') +
        '. Run discovery or update records to keep docs trustworthy.',
      severity: veryStale > 0 ? 'warning' : 'info',
      link,
    });
    digests++;
  }
  return digests;
}

export async function runDailyMaintenance(): Promise<MaintenanceSummary> {
  logger.info('Daily maintenance starting');
  const summary: MaintenanceSummary = {
    domainAlerts: 0,
    sslAlerts: 0,
    rotationReminders: 0,
    stalenessDigests: 0,
  };

  const jobs: [string, () => Promise<number>, keyof MaintenanceSummary][] = [
    ['domain expiry sweep', runDomainExpirySweep, 'domainAlerts'],
    ['ssl cert sweep', runSslCertSweep, 'sslAlerts'],
    ['rotation reminders', runRotationReminders, 'rotationReminders'],
    ['staleness digest', runStalenessDigest, 'stalenessDigests'],
  ];

  for (const [name, job, key] of jobs) {
    try {
      summary[key] = await job();
    } catch (err) {
      logger.error(`Maintenance job failed: ${name}`, { err });
    }
  }

  logger.info('Daily maintenance complete', { ...summary });
  return summary;
}
