import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) =>
    line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );
  return { headers, rows };
}

function mapRowToModule(row: string[], headers: string[], module: string): Record<string, any> {
  const data: Record<string, any> = {};
  headers.forEach((h, i) => {
    const val = row[i] || '';
    const key = h.toLowerCase().replace(/\s+/g, '');
    data[key] = val;
  });
  return data;
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { module, data, format, organizationId } = await req.json();

  if (!module || !data) {
    return NextResponse.json({ error: 'module and data required' }, { status: 400 });
  }

  let records: Record<string, any>[] = [];

  if (format === 'csv') {
    const { headers, rows } = parseCsv(data);
    records = rows.map((row) => mapRowToModule(row, headers, module));
  } else if (format === 'json') {
    try {
      const parsed = JSON.parse(data);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'format must be csv or json' }, { status: 400 });
  }

  const created = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      let item: any;

      switch (module) {
        case 'servers':
          item = await prisma.server.create({
            data: {
              name: record.name || record.Name || `Server ${i + 1}`,
              hostname: record.hostname || record.Hostname,
              ipAddress: record.ipaddress || record.ip || record.IP,
              os: record.os || record.OperatingSystem,
              osVersion: record.osversion || record['OS Version'],
              cpu: record.cpu || record.CPU,
              cpuCores: parseInt(record.cpucores || record.Cores) || null,
              ramGB: parseFloat(record.ramgb || record.RAM) || null,
              storageGB: parseFloat(record.storagegb || record.Storage) || null,
              storageType: record.storagetype || record['Storage Type'],
              status: record.status || 'active',
              location: record.location || record.Location,
              serialNumber: record.serialnumber || record['Serial Number'],
              notes: record.notes || record.Notes,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'network':
          item = await prisma.networkDocument.create({
            data: {
              name: record.name || record.Name || `Network ${i + 1}`,
              type: record.type || record.Type || 'ip-schema',
              content: record.content || record.Content || JSON.stringify(record),
              notes: record.notes || record.Notes,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'cloud':
          item = await prisma.cloudResource.create({
            data: {
              name: record.name || record.Name || `Resource ${i + 1}`,
              provider: record.provider || record.Provider || 'aws',
              service: record.service || record.Service || 'unknown',
              resourceId: record.resourceid || record['Resource ID'],
              region: record.region || record.Region,
              status: record.status || 'active',
              cost: parseFloat(record.cost || record.Cost) || null,
              cloudTags: record.tags || record.Tags || '{}',
              notes: record.notes || record.Notes,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        case 'maintenance':
          item = await prisma.maintenanceWindow.create({
            data: {
              name: record.name || record.Name || `Maintenance ${i + 1}`,
              description: record.description || record.Description,
              startTime: new Date(record.starttime || record['Start Time'] || Date.now()),
              endTime: new Date(record.endtime || record['End Time'] || Date.now() + 3600000),
              status: record.status || 'scheduled',
              priority: record.priority || 'medium',
              impact: record.impact || record.Impact,
              organizationId: organizationId || null,
              userId: user.id,
            },
          });
          break;

        default:
          errors.push({ index: i, error: `Unknown module: ${module}` });
          continue;
      }

      if (item) created.push(item);
    } catch (err: any) {
      errors.push({ index: i, error: err.message });
    }
  }

  return NextResponse.json({
    total: records.length,
    created: created.length,
    errors: errors.length,
    errorDetails: errors,
  });
}
