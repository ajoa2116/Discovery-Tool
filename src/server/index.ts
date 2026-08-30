import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { pipelineEngine } from '../core/engine/pipeline.ts';
import { projectDb } from '../core/storage/project_db.ts';
import { appStateDb } from '../core/storage/app_db.ts';
import { osVault } from '../core/storage/vault.ts';
import { DuplicateAssistantDrawer } from '../core/edge_cases/duplicate_drawer.ts';
import { RogueDHCPAuditor } from '../core/edge_cases/rogue_dhcp.ts';
import { LegacyHardwareOnboarding } from '../core/edge_cases/legacy_hardware.ts';
import { OnvifDriver } from '../core/drivers/onvif.ts';
import { AvailableIpFinder } from '../core/engine/ip_finder.ts';
import { BulkReIpEngine } from '../core/engine/bulk_reip.ts';
import { ProjectReverificationEngine } from '../core/engine/reverification.ts';
import { ProjectValidationError } from '../core/storage/project_db.ts';
import { DeviceDiagnosticEngine, DiagnosticRefreshMonitor } from '../core/engine/diagnostic_engine.ts';
import { PairService } from '../core/network/pair_service.ts';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const diagnosticEngine = new DeviceDiagnosticEngine();
const diagnosticControllers = new Map<string, AbortController>();
const pairService = new PairService();

app.use(cors());
app.use(express.json());

// Broadcast WebSocket message to all connected clients
const broadcast = (data: any) => {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};

const diagnosticMonitor = new DiagnosticRefreshMonitor(
  diagnosticEngine,
  () => projectDb.getDevices(),
  device => {
    projectDb.upsertDevice(device);
    broadcast({ type: 'DEVICE_DIAGNOSTICS_UPDATED', data: { device, project: projectDb.getProject(), refresh: diagnosticMonitor.getState() } });
  },
  30_000,
  3,
);
diagnosticMonitor.start();
pairService.initializeRecovery().then(state => {
  if (state) broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair: state } });
}).catch(error => console.error('Pair recovery inspection failed:', error instanceof Error ? error.message : error));

// Wire pipeline events to WebSocket clients
pipelineEngine.subscribe(event => {
  broadcast(event);
});

// ==================== REST API ROUTES ====================

// Project & Devices
app.get('/api/project', (req, res) => {
  res.json(projectDb.getProject());
});

