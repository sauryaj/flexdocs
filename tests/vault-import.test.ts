import { describe, it, expect } from 'vitest';
import { parseCsv, detectFormat, mapRow, type VaultFormat } from '@/lib/vault-import';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv('name,password\n"Site, Inc","pa,ss word"');
    expect(rows[1]).toEqual(['Site, Inc', 'pa,ss word']);
  });

  it('un-escapes doubled quotes inside quoted fields', () => {
    const rows = parseCsv('notes\n"he said ""hello"""');
    expect(rows[1][0]).toBe('he said "hello"');
  });

  it('handles newlines inside quoted fields', () => {
    const rows = parseCsv('notes\n"line one\nline two"');
    expect(rows[1][0]).toBe('line one\nline two');
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFname\nx')[0]).toEqual(['name']);
  });

  it('drops fully empty lines but keeps empty trailing fields', () => {
    const rows = parseCsv('a,b,c\n1,,\n');
    expect(rows.length).toBe(2);
    expect(rows[1]).toEqual(['1', '', '']);
  });

  it('returns header-only input as a single row', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('handles a real-world Bitwarden export with hostile values', () => {
    const csv = [
      'folder,favorite,type,name,login_uri,login_username,login_password',
      ',true,login,"Acme, Inc. Portal",https://a.co,userA,"p@ss,w""rd"',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows[1][3]).toBe('Acme, Inc. Portal');
    expect(rows[1][6]).toBe('p@ss,w"rd');
    expect(rows[1][1]).toBe('true');
  });
});

describe('detectFormat', () => {
  it.each([
    ['bitwarden', ['folder', 'favorite', 'type', 'name', 'login_uri', 'login_username', 'login_password']],
    ['1password', ['Title', 'Url', 'Username', 'Password', 'Notes']],
    ['chrome', ['name', 'url', 'username', 'password']],
  ] as [VaultFormat, string[]][])('detects %s', (expected, headers) => {
    expect(detectFormat(headers)).toBe(expected);
  });

  it('falls back to generic for unknown headers', () => {
    expect(detectFormat(['col_a', 'col_b'])).toBe('generic');
  });
});

describe('mapRow', () => {
  const bitwardenRow = {
    name: 'Main Site',
    login_username: 'admin',
    login_password: 'secret',
    login_uri: 'https://x.co',
    login_totp: 'otpauth://totp/Main%20Site?secret=JBSWY3DP&issuer=X',
    favorite: 'true',
  };

  it('maps Bitwarden columns including otpauth TOTP extraction', () => {
    const m = mapRow(bitwardenRow, 'bitwarden');
    expect(m).toMatchObject({
      name: 'Main Site',
      username: 'admin',
      password: 'secret',
      url: 'https://x.co',
      totpSecret: 'JBSWY3DP',
      isFavorite: true,
    });
  });

  it('passes through raw TOTP secrets without an otpauth prefix', () => {
    const m = mapRow({ ...bitwardenRow, login_totp: 'PLAINSECRET' }, 'bitwarden');
    expect(m.totpSecret).toBe('PLAINSECRET');
  });

  it('maps 1Password title/url columns', () => {
    const m = mapRow({ Title: 'Bank', Username: 'u', Password: 'p', Url: 'https://bank' }, '1password');
    expect(m).toMatchObject({ name: 'Bank', username: 'u', password: 'p', url: 'https://bank' });
  });

  it('maps Chrome exports (no notes/totp)', () => {
    const m = mapRow({ name: 'Shop', username: 'u', password: 'p', url: 'https://s.io' }, 'chrome');
    expect(m.name).toBe('Shop');
    expect(m.notes).toBeUndefined();
    expect(m.totpSecret).toBeUndefined();
  });

  it('falls back to Untitled when only whitespace name exists', () => {
    const m = mapRow({ name: '   ', login_username: 'u' }, 'bitwarden');
    expect(m.name).toBe('Untitled');
  });

  it('normalizes lookup keys so spaces/case do not matter', () => {
    const m = mapRow({ 'Login Username': 'u', 'Login Password': 'p', Name: 'N' }, 'bitwarden');
    expect(m.username).toBe('u');
    expect(m.password).toBe('p');
    expect(m.name).toBe('N');
  });
});
