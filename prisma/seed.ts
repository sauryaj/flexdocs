import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { bootstrapPassword } from '../src/lib/bootstrap-admin';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@flexdocs.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing ?? await prisma.user.create({
    data: {
      name: 'System Admin', email, role: 'admin',
      password: await bcrypt.hash(bootstrapPassword(), 12),
    },
  });
  console.log(existing ? 'Existing admin preserved' : 'Bootstrap admin created');

  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { name_userId: { name: 'production', userId: user.id } },
      update: {},
      create: { name: 'production', color: '#ef4444', userId: user.id },
    }),
    prisma.tag.upsert({
      where: { name_userId: { name: 'windows', userId: user.id } },
      update: {},
      create: { name: 'windows', color: '#3b82f6', userId: user.id },
    }),
    prisma.tag.upsert({
      where: { name_userId: { name: 'linux', userId: user.id } },
      update: {},
      create: { name: 'linux', color: '#f59e0b', userId: user.id },
    }),
    prisma.tag.upsert({
      where: { name_userId: { name: 'client-a', userId: user.id } },
      update: {},
      create: { name: 'client-a', color: '#10b981', userId: user.id },
    }),
    prisma.tag.upsert({
      where: { name_userId: { name: 'network', userId: user.id } },
      update: {},
      create: { name: 'network', color: '#8b5cf6', userId: user.id },
    }),
  ]);

  console.log('Created tags:', tags.length);

  const skipIfDocExists = await prisma.document.findFirst({
    where: { userId: user.id, title: 'Server Setup Guide' },
  });
  if (!skipIfDocExists) {
    await prisma.document.createMany({
    data: [
      {
        title: 'Server Setup Guide',
        content: '# Server Setup Guide\n\n## Prerequisites\n- Ubuntu 22.04 LTS\n- Root access\n\n## Steps\n1. Update system packages\n2. Install Docker\n3. Configure firewall\n4. Set up monitoring',
        category: 'procedure',
        userId: user.id,
      },
      {
        title: 'Network Topology',
        content: '# Network Topology\n\n## Main Office\n- Subnet: 10.0.0.0/24\n- Gateway: 10.0.0.1\n- DNS: 10.0.0.5, 10.0.0.6\n\n## VPN\n- Type: WireGuard\n- Endpoint: vpn.example.com',
        category: 'network',
        userId: user.id,
      },
      {
        title: 'Incident Response Runbook',
        content: '# Incident Response\n\n## Severity Levels\n- **P1**: Complete outage\n- **P2**: Major feature broken\n- **P3**: Minor issue\n\n## Response Steps\n1. Acknowledge alert\n2. Assess impact\n3. Communicate status\n4. Implement fix\n5. Post-mortem',
        category: 'runbook',
        userId: user.id,
      },
    ],
    });
    console.log('Created sample documents');
  } else {
    console.log('Sample documents already exist, skipping');
  }

  const skipIfPassExists = await prisma.password.findFirst({
    where: { userId: user.id, name: 'Production Server SSH' },
  });
  if (!skipIfPassExists) {
    await prisma.password.createMany({
    data: [
      {
        name: 'Production Server SSH',
        username: 'root',
        password: 'S3cur3P@ssw0rd!',
        url: 'ssh://10.0.0.100',
        category: 'ssh',
        userId: user.id,
      },
      {
        name: 'AWS Console',
        username: 'admin@company.com',
        password: 'Aw$C0ns0l3!2024',
        url: 'https://console.aws.amazon.com',
        category: 'cloud',
        userId: user.id,
      },
      {
        name: 'Office 365 Admin',
        username: 'admin@company.com',
        password: '0ff1c3Adm1n!',
        url: 'https://admin.microsoft.com',
        category: 'email',
        userId: user.id,
      },
    ],
    });
    console.log('Created sample passwords');
  } else {
    console.log('Sample passwords already exist, skipping');
  }

  const skipIfDomainExists = await prisma.domain.findFirst({
    where: { name: 'company.com' },
  });
  if (!skipIfDomainExists) {
    await prisma.domain.createMany({
    data: [
      {
        name: 'company.com',
        registrar: 'Cloudflare',
        nameservers: 'ns1.cloudflare.com\nns2.cloudflare.com',
        expiresAt: new Date('2025-12-15'),
        autoRenew: true,
        status: 'active',
        userId: user.id,
      },
      {
        name: 'client-a.com',
        registrar: 'GoDaddy',
        expiresAt: new Date('2024-08-20'),
        autoRenew: false,
        status: 'active',
        userId: user.id,
      },
      {
        name: 'old-domain.com',
        registrar: 'Namecheap',
        expiresAt: new Date('2024-01-10'),
        autoRenew: false,
        status: 'expired',
        userId: user.id,
      },
    ],
    });
    console.log('Created sample domains');
  } else {
    console.log('Sample domains already exist, skipping');
  }

  // Starter asset layouts so the schema builder isn't empty on fresh installs
  const typeCount = await prisma.flexibleAssetType.count({ where: { userId: user.id } });
  if (typeCount === 0) {
    await prisma.flexibleAssetType.createMany({
      data: [
        {
          name: 'Printer',
          color: '#0ea5e9',
          icon: 'printer',
          userId: user.id,
          fields: JSON.stringify([
            { name: 'Manufacturer', type: 'text', required: true },
            { name: 'Model', type: 'text' },
            { name: 'IP Address', type: 'text' },
            { name: 'Color', type: 'select', options: ['Mono', 'Color'] },
            { name: 'Managed', type: 'checkbox' },
          ]),
        },
        {
          name: 'Software License',
          color: '#8b5cf6',
          icon: 'license',
          userId: user.id,
          fields: JSON.stringify([
            { name: 'Vendor', type: 'text', required: true },
            { name: 'Seats', type: 'number' },
            { name: 'Renewal Date', type: 'date' },
            { name: 'Tier', type: 'select', options: ['Basic', 'Pro', 'Enterprise'] },
          ]),
        },
        {
          name: 'Warranty',
          color: '#f59e0b',
          icon: 'warranty',
          userId: user.id,
          fields: JSON.stringify([
            { name: 'Provider', type: 'text', required: true },
            { name: 'Expires', type: 'date', required: true },
            { name: 'Coverage', type: 'select', options: ['Onsite', 'Depot', 'NBD'] },
            { name: 'Contract URL', type: 'url' },
          ]),
        },
      ],
    });
    console.log('Created starter asset layouts');
  }

  // Global service request templates (used by every tenant in the client portal)
  const existingTemplates = await prisma.serviceRequestTemplate.count();
  if (existingTemplates === 0) {
    const starters = [
      {
        name: 'New User Setup',
        description: 'Everything needed to provision a new employee’s access and hardware.',
        category: 'support',
        priority: 'medium',
        fields: JSON.stringify([
          { key: 'name', label: 'Employee full name', type: 'text', required: true },
          { key: 'role', label: 'Role / department', type: 'text', required: false },
          { key: 'start', label: 'Start date', type: 'text', required: true },
          { key: 'hardware', label: 'Hardware needed', type: 'select', required: true, options: ['Laptop', 'Workstation', 'Both', 'None'] },
          { key: 'apps', label: 'Apps / permissions needed', type: 'textarea', required: false },
        ]),
      },
      {
        name: 'Password Reset',
        description: 'Reset access to a system or account.',
        category: 'support',
        priority: 'medium',
        fields: JSON.stringify([
          { key: 'system', label: 'Which system or account', type: 'text', required: true },
          { key: 'username', label: 'Username (if known)', type: 'text', required: false },
          { key: 'urgent', label: 'Urgent — locked out now', type: 'boolean', required: false },
        ]),
      },
      {
        name: 'Equipment Request',
        description: 'Order new hardware or peripherals.',
        category: 'hardware',
        priority: 'low',
        fields: JSON.stringify([
          { key: 'item', label: 'What do you need', type: 'text', required: true },
          { key: 'qty', label: 'Quantity', type: 'select', required: true, options: ['1', '2', '3', '5+'] },
          { key: 'budget', label: 'Budget owner / PO', type: 'text', required: false },
        ]),
      },
    ];
    for (const t of starters) {
      await prisma.serviceRequestTemplate.create({
        data: { ...t, active: true, userId: user.id },
      });
    }
    console.log('Created starter service request templates');
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