app.get('/api/project/session', (req, res) => {
  res.json(projectDb.getSession());
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

app.post('/api/project/reverify', (req, res) => {
  try {
    const result = ProjectReverificationEngine.reverifyActiveProject(req.body.liveDevices || []);
    broadcast({ type: 'PROJECT_REVERIFIED', data: { result, project: projectDb.getProject() } });
    res.json({ result, project: projectDb.getProject() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
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
  const prefix = (req.query.prefix as string) || '192.168.1';
  const start = parseInt((req.query.start as string) || '100');
  const end = parseInt((req.query.end as string) || '240');
  const available = AvailableIpFinder.scanAvailableIps(prefix, start, end);
  res.json({ prefix, available });
});

// Bulk Re-IP (Section 5)
app.post('/api/bulk/re-ip/plan', (req, res) => {
  const { macs, startIp, subnetMask, gateway, step } = req.body;
  const result = BulkReIpEngine.generatePlan(macs, startIp, subnetMask, gateway, step || 1);
  res.json(result);
});

app.post('/api/bulk/re-ip/execute', async (req, res) => {
  const { plan } = req.body;
  const result = await BulkReIpEngine.executeBatch(plan);
  broadcast({ type: 'BULK_REIP_COMPLETE', data: { result, project: projectDb.getProject() } });
  res.json(result);
});

// 6-Phase Pipeline
app.post('/api/discovery/start', (req, res) => {
  if (pipelineEngine.getIsRunning()) {
    return res.status(409).json({ error: 'A discovery scan is already running.' });
  }
  res.status(202).json({ message: 'ONVIF discovery scan started.' });
  pipelineEngine.runDiscoveryScan().catch(error => {
    console.error('Discovery scan failed:', error);
    broadcast({ type: 'SCAN_FAILED', data: { message: error instanceof Error ? error.message : String(error) } });
  });
});

app.post('/api/diagnostics/run', async (req, res) => {
  const ids: string[] = Array.isArray(req.body.deviceIds) ? req.body.deviceIds : [req.body.deviceId].filter(Boolean);
  const devices = ids.map(id => projectDb.getDeviceById(id)).filter((device): device is NonNullable<typeof device> => Boolean(device));
  if (!devices.length) return res.status(404).json({ error: 'No matching devices were found.' });
  res.status(202).json({ started: devices.map(device => device!.id) });
  for (const device of devices) {
    const current = device!;
    diagnosticControllers.get(current.id)?.abort();
    const controller = new AbortController();
    diagnosticControllers.set(current.id, controller);
    const ambiguousIdentity = projectDb.getDevices().some(other => other.id !== current.id && other.network.ipAddress === current.network.ipAddress);
    diagnosticEngine.diagnose(current, {
      signal: controller.signal,
      ambiguousIdentity,
      onEvidence: (evidence, updated) => broadcast({ type: 'DIAGNOSTIC_EVIDENCE', data: { deviceId: updated.id, evidence, device: updated } }),
    }).then(updated => {
      projectDb.upsertDevice(updated);
      broadcast({ type: 'DEVICE_DIAGNOSTICS_UPDATED', data: { device: updated, project: projectDb.getProject() } });
    }).catch(error => {
      broadcast({ type: 'DIAGNOSTIC_FAILED', data: { deviceId: current.id, message: error instanceof Error ? error.message : 'Diagnostic check failed.' } });
    }).finally(() => diagnosticControllers.delete(current.id));
  }
});

app.post('/api/diagnostics/cancel', (req, res) => {
  const ids = Array.isArray(req.body.deviceIds) ? req.body.deviceIds : req.body.deviceId ? [req.body.deviceId] : [...diagnosticControllers.keys()];
  for (const id of ids) diagnosticControllers.get(id)?.abort();
  res.status(202).json({ cancelled: ids });
});

app.get('/api/diagnostics/refresh', (req, res) => res.json(diagnosticMonitor.getState()));
app.post('/api/diagnostics/refresh/start', (req, res) => { diagnosticMonitor.start(); res.json(diagnosticMonitor.getState()); });
app.post('/api/diagnostics/refresh/stop', (req, res) => { diagnosticMonitor.stop(); res.json(diagnosticMonitor.getState()); });
app.post('/api/diagnostics/refresh/run', (req, res) => { res.status(202).json({ started: true }); void diagnosticMonitor.refreshNow(); });

// Pair PC to Camera Network — fixed operations only; no arbitrary command surface.
app.get('/api/pair/adapters', async (req, res) => {
  try { res.json(await pairService.getEligibleAdapters()); }
  catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to inspect Windows adapters.' }); }
});
app.get('/api/pair/status', (req, res) => res.json(pairService.getStatus()));
app.post('/api/pair/prepare', async (req, res) => {
  try {
    const pair = await pairService.prepare(String(req.body.deviceId || ''), Number(req.body.interfaceIndex));
    broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair);
  } catch (error: any) { res.status(400).json({ error: error?.message || 'Pair preparation failed.', code: error?.code }); }
});
app.post('/api/pair/candidate', (req, res) => {
  try { const pair = pairService.selectCandidate(String(req.body.ipAddress || '')); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair); }
  catch (error: any) { res.status(400).json({ error: error?.message || 'Candidate selection failed.', code: error?.code }); }
});
app.post('/api/pair/confirm', async (req, res) => {
  try {
    const pair = await pairService.confirmAndApply(String(req.body.sessionId || ''), req.body.confirmed === true);
    broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair, project: projectDb.getProject() } }); res.json(pair);
  } catch (error: any) { const pair = pairService.getStatus(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.status(error?.code === 'ADMIN_REQUIRED' ? 403 : 400).json({ error: error?.message || 'Pair failed.', code: error?.code, pair }); }
});
app.post('/api/pair/restore', async (req, res) => {
  try { const pair = await pairService.restore(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair); }
  catch (error: any) { const pair = pairService.getStatus(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.status(400).json({ error: error?.message || 'Restore failed.', code: error?.code, pair }); }
});
app.post('/api/pair/cancel', (req, res) => { const pair = pairService.cancelPreparation(); broadcast({ type: 'PAIR_STATE_CHANGED', data: { pair } }); res.json(pair); });

app.post('/api/discovery/stop', (req, res) => {
  const stopped = pipelineEngine.stopDiscovery();
  res.status(stopped ? 202 : 409).json({
    stopped,
    message: stopped ? 'Discovery cancellation requested.' : 'No discovery scan is running.',
  });
});

app.get('/api/discovery/status', (req, res) => {
  res.json({ running: pipelineEngine.getIsRunning(), phases: pipelineEngine.getStates().slice(0, 4) });
});

app.get('/api/pipeline/status', (req, res) => {
  res.json(pipelineEngine.getStates());
});

app.post('/api/pipeline/run', async (req, res) => {
  res.json({ message: '6-Phase batch execution sequence started.' });
  pipelineEngine.runFullPipeline().catch(console.error);
});

app.post('/api/pipeline/phase/:num', async (req, res) => {
  const phaseNum = parseInt(req.params.num);
  try {
    if (phaseNum === 1) await pipelineEngine.runPhase1();
    else if (phaseNum === 2) await pipelineEngine.runPhase2();
    else if (phaseNum === 3) await pipelineEngine.runPhase3();
    else if (phaseNum === 4) await pipelineEngine.runPhase4();
    else if (phaseNum === 5) await pipelineEngine.runPhase5();
    else if (phaseNum === 6) await pipelineEngine.runPhase6();
    else return res.status(400).json({ error: 'Invalid phase number' });
    
    res.json({ message: `Phase ${phaseNum} completed.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device Configuration & ONVIF Parameter Update
app.get('/api/device/:identifier/config', (req, res) => {
  const dev = projectDb.getDeviceByIdentifier(req.params.identifier);
  if (!dev) return res.status(404).json({ error: 'Device not found' });
  res.json({
    device: dev,
    onvifConfig: dev.onvifConfig || OnvifDriver.createDefaultOnvifConfig(dev.network.ipAddress),
    manufacturerParams: dev.manufacturerParams || {},
  });
});

app.post('/api/device/:identifier/config', (req, res) => {
  const dev = projectDb.getDeviceByIdentifier(req.params.identifier);
  if (!dev) return res.status(404).json({ error: 'Device not found' });

  const { onvifConfig, manufacturerParams, networkSettings, technician } = req.body;
  if (onvifConfig) dev.onvifConfig = onvifConfig;
  if (manufacturerParams) dev.manufacturerParams = { ...dev.manufacturerParams, ...manufacturerParams };
  if (networkSettings) {
    if (networkSettings.ipAddress) dev.network.ipAddress = networkSettings.ipAddress;
    if (networkSettings.subnetMask) dev.network.subnetMask = networkSettings.subnetMask;
    if (networkSettings.gateway) dev.network.gateway = networkSettings.gateway;
  }
  if (technician) projectDb.updateDeviceTechnicianFields(dev.id, technician);

  dev.lastSeenAt = new Date().toISOString();
  projectDb.upsertDevice(dev);

  appStateDb.logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    category: 'PROVISIONING',
    level: 'INFO',
    message: `Parameters updated for ${dev.anchor.vendor} (${dev.anchor.macAddress})`,
    deviceId: dev.id,
  });

  broadcast({ type: 'DEVICE_CONFIG_UPDATED', data: { device: dev, project: projectDb.getProject() } });
  res.json({ success: true, device: dev });
});

// PTZ Move Command
app.post('/api/device/:identifier/ptz', (req, res) => {
  const dev = projectDb.getDeviceByIdentifier(req.params.identifier);
  if (!dev) return res.status(404).json({ error: 'Device not found' });
  const { pan, tilt, zoom } = req.body;
  const envelope = OnvifDriver.createPtzContinuousMoveEnvelope(pan || 0, tilt || 0, zoom || 0);
  res.json({ success: true, deviceId: dev.id, message: `PTZ Velocity (${pan}, ${tilt}, ${zoom}) dispatched`, soapEnvelope: envelope });
});

// Section 13.2 Duplicate Assistant Drawer
app.get('/api/edge/collisions', (req, res) => {
  res.json(projectDb.getCollisions());
});

app.post('/api/edge/resolve-collision', (req, res) => {
  const { collidingIp, resolutions } = req.body;
  const result = DuplicateAssistantDrawer.resolveCollision(collidingIp, resolutions);
  broadcast({ type: 'COLLISION_RESOLVED', data: { collidingIp, project: projectDb.getProject() } });
  res.json(result);
});

// Section 13.3 Rogue DHCP Auditor
app.get('/api/edge/rogue-dhcp', (req, res) => {
  res.json(projectDb.getRogueDhcpEvents());
});

app.post('/api/edge/rogue-dhcp/test-offer', (req, res) => {
  const offer = req.body;
  const result = RogueDHCPAuditor.inspectDHCPOffer(offer);
  broadcast({ type: 'ROGUE_DHCP_ALERT', data: { offer, result } });
  res.json(result);
});

// Section 13.1 Legacy Hardware Onboarding
app.post('/api/edge/legacy-onboard', (req, res) => {
  const dev = LegacyHardwareOnboarding.onboardLegacyDevice(req.body);
  broadcast({ type: 'DEVICE_ONBOARDED', data: { device: dev, project: projectDb.getProject() } });
  res.json(dev);
});

// Section 13.4 OS Credential Vault
app.get('/api/vault/credentials', (req, res) => {
  res.json(osVault.getAllCredentials());
});

app.post('/api/vault/flush', (req, res) => {
  osVault.flushTokens();
  res.json({ message: 'OS Credential Vault temporary tokens and backoff states flushed.' });
});

// Audit Logs
app.get('/api/audit-logs', (req, res) => {
  res.json(appStateDb.getAuditLogs());
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`[CCTV Discovery Server v1.6] running on http://localhost:${PORT}`);
});
