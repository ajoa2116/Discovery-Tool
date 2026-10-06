import {createCurrentListRouter} from './current_list_routes.ts';
import {hasIdentity} from '../shared/identity_policy.ts';
import { pairBlocksMonitoring } from '../core/engine/incremental_discovery_monitor.ts';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {readBuildIdentity} from '../core/readiness/build_identity.ts';
import {PowerShellWindowsNetworkAdapterService} from '../core/network/windows_adapter_service.ts';
import { productionAssets, productionAssetRoot, startupFailureMessage } from './production_assets.ts';
import { TaskManager } from '../core/tasks/task_manager.ts';
import { OperationTasks } from '../core/tasks/operation_tasks.ts';
import { taskHttpIntegration } from './task_routes.ts';
import { SupportTraceLease } from '../core/readiness/support_trace_lease.ts';
import { ReceiveMatrix } from '../core/readiness/receive_matrix.ts';
import { createReceiveMatrixRouter } from './receive_matrix_routes.ts';
import { readDiscoveryPortOwners } from '../core/readiness/udp_port_owners.ts';
import { createReceiveTraceRouter } from './ws_discovery_trace_routes.ts';
import { NodeOnvifWsDiscoveryTransport } from '../core/drivers/ws_discovery_transport.ts';
import { wsDiscoveryEvidence } from '../core/drivers/ws_discovery_evidence.ts';
import { ForegroundDiscovery } from '../core/engine/foreground_discovery.ts';
import { createForegroundDiscoveryRouter } from './foreground_discovery_routes.ts';
import express from 'express';
import { validateHttpHost } from './http_host_validation.ts';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { pipelineEngine } from '../core/engine/pipeline.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { appStateDb } from '../core/storage/app_db.ts';
import { osVault } from '../core/storage/vault.ts';
import { DuplicateRemediationService } from '../core/edge_cases/duplicate_remediation_service.ts';
import { DuplicateAssistantService } from '../core/edge_cases/duplicate_assistant_service.ts';
import { LegacyHardwareOnboarding } from '../core/edge_cases/legacy_hardware.ts';
import { applyNetworkRelationship } from '../shared/network_relationship.ts';
import { createAdvancedScanRouter } from './advanced_scan_routes.ts';
import { BulkNetworkConfigurationService } from '../core/engine/bulk_reip.ts';
import { ProjectReverificationWorkflow } from '../core/engine/reverification.ts';
import { ProjectValidationError } from '../core/storage/project_db.ts';
import { DeviceDiagnosticEngine, DiagnosticRefreshMonitor } from '../core/engine/diagnostic_engine.ts';
import { MatchCandidateService } from '../core/network/match_candidate_service.ts';
import { PairService } from '../core/network/pair_service.ts';
import { ConnectService, ConnectError } from '../core/connect/connect_service.ts';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';
import { CameraRendererService } from '../core/connect/camera_renderer_service.ts';
import { cameraBrowserRoutes } from './camera_browser_routes.ts';
import { CameraNetworkConfigurationService } from '../core/network/camera_network_service.ts';
import { CameraConfigurationService } from '../core/network/camera_configuration_service.ts';
import { PreferredCameraConfigurationProvider } from '../core/drivers/vendor_configuration_provider.ts';
import {ReportSet} from '../core/reporting/report_set.ts';
import {createReportSetRouter} from './report_set_routes.ts';
import { createReportRouter } from './report_routes.ts';
import { ShutdownCoordinator, WindowsPreflightService, recoveryRequiresReview } from '../core/readiness/field_readiness.ts';
import { AdvancedScanService } from '../core/engine/advanced_scan.ts';
import { DEFAULT_MONITORING_INTERVAL_MS, IncrementalDiscoveryMonitor } from '../core/engine/incremental_discovery_monitor.ts';
import { LegacyConfigurationBoundary } from '../core/network/legacy_configuration_boundary.ts';
import { technicianErrorResponse } from '../shared/error_presentation.ts';
import { SupportBundleBuilder } from '../core/readiness/support_bundle.ts';
import { AddToExistingProjectService } from '../core/storage/add_to_existing_project.ts';
import { LocalHostIdentity } from '../core/network/local_host_identity.ts';
import { ProjectHistoryFilter } from '../core/storage/project_history.ts';

const tasks = new TaskManager(100,undefined,task=>appStateDb.logAudit({id:crypto.randomUUID(),timestamp:task.updatedAt,category:'SYSTEM',level:task.state==='FAILED'?'WARNING':'INFO',message:`Task ${task.state.toLowerCase()}: ${task.title}`,details:{taskId:task.id,correlationId:task.correlationId,state:task.state,reference:task.reference}}));
const operationTasks = new OperationTasks(tasks);
let advancedTaskSessionId='';
const app = express();
app.use(validateHttpHost);
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const startupFailure=(error:NodeJS.ErrnoException)=>{console.error(startupFailureMessage(error.code));process.exit(1);};
server.once('error',startupFailure);
wss.once('error',startupFailure);
const diagnosticEngine = new DeviceDiagnosticEngine();
const reportSet=new ReportSet(()=>projectDb.getSession());
const diagnosticControllers = new Map<string, AbortController>();
const pairService = new PairService(undefined,undefined,undefined,undefined,undefined,{changed:pair=>{if(['APPLYING','RESTORING'].includes(pair.state))diagnosticMonitor.cancelCurrent();broadcast({type:'PAIR_STATE_CHANGED',data:{pair,project:projectDb.getProject()}})}});
const connectService = new ConnectService();
const cameraBrowserSessions = new CameraBrowserSessions(() => {
  const session = projectDb.getSession();
  return { key: session.mode + ':' + session.project.id, devices: session.project.devices, collisions: session.project.collisions };
}, id => connectService.resolve(id).endpoint.url);
// Production supplies no fixture authority: native real-camera launch stays gated.
const cameraRenderers = new CameraRendererService(cameraBrowserSessions);
const browserSessionTimer = setInterval(() => { cameraBrowserSessions.reconcile(); cameraRenderers.reconcile(); }, 1000);
browserSessionTimer.unref();
const connectRecheckControllers = new Map<string, AbortController>();
const cameraNetworkService = new CameraNetworkConfigurationService();
const duplicateRemediationService = new DuplicateRemediationService(projectDb,osVault,cameraNetworkService);
const cameraConfigurationService = new CameraConfigurationService(projectDb,osVault,new PreferredCameraConfigurationProvider());
const bulkNetworkService = new BulkNetworkConfigurationService(projectDb, osVault, cameraNetworkService);
const advancedScanService = new AdvancedScanService();
const legacyConfigurationBoundary = new LegacyConfigurationBoundary(projectDb);
const supportBundleBuilder = new SupportBundleBuilder();
const addToExistingProjectService = new AddToExistingProjectService();
let reverifySessionId: string | null = null;
const reverifyWorkflow = new ProjectReverificationWorkflow(
  projectDb,
  async database => { const sessionId = crypto.randomUUID(); reverifySessionId = sessionId; try { return await pipelineEngine.runDiscoveryScan({ database, context: { origin: 'REVERIFY', sessionId }, emitTerminalEvent: false, emitDeviceEvents: false }); } finally { reverifySessionId = null; } },
  () => reverifySessionId ? pipelineEngine.stopDiscovery(reverifySessionId) : false,
);
const cameraNetworkControllers = new Map<string, AbortController>();
let recoveryInspected=false;
const buildIdentity=readBuildIdentity();
const preflightService = new WindowsPreflightService({
  portAvailable:async port=>port===3001&&server.listening,
  enumerateAdapters:async()=> (await pairService.getEligibleAdapters()).filter(adapter=>adapter.ipv4Addresses.length>0).length,
  isAdministrator:()=>new PowerShellWindowsNetworkAdapterService().isAdministrator(),
  productionAssetsAvailable:async()=>existsSync(join(productionAssetRoot,'index.html')),
  recoveryRequired:async()=>recoveryRequiresReview(recoveryInspected,pairService.getStatus()),
  operationActive:async()=>tasks.snapshot().active>0||supportTrace.isActive()||Boolean(receiveMatrix?.isActive()),
  production:process.env.NODE_ENV==='production',build:buildIdentity
});
let preflightCache: { stateKey:string; expiresAt: number; value: Awaited<ReturnType<WindowsPreflightService['run']>> } | null = null;
const getPreflight = async (refresh=false) => { const stateKey=JSON.stringify([recoveryInspected,pairService.getStatus()?.state,tasks.snapshot().active,supportTrace.isActive(),receiveMatrix?.isActive()]);if (!refresh && preflightCache?.stateKey===stateKey && preflightCache.expiresAt > Date.now()) return preflightCache.value; const value = await preflightService.run(); preflightCache = { stateKey,expiresAt: Date.now() + 60_000, value }; return value; };

