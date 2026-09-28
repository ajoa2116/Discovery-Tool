// UI fixture only. The actual authorization/security policy is tested in camera_browser_sessions.test.ts.
module.exports = async function cameraSessionMock(page) {
 await page.addInitScript(() => {
  const old = window.fetch, leases = new Map();
  window.fetch = async (url, options = {}) => {
   const path = new URL(url, location.href).pathname;
   if (!path.startsWith('/api/camera-browser/')) return old(url, options);
   const t = window.__test, body = JSON.parse(options.body || '{}');
   (t.browserSessions ||= []).push({ path, body });
   const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
   if (path === '/api/camera-browser/open') {
    if (t.browserSessionFailure) return json({}, 409);
    const d = t.project.devices.find(d => d.id === body.deviceId);
    if (!d) return json({}, 409);
    const session = { version: 1, sessionId: crypto.randomUUID(), deviceId: d.id, address: d.network.ipAddress, origin: 'http://' + d.network.ipAddress, display: { name: d.anchor.vendor, manufacturer: d.anchor.vendor }, createdAt: Date.now(), expiresAt: Date.now() + 300000, renderer: 'IFRAME' };
    leases.set(session.sessionId, session); return json({ session, controlToken: 'cbi_' + 'x'.repeat(43), snapshot: { code: 'HOST_UNAVAILABLE', canGoBack: false, canGoForward: false } });
   }
   if (!path.startsWith('/api/camera-browser/controls/')) return json({}, 404);
   const id = path.split('/')[4], session = leases.get(id);
   if (path.endsWith('/close')) { leases.delete(id); return json({ closed: true }); }
   if (!session || t.browserSessionFailure || Date.now() >= session.expiresAt) return json({}, 409);
   return json({ session });
  };
 });
};
