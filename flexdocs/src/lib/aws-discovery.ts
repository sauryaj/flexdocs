import { EC2Client, DescribeInstancesCommand, RunInstancesCommand } from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import logger from '@/lib/logger';

interface AwsCreds {
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
  metadata: Record<string, any>;
}

function getClients(creds: AwsCreds) {
  const config = {
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
    region: creds.region || 'us-east-1',
  };
  return {
    ec2: new EC2Client(config),
    s3: new S3Client(config),
    rds: new RDSClient(config),
    ce: new CostExplorerClient(config),
  };
}

export async function discoverEc2(creds: AwsCreds): Promise<DiscoveredResource[]> {
  const clients = getClients(creds);
  const resources: DiscoveredResource[] = [];

  try {
    const command = new DescribeInstancesCommand({});
    const response = await clients.ec2.send(command);

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        const name = instance.Tags?.find((t) => t.Key === 'Name')?.Value || instance.InstanceId!;
        const state = instance.State?.Name || 'unknown';

        resources.push({
          name,
          provider: 'aws',
          service: 'ec2',
          resourceId: instance.InstanceId!,
          region: creds.region || 'us-east-1',
          status: state === 'running' ? 'active' : state,
          metadata: {
            instanceType: instance.InstanceType,
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            launchTime: instance.LaunchTime?.toISOString(),
            state: instance.State?.Name,
            architecture: instance.Architecture,
            platform: instance.Platform,
            tags: instance.Tags || [],
          },
        });
      }
    }
  } catch (err: any) {
    logger.error('EC2 discovery error', { message: err.message });
  }

  return resources;
}

export async function discoverS3(creds: AwsCreds): Promise<DiscoveredResource[]> {
  const clients = getClients(creds);
  const resources: DiscoveredResource[] = [];

  try {
    const command = new ListBucketsCommand({});
    const response = await clients.s3.send(command);

    for (const bucket of response.Buckets || []) {
      let location = creds.region || 'us-east-1';
      try {
        const locCmd = new GetBucketLocationCommand({ Bucket: bucket.Name! });
        const locResp = await clients.s3.send(locCmd);
        location = locResp.LocationConstraint || 'us-east-1';
      } catch { /* fallback to default region */ }

      resources.push({
        name: bucket.Name!,
        provider: 'aws',
        service: 's3',
        resourceId: `arn:aws:s3:::${bucket.Name}`,
        region: location,
        status: 'active',
        metadata: {
          creationDate: bucket.CreationDate?.toISOString(),
        },
      });
    }
  } catch (err: any) {
    logger.error('S3 discovery error', { message: err.message });
  }

  return resources;
}

export async function discoverRds(creds: AwsCreds): Promise<DiscoveredResource[]> {
  const clients = getClients(creds);
  const resources: DiscoveredResource[] = [];

  try {
    const command = new DescribeDBInstancesCommand({});
    const response = await clients.rds.send(command);

    for (const db of response.DBInstances || []) {
      resources.push({
        name: db.DBInstanceIdentifier!,
        provider: 'aws',
        service: 'rds',
        resourceId: db.DBInstanceArn!,
        region: creds.region || 'us-east-1',
        status: db.DBInstanceStatus || 'unknown',
        metadata: {
          engine: db.Engine,
          engineVersion: db.EngineVersion,
          instanceClass: db.DBInstanceClass,
          allocatedStorage: db.AllocatedStorage,
          endpoint: db.Endpoint?.Address,
          port: db.Endpoint?.Port,
          multiAZ: db.MultiAZ,
          vpcId: db.DBSubnetGroup?.VpcId,
        },
      });
    }
  } catch (err: any) {
    logger.error('RDS discovery error', { message: err.message });
  }

  return resources;
}

export async function fetchCosts(
  creds: AwsCreds,
  startDate: string,
  endDate: string,
  groupBy?: string
): Promise<{ amount: number; service: string; period: string }[]> {
  const clients = getClients(creds);
  const costs: { amount: number; service: string; period: string }[] = [];

  try {
    const command = new GetCostAndUsageCommand({
      TimePeriod: { Start: startDate, End: endDate },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    });

    const response = await clients.ce.send(command);

    for (const result of response.ResultsByTime || []) {
      const period = result.TimePeriod?.Start || '';
      for (const group of result.Groups || []) {
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
        const service = group.Keys?.[0] || 'Unknown';
        costs.push({ amount, service, period });
      }
    }
  } catch (err: any) {
    logger.error('Cost Explorer error', { message: err.message });
  }

  return costs;
}