app.use(cors({ exposedHeaders: ['X-CCTV-Report-Renderer', 'Content-Disposition'] }));
app.use('/api/camera-browser', cameraBrowserRoutes(cameraBrowserSessions, process.env.NODE_ENV !== 'production', cameraRenderers));
app.use(express.json());
// Preserve the latest snapshot before any current-list/project transition.
app.use(['/api/devices','/api/project'],(_req,_res,next)=>{reportSet.snapshot();next();});

// Broadcast WebSocket message to all connected clients
const broadcast = (data: any) => {
  cameraBrowserSessions.reconcile(); cameraRenderers.reconcile();
  if(data.data?.project||data.data?.session){reportSet.snapshot();data.data.currentListSuppression=projectDb.getSession().currentListSuppression;}
  if(data.type==='FOREGROUND_SCAN_STATE'){const snapshot=data.data.foreground;operationTasks.foreground(snapshot,()=>foregroundDiscovery.stop(snapshot.session?.sessionId),snapshot.session?.sessionId===advancedTaskSessionId?advancedScanService.getStatus():undefined);}
  if(data.type==='PAIR_STATE_CHANGED')operationTasks.pair(data.data.pair);
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};
const safeError = (res:any,error:unknown,status:number,operation:string,deviceId?:string) => {
  const body=technicianErrorResponse(error,{operation,deviceId});
  appStateDb.logAudit({id:crypto.randomUUID(),timestamp:body.presentation.timestamp,category:'SYSTEM',level:body.code==='CANCELLED'?'INFO':'ERROR',message:`${body.presentation.title} [${body.presentation.reference}]`,deviceId,details:{reference:body.presentation.reference,operation,code:body.code,technicalDetails:body.presentation.technicalDetails,result:body.code==='CANCELLED'?'CANCELLED':'FAILED'}});
  return res.status(status).json(body);
};
const safeBroadcastError=(type:string,error:unknown,operation:string,extra:Record<string,unknown>={})=>{const body=technicianErrorResponse(error,{operation,fallbackCode:'OPERATION_FAILED'});appStateDb.logAudit({id:crypto.randomUUID(),timestamp:body.presentation.timestamp,category:'SYSTEM',level:body.code==='CANCELLED'?'INFO':'ERROR',message:`${body.presentation.title} [${body.presentation.reference}]`,details:{reference:body.presentation.reference,operation,code:body.code,technicalDetails:body.presentation.technicalDetails}});broadcast({type,context:extra.context,data:{...body,...extra}})};

const diagnosticMonitor = new DiagnosticRefreshMonitor(
  diagnosticEngine,
  () => !recoveryInspected||pairBlocksMonitoring(pairService.getStatus()) ? [] : projectDb.getDevices(),
  device => {
    const updated=projectDb.applyDiagnosticRefresh(device);if(!updated)return;
    broadcast({ type: 'DEVICE_DIAGNOSTICS_UPDATED', context: { origin: 'DIAGNOSTICS' }, data: { device:updated, project: projectDb.getProject(), refresh: monitoringState() } });
  },
  DEFAULT_MONITORING_INTERVAL_MS,
  3,
);
diagnosticMonitor.start();
const foregroundDiscovery = new ForegroundDiscovery(foreground => broadcast({ type: 'FOREGROUND_SCAN_STATE', context: foreground.session && { origin: foreground.session.origin, sessionId: foreground.session.sessionId }, data: { foreground } }));
const monitoringAudit = (event: string, message: string) => appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'DISCOVERY', level: event === 'CYCLE_FAILED' ? 'WARNING' : 'INFO', message });
let receiveMatrix:ReceiveMatrix | undefined;
const supportTrace = new SupportTraceLease(()=>broadcast({type:'MONITORING_STATE',context:{origin:'MONITORING'},data:{monitoring:monitoringState()}}));
const incrementalMonitor = new IncrementalDiscoveryMonitor({
  runCycle: async sessionId => { await pipelineEngine.runDiscoveryScan({ context: { origin: 'MONITORING', sessionId }, emitTerminalEvent: false }); },
  cancelCycle: sessionId => { pipelineEngine.stopDiscovery(sessionId); },
  changed: state => broadcast({ type:'MONITORING_STATE', context:{origin:'MONITORING',sessionId:state.sessionId}, data:{monitoring:monitoringState()} }),
  canRun: () => {
    if((receiveMatrix?.isActive() || supportTrace.isActive()))return {allowed:false,reason:'Support receive matrix owns discovery.'};
    if (foregroundDiscovery.isActive()) return { allowed:false, reason:'Background discovery is deferred while the foreground scan owns discovery.' };
    if (reverifyWorkflow?.isRunning()) return { allowed: false, reason: 'Discovery cycle skipped because Project reverification is active.' };
    if (pipelineEngine.getIsRunning()) return { allowed: false, reason: 'Discovery cycle skipped because a manual scan is active.' };
    if (advancedScanService.getStatus().running) return { allowed: false, reason: 'Discovery cycle skipped because Advanced Scan is active.' };
    const pair = pairService.getStatus();
    if (!recoveryInspected || pairBlocksMonitoring(pair)) return { allowed: false, reason: 'Discovery cycle skipped because Pair or restore work is active.' };
    if (cameraNetworkControllers.size || cameraNetworkService.hasActiveOperation() || bulkNetworkService.hasActiveOperation() || cameraConfigurationService.hasActiveOperation() || duplicateRemediationService.isActive()) return { allowed: false, reason: 'Discovery cycle skipped because camera or network configuration is active.' };
    return { allowed: true };
  },
  log: (event, message) => { if (event !== 'CYCLE_STARTED' && event !== 'CYCLE_COMPLETED') monitoringAudit(event, message); },
}, DEFAULT_MONITORING_INTERVAL_MS);
const duplicateAssistantService=new DuplicateAssistantService(projectDb,incrementalMonitor);
pairService.initializeRecovery().then(state => {
  recoveryInspected=true;
  if (state) broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair: state } });
}).catch(() => console.error('Pair recovery inspection failed. Check original adapter state before further adapter changes.'));
osVault.initialize().catch(error => console.error('Windows secure credential store unavailable:', error instanceof Error ? error.message : error));

