import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { TLSSocket } from 'node:tls';
import { Device, DiagnosticCheckEvidence, DiagnosticErrorCategory } from '../../types/index.ts';
import { DEFAULT_MONITORING_INTERVAL_MS } from './incremental_discovery_monitor.ts';
import { DIFFERENT_NETWORK_MESSAGE } from '../../shared/network_relationship.ts';

export interface PingProvider {
  check(ipAddress: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<DiagnosticCheckEvidence>;
}

export interface HttpDiagnosticProvider {
  check(ipAddress: string, options: { protocol: 'http' | 'https'; port: number; timeoutMs: number; signal?: AbortSignal }): Promise<DiagnosticCheckEvidence>;
}

export interface TcpDiagnosticProvider {
  check(ipAddress: string, options: { port: number; timeoutMs: number; signal?: AbortSignal; localAddress?: string }): Promise<DiagnosticCheckEvidence>;
}

export interface DiagnosticProviders {
  ping: PingProvider;
  http: HttpDiagnosticProvider;
  tcp: TcpDiagnosticProvider;
}

export interface DiagnosticRunOptions {
  signal?: AbortSignal;
  isRefresh?: boolean;
  ambiguousIdentity?: boolean;
  onEvidence?: (evidence: DiagnosticCheckEvidence, device: Device) => void;
}

function categoryFor(error: Error & { code?: string | number | null }, cancelled = false): DiagnosticErrorCategory {
  if (cancelled || error.name === 'AbortError') return 'CANCELLED';
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') return 'TIMEOUT';
  if (error.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') return 'NETWORK_UNREACHABLE';
  return 'TRANSPORT_ERROR';
}

function safeErrorMessage(category: DiagnosticErrorCategory): string {
  const messages: Record<DiagnosticErrorCategory, string> = {
    TIMEOUT: 'The check timed out.', CONNECTION_REFUSED: 'The device refused the connection.',
    NETWORK_UNREACHABLE: 'The target network is unreachable.', TLS_CERTIFICATE: 'The camera certificate is not trusted.',
    CANCELLED: 'The check was cancelled.', MALFORMED_RESPONSE: 'The service returned a malformed response.',
    TRANSPORT_ERROR: 'The transport check failed.', UNKNOWN: 'The check failed for an unknown reason.',
  };
  return messages[category];
}

export class WindowsPingProvider implements PingProvider {
  constructor(private readonly runPing: typeof execFile = execFile) {}

  public check(ipAddress: string, options: { timeoutMs: number; signal?: AbortSignal }): Promise<DiagnosticCheckEvidence> {
    const started = performance.now();
    return new Promise(resolve => {
      this.runPing('ping.exe', ['-n', '1', '-w', String(options.timeoutMs), ipAddress], { windowsHide: true, timeout: options.timeoutMs + 750, signal: options.signal, maxBuffer: 64 * 1024 }, (error, stdout) => {
        const timestamp = new Date().toISOString();
        // Windows can exit successfully for an ICMP error from a gateway.
        // Require the target address and an IPv4 echo-reply TTL on the same line.
        const reply = stdout.split(/\r?\n/).find(line =>
          line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)?.includes(ipAddress) && /\bTTL=\s*\d+\b/i.test(line));
        if (!error && reply && !options.signal?.aborted) {
          const match = reply.match(/time[=<]\s*(\d+)ms/i);
          resolve({ type: 'PING', targetIp: ipAddress, protocol: 'ICMP', success: true, transportReachable: true, responseTimeMs: match ? Number(match[1]) : Math.round(performance.now() - started), timestamp });
          return;
        }
        const category = options.signal?.aborted ? 'CANCELLED' : stdout.includes('Request timed out') ? 'TIMEOUT' : error ? categoryFor(error, false) : 'MALFORMED_RESPONSE';
        resolve({ type: 'PING', targetIp: ipAddress, protocol: 'ICMP', success: false, timeout: category === 'TIMEOUT', errorCategory: category, errorMessage: safeErrorMessage(category), timestamp });
      });
    });
  }
}

export class NodeHttpDiagnosticProvider implements HttpDiagnosticProvider {
  public async check(ipAddress: string, options: { protocol: 'http' | 'https'; port: number; timeoutMs: number; signal?: AbortSignal }): Promise<DiagnosticCheckEvidence> {
    const head = await this.request(ipAddress, options, 'HEAD');
    if (head.httpStatus === 405 || head.httpStatus === 501) return this.request(ipAddress, options, 'GET');
    return head;
  }

