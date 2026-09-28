/** Camera-only renderer contract. Contains no credentials or handoff secrets. */
export type CameraRendererKind = 'IFRAME' | 'WINDOWS_WEBVIEW2';
export interface CameraBrowserSession {
  version: 1;
  sessionId: string;
  deviceId: string;
  address: string;
  origin: string;
  display: { name: string; manufacturer: string; model?: string; identity?: string };
  createdAt: number;
  expiresAt: number;
  renderer: CameraRendererKind;
}

export type NativeCommand = 'FOCUS' | 'REFRESH' | 'BACK' | 'FORWARD';
export type NativeWorkspaceCode = 'PREPARING' | 'OPENING' | 'ACTIVE' | 'CLOSED' | 'FAILED' | 'SECURITY_BLOCKED' | 'CERTIFICATE_REJECTED' | 'NAVIGATION_BLOCKED' | 'GATED' | 'HOST_UNAVAILABLE' | 'RUNTIME_UNAVAILABLE' | 'UNELEVATED_REQUIRED';
export interface CameraRendererSnapshot { code: NativeWorkspaceCode; canGoBack: boolean; canGoForward: boolean }
export const nativeWorkspaceText: Record<NativeWorkspaceCode, string> = {
  PREPARING: 'Preparing native browser…', OPENING: 'Opening camera in the dedicated Camera Browser window…',
  ACTIVE: 'Native browser active in the dedicated Camera Browser window.', CLOSED: 'Native renderer closed. Reopen to check current access.',
  FAILED: 'Native renderer failed. Open External is available with a fresh access check.',
  SECURITY_BLOCKED: 'Native browser authorization or security check failed. Close and reopen to check current evidence.',
  CERTIFICATE_REJECTED: 'Certificate/security problem. Use Open External to review the browser warning.',
  NAVIGATION_BLOCKED: 'Camera navigation blocked by the approved-address policy.',
  GATED: 'Native Camera Browser is available but real-camera native access is not enabled in this build yet.',
  HOST_UNAVAILABLE: 'Native Camera Browser is unavailable. Using iframe compatibility mode.',
  RUNTIME_UNAVAILABLE: 'WebView2 runtime is unavailable. Open External remains available.',
  UNELEVATED_REQUIRED: 'Native Camera Browser requires a non-administrator application session.',
};

/** Native content lives in an OS window; no DOM, arbitrary URL or credential API. */
export class NativeCameraRenderer implements CameraBrowserRenderer {
  readonly kind = 'WINDOWS_WEBVIEW2'; readonly available = true;
  state: CameraRendererState = 'CLOSED'; session: CameraBrowserSession | null = null;
  canGoBack = false; canGoForward = false; revision = 0;
  code: NativeWorkspaceCode = 'PREPARING';
  open(session: CameraBrowserSession) { if (session.renderer !== this.kind) { this.block(); return; } this.session = structuredClone(session); this.state = 'LOADING'; this.code = 'PREPARING'; }
  accept(snapshot: CameraRendererSnapshot) {
    if (!Object.hasOwn(nativeWorkspaceText, snapshot.code) || typeof snapshot.canGoBack !== 'boolean' || typeof snapshot.canGoForward !== 'boolean') { this.block(); return; }
    this.code = snapshot.code; this.canGoBack = snapshot.canGoBack; this.canGoForward = snapshot.canGoForward;
    this.state = snapshot.code === 'ACTIVE' ? 'DISPLAYED' : ['PREPARING', 'OPENING'].includes(snapshot.code) ? 'LOADING' : snapshot.code === 'CLOSED' ? 'CLOSED' : snapshot.code === 'FAILED' || snapshot.code === 'RUNTIME_UNAVAILABLE' ? 'FAILED' : 'BLOCKED';
  }
  close() { this.session = null; this.state = 'CLOSED'; this.code = 'CLOSED'; }
  refresh() {} goBack() {} goForward() {} displayed() {} // Commands require server authorization.
  fail() { this.state = 'FAILED'; this.code = 'FAILED'; }
  block() { this.state = 'BLOCKED'; this.code = 'SECURITY_BLOCKED'; this.canGoBack = this.canGoForward = false; }
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