// Wire pipeline events to WebSocket clients
pipelineEngine.subscribe(event => {
  if (event.type === 'DEVICE_DISCOVERED' && event.data?.device) {
    projectDb.restoreDiscoveredDevice(event.data.device);
    event.data.project = projectDb.getProject();
    if (event.context?.origin === 'MONITORING' && event.data.isNew === true) monitoringAudit('NEW_DEVICE', `Incremental discovery found new stable device ${event.data.device.id}.`);
  }
  broadcast(event);
});
incrementalMonitor.start();

const taskIntegration=taskHttpIntegration(tasks,{
  refresh:()=>{const snapshot=foregroundDiscovery.getState();operationTasks.foreground(snapshot,()=>foregroundDiscovery.stop(snapshot.session?.sessionId),snapshot.session?.sessionId===advancedTaskSessionId?advancedScanService.getStatus():undefined);operationTasks.pair(pairService.getStatus());},
  monitoring:monitoringState,
  bulk:(kind,id)=>{try{return kind==='BULK_REIP'?bulkNetworkService.get(id):cameraConfigurationService.getBulk(id)}catch{return undefined}},
  cancelBulk:(kind,id)=>kind==='BULK_REIP'?bulkNetworkService.cancel(id):cameraConfigurationService.cancelBulk(id),
  cancelReverify:()=>reverifyWorkflow.cancel(),
});
app.use(taskIntegration.middleware);
app.use('/api/tasks',taskIntegration.router);
// ==================== REST API ROUTES ====================

app.use('/api/current-list',createCurrentListRouter(projectDb,()=>broadcast({type:'PROJECT_SESSION_CHANGED',data:{session:projectDb.getSession()}})));

// Project & Devices
app.get('/api/project', (req, res) => {
  res.json(projectDb.getProject());
});

app.get('/api/project/session', (req, res) => {
  res.json(projectDb.getSession());
});
app.get('/api/project/history', (req,res) => {
  if(projectDb.getSession().mode!=='PROJECT')return res.status(400).json({error:'Project history is available only when a Project is open.'});
  const filter=String(req.query.filter||'ALL') as ProjectHistoryFilter;
  if(!['ALL','DEVICE','VERIFICATION','CONFIGURATION','PROJECT'].includes(filter))return res.status(400).json({error:'Project history filter is not supported.'});
  res.json({events:projectDb.listProjectHistory(filter,typeof req.query.deviceId==='string'?req.query.deviceId:undefined)});
});

app.post('/api/devices/:id/remove-current', (req, res) => {
  try {
    const device = projectDb.removeDeviceFromCurrentList(req.params.id);
    appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'SYSTEM', level: 'INFO', message: 'Device removed from current list; physical device unchanged.', deviceId: device.id });
    const session = projectDb.getSession(); broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session } }); res.json({...session,removal:{suppressed:hasIdentity(device),message:hasIdentity(device)?'Removed from Current List. This camera stays hidden for this backend session until you choose Rediscover manually removed cameras. Project and Report Set membership are unchanged.':'Removed this row only. Identity is too weak for session suppression; discovery may show it again. Project and Report Set membership are unchanged.'}});
  } catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.post('/api/devices/:id/remove-project', (req, res) => {
  try {
    const device = projectDb.removeDeviceFromProject(req.params.id);
    appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'SYSTEM', level: 'INFO', message: 'Device removed from Project membership; physical device unchanged.', deviceId: device.id });
    const session = projectDb.getSession(); broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session } }); res.json(session);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.post('/api/project/quick-work', (req, res) => {
  const project = projectDb.startQuickWork();
  broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session: projectDb.getSession() } });
  res.json(project);
});

app.post('/api/project/new', (req, res) => {
  try {
    const project = projectDb.createNewProject(req.body.name, req.body.location, req.body.description);
    broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session: projectDb.getSession() } });
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/project/from-current', (req, res) => {
  try {
    const project = projectDb.createProjectFromCurrentResults(req.body.name, req.body.description);
    broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session: projectDb.getSession() } });
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.post('/api/project/add-existing/preview',async(req,res)=>{try{const ids=Array.isArray(req.body.deviceIds)?req.body.deviceIds.map(String):[],selected=ids.map((id:string)=>projectDb.getDeviceById(id)).filter(Boolean);const adapters=await advancedScanService.listAdapters().catch(()=>[]);res.json(addToExistingProjectService.preview(String(req.body.jsonData||''),selected,LocalHostIdentity.fromAdapters(adapters)))}catch(error){safeError(res,error,400,'ADD_TO_EXISTING_PROJECT_PREVIEW')}});
app.post('/api/project/add-existing/confirm',(req,res)=>{try{const result=addToExistingProjectService.confirm(String(req.body.planId||''),req.body.confirmed===true);appStateDb.logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),category:'SYSTEM',level:'SUCCESS',message:`Add to Existing Project created an updated Project file: ${result.added} added, ${result.updated} reconciled, ${result.blocked} blocked.`,details:{operation:'ADD_TO_EXISTING_PROJECT',added:result.added,updated:result.updated,blocked:result.blocked}});res.json(result)}catch(error){safeError(res,error,400,'ADD_TO_EXISTING_PROJECT_CONFIRM')}});
app.post('/api/project/add-existing/cancel',(req,res)=>res.json({cancelled:addToExistingProjectService.cancel(String(req.body.planId||''))}));

