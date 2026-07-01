import nodemailer from 'nodemailer';
import logger from '@/lib/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'FlexDocs <noreply@flexdocs.local>',
      ...options,
    });
    logger.info('Email sent', { to: options.to, subject: options.subject });
    return true;
  } catch (err) {
    logger.error('Email send failed', { to: options.to, error: err });
    return false;
  }
}

export async function sendDomainExpiryAlert(
  to: string,
  domainName: string,
  daysUntilExpiry: number
): Promise<boolean> {
  const urgency = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 30 ? 'Warning' : 'Notice';
  return sendEmail({
    to,
    subject: `[${urgency}] Domain Expiring: ${domainName}`,
    html: `
      <h2>Domain Expiry ${urgency}</h2>
      <p>Your domain <strong>${domainName}</strong> will expire in <strong>${daysUntilExpiry} days</strong>.</p>
      <p>Please renew or transfer the domain before it expires.</p>
      <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/domains">Manage Domains</a></p>
    `,
    text: `Domain ${domainName} expires in ${daysUntilExpiry} days. Please take action.`,
  });
}

export async function sendPasswordRotationReminder(
  to: string,
  passwordName: string,
  lastUpdated: string
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `[Notice] Password Rotation Reminder: ${passwordName}`,
    html: `
      <h2>Password Rotation Reminder</h2>
      <p>The password <strong>${passwordName}</strong> was last updated on <strong>${lastUpdated}</strong>.</p>
      <p>Consider rotating this password for security best practices.</p>
      <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/passwords">Manage Passwords</a></p>
    `,
    text: `Password ${passwordName} was last updated on ${lastUpdated}. Consider rotating.`,
  });
}
