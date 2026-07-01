import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '@/lib/logger';

const execFileAsync = promisify(execFile);

interface ScanResult {
  ip: string;
  hostname?: string;
  mac?: string;
  os?: string;
  ports: { port: number; service: string; state: string }[];
  status: 'up' | 'down';
}

function isValidIP(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((octet) => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

function isValidCIDR(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const [base, prefix] = parts;
  if (!isValidIP(base)) return false;
  const p = parseInt(prefix, 10);
  return !isNaN(p) && p >= 0 && p <= 32;
}

function generateIPs(cidr: string): string[] {
  const ips: string[] = [];
  const parts = cidr.split('/');
  const [base, prefixStr] = parts;
  const prefix = parseInt(prefixStr, 10);

  if (prefix >= 24 && prefix <= 30) {
    const baseParts = base.split('.').map(Number);
    const numHosts = Math.pow(2, 32 - prefix) - 2;
    for (let i = 1; i <= Math.min(numHosts, 254); i++) {
      const ip = [...baseParts];
      ip[3] = (baseParts[3] & ~((1 << (32 - prefix)) - 1)) + i;
      ips.push(ip.join('.'));
    }
  }
  return ips;
}

function parseNmapOutput(output: string): ScanResult[] {
  const results: ScanResult[] = [];
  const lines = output.split('\n');
  let currentHost: ScanResult | null = null;

  for (const line of lines) {
    const hostMatch = line.match(/Nmap scan report for (\S+?) \((\d+\.\d+\.\d+\.\d+)\)/);
    if (hostMatch) {
      if (currentHost) results.push(currentHost);
      currentHost = { hostname: hostMatch[1], ip: hostMatch[2], ports: [], status: 'up' };
      continue;
    }

    const ipOnlyMatch = line.match(/Nmap scan report for (\d+\.\d+\.\d+\.\d+)/);
    if (ipOnlyMatch) {
      if (currentHost) results.push(currentHost);
      currentHost = { ip: ipOnlyMatch[1], ports: [], status: 'up' };
      continue;
    }

    if (currentHost) {
      const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|closed|filtered)\s+(\S+)/);
      if (portMatch) {
        currentHost.ports.push({ port: parseInt(portMatch[1]), service: portMatch[4], state: portMatch[3] });
      }
      const osMatch = line.match(/OS details?: (.+)/);
      if (osMatch) currentHost.os = osMatch[1];
      const macMatch = line.match(/MAC Address: ([0-9A-F:]+)/);
      if (macMatch) currentHost.mac = macMatch[1];
    }
  }
  if (currentHost) results.push(currentHost);
  return results;
}

async function pingHost(ip: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ping', ['-c', '1', '-W', '2', ip]);
    return stdout.includes('bytes from');
  } catch {
    return false;
  }
}

async function getDeviceInfo(ip: string): Promise<Partial<ScanResult>> {
  try {
    const { stdout: hostname } = await execFileAsync('dig', ['-x', ip, '+short']).catch(() => ({ stdout: '' }));
    const { stdout: arpOut } = await execFileAsync('arp', ['-n', ip]).catch(() => ({ stdout: '' }));
    const macLine = arpOut.split('\n').find((l) => l.includes(ip));
    const mac = macLine ? macLine.split(/\s+/).find((field) => /^([0-9A-Fa-f:]{17})$/.test(field)) : undefined;
    return {
      hostname: hostname.trim().replace(/\.$/, '') || undefined,
      mac: mac || undefined,
    };
  } catch {
    return {};
  }
}

async function scanPorts(ip: string): Promise<ScanResult['ports']> {
  try {
    const { stdout } = await execFileAsync('nmap', ['-T4', '--top-ports', '100', '-oG', '-', ip], { timeout: 30000 });
    const ports: ScanResult['ports'] = [];
    const portMatches = stdout.matchAll(/(\d+)\/(tcp|udp)\s+(open|closed|filtered)\s+(\S+)/g);
    for (const match of portMatches) {
      ports.push({ port: parseInt(match[1]), service: match[4], state: match[3] });
    }
    return ports;
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { cidr, scanType, organizationId } = await req.json();

  if (!cidr || typeof cidr !== 'string') {
    return NextResponse.json({ error: 'CIDR range required' }, { status: 400 });
  }

  const sanitized = cidr.trim();

  let ips: string[] = [];
  if (sanitized.includes('/')) {
    if (!isValidCIDR(sanitized)) {
      return NextResponse.json({ error: 'Invalid CIDR format' }, { status: 400 });
    }
    ips = generateIPs(sanitized);
  } else {
    if (!isValidIP(sanitized)) {
      return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 });
    }
    ips = [sanitized];
  }

  if (ips.length === 0) {
    return NextResponse.json({ error: 'No IPs to scan in range' }, { status: 400 });
  }

  const hosts: ScanResult[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < Math.min(ips.length, 100); i += BATCH_SIZE) {
    const batch = ips.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (ip) => {
        const isUp = await pingHost(ip);
        if (!isUp) return null;
        const deviceInfo = await getDeviceInfo(ip);
        const ports = scanType !== 'ping-only' ? await scanPorts(ip) : [];
        return { ip, hostname: deviceInfo.hostname, mac: deviceInfo.mac, ports, status: 'up' as const };
      })
    );
    for (const r of results) {
      if (r) hosts.push(r);
    }
  }

  const created = [];
  for (const host of hosts) {
    const name = host.hostname || host.ip;
    try {
      const item = await prisma.networkDocument.create({
        data: {
          name: `Scan: ${name}`,
          type: 'ip-schema',
          content: JSON.stringify({
            ip: host.ip,
            hostname: host.hostname,
            mac: host.mac,
            os: host.os,
            openPorts: host.ports.filter((p) => p.state === 'open').map((p) => `${p.port}/${p.service}`),
            allPorts: host.ports,
          }),
          notes: `Auto-discovered via network scan on ${new Date().toISOString()}`,
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
      created.push(item);
    } catch (err) {
      logger.error('Failed to create scan result', { ip: host.ip, error: String(err) });
    }
  }

  return NextResponse.json({
    scanned: ips.length,
    found: hosts.length,
    created: created.length,
    hosts: created,
  });
}
