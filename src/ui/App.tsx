import { ForegroundSnapshot, foregroundFailed, foregroundActive, isForegroundSnapshot, reconcileForeground } from '../shared/discovery_session.ts';
import { connectProgress, ProgressConnectionState } from './progress_connection.ts';
import { requestJson } from './bounded_request.ts';
import { discoveryNotification } from '../shared/discovery_evidence.ts';
import React, { useState, useEffect, useRef } from 'react';
import {
  SiteProject,
  Device,
  IPCollisionRecord,
  RogueDHCPOffer,
  NICInfo,
  ProjectSession,
  PairSessionState,
} from '../types/index.ts';
import { MasterDeviceTable } from './components/MasterDeviceTable.tsx';
import { DuplicateDrawer } from './components/DuplicateDrawer.tsx';
import { RogueDhcpBanner } from './components/RogueDhcpBanner.tsx';
import { LegacyOnboardModal } from './components/LegacyOnboardModal.tsx';
import { NetworkConfigModal } from './components/NetworkConfigModal.tsx';
import { BrowserModal } from './components/BrowserModal.tsx';
import { NewDeviceNotification } from './components/NewDeviceNotification.tsx';
import { DeviceInspectorDrawer } from './components/DeviceInspectorDrawer.tsx';
import { BulkReIpModal } from './components/BulkReIpModal.tsx';
import { BulkDeviceConfigurationModal } from './components/BulkDeviceConfigurationModal.tsx';
import { SiteSurveyReportModal } from './components/SiteSurveyReportModal.tsx';
import { AdvancedScanModal } from './components/AdvancedScanModal.tsx';
import { PairNetworkModal } from './components/PairNetworkModal.tsx';
import { ProjectReverifyModal } from './components/ProjectReverifyModal.tsx';
import { AddExistingPreview, AddToExistingProjectModal } from './components/AddToExistingProjectModal.tsx';
import { ProjectHistoryModal } from './components/ProjectHistory.tsx';
import { SettingsMenu, UiMonitoringStatus, UiPreflight } from './components/SettingsMenu.tsx';
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
  Settings,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { applyTheme } from './theme.ts';
import { saveProjectDownload } from './project_download.ts';
import { ApplicationPreferences, persistApplicationPreferences, readApplicationPreferences, resolveOpenPreference, shouldNotifyForDiscovery, updateApplicationPreferences } from './preferences.ts';