  private request(ipAddress: string, options: { protocol: 'http' | 'https'; port: number; timeoutMs: number; signal?: AbortSignal }, method: 'HEAD' | 'GET'): Promise<DiagnosticCheckEvidence> {
    const started = performance.now();
    const type = options.protocol === 'https' ? 'HTTPS' : 'HTTP';
    return new Promise(resolve => {
      let settled = false;
      let certificateTrusted: boolean | undefined;
      let certificateWarning: string | undefined;
      const finish = (evidence: DiagnosticCheckEvidence) => {
        if (settled) return;
        settled = true;
        resolve({ ...evidence, responseTimeMs: Math.round(performance.now() - started), timestamp: new Date().toISOString() });
      };
      const transport = options.protocol === 'https' ? https : http;
      const request = transport.request({ host: ipAddress, port: options.port, path: '/', method, signal: options.signal, timeout: options.timeoutMs, headers: { 'User-Agent': 'CCTV-Discovery-Diagnostics/1.0', Connection: 'close' }, ...(options.protocol === 'https' ? { rejectUnauthorized: false } : {}) }, response => {
        response.resume();
        finish({ type, targetIp: ipAddress, port: options.port, protocol: options.protocol.toUpperCase(), success: true, transportReachable: true, httpStatus: response.statusCode, certificateTrusted, certificateWarning, timestamp: '' });
      });
      if (options.protocol === 'https') {
        request.once('socket', socket => socket.once('secureConnect', () => {
          const tlsSocket = socket as TLSSocket;
          certificateTrusted = tlsSocket.authorized;
          if (!tlsSocket.authorized) certificateWarning = tlsSocket.authorizationError?.message || String(tlsSocket.authorizationError || 'Certificate is not trusted.');
        }));
      }
      request.once('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
      request.once('error', (error: NodeJS.ErrnoException) => {
        const category = categoryFor(error, Boolean(options.signal?.aborted));
        finish({ type, targetIp: ipAddress, port: options.port, protocol: options.protocol.toUpperCase(), success: false, transportReachable: false, timeout: category === 'TIMEOUT', errorCategory: category, errorMessage: safeErrorMessage(category), timestamp: '' });
      });
      request.end();
    });
  }
}

export class NodeTcpDiagnosticProvider implements TcpDiagnosticProvider {
  public check(ipAddress: string, options: { port: number; timeoutMs: number; signal?: AbortSignal; localAddress?: string }): Promise<DiagnosticCheckEvidence> {
    const started = performance.now();
    return new Promise(resolve => {
      let settled = false;
      const socket = net.createConnection({ host: ipAddress, port: options.port, localAddress: options.localAddress });
      const finish = (success: boolean, category?: DiagnosticErrorCategory) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        socket.destroy();
        resolve({ type: 'TCP', targetIp: ipAddress, port: options.port, protocol: 'TCP', success, transportReachable: success, timeout: category === 'TIMEOUT', responseTimeMs: Math.round(performance.now() - started), errorCategory: category, errorMessage: category ? safeErrorMessage(category) : undefined, timestamp: new Date().toISOString() });
      };
      const onAbort = () => finish(false, 'CANCELLED');
      socket.setTimeout(options.timeoutMs, () => finish(false, 'TIMEOUT'));
      socket.once('connect', () => finish(true));
      socket.once('error', (error: NodeJS.ErrnoException) => finish(false, categoryFor(error, Boolean(options.signal?.aborted))));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    });
  }
}

export class DeviceDiagnosticEngine {
  constructor(private readonly providers: DiagnosticProviders = { ping: new WindowsPingProvider(), http: new NodeHttpDiagnosticProvider(), tcp: new NodeTcpDiagnosticProvider() }) {}

