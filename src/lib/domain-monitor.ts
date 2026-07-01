import { prisma } from '@/lib/prisma';
import { fetchWhoisData, fetchDnsRecords } from '@/lib/whois-dns';
import { sendDomainExpiryAlert } from '@/lib/email';
import { triggerWebhooks } from '@/lib/webhooks';
import logger from '@/lib/logger';

export interface MonitoringResult {
  domainId: string;
  domain: string;
  whoisUpdated: boolean;
  dnsUpdated: boolean;
  expiryAlert: boolean;
  error?: string;
}

export async function checkDomain(domainId: string): Promise<MonitoringResult> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return { domainId, domain: 'unknown', whoisUpdated: false, dnsUpdated: false, expiryAlert: false, error: 'Not found' };

  const result: MonitoringResult = {
    domainId,
    domain: domain.name,
    whoisUpdated: false,
    dnsUpdated: false,
    expiryAlert: false,
  };

  try {
    const whoisData = await fetchWhoisData(domain.name);
    if (whoisData.expiryDate) {
      await prisma.domain.update({
        where: { id: domainId },
        data: {
          expiresAt: new Date(whoisData.expiryDate),
          registrar: whoisData.registrar || domain.registrar,
          whoisCreated: whoisData.creationDate || domain.whoisCreated,
          whoisCountry: whoisData.registrantCountry || domain.whoisCountry,
          whoisState: whoisData.registrantState || domain.whoisState,
          privacyProtection: whoisData.privacyProtection ?? domain.privacyProtection,
          lastWhoisCheck: new Date(),
        },
      });

      await prisma.domainRevision.create({
        data: {
          domainId,
          data: JSON.stringify(whoisData),
          source: 'whois',
          message: 'Automated WHOIS check',
          userId: domain.userId,
        },
      });
      result.whoisUpdated = true;

      // Check expiry alert (30 days)
      const daysUntilExpiry = Math.ceil(
        (new Date(whoisData.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        result.expiryAlert = true;
        try {
          await sendDomainExpiryAlert(domain.userId, domain.name, daysUntilExpiry);
        } catch (err) {
          logger.warn('Failed to send expiry alert', { domainId, error: String(err) });
        }

        try {
          await triggerWebhooks(
            domain.userId,
            'domain.expiry_warning',
            'domain',
            domainId,
            { domain: domain.name, daysUntilExpiry }
          );
        } catch {
          // webhook failure shouldn't break monitoring
        }
      }
    }
  } catch (err) {
    result.error = String(err);
    logger.error('Domain WHOIS check failed', { domainId, error: String(err) });
  }

  try {
    const dnsData = await fetchDnsRecords(domain.name);
    await prisma.domain.update({
      where: { id: domainId },
      data: {
        dnsRecords: JSON.stringify(dnsData),
        lastDnsCheck: new Date(),
      },
    });

    await prisma.domainRevision.create({
      data: {
        domainId,
        data: JSON.stringify(dnsData),
        source: 'dns',
        message: 'Automated DNS check',
        userId: domain.userId,
      },
    });
    result.dnsUpdated = true;
  } catch (err) {
    logger.error('Domain DNS check failed', { domainId, error: String(err) });
  }

  return result;
}

export async function checkAllDomains(): Promise<MonitoringResult[]> {
  const domains = await prisma.domain.findMany({
    select: { id: true, name: true },
  });

  const results: MonitoringResult[] = [];
  // Process in batches of 5 to avoid overwhelming
  for (let i = 0; i < domains.length; i += 5) {
    const batch = domains.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map((d) => checkDomain(d.id)));
    results.push(...batchResults);
  }

  logger.info('Domain monitoring check complete', {
    total: domains.length,
    whoisUpdated: results.filter((r) => r.whoisUpdated).length,
    dnsUpdated: results.filter((r) => r.dnsUpdated).length,
    alerts: results.filter((r) => r.expiryAlert).length,
  });

  return results;
}