app.post('/api/project/open', (req, res) => {
  try {
    const project = projectDb.importProjectJson(req.body.jsonData);
    broadcast({ type: 'PROJECT_SESSION_CHANGED', data: { session: projectDb.getSession() } });
    res.json(project);
  } catch (error) {
    res.status(error instanceof ProjectValidationError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/project/save-content', (req, res) => {
  try {
    const content = projectDb.exportProjectJsonForSave();
    broadcast({ type: 'PROJECT_SAVED', data: { session: projectDb.getSession() } });
    res.json({ filename: `${projectDb.getProject().name.replace(/[^a-z0-9_-]+/gi, '_')}.cctvproj`, content });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/project/save', async (req, res) => {
  try {
    const filePath = req.body.filePath ? await projectDb.saveAs(req.body.filePath) : await projectDb.saveProject();
    broadcast({ type: 'PROJECT_SAVED', data: { session: projectDb.getSession() } });
    res.json({ filePath, session: projectDb.getSession() });
  } catch (error) {
    res.status(error instanceof ProjectValidationError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/project/reverify', async (_req, res) => {
  try {
    await incrementalMonitor.yieldToTechnician();
    if (foregroundDiscovery.isActive() || (receiveMatrix?.isActive() || supportTrace.isActive())) return res.status(409).json({ error: 'Project reverification cannot start while a foreground scan is active.' });
    const result = await reverifyWorkflow.run();
    broadcast({ type: 'PROJECT_REVERIFIED', data: { result, project: projectDb.getProject() } });
    res.json({ result, project: projectDb.getProject() });
  } catch (error) {
    const body=technicianErrorResponse(error,{operation:'PROJECT_REVERIFY',fallbackCode:'OPERATION_FAILED'});
    broadcast({ type: body.code==='CANCELLED' ? 'PROJECT_REVERIFY_CANCELLED' : 'PROJECT_REVERIFY_FAILED', data: body });
    safeError(res,error,body.presentation.technicalDetails?.includes('already running')?409:400,'PROJECT_REVERIFY');
  }
});
app.post('/api/project/reverify/cancel', (_req, res) => res.status(202).json({ cancelled: reverifyWorkflow.cancel() }));
app.post('/api/project/reverify/replacements/:candidateId', (req, res) => {
  try {
    const decision = req.body.decision as 'CONFIRMED'|'REJECTED'|'DEFERRED';
    if (!['CONFIRMED','REJECTED','DEFERRED'].includes(decision)) return res.status(400).json({ error: 'Choose Confirm Replacement, Keep Original, or Decide Later.' });
    const result = reverifyWorkflow.decide(req.params.candidateId, decision);
    broadcast({ type: 'PROJECT_REPLACEMENT_REVIEWED', data: { decision, project: projectDb.getProject(), session: projectDb.getSession() } });
    res.json({ ...result, decision, project: projectDb.getProject(), session: projectDb.getSession() });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Replacement review could not be completed.' }); }
});

app.get('/api/project/devices', (req, res) => {
  res.json(projectDb.getDevices());
});

app.get('/api/project/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=cctv_site_export.cctvproj');
  res.send(projectDb.exportProjectJson());
});

// Available IP Finder (Section 25)
app.get('/api/ip-finder/available', (req, res) => {
  res.status(410).json({ error: 'The legacy global IP finder is unavailable because absence from the project is not proof that an address is free. Use a configuration preview with live candidate validation.' });
});

// Backend-authoritative bulk network configuration.
app.post('/api/bulk/network/plan', async (req,res)=>{try{res.json(await bulkNetworkService.createPlan(req.body))}catch(error:any){safeError(res,error,400,'BULK_REIP_PLAN')}});
app.get('/api/bulk/network/:batchId', (req,res)=>{try{res.json(bulkNetworkService.get(req.params.batchId))}catch(error:any){res.status(404).json({error:error.message,code:error.code})}});
app.post('/api/bulk/network/:batchId/apply', async(req,res)=>{try{const batch=await bulkNetworkService.execute(req.params.batchId,req.body.confirmed===true);broadcast({type:'BULK_NETWORK_UPDATED',data:{batch,project:projectDb.getProject()}});res.json(batch)}catch(error:any){safeError(res,error,400,'BULK_REIP_APPLY')}});
app.post('/api/bulk/network/:batchId/cancel', (req,res)=>res.status(202).json({cancelled:bulkNetworkService.cancel(req.params.batchId)}));
app.post('/api/bulk/network/:batchId/retry', async(req,res)=>{try{res.json(await bulkNetworkService.retry(req.params.batchId))}catch(error:any){res.status(400).json({error:error.message,code:error.code})}});

// 6-Phase Pipeline
app.use('/api/discovery/advanced',createAdvancedScanRouter(advancedScanService,safeError));
app.use('/api/discovery', createForegroundDiscoveryRouter({
  foreground: foregroundDiscovery,
  yieldMonitoring: () => incrementalMonitor.yieldToTechnician(),
  busy: () => Boolean(receiveMatrix?.isActive() || supportTrace.isActive()) || reverifyWorkflow.isRunning() || (pipelineEngine.getIsRunning() && !incrementalMonitor.getState().running),
  quick: async (context, signal) => {
    const result = await pipelineEngine.runDiscoveryScan({ context, signal, emitTerminalEvent: false });
    if (result === 'BUSY') throw Error('Discovery ownership could not be acquired.');
  },
  prepare: async (input, timing) => {
    const prepared = await advancedScanService.prepare(input);
    appStateDb.logAudit({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category:'DISCOVERY', level:'INFO', message:'Advanced Scan preflight completed.', details:{...prepared.timings,monitorYieldMs:timing.monitorYieldMs,totalPreflightMs:Date.now()-timing.startedAt,valid:prepared.plan.valid} });
    if (prepared.plan.valid && prepared.plan.mode === 'ADVANCED' && prepared.adapters.filter(a => a.eligible && prepared.plan.adapterIndexes.includes(a.interfaceIndex)).length !== prepared.plan.adapterIndexes.length) prepared.plan = { ...prepared.plan, valid:false, errors:['A selected adapter became unavailable. Reload Adapters and validate again.'] };
    return prepared;
  },
  advanced: async ({plan,adapters}, context, signal) => {
    const names = adapters.filter(a => a.eligible && plan.adapterIndexes.includes(a.interfaceIndex)).map(a => a.interfaceAlias);
    if (plan.mode==='QUICK_FALLBACK' || plan.methods.includes('ONVIF') || plan.methods.includes('NEIGHBOR')) {
      const result = await pipelineEngine.runDiscoveryScan({ context, signal, ...(plan.mode==='QUICK_FALLBACK' ? {} : { adapterNames:names, discoveryMethods:plan.methods, filters:plan.request.filters }), emitTerminalEvent:false });
      if (result === 'BUSY') throw Error('Discovery ownership could not be acquired.');
      if (signal.aborted || plan.mode==='QUICK_FALLBACK') return;
    }
    if (signal.aborted) return;
    advancedTaskSessionId=context.sessionId;
    await advancedScanService.execute(plan, {
      onDevice: (device,isNew) => { projectDb.restoreDiscoveredDevice(device); broadcast({type:'DEVICE_DISCOVERED',context,data:{device,isNew,project:projectDb.getProject(),scanMode:'ADVANCED'}}); },
      onComplete: () => {},
    }, signal);
  },
  monitoring: () => monitoringState(),
  details: () => ({ phases:pipelineEngine.getStates().slice(0,4), advanced:advancedScanService.getStatus() }),
  error: safeError,
  failed: (error, context) => safeBroadcastError('DISCOVERY_SESSION_FAILED',error,'FOREGROUND_DISCOVERY',{context}),
}));

app.use('/api/report-set',createReportSetRouter(reportSet));
// One production reporting boundary for preview and export prevents renderer drift.
app.use('/api/reports', createReportRouter({ getSession: () => projectDb.getSession(), getAuditLogs: () => appStateDb.getAuditLogs(), reportSet }));

app.post('/api/diagnostics/run', async (req, res) => {
  const ids: string[] = [...new Set<string>(Array.isArray(req.body.deviceIds) ? req.body.deviceIds : [req.body.deviceId].filter(Boolean))];
  const devices = ids.map(id => projectDb.getDeviceById(id)).filter((device): device is NonNullable<typeof device> => Boolean(device));
  if (!devices.length) return res.status(404).json({ error: 'No matching devices were found.' });
  const topology = await advancedScanService.listAdapters().catch(() => []);
  const ownedControllers:AbortController[]=[];
  const taskId=tasks.begin('DIAGNOSTICS',undefined,()=>{for(const controller of ownedControllers)controller.abort();return ownedControllers.length>0;});
  tasks.diagnosticTargets(taskId,devices.map(device=>device.id));
  tasks.update(taskId,{state:'RUNNING',phase:'WORKING',progress:{completed:0,total:devices.length}});
  let finished=0,failed=0,cancelled=0;
  const finishDiagnostic=()=>{finished++;tasks.update(taskId,{state:finished<devices.length?'RUNNING':failed?'FAILED':cancelled?'CANCELLED':'COMPLETED',phase:finished<devices.length?'WORKING':failed?'FAILED':cancelled?'CANCELLED':'DONE',progress:{completed:finished,total:devices.length}});};
  res.status(202).json({ started: devices.map(device => device!.id), taskId });
  for (const device of devices) {
    const current = applyNetworkRelationship(structuredClone(device), topology, projectDb.getDevices());
    diagnosticControllers.get(current.id)?.abort();
    const controller = new AbortController();
    diagnosticControllers.set(current.id, controller);ownedControllers.push(controller);
    const ambiguousIdentity = projectDb.getDevices().some(other => other.id !== current.id && other.network.ipAddress === current.network.ipAddress);
    diagnosticEngine.diagnose(current, {
      signal: controller.signal,
      ambiguousIdentity,
      onEvidence: (evidence, updated) => {if(!controller.signal.aborted&&diagnosticControllers.get(current.id)===controller)broadcast({ type: 'DIAGNOSTIC_EVIDENCE', data: { taskId, deviceId: updated.id, evidence, device: updated } });},
    }).then(updated => {
      if(controller.signal.aborted){cancelled++;tasks.diagnosticResult(taskId,current.id,'CANCELLED');return;}
      projectDb.applyDiagnosticRefresh(updated);
      tasks.diagnosticResult(taskId,current.id,'COMPLETED');
      broadcast({ type: 'DEVICE_DIAGNOSTICS_UPDATED', context: { origin: 'DIAGNOSTICS' }, data: { device: updated, project: projectDb.getProject() } });
    }).catch(error => {
      if(controller.signal.aborted)cancelled++;else failed++;
      tasks.diagnosticResult(taskId,current.id,controller.signal.aborted?'CANCELLED':'FAILED');
      const body=technicianErrorResponse(error,{operation:'DIAGNOSE',deviceId:current.id,fallbackCode:'OPERATION_FAILED'});broadcast({ type: 'DIAGNOSTIC_FAILED', data: { deviceId: current.id, ...body } });
    }).finally(() => {if(diagnosticControllers.get(current.id)===controller)diagnosticControllers.delete(current.id);finishDiagnostic();});
  }
});

app.post('/api/diagnostics/cancel', (req, res) => {
  const ids = Array.isArray(req.body.deviceIds) ? req.body.deviceIds : req.body.deviceId ? [req.body.deviceId] : [...diagnosticControllers.keys()];
  for (const id of ids) diagnosticControllers.get(id)?.abort();
  res.status(202).json({ cancelled: ids });
});

function monitoringState() {
  const diagnosticRefresh=diagnosticMonitor.getState(),incrementalDiscovery={...incrementalMonitor.getState(), pausedForForeground:foregroundDiscovery.isActive(),pausedForSupport:Boolean(receiveMatrix?.isActive() || supportTrace.isActive())};
  const enabled=diagnosticRefresh.enabled&&incrementalDiscovery.enabled;
  const running=diagnosticRefresh.running||incrementalDiscovery.running;
  const deferred=!running&&(Boolean(receiveMatrix?.isActive() || supportTrace.isActive())||(Boolean(incrementalDiscovery.lastSkippedAt)&&(!incrementalDiscovery.lastRunAt||incrementalDiscovery.lastSkippedAt!>incrementalDiscovery.lastRunAt)));
  return { ...diagnosticRefresh, enabled, running, intervalMs:diagnosticRefresh.intervalMs, status:!enabled?'OFF':running?'ACTIVE':deferred?'DEFERRED':'WAITING', diagnosticRefresh, incrementalDiscovery };
};
app.get('/api/diagnostics/refresh', (req, res) => res.json(monitoringState()));
app.get('/api/monitoring/status', (req, res) => res.json(monitoringState()));
app.post('/api/diagnostics/refresh/start', (req, res) => { diagnosticMonitor.start(); incrementalMonitor.start(); res.json(monitoringState()); });
app.post('/api/diagnostics/refresh/stop', (req, res) => { diagnosticMonitor.stop(); incrementalMonitor.stop(); res.json(monitoringState()); });
app.post('/api/monitoring/preferences', (req,res) => {
  const cadence=Number(req.body.cadenceMs),enabled=req.body.enabled;
  if(![15_000,30_000,60_000,120_000].includes(cadence)||typeof enabled!=='boolean')return safeError(res,new Error('Monitoring settings are invalid. Choose an available cadence.'),400,'MONITORING_PREFERENCES');
  diagnosticMonitor.setIntervalMs(cadence);incrementalMonitor.setIntervalMs(cadence);
  if(enabled){diagnosticMonitor.start();incrementalMonitor.start()}else{diagnosticMonitor.stop();incrementalMonitor.stop()}
  res.json(monitoringState());
});
app.post('/api/diagnostics/refresh/run', (req, res) => { res.status(202).json({ started: true }); void diagnosticMonitor.refreshNow(); });
app.post('/api/monitoring/discovery/run', async (_req, res) => res.json({ result: await incrementalMonitor.runNow(), monitoring: monitoringState() }));

// Pair PC to Camera Network — fixed operations only; no arbitrary command surface.
app.get('/api/pair/adapters', async (req, res) => {
  try { res.json(await pairService.getEligibleAdapters()); }
  catch (error) { safeError(res,error,500,'PAIR_ADAPTERS'); }
});
app.get('/api/pair/status', (req, res) => res.json(pairService.getStatus()));
app.get('/api/pair/eligibility', async (req, res) => {
  try { res.json(await pairService.getEligibility(String(req.query.deviceId || ''))); }
  catch (error) { safeError(res, error, 400, 'PAIR_ELIGIBILITY'); }
});
const matchCandidateService=new MatchCandidateService(projectDb);
app.post('/api/network-match/candidates',async(req,res)=>{try{res.json(await matchCandidateService.preview(String(req.body?.deviceId||''),Number(req.body?.interfaceIndex)));}catch(error){safeError(res,error,400,'NETWORK_MATCH_CANDIDATES');}});
app.post('/api/network-match/review',async(req,res)=>{try{const pair=await pairService.prepareMatchPreview(matchCandidateService.takePreview(String(req.body?.previewId||'')));broadcast({type:'PAIR_STATE_CHANGED',data:{pair}});res.json(pair);}catch(error){safeError(res,error,400,'NETWORK_MATCH_REVIEW');}});
app.post('/api/network-match/prepare',async(req,res)=>{try{const pair=await pairService.prepareNetwork(req.body||{});broadcast({type:'PAIR_STATE_CHANGED',data:{pair}});res.json(pair);}catch(error){safeError(res,error,400,'NETWORK_MATCH_PREVIEW');}});
app.post('/api/pair/prepare', async (req, res) => {
  try {
    const pair = await pairService.prepare(String(req.body.deviceId || ''), Number(req.body.interfaceIndex));
    broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair);
  } catch (error: any) { safeError(res,error,400,'PAIR_PREPARE',req.body.deviceId); }
});
app.post('/api/pair/candidate', (req, res) => {
  try { const pair = pairService.selectCandidate(String(req.body.ipAddress || '')); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair); }
  catch (error: any) { safeError(res,error,400,'PAIR_CANDIDATE'); }
});
app.post('/api/pair/confirm', async (req, res) => {
  try {
    if(foregroundDiscovery.isActive()||receiveMatrix?.isActive()||supportTrace.isActive())return res.status(409).json({error:'Finish the active discovery operation before Pair.'});
    await incrementalMonitor.yieldToTechnician(); diagnosticMonitor.cancelCurrent();
    const pair = await pairService.confirmAndApply(String(req.body.sessionId || ''), req.body.confirmed === true);
    broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair, project: projectDb.getProject() } }); res.json(pair);
  } catch (error: any) { const pair = pairService.getStatus(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); safeError(res,error,error?.code === 'ADMIN_REQUIRED' ? 403 : 400,'PAIR_APPLY',pair?.deviceId); }
});
app.post('/api/pair/keep', (_req, res) => { try { res.json(pairService.keepCurrent()); } catch(error:any) { safeError(res,error,400,'PAIR_KEEP'); } });
app.post('/api/pair/retire-legacy', async (req,res) => {
  try{const pair=await pairService.retireLegacy(String(req.body.sessionId||''),req.body.confirmed===true);broadcast({type:'PAIR_STATE_CHANGED',data:{pair}});res.json(pair);}
  catch(error:any){safeError(res,error,400,'PAIR_LEGACY_RETIRE');}
});
app.post('/api/pair/restore', async (req, res) => {
  try { await incrementalMonitor.yieldToTechnician(); diagnosticMonitor.cancelCurrent(); const pair = await pairService.restore(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair, project: projectDb.getProject() } }); res.json(pair); }
  catch (error: any) { const pair = pairService.getStatus(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); safeError(res,error,400,'PAIR_RESTORE',pair?.deviceId); }
});
app.post('/api/pair/cancel', (req, res) => { const pair = pairService.cancelPreparation(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair); });