  public async diagnose(device: Device, options: DiagnosticRunOptions = {}): Promise<Device> {
    const startedAt = new Date().toISOString();
    const adapter = device.reachability?.relationshipAdapter || device.reachability?.discoveryInterface;
    const runEvidence: DiagnosticCheckEvidence[] = [];
    const alreadyReachableThisSession = device.sessionVerification !== 'NOT_VERIFIED' && (
      device.status === 'ONLINE' || device.status === 'AUTHENTICATED' || Boolean(device.reachability?.lastSuccessfulResponseAt)
    );
    device.diagnostics = {
      ...device.diagnostics,
      checks: device.diagnostics?.checks || [],
      lastRunStartedAt: startedAt,
      previouslyReachableThisSession: device.diagnostics?.previouslyReachableThisSession || alreadyReachableThisSession,
    };
    const record = (evidence: DiagnosticCheckEvidence) => {
      evidence.originatingAdapter = adapter;
      evidence.ambiguousIdentity = Boolean(options.ambiguousIdentity);
      runEvidence.push(evidence);
      device.diagnostics!.checks = [...device.diagnostics!.checks, evidence].slice(-100);
      if (evidence.success && !evidence.ambiguousIdentity) device.diagnostics!.lastSuccessfulContactAt = evidence.timestamp;
      options.onEvidence?.(evidence, device);
    };

    if (!options.isRefresh && device.reachability?.wsDiscoveryRespondedAt) {
      record({ type: 'ONVIF_WS_DISCOVERY', targetIp: device.network.ipAddress, protocol: 'WS-DISCOVERY', success: true, transportReachable: true, timestamp: device.reachability.wsDiscoveryRespondedAt });
    }

    const advertisedPort = device.network.port > 0 ? device.network.port : undefined;
    const tcpPorts = Array.from(new Set([advertisedPort, 554].filter((port): port is number => Boolean(port) && port !== 80 && port !== 443)));
    const checks: Array<Promise<DiagnosticCheckEvidence>> = [
      this.providers.ping.check(device.network.ipAddress, { timeoutMs: 1000, signal: options.signal }),
      this.providers.http.check(device.network.ipAddress, { protocol: 'http', port: 80, timeoutMs: 1500, signal: options.signal }),
      this.providers.http.check(device.network.ipAddress, { protocol: 'https', port: 443, timeoutMs: 1500, signal: options.signal }),
      ...tcpPorts.map(port => this.providers.tcp.check(device.network.ipAddress, { port, timeoutMs: 1000, signal: options.signal, localAddress: adapter?.ipAddress })),
    ];
    await Promise.all(checks.map(async check => record(await check)));
    this.deriveStatus(device, runEvidence, Boolean(options.isRefresh));
    device.diagnostics.lastRunCompletedAt = new Date().toISOString();
    if (options.isRefresh) device.diagnostics.lastRefreshAt = device.diagnostics.lastRunCompletedAt;
    return device;
  }

  public deriveStatus(device: Device, evidence: DiagnosticCheckEvidence[], isRefresh: boolean): void {
    if (device.status === 'COLLISION') return;
    if (device.reachability?.subnetClassification === 'DIFFERENT_SUBNET') { device.status = 'DIFFERENT_SUBNET'; device.statusMessage = DIFFERENT_NETWORK_MESSAGE; return; }
    const positive = evidence.some(check => check.success && !check.ambiguousIdentity);
    const supported = evidence.filter(check => check.type !== 'PING' && check.type !== 'ONVIF_WS_DISCOVERY' && !check.ambiguousIdentity);
    if (positive) {
      device.status = 'ONLINE';
      device.sessionVerification = 'VERIFIED';
      device.diagnostics!.previouslyReachableThisSession = true;
      device.diagnostics!.consecutiveFailedRefreshes = 0;
      return;
    }
    if (isRefresh && device.diagnostics?.previouslyReachableThisSession && supported.length >= 2) {
      device.diagnostics.consecutiveFailedRefreshes = (device.diagnostics.consecutiveFailedRefreshes || 0) + 1;
      device.status = 'UNREACHABLE';
      return;
    }
    if (device.sessionVerification === 'VERIFIED' && supported.length >= 2 && supported.every(check => !check.success)) device.status = 'OFFLINE';
    else device.status = 'UNKNOWN';
  }
}

export class DiagnosticRefreshMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private running = false;
  private lastRunAt?: string;

  constructor(private readonly engine: DeviceDiagnosticEngine, private readonly getDevices: () => Device[], private readonly onDevice: (device: Device) => void, public intervalMs = DEFAULT_MONITORING_INTERVAL_MS, public readonly maxConcurrency = 3) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.refreshNow(); }, this.intervalMs);
    this.timer.unref?.();
  }

  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.controller?.abort(); }

  public setIntervalMs(intervalMs: number): void {
    if (intervalMs === this.intervalMs) return;
    const enabled = Boolean(this.timer);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.intervalMs = intervalMs;
    if (enabled) this.start();
  }

  public async refreshNow(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.controller = new AbortController();
    const devices = this.getDevices().filter(device => device.sessionVerification !== 'NOT_VERIFIED' && device.status !== 'COLLISION');
    let index = 0;
    const worker = async () => {
      while (index < devices.length && !this.controller?.signal.aborted) {
        const device = structuredClone(devices[index++]);
        await this.engine.diagnose(device, { isRefresh: true, signal: this.controller?.signal });
        if (!this.controller?.signal.aborted) this.onDevice(device);
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(this.maxConcurrency, devices.length) }, worker)); }
    finally { this.lastRunAt = new Date().toISOString(); this.running = false; this.controller = null; }
  }

  public cancelCurrent(): void { this.controller?.abort(); }
  public getState() { return { enabled: Boolean(this.timer), running: this.running, intervalMs: this.intervalMs, maxConcurrency: this.maxConcurrency, lastRunAt: this.lastRunAt }; }
}
