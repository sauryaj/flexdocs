import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import dns from 'dns';
import { promisify } from 'util';

const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsResolveMx = promisify(dns.resolveMx);
const dnsResolveNs = promisify(dns.resolveNs);
const dnsResolveTxt = promisify(dns.resolveTxt);
const dnsResolveCaa = promisify(dns.resolveCaa);
const dnsResolveSoa = promisify(dns.resolveSoa);
const dnsResolveCname = promisify(dns.resolveCname);

export interface DnsRecords {
  A: string[];
  AAAA: string[];
  MX: { exchange: string; priority: number }[];
  NS: string[];
  TXT: string[];
  CAA: { flags: number; tag: string; value: string }[];
  SOA: { nsname: string; hostmaster: string; serial: number; refresh: number; retry: number; expire: number; minttl: number } | null;
  CNAME: string[];
  fetchedAt: string;
}

export async function fetchDnsRecords(domain: string): Promise<DnsRecords> {
  const records: DnsRecords = {
    A: [], AAAA: [], MX: [], NS: [], TXT: [], CAA: [], SOA: null, CNAME: [],
    fetchedAt: new Date().toISOString(),
  };

  const parallel: Promise<void>[] = [];

  parallel.push(
    dnsResolve4(domain).then((r) => { records.A = r; }).catch(() => {})
  );
  parallel.push(
    dnsResolve6(domain).then((r) => { records.AAAA = r; }).catch(() => {})
  );
  parallel.push(
    dnsResolveMx(domain).then((r) => { records.MX = r; }).catch(() => {})
  );
  parallel.push(
    dnsResolveNs(domain).then((r) => { records.NS = r; }).catch(() => {})
  );
  parallel.push(
    dnsResolveTxt(domain).then((r) => { records.TXT = r.map((t) => t.join('')); }).catch(() => {})
  );
  parallel.push(
    dnsResolveCaa(domain).then((r) => {
      records.CAA = r.map((c) => {
        const obj = c as unknown as Record<string, string | number>;
        const tag = Object.keys(obj).find(k => k !== 'critical') || 'issue';
        return { flags: Number(obj.critical || 0), tag, value: String(obj[tag] || '') };
      });
    }).catch(() => {})
  );
  parallel.push(
    dnsResolveSoa(domain).then((r) => { records.SOA = r; }).catch(() => {})
  );
  parallel.push(
    dnsResolveCname(domain).then((r) => { records.CNAME = r; }).catch(() => {})
  );

  await Promise.all(parallel);
  return records;
}

export interface WhoisData {
  domainName: string;
  registrar?: string;
  creationDate?: string;
  expiryDate?: string;
  updatedDate?: string;
  nameservers?: string[];
  registrantOrg?: string;
  registrantCountry?: string;
  registrantState?: string;
  privacyProtection?: boolean;
  status?: string[];
  raw?: string;
  fetchedAt: string;
}

export async function fetchWhoisData(domain: string): Promise<WhoisData> {
  try {
    const whoiser = await import('whoiser');
    const result = await whoiser.whoisDomain(domain, { follow: 1, timeout: 10000 });

    // whoiser returns an object keyed by TLD server
    const firstKey = Object.keys(result)[0];
    const data = firstKey ? result[firstKey] : {};

    const toStr = (v: unknown): string | undefined => {
      if (!v) return undefined;
      return Array.isArray(v) ? v[0] : String(v);
    };

    const nameservers = Array.isArray(data['Name Server'])
      ? data['Name Server']
      : data['Name Server']
        ? [data['Name Server']]
        : [];

    const status = Array.isArray(data['Domain Status'])
      ? data['Domain Status']
      : data['Domain Status']
        ? [data['Domain Status']]
        : [];

    return {
      domainName: domain,
      registrar: toStr(data['Registrar']),
      creationDate: toStr(data['Created Date'] || data['Creation Date']),
      expiryDate: toStr(data['Expiry Date'] || data['Expiration Date']),
      updatedDate: toStr(data['Updated Date']),
      nameservers: nameservers.map((ns: string) => ns.toLowerCase().replace(/\.$/, '')),
      registrantOrg: toStr(data['Registrant Organization']),
      registrantCountry: toStr(data['Registrant Country']),
      registrantState: toStr(data['Registrant State/Province']),
      privacyProtection: status.some((s: string) =>
        s.toLowerCase().includes('privacy') || s.toLowerCase().includes('redacted')
      ),
      status: status,
      raw: JSON.stringify(data),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('WHOIS fetch failed, using DNS fallback', { domain, error: String(err) });
    // Fallback: at least try to get some DNS info
    return {
      domainName: domain,
      fetchedAt: new Date().toISOString(),
      raw: JSON.stringify({ error: String(err) }),
    };
  }
}

export async function refreshDomainData(domainId: string): Promise<{
  whois: WhoisData | null;
  dns: DnsRecords | null;
}> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error('Domain not found');

  let whoisData: WhoisData | null = null;
  let dnsData: DnsRecords | null = null;

  try {
    whoisData = await fetchWhoisData(domain.name);

    // Update domain with WHOIS data
    await prisma.domain.update({
      where: { id: domainId },
      data: {
        registrar: whoisData.registrar || domain.registrar,
        nameservers: whoisData.nameservers?.join(', ') || domain.nameservers,
        expiresAt: whoisData.expiryDate ? new Date(whoisData.expiryDate) : domain.expiresAt,
        whoisCreated: whoisData.creationDate || domain.whoisCreated,
        whoisCountry: whoisData.registrantCountry || domain.whoisCountry,
        whoisState: whoisData.registrantState || domain.whoisState,
        privacyProtection: whoisData.privacyProtection ?? domain.privacyProtection,
        lastWhoisCheck: new Date(),
      },
    });

    // Create revision
    await prisma.domainRevision.create({
      data: {
        domainId,
        data: JSON.stringify(whoisData),
        source: 'whois',
        message: 'WHOIS data refresh',
        userId: domain.userId,
      },
    });
  } catch (err) {
    logger.error('WHOIS refresh failed', { domainId, error: String(err) });
  }

  try {
    dnsData = await fetchDnsRecords(domain.name);

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
        message: 'DNS records refresh',
        userId: domain.userId,
      },
    });
  } catch (err) {
    logger.error('DNS refresh failed', { domainId, error: String(err) });
  }

  return { whois: whoisData, dns: dnsData };
}
