import { NextResponse } from 'next/server';
import { extractAuth } from '@/lib/api-keys';
import { canUseMcpTool } from '@/lib/mcp-access';
import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';
import { discoverDocuments } from '@/lib/document-discovery';
import { readDocumentDetail } from '@/lib/document-detail-read';
import { DocumentWriteError } from '@/lib/document-write';

/**
 * Minimal MCP (Model Context Protocol) server over Streamable HTTP (JSON-RPC 2.0).
 * Authenticate with an API key via the X-API-Key header.
 * Document visibility follows the shared read policy.
 *
 * Tools:
 *   flexdocs_search      { query, organizationId? }
 *   flexdocs_get_document{ id }
 *   flexdocs_list_orgs   {}
 *   flexdocs_org_pulse   { organizationId }
 */

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest['id'], result: Record<string, unknown>) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: RpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function toolSearch(user: { id: string; role: string }, args: Record<string, unknown>) {
  const q = String(args.query ?? '').trim();
  if (!q) return { error: 'query is required' };
  if (q.length > 500) return { error: 'query is limited to 500 characters' };
  const organizationId = args.organizationId ? String(args.organizationId) : undefined;

  const scope = await getOrgScope(user.id, user.role);
  const orgWhere = scopeOrgWhere(scope, organizationId);
  const terms = q.split(/\s+/).filter((t: string) => t.length > 2).slice(0, 8);
  const firstTerm = terms[0] ?? q;
  const simpleContains = { contains: firstTerm, mode: 'insensitive' as const };

  const [documents, servers, assets] = await Promise.all([
    discoverDocuments(user.id, { terms, organizationId, excludeArchived: true, page: 0, limit: 8 }).then(result => result.items),
    prisma.server.findMany({
      where: { ...orgWhere, OR: [{ name: simpleContains }, { hostname: simpleContains }] },
      select: { id: true, name: true, hostname: true, ipAddress: true },
      take: 5,
    }),
    prisma.flexibleAsset.findMany({
      where: { ...orgWhere, isArchived: false, OR: [{ name: simpleContains }, { assetType: simpleContains }] },
      select: { id: true, name: true, assetType: true },
      take: 5,
    }),
  ]);

  return {
    documents: documents.map((d) => ({ id: d.id, title: d.title, category: d.category, excerpt: (d.content || '').slice(0, 300) })),
    servers,
    assets,
  };
}

async function toolGetDocument(user: { id: string; role: string }, args: Record<string, unknown>) {
  const id = String(args.id ?? '');
  try {
    const doc = await readDocumentDetail(user.id, id);
    return { id: doc.id, title: doc.title, category: doc.category, content: doc.content, updatedAt: doc.updatedAt };
  } catch (error) {
    if (error instanceof DocumentWriteError) return { error: error.status === 404 ? 'not found' : 'document unavailable' };
    throw error;
  }
}

async function toolListOrgs(user: { id: string; role: string }) {
  const scope = await getOrgScope(user.id, user.role);
  const orgs =
    scope.mode === 'all'
      ? await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : await prisma.organization.findMany({ where: { id: { in: scope.orgIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return { organizations: orgs };
}

async function toolOrgPulse(user: { id: string; role: string }, args: Record<string, unknown>) {
  const organizationId = String(args.organizationId ?? '');
  const scope = await getOrgScope(user.id, user.role);
  if (scope.mode !== 'all' && !scope.orgIds.includes(organizationId)) {
    return { error: 'not found' };
  }
  const [domains, servers, tickets, docs] = await Promise.all([
    prisma.domain.count({ where: { organizationId } }),
    prisma.server.count({ where: { organizationId } }),
    prisma.ticket.count({ where: { organizationId, status: { in: ['open', 'pending'] } } }),
    discoverDocuments(user.id, { organizationId, excludeArchived: true, page: 0, limit: 1 }).then(result => result.total),
  ]);
  return { organizationId, domains, servers, openTickets: tickets, documents: docs };
}

const TOOLS = [
  {
    name: 'flexdocs_search',
    description: 'Search FlexDocs documentation, servers, and assets by keyword. Scoped to the API key owner.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, organizationId: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'flexdocs_get_document',
    description: 'Fetch full markdown content of one document by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'flexdocs_list_orgs',
    description: 'List organizations visible to this API key.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'flexdocs_org_pulse',
    description: 'Counts (domains, servers, open tickets, documents) for one organization.',
    inputSchema: {
      type: 'object',
      properties: { organizationId: { type: 'string' } },
      required: ['organizationId'],
    },
  },
];

export async function POST(req: Request) {
  const rpc = (await req.json().catch(() => null)) as RpcRequest | null;
  if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) {
    return NextResponse.json(rpcError(null, -32600, 'Invalid Request'), { status: 400 });
  }

  // initialize needs no auth (handshake), everything else does
  if (rpc.method === 'initialize') {
    return NextResponse.json(
      rpcResult(rpc.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'flexdocs', version: '1.0.0' },
      }),
    );
  }
  if (rpc.method === 'notifications/initialized') {
    return new NextResponse(null, { status: 202 });
  }

  const authData = await extractAuth(req);
  const user = authData?.user;
  if (!user?.id) {
    return NextResponse.json(rpcError(rpc.id, -32001, 'Unauthorized: provide X-API-Key'), { status: 401 });
  }
  const u = { id: user.id, role: String(user.role ?? 'viewer') };

  try {
    switch (rpc.method) {
      case 'tools/list':
        return NextResponse.json(rpcResult(rpc.id, { tools: TOOLS.filter(tool => canUseMcpTool(user.role, authData!.permissions, tool.name)) }));
      case 'tools/call': {
        const name = String(rpc.params?.name ?? '');
        if (TOOLS.some(tool => tool.name === name) && !canUseMcpTool(user.role, authData!.permissions, name)) {
          return NextResponse.json(rpcError(rpc.id, -32003, 'Forbidden: insufficient tool permissions'), { status: 403 });
        }
        const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;
        let out: unknown;
        switch (name) {
          case 'flexdocs_search': out = await toolSearch(u, args); break;
          case 'flexdocs_get_document': out = await toolGetDocument(u, args); break;
          case 'flexdocs_list_orgs': out = await toolListOrgs(u); break;
          case 'flexdocs_org_pulse': out = await toolOrgPulse(u, args); break;
          default:
            return NextResponse.json(rpcError(rpc.id, -32602, `Unknown tool: ${name}`), { status: 400 });
        }
        return NextResponse.json(rpcResult(rpc.id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: !!(out as { error?: string }).error,
        }));
      }
      case 'ping':
        return NextResponse.json(rpcResult(rpc.id, {}));
      default:
        return NextResponse.json(rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`), { status: 404 });
    }
  } catch {
    return NextResponse.json(rpcError(rpc.id, -32603, 'Internal error'), { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    server: 'flexdocs-mcp',
    transport: 'streamable-http',
    auth: 'X-API-Key header',
    hint: 'POST JSON-RPC 2.0 requests here. Start with method "initialize".',
  });
}
