import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization, getOrgScope } from '@/lib/org-scope';

export const maxDuration = 60;

/**
 * POST /api/ai/ask — answer a question grounded in the user's own documentation.
 * Provider is configured via env: AI_API_KEY (+ optional AI_MODEL, AI_BASE_URL).
 * Password SECRETS are never sent to the provider — names/metadata only.
 */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI is not configured. Set AI_API_KEY (and optionally AI_MODEL, AI_BASE_URL) in the environment.' },
      { status: 501 },
    );
  }

  const { question, organizationId } = await req.json().catch(() => ({}));
  if (!question?.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }
  if (organizationId && !(await canAccessOrganization(user.id, user.role, organizationId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const scope = await getOrgScope(user.id, user.role);
  const isStaff = scope.mode === 'all';
  const orgFilter = organizationId ? { organizationId } : {};

  // Retrieval: keyword match over the caller's visible data only
  const q = question.trim().slice(0, 500);
  const terms = q.split(/\s+/).filter((t: string) => t.length > 2).slice(0, 8);
  const docWhere = isStaff
    ? { userId: user.id, isArchived: false, ...orgFilter }
    : { organizationId: organizationId ?? { in: scope.mode === 'limited' && scope.orgIds.length ? scope.orgIds : ['__none__'] }, isArchived: false, visibility: 'org' };

  const [documents, servers, assets] = await Promise.all([
    prisma.document.findMany({
      where: {
        ...docWhere,
        OR: terms.length
          ? terms.flatMap((t: string) => [{ title: { contains: t, mode: 'insensitive' as const } }, { content: { contains: t, mode: 'insensitive' as const } }])
          : undefined,
      },
      select: { id: true, title: true, content: true, category: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.server.findMany({
      where: { ...(isStaff ? { userId: user.id } : {}), ...orgFilter },
      select: { id: true, name: true, hostname: true, ipAddress: true, os: true, status: true },
      take: 10,
    }),
    prisma.flexibleAsset.findMany({
      where: { ...(isStaff ? { userId: user.id } : {}), ...orgFilter, isArchived: false },
      select: { id: true, name: true, assetType: true, fields: true },
      take: 10,
    }),
  ]);

  if (documents.length === 0 && servers.length === 0 && assets.length === 0) {
    return NextResponse.json({
      answer: 'I could not find any documentation matching that question' + (organizationId ? ' for this organization.' : '.'),
      sources: [],
    });
  }

  const context = [
    'You are FlexDocs Assistant, answering questions about an IT documentation system.',
    'Answer ONLY from the context below. If the answer is not in the context, say so plainly.',
    'Be concise and factual. Reference document titles when citing.',
    '',
    ...documents.map((d) => `### Document: ${d.title} (category: ${d.category})\n${(d.content || '').slice(0, 2500)}`),
    ...servers.map((s) => `### Server: ${s.name}\nhostname: ${s.hostname ?? '-'} | ip: ${s.ipAddress ?? '-'} | os: ${s.os ?? '-'} | status: ${s.status}`),
    ...assets.map((a) => {
      let fields = '';
      try { fields = JSON.stringify(JSON.parse(a.fields || '{}')).slice(0, 800); } catch { /* legacy */ }
      return `### Asset: ${a.name} (type: ${a.assetType})\n${fields}`;
    }),
  ].join('\n\n');

  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  let answer: string;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: q },
        ],
      }),
      signal: AbortSignal.timeout(50000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json({ error: `AI provider error (${res.status}). Check AI_API_KEY/AI_MODEL.` }, { status: 502 });
    }
    const data = await res.json();
    answer = data.choices?.[0]?.message?.content ?? 'The provider returned an empty response.';
  } catch {
    return NextResponse.json({ error: 'Could not reach the AI provider. Check AI_BASE_URL and network.' }, { status: 502 });
  }

  return NextResponse.json({
    answer,
    sources: documents.map((d) => ({ id: d.id, title: d.title })),
  });
}
