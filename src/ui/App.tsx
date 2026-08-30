import React, { useState, useEffect, useRef } from 'react';
import {
  SiteProject,
  Device,
  IPCollisionRecord,
  RogueDHCPOffer,
  AuditLogEntry,
  NICInfo,
  OnvifCustomConfig,
  ProjectSession,
  PairSessionState,
} from '../types/index.ts';
import { MasterDeviceTable } from './components/MasterDeviceTable.tsx';
import { DuplicateDrawer } from './components/DuplicateDrawer.tsx';
import { RogueDhcpBanner } from './components/RogueDhcpBanner.tsx';
import { LegacyOnboardModal } from './components/LegacyOnboardModal.tsx';
import { AuditReportModal } from './components/AuditReportModal.tsx';
import { DeviceConfigModal } from './components/DeviceConfigModal.tsx';
import { BrowserModal } from './components/BrowserModal.tsx';
import { TaskCenter, TaskItem } from './components/TaskCenter.tsx';
import { NewDeviceNotification } from './components/NewDeviceNotification.tsx';
import { DeviceInspectorDrawer } from './components/DeviceInspectorDrawer.tsx';
import { BulkReIpModal } from './components/BulkReIpModal.tsx';
import { AvailableIpFinderModal } from './components/AvailableIpFinderModal.tsx';
import { SiteSurveyReportModal } from './components/SiteSurveyReportModal.tsx';
import { PairNetworkModal } from './components/PairNetworkModal.tsx';
import { BulkReIpPlanItem } from '../core/engine/bulk_reip.ts';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  FolderOpen,
  Save,
  Layers,
  SlidersHorizontal,
  Plus,
  Play,
  Network,
  Activity,
  CheckCircle,
  HardDrive,
  FileCheck,
  Printer,
  Hash,
  Wrench,
} from 'lucide-react';