app.get('/api/connect/browsers', async (req, res) => res.json(await connectService.availableBrowsers()));
app.get('/api/connect/:deviceId', (req, res) => { try { res.json(connectService.resolve(req.params.deviceId)); } catch (error: any) { res.status(404).json({ error: error.message, code: error.code }); } });
app.post('/api/connect/:deviceId/open', async (req, res) => { try { res.json(await connectService.open(req.params.deviceId, req.body.preference || 'SYSTEM')); } catch (error: any) { if(error instanceof ConnectError&&error.accessDecision){res.status(409).json({error:error.message,code:error.code,accessDecision:error.accessDecision});return;}safeError(res,error,400,'CONNECT',req.params.deviceId); } });
app.post('/api/connect/:deviceId/recheck', async (req, res) => { const id = req.params.deviceId; connectRecheckControllers.get(id)?.abort(); const controller = new AbortController(); connectRecheckControllers.set(id, controller); try { const result = await connectService.recheck(id, controller.signal); broadcast({ type: 'DEVICE_DIAGNOSTICS_UPDATED', context: { origin: 'DIAGNOSTICS' }, data: { device: result.device, project: projectDb.getProject() } }); res.json(result); } catch (error: any) { safeError(res,error,400,'CONNECT_RECHECK',id); } finally { connectRecheckControllers.delete(id); } });
app.post('/api/connect/:deviceId/recheck/cancel', (req, res) => { connectRecheckControllers.get(req.params.deviceId)?.abort(); res.status(202).json({ cancelled: true }); });
app.post('/api/connect/:deviceId/activation', (req, res) => { try { res.json({ activationState: connectService.markFirstLogin(req.params.deviceId, req.body.required === true) }); } catch (error: any) { res.status(400).json({ error: error.message }); } });
app.get('/api/connect/:deviceId/credentials', (req, res) => { try { res.json(connectService.safeCredentials(req.params.deviceId)); } catch (error: any) { res.status(404).json({ error: error.message }); } });
app.post('/api/connect/:deviceId/credentials/select', (req, res) => { try { res.json(connectService.associateCredential(req.params.deviceId, String(req.body.credentialId || ''))); } catch (error: any) { res.status(400).json({ error: error.message }); } });
app.post('/api/connect/:deviceId/credentials', async (req, res) => { try { res.json(await connectService.saveCredential(req.params.deviceId, req.body)); } catch (error: any) { res.status(400).json({ error: error.message }); } });
app.put('/api/connect/:deviceId/credentials/:credentialId', async(req,res)=>{try{res.json(await connectService.updateCredential(req.params.deviceId,req.params.credentialId,req.body))}catch(error:any){res.status(400).json({error:error.message})}});
app.delete('/api/connect/:deviceId/credentials/:credentialId', async(req,res)=>{try{res.json(await connectService.deleteCredential(req.params.deviceId,req.params.credentialId))}catch(error:any){res.status(400).json({error:error.message})}});

