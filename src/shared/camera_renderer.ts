/** Camera-only renderer contract. Contains no credentials or handoff secrets. */
export type CameraRendererKind = 'IFRAME' | 'WINDOWS_WEBVIEW2';
export interface CameraBrowserSession {
  version: 1;
  sessionId: string;
  deviceId: string;
  address: string;
  origin: string;
  display: { name: string; manufacturer: string; model?: string };
  createdAt: number;
  expiresAt: number;
  renderer: CameraRendererKind;
}
export type CameraRendererState = 'CLOSED' | 'LOADING' | 'DISPLAYED' | 'FAILED' | 'BLOCKED';
export interface CameraBrowserRenderer {
  kind: CameraRendererKind;
  available: boolean;
  state: CameraRendererState;
  canGoBack: boolean;
  canGoForward: boolean;
  session: CameraBrowserSession | null;
  revision: number;
  open(session: CameraBrowserSession): void;
  close(): void;
  refresh(): void;
  goBack(): void;
  goForward(): void;
  displayed(): void;
  fail(): void;
  block(): void;
}

/** An iframe cannot inspect cross-origin history or confirm rendering automatically. */
export class IframeCameraRenderer implements CameraBrowserRenderer {
  readonly kind = 'IFRAME';
  readonly available = true;
  readonly canGoBack = false;
  readonly canGoForward = false;
  state: CameraRendererState = 'CLOSED';
  session: CameraBrowserSession | null = null;
  revision = 0;
  open(session: CameraBrowserSession) {
    if (session.renderer !== this.kind) { this.block(); return; }
    this.session = structuredClone(session); this.state = 'LOADING'; this.revision++;
  }
  close() { this.session = null; this.state = 'CLOSED'; }
  refresh() { if (this.session && this.state !== 'BLOCKED') { this.state = 'LOADING'; this.revision++; } }
  goBack() { /* Unsupported, intentionally disabled. */ }
  goForward() { /* Unsupported, intentionally disabled. */ }
  displayed() { if (this.state === 'LOADING') this.state = 'DISPLAYED'; }
  fail() { if (this.session) this.state = 'FAILED'; }
  block() { this.session = null; this.state = 'BLOCKED'; }
}
