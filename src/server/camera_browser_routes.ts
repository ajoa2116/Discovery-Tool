import { Router, json, ErrorRequestHandler } from 'express';
import { CameraBrowserSessions } from '../core/connect/camera_browser_sessions.ts';

/** Browser-origin protection for iframe leases only, NOT native process authentication. */
export function cameraBrowserOriginAllowed(host: string | undefined, origin: string | undefined, marker: string | undefined, development = false) {
  const hosts = ['localhost:3001', '127.0.0.1:3001'];
  const origins = hosts.map(h => `http://${h}`);
  if (development) origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  return Boolean(host && hosts.includes(host) && origin && origins.includes(origin) && marker === '1');
}
export function cameraBrowserRoutes(sessions: CameraBrowserSessions, development = false) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!cameraBrowserOriginAllowed(req.headers.host, req.get('Origin'), req.get('X-CCTV-Workspace'), development)) {
      res.status(403).json({ error: 'Camera workspace request unavailable.' }); return;
    }
    next();
  });
  router.use(json({ limit: '2kb' }));
  router.post('/sessions', (req, res) => {
    try {
      if (!req.is('application/json') || Object.keys(req.body || {}).some(k => k !== 'deviceId') || typeof req.body?.deviceId !== 'string') throw Error();
      const result = sessions.createIframe(req.body.deviceId);
      // Deliberate, scoped secret response. Never passed to camera DOM/URL or persistence.
      res.json({ session: result.session, controlToken: result.secret.expose() });
    } catch { res.status(409).json({ error: 'Camera browser authorization unavailable. Reopen using current evidence.' }); }
  });
  for (const action of ['status', 'close'] as const) router.post(`/sessions/:sessionId/${action}`, (req, res) => {
    try {
      if (Object.keys(req.body || {}).some(k => k !== 'deviceId') || typeof req.body?.deviceId !== 'string') throw Error();
      const args = [req.params.sessionId, req.body.deviceId, req.get('X-CCTV-Browser-Token') || ''] as const;
      if (action === 'close') { sessions.closeIframe(...args); res.json({ closed: true }); }
      else res.json({ session: sessions.iframeStatus(...args) });
    } catch { res.status(409).json({ error: 'Camera browser authorization unavailable. Reopen using current evidence.' }); }
  });
  // No redemption/host endpoint and no delegation to other application routers.
  router.use((_req, res) => { res.status(404).json({ error: 'Camera browser operation unavailable.' }); });
  const malformed: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(400).json({ error: 'Camera workspace request unavailable.' }); };
  router.use(malformed);
  return router;
}