app.get('/api/system/about', (_req, res) => res.json({ application: 'CCTV Network Assistant', version: '1.6.0', runtime: process.version, platform: process.platform,build:buildIdentity }));
app.get('/api/system/preflight', async (req, res) => { try { res.json(await getPreflight(req.query.refresh==='1')); } catch { res.status(500).json({ error: 'Application readiness checks could not be completed.' }); } });
receiveMatrix=new ReceiveMatrix({busy:()=>supportTrace.isActive()||foregroundDiscovery.isActive()||reverifyWorkflow.isRunning()||(pipelineEngine.getIsRunning()&&!incrementalMonitor.getState().running),pause:()=>incrementalMonitor.yieldToTechnician(),adapters:()=>advancedScanService.listAdapters(),owners:readDiscoveryPortOwners,transport:new NodeOnvifWsDiscoveryTransport(),evidence:wsDiscoveryEvidence,changed:()=>broadcast({type:'MONITORING_STATE',context:{origin:'MONITORING'},data:{monitoring:monitoringState()}})});
app.use('/api/support/ws-discovery/matrix',createReceiveMatrixRouter(receiveMatrix));
app.use('/api/support/ws-discovery/receive-trace',createReceiveTraceRouter({support:supportTrace,portOwners:readDiscoveryPortOwners,foreground:foregroundDiscovery,yieldMonitoring:()=>incrementalMonitor.yieldToTechnician(),busy:()=>Boolean(receiveMatrix?.isActive() || supportTrace.isActive())||reverifyWorkflow.isRunning()||(pipelineEngine.getIsRunning()&&!incrementalMonitor.getState().running),adapters:()=>advancedScanService.listAdapters(),transport:new NodeOnvifWsDiscoveryTransport(),evidence:wsDiscoveryEvidence}));
app.get('/api/system/support-bundle', async (_req, res) => {
  try {
    const preflight = await getPreflight();
    const adapters=await advancedScanService.listAdapters().catch(()=>[]);
    // SupportBundleBuilder recursively filters password|credential|authorization material after this security-event exclusion.
    const supportEvents=appStateDb.getAuditLogs().filter(entry => entry.category !== 'SECURITY');
    taskIntegration.refresh();
    const bundle = supportBundleBuilder.build({currentListSuppression:projectDb.getSuppressionDiagnostics(),tasks:tasks.snapshot(),wsDiscoveryTransport:{...wsDiscoveryEvidence.snapshot(),matrix:receiveMatrix?.snapshot(),supportTrace:supportTrace.snapshot()},application:{name:'CCTV Network Assistant',version:'1.6.0',runtime:process.version,platform:process.platform,build:buildIdentity},readiness:preflight,network:adapters.map(adapter=>({interfaceIndex:adapter.interfaceIndex,interfaceAlias:adapter.interfaceAlias,mediaType:adapter.mediaType,operationalStatus:adapter.operationalStatus,eligible:adapter.eligible,ipv4Addresses:adapter.ipv4Addresses})),monitoring:monitoringState(),discovery:{foreground:foregroundDiscovery.getState(),running:foregroundDiscovery.isActive(),engineRunning:pipelineEngine.getIsRunning(),phases:pipelineEngine.getStates().slice(0,4),advanced:advancedScanService.getStatus()},projectSession:projectDb.getSession(),events:supportEvents,pair:pairService.getStatus()?{purpose:pairService.getStatus()!.purpose||'CAMERA_PAIR',verification:pairService.getStatus()!.verification,cameraResponded:pairService.getStatus()!.cameraReachabilityVerified,adapter:pairService.getStatus()!.adapter,state:pairService.getStatus()!.state,recoveryAvailable:pairService.getStatus()!.recoveryAvailable,errorCode:pairService.getStatus()!.errorCode,preview:{cameraIp:pairService.getStatus()!.cameraIp,interfaceIndex:pairService.getStatus()!.adapter.interfaceIndex,subnetSource:pairService.getStatus()!.subnetSource,candidate:pairService.getStatus()!.selectedCandidate}}:null});
    res.setHeader('Content-Disposition', 'attachment; filename="CCTV_Safe_Support_Bundle.json"'); res.json(bundle);
  } catch { res.status(500).json({ error: 'The safe support bundle could not be generated.' }); }
});

