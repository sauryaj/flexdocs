import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';

const TIMEOUT_MS = 10000;
const DOWNTIME_ALERT_AFTER = 2; // consecutive failures before alerting
const LOG_RETENTION = 7 * 86400000;

export async function checkWebsite(id: string): Promise<{ ok: boolean; statusCode: number | null; latencyMs: number }> {
  const site = await prisma.website.findUnique({ where: { id } });
  if (!site) return { ok: false, statusCode: null, latencyMs: 0 };

  const started = Date.now();
  let ok = false;
  let statusCode: number | null = null;
  try {
    const res = await fetch(site.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'FlexDocs-Uptime/1.0' },
    });
    statusCode = res.status;
    ok = res.status >= 200 && res.status < 400;
  } catch {
    ok = false;
  }
  const latencyMs = Date.now() - started;

  const wasDown = site.status === 'down';
  const failCount = ok ? 0 : site.failCount + 1;
  const status = ok ? 'up' : failCount >= DOWNTIME_ALERT_AFTER ? 'down' : site.status === 'down' ? 'down' : 'unknown';

  await prisma.website.update({
    where: { id },
    data: { status, lastCheckedAt: new Date(), lastStatusCode: statusCode, lastLatencyMs: latencyMs, failCount },
  });

  // Alert on transition to down (deduped by failCount gate)
  if (!ok && !wasDown && failCount >= DOWNTIME_ALERT_AFTER) {
    await createNotification({
      userId: site.userId,
      type: 'system',
      title: `Website down: ${site.name}`,
      message: `${site.url} failed ${failCount} consecutive checks${statusCode ? ` (HTTP ${statusCode})` : ''}.`,
      link: '/dashboard/websites',
    }).catch(() => {});
  }

  // Rolling 24h uptime sample (kept light: one row per check, pruned daily by caller)
  await prisma.websiteCheckLog.create({
    data: { websiteId: id, ok, statusCode, latencyMs },
  }).catch(() => {});

  return { ok, statusCode, latencyMs };
}

export async function checkAllWebsites(): Promise<{ checked: number; down: number }> {
  const sites = await prisma.website.findMany({ select: { id: true } });
  let down = 0;
  for (const s of sites) {
    const r = await checkWebsite(s.id);
    if (!r.ok) down += 1;
  }
  await prisma.websiteCheckLog.deleteMany({
    where: { checkedAt: { lt: new Date(Date.now() - LOG_RETENTION) } },
  });
  return { checked: sites.length, down };
}

export async function uptimePercent(websiteId: string): Promise<number | null> {
  const logs = await prisma.websiteCheckLog.findMany({
    where: { websiteId },
    select: { ok: true },
    orderBy: { checkedAt: 'desc' },
    take: 200,
  });
  if (logs.length === 0) return null;
  return Math.round((logs.filter((l) => l.ok).length / logs.length) * 1000) / 10;
}
