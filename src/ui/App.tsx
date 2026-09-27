import {SelectedDeviceActions} from './components/SelectedDeviceActions.tsx';
import { isActiveCollision } from '../shared/collision_state.ts';
import { isAdapterCollection } from '../shared/advanced_scan_contract.ts';
import { prefixMask } from '../shared/address_validation.ts';
import { AttentionActions } from './components/AttentionActions.tsx';
import { activeCollisionChoices, diagnosticPresentation, DiagnosticRequest, hasUnsavedAttention } from '../shared/technician_attention.ts';
import { TaskSnapshot } from '../shared/tasks.ts';
import {ReportSetPanel} from './components/ReportSetPanel.tsx';
import {ReportSetSnapshot} from '../shared/report_set.ts';
import { Tasks } from './components/Tasks.tsx';
import { NetworkAdapterModal } from './components/NetworkAdapterModal.tsx';
import { pairAdapterInterfaces } from '../shared/pair_adapter.ts';
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
import { collisionKeyForDevice } from '../shared/duplicate_assistant.ts';
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
import { SettingsMenu, isUiPreflight, UiMonitoringStatus, UiPreflight } from './components/SettingsMenu.tsx';
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
  const [adapterInspected,setAdapterInspected]=useState(false);
  const [networkAdapterOpen,setNetworkAdapterOpen]=useState(false);
  const currentPairRef = useRef<PairSessionState | null>(null);
  const acceptPair = (pair:PairSessionState|null) => { const changed=JSON.stringify(currentPairRef.current)!==JSON.stringify(pair);currentPairRef.current=pair;setPairSession(pair);if(changed)setInterfaces(value=>pairAdapterInterfaces(value,pair)); };
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
  const [diagnosticRefresh, setDiagnosticRefresh] = useState<UiMonitoringStatus>({ enabled: false, running: false, intervalMs: 30000, status:'UNAVAILABLE' });
  const [pairSession, setPairSession] = useState<PairSessionState | null>(null);
  const [pairTaskOpen,setPairTaskOpen]=useState(false);
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
  const [diagnosticsFocus,setDiagnosticsFocus]=useState(0);
  const [diagnosticRequests,setDiagnosticRequests]=useState<Record<string,DiagnosticRequest>>({});
  const [taskSnapshot,setTaskSnapshot]=useState<TaskSnapshot&{unavailable?:boolean}>({tasks:[],active:0,attention:0});
  const [taskNavigation,setTaskNavigation]=useState({open:false,revision:0,taskId:undefined as string|undefined});
  const [attentionAction,setAttentionAction]=useState<'COLLISIONS'|'SAVE'|null>(null);
  const diagnosePending=useRef(new Set<string>());
  const [reportSet,setReportSet]=useState<ReportSetSnapshot>({members:[]});
  const [reportSetOpen,setReportSetOpen]=useState(false),[reportSetError,setReportSetError]=useState('');
  const [reportScope,setReportScope]=useState<'REPORT_SET'|'SELECTED'|undefined>();
  const reportReadRevision=useRef(0);
  const loadReportSet=async()=>{
    const revision=++reportReadRevision.current;
    try{const {response,body}=await requestJson('http://localhost:3001/api/report-set',{},fetch,5000);if(!response.ok||!Array.isArray((body as ReportSetSnapshot)?.members))throw Error();if(revision===reportReadRevision.current){setReportSet(body as ReportSetSnapshot);setReportSetError('');}return body as ReportSetSnapshot;}
    catch{if(revision===reportReadRevision.current)setReportSetError('Report Set is unavailable. Retained members have not been cleared.');}
  };
  useEffect(()=>{void loadReportSet();},[project,reportSetOpen]);
  const openReports=async()=>{
    const current=await loadReportSet();
    if(!current){window.alert('Report Set status is unavailable. Retry before choosing report membership.');return;}
    setReportScope(current.members.length?'REPORT_SET':undefined);setIsSiteSurveyModalOpen(true);
  };
  const updateReportSet=async(action:'add'|'remove'|'clear',body:unknown)=>{
    ++reportReadRevision.current;
    const result=await requestJson(`http://localhost:3001/api/report-set/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},fetch,10000);
    if(!result.response.ok||!Array.isArray((result.body as ReportSetSnapshot)?.members))throw Error('Report membership could not be updated. Select devices with unambiguous established identities and retry.');
    ++reportReadRevision.current;setReportSet(result.body as ReportSetSnapshot);setReportSetError('');
  };


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
    const pairAtRequest = currentPairRef.current;
    try {
      const [sessionRes, refreshRes, pairRes] = await Promise.all([
        fetch('http://localhost:3001/api/project/session'),
        fetch('http://localhost:3001/api/diagnostics/refresh'),
        fetch('http://localhost:3001/api/pair/status'),
      ]);

      if (sessionRes.ok) {
        const session = await sessionRes.json() as ProjectSession;
        if(pairAtRequest===currentPairRef.current){setProjectSession(session);setProject(session.project);}
      }
      if (refreshRes.ok) setDiagnosticRefresh(await refreshRes.json());
      if (pairRes.ok) { const pair=await pairRes.json();if(pairAtRequest===currentPairRef.current)acceptPair(pair); }
      const readinessRes = await fetch('http://localhost:3001/api/system/preflight');
      const readiness=readinessRes.ok?await readinessRes.json():null;
      const valid=isUiPreflight(readiness);
      setPreflight(valid?readiness:{overall:'UNAVAILABLE',version:'1.6.0',runtime:'Unavailable',checks:[]});
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  useEffect(()=>{
    const controller=new AbortController(),pairAtRequest=currentPairRef.current;
    void requestJson('http://localhost:3001/api/pair/adapters',{signal:controller.signal},fetch,10000).then(({response,body})=>{
      if(!response.ok||!isAdapterCollection(body))return;
      if(!controller.signal.aborted&&pairAtRequest===currentPairRef.current)setInterfaces(current=>pairAdapterInterfaces(body.flatMap(adapter=>adapter.ipv4Addresses.map(address=>({name:adapter.interfaceAlias,interfaceIndex:adapter.interfaceIndex,ipAddress:address.address,netmask:prefixMask(address.prefixLength),broadcast:'',mac:'',isInternal:false}))),currentPairRef.current));
    }).catch(()=>{/* No invented adapter values; the badge reports unavailable. */}).finally(()=>{if(!controller.signal.aborted)setAdapterInspected(true)});
    return()=>controller.abort();
  },[progressConnection]);

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
        if(data.data?.currentListSuppression)setProjectSession(current=>current?{...current,currentListSuppression:data.data.currentListSuppression}:current);
        if (data.type === 'PHASE_COMPLETE' && data.phaseNumber === 1 && data.data?.interfaces) {
          setInterfaces(pairAdapterInterfaces(data.data.interfaces,currentPairRef.current?.state==='RESTORED'?null:currentPairRef.current));
        }
        if ((data.type === 'DEVICE_DISCOVERED' || data.type === 'DEVICE_ENRICHED') && data.data?.project) {
          setProject(data.data.project);
        }
        if (data.type === 'DEVICE_DISCOVERED' && data.data?.isNew === true && data.data?.project?.devices?.some((d:Device)=>d.id===data.data.device?.id) && shouldNotifyForDiscovery(preferencesRef.current,true) && data.data?.device) {
          const notification = discoveryNotification(data.data.device);
          if (notification) setNewDeviceDetected(notification);
        }
        if(data.type==='DIAGNOSTIC_EVIDENCE'&&data.data?.device){
          setProject(current=>current?{...current,devices:current.devices.map(d=>d.id===data.data.device.id&&d.network.ipAddress===data.data.device.network.ipAddress?{...d,diagnostics:data.data.device.diagnostics}:d)}:current);
        }
        if (data.type === 'DEVICE_DIAGNOSTICS_UPDATED' && data.data?.project) {
          setProject(data.data.project);
          setSelectedDeviceForInspector(current => current?.id === data.data.device?.id ? data.data.device : current);
          if (data.data.refresh) setDiagnosticRefresh(data.data.refresh);
        }
        if (data.type === 'PAIR_STATE_CHANGED') {
          acceptPair(data.data?.pair || null);
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
          data.type === 'COLLISION_RECHECKED' ||
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
      } catch { if (active) {setScanStatusUnavailable(true);setDiagnosticRefresh(current=>({...current,status:'UNAVAILABLE'}));} }
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

  // Local technician fields share the same acknowledged, stable-ID update path.
  const updateTechnicianField = async (id:string,field:'name'|'notes',value:string) => {
    if(!project?.devices.some(d=>d.id===id))throw Error('Device is no longer available.');
    const {response,body}=await requestJson(`http://localhost:3001/api/device/${encodeURIComponent(id)}/config`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({technician:{[field]:value}})
    },fetch,5000);
    if(!response.ok || (body as any)?.status!=='LOCAL_METADATA_UPDATED' || (body as any)?.device?.id!==id)throw Error('Metadata save was not confirmed.');
    await fetchData();
  };
  const handleUpdateDeviceName = (id:string,name:string) => updateTechnicianField(id,'name',name);
  const handleUpdateDeviceNotes = (id:string,notes:string) => updateTechnicianField(id,'notes',notes);

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

  const handleOpenDuplicateAssistant = (device: Device, blockedIp?: string) => {
    const current=project?.devices.find(d=>d.id===device.id)||device;
    // A backend block can arrive before the corresponding collision broadcast.
    setSelectedCollisionId(blockedIp||collisionKeyForDevice(current,project?.collisions||[])||current.network.ipAddress);
    setSelectedDeviceForBrowser(null);
    setSelectedDeviceForInspector(null);
    setIsDuplicateDrawerOpen(true);
    void fetchData();
  };

  const handleOpenBrowser = (dev: Device, mode: 'EMBEDDED' | 'EDGE' | 'CHROME' | 'SYSTEM') => {
    const requested=resolveOpenPreference(mode,preferences.browserPreference);
    if (requested === 'EMBEDDED') {
      setSelectedDeviceForBrowser(dev);
    } else {
      fetch(`http://localhost:3001/api/connect/${encodeURIComponent(dev.id)}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preference: requested }) })
        .then(async response => { const data = await response.json(); if (!response.ok) { if(data.accessDecision?.code==='AMBIGUOUS_COLLISION'){handleOpenDuplicateAssistant(dev,data.accessDecision.ipAddress);return;} throw new Error(data.error); } if (data.browser?.fallback) window.alert('Preferred browser was unavailable; launch requested using the Windows default browser. Page and device response are not verified.'); })
        .catch(error => window.alert(error.message));
    }
  };

  const closeAttentionPanels=()=>{setIsDuplicateDrawerOpen(false);setSelectedDeviceForBrowser(null);setAttentionAction(null);setOpenMenu(null);};
  const foregroundDiagnostics=(device:Device,taskId?:string)=>{
    if(taskId)setDiagnosticRequests(current=>({...current,[device.id]:{taskId}}));
    closeAttentionPanels();setTaskNavigation(current=>({open:false,revision:current.revision+1,taskId:undefined}));
    setSelectedDeviceForInspector(device);setDiagnosticsFocus(value=>value+1);
  };
  const openTasks=(taskId?:string)=>{closeAttentionPanels();setSelectedDeviceForInspector(null);setTaskNavigation(current=>({open:true,revision:current.revision+1,taskId}));};
  const openCollision=(id:string)=>{
    if(!project?.collisions.some(c=>(c.id||c.ipAddress)===id&&isActiveCollision(c))){setAttentionAction(null);return;}
    setAttentionAction(null);setSelectedDeviceForInspector(null);setSelectedDeviceForBrowser(null);
    setSelectedCollisionId(id);setIsDuplicateDrawerOpen(true);
  };
  const handleDiagnose = async (devices: Device[]) => {
    const ids=[...new Set(devices.map(device=>device.id))];if(!ids.length)return;
    const requestKey=ids.slice().sort().join('|');if(diagnosePending.current.has(requestKey))return;
    diagnosePending.current.add(requestKey);
    if(ids.length===1)foregroundDiagnostics(devices[0]);else openTasks();
    setDiagnosticRequests(current=>({...current,...Object.fromEntries(ids.map(id=>[id,{pending:true}]))}));
    try{
      const {response,body}=await requestJson('http://localhost:3001/api/diagnostics/run',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceIds:ids}),
      },fetch,15000);
      const result=body as {taskId?:string};if(!response.ok||!result.taskId)throw Error('Unable to start diagnostics.');
      setDiagnosticRequests(current=>({...current,...Object.fromEntries(ids.map(id=>[id,{taskId:result.taskId}]))}));
      if(ids.length>1)setTaskNavigation(current=>current.open?{...current,revision:current.revision+1,taskId:result.taskId}:current);
    }catch{
      setDiagnosticRequests(current=>({...current,...Object.fromEntries(ids.map(id=>[id,{failed:true}]))}));
      if(ids.length>1)window.alert('Diagnostics could not be started or acknowledged. Check Tasks for any accepted operation before retrying.');
    }finally{diagnosePending.current.delete(requestKey);}
  };

  const handleLegacyOnboard = async (payload: any) => {
    await fetch('http://localhost:3001/api/edge/legacy-onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await fetchData();
  };

  const [currentListFeedback,setCurrentListFeedback]=useState(''),[rediscoverBusy,setRediscoverBusy]=useState(false);
  const rediscoverRemoved=async()=>{
    if(rediscoverBusy||isScanning||scanStarting||stopPending)return;
    setRediscoverBusy(true);setOpenMenu(null);
    try{const {response}=await requestJson('http://localhost:3001/api/current-list/rediscover',{method:'POST'},fetch,5000);if(!response.ok)throw Error();setCurrentListFeedback('Manually removed cameras can return after fresh discovery.');await fetchData();await handleScanNetwork();}
    catch{setCurrentListFeedback('Rediscover could not be confirmed. Refresh the list before retrying.');}
    finally{setRediscoverBusy(false);}
  };
  const handleRemoveDevice = async (deviceId: string, scope: 'current' | 'project') => {
    const response = await fetch(`http://localhost:3001/api/devices/${encodeURIComponent(deviceId)}/remove-${scope}`, { method: 'POST' });
    const result=await response.json();if (!response.ok) throw new Error(result.error || 'Device could not be removed.');if(scope==='current')setCurrentListFeedback(result.removal?.message||'Removed from Current List.');
    setSelectedDeviceIds(current => { const next = new Set(current); next.delete(deviceId); return next; });
    await fetchData();
  };

  const [removingSelected,setRemovingSelected]=useState(false);
  const removingSelectedRef=useRef(false);
  const removeSelected=async()=>{
    if(removingSelectedRef.current)return;
    const ids=(project?.devices||[]).filter(d=>selectedDeviceIds.has(d.id)).map(d=>d.id);
    if(!ids.length||!window.confirm(`Remove ${ids.length} selected device(s) from Current List for this session? Project and Report Set membership stay unchanged. No physical camera or network settings are changed. Identified cameras stay hidden until Rediscover manually removed cameras or restart; weak-identity rows may return.`))return;
    removingSelectedRef.current=true;setRemovingSelected(true);let removed=0;
    try{for(const id of ids){await handleRemoveDevice(id,'current');removed++;}setCurrentListFeedback(`Removed ${removed} device(s) from Current List. Project and Report Set membership are unchanged. Identified cameras stay hidden for this session; weak-identity rows may return.`);}
    catch{setCurrentListFeedback(`Removed ${removed} of ${ids.length} selected device(s). Remaining removals were not confirmed. Refresh the list before retrying.`);}
    finally{removingSelectedRef.current=false;setRemovingSelected(false);}
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
  const activeCollisionsCount = project?.collisions.filter(isActiveCollision).length || 0;

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
          <div className="relative"><button aria-haspopup="menu" aria-expanded={openMenu==='TOOLS'} onClick={()=>setOpenMenu(openMenu==='TOOLS'?null:'TOOLS')} className="ui-header-button">Tools <ChevronDown className="w-3.5 h-3.5"/></button>{openMenu==='TOOLS'&&<div role="menu" className="ui-menu"><button onClick={()=>{setNetworkAdapterOpen(true);setOpenMenu(null)}}>Network Adapter</button><button onClick={()=>{setIsLegacyModalOpen(true);setOpenMenu(null)}}>Add Device Manually</button><button onClick={()=>{setReportSetOpen(true);setOpenMenu(null)}}>Report Set ({reportSet.members.length})</button><button onClick={()=>{void openReports();setOpenMenu(null)}}>Reports</button></div>}</div>
          <div className="relative"><button aria-haspopup="menu" aria-expanded={openMenu==='SETTINGS'} onClick={()=>setOpenMenu(openMenu==='SETTINGS'?null:'SETTINGS')} className="ui-header-button"><Settings className="w-4 h-4"/>Settings <ChevronDown className="w-3.5 h-3.5"/></button>{openMenu==='SETTINGS'&&<SettingsMenu preferences={preferences} onPreferences={changePreferences} monitoring={diagnosticRefresh} preflight={preflight} onClose={()=>setOpenMenu(null)}/>}</div>
          <Tasks navigation={taskNavigation} onSnapshot={setTaskSnapshot} onOpen={()=>{closeAttentionPanels();setSelectedDeviceForInspector(null);}} onDiagnostic={(id,taskId)=>{const device=project?.devices.find(d=>d.id===id);if(device)foregroundDiagnostics(device,taskId);else window.alert('This device is no longer in the current inventory.');}} onResult={(result,correlationId)=>{
            if(result==='REPORTS')void openReports();
            else if(result==='PROJECT_HISTORY')setProjectHistoryOpen(true);
            else void requestJson('http://localhost:3001/api/pair/status',{},fetch,5000).then(({response,body})=>{
              const current=body as PairSessionState|null;
              if(!response.ok||!current||current.id!==correlationId||['CANCELLED','RESTORED'].includes(current.state))throw Error('This adapter task is no longer current. No network change was made.');
              acceptPair(current);setPairModalDismissed(false);if(current.purpose==='NETWORK_MATCH')setNetworkAdapterOpen(true);else setPairTaskOpen(true);
            }).catch(()=>window.alert('This adapter task is no longer current or its status is unavailable. No network change was made.'));
          }}/>
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
          <button onClick={() => { if(pairSession.purpose==='NETWORK_MATCH'){setNetworkAdapterOpen(true);return;} const device = project?.devices.find(item => item.id === pairSession.deviceId) || null; setPairDevice(device); setPairTaskOpen(true); setPairModalDismissed(false); }} className={`w-full p-3 rounded-xl border text-xs flex items-center justify-center gap-2 ${pairSession.recoveryDisposition==='HEALTHY_RETAINED'?'border-sky-600/40 bg-sky-950/20 text-sky-200':'border-amber-600/60 bg-amber-950/40 text-amber-200'}`}>
            <Network className="w-4 h-4" />{pairSession.recoveryDisposition==='HEALTHY_RETAINED' ? `Configuration retained on ${pairSession.adapter.interfaceAlias} • ${pairSession.adapter.ipv4Addresses.map(ip=>`${ip.address}/${ip.prefixLength}`).join(', ')}. Original configuration safely retained.` : `Network recovery requires review: ${pairSession.message}`}
          </button>
        )}

        {/* Workspace Toolbar: Search, Filters & Network Adapter Info (Sections 7, 8, 24) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-2">
          <div className="relative flex shrink-0" onMouseDown={event=>event.stopPropagation()}>
            <button disabled={scanStarting || stopPending} onClick={handleScanNetwork} className={`h-9 flex items-center gap-2 rounded-l-md px-4 font-bold text-xs text-white ${isScanning?'bg-red-600 hover:bg-red-500':'bg-blue-600 hover:bg-blue-500'}`}>{isScanning?<><RefreshCw className="w-4 h-4 animate-spin"/>Stop</>:<><Play className="w-4 h-4 fill-current"/>Scan</>}</button>
            {!isScanning&&<button aria-label="Scan choices" aria-haspopup="menu" aria-expanded={openMenu==='SCAN'} onClick={()=>setOpenMenu(openMenu==='SCAN'?null:'SCAN')} className="h-9 rounded-r-md border-l border-blue-500 bg-blue-600 px-2 text-white hover:bg-blue-500"><ChevronDown className="w-4 h-4"/></button>}
            {openMenu==='SCAN'&&!isScanning&&<div role="menu" aria-label="Scan choices" className="ui-menu left-0 right-auto top-10 min-w-72"><button onClick={()=>{void handleScanNetwork();setOpenMenu(null)}}><span className="block font-semibold">Quick Scan <span className="font-normal text-blue-600">· Default</span></span><span className="block text-[10px] text-slate-500">Fast discovery on local network</span></button><button disabled={rediscoverBusy||scanStarting||stopPending||!(projectSession?.currentListSuppression?.count)} onClick={()=>void rediscoverRemoved()}>Rediscover manually removed cameras<span className="block text-[10px]">Manually removed: {projectSession?.currentListSuppression?.count||0}</span></button><button onClick={()=>{setAdvancedScanOpen(true);setOpenMenu(null)}}><span className="block font-semibold">Advanced Scan</span><span className="block text-[10px] text-slate-500">Customize adapters, ranges, ports, and discovery methods</span></button></div>}
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
              <span title="First enumerated adapter shown. Quick Scan and monitoring use all eligible adapters; Advanced ONVIF/neighbor discovery uses your selection; targeted checks use Windows routing.">{interfaces[0] ? `${interfaces[0].name} • ${interfaces[0].ipAddress}` : adapterInspected?'Adapter: Unavailable':'Adapter: Detecting…'}</span>
            </div>

            {/* Continuous Discovery Monitor Indicator (Section 15) */}
            <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]" title="Lightweight diagnostic refresh; no configuration or full discovery">
              <Activity className={`w-3.5 h-3.5 ${diagnosticRefresh.enabled ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span>Diagnostics: {diagnosticRefresh.status==='UNAVAILABLE' ? 'Unavailable' : diagnosticRefresh.enabled ? `Active • ${Math.round(diagnosticRefresh.intervalMs / 1000)}s${diagnosticRefresh.running ? ' • checking' : ''}` : preflight?.overall==='UNAVAILABLE' ? 'Unavailable' : 'Paused'}</span>
            </div>
          </div>}
        </div>

        {/* Section 5 & 39: Bulk Operation Bar (when items selected) */}
        {selectedDeviceIds.size > 0 && <SelectedDeviceActions count={selectedDeviceIds.size} removing={removingSelected}
          onDiagnose={()=>void handleDiagnose(selectedDevicesList).catch(error=>window.alert(error.message))}
          onNetwork={()=>setIsBulkReIpModalOpen(true)} onDevice={()=>setIsBulkDeviceConfigOpen(true)}
          onReport={()=>{setReportScope('SELECTED');setIsSiteSurveyModalOpen(true);}} onRemove={()=>void removeSelected()}
          onAddReport={()=>void updateReportSet('add',{deviceIds:[...selectedDeviceIds]}).catch(error=>window.alert(error.message))}
          onRemoveReport={()=>void updateReportSet('remove',{deviceIds:[...selectedDeviceIds]}).catch(error=>window.alert(error.message))}
          onAddProject={projectSession?.mode==='QUICK_WORK'?()=>addExistingProjectInput.current?.click():undefined}
          onDeselect={()=>setSelectedDeviceIds(new Set())}/>}

        {/* Section 5: Master Device Table */}
        <MasterDeviceTable
          devices={filteredDevices}
          hasCompletedScan={hasCompletedScan}
          selectedDeviceIds={selectedDeviceIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onUpdateDeviceName={handleUpdateDeviceName}
          onUpdateDeviceNotes={handleUpdateDeviceNotes}
          onOpenDuplicateAssistant={handleOpenDuplicateAssistant}
          onConfigureDevice={(dev) => setSelectedDeviceForConfig(dev)}
          onInspectDevice={(dev) => setSelectedDeviceForInspector(dev)}
          onOpenBrowser={handleOpenBrowser}
          onDiagnose={(dev) => handleDiagnose([dev]).catch(error => window.alert(error.message))}
          onPair={(dev) => { setPairDevice(dev); setPairModalDismissed(false); }}
          projectMode={projectSession?.mode === 'PROJECT'}
          reportDeviceIds={reportSet.members.flatMap(m=>m.currentDeviceId?[m.currentDeviceId]:[])}
          onReportMembership={(device,add)=>void updateReportSet(add?'add':'remove',{deviceIds:[device.id]}).catch(error=>window.alert(error.message))}
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
          {activeCollisionsCount>0?<button className="rounded px-1 text-amber-800 underline decoration-dotted underline-offset-4 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-haspopup="dialog" onClick={()=>{const choices=activeCollisionChoices(project?.collisions||[]);if(choices.length===1)openCollision(choices[0].id);else if(choices.length>1){closeAttentionPanels();setSelectedDeviceForInspector(null);setAttentionAction('COLLISIONS');}}}>Collisions: {activeCollisionsCount}</button>:<span>Collisions: 0</span>}
          {taskSnapshot.tasks.length>0&&<><span>•</span><button className="rounded px-1 text-blue-800 underline decoration-dotted underline-offset-4 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-haspopup="dialog" onClick={()=>openTasks()}>Tasks: {taskSnapshot.unavailable?'status unavailable':`${taskSnapshot.active} active${taskSnapshot.attention?` • ${taskSnapshot.attention} need attention`:''}`}</button></>}
          <span>•</span><span>{isScanning?'Scanning…':'Ready'}</span>{hasUnsavedAttention(projectSession)&&<><span>•</span><button className="rounded px-1 text-amber-800 underline decoration-dotted underline-offset-4 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-haspopup="dialog" onClick={()=>{closeAttentionPanels();setSelectedDeviceForInspector(null);setAttentionAction('SAVE');}}>Unsaved changes</button></>}
        </div>

        <span className="text-[11px]">Monitor: {diagnosticRefresh.enabled ? `${Math.round(diagnosticRefresh.intervalMs / 1000)}s${(diagnosticRefresh.incrementalDiscovery?.pausedForForeground || diagnosticRefresh.incrementalDiscovery?.pausedForSupport) ? ' - discovery deferred' : ''}` : 'Paused'}</span>
      </footer>

      {/* ─────────────────────────────────────────────────────────────
          MODALS, DRAWERS & ZONE 4 INSPECTOR
      ───────────────────────────────────────────────────────────── */}
      <AttentionActions kind={attentionAction==='SAVE'&&!hasUnsavedAttention(projectSession)?null:attentionAction} collisions={project?.collisions||[]} onCollision={openCollision} onSave={handleSaveProject} onClose={()=>setAttentionAction(null)}/>
      {/* Zone 4: Device Inspector Drawer (v1.5 Section 8) */}
      <DeviceInspectorDrawer
        isOpen={selectedDeviceForInspector !== null}
        onClose={() => setSelectedDeviceForInspector(null)}
        device={project?.devices.find(d=>d.id===selectedDeviceForInspector?.id)||selectedDeviceForInspector}
        diagnosticsFocus={diagnosticsFocus}
        diagnostic={selectedDeviceForInspector?diagnosticPresentation(project?.devices.find(d=>d.id===selectedDeviceForInspector.id)||selectedDeviceForInspector,taskSnapshot,diagnosticRequests[selectedDeviceForInspector.id]):undefined}
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
      <NetworkAdapterModal open={networkAdapterOpen||Boolean(pairSession?.purpose==='NETWORK_MATCH'&&pairSession.recoveryAvailable&&pairSession.recoveryDisposition!=='HEALTHY_RETAINED'&&!pairModalDismissed)} pair={pairSession} onClose={()=>{setNetworkAdapterOpen(false);setPairModalDismissed(true)}} onUpdated={pair=>{acceptPair(pair);void fetchData();}}/>
      <PairNetworkModal
        isOpen={pairTaskOpen || pairDevice !== null || Boolean(pairSession?.purpose!=='NETWORK_MATCH'&&pairSession?.recoveryDisposition!=='HEALTHY_RETAINED'&&!pairModalDismissed && pairSession?.recoveryAvailable && ['PAIRED', 'ROLLBACK_REQUIRED'].includes(pairSession.state))}
        device={pairDevice || project?.devices.find(device => device.id === pairSession?.deviceId) || null}
        pair={pairSession}
        onClose={() => { setPairTaskOpen(false);setPairDevice(null); setPairModalDismissed(true); }}
        onPairUpdated={(pair) => { acceptPair(pair); if (pair.state === 'RESTORED' || pair.state === 'CANCELLED') {setPairTaskOpen(false);setPairDevice(null);} fetchData(); }}
      />

      {/* Milestone 8: backend-authoritative bulk network configuration */}
      <BulkReIpModal
        isOpen={isBulkReIpModalOpen}
        onClose={() => setIsBulkReIpModalOpen(false)}
        selectedDevices={selectedDevicesList}
        onProjectChanged={fetchData}
      />

      {reportSetOpen&&<ReportSetPanel snapshot={reportSet} error={reportSetError} onClose={()=>setReportSetOpen(false)} onRemove={id=>updateReportSet('remove',{memberIds:[id]})} onClear={()=>updateReportSet('clear',{confirmed:true})} onReport={()=>{setReportSetOpen(false);setReportScope('REPORT_SET');setIsSiteSurveyModalOpen(true);}}/>}
      {currentListFeedback&&<div role="status" className="fixed bottom-10 left-4 z-40 max-w-lg rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{currentListFeedback}<button aria-label="Dismiss Current List message" className="ml-3 underline" onClick={()=>setCurrentListFeedback('')}>Dismiss</button></div>}
      {/* Milestone 12: contextual reporting and field documentation */}
      {project && (
        <><SiteSurveyReportModal
          isOpen={isSiteSurveyModalOpen}
          onClose={() => setIsSiteSurveyModalOpen(false)}
          project={project}
          reportSetCount={reportSet.members.length}
          initialScope={reportScope}
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
        <DuplicateDrawer hiddenDeviceIds={projectSession?.currentListSuppression?.hiddenDeviceIds}
          isOpen={isDuplicateDrawerOpen}
          onClose={() => setIsDuplicateDrawerOpen(false)}
          collisions={project.collisions}
          devices={project.devices}
          onDetails={device=>{setIsDuplicateDrawerOpen(false);setSelectedDeviceForInspector(device);}}
          onDiagnose={device=>handleDiagnose([device])}
          onOpen={device=>{setIsDuplicateDrawerOpen(false);handleOpenBrowser(device,'SYSTEM');}}
          selectedCollisionId={selectedCollisionId}
          onChanged={fetchData}
        />
      )}

      {/* Section 28: Embedded Browser Modal */}
      <BrowserModal
        isOpen={selectedDeviceForBrowser !== null}
        onClose={() => setSelectedDeviceForBrowser(null)}
        device={project?.devices.find(device=>device.id===selectedDeviceForBrowser?.id)||selectedDeviceForBrowser}
        devices={project?.devices||[]}
        collisions={project?.collisions||[]}
        onOpenDuplicateAssistant={handleOpenDuplicateAssistant}
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
