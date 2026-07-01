import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

interface DiscoveredResource {
  name: string;
  provider: string;
  service: string;
  resourceId: string;
  region: string;
  status: string;
  cost?: number;
  metadata: Record<string, unknown>;
}

async function discoverEc2(creds: AwsCredentials, region: string): Promise<DiscoveredResource[]> {
  const resources: DiscoveredResource[] = [];
  const regions = [region, ...(region === 'us-east-1' ? ['us-west-2', 'eu-west-1'] : [])];

  const results = await Promise.allSettled(
    regions.map(async (r) => {
      const response = await fetch(
        `https://ec2.${r}.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15`,
        {
          headers: {
            'Authorization': `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${r}/ec2/aws4_request`,
            'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
            'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
          },
        }
      );
      if (!response.ok) return [];
      const text = await response.text();
      const instanceMatch = text.match(/<instanceId>([^<]+)<\/instanceId>/g);
      if (!instanceMatch) return [];
      return instanceMatch.map((match) => ({
        name: `EC2-${match.replace(/<\/?instanceId>/g, '')}`,
        provider: 'aws',
        service: 'ec2',
        resourceId: match.replace(/<\/?instanceId>/g, ''),
        region: r,
        status: 'active',
        metadata: { instanceId: match.replace(/<\/?instanceId>/g, '') },
      }));
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') resources.push(...result.value);
  }
  return resources;
}

async function discoverS3(creds: AwsCredentials): Promise<DiscoveredResource[]> {
  const resources: DiscoveredResource[] = [];
  try {
    const response = await fetch('https://s3.amazonaws.com/', {
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/us-east-1/s3/aws4_request`,
        'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
      },
    });
    if (response.ok) {
      const text = await response.text();
      const bucketMatch = text.match(/<Bucket><Name>([^<]+)<\/Name>/g);
      if (bucketMatch) {
        for (const match of bucketMatch) {
          const name = match.replace(/<\/?[^>]+>/g, '');
          resources.push({
            name, provider: 'aws', service: 's3',
            resourceId: `arn:aws:s3:::${name}`, region: 'us-east-1',
            status: 'active', metadata: { bucketName: name },
          });
        }
      }
    }
  } catch (err) {
    logger.warn('S3 discovery failed', { error: String(err) });
  }
  return resources;
}

async function discoverRds(creds: AwsCredentials): Promise<DiscoveredResource[]> {
  const resources: DiscoveredResource[] = [];
  try {
    const response = await fetch(
      `https://rds.us-east-1.amazonaws.com/?Action=DescribeDBInstances&Version=2014-10-31`,
      {
        headers: {
          'Authorization': `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/us-east-1/rds/aws4_request`,
          'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
        },
      }
    );
    if (response.ok) {
      const text = await response.text();
      const dbMatch = text.match(/<DBInstanceIdentifier>([^<]+)<\/DBInstanceIdentifier>/g);
      if (dbMatch) {
        for (const match of dbMatch) {
          const name = match.replace(/<\/?[^>]+>/g, '');
          resources.push({
            name, provider: 'aws', service: 'rds',
            resourceId: name, region: 'us-east-1',
            status: 'active', metadata: { engine: 'unknown' },
          });
        }
      }
    }
  } catch (err) {
    logger.warn('RDS discovery failed', { error: String(err) });
  }
  return resources;
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider, credentials, organizationId, region } = await req.json();

  if (provider !== 'aws') {
    return NextResponse.json({ error: 'Only AWS is currently supported. Azure/GCP coming soon.' }, { status: 400 });
  }

  const creds: AwsCredentials = credentials;
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    return NextResponse.json({ error: 'Missing accessKeyId or secretAccessKey' }, { status: 400 });
  }

  const [ec2, s3, rds] = await Promise.allSettled([
    discoverEc2(creds, region || 'us-east-1'),
    discoverS3(creds),
    discoverRds(creds),
  ]);

  const discoveredResources: DiscoveredResource[] = [];
  if (ec2.status === 'fulfilled') discoveredResources.push(...ec2.value);
  if (s3.status === 'fulfilled') discoveredResources.push(...s3.value);
  if (rds.status === 'fulfilled') discoveredResources.push(...rds.value);

  // Batch upsert: find existing, create new
  const existingResources = await prisma.cloudResource.findMany({
    where: { userId: user.id, resourceId: { in: discoveredResources.map((r) => r.resourceId) } },
    select: { resourceId: true },
  });
  const existingIds = new Set(existingResources.map((r) => r.resourceId));

  const toCreate = discoveredResources.filter((r) => !existingIds.has(r.resourceId));

  let created: Awaited<ReturnType<typeof prisma.cloudResource.create>>[] = [];
  if (toCreate.length > 0) {
    created = await prisma.$transaction(
      toCreate.map((resource) =>
        prisma.cloudResource.create({
          data: {
            name: resource.name,
            provider: resource.provider,
            service: resource.service,
            resourceId: resource.resourceId,
            region: resource.region,
            status: resource.status,
            cloudTags: JSON.stringify(resource.metadata),
            metadata: JSON.stringify(resource.metadata),
            organizationId: organizationId || null,
            userId: user.id,
          },
        })
      )
    );
  }

  return NextResponse.json({
    discovered: discoveredResources.length,
    created: created.length,
    skipped: discoveredResources.length - created.length,
    resources: created,
  });
}
