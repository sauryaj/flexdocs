import Docker from 'dockerode';
import { existsSync } from 'fs';

interface DockerHostInfo {
  name: string;
  endpoint: string;
  type: 'docker' | 'docker-swarm';
  version: string;
  containers: number;
  images: number;
  networks: number;
  volumes: number;
  metadata: Record<string, unknown>;
}

interface DockerContainerInfo {
  containerId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: { private: number; public?: number; type: string }[];
  networkMode: string;
  ip: string;
  mounts: { source: string; destination: string; mode: string }[];
}

const SOCKET_PATHS = [
  '/var/run/docker.sock',
  `${process.env.HOME || '/root'}/.colima/default/docker.sock`,
  `${process.env.HOME || '/root'}/.docker/run/docker.sock`,
];

function resolveSocketPath(endpoint?: string): string {
  if (endpoint) return endpoint;
  for (const p of SOCKET_PATHS) {
    if (existsSync(p)) return p;
  }
  return SOCKET_PATHS[0];
}

export async function discoverDockerHost(endpoint?: string): Promise<DockerHostInfo> {
  const socketPath = resolveSocketPath(endpoint);
  const docker = new Docker({ socketPath });

  const info = await docker.info();
  const version = await docker.version();

  const containers = await docker.listContainers({ all: true });
  const images = await docker.listImages();
  const networks = await docker.listNetworks();
  const volumes = await docker.listVolumes();

  return {
    name: info.Name,
    endpoint: socketPath,
    type: info.Swarm?.LocalNodeState === 'active' ? 'docker-swarm' : 'docker',
    version: version.Version,
    containers: containers.length,
    images: images.length,
    networks: networks.length,
    volumes: volumes.Volumes?.length || 0,
    metadata: {
      operatingSystem: info.OperatingSystem,
      osType: info.OSType,
      architecture: info.Architecture,
      totalMemory: info.MemTotal,
      cpus: info.NCPU,
      dockerRootDir: info.DockerRootDir,
      kernelVersion: info.KernelVersion,
      serverVersion: info.ServerVersion,
    },
  };
}

export async function discoverDockerContainers(endpoint?: string): Promise<DockerContainerInfo[]> {
  const socketPath = resolveSocketPath(endpoint);
  const docker = new Docker({ socketPath });

  const containers = await docker.listContainers({ all: true });
  const result: DockerContainerInfo[] = [];

  for (const container of containers) {
    try {
      const detail = await docker.getContainer(container.Id).inspect();
      result.push({
        containerId: container.Id.substring(0, 12),
        name: container.Names[0]?.replace(/^\//, '') || '',
        image: container.Image,
        status: container.Status,
        state: container.State,
        ports: (container.Ports || []).map((p) => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type,
        })),
        networkMode: detail.HostConfig?.NetworkMode || '',
        ip: (detail.NetworkSettings?.Networks && Object.values(detail.NetworkSettings.Networks)[0])?.IPAddress || '',
        mounts: (detail.Mounts || []).map((m) => ({
          source: m.Source || '',
          destination: m.Destination || '',
          mode: m.Mode || '',
        })),
      });
    } catch {
      result.push({
        containerId: container.Id.substring(0, 12),
        name: container.Names[0]?.replace(/^\//, '') || '',
        image: container.Image,
        status: container.Status,
        state: container.State,
        ports: [],
        networkMode: '',
        ip: '',
        mounts: [],
      });
    }
  }

  return result;
}
