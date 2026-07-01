import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { createHmac } from 'crypto';

export const RETRY_DELAYS_MS = [5000, 30000, 120000, 600000, 3600000]; // 5s, 30s, 2m, 10m, 1h

export async function enqueueWebhookDelivery(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>
) {
  return prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload: JSON.stringify(payload),
      status: 'pending',
      attempts: 0,
    },
  });
}

export async function processWebhookRetries() {
  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ['pending', 'retrying'] },
      attempts: { lt: 5 },
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    take: 20,
  });

  for (const delivery of pendingDeliveries) {
    const webhook = await prisma.webhook.findUnique({
      where: { id: delivery.webhookId },
      select: { id: true, url: true, secret: true, isActive: true },
    });
    if (!webhook) continue;
    await processDelivery({ ...delivery, webhook });
  }
}

async function processDelivery(delivery: {
  id: string;
  webhookId: string;
  payload: string;
  attempts: number;
  maxAttempts: number;
  webhook: {
    id: string;
    url: string;
    secret: string | null;
    isActive: boolean;
  };
}) {
  const { webhook } = delivery;

  if (!webhook.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', error: 'Webhook is inactive' },
    });
    return;
  }

  const newAttempt = delivery.attempts + 1;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-FlexDocs-Delivery': delivery.id,
    'X-FlexDocs-Event': delivery.payload.includes('"event"')
      ? JSON.parse(delivery.payload).event
      : 'unknown',
  };

  if (webhook.secret) {
    const signature = createHmac('sha256', webhook.secret)
      .update(delivery.payload)
      .digest('hex');
    headers['X-FlexDocs-Signature'] = signature;
  }

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: delivery.payload,
      signal: AbortSignal.timeout(15000),
    });

    const success = response.status >= 200 && response.status < 300;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: newAttempt,
        statusCode: response.status,
        status: success ? 'success' : (newAttempt >= delivery.maxAttempts ? 'failed' : 'retrying'),
        deliveredAt: success ? new Date() : null,
        nextRetryAt: success || newAttempt >= delivery.maxAttempts
          ? null
          : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(newAttempt, RETRY_DELAYS_MS.length - 1)]),
        error: success ? null : `HTTP ${response.status}`,
      },
    });

    if (success) {
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggered: new Date(), lastStatus: response.status },
      });
    }
  } catch (err) {
    const errorMsg = String(err);
    logger.warn('Webhook delivery attempt failed', {
      deliveryId: delivery.id,
      attempt: newAttempt,
      error: errorMsg,
    });

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: newAttempt,
        status: newAttempt >= delivery.maxAttempts ? 'failed' : 'retrying',
        nextRetryAt: newAttempt >= delivery.maxAttempts
          ? null
          : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(newAttempt, RETRY_DELAYS_MS.length - 1)]),
        error: errorMsg,
      },
    });
  }
}
