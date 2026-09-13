export type DiscoveryOrigin = 'MANUAL' | 'MONITORING' | 'ADVANCED' | 'REVERIFY' | 'INTERNAL';
export interface DiscoveryContext { origin: DiscoveryOrigin; sessionId: string }
export type ForegroundState = 'PREPARING' | 'SCANNING' | 'STOPPING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export interface ForegroundSession extends DiscoveryContext { origin: 'MANUAL' | 'ADVANCED'; state: ForegroundState }
export interface ForegroundSnapshot { epoch: string; revision: number; session: ForegroundSession | null }
export const foregroundActive = (session: ForegroundSession | null) => Boolean(session && ['PREPARING','SCANNING','STOPPING'].includes(session.state));
export function isForegroundSnapshot(value: unknown): value is ForegroundSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as ForegroundSnapshot, s = v.session;
  return typeof v.epoch === 'string' && Boolean(v.epoch) && Number.isSafeInteger(v.revision) && v.revision >= 0 && (s === null || Boolean(s && typeof s.sessionId === 'string' && s.sessionId && ['MANUAL','ADVANCED'].includes(s.origin) && ['PREPARING','SCANNING','STOPPING','COMPLETED','CANCELLED','FAILED'].includes(s.state)));
}
/** Only explicit foreground snapshots advance foreground UI; generic/monitor events never do. */
export function reconcileForeground(current: ForegroundSnapshot | null, incoming: unknown): ForegroundSnapshot | null {
  if (!isForegroundSnapshot(incoming)) return current;
  if (current?.epoch === incoming.epoch && incoming.revision <= current.revision) return current;
  return incoming;
}
