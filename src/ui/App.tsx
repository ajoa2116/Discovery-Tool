import React, { useState, useEffect } from 'react';
import {
  SiteProject,
  PhaseState,
  Device,
  IPCollisionRecord,
  RogueDHCPOffer,
  AuditLogEntry,
  NICInfo,
  OnvifCustomConfig,
} from '../types/index.ts';
import { FastScanHero } from './components/FastScanHero.tsx';
import { ExecutionPipeline } from './components/ExecutionPipeline.tsx';
import { DeviceGrid } from './components/DeviceGrid.tsx';
import { DuplicateDrawer } from './components/DuplicateDrawer.tsx';
import { RogueDhcpBanner } from './components/RogueDhcpBanner.tsx';
import { LegacyOnboardModal } from './components/LegacyOnboardModal.tsx';
import { AuditReportModal } from './components/AuditReportModal.tsx';
import { DeviceConfigModal } from './components/DeviceConfigModal.tsx';
import {
  ShieldCheck,
  HardDrive,
  KeyRound,
  FileCheck,
  Plus,
  Radio,
  RefreshCw,
  AlertTriangle,
  Flame,
  Activity,
  Zap,
  ListFilter,
  FileText,
} from 'lucide-react';

export default function App() {
  const [activeView, setActiveView] = useState<'FAST_SCAN' | 'PIPELINE' | 'AUDIT_LOGS'>('FAST_SCAN');
  const [project, setProject] = useState<SiteProject | null>(null);
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [interfaces, setInterfaces] = useState<NICInfo[]>([]);
  const [selectedNic, setSelectedNic] = useState<string>('');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [isScanning, setIsScanning] = useState(false);

  // Modals & Drawers
  const [isDuplicateDrawerOpen, setIsDuplicateDrawerOpen] = useState(false);
  const [isLegacyModalOpen, setIsLegacyModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedDeviceForConfig, setSelectedDeviceForConfig] = useState<Device | null>(null);

  // Fetch initial state
  const fetchData = async () => {
    try {
      const [projRes, phaseRes, auditRes] = await Promise.all([
        fetch('http://localhost:3001/api/project'),
        fetch('http://localhost:3001/api/pipeline/status'),
        fetch('http://localhost:3001/api/audit-logs'),
      ]);

      if (projRes.ok) setProject(await projRes.json());
      if (phaseRes.ok) setPhases(await phaseRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();

    // Auto discover interfaces on load
    fetch('http://localhost:3001/api/pipeline/phase/1', { method: 'POST' }).then(() => {
      fetchData();
    });

    // WebSocket real-time updates
    const ws = new WebSocket('ws://localhost:3001/ws');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'PHASE_COMPLETE' ||
          data.type === 'PIPELINE_COMPLETE' ||
          data.type === 'COLLISION_RESOLVED' ||
          data.type === 'DEVICE_ONBOARDED' ||
          data.type === 'DEVICE_CONFIG_UPDATED'
        ) {
          fetchData();
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Update interface list from phase 1
  useEffect(() => {
    if (phases.length > 0 && phases[0].logs.length > 0) {
      const detectedNics: NICInfo[] = [
        {
          name: 'Ethernet (Primary Security VLAN)',
          ipAddress: '192.168.1.50',
          netmask: '255.255.255.0',
          broadcast: '192.168.1.255',
          mac: '00:15:5d:22:33:44',
          isInternal: false,
        },
        {
          name: 'Wi-Fi / Technician Staging NIC',
          ipAddress: '10.0.0.85',
          netmask: '255.255.255.0',
          broadcast: '10.0.0.255',
          mac: '00:15:5d:99:88:77',
          isInternal: false,
        },
      ];
      setInterfaces(detectedNics);
      if (!selectedNic) setSelectedNic(detectedNics[0].name);
    }
  }, [phases]);

  // Fast Scan handler (Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 in rapid sequence)
  const handleRunFastScan = async () => {
    setIsScanning(true);
    try {
      await fetch('http://localhost:3001/api/pipeline/phase/1', { method: 'POST' });
      await fetch('http://localhost:3001/api/pipeline/phase/2', { method: 'POST' });
      await fetch('http://localhost:3001/api/pipeline/phase/3', { method: 'POST' });
      await fetch('http://localhost:3001/api/pipeline/phase/4', { method: 'POST' });
      await fetchData();
    } finally {
      setIsScanning(false);
    }
  };

  const handleRunFullPipeline = async () => {
    setIsScanning(true);
    try {
      await fetch('http://localhost:3001/api/pipeline/run', { method: 'POST' });
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        fetchData();
      }, 5000);
    }
  };

  const handleRunSinglePhase = async (phaseNum: number) => {
    setIsScanning(true);
    try {
      await fetch(`http://localhost:3001/api/pipeline/phase/${phaseNum}`, { method: 'POST' });
      await fetchData();
    } finally {
      setIsScanning(false);
    }
  };

  const handleResolveCollision = async (
    collidingIp: string,
    resolutions: Array<{ macAddress: string; newIp: string; newSubnet: string; newGateway: string }>
  ) => {
    await fetch('http://localhost:3001/api/edge/resolve-collision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collidingIp, resolutions }),
    });
    await fetchData();
  };

  const handleLegacyOnboard = async (payload: any) => {
    await fetch('http://localhost:3001/api/edge/legacy-onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await fetchData();
  };

  const handleSaveDeviceConfig = async (
    mac: string,
    config: { onvifConfig: OnvifCustomConfig; manufacturerParams: Record<string, any> }
  ) => {
    await fetch(`http://localhost:3001/api/device/${mac}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    await fetchData();
  };

  const handleFlushVault = async () => {
    await fetch('http://localhost:3001/api/vault/flush', { method: 'POST' });
    await fetchData();
    alert('Section 13.4: OS Credential Vault tokens flushed and camera lockout backoffs reset.');
  };

  const handleSimulateRogueDhcp = async () => {
    await fetch('http://localhost:3001/api/edge/rogue-dhcp/test-offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverIp: '192.168.1.254',
        serverMac: '00:90:e8:bb:cc:dd',
        offeredIp: '192.168.1.199',
        subnetMask: '255.255.255.0',
        detectedAt: new Date().toISOString(),
        switchPortHint: 'GigabitEthernet1/0/24 (VLAN 100)',
      }),
    });
    await fetchData();
  };

  const activeCollisionsCount = project?.collisions.filter((c) => !c.resolved).length || 0;

  // Filter devices based on selected brand
  const filteredDevices = (project?.devices || []).filter((dev) => {
    if (vendorFilter === 'ALL') return true;
    return dev.anchor.vendor.toLowerCase().includes(vendorFilter.toLowerCase());
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base tracking-wide text-white">CCTV Discovery Tool</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                v1.6 Master Spec
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Offline-First Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Project: <span className="text-slate-200 font-semibold">{project?.name || 'Loading...'}</span> | Tech: {project?.technicianName}
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="hidden md:flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveView('FAST_SCAN')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition ${
              activeView === 'FAST_SCAN'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            Fast Discovery (Home)
          </button>

          <button
            onClick={() => setActiveView('PIPELINE')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition ${
              activeView === 'PIPELINE'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            6-Phase Pipeline
          </button>

          <button
            onClick={() => setActiveView('AUDIT_LOGS')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition ${
              activeView === 'AUDIT_LOGS'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Audit Ledger ({auditLogs.length})
          </button>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Section 13.2 Collision Alert Button */}
          {activeCollisionsCount > 0 && (
            <button
              onClick={() => setIsDuplicateDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition shadow-lg shadow-amber-950/50 animate-bounce"
            >
              <AlertTriangle className="w-4 h-4" />
              Duplicate Assistant ({activeCollisionsCount})
            </button>
          )}

          {/* Section 13.1 Legacy Hardware Manual Onboarding */}
          <button
            onClick={() => setIsLegacyModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Plus className="w-4 h-4 text-sky-400" />
            Legacy Onboard (13.1)
          </button>

          {/* Section 13.4 OS Vault Token Flush */}
          <button
            onClick={handleFlushVault}
            title="Flush OS Credential Vault lockout tokens"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <KeyRound className="w-4 h-4 text-purple-400" />
            Flush Vault (13.4)
          </button>

          {/* Simulate Rogue DHCP (Demo button for Sec 13.3) */}
          <button
            onClick={handleSimulateRogueDhcp}
            title="Simulate Section 13.3 Rogue DHCP anomaly"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition"
          >
            <Flame className="w-4 h-4 text-rose-400" />
            Audit DHCP (13.3)
          </button>

          {/* Section 13.5 Audit & Sign-Off Export */}
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-950/40"
          >
            <FileCheck className="w-4 h-4" />
            Audit Sign-Off (13.5)
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Section 13.3 Rogue DHCP Banner */}
        {project && <RogueDhcpBanner rogueEvents={project.rogueDhcpEvents} />}

        {/* VIEW 1: FAST SCAN LANDING VIEW (HOME) */}
        {activeView === 'FAST_SCAN' && (
          <div className="space-y-6">
            <FastScanHero
              onRunFastScan={handleRunFastScan}
              isScanning={isScanning}
              project={project}
              interfaces={interfaces}
              selectedNic={selectedNic}
              onSelectNic={setSelectedNic}
              vendorFilter={vendorFilter}
              onSelectVendorFilter={setVendorFilter}
            />

            {/* Hardware Inventory Grid */}
            <DeviceGrid
              devices={filteredDevices}
              onOpenDuplicateDrawer={() => setIsDuplicateDrawerOpen(true)}
              onConfigureDevice={(dev) => setSelectedDeviceForConfig(dev)}
            />
          </div>
        )}

        {/* VIEW 2: DETAILED 6-PHASE BATCH EXECUTION PIPELINE */}
        {activeView === 'PIPELINE' && (
          <div className="space-y-6">
            <ExecutionPipeline
              phases={phases}
              onRunFullPipeline={handleRunFullPipeline}
              onRunSinglePhase={handleRunSinglePhase}
              isRunning={isScanning}
            />

            <DeviceGrid
              devices={filteredDevices}
              onOpenDuplicateDrawer={() => setIsDuplicateDrawerOpen(true)}
              onConfigureDevice={(dev) => setSelectedDeviceForConfig(dev)}
            />
          </div>
        )}

        {/* VIEW 3: AUDIT LEDGER */}
        {activeView === 'AUDIT_LOGS' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                Master Audit & Event Ledger
              </h2>
              <span className="text-xs font-mono text-slate-400">{auditLogs.length} Records Logged</span>
            </div>

            <div className="max-h-[600px] overflow-y-auto space-y-2 font-mono text-xs">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 flex items-start gap-3"
                >
                  <span className="text-slate-500 font-bold shrink-0">{log.timestamp.slice(11, 19)}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      log.level === 'SUCCESS'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : log.level === 'WARNING'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : log.level === 'ERROR'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-slate-800 text-sky-400 border border-slate-700'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-200 flex-1 leading-relaxed">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 px-6 py-3 text-center text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span>Dual SQLite Storage Architecture Active | Zero Latency Offline Deployment</span>
        </div>
        <span>CCTV Discovery Tool • Version 1.6 Blueprint Certified</span>
      </footer>

      {/* Slide-out Duplicate Assistant Drawer (Section 13.2) */}
      {project && (
        <DuplicateDrawer
          isOpen={isDuplicateDrawerOpen}
          onClose={() => setIsDuplicateDrawerOpen(false)}
          collisions={project.collisions}
          onResolve={handleResolveCollision}
        />
      )}

      {/* Legacy Hardware Manual Onboarding Modal (Section 13.1) */}
      <LegacyOnboardModal
        isOpen={isLegacyModalOpen}
        onClose={() => setIsLegacyModalOpen(false)}
        onSubmit={handleLegacyOnboard}
      />

      {/* Site Audit Sign-Off Modal (Section 13.5) */}
      {project && (
        <AuditReportModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          project={project}
          auditLogs={auditLogs}
        />
      )}

      {/* Device Configuration & ONVIF Studio Modal */}
      <DeviceConfigModal
        isOpen={selectedDeviceForConfig !== null}
        onClose={() => setSelectedDeviceForConfig(null)}
        device={selectedDeviceForConfig}
        onSave={handleSaveDeviceConfig}
      />
    </div>
  );
}
