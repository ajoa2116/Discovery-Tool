export type DiscoveryOrigin = 'MANUAL' | 'MONITORING' | 'ADVANCED' | 'REVERIFY' | 'INTERNAL';
export interface DiscoveryContext { origin: DiscoveryOrigin; sessionId: string }
export type ForegroundState = 'PREPARING' | 'SCANNING' | 'STOPPING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export interface ForegroundSession extends DiscoveryContext { origin: 'MANUAL' | 'ADVANCED'; sessionClass: 'USER_SCAN' | 'ADVANCED_SCAN'; purpose: 'QUICK_SCAN' | 'ADVANCED_SCAN'; visibility: 'TECHNICIAN'; state: ForegroundState; failureReason?: string }
export interface ForegroundSnapshot { epoch: string; revision: number; session: ForegroundSession | null }
export const foregroundActive = (session: ForegroundSession | null) => Boolean(session && ['PREPARING','SCANNING','STOPPING'].includes(session.state));
export function isForegroundSnapshot(value: unknown): value is ForegroundSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as ForegroundSnapshot, s = v.session;
  return typeof v.epoch === 'string' && Boolean(v.epoch) && Number.isSafeInteger(v.revision) && v.revision >= 0 && (s === null || Boolean(s && typeof s.sessionId === 'string' && s.sessionId && s.visibility === 'TECHNICIAN' && ((s.origin === 'MANUAL' && s.sessionClass === 'USER_SCAN' && s.purpose === 'QUICK_SCAN') || (s.origin === 'ADVANCED' && s.sessionClass === 'ADVANCED_SCAN' && s.purpose === 'ADVANCED_SCAN')) && ['PREPARING','SCANNING','STOPPING','COMPLETED','CANCELLED','FAILED'].includes(s.state)));
}
/** Only explicit foreground snapshots advance foreground UI; generic/monitor events never do. */
export function reconcileForeground(current: ForegroundSnapshot | null, incoming: unknown, source: 'HTTP' | 'WS' = 'HTTP', retiredEpochs?: ReadonlySet<string>): ForegroundSnapshot | null {
  if (!isForegroundSnapshot(incoming) || retiredEpochs?.has(incoming.epoch)) return current;
  // A socket cannot adopt an epoch; status/action HTTP establishes backend authority.
  if (source === 'WS' && current?.epoch !== incoming.epoch) return current;
  if (current?.epoch === incoming.epoch && incoming.revision <= current.revision) return current;
  return incoming;
}

export const foregroundFailed = (snapshot: ForegroundSnapshot | null) => Boolean(isForegroundSnapshot(snapshot) && snapshot.session?.state === 'FAILED');