export default function App() {
  const [project, setProject] = useState<SiteProject | null>(null);
  const [projectSession, setProjectSession] = useState<ProjectSession | null>(null);
  const [projectFilename, setProjectFilename] = useState('');
  const openProjectInput = useRef<HTMLInputElement>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [interfaces, setInterfaces] = useState<NICInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [diagnosticRefresh, setDiagnosticRefresh] = useState<{ enabled: boolean; running: boolean; intervalMs: number }>({ enabled: false, running: false, intervalMs: 30000 });
  const [pairSession, setPairSession] = useState<PairSessionState | null>(null);
  const [pairDevice, setPairDevice] = useState<Device | null>(null);
  const [pairModalDismissed, setPairModalDismissed] = useState(false);

  // Search & Filters (Sections 7 & 8)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('ALL');

  // Selected devices for bulk operations (Section 39)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());

  // Modals & Drawers
  const [isDuplicateDrawerOpen, setIsDuplicateDrawerOpen] = useState(false);
  const [isLegacyModalOpen, setIsLegacyModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isTaskCenterOpen, setIsTaskCenterOpen] = useState(false);
  const [isBulkReIpModalOpen, setIsBulkReIpModalOpen] = useState(false);
  const [isAvailableIpFinderOpen, setIsAvailableIpFinderOpen] = useState(false);
  const [isSiteSurveyModalOpen, setIsSiteSurveyModalOpen] = useState(false);

  const [selectedDeviceForConfig, setSelectedDeviceForConfig] = useState<Device | null>(null);
  const [selectedDeviceForBrowser, setSelectedDeviceForBrowser] = useState<Device | null>(null);
  const [selectedDeviceForInspector, setSelectedDeviceForInspector] = useState<Device | null>(null);

  // New device notification (Section 16)
  const [newDeviceDetected, setNewDeviceDetected] = useState<{ ip: string; vendor: string } | null>(null);

  // Task Center items (Section 38)
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: 't1', deviceName: 'AXIS Q3538 Dome', operation: 'Reconciled Physical Anchor', status: 'SUCCESS', timestamp: '10:04:12' },
    { id: 't2', deviceName: 'Illustra Flex Gen3', operation: 'Continuous Monitor Ping', status: 'SUCCESS', timestamp: '10:04:22' },
  ]);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [sessionRes, auditRes, refreshRes, pairRes] = await Promise.all([
        fetch('http://localhost:3001/api/project/session'),
        fetch('http://localhost:3001/api/audit-logs'),
        fetch('http://localhost:3001/api/diagnostics/refresh'),
        fetch('http://localhost:3001/api/pair/status'),
      ]);

      if (sessionRes.ok) {
        const session = await sessionRes.json() as ProjectSession;
        setProjectSession(session);
        setProject(session.project);
      }
      if (auditRes.ok) setAuditLogs(await auditRes.json());
      if (refreshRes.ok) setDiagnosticRefresh(await refreshRes.json());
      if (pairRes.ok) setPairSession(await pairRes.json());
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  useEffect(() => {
    fetchData();

    // WebSocket real-time updates
    const ws = new WebSocket('ws://localhost:3001/ws');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'PHASE_COMPLETE' && data.phaseNumber === 1 && data.data?.interfaces) {
          setInterfaces(data.data.interfaces);
        }
        if ((data.type === 'DEVICE_DISCOVERED' || data.type === 'DEVICE_ENRICHED') && data.data?.project) {
          setProject(data.data.project);
        }
        if (data.type === 'DEVICE_DIAGNOSTICS_UPDATED' && data.data?.project) {
          setProject(data.data.project);
          setSelectedDeviceForInspector(current => current?.id === data.data.device?.id ? data.data.device : current);
          if (data.data.refresh) setDiagnosticRefresh(data.data.refresh);
        }
        if (data.type === 'PAIR_STATE_CHANGED') {
          setPairSession(data.data?.pair || null);
          if (data.data?.project) setProject(data.data.project);
        }
        if ((data.type === 'PROJECT_SESSION_CHANGED' || data.type === 'PROJECT_SAVED') && data.data?.session) {
          setProjectSession(data.data.session);
          setProject(data.data.session.project);
        }
        if (data.type === 'SCAN_COMPLETE' || data.type === 'SCAN_CANCELLED' || data.type === 'SCAN_FAILED') {
          setIsScanning(false);
          fetchData();
        }
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

  const postProjectAction = async (path: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(`http://localhost:3001${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Project operation failed.');
    await fetchData();
    return result;
  };

  const handleNewProject = async () => {
    const name = window.prompt('Project/site name:');
    if (!name?.trim()) return;
    const location = window.prompt('Site location (optional):') || '';
    await postProjectAction('/api/project/new', { name, location });
    setProjectFilename('');
  };

  const handleCreateFromCurrent = async () => {
    const name = window.prompt('Project/site name for these results:');
    if (!name?.trim()) return;
    await postProjectAction('/api/project/from-current', { name });
    setProjectFilename('');
  };

  const handleOpenProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await postProjectAction('/api/project/open', { jsonData: await file.text() });
      setProjectFilename(file.name);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveProject = async (saveAs = false) => {
    if (projectSession?.mode !== 'PROJECT') {
      await handleCreateFromCurrent();
      return;
    }
    const result = await postProjectAction('/api/project/save-content') as { filename: string; content: string };
    let filename = projectFilename || result.filename;
    if (saveAs) filename = window.prompt('Save project as:', filename) || filename;
    if (!filename.toLowerCase().endsWith('.cctvproj')) filename += '.cctvproj';
    const url = URL.createObjectURL(new Blob([result.content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
    setProjectFilename(filename);
  };

  // Section 14: Fast Scan Trigger
  const handleScanNetwork = async () => {
    if (isScanning) {
      const stopResponse = await fetch('http://localhost:3001/api/discovery/stop', { method: 'POST' });
      if (!stopResponse.ok && stopResponse.status !== 409) {
        throw new Error(`Unable to stop discovery (${stopResponse.status})`);
      }
      return;
    }

    setIsScanning(true);
    try {
      const response = await fetch('http://localhost:3001/api/discovery/start', { method: 'POST' });
      if (!response.ok) throw new Error(`Unable to start discovery (${response.status})`);
      setTasks((prev) => [
        { id: crypto.randomUUID(), deviceName: 'Eligible IPv4 adapters', operation: 'ONVIF Discovery Started', status: 'RUNNING', timestamp: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    } catch (error) {
      setIsScanning(false);
      throw error;
    }
  };

  // Section 6: Inline Device Name Update
  const handleUpdateDeviceName = async (id: string, newName: string) => {
    const dev = project?.devices.find((d) => d.id === id);
    if (dev) {
      await fetch(`http://localhost:3001/api/device/${encodeURIComponent(dev.id)}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technician: { name: newName } }),
      });
      await fetchData();
    }
  };

  // Section 5: Inline Notes Update
  const handleUpdateDeviceNotes = async (id: string, notes: string) => {
    const dev = project?.devices.find((d) => d.id === id);
    if (dev) {
      await fetch(`http://localhost:3001/api/device/${encodeURIComponent(dev.id)}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technician: { notes } }),
      });
      await fetchData();
    }
  };

  // Section 39: Bulk Selection Handlers
  const handleToggleSelect = (id: string) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedDeviceIds.size === filteredDevices.length) {
      setSelectedDeviceIds(new Set());
    } else {
      setSelectedDeviceIds(new Set(filteredDevices.map((d) => d.id)));
    }
  };

  const handleOpenBrowser = (dev: Device, mode: 'EMBEDDED' | 'EDGE' | 'CHROME' | 'SYSTEM') => {
    if (mode === 'EMBEDDED') {
      setSelectedDeviceForBrowser(dev);
    } else {
      fetch(`http://localhost:3001/api/connect/${encodeURIComponent(dev.id)}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preference: mode }) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (data.browser?.fallback) window.alert('Preferred browser was unavailable; opened with the Windows default browser.'); })
        .catch(error => window.alert(error.message));
    }
  };

  const handleDiagnose = async (devices: Device[]) => {
    const response = await fetch('http://localhost:3001/api/diagnostics/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceIds: devices.map(device => device.id) }),
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Unable to start diagnostics.');
  };

  const handleSaveDeviceConfig = async (
    deviceId: string,
    config: { onvifConfig: OnvifCustomConfig; manufacturerParams: Record<string, any> }
  ) => {
    await fetch(`http://localhost:3001/api/device/${encodeURIComponent(deviceId)}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    await fetchData();
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

  const handleExecuteBulkReIp = async (plan: BulkReIpPlanItem[]) => {
    for (const item of plan) {
      const dev = project?.devices.find((d) => d.anchor.macAddress === item.macAddress);
      if (dev) {
        dev.network.ipAddress = item.targetIp;
        dev.network.subnetMask = item.subnetMask;
        dev.network.gateway = item.gateway;
        dev.status = 'CONFIGURED';
      }
    }
    setTasks((prev) => [
      { id: crypto.randomUUID(), deviceName: `${plan.length} Devices`, operation: 'Bulk Re-IP Sequence Complete', status: 'SUCCESS', timestamp: new Date().toLocaleTimeString() },
      ...prev,
    ]);
    await fetchData();
  };

  // Filtered devices based on search query, status, and device type (Sections 7 & 8)
  const filteredDevices = (project?.devices || []).filter((dev) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (dev.anchor.macAddress || '').toLowerCase().includes(q) ||
      (dev.anchor.onvifEndpointUuid || '').toLowerCase().includes(q) ||
      dev.network.ipAddress.toLowerCase().includes(q) ||
      dev.anchor.vendor.toLowerCase().includes(q) ||
      (dev.anchor.model && dev.anchor.model.toLowerCase().includes(q)) ||
      (dev.anchor.serialNumber && dev.anchor.serialNumber.toLowerCase().includes(q)) ||
      (dev.technician?.name && dev.technician.name.toLowerCase().includes(q)) ||
      (dev.technician?.location && dev.technician.location.toLowerCase().includes(q)) ||
      (dev.technician?.notes && dev.technician.notes.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ONLINE' && (dev.status === 'ONLINE' || dev.status === 'AUTHENTICATED' || dev.status === 'CONFIGURED')) ||
      (statusFilter === 'DUPLICATE' && dev.status === 'COLLISION') ||
      (statusFilter === 'WORKING' && dev.status === 'PROVISIONING') ||
      (statusFilter === 'UNREACHABLE' && (dev.status === 'UNRESPONSIVE' || dev.status === 'UNREACHABLE' || dev.status === 'OFFLINE' || dev.status === 'DIFFERENT_SUBNET'));

    const matchesType =
      deviceTypeFilter === 'ALL' ||
      (deviceTypeFilter === 'CAMERA' && !dev.anchor.vendor.toLowerCase().includes('lenel')) ||
      (deviceTypeFilter === 'ACCESS' && dev.anchor.vendor.toLowerCase().includes('lenel'));

    return matchesSearch && matchesStatus && matchesType;
  });

  const selectedDevicesList = (project?.devices || []).filter((d) => selectedDeviceIds.has(d.id));
  const activeCollisionsCount = project?.collisions.filter((c) => !c.resolved).length || 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased">
      {/* ─────────────────────────────────────────────────────────────
          ZONE 1: CLEAN TOP HEADER CONTROL (Sections 3 & 4)
      ───────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-3 flex items-center justify-between shadow-md">
        {/* Left: App Brand & Operating Mode */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-500 text-slate-950 font-black shadow-md shadow-sky-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-base tracking-wide text-white uppercase">CCTV Technician Tool</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span>{projectSession?.mode === 'PROJECT' ? 'Project:' : 'Mode:'}</span>
              <span className="font-semibold text-slate-200">
                {projectSession?.mode === 'PROJECT' ? project?.name : 'Quick Work'}
                {projectSession?.dirty ? ' • Unsaved' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Primary Scan & Tool Controls */}
        <div className="flex items-center gap-2">
          {/* Section 14: Primary Fast Scan */}
          <button
            onClick={handleScanNetwork}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition shadow-md ${
              isScanning
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-900/30'
            }`}
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                <span>STOP SCAN</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>SCAN NETWORK</span>
              </>
            )}
          </button>

          {/* Section 25: Available IP Finder */}
          <button
            onClick={() => setIsAvailableIpFinderOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Scan for unassigned static IP addresses"
          >
            <Hash className="w-3.5 h-3.5 text-emerald-400" />
            IP Finder (25)
          </button>

          {/* Section 15: Customer Site Survey Report */}
          <button
            onClick={() => setIsSiteSurveyModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Generate printable Customer Site Survey & Sign-Off Report"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-400" />
            Site Survey (15)
          </button>

          {/* Section 3 & 49: Open / Save Project */}
          <button
            onClick={projectSession?.mode === 'QUICK_WORK' && (project?.devices.length || 0) > 0 ? handleCreateFromCurrent : handleNewProject}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title={projectSession?.mode === 'QUICK_WORK' && (project?.devices.length || 0) > 0 ? 'Create a project from current Quick Work results' : 'Create an empty project'}
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            {projectSession?.mode === 'QUICK_WORK' && (project?.devices.length || 0) > 0 ? 'Keep Results' : 'New Project'}
          </button>

          <input ref={openProjectInput} type="file" accept=".cctvproj,application/json" onChange={handleOpenProject} className="hidden" />
          <button
            onClick={() => openProjectInput.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            Open Project
          </button>

          <button
            onClick={() => handleSaveProject(false).catch(error => window.alert(error.message))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            Save Project
          </button>

          {projectSession?.mode === 'PROJECT' && (
            <button
              onClick={() => handleSaveProject(true).catch(error => window.alert(error.message))}
              className="px-2 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Save As"
            >
              Save As
            </button>
          )}

          {projectSession?.mode === 'PROJECT' && (
            <button
              onClick={handleScanNetwork}
              disabled={isScanning}
              className="px-2 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition disabled:opacity-50"
              title="Reverify saved identities with a live discovery scan"
            >
              Reverify
            </button>
          )}

          {/* Section 38: Task Center */}
          <button
            onClick={() => setIsTaskCenterOpen(!isTaskCenterOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition relative"
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Task Center
            <span className="w-2 h-2 rounded-full bg-sky-400" />
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          ZONE 2 & 3: MAIN WORKSPACE CANVAS
      ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 space-y-4 max-w-7xl mx-auto w-full">
        {/* Section 16: New Device Notification (when triggered) */}
        {newDeviceDetected && (
          <NewDeviceNotification
            deviceIp={newDeviceDetected.ip}
            vendor={newDeviceDetected.vendor}
            onView={() => setSearchQuery(newDeviceDetected.ip)}
            onAdd={() => setNewDeviceDetected(null)}
            onIgnore={() => setNewDeviceDetected(null)}
          />
        )}

        {/* Section 13.3 Rogue DHCP Banner (if detected) */}
        {project && <RogueDhcpBanner rogueEvents={project.rogueDhcpEvents} />}
        {pairSession?.recoveryAvailable && ['PAIRED', 'ROLLBACK_REQUIRED'].includes(pairSession.state) && (
          <button onClick={() => { const device = project?.devices.find(item => item.id === pairSession.deviceId) || null; setPairDevice(device); setPairModalDismissed(false); }} className="w-full p-3 rounded-xl border border-amber-600/60 bg-amber-950/40 text-amber-200 text-xs flex items-center justify-center gap-2">
            <Network className="w-4 h-4" />Temporary adapter Pair may be active on {pairSession.originalAdapter.interfaceAlias}. Review or restore original network configuration.
          </button>
        )}

        {/* Workspace Toolbar: Search, Filters & Network Adapter Info (Sections 7, 8, 24) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          {/* Search Box (Section 7) */}
          <div className="flex-1 min-w-[280px] relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, IP, MAC, Model, Serial, or Notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Filter Dropdowns (Section 8) */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900">All Statuses</option>
                <option value="ONLINE" className="bg-slate-900">Online</option>
                <option value="DUPLICATE" className="bg-slate-900">Duplicate IP</option>
                <option value="WORKING" className="bg-slate-900">Working</option>
                <option value="UNREACHABLE" className="bg-slate-900">Unreachable</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-slate-500">Type:</span>
              <select
                value={deviceTypeFilter}
                onChange={(e) => setDeviceTypeFilter(e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900">All Types</option>
                <option value="CAMERA" className="bg-slate-900">Cameras</option>
                <option value="ACCESS" className="bg-slate-900">Access Control</option>
              </select>
            </div>

            {/* Network Adapter Info (Section 24) */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>{interfaces[0]?.name || 'Ethernet'}</span>
              <span className="text-slate-500">({interfaces[0]?.ipAddress || '192.168.1.50'})</span>
            </div>

            {/* Continuous Discovery Monitor Indicator (Section 15) */}
            <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]" title="Lightweight diagnostic refresh; no configuration or full discovery">
              <Activity className={`w-3.5 h-3.5 ${diagnosticRefresh.enabled ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span>Diagnostics: {diagnosticRefresh.enabled ? `${Math.round(diagnosticRefresh.intervalMs / 1000)}s${diagnosticRefresh.running ? ' (checking)' : ''}` : 'Paused'}</span>
            </div>
          </div>
        </div>

        {/* Section 5 & 39: Bulk Operation Bar (when items selected) */}
        {selectedDeviceIds.size > 0 && (
          <div className="bg-sky-950/70 border border-sky-500/50 rounded-xl p-3 flex items-center justify-between text-xs animate-fade-in shadow-md">
            <div className="flex items-center gap-2 text-sky-200 font-semibold">
              <CheckCircle className="w-4 h-4 text-sky-400" />
              <span>{selectedDeviceIds.size} device(s) selected</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDiagnose(selectedDevicesList).catch(error => window.alert(error.message))}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold transition flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />Diagnose Selected
              </button>
              <button
                onClick={() => setIsBulkReIpModalOpen(true)}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-950"
              >
                <Network className="w-3.5 h-3.5" />
                Bulk Re-IP (Section 5)
              </button>
              <button
                onClick={() => setSelectedDeviceIds(new Set())}
                className="px-2.5 py-1 text-slate-400 hover:text-white rounded-lg"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Section 5: Master Device Table */}
        <MasterDeviceTable
          devices={filteredDevices}
          selectedDeviceIds={selectedDeviceIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onUpdateDeviceName={handleUpdateDeviceName}
          onUpdateDeviceNotes={handleUpdateDeviceNotes}
          onOpenDuplicateAssistant={() => setIsDuplicateDrawerOpen(true)}
          onConfigureDevice={(dev) => setSelectedDeviceForConfig(dev)}
          onInspectDevice={(dev) => setSelectedDeviceForInspector(dev)}
          onOpenBrowser={handleOpenBrowser}
          onDiagnose={(dev) => handleDiagnose([dev]).catch(error => window.alert(error.message))}
          onPair={(dev) => { setPairDevice(dev); setPairModalDismissed(false); }}
        />
      </main>

      {/* ─────────────────────────────────────────────────────────────
          ZONE 5: STATUS FOOTER
      ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-900/80 px-6 py-2.5 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>Total Devices: <strong className="text-white">{project?.devices.length || 0}</strong></span>
          <span>•</span>
          <span>Collisions: <strong className={activeCollisionsCount > 0 ? 'text-amber-400' : 'text-slate-400'}>{activeCollisionsCount}</strong></span>
          <span>•</span>
          <span>Mode: <strong className="text-sky-400">{projectSession?.mode === 'PROJECT' ? `Project — ${project?.name}` : 'Quick Work (Session Only)'}</strong></span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsLegacyModalOpen(true)}
            className="hover:text-slate-200 transition flex items-center gap-1 text-[11px]"
          >
            <Plus className="w-3 h-3 text-sky-400" />
            Manual Device (13.1)
          </button>
          <span>•</span>
          <span>CCTV Technician Tool v1.0–v1.6 Consolidated Blueprint</span>
        </div>
      </footer>

      {/* ─────────────────────────────────────────────────────────────
          MODALS, DRAWERS & ZONE 4 INSPECTOR
      ───────────────────────────────────────────────────────────── */}
      {/* Zone 4: Device Inspector Drawer (v1.5 Section 8) */}
      <DeviceInspectorDrawer
        isOpen={selectedDeviceForInspector !== null}
        onClose={() => setSelectedDeviceForInspector(null)}
        device={selectedDeviceForInspector}
        onOpenConfigureModal={(dev) => {
          setSelectedDeviceForInspector(null);
          setSelectedDeviceForConfig(dev);
        }}
        onOpenBrowserModal={(dev) => {
          setSelectedDeviceForBrowser(dev);
        }}
        onDiagnose={(dev) => handleDiagnose([dev]).catch(error => window.alert(error.message))}
      />

      <PairNetworkModal
        isOpen={pairDevice !== null || Boolean(!pairModalDismissed && pairSession?.recoveryAvailable && ['PAIRED', 'ROLLBACK_REQUIRED'].includes(pairSession.state))}
        device={pairDevice || project?.devices.find(device => device.id === pairSession?.deviceId) || null}
        pair={pairSession}
        onClose={() => { setPairDevice(null); setPairModalDismissed(true); }}
        onPairUpdated={(pair) => { setPairSession(pair); if (pair.state === 'RESTORED' || pair.state === 'CANCELLED') setPairDevice(null); fetchData(); }}
      />

      {/* Section 5: Bulk Re-IP Modal with Conflict Audit */}
      <BulkReIpModal
        isOpen={isBulkReIpModalOpen}
        onClose={() => setIsBulkReIpModalOpen(false)}
        selectedDevices={selectedDevicesList}
        onExecuteBatch={handleExecuteBulkReIp}
      />

      {/* Section 25: Available IP Finder Modal */}
      <AvailableIpFinderModal
        isOpen={isAvailableIpFinderOpen}
        onClose={() => setIsAvailableIpFinderOpen(false)}
      />

      {/* Section 15: Customer Site Survey & Sign-Off Report */}
      {project && (
        <SiteSurveyReportModal
          isOpen={isSiteSurveyModalOpen}
          onClose={() => setIsSiteSurveyModalOpen(false)}
          project={project}
        />
      )}

      {/* Section 12: Duplicate Assistant (Separate Window / Drawer) */}
      {project && (
        <DuplicateDrawer
          isOpen={isDuplicateDrawerOpen}
          onClose={() => setIsDuplicateDrawerOpen(false)}
          collisions={project.collisions}
          onResolve={handleResolveCollision}
        />
      )}

      {/* Section 28: Embedded Browser Modal */}
      <BrowserModal
        isOpen={selectedDeviceForBrowser !== null}
        onClose={() => setSelectedDeviceForBrowser(null)}
        device={selectedDeviceForBrowser}
      />

      {/* Section 38: Task Center Window */}
      <TaskCenter
        isOpen={isTaskCenterOpen}
        onClose={() => setIsTaskCenterOpen(false)}
        tasks={tasks}
      />

      {/* Section 13.1: Legacy Hardware Manual Onboarding */}
      <LegacyOnboardModal
        isOpen={isLegacyModalOpen}
        onClose={() => setIsLegacyModalOpen(false)}
        onSubmit={handleLegacyOnboard}
      />

      {/* Section 13.5 & 48: Site Audit & Project Export */}
      {project && (
        <AuditReportModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          project={project}
          auditLogs={auditLogs}
        />
      )}

      {/* Device Configuration & ONVIF Studio */}
      <DeviceConfigModal
        isOpen={selectedDeviceForConfig !== null}
        onClose={() => setSelectedDeviceForConfig(null)}
        device={selectedDeviceForConfig}
        onSave={handleSaveDeviceConfig}
      />
    </div>
  );
}