app.get('/api/pipeline/status', (req, res) => {
  res.json(pipelineEngine.getStates());
});

app.post('/api/pipeline/run', async (req, res) => {
  res.status(410).json({ error: 'The legacy automatic pipeline is unavailable. Use Quick Scan and explicit reviewed configuration workflows.' });
});

app.post('/api/pipeline/phase/:num', async (req, res) => {
  res.status(410).json({ error: 'Direct legacy phase execution is unavailable. Use the supported Quick Scan workflow.' });
});

// Device Configuration & ONVIF Parameter Update
app.get('/api/device/:identifier/network/current', async (req, res) => { const controller=new AbortController();cameraNetworkControllers.set(req.params.identifier,controller);try{res.json(await cameraNetworkService.readCurrent(req.params.identifier,String(req.query.credentialId||''),controller.signal))}catch(error:any){safeError(res,error,400,'CAMERA_NETWORK_READ',req.params.identifier)}finally{cameraNetworkControllers.delete(req.params.identifier)}});
app.post('/api/device/:identifier/network/candidates', async (req, res) => { const controller=new AbortController();cameraNetworkControllers.set(req.params.identifier,controller);try{res.json({candidates:await cameraNetworkService.findCandidates(req.params.identifier,Number(req.body.prefixLength),req.body.gateway,controller.signal)})}catch(error:any){res.status(400).json({error:error.message,code:error.code})}finally{cameraNetworkControllers.delete(req.params.identifier)}});
app.post('/api/device/:identifier/network/preview', async (req, res) => { const controller=new AbortController();cameraNetworkControllers.set(req.params.identifier,controller);try{res.json(await cameraNetworkService.preview(req.params.identifier,String(req.body.credentialId||''),req.body.target,controller.signal))}catch(error:any){safeError(res,error,400,'CAMERA_NETWORK_PREVIEW',req.params.identifier)}finally{cameraNetworkControllers.delete(req.params.identifier)}});
app.post('/api/device/:identifier/network/apply', async (req, res) => { try{const result=await cameraNetworkService.apply(String(req.body.planId||''),req.body.confirmed===true);broadcast({type:'DEVICE_NETWORK_CONFIG_UPDATED',data:{result,project:projectDb.getProject()}});res.json(result)}catch(error:any){safeError(res,error,400,'CAMERA_NETWORK_APPLY',req.params.identifier)} });
app.post('/api/device/:identifier/network/cancel', (req,res)=>{cameraNetworkControllers.get(req.params.identifier)?.abort();res.status(202).json({cancelled:cameraNetworkService.cancel(req.params.identifier)})});

// Broader camera configuration — authenticated, previewed, confirmed, and verified server-side.
app.get('/api/device/:identifier/configuration/capabilities',async(req,res)=>{try{res.json(await cameraConfigurationService.inspect(req.params.identifier,String(req.query.credentialId||'')))}catch(error:any){safeError(res,error,400,'CAMERA_CONFIG_READ',req.params.identifier)}});
app.post('/api/device/:identifier/configuration/preview',async(req,res)=>{try{res.json(await cameraConfigurationService.preview(req.params.identifier,String(req.body.credentialId||''),req.body.operation,req.body.proposal))}catch(error:any){safeError(res,error,400,'CAMERA_CONFIG_PREVIEW',req.params.identifier)}});
app.post('/api/device/:identifier/configuration/apply',async(req,res)=>{try{const result=await cameraConfigurationService.apply(String(req.body.planId||''),req.body.confirmed===true);broadcast({type:'DEVICE_CONFIG_UPDATED',data:{result,project:projectDb.getProject()}});res.json(result)}catch(error:any){safeError(res,error,400,'CAMERA_CONFIG_APPLY',req.params.identifier)}});
app.post('/api/device/:identifier/configuration/cancel',(req,res)=>res.status(202).json({cancelled:cameraConfigurationService.cancel(String(req.body.planId||''))}));
app.post('/api/bulk/configuration/plan',async(req,res)=>{try{res.json(await cameraConfigurationService.createBulkPlan(req.body.deviceIds||[],req.body.credentialIds||{},req.body.operation,req.body.proposal))}catch(error:any){safeError(res,error,400,'BULK_CAMERA_CONFIG_PLAN')}});
app.post('/api/bulk/configuration/:batchId/apply',async(req,res)=>{try{const batch=await cameraConfigurationService.applyBulk(req.params.batchId,req.body.confirmed===true);broadcast({type:'BULK_DEVICE_CONFIG_UPDATED',data:{batch,project:projectDb.getProject()}});res.json(batch)}catch(error:any){safeError(res,error,400,'BULK_CAMERA_CONFIG_APPLY')}});
app.post('/api/bulk/configuration/:batchId/cancel',(req,res)=>res.status(202).json({cancelled:cameraConfigurationService.cancelBulk(req.params.batchId)}));
app.post('/api/bulk/configuration/:batchId/retry',async(req,res)=>{try{res.json(await cameraConfigurationService.retryBulk(req.params.batchId))}catch(error:any){res.status(400).json({error:error.message,code:error.code})}});

app.get('/api/device/:identifier/config', (req, res) => {
  try { res.json(legacyConfigurationBoundary.read(req.params.identifier)); }
  catch (error) { res.status(404).json({ status:'UNAVAILABLE', error:error instanceof Error?error.message:'Device not found.' }); }
});

