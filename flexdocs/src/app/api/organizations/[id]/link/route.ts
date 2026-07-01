import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getUnlinkedResources(userId: string, resourceType: string) {
  const common = { userId, organizationId: null } as const;
  const orderBy = { createdAt: 'desc' as const };

  switch (resourceType) {
    case 'document':
      return prisma.document.findMany({ where: common, orderBy, select: { id: true, title: true, createdAt: true } });
    case 'password':
      return prisma.password.findMany({ where: common, orderBy, select: { id: true, name: true, createdAt: true } });
    case 'domain':
      return prisma.domain.findMany({ where: common, orderBy, select: { id: true, name: true, createdAt: true } });
    case 'asset':
      return prisma.flexibleAsset.findMany({ where: common, orderBy, select: { id: true, name: true, createdAt: true } });
    case 'checklist':
      return prisma.checklist.findMany({ where: common, orderBy, select: { id: true, name: true, createdAt: true } });
    case 'folder':
      return prisma.folder.findMany({ where: common, orderBy, select: { id: true, name: true, createdAt: true } });
    default:
      return [];
  }
}

async function linkResource(resourceType: string, resourceId: string, organizationId: string, userId: string) {
  switch (resourceType) {
    case 'document': {
      const r = await prisma.document.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.document.update({ where: { id: resourceId }, data: { organizationId } });
    }
    case 'password': {
      const r = await prisma.password.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.password.update({ where: { id: resourceId }, data: { organizationId } });
    }
    case 'domain': {
      const r = await prisma.domain.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.domain.update({ where: { id: resourceId }, data: { organizationId } });
    }
    case 'asset': {
      const r = await prisma.flexibleAsset.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.flexibleAsset.update({ where: { id: resourceId }, data: { organizationId } });
    }
    case 'checklist': {
      const r = await prisma.checklist.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.checklist.update({ where: { id: resourceId }, data: { organizationId } });
    }
    case 'folder': {
      const r = await prisma.folder.findUnique({ where: { id: resourceId } });
      if (!r || r.userId !== userId) return null;
      return prisma.folder.update({ where: { id: resourceId }, data: { organizationId } });
    }
    default:
      return null;
  }
}

const VALID_TYPES = ['document', 'password', 'domain', 'asset', 'checklist', 'folder'];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const resourceType = searchParams.get('resourceType');

  if (!resourceType || !VALID_TYPES.includes(resourceType)) {
    return NextResponse.json(
      { error: 'Invalid or missing resourceType' },
      { status: 400 }
    );
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const resources = await getUnlinkedResources(user.id, resourceType);
  return NextResponse.json(resources);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { resourceType, resourceId } = await req.json();

  if (!resourceType || !VALID_TYPES.includes(resourceType)) {
    return NextResponse.json({ error: 'Invalid resourceType' }, { status: 400 });
  }
  if (!resourceId) {
    return NextResponse.json({ error: 'Missing resourceId' }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await linkResource(resourceType, resourceId, id, user.id);
  if (!updated) {
    return NextResponse.json({ error: 'Resource not found or forbidden' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
