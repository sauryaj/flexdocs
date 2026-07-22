'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Server, Shield, Wifi, HardDrive, Cpu, ExternalLink, Globe } from 'lucide-react';

interface NetworkNode {
  id: string;
  name: string;
  type: 'gateway' | 'firewall' | 'switch' | 'server' | 'workstation' | 'access_point';
  ip: string;
  status: 'online' | 'warning' | 'offline';
  connectedTo?: string; // id of parent node
  details?: string;
}

export function NetworkTopologyMap() {
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);

  const nodes: NetworkNode[] = [
    {
      id: 'gw-1',
      name: 'Main Gateway / ISP Fiber',
      type: 'gateway',
      ip: '203.0.113.1',
      status: 'online',
      details: '1Gbps Synchronous Enterprise Fiber Connection',
    },
    {
      id: 'fw-1',
      name: 'FortiGate 60F Firewall',
      type: 'firewall',
      ip: '192.168.1.1',
      status: 'online',
      connectedTo: 'gw-1',
      details: 'Primary Security Gateway & IPsec VPN Hub',
    },
    {
      id: 'sw-1',
      name: 'Core Switch Cisco CBS350 (48-Port)',
      type: 'switch',
      ip: '192.168.1.2',
      status: 'online',
      connectedTo: 'fw-1',
      details: 'PoE+ Managed Core Switch - VLAN 10, 20, 30',
    },
    {
      id: 'srv-1',
      name: 'Primary Domain Controller (DC-01)',
      type: 'server',
      ip: '192.168.1.10',
      status: 'online',
      connectedTo: 'sw-1',
      details: 'Windows Server 2022 - Active Directory & DNS',
    },
    {
      id: 'srv-2',
      name: 'SQL Database Server (DB-01)',
      type: 'server',
      ip: '192.168.1.20',
      status: 'warning',
      connectedTo: 'sw-1',
      details: 'High Memory Usage (92%) - SQL Server 2019',
    },
    {
      id: 'ap-1',
      name: 'UniFi AP Pro (Office Floor 1)',
      type: 'access_point',
      ip: '192.168.1.50',
      status: 'online',
      connectedTo: 'sw-1',
      details: 'Wi-Fi 6 AP - 42 active wireless clients',
    },
    {
      id: 'ws-1',
      name: 'Admin Workstation (WS-DEV01)',
      type: 'workstation',
      ip: '192.168.1.105',
      status: 'online',
      connectedTo: 'sw-1',
      details: 'Windows 11 Enterprise - Wired Port 14',
    },
  ];

  const getNodeIcon = (type: NetworkNode['type']) => {
    switch (type) {
      case 'gateway':
        return <Globe className="w-5 h-5 text-blue-500" />;
      case 'firewall':
        return <Shield className="w-5 h-5 text-red-500" />;
      case 'switch':
        return <Cpu className="w-5 h-5 text-amber-500" />;
      case 'server':
        return <Server className="w-5 h-5 text-indigo-500" />;
      case 'access_point':
        return <Wifi className="w-5 h-5 text-emerald-500" />;
      case 'workstation':
        return <HardDrive className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Visual Network Topology Map ("Network Glue")
          </h2>
          <p className="text-xs text-slate-500">
            Interactive infrastructure mapping & device hierarchy
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-400">Online</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600 dark:text-slate-400">Warning</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-slate-600 dark:text-slate-400">Offline</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Canvas Diagram View */}
        <div className="lg:col-span-2 card p-6 bg-slate-950 border border-slate-800 rounded-xl space-y-6 relative overflow-hidden min-h-[380px]">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

          <div className="relative z-10 space-y-6">
            {/* Level 1: Internet / Gateway */}
            <div className="flex justify-center">
              {nodes
                .filter((n) => n.type === 'gateway')
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-xl border transition-all bg-slate-900/90 text-left flex items-center gap-3 hover:scale-105 ${
                      selectedNode?.id === node.id
                        ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {getNodeIcon(node.type)}
                    <div>
                      <div className="text-xs font-bold text-slate-100">{node.name}</div>
                      <div className="text-[11px] font-mono text-blue-400">{node.ip}</div>
                    </div>
                  </button>
                ))}
            </div>

            {/* Connecting line */}
            <div className="w-0.5 h-6 bg-slate-800 mx-auto" />

            {/* Level 2: Firewall */}
            <div className="flex justify-center">
              {nodes
                .filter((n) => n.type === 'firewall')
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-xl border transition-all bg-slate-900/90 text-left flex items-center gap-3 hover:scale-105 ${
                      selectedNode?.id === node.id
                        ? 'border-red-500 ring-2 ring-red-500/40 shadow-lg shadow-red-500/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {getNodeIcon(node.type)}
                    <div>
                      <div className="text-xs font-bold text-slate-100">{node.name}</div>
                      <div className="text-[11px] font-mono text-red-400">{node.ip}</div>
                    </div>
                  </button>
                ))}
            </div>

            {/* Connecting line */}
            <div className="w-0.5 h-6 bg-slate-800 mx-auto" />

            {/* Level 3: Core Switch */}
            <div className="flex justify-center">
              {nodes
                .filter((n) => n.type === 'switch')
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-xl border transition-all bg-slate-900/90 text-left flex items-center gap-3 hover:scale-105 ${
                      selectedNode?.id === node.id
                        ? 'border-amber-500 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {getNodeIcon(node.type)}
                    <div>
                      <div className="text-xs font-bold text-slate-100">{node.name}</div>
                      <div className="text-[11px] font-mono text-amber-400">{node.ip}</div>
                    </div>
                  </button>
                ))}
            </div>

            {/* Connecting lines */}
            <div className="w-full h-0.5 bg-slate-800 max-w-md mx-auto" />

            {/* Level 4: Devices & Servers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {nodes
                .filter((n) => ['server', 'workstation', 'access_point'].includes(n.type))
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-2.5 rounded-lg border transition-all bg-slate-900/80 text-left hover:scale-105 flex flex-col justify-between ${
                      selectedNode?.id === node.id
                        ? 'border-blue-500 ring-1 ring-blue-500/50'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      {getNodeIcon(node.type)}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          node.status === 'online'
                            ? 'bg-emerald-500'
                            : node.status === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{node.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{node.ip}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Selected Node Details Panel */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Device Inspector
          </h3>

          {selectedNode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  {getNodeIcon(selectedNode.type)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {selectedNode.name}
                  </h4>
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                    {selectedNode.ip}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Device Type:</span>
                  <p className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                    {selectedNode.type.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Status:</span>
                  <div className="mt-0.5">
                    <span
                      className={`badge capitalize ${
                        selectedNode.status === 'online'
                          ? 'badge-green'
                          : selectedNode.status === 'warning'
                          ? 'badge-yellow'
                          : 'badge-red'
                      }`}
                    >
                      {selectedNode.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Description & Notes:</span>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                    {selectedNode.details}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/dashboard/configurations"
                  className="btn-secondary w-full text-xs flex items-center justify-center gap-1.5 py-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Configuration Record
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Cpu className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-xs font-medium">Click any device in the topology map to inspect.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