app.post('/api/device/:identifier/config', (req, res) => {
  try {
    const device=legacyConfigurationBoundary.updateLocalMetadata(req.params.identifier,req.body||{});
    appStateDb.logAudit({id:crypto.randomUUID(),timestamp:new Date().toISOString(),category:'SYSTEM',level:'INFO',message:'Local technician metadata updated.',deviceId:device.id});
    broadcast({type:'DEVICE_METADATA_UPDATED',data:{device,project:projectDb.getProject()}});
    res.json({status:'LOCAL_METADATA_UPDATED',device});
  } catch(error) {
    const message=error instanceof Error?error.message:'Local metadata could not be updated.';
    res.status(message.includes('Device not found')?404:message.includes('physical camera')?410:400).json({status:message.includes('physical camera')?'UNSUPPORTED':'UNAVAILABLE',error:message});
  }
});

// PTZ Move Command
app.post('/api/device/:identifier/ptz', (req, res) => {
  res.status(501).json({ error: 'PTZ control is not implemented; no camera command was sent.', code: 'UNSUPPORTED' });
});

// Section 13.2 Duplicate Assistant Drawer
app.get('/api/edge/collisions', (req, res) => {
  res.json(projectDb.getCollisions());
});

app.get('/api/edge/collisions/:collisionId/assistant',(req,res)=>{try{res.json(duplicateAssistantService.get(req.params.collisionId))}catch(error:any){res.status(404).json({error:error.message})}});
app.post('/api/edge/collisions/:collisionId/recheck',async(req,res)=>{try{const result=await duplicateAssistantService.recheck(req.params.collisionId);broadcast({type:'COLLISION_RECHECKED',context:{origin:'MONITORING'},data:{project:projectDb.getProject()}});res.json(result)}catch{res.status(409).json({error:'Collision recheck could not complete. Refresh the current project and retry.'})}});
app.get('/api/edge/collisions/:collisionId',async(req,res)=>{try{res.json(await duplicateRemediationService.get(req.params.collisionId))}catch(error:any){res.status(404).json({error:error.message,code:error.code})}});
app.post('/api/edge/collisions/:collisionId/candidates',async(req,res)=>{try{res.json({candidates:await duplicateRemediationService.candidates(req.params.collisionId,String(req.body.deviceId||''),Number(req.body.prefixLength),req.body.gateway)})}catch(error:any){res.status(400).json({error:error.message,code:error.code})}});
app.post('/api/edge/collisions/:collisionId/preview',async(req,res)=>{try{res.json(await duplicateRemediationService.preview(req.params.collisionId,String(req.body.deviceId||''),String(req.body.credentialId||''),req.body.target))}catch(error:any){safeError(res,error,400,'DUPLICATE_REMEDIATION_PREVIEW',String(req.body.deviceId||''))}});
app.post('/api/edge/collisions/remediation/:remediationId/apply',async(req,res)=>{try{const result=await duplicateRemediationService.apply(req.params.remediationId,req.body.confirmed===true);broadcast({type:'COLLISION_REMEDIATION_UPDATED',data:{result,project:projectDb.getProject()}});res.json(result)}catch(error:any){safeError(res,error,400,'DUPLICATE_REMEDIATION_APPLY')}});
app.post('/api/edge/collisions/remediation/:remediationId/cancel',(req,res)=>res.status(202).json({cancelled:duplicateRemediationService.cancel(req.params.remediationId)}));
app.post('/api/edge/collisions/:collisionId/retry',async(req,res)=>{try{res.json(await duplicateRemediationService.retry(req.params.collisionId,String(req.body.deviceId||''),String(req.body.credentialId||''),req.body.target))}catch(error:any){res.status(400).json({error:error.message,code:error.code})}});
app.post('/api/edge/collisions/:collisionId/rescan',async(req,res)=>{try{const collision=await duplicateRemediationService.afterRescan(req.params.collisionId);broadcast({type:'COLLISION_REMEDIATION_UPDATED',data:{collision,project:projectDb.getProject()}});res.json(collision)}catch(error:any){res.status(400).json({error:error.message,code:error.code})}});
app.post('/api/edge/resolve-collision',(_req,res)=>res.status(410).json({error:'Unsafe in-memory collision resolution was removed. Use the preview, confirm, apply, and verify workflow.',code:'WORKFLOW_REQUIRED'}));

// Section 13.3 Rogue DHCP Auditor
app.get('/api/edge/rogue-dhcp', (req, res) => {
  res.json(projectDb.getRogueDhcpEvents());
});

app.post('/api/edge/rogue-dhcp/test-offer', (req, res) => {
  res.status(410).json({ error: 'Development DHCP-offer injection is not available in the production server.' });
});

// Section 13.1 Legacy Hardware Onboarding
app.post('/api/edge/legacy-onboard', async (req, res) => {
  try { const adapters = await advancedScanService.listAdapters().catch(() => []); const dev = LegacyHardwareOnboarding.onboardLegacyDevice(req.body, adapters); broadcast({ type: 'DEVICE_ONBOARDED', data: { device: dev, project: projectDb.getProject() } }); res.json(dev); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Manual device entry failed.' }); }
});

// Section 13.4 OS Credential Vault
app.get('/api/vault/credentials', (req, res) => {
  res.json(osVault.getSafeReferences());
});

app.post('/api/vault/flush', (req, res) => {
  osVault.flushTokens();
  res.json({ message: 'OS Credential Vault temporary tokens and backoff states flushed.' });
});

// Audit Logs
app.get('/api/audit-logs', (req, res) => {
  res.json(appStateDb.getAuditLogs());
});

app.use(productionAssets());

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[CCTV Discovery Server v1.6] running on http://localhost:${PORT}`);
});

const activeControllers = function* () { yield* diagnosticControllers.values(); yield* connectRecheckControllers.values(); yield* cameraNetworkControllers.values(); };
const combinedMonitor = { stop: () => { diagnosticMonitor.stop(); incrementalMonitor.stop(); }, cancelCurrent: () => { diagnosticMonitor.cancelCurrent(); supportTrace.stop(supportTrace.snapshot()?.sessionId); receiveMatrix?.stop(receiveMatrix.snapshot()?.sessionId); foregroundDiscovery.stop(foregroundDiscovery.getState().session?.sessionId); pipelineEngine.stopDiscovery(); } };
const shutdown = new ShutdownCoordinator(
  pipelineEngine,
  combinedMonitor,
  { [Symbol.iterator]: activeControllers },
  () => new Promise(resolve => { for (const client of wss.clients) client.terminate(); wss.close(() => resolve()); }),
  () => new Promise(resolve => server.close(() => resolve())),
);
let terminating = false;
const terminate = (signal: string) => { if (terminating) return; terminating = true; clearInterval(browserSessionTimer); cameraRenderers.dispose(); cameraBrowserSessions.clear(); console.info(`[Shutdown] ${signal}: stopping discovery, diagnostics, sockets, and HTTP service.`); void shutdown.shutdown().finally(() => { console.info('[Shutdown] Complete. Pair recovery state was preserved.'); process.exitCode = 0; }); };
process.once('SIGINT', () => terminate('SIGINT'));
process.once('SIGTERM', () => terminate('SIGTERM'));
