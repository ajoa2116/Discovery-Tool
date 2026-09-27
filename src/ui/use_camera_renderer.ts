import { useEffect, useRef, useState } from 'react';
import { CameraBrowserSession, IframeCameraRenderer } from '../shared/camera_renderer.ts';
import { requestJson } from './bounded_request.ts';

/** Secrets live only in this effect closure, never in renderer state or camera props. */
export function useCameraRenderer(deviceId: string, origin: string | null, evidenceKey: string) {
  const model = useRef(new IframeCameraRenderer());
  const [, render] = useState(0);
  const update = () => render(n => n + 1);
  const bound = useRef('');
  const key = JSON.stringify([deviceId, origin, evidenceKey]);
  useEffect(() => {
    const renderer = model.current;
    renderer.close(); bound.current = key; update();
    if (!origin) return;
    let stopped = false, token = '', id = '', deadline: ReturnType<typeof setTimeout> | undefined, poll: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const headers = () => ({ 'Content-Type': 'application/json', 'X-CCTV-Workspace': '1', 'X-CCTV-Browser-Token': token });
    const close = () => { if (id && token) void fetch(`http://localhost:3001/api/camera-browser/sessions/${encodeURIComponent(id)}/close`, { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), keepalive: true }).catch(() => {}); };
    const block = () => { renderer.block(); update(); close(); };
    const accept = (session: CameraBrowserSession) => {
      if (!session || session.deviceId !== deviceId || session.origin !== origin || session.renderer !== 'IFRAME' || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw Error();
      if (id && session.sessionId !== id) throw Error();
      return session;
    };
    const status = async () => {
      try {
        const result = await requestJson(`http://localhost:3001/api/camera-browser/sessions/${encodeURIComponent(id)}/status`, { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), signal: controller.signal }, fetch, 2000);
        if (stopped) return;
        if (!result.response.ok) throw Error();
        accept((result.body as { session: CameraBrowserSession }).session);
        poll = setTimeout(() => void status(), 2000);
      } catch { if (!stopped) block(); }
    };
    void (async () => {
      try {
        const result = await requestJson('http://localhost:3001/api/camera-browser/sessions', { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), signal: controller.signal }, fetch, 5000);
        const body = result.body as { session: CameraBrowserSession; controlToken: string };
        if (!result.response.ok || typeof body.controlToken !== 'string') throw Error();
        const session = accept(body.session); token = body.controlToken; id = session.sessionId;
        if (stopped) { close(); return; }
        renderer.open(session); update();
        deadline = setTimeout(() => { if (!stopped) block(); }, session.expiresAt - Date.now());
        poll = setTimeout(() => void status(), 2000);
      } catch { if (!stopped) block(); }
    })();
    return () => { stopped = true; controller.abort(); clearTimeout(deadline); clearTimeout(poll); close(); renderer.close(); };
  }, [key]);
  const act = (action: 'refresh' | 'goBack' | 'goForward' | 'displayed' | 'fail') => { model.current[action](); update(); };
  return { renderer: model.current, current: bound.current === key, act };
}
