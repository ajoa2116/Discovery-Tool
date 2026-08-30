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

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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

// Wire pipeline events to WebSocket clients
pipelineEngine.subscribe(event => {
  broadcast(event);
});

// ==================== REST API ROUTES ====================

// Project & Devices
app.get('/api/project', (req, res) => {
  res.json(projectDb.getProject());
});

app.get('/api/project/devices', (req, res) => {
  res.json(projectDb.getDevices());
});

app.get('/api/project/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=cctv_site_export.cctvproj');
  res.send(projectDb.exportProjectJson());
});

// 6-Phase Pipeline
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
