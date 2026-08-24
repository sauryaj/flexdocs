import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';

/**
 * Minimal MCP (Model Context Protocol) server over Streamable HTTP (JSON-RPC 2.0).
 * Authenticate with an API key via the X-API-Key header — the key's permissions
 * and the caller's org scope apply to every tool call.
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

async function resolveUser(req: Request) {
  // API key first (machine clients), cookie session as fallback
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    const { extractAuth } = await import('@/lib/api-keys');
    const authData = await extractAuth(req);
    if (authData) return authData.user;
    return null;
  }
  return auth();
}

async function toolSearch(user: { id: string; role: string }, args: Record<string, unknown>) {
  const q = String(args.query ?? '').trim();
  if (!q) return { error: 'query is required' };
  const organizationId = args.organizationId ? String(args.organizationId) : undefined;

  const scope = await getOrgScope(user.id, user.role);
  const isStaff = scope.mode === 'all';
  const orgWhere = isStaff
    ? (organizationId ? { organizationId } : {})
    : { organizationId: scope.orgIds.length ? { in: scope.orgIds } : { in: ['__none__'] } };
  const contains = { contains: q, mode: 'insensitive' as const };

  const [documents, servers, assets] = await Promise.all([
    prisma.document.findMany({
      where: isStaff
        ? { userId: user.id, isArchived: false, ...orgWhere, OR: [{ title: contains }, { content: contains }] }
        : { ...orgWhere, isArchived: false, visibility: 'org', OR: [{ title: contains }, { content: contains }] },
      select: { id: true, title: true, category: true, content: true },
      take: 8,
    }),
    prisma.server.findMany({
      where: { ...orgWhere, OR: [{ name: contains }, { hostname: contains }] },
      select: { id: true, name: true, hostname: true, ipAddress: true },
      take: 5,
    }),
    prisma.flexibleAsset.findMany({
      where: { ...orgWhere, isArchived: false, OR: [{ name: contains }, { assetType: contains }] },
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
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return { error: 'not found' };

  const scope = await getOrgScope(user.id, user.role);
  const allowed =
    doc.userId === user.id ||
    scope.mode === 'all' ||
    (scope.mode === 'limited' && doc.visibility === 'org' && doc.organizationId && scope.orgIds.includes(doc.organizationId));
  if (!allowed) return { error: 'not found' };

  return { id: doc.id, title: doc.title, category: doc.category, content: doc.content, updatedAt: doc.updatedAt };
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
    prisma.document.count({ where: { organizationId, isArchived: false } }),
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

  const user = await resolveUser(req);
  if (!user?.id) {
    return NextResponse.json(rpcError(rpc.id, -32001, 'Unauthorized: provide X-API-Key'), { status: 401 });
  }
  const u = { id: user.id, role: String(user.role ?? 'viewer') };

  try {
    switch (rpc.method) {
      case 'tools/list':
        return NextResponse.json(rpcResult(rpc.id, { tools: TOOLS }));
      case 'tools/call': {
        const name = String(rpc.params?.name ?? '');
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
