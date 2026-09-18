import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const FIELD_TYPES = ['text', 'textarea', 'select', 'boolean'];

function validateFields(fields: unknown): string | null {
  if (!Array.isArray(fields)) return 'fields must be an array';
  for (const f of fields) {
    if (!f || typeof f !== 'object') return 'each field must be an object';
    const field = f as Record<string, any>;
    if (!field.key || !field.label) return 'each field needs key and label';
    if (!FIELD_TYPES.includes(field.type || 'text')) return `invalid field type: ${field.type}`;
    if (field.type === 'select' && !Array.isArray(field.options)) return 'select fields need options[]';
  }
  return null;
}

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getOrgScope(user.id, user.role);
  const where =
    scope.mode === 'limited'
      ? { active: true, OR: [{ organizationId: { in: scope.orgIds } }, { organizationId: null }] }
      : {};

  const templates = await prisma.serviceRequestTemplate.findMany({
    where,
    include: { organization: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(templates.map((t) => ({ ...t, fields: safeParseFields(t.fields) })));
}

function safeParseFields(raw: string | string[][] | null): unknown[] {
  if (!raw) return [];
  if (typeof raw !== 'string') return typeof raw === 'object' ? (raw as unknown[]) : [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'settings.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, category, priority, active, fields, organizationId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (priority && !PRIORITIES.includes(priority)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 });

  const fieldError = validateFields(fields);
  if (fieldError) return NextResponse.json({ error: fieldError }, { status: 400 });

  const template = await prisma.serviceRequestTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || '',
      category: category || 'general',
      priority: priority || 'medium',
      active: active !== false,
      fields: JSON.stringify(Array.isArray(fields) ? fields : []),
      organizationId: organizationId || null,
      userId: user.id,
    },
  });
  return NextResponse.json(template, { status: 201 });
}