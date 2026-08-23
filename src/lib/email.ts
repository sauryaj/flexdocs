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

export async function sendEmergencyAccessEmail(
  to: string,
  ownerName: string,
  action: 'requested' | 'approved' | 'revoked',
  delayHours?: number
): Promise<boolean> {
  const subjects: Record<typeof action, string> = {
    requested: `[Action Required] Emergency Access Request from ${ownerName}`,
    approved: `Emergency Access Approved for ${ownerName}`,
    revoked: `Emergency Access Revoked for ${ownerName}`,
  };
  const bodies: Record<typeof action, { html: string; text: string }> = {
    requested: {
      html: `
        <h2>Emergency Access Request</h2>
        <p><strong>${ownerName}</strong> has requested emergency access to their account.</p>
        ${delayHours ? `<p>Access would be granted automatically after a <strong>${delayHours} hour</strong> delay window.</p>` : ''}
        <p>If you did not expect this, contact them or review your emergency access settings.</p>
        <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/settings/emergency-access">Review Emergency Access</a></p>
      `,
      text: `${ownerName} requested emergency access to their account${delayHours ? ` (granted after ${delayHours}h)` : ''}.`,
    },
    approved: {
      html: `
        <h2>Emergency Access Approved</h2>
        <p><strong>${ownerName}</strong> approved your emergency access request.</p>
        ${delayHours ? `<p>Access will be granted after the <strong>${delayHours} hour</strong> delay window.</p>` : ''}
        <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/settings/emergency-access">View Emergency Access</a></p>
      `,
      text: `${ownerName} approved your emergency access request.`,
    },
    revoked: {
      html: `
        <h2>Emergency Access Revoked</h2>
        <p>Your emergency access to <strong>${ownerName}</strong>'s account was revoked.</p>
        <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/settings/emergency-access">View Emergency Access</a></p>
      `,
      text: `Your emergency access to ${ownerName}'s account was revoked.`,
    },
  };
  return sendEmail({ to, subject: subjects[action], ...bodies[action] });
}

export async function sendBreachAlert(
  to: string,
  passwordName: string,
  breachCount: number
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `[URGENT] Password Found in Data Breach: ${passwordName}`,
    html: `
      <h2>Password Breach Alert</h2>
      <p>The password for <strong>${passwordName}</strong> appeared in <strong>${breachCount.toLocaleString()}</strong> known data breach${breachCount === 1 ? '' : 'es'}.</p>
      <p>Please change this password immediately and enable two-factor authentication where available.</p>
      <p><a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/dashboard/passwords">Change Password</a></p>
    `,
    text: `Password for ${passwordName} was found in ${breachCount} breaches. Change it immediately.`,
  });
}
