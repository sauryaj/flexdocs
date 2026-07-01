export interface ImportedPassword {
  name: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
  totpSecret?: string;
  customFields?: Record<string, string>;
}

// Parse Bitwarden CSV export
export function parseBitwardenCsv(csv: string): ImportedPassword[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.findIndex((h) => h.toLowerCase() === 'name');
  const userIdx = headers.findIndex((h) => h.toLowerCase() === 'login_username');
  const passIdx = headers.findIndex((h) => h.toLowerCase() === 'login_password');
  const urlIdx = headers.findIndex((h) => h.toLowerCase() === 'login_uri');
  const notesIdx = headers.findIndex((h) => h.toLowerCase() === 'notes');
  const totpIdx = headers.findIndex((h) => h.toLowerCase() === 'login_totp');
  const typeIdx = headers.findIndex((h) => h.toLowerCase() === 'type');

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const type = fields[typeIdx] || '';
    const category = type === '1' ? 'login' : type === '2' ? 'secure_note' : type === '3' ? 'card' : 'general';

    return {
      name: fields[nameIdx] || 'Untitled',
      username: fields[userIdx] || '',
      password: fields[passIdx] || '',
      url: fields[urlIdx] || undefined,
      notes: fields[notesIdx] || undefined,
      category: mapCategory(category),
      totpSecret: fields[totpIdx] || undefined,
    };
  }).filter((p) => p.password || p.name);
}

// Parse 1Password CSV export
export function parseOnePasswordCsv(csv: string): ImportedPassword[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.findIndex((h) => h.toLowerCase().includes('title') || h.toLowerCase().includes('name'));
  const userIdx = headers.findIndex((h) => h.toLowerCase().includes('username') || h.toLowerCase().includes('email'));
  const passIdx = headers.findIndex((h) => h.toLowerCase().includes('password'));
  const urlIdx = headers.findIndex((h) => h.toLowerCase().includes('url') || h.toLowerCase().includes('website'));
  const notesIdx = headers.findIndex((h) => h.toLowerCase().includes('notes'));
  const totpIdx = headers.findIndex((h) => h.toLowerCase().includes('otp') || h.toLowerCase().includes('totp'));

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      name: fields[nameIdx] || 'Untitled',
      username: fields[userIdx] || '',
      password: fields[passIdx] || '',
      url: fields[urlIdx] || undefined,
      notes: fields[notesIdx] || undefined,
      totpSecret: fields[totpIdx] || undefined,
    };
  }).filter((p) => p.password || p.name);
}

// Parse LastPass CSV export
export function parseLastPassCsv(csv: string): ImportedPassword[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.findIndex((h) => h.toLowerCase() === 'name');
  const userIdx = headers.findIndex((h) => h.toLowerCase() === 'username');
  const passIdx = headers.findIndex((h) => h.toLowerCase() === 'password');
  const urlIdx = headers.findIndex((h) => h.toLowerCase() === 'url');
  const notesIdx = headers.findIndex((h) => h.toLowerCase() === 'extra');
  const groupIdx = headers.findIndex((h) => h.toLowerCase() === 'group');

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      name: fields[nameIdx] || 'Untitled',
      username: fields[userIdx] || '',
      password: fields[passIdx] || '',
      url: fields[urlIdx] || undefined,
      notes: fields[notesIdx] || undefined,
      category: fields[groupIdx] ? mapCategory(fields[groupIdx]) : undefined,
    };
  }).filter((p) => p.password || p.name);
}

// Parse Chrome CSV export (chrome://settings/passwords)
export function parseChromeCsv(csv: string): ImportedPassword[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.findIndex((h) => h.toLowerCase().includes('name') || h.toLowerCase().includes('site'));
  const userIdx = headers.findIndex((h) => h.toLowerCase().includes('username') || h.toLowerCase().includes('email'));
  const passIdx = headers.findIndex((h) => h.toLowerCase().includes('password'));

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      name: fields[nameIdx] || 'Untitled',
      username: fields[userIdx] || '',
      password: fields[passIdx] || '',
    };
  }).filter((p) => p.password || p.name);
}

// Parse KeePass CSV export (KeePassCSV plugin)
export function parseKeePassCsv(csv: string): ImportedPassword[] {
  const lines = csv.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const groupIdx = headers.findIndex((h) => h.toLowerCase() === 'group');
  const nameIdx = headers.findIndex((h) => h.toLowerCase() === 'title');
  const userIdx = headers.findIndex((h) => h.toLowerCase() === 'username');
  const passIdx = headers.findIndex((h) => h.toLowerCase() === 'password');
  const urlIdx = headers.findIndex((h) => h.toLowerCase() === 'url');
  const notesIdx = headers.findIndex((h) => h.toLowerCase() === 'notes');

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      name: fields[nameIdx] || 'Untitled',
      username: fields[userIdx] || '',
      password: fields[passIdx] || '',
      url: fields[urlIdx] || undefined,
      notes: fields[notesIdx] || undefined,
      category: fields[groupIdx] ? mapCategory(fields[groupIdx]) : undefined,
    };
  }).filter((p) => p.password || p.name);
}

// Auto-detect format and parse
export function autoDetectAndParse(csv: string): ImportedPassword[] {
  const firstLine = csv.split('\n')[0]?.toLowerCase() || '';

  if (firstLine.includes('login_uri') || firstLine.includes('login_password')) {
    return parseBitwardenCsv(csv);
  }
  if (firstLine.includes('otpauth') || firstLine.includes('login_totp')) {
    return parseOnePasswordCsv(csv);
  }
  if (firstLine.includes('extra') && firstLine.includes('group')) {
    return parseLastPassCsv(csv);
  }
  if (firstLine.includes('name') && firstLine.includes('password') && firstLine.includes('url')) {
    return parseChromeCsv(csv);
  }
  if (firstLine.includes('group') && firstLine.includes('title')) {
    return parseKeePassCsv(csv);
  }

  // Fallback: try as generic CSV
  return parseLastPassCsv(csv);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function mapCategory(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    login: 'general', email: 'email', social: 'social', financial: 'financial',
    server: 'server', database: 'database', api: 'api', ssh: 'ssh',
    vpn: 'vpn', cloud: 'cloud', securenote: 'general', card: 'financial',
  };
  return map[lower] || 'general';
}
