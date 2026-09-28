import { describe, expect, it } from 'vitest';
import { canUseMcpTool } from '@/lib/mcp-access';

describe('MCP tool permissions', () => {
  it('does not treat an administrator key as unrestricted', () => {
    expect(canUseMcpTool('admin', [], 'flexdocs_get_document')).toBe(false);
    expect(canUseMcpTool('admin', ['document.read'], 'flexdocs_get_document')).toBe(true);
    expect(canUseMcpTool('admin', ['document.read'], 'flexdocs_search')).toBe(false);
  });
  it('requires every resource permission for aggregate tools', () => {
    const permissions = ['organization.read', 'domain.read', 'asset.read', 'report.read', 'document.read'];
    expect(canUseMcpTool('viewer', permissions, 'flexdocs_org_pulse')).toBe(true);
    for (const omitted of permissions) expect(canUseMcpTool('viewer', permissions.filter(p => p !== omitted), 'flexdocs_org_pulse')).toBe(false);
  });
  it('preserves explicit legacy read scopes without promoting unknown or write-only scopes', () => {
    for (const scope of ['read', 'admin']) expect(canUseMcpTool('viewer', [scope], 'flexdocs_search')).toBe(true);
    for (const scope of ['write', '*', 'unknown', '']) expect(canUseMcpTool('admin', [scope], 'flexdocs_get_document')).toBe(false);
    expect(canUseMcpTool('viewer', null, 'flexdocs_search')).toBe(true);
    expect(canUseMcpTool('admin', ['admin'], 'unknown_tool')).toBe(false);
  });
});
