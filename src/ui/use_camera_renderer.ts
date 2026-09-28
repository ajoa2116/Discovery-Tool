import { useEffect, useRef, useState } from 'react';
import { CameraBrowserSession, CameraBrowserRenderer, CameraRendererSnapshot, IframeCameraRenderer, NativeCameraRenderer, NativeWorkspaceCode } from '../shared/camera_renderer.ts';
import { requestJson } from './bounded_request.ts';

/** Secrets live only in this effect closure, never in renderer state or camera props. */
export function useCameraRenderer(deviceId: string, origin: string | null, evidenceKey: string) {
  const model = useRef<CameraBrowserRenderer>(new IframeCameraRenderer());
  const [notice, setNotice] = useState<NativeWorkspaceCode | null>(null);
  const command = useRef<(action: string) => void>(() => {});
  const nativeEvidence = useRef<string | null>(null);
  const [, render] = useState(0);
  const update = () => render(n => n + 1);
  const bound = useRef('');
  const key = JSON.stringify([deviceId, origin, evidenceKey]);
  useEffect(() => {
    let renderer = model.current;
    renderer.close(); bound.current = key; setNotice(null); update();
    if (nativeEvidence.current && nativeEvidence.current !== key) { renderer.block(); update(); return; }
    if (!origin) return;
    let stopped = false, token = '', id = '', deadline: ReturnType<typeof setTimeout> | undefined, poll: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const headers = () => ({ 'Content-Type': 'application/json', 'X-CCTV-Workspace': '1', 'X-CCTV-Browser-Token': token });
    const close = () => { if (id && token) void fetch(`http://localhost:3001/api/camera-browser/controls/${encodeURIComponent(id)}/close`, { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), keepalive: true }).catch(() => {}); };
    const block = () => { renderer.block(); update(); close(); };
    const accept = (session: CameraBrowserSession) => {
      if (!session || session.deviceId !== deviceId || session.origin !== origin || !['IFRAME', 'WINDOWS_WEBVIEW2'].includes(session.renderer) || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw Error();
      if (id && session.sessionId !== id) throw Error();
      return session;
    };
    const status = async () => {
      try {
        const result = await requestJson(`http://localhost:3001/api/camera-browser/controls/${encodeURIComponent(id)}/status`, { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), signal: controller.signal }, fetch, 2000);
        if (stopped) return;
        if (!result.response.ok) throw Error();
        const body = result.body as { session: CameraBrowserSession; snapshot: CameraRendererSnapshot };
        accept(body.session);
        if (renderer instanceof NativeCameraRenderer) { renderer.accept(body.snapshot); update(); }
        poll = setTimeout(() => void status(), 1000);
      } catch { if (!stopped) block(); }
    };
    command.current = action => {
      void requestJson(`http://localhost:3001/api/camera-browser/controls/${encodeURIComponent(id)}/command`, { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId, command: action }), signal: controller.signal }, fetch, 2000).then(result => { if (!stopped && !result.response.ok) block(); }).catch(() => { if (!stopped) block(); });
    };
    void (async () => {
      try {
        const result = await requestJson('http://localhost:3001/api/camera-browser/open', { method: 'POST', headers: headers(), body: JSON.stringify({ deviceId }), signal: controller.signal }, fetch, 8000);
        const body = result.body as { session: CameraBrowserSession; controlToken: string; snapshot: CameraRendererSnapshot };
        if (!result.response.ok || typeof body.controlToken !== 'string') throw Error();
        const session = accept(body.session); token = body.controlToken; id = session.sessionId;
        if (stopped) { close(); return; }
        renderer = session.renderer === 'WINDOWS_WEBVIEW2' ? new NativeCameraRenderer() : new IframeCameraRenderer();
        model.current = renderer; renderer.open(session);
        if (renderer instanceof NativeCameraRenderer) { nativeEvidence.current = key; renderer.accept(body.snapshot); }
        else setNotice(body.snapshot?.code || null);
        update();
        deadline = setTimeout(() => { if (!stopped) block(); }, session.expiresAt - Date.now());
        poll = setTimeout(() => void status(), 2000);
      } catch { if (!stopped) block(); }
    })();
    return () => { stopped = true; controller.abort(); clearTimeout(deadline); clearTimeout(poll); close(); renderer.close(); };
  }, [key]);
  const act = (action: 'refresh' | 'goBack' | 'goForward' | 'displayed' | 'fail') => {
    if (model.current instanceof NativeCameraRenderer) { const cmd = { refresh: 'REFRESH', goBack: 'BACK', goForward: 'FORWARD', displayed: '', fail: '' }[action]; if (cmd) command.current(cmd); }
    else model.current[action](); update();
  };
  return { renderer: model.current, current: bound.current === key, notice, act };
}
