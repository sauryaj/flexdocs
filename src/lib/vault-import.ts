/**
 * Pure helpers for password-manager CSV vault imports.
 * Shared between the import API route and its unit tests.
 */

/** RFC-4180-ish CSV parser: handles quoted fields with embedded commas/newlines/quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
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

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export type VaultFormat = 'bitwarden' | '1password' | 'chrome' | 'generic';

export function detectFormat(headers: string[]): VaultFormat {
  const h = headers.map(norm);
  if (h.includes('loginusername') && h.includes('loginpassword')) return 'bitwarden';
  if (h.includes('title') && (h.includes('url') || h.includes('loginuri'))) return '1password';
  if (h.includes('name') && h.includes('username') && h.includes('password')) return 'chrome';
  return 'generic';
}

export interface MappedRow {
  name: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  totpSecret?: string;
  isFavorite?: boolean;
}

export function mapRow(rawRow: Record<string, string>, format: VaultFormat): MappedRow {
  // Normalize incoming keys so raw CSV headers ("Login Username", "URL", …) just work
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    row[norm(k)] = v;
  }

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
