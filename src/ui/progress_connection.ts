export type ProgressConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
/** One owned socket, bounded backoff, and a deferred initial connect for StrictMode cleanup. */
export function connectProgress(onMessage: (event: MessageEvent) => void, onState: (state: ProgressConnectionState) => void,
  create: () => WebSocket = () => new WebSocket('ws://localhost:3001/ws')) {
  let stopped = false, socket: WebSocket | null = null, attempt = 0;
  let timer: ReturnType<typeof setTimeout>, handshake: ReturnType<typeof setTimeout>;
  const discard = () => {
    clearTimeout(handshake);
    if (!socket) return;
    const current = socket; socket = null;
    current.onopen = current.onmessage = current.onerror = current.onclose = null;
    if (current.readyState < 2) current.close();
  };
  const retry = () => {
    if (stopped) return;
    discard(); onState('RECONNECTING');
    clearTimeout(timer); timer = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt++, 4), 10000));
  };
  const connect = () => {
    if (stopped) return;
    try {
      const current = create(); socket = current;
      handshake = setTimeout(retry, 10000);
      current.onopen = () => { if (socket !== current || stopped) return; clearTimeout(handshake); attempt = 0; onState('CONNECTED'); };
      current.onmessage = event => { if (socket === current && !stopped) onMessage(event); };
      current.onerror = current.onclose = () => { if (socket === current && !stopped) retry(); };
    } catch { retry(); }
  };
  onState('CONNECTING'); timer = setTimeout(connect, 0);
  return () => { stopped = true; clearTimeout(timer); discard(); };
}
