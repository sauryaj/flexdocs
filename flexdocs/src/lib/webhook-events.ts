export const WEBHOOK_EVENTS = [
  'document.created',
  'document.updated',
  'document.deleted',
  'password.created',
  'password.updated',
  'password.deleted',
  'domain.created',
  'domain.updated',
  'domain.deleted',
  'domain.expiry_warning',
  'asset.created',
  'asset.updated',
  'asset.deleted',
  'checklist.created',
  'checklist.updated',
  'checklist.deleted',
  'ssl.created',
  'ssl.updated',
  'ssl.deleted',
  'user.login',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
