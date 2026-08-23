import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

/** RFC-4180-ish CSV parser: handles quoted fields with embedded commas/newlines/quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type VaultFormat = 'bitwarden' | '1password' | 'chrome' | 'generic';

function detectFormat(headers: string[]): VaultFormat {
  const h = headers.map(norm);
  if (h.includes('loginusername') && h.includes('loginpassword')) return 'bitwarden';
  if (h.includes('title') && (h.includes('url') || h.includes('loginuri'))) return '1password';
  if (h.includes('name') && h.includes('username') && h.includes('password')) return 'chrome';
  return 'generic';
}

interface MappedRow {
  name: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  totpSecret?: string;
  isFavorite?: boolean;
}

function mapRow(row: Record<string, string>, format: VaultFormat): MappedRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const v = row[norm(k)];
      if (v !== undefined && v.trim() !== '') return v.trim();
    }
    return '';
  };

  // Bitwarden stores TOTP as otpauth:// URI or raw secret
  const totpRaw = get('login_totp', 'totp');
  const totpSecret = totpRaw
    ? decodeURIComponent(totpRaw.replace(/^otpauth:\/\/totp\/[^?]*\?secret=/i, '').split('&')[0])
    : undefined;

  if (format === 'bitwarden') {
    return {
      name: get('name') || 'Untitled',
      username: get('login_username', 'username'),
      password: get('login_password'),
      url: get('login_uri', 'uri') || undefined,
      notes: get('notes') || undefined,
      totpSecret: totpSecret || undefined,
      isFavorite: get('favorite') === 'true',
    };
  }
  if (format === '1password') {
    return {
      name: get('title') || 'Untitled',
      username: get('username', 'login_username'),
      password: get('password', 'login_password'),
      url: get('url', 'login_uri', 'website') || undefined,
      notes: get('notes') || undefined,
      totpSecret: totpSecret || undefined,
    };
  }
  // chrome + generic
  return {
    name: get('name', 'title') || 'Untitled',
    username: get('username', 'login_username'),
    password: get('password', 'login_password'),
    url: get('url', 'login_uri') || undefined,
    notes: get('notes') || undefined,
  };
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'password.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { csv, format, organizationId } = await req.json().catch(() => ({}));
  if (!csv || typeof csv !== 'string' || csv.trim() === '') {
    return NextResponse.json({ error: 'csv content required' }, { status: 400 });
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV needs a header row and at least one entry' }, { status: 400 });
  }

  const headers = rows[0];
  const fmt: VaultFormat =
    format === 'bitwarden' || format === '1password' || format === 'chrome' ? format : detectFormat(headers);

  const dataRows = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[norm(h)] = r[i] ?? '';
    });
    return rec;
  });

  let created = 0;
  let skipped = 0;
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    try {
      const mapped = mapRow(dataRows[i], fmt);
      if (!mapped.name && !mapped.username) {
        skipped++;
        continue;
      }

      // Dedupe on name+username+url
      const existing = await prisma.password.findFirst({
        where: {
          userId: user.id,
          name: mapped.name,
          username: mapped.username,
          ...(mapped.url ? { url: mapped.url } : {}),
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.password.create({
        data: {
          name: mapped.name,
          username: mapped.username,
          password: encrypt(mapped.password),
          url: mapped.url || null,
          notes: mapped.notes || null,
          category: 'imported',
          isFavorite: mapped.isFavorite ?? false,
          totpSecret: mapped.totpSecret ? encrypt(mapped.totpSecret) : null,
          organizationId: organizationId || null,
          userId: user.id,
        },
      });
      created++;
    } catch (err: any) {
      errors.push({ index: i + 2, error: err.message }); // +2 = header + 1-indexed
    }
  }

  return NextResponse.json({
    detectedFormat: fmt,
    total: dataRows.length,
    created,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  });
}
