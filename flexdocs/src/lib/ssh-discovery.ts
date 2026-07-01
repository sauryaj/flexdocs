import { Client } from 'ssh2';

interface SshConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

interface ServerSpecs {
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  cpu: string;
  cpuCores: number;
  ramGB: number;
  storageGB: number;
  storageType: string;
  ipAddress: string;
  macAddress?: string;
  uptime: number;
  loadAverage: number[];
  diskUsage: { mount: string; used: number; total: number; percent: number }[];
  runningServices: string[];
  networkInterfaces: { name: string; ip: string; mac: string }[];
  dockerContainers?: { name: string; image: string; status: string }[];
}

function runCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (data: Buffer) => { output += data.toString(); });
      stream.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      stream.on('close', () => resolve(output.trim()));
    });
  });
}

export async function discoverServer(config: SshConfig): Promise<ServerSpecs> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', async () => {
      try {
        const hostname = (await runCommand(conn, 'hostname')).split('\n')[0];
        const os = (await runCommand(conn, 'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'')).replace(/\n/g, '') || 'Unknown';
        const osVersion = (await runCommand(conn, 'cat /etc/os-release 2>/dev/null | grep VERSION_ID | cut -d= -f2 | tr -d \'"\'')).replace(/\n/g, '') || '';
        const kernel = (await runCommand(conn, 'uname -r')).split('\n')[0];

        const cpuModel = (await runCommand(conn, 'grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs')).split('\n')[0] || 'Unknown';
        const cpuCores = parseInt(await runCommand(conn, 'nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1')) || 1;

        const ramKb = parseInt(await runCommand(conn, 'grep MemTotal /proc/meminfo 2>/dev/null | awk \'{print $2}\' || sysctl -n hw.memsize 2>/dev/null')) || 0;
        const ramGB = Math.round(ramKb / 1048576) || Math.round(parseInt(await runCommand(conn, 'sysctl -n hw.memsize 2>/dev/null || echo 0')) / 1073741824) || 0;

        const storageGB = parseInt(await runCommand(conn, 'df -BG / | tail -1 | awk \'{print $2}\' | tr -d G')) || 0;

        const ipAddress = (await runCommand(conn, "hostname -I 2>/dev/null | awk '{print $1}' || ifconfig 2>/dev/null | grep 'inet ' | grep -v 127.0.0.1 | awk '{print $2}' | head -1")).split('\n')[0] || '';

        const uptime = parseInt(await runCommand(conn, "awk '{print int($1)}' /proc/uptime 2>/dev/null || sysctl -n kern.boottime 2>/dev/null")) || 0;

        const loadStr = await runCommand(conn, 'cat /proc/loadavg 2>/dev/null | cut -d" " -f1-3 || sysctl -n vm.loadavg 2>/dev/null');
        const loadAverage = loadStr.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n)).slice(0, 3);

        const diskOutput = await runCommand(conn, 'df -BG / 2>/dev/null | tail -1');
        const diskParts = diskOutput.split(/\s+/);
        const diskUsage = [{
          mount: '/',
          total: parseInt(diskParts[1]) || 0,
          used: parseInt(diskParts[2]) || 0,
          percent: parseInt(diskParts[4]) || 0,
        }];

        const services = await runCommand(conn, 'systemctl list-units --type=service --state=running --no-pager 2>/dev/null | awk \'NR>1{print $1}\' | head -20 || ps aux 2>/dev/null | awk \'NR>1{print $11}\' | sort -u | head -20');
        const runningServices = services.split('\n').filter(Boolean);

        const netOutput = await runCommand(conn, "ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | grep -v lo || ifconfig 2>/dev/null | grep 'flags' | awk '{print $1}' | tr -d ':'");
        const networkInterfaces = [];
        for (const iface of netOutput.split('\n').filter(Boolean).slice(0, 5)) {
          const ip = (await runCommand(conn, `ip addr show ${iface} 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 || ifconfig ${iface} 2>/dev/null | grep 'inet ' | awk '{print $2}'`)).split('\n')[0] || '';
          const mac = (await runCommand(conn, `ip link show ${iface} 2>/dev/null | grep 'link/ether' | awk '{print $2}' || ifconfig ${iface} 2>/dev/null | grep 'ether' | awk '{print $2}'`)).split('\n')[0] || '';
          if (ip || mac) networkInterfaces.push({ name: iface, ip, mac });
        }

        let dockerContainers: { name: string; image: string; status: string }[] | undefined;
        const dockerCheck = await runCommand(conn, 'docker ps 2>/dev/null | wc -l');
        if (parseInt(dockerCheck) > 1) {
          const containers = await runCommand(conn, 'docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" 2>/dev/null');
          dockerContainers = containers.split('\n').filter(Boolean).map((line) => {
            const [name, image, status] = line.split('|');
            return { name: name || '', image: image || '', status: status || '' };
          });
        }

        conn.end();

        resolve({
          hostname,
          os,
          osVersion,
          kernel,
          cpu: cpuModel,
          cpuCores,
          ramGB,
          storageGB,
          storageType: 'unknown',
          ipAddress,
          uptime,
          loadAverage,
          diskUsage,
          runningServices,
          networkInterfaces,
          dockerContainers,
        });
      } catch (err) {
        conn.end();
        reject(err);
      }
    });

    conn.on('error', reject);

    conn.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      passphrase: config.passphrase,
      readyTimeout: 10000,
      algorithms: {
        kex: [
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
        ],
      },
    });
  });
}

export async function discoverMultipleServers(
  targets: SshConfig[]
): Promise<{ config: SshConfig; specs: ServerSpecs | null; error?: string }[]> {
  const results: { config: SshConfig; specs: ServerSpecs | null; error?: string }[] = [];

  for (const target of targets) {
    try {
      const specs = await discoverServer(target);
      results.push({ config: target, specs });
    } catch (err: any) {
      results.push({ config: target, specs: null, error: err.message });
    }
  }

  return results;
}
