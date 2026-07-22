import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

async function resolveName(type: string, id: string): Promise<string> {
  try {
    switch (type) {
      case 'document': {
        const d = await prisma.document.findUnique({ where: { id }, select: { title: true } });
        return d?.title || id;
      }
      case 'password': {
        const p = await prisma.password.findUnique({ where: { id }, select: { name: true } });
        return p?.name || id;
      }
      case 'domain': {
        const dom = await prisma.domain.findUnique({ where: { id }, select: { name: true } });
        return dom?.name || id;
      }
      case 'asset': {
        const a = await prisma.flexibleAsset.findUnique({ where: { id }, select: { name: true } });
        return a?.name || id;
      }
      case 'server': {
        const s = await prisma.server.findUnique({ where: { id }, select: { name: true } });
        return s?.name || id;
      }
      case 'checklist': {
        const c = await prisma.checklist.findUnique({ where: { id }, select: { name: true } });
        return c?.name || id;
      }
      case 'ssl': {
        const cert = await prisma.sslCertificate.findUnique({ where: { id }, select: { hostname: true } });
        return cert?.hostname || id;
      }
      case 'network': {
        const n = await prisma.networkDocument.findUnique({ where: { id }, select: { name: true } });
        return n?.name || id;
      }
      default:
        return id;
    }
  } catch {
    return id;
  }
}

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const sourceType = searchParams.get('sourceType');
  const sourceId = searchParams.get('sourceId');

  let relationships = [];

  if (entityType && entityId) {
    relationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { sourceType: entityType, sourceId: entityId },
          { targetType: entityType, targetId: entityId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    const where: Record<string, string> = {};
    if (sourceType) where.sourceType = sourceType;
    if (sourceId) where.sourceId = sourceId;
    relationships = await prisma.relationship.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  const enriched = await Promise.all(
    relationships.map(async (rel) => ({
      ...rel,
      sourceName: await resolveName(rel.sourceType, rel.sourceId),
      targetName: await resolveName(rel.targetType, rel.targetId),
    }))
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, sourceType, sourceId, targetType, targetId, notes } = await req.json();

  if (!sourceType || !sourceId || !targetType || !targetId) {
    return NextResponse.json(
      { error: 'sourceType, sourceId, targetType, and targetId are required' },
      { status: 400 }
    );
  }

  const relationship = await prisma.relationship.create({
    data: {
      name: name || null,
      sourceType,
      sourceId,
      targetType,
      targetId,
      notes: notes || null,
    },
  });

  return NextResponse.json(relationship, { status: 201 });
}
