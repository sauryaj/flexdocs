import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processWebhookRetries } from '@/lib/webhook-retry';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userWebhookIds = (await prisma.webhook.findMany({ where: { userId: user.id }, select: { id: true } })).map(w => w.id);

  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      webhookId: { in: userWebhookIds },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Attach webhook info
  const webhooksMap = new Map(userWebhookIds.map(id => [id, '']));
  const webhooks = await prisma.webhook.findMany({ where: { id: { in: userWebhookIds } }, select: { id: true, name: true, url: true } });
  for (const w of webhooks) webhooksMap.set(w.id, w.name);

  const deliveriesWithNames = deliveries.map(d => ({
    ...d,
    webhook: { name: webhooksMap.get(d.webhookId) || 'Unknown', url: '' },
  }));

  return NextResponse.json(deliveriesWithNames);
}

export async function POST() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await processWebhookRetries();
  return NextResponse.json({ success: true, message: 'Retry queue processed' });
}
