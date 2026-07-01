import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@flexdocs.io' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@flexdocs.io',
      password: hashedPassword,
    },
  });

  console.log('Created user:', user.email);

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
