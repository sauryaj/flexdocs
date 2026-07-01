import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { type WebhookEvent } from '@/lib/webhook-events';

export interface WebhookPayload {
  event: string;
  resourceType: string;
  resourceId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function triggerWebhooks(
  userId: string,
  event: WebhookEvent,
  resourceType: string,
  resourceId: string,
  data: Record<string, unknown>
) {
  const webhooks = await prisma.webhook.findMany({
    where: { isActive: true, userId },
  });

  const payload: WebhookPayload = {
    event,
    resourceType,
    resourceId,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const webhook of webhooks) {
    const subscribedEvents: string[] = JSON.parse(webhook.events || '[]');
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(event)) continue;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-FlexDocs-Event': event,
      };

      if (webhook.secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-FlexDocs-Signature'] = signature;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          lastTriggered: new Date(),
          lastStatus: response.status,
        },
      });

      if (!response.ok) {
        logger.warn('Webhook returned non-200', { webhookId: webhook.id, status: response.status });
      }
    } catch (err) {
      logger.error('Webhook delivery failed', { webhookId: webhook.id, error: err });
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggered: new Date(), lastStatus: 0 },
      }).catch(() => {});
    }
  }
}
