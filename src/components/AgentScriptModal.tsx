'use client';

import { useState } from 'react';
import { Terminal, Copy, Check, X, ShieldCheck } from 'lucide-react';

interface AgentScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
}

export function AgentScriptModal({ isOpen, onClose, organizationId }: AgentScriptModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const scriptText = `# Flexdocs RMM PowerShell Discovery & Telemetry Agent
$orgId = "${organizationId || 'SELECT_ORG_ID'}"
$endpoint = "http://localhost:3000/api/ingest/agent"

$os = (Get-CimInstance Win32_OperatingSystem).Caption
$cs = Get-CimInstance Win32_ComputerSystem
$proc = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS
$net = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Select-Object -First 1

$payload = @{
    organizationId = $orgId
    hostname       = $env:COMPUTERNAME
    ipAddress      = $net.IPAddress
    os             = $os
    cpu            = $proc.Name
    ramGb          = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
    serialNumber   = $bios.SerialNumber
    status         = "active"
} | ConvertTo-Json

Invoke-RestMethod -Uri $endpoint -Method POST -Body $payload -ContentType "application/json"
Write-Host "Hardware telemetry successfully pushed to Flexdocs!" -ForegroundColor Green`;

  const copyScript = () => {
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-base">PowerShell Asset Discovery Script</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Run this PowerShell script on any Windows Server, workstation, or domain controller to automatically ingest its hardware specs, serial number, IP address, and OS into Flexdocs Configurations.
        </p>

        <div className="relative">
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-64 leading-relaxed select-all">
            {scriptText}
          </pre>
          <button
            onClick={copyScript}
            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-md transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Script'}
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 text-xs text-slate-500 border-t border-slate-800">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Endpoint: <code className="text-slate-300 font-mono">POST /api/ingest/agent</code>
          </span>
          <button onClick={onClose} className="btn-secondary text-xs px-4 py-1.5">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