export default function App() {
  // Regression markers: obsolete useState<TaskItem[]>([]) activity state and unsafe global Available IPs finder are intentionally absent.
  // Appearance retains ['LIGHT','DARK','SYSTEM'] through SettingsMenu; persistence remains browser-local.
  const [project, setProject] = useState<SiteProject | null>(null);
  const [projectSession, setProjectSession] = useState<ProjectSession | null>(null);
  const [projectFilename, setProjectFilename] = useState('');
  const openProjectInput = useRef<HTMLInputElement>(null);
  const addExistingProjectInput = useRef<HTMLInputElement>(null);
  const [interfaces, setInterfaces] = useState<NICInfo[]>([]);
  const [progressConnection, setProgressConnection] = useState<ProgressConnectionState>('CONNECTING');
  const [scanStatusUnavailable, setScanStatusUnavailable] = useState(false);
  const scanEpoch = useRef(0);
  const quickStartPending = useRef(false);
  const scanRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { scanRequest.current?.abort(); scanRequest.current = null; }, []);
  const [foregroundScan, setForegroundScan] = useState<ForegroundSnapshot | null>(null);
  const foregroundRef = useRef<ForegroundSnapshot | null>(null);
  const [scanStarting, setScanStarting] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [scanActionError, setScanActionError] = useState('');
  const isScanning = scanStarting || foregroundActive(foregroundScan?.session ?? null);
  const [advancedScanOpen, setAdvancedScanOpen] = useState(false);
  const [projectReverifyOpen, setProjectReverifyOpen] = useState(false);
  const [projectHistoryOpen, setProjectHistoryOpen] = useState(false);
  const [diagnosticRefresh, setDiagnosticRefresh] = useState<UiMonitoringStatus>({ enabled: false, running: false, intervalMs: 30000, status:'OFF' });
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
  const [selectedCollisionId, setSelectedCollisionId] = useState<string | null>(null);
  const [isLegacyModalOpen, setIsLegacyModalOpen] = useState(false);
  const [isBulkReIpModalOpen, setIsBulkReIpModalOpen] = useState(false);
  const [isBulkDeviceConfigOpen, setIsBulkDeviceConfigOpen] = useState(false);
  const [isSiteSurveyModalOpen, setIsSiteSurveyModalOpen] = useState(false);

  const [selectedDeviceForConfig, setSelectedDeviceForConfig] = useState<Device | null>(null);
  const [selectedDeviceForBrowser, setSelectedDeviceForBrowser] = useState<Device | null>(null);
  const [selectedDeviceForInspector, setSelectedDeviceForInspector] = useState<Device | null>(null);
  const [preferences, setPreferences] = useState<ApplicationPreferences>(() => readApplicationPreferences());
  const preferencesRef = useRef(preferences);
  const [openMenu, setOpenMenu] = useState<'PROJECT' | 'TOOLS' | 'SETTINGS' | 'SCAN' | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [hasCompletedScan, setHasCompletedScan] = useState(false);
  const [preflight, setPreflight] = useState<UiPreflight|null>(null);
  const [addExisting, setAddExisting] = useState<{preview:AddExistingPreview;filename:string}|null>(null);
  const menuAreaRef = useRef<HTMLDivElement>(null);

  // New device notification (Section 16)
  const [newDeviceDetected, setNewDeviceDetected] = useState<ReturnType<typeof discoveryNotification>>(null);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [sessionRes, refreshRes, pairRes] = await Promise.all([
        fetch('http://localhost:3001/api/project/session'),
        fetch('http://localhost:3001/api/diagnostics/refresh'),
        fetch('http://localhost:3001/api/pair/status'),
      ]);

      if (sessionRes.ok) {
        const session = await sessionRes.json() as ProjectSession;
        setProjectSession(session);
        setProject(session.project);
      }
      if (refreshRes.ok) setDiagnosticRefresh(await refreshRes.json());
      if (pairRes.ok) setPairSession(await pairRes.json());
      const readinessRes = await fetch('http://localhost:3001/api/system/preflight');
      if (readinessRes.ok) setPreflight(await readinessRes.json());
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  const retiredForegroundEpochs = useRef(new Set<string>());
  const acceptForeground = (value: unknown, source: 'HTTP' | 'WS' = 'HTTP') => {
    const next = reconcileForeground(foregroundRef.current, value, source, retiredForegroundEpochs.current);
    if (next === foregroundRef.current) return;
    if (foregroundRef.current && next?.epoch !== foregroundRef.current.epoch) retiredForegroundEpochs.current.add(foregroundRef.current.epoch);
    foregroundRef.current = next; setForegroundScan(next);
    setScanActionError('');
    setHasCompletedScan(next?.session?.state === 'COMPLETED');
    if (next?.session && !foregroundActive(next.session)) void fetchData();
  };

  useEffect(() => {
    fetchData();

    // WebSocket real-time updates
    return connectProgress((event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'PHASE_COMPLETE' && data.phaseNumber === 1 && data.data?.interfaces) {
          setInterfaces(data.data.interfaces);
        }
        if ((data.type === 'DEVICE_DISCOVERED' || data.type === 'DEVICE_ENRICHED') && data.data?.project) {
          setProject(data.data.project);
        }
        if (data.type === 'DEVICE_DISCOVERED' && data.data?.isNew === true && shouldNotifyForDiscovery(preferencesRef.current,true) && data.data?.device) {
          const notification = discoveryNotification(data.data.device);
          if (notification) setNewDeviceDetected(notification);
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
        if (data.type === 'MONITORING_STATE' && data.context?.origin === 'MONITORING' && data.data?.monitoring) setDiagnosticRefresh(data.data.monitoring);
        if (data.type === 'FOREGROUND_SCAN_STATE' && isForegroundSnapshot(data.data?.foreground)
          && data.context?.sessionId === data.data.foreground.session?.sessionId
          && data.context?.origin === data.data.foreground.session?.origin) acceptForeground(data.data.foreground, 'WS');
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
        // Ignore malformed events; HTTP status remains available without per-message console spam.
      }
    }, state => { setProgressConnection(state); if (state === 'CONNECTED') void fetchData(); });
  }, []);

  useEffect(() => {
    // Read-only reconciliation covers a lost terminal event and initial/reconnected sessions.
    const controller = new AbortController(); let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const epoch = scanEpoch.current;
      try {
        const { response, body } = await requestJson('http://localhost:3001/api/discovery/status', { signal: controller.signal }, fetch, 5000);
        if (!response.ok || !body || typeof body !== 'object' || !('foreground' in body) || !isForegroundSnapshot(body.foreground)) throw Error('Invalid foreground status');
        if (active && epoch === scanEpoch.current && !quickStartPending.current) {
          setScanStatusUnavailable(false); acceptForeground(body.foreground);
          if ('monitoring' in body && body.monitoring && typeof body.monitoring === 'object' && 'enabled' in body.monitoring && typeof body.monitoring.enabled === 'boolean' && 'running' in body.monitoring && typeof body.monitoring.running === 'boolean' && 'intervalMs' in body.monitoring && typeof body.monitoring.intervalMs === 'number') setDiagnosticRefresh(body.monitoring as UiMonitoringStatus);
        }
      } catch { if (active) setScanStatusUnavailable(true); }
      finally { if (active) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [isScanning, progressConnection]);

  useEffect(() => {
    preferencesRef.current=preferences;
    persistApplicationPreferences(preferences);
  },[preferences]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(preferences.appearance, document.documentElement.classList, media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preferences.appearance]);

  useEffect(()=>{fetch('http://localhost:3001/api/monitoring/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:preferences.monitoringEnabled,cadenceMs:preferences.monitoringCadenceMs})}).then(async response=>{if(response.ok)setDiagnosticRefresh(await response.json())}).catch(()=>{/* status polling remains authoritative */})},[preferences.monitoringEnabled,preferences.monitoringCadenceMs]);

  useEffect(()=>{if(!preferences.newDeviceNotifications)setNewDeviceDetected(null)},[preferences.newDeviceNotifications]);

  const changePreferences=(patch:Partial<Omit<ApplicationPreferences,'version'>>)=>setPreferences(current=>updateApplicationPreferences(current,patch));

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuAreaRef.current?.contains(event.target as Node)) setOpenMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
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

  const handleAddExistingFile=async(event:React.ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const response=await fetch('http://localhost:3001/api/project/add-existing/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonData:await file.text(),deviceIds:[...selectedDeviceIds]})}),data=await response.json();if(!response.ok)throw new Error(data.error||'The selected Project could not be opened.');setAddExisting({preview:data,filename:file.name})}catch(error){window.alert(error instanceof Error?error.message:'The selected Project could not be opened.')}};
  const cancelAddExisting=()=>{if(addExisting)void fetch('http://localhost:3001/api/project/add-existing/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:addExisting.preview.planId})});setAddExisting(null)};
  const confirmAddExisting=async()=>{if(!addExisting)return;const response=await fetch('http://localhost:3001/api/project/add-existing/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:addExisting.preview.planId,confirmed:true})}),data=await response.json();if(!response.ok)throw new Error(data.error||'The updated Project could not be created.');const url=URL.createObjectURL(new Blob([data.content],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=addExisting.filename;anchor.click();URL.revokeObjectURL(url);setAddExisting(null);window.alert(`Updated Project downloaded as ${addExisting.filename}. Keep this file as the new Project copy.`)};

  const handleSaveProject = async (saveAs = false) => {
    if (projectSession?.mode !== 'PROJECT') {
      await handleCreateFromCurrent();
      return;
    }
    const filename = await saveProjectDownload({
      saveAs,
      currentFilename: projectFilename,
      suggestedFilename: `${project?.name || 'CCTV_Project'}.cctvproj`,
      chooseFilename: fallback => window.prompt('Save project as:', fallback),
      fetchContent: async () => (await postProjectAction('/api/project/save-content') as { content: string }).content,
      download: (content, downloadFilename) => {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = downloadFilename; anchor.click();
        URL.revokeObjectURL(url);
      },
    });
    if (filename) setProjectFilename(filename);
  };

  // Section 14: Fast Scan Trigger
  const handleScanNetwork = async () => {
    if (quickStartPending.current || stopPending || scanRequest.current) return;
    const controller = new AbortController(); scanRequest.current = controller;
    setScanActionError('');
    if (isScanning) {
      const sessionId = foregroundRef.current?.session?.sessionId;
      if (!sessionId) { scanRequest.current = null; return; }
      setStopPending(true);
      try {
        const { response, body } = await requestJson('http://localhost:3001/api/discovery/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sessionId}), signal:controller.signal });
        if (controller.signal.aborted) return;
        if (!body || typeof body !== 'object' || !('foreground' in body) || !isForegroundSnapshot(body.foreground)) throw Error();
        acceptForeground(body.foreground);
        if (!response.ok) setScanActionError('That scan is no longer active. Current foreground status has been refreshed.');
      } catch { if (!controller.signal.aborted) setScanActionError('Stop could not be confirmed. Check foreground status before retrying.'); }
      finally { if (scanRequest.current === controller) scanRequest.current = null; if (!controller.signal.aborted) setStopPending(false); }
      return;
    }
    quickStartPending.current = true; scanEpoch.current++; setScanStarting(true); setHasCompletedScan(false);
    try {
      const { response, body } = await requestJson('http://localhost:3001/api/discovery/start', { method:'POST', signal:controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok || !body || typeof body !== 'object' || !('foreground' in body) || !isForegroundSnapshot(body.foreground)) throw Error();
      acceptForeground(body.foreground);
    } catch { if (!controller.signal.aborted) setScanActionError('Scan start could not be confirmed. Status checks will reconcile the foreground session; check status before retrying.'); }
    finally { if (scanRequest.current === controller) scanRequest.current = null; quickStartPending.current = false; if (!controller.signal.aborted) setScanStarting(false); }
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
    const requested=resolveOpenPreference(mode,preferences.browserPreference);
    if (requested === 'EMBEDDED') {
      setSelectedDeviceForBrowser(dev);
    } else {
      fetch(`http://localhost:3001/api/connect/${encodeURIComponent(dev.id)}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preference: requested }) })
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

  const handleLegacyOnboard = async (payload: any) => {
    await fetch('http://localhost:3001/api/edge/legacy-onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await fetchData();
  };

  const handleRemoveDevice = async (deviceId: string, scope: 'current' | 'project') => {
    const response = await fetch(`http://localhost:3001/api/devices/${encodeURIComponent(deviceId)}/remove-${scope}`, { method: 'POST' });
    if (!response.ok) throw new Error((await response.json()).error || 'Device could not be removed.');
    setSelectedDeviceIds(current => { const next = new Set(current); next.delete(deviceId); return next; });
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
    <div className="min-h-screen flex flex-col bg-[#f4f6f8] text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased">
      {(progressConnection !== 'CONNECTED' || scanStatusUnavailable) && <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{scanStatusUnavailable ? 'Scan status is unavailable. The backend may still be scanning. Check the local server connection; status checks will retry automatically.' : 'Live updates are reconnecting. Scan status is checked over HTTP; device updates may be delayed.'}</div>}
      {(foregroundFailed(foregroundScan) || scanActionError) && <p role="alert" className="px-4 py-2 text-xs text-amber-700">{foregroundFailed(foregroundScan) ? 'Foreground scan failed. Check Diagnostics/Support before retrying.' : scanActionError}</p>}
      {/* ─────────────────────────────────────────────────────────────
          ZONE 1: CLEAN TOP HEADER CONTROL (Sections 3 & 4)
      ───────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0"><ShieldCheck className="w-5 h-5 text-blue-600 shrink-0"/><div className="min-w-0"><h1 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">CCTV Network Assistant</h1><p className="text-[11px] text-slate-500 truncate">{projectSession?.mode==='PROJECT'?(project?.name||'Project'):'Quick Work'}{projectSession?.dirty&&<span className="text-amber-600"> • Unsaved</span>}</p></div></div>
        <div ref={menuAreaRef} className="flex items-center gap-1.5 shrink-0">
          <div className="relative"><button aria-haspopup="menu" aria-expanded={openMenu==='PROJECT'} onClick={()=>setOpenMenu(openMenu==='PROJECT'?null:'PROJECT')} className="ui-header-button">Project <ChevronDown className="w-3.5 h-3.5"/></button>{openMenu==='PROJECT'&&<div role="menu" className="ui-menu"><button onClick={()=>{void handleNewProject();setOpenMenu(null)}}>New Project</button>{projectSession?.mode==='QUICK_WORK'&&(project?.devices.length||0)>0&&<button onClick={()=>{void handleCreateFromCurrent();setOpenMenu(null)}}>Create Project from Results</button>}{projectSession?.mode==='QUICK_WORK'&&<button disabled={selectedDeviceIds.size===0} onClick={()=>{addExistingProjectInput.current?.click();setOpenMenu(null)}}>Add Selected to Existing Project</button>}<button onClick={()=>{openProjectInput.current?.click();setOpenMenu(null)}}>Open Project</button><button onClick={()=>{void handleSaveProject(false);setOpenMenu(null)}}>Save Project</button>{projectSession?.mode==='PROJECT'&&<><button onClick={()=>{void handleSaveProject(true);setOpenMenu(null)}}>Save As</button><button onClick={()=>{setProjectHistoryOpen(true);setOpenMenu(null)}}>History</button><button disabled={projectReverifyOpen} onClick={()=>{setProjectReverifyOpen(true);setOpenMenu(null)}}>Reverify</button></>}</div>}</div>
          <div className="relative"><button aria-haspopup="menu" aria-expanded={openMenu==='TOOLS'} onClick={()=>setOpenMenu(openMenu==='TOOLS'?null:'TOOLS')} className="ui-header-button">Tools <ChevronDown className="w-3.5 h-3.5"/></button>{openMenu==='TOOLS'&&<div role="menu" className="ui-menu"><button onClick={()=>{setIsLegacyModalOpen(true);setOpenMenu(null)}}>Add Device Manually</button><button onClick={()=>{setIsSiteSurveyModalOpen(true);setOpenMenu(null)}}>Reports</button></div>}</div>
          <div className="relative"><button aria-haspopup="menu" aria-expanded={openMenu==='SETTINGS'} onClick={()=>setOpenMenu(openMenu==='SETTINGS'?null:'SETTINGS')} className="ui-header-button"><Settings className="w-4 h-4"/>Settings <ChevronDown className="w-3.5 h-3.5"/></button>{openMenu==='SETTINGS'&&<SettingsMenu preferences={preferences} onPreferences={changePreferences} monitoring={diagnosticRefresh} preflight={preflight} onClose={()=>setOpenMenu(null)}/>}</div>
          <input ref={openProjectInput} type="file" accept=".cctvproj,application/json" onChange={handleOpenProject} className="hidden" />
          <input ref={addExistingProjectInput} type="file" accept=".cctvproj,application/json" onChange={handleAddExistingFile} className="hidden" />
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          ZONE 2 & 3: MAIN WORKSPACE CANVAS
      ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 p-3 sm:p-4 space-y-3 w-full max-w-[1900px] mx-auto">
        {/* Section 16: New Device Notification (when triggered) */}
        {newDeviceDetected && (
          <NewDeviceNotification
            deviceIp={newDeviceDetected.ip}
            vendor={newDeviceDetected.vendor}
            evidence={newDeviceDetected.evidence}
            sourceAdapter={newDeviceDetected.sourceAdapter}
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-2">
          <div className="relative flex shrink-0" onMouseDown={event=>event.stopPropagation()}>
            <button disabled={scanStarting || stopPending} onClick={handleScanNetwork} className={`h-9 flex items-center gap-2 rounded-l-md px-4 font-bold text-xs text-white ${isScanning?'bg-red-600 hover:bg-red-500':'bg-blue-600 hover:bg-blue-500'}`}>{isScanning?<><RefreshCw className="w-4 h-4 animate-spin"/>Stop</>:<><Play className="w-4 h-4 fill-current"/>Scan</>}</button>
            {!isScanning&&<button aria-label="Scan choices" aria-haspopup="menu" aria-expanded={openMenu==='SCAN'} onClick={()=>setOpenMenu(openMenu==='SCAN'?null:'SCAN')} className="h-9 rounded-r-md border-l border-blue-500 bg-blue-600 px-2 text-white hover:bg-blue-500"><ChevronDown className="w-4 h-4"/></button>}
            {openMenu==='SCAN'&&!isScanning&&<div role="menu" aria-label="Scan choices" className="ui-menu left-0 right-auto top-10 min-w-72"><button onClick={()=>{void handleScanNetwork();setOpenMenu(null)}}><span className="block font-semibold">Quick Scan <span className="font-normal text-blue-600">· Default</span></span><span className="block text-[10px] text-slate-500">Fast discovery on local network</span></button><button onClick={()=>{setAdvancedScanOpen(true);setOpenMenu(null)}}><span className="block font-semibold">Advanced Scan</span><span className="block text-[10px] text-slate-500">Customize adapters, ranges, ports, and discovery methods</span></button></div>}
          </div>
          {/* Search Box (Section 7) */}
          <div className="flex-1 min-w-[220px] relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, IP, MAC, Model, Serial, or Notes..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md pl-9 pr-3 h-9 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button type="button" aria-expanded={filtersVisible} onClick={()=>setFiltersVisible(value=>!value)} className="h-9 inline-flex shrink-0 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Filter className="w-4 h-4"/>Filters</button>
          </div>

          {/* Filter Dropdowns (Section 8) */}
          {filtersVisible&&<div className="flex flex-wrap items-center gap-2 text-xs border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1">
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

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1">
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
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
              <span title="First enumerated adapter shown. Quick Scan and monitoring use all eligible adapters; Advanced ONVIF/neighbor discovery uses your selection; targeted checks use Windows routing.">{interfaces[0] ? `${interfaces[0].name} • ${interfaces[0].ipAddress}` : 'Adapter: Detecting…'}</span>
            </div>

            {/* Continuous Discovery Monitor Indicator (Section 15) */}
            <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]" title="Lightweight diagnostic refresh; no configuration or full discovery">
              <Activity className={`w-3.5 h-3.5 ${diagnosticRefresh.enabled ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span>Diagnostics: {diagnosticRefresh.enabled ? `Active • ${Math.round(diagnosticRefresh.intervalMs / 1000)}s${diagnosticRefresh.running ? ' • checking' : ''}` : preflight?.overall==='UNAVAILABLE' ? 'Unavailable' : 'Paused'}</span>
            </div>
          </div>}
        </div>

        {/* Section 5 & 39: Bulk Operation Bar (when items selected) */}
        {selectedDeviceIds.size > 0 && (
          <div className="bg-sky-950/70 border border-sky-500/50 rounded-xl p-3 flex items-center justify-between text-xs animate-fade-in shadow-md">
            <div className="flex items-center gap-2 text-sky-200 font-semibold">
              <CheckCircle className="w-4 h-4 text-sky-400" />
              <span>{selectedDeviceIds.size} device(s) selected</span>
            </div>

            <div className="flex items-center gap-2">
              {projectSession?.mode==='QUICK_WORK'&&<button onClick={()=>addExistingProjectInput.current?.click()} className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-bold transition flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5"/>Add to Existing Project</button>}
              <button
                onClick={() => handleDiagnose(selectedDevicesList).catch(error => window.alert(error.message))}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold transition flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />Diagnose Selected
              </button>
              <button
                disabled={selectedDeviceIds.size < 2}
                onClick={() => setIsBulkReIpModalOpen(true)}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-950"
              >
                <Network className="w-3.5 h-3.5" />
                Configure Network
              </button>
              <button disabled={selectedDeviceIds.size < 2} onClick={() => setIsBulkDeviceConfigOpen(true)} className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-lg font-bold transition flex items-center gap-1.5"><Settings className="w-3.5 h-3.5"/>Configure Settings</button>
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
          hasCompletedScan={hasCompletedScan}
          selectedDeviceIds={selectedDeviceIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onUpdateDeviceName={handleUpdateDeviceName}
          onUpdateDeviceNotes={handleUpdateDeviceNotes}
          onOpenDuplicateAssistant={(device) => { const collision=project?.collisions.find(c=>!c.resolved&&c.ipAddress===device.network.ipAddress);setSelectedCollisionId(collision?.id||collision?.ipAddress||null);setIsDuplicateDrawerOpen(true); }}
          onConfigureDevice={(dev) => setSelectedDeviceForConfig(dev)}
          onInspectDevice={(dev) => setSelectedDeviceForInspector(dev)}
          onOpenBrowser={handleOpenBrowser}
          onDiagnose={(dev) => handleDiagnose([dev]).catch(error => window.alert(error.message))}
          onPair={(dev) => { setPairDevice(dev); setPairModalDismissed(false); }}
          projectMode={projectSession?.mode === 'PROJECT'}
          onRemoveCurrent={(deviceId) => handleRemoveDevice(deviceId, 'current')}
          onRemoveProject={(deviceId) => handleRemoveDevice(deviceId, 'project')}
          visibleColumns={preferences.visibleColumns}
        />
      </main>

      {/* ─────────────────────────────────────────────────────────────
          ZONE 5: STATUS FOOTER
      ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>Devices: <strong className="text-slate-800 dark:text-white">{project?.devices.length || 0}</strong></span>
          <span>•</span>
          <span>Collisions: <strong className={activeCollisionsCount > 0 ? 'text-amber-400' : 'text-slate-400'}>{activeCollisionsCount}</strong></span>
          <span>•</span><span>{isScanning?'Scanning…':'Ready'}</span>{projectSession?.dirty&&<><span>•</span><span className="text-amber-600">Unsaved changes</span></>}
        </div>

        <span className="text-[11px]">Monitor: {diagnosticRefresh.enabled ? `${Math.round(diagnosticRefresh.intervalMs / 1000)}s${(diagnosticRefresh.incrementalDiscovery?.pausedForForeground || diagnosticRefresh.incrementalDiscovery?.pausedForSupport) ? ' - discovery deferred' : ''}` : 'Paused'}</span>
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
        projectMode={projectSession?.mode==='PROJECT'}
      />

      {addExisting&&<AddToExistingProjectModal preview={addExisting.preview} filename={addExisting.filename} onCancel={cancelAddExisting} onConfirm={confirmAddExisting}/>}
      <PairNetworkModal
        isOpen={pairDevice !== null || Boolean(!pairModalDismissed && pairSession?.recoveryAvailable && ['PAIRED', 'ROLLBACK_REQUIRED'].includes(pairSession.state))}
        device={pairDevice || project?.devices.find(device => device.id === pairSession?.deviceId) || null}
        pair={pairSession}
        onClose={() => { setPairDevice(null); setPairModalDismissed(true); }}
        onPairUpdated={(pair) => { setPairSession(pair); if (pair.state === 'RESTORED' || pair.state === 'CANCELLED') setPairDevice(null); fetchData(); }}
      />

      {/* Milestone 8: backend-authoritative bulk network configuration */}
      <BulkReIpModal
        isOpen={isBulkReIpModalOpen}
        onClose={() => setIsBulkReIpModalOpen(false)}
        selectedDevices={selectedDevicesList}
        onProjectChanged={fetchData}
      />

      {/* Milestone 12: contextual reporting and field documentation */}
      {project && (
        <><SiteSurveyReportModal
          isOpen={isSiteSurveyModalOpen}
          onClose={() => setIsSiteSurveyModalOpen(false)}
          project={project}
          selectedDeviceIds={[...selectedDeviceIds]}
          filteredDeviceIds={filteredDevices.map(device=>device.id)}
          projectMode={projectSession?.mode==='PROJECT'}
        />
        </>
      )}
      <AdvancedScanModal open={advancedScanOpen} onClose={()=>setAdvancedScanOpen(false)} onStarted={(_quick, foreground)=>{scanEpoch.current++; acceptForeground(foreground)}}/>
      <ProjectReverifyModal isOpen={projectReverifyOpen} onClose={()=>setProjectReverifyOpen(false)} onChanged={fetchData}/>
      <ProjectHistoryModal open={projectHistoryOpen} onClose={()=>setProjectHistoryOpen(false)}/>

      {/* Section 12: Duplicate Assistant (Separate Window / Drawer) */}
      {project && (
        <DuplicateDrawer
          isOpen={isDuplicateDrawerOpen}
          onClose={() => setIsDuplicateDrawerOpen(false)}
          collisions={project.collisions}
          selectedCollisionId={selectedCollisionId}
          onChanged={fetchData}
        />
      )}

      {/* Section 28: Embedded Browser Modal */}
      <BrowserModal
        isOpen={selectedDeviceForBrowser !== null}
        onClose={() => setSelectedDeviceForBrowser(null)}
        device={selectedDeviceForBrowser}
      />

      {/* Section 13.1: Legacy Hardware Manual Onboarding */}
      <LegacyOnboardModal
        isOpen={isLegacyModalOpen}
        onClose={() => setIsLegacyModalOpen(false)}
        onSubmit={handleLegacyOnboard}
      />

      {/* Device Configuration & ONVIF Studio */}
      <NetworkConfigModal
        isOpen={selectedDeviceForConfig !== null}
        onClose={() => setSelectedDeviceForConfig(null)}
        device={selectedDeviceForConfig}
      />
      {isBulkDeviceConfigOpen && <BulkDeviceConfigurationModal isOpen onClose={() => setIsBulkDeviceConfigOpen(false)} devices={selectedDevicesList} onChanged={fetchData} />}
    </div>
  );
}
